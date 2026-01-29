import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { logCreate } from '@/lib/audit'
import { getWeekStart, getWeekEnd, getWeekKey } from '@/lib/weekUtils'
import { utcToZonedTime, format } from 'date-fns-tz'

/**
 * POST /api/bcba-timesheets/batch/generate-invoice
 * Generate invoices from selected BCBA timesheets (from archive)
 * Groups by client + calendar week (Monday-Sunday)
 * Uses BCBA Insurance rates (from bcbaInsuranceId on timesheet)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions: user needs to view timesheets AND create invoices
    const { getUserPermissions } = await import('@/lib/permissions')
    const permissions = await getUserPermissions(session.user.id)
    const canViewTimesheets = permissions['bcbaTimesheets.view']?.canView === true ||
                              permissions['timesheets.view']?.canView === true ||
                              session.user.role === 'ADMIN' ||
                              session.user.role === 'SUPER_ADMIN'
    const canCreateInvoice = permissions['invoices.create']?.canCreate === true ||
                             session.user.role === 'ADMIN' ||
                             session.user.role === 'SUPER_ADMIN'

    if (!canViewTimesheets || !canCreateInvoice) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      )
    }

    const data = await request.json()
    const { timesheetIds } = data

    if (!timesheetIds || !Array.isArray(timesheetIds) || timesheetIds.length === 0) {
      return NextResponse.json(
        { error: 'No timesheets selected' },
        { status: 400 }
      )
    }

    // Fetch selected timesheets with all necessary data (BCBA timesheets only)
    // Use any cast since Prisma client may not have bcbaInsurance relation yet
    const timesheets = await (prisma as any).timesheet.findMany({
      where: {
        id: { in: timesheetIds },
        deletedAt: null,
        isBCBA: true, // Only BCBA timesheets
        status: {
          in: ['APPROVED', 'EMAILED'],
        },
      },
      include: {
        entries: {},
        client: {
          include: { insurance: true }, // Include regular Insurance (which has BCBA rates)
        },
        provider: true,
        insurance: true, // Include Insurance (BCBA timesheets will use insuranceId)
      },
    })

    if (timesheets.length === 0) {
      return NextResponse.json(
        { error: 'No eligible BCBA timesheets found. Timesheets must be APPROVED or EMAILED, not deleted, and BCBA type.' },
        { status: 400 }
      )
    }

      // Validate all timesheets have clients with insurance assigned
      const timesheetsWithoutClientInsurance = timesheets.filter((ts: any) => !ts.client?.insurance)
      if (timesheetsWithoutClientInsurance.length > 0) {
        return NextResponse.json(
          { 
            error: `Some timesheets have clients without insurance`,
            details: `${timesheetsWithoutClientInsurance.length} timesheet(s) have clients without insurance assigned. Please assign insurance to all clients before generating invoices.`
          },
          { status: 400 }
        )
      }

    // Group timesheets by client + week (Monday-Sunday)
    const grouped = new Map<string, typeof timesheets>()
    
    for (const timesheet of timesheets) {
      // Check if timesheet is already invoiced
      if (timesheet.invoiceId) {
        console.log(`[BCBA BATCH INVOICE] Skipping timesheet ${timesheet.id} - already linked to invoice ${timesheet.invoiceId}`)
        continue
      }
      
      const nonInvoicedEntries = timesheet.entries.filter((e: any) => !e.invoiced)
      if (nonInvoicedEntries.length === 0) {
        console.log(`[BCBA BATCH INVOICE] Skipping timesheet ${timesheet.id} - no non-invoiced entries`)
        continue
      }
      
      const weekKey = `${timesheet.clientId}-${getWeekKey(timesheet.startDate)}`
      
      if (!grouped.has(weekKey)) {
        grouped.set(weekKey, [])
      }
      grouped.get(weekKey)!.push(timesheet)
    }
    
    console.log(`[BCBA BATCH INVOICE] Grouped ${timesheets.length} timesheets into ${grouped.size} group(s)`)

    const createdInvoices: string[] = []
    const errors: string[] = []
    const skipped: string[] = []

    let invoiceCounter = await prisma.invoice.count()

    // Process each client + week group
    for (const [weekKey, weekTimesheets] of grouped.entries()) {
      if (weekTimesheets.length === 0) continue

      const client = weekTimesheets[0].client
      const clientId = weekTimesheets[0].clientId

      // Get BCBA Insurance rate from client's insurance (source of truth)
      if (!client.insurance) {
        errors.push(`Client "${client.name}" has no insurance assigned for BCBA timesheets`)
        continue
      }

      const insurance = client.insurance
      // Use BCBA-specific rates, with fallbacks
      const ratePerUnit = (insurance as any).bcbaRatePerUnit 
        ? new Decimal((insurance as any).bcbaRatePerUnit.toString())
        : ((insurance as any).regularRatePerUnit 
            ? new Decimal((insurance as any).regularRatePerUnit.toString())
            : new Decimal(insurance.ratePerUnit.toString())) // Legacy fallback
      const unitMinutes = (insurance as any).bcbaUnitMinutes || (insurance as any).regularUnitMinutes || 15 // Default to 15 minutes

      const weekStart = getWeekStart(weekTimesheets[0].startDate)
      const weekEnd = getWeekEnd(weekTimesheets[0].startDate)

      // Check if any of these specific timesheets are already linked to an invoice
      const timesheetIds = weekTimesheets.map((ts: any) => ts.id)
      const alreadyInvoicedTimesheets = await prisma.timesheet.findMany({
        where: {
          id: { in: timesheetIds },
          invoiceId: { not: null },
          deletedAt: null,
        },
        select: {
          id: true,
          invoiceId: true,
        },
      })
      
      if (alreadyInvoicedTimesheets.length > 0) {
        const invoiceIds = [...new Set(alreadyInvoicedTimesheets.map(ts => ts.invoiceId).filter(Boolean))]
        const weekStartStr = format(utcToZonedTime(weekStart, 'America/New_York'), 'MMM d, yyyy')
        const weekEndStr = format(utcToZonedTime(weekEnd, 'America/New_York'), 'MMM d, yyyy')
        skipped.push(`Client "${client.name}" - Week ${weekStartStr} to ${weekEndStr} (${alreadyInvoicedTimesheets.length} timesheet(s) already invoiced)`)
        console.log(`[BCBA BATCH INVOICE] Skipping group for client "${client.name}" - ${alreadyInvoicedTimesheets.length} timesheet(s) already linked to invoice(s): ${invoiceIds.join(', ')}`)
        continue
      }
      
      // Also check for existing invoice in the date range that includes these specific timesheets
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          clientId,
          deletedAt: null,
          startDate: { lte: weekEnd },
          endDate: { gte: weekStart },
          timesheets: {
            some: {
              id: { in: timesheetIds },
            },
          },
        },
      })

      if (existingInvoice) {
        const weekStartStr = format(utcToZonedTime(weekStart, 'America/New_York'), 'MMM d, yyyy')
        const weekEndStr = format(utcToZonedTime(weekEnd, 'America/New_York'), 'MMM d, yyyy')
        skipped.push(`Client "${client.name}" - Week ${weekStartStr} to ${weekEndStr} (Invoice ${existingInvoice.invoiceNumber} already exists for these timesheets)`)
        console.log(`[BCBA BATCH INVOICE] Skipping group for client "${client.name}" - invoice ${existingInvoice.invoiceNumber} already exists`)
        continue
      }

      // Collect all non-invoiced entries
      const allEntries = weekTimesheets.flatMap((ts: any) => ts.entries.filter((e: any) => !e.invoiced))

      if (allEntries.length === 0) {
        errors.push(`No eligible entries found for client "${client.name}" in this week`)
        continue
      }

      // Calculate totals using BCBA Insurance rate
      // Units = minutes / unitMinutes (15 minutes)
      const totalMinutes = allEntries.reduce((sum: number, entry: any) => sum + entry.minutes, 0)
      const totalUnits = allEntries.reduce((sum: number, entry: any) => {
        // Calculate units based on BCBA Insurance unitMinutes (15 minutes)
        const units = entry.minutes / unitMinutes
        return sum + units
      }, 0)
      const totalAmount = new Decimal(totalUnits).times(ratePerUnit)

      invoiceCounter++
      const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCounter).padStart(4, '0')}`

      // Create invoice entries
      // For BCBA invoices, we need to use a regular Insurance ID for InvoiceEntry
      // Note: InvoiceEntry requires insuranceId, but BCBA uses bcbaInsurance
      // We'll use the client's insurance ID (which we already validated exists)
      if (!insurance.id) {
        errors.push(`Client "${client.name}" insurance has no ID`)
        continue
      }

      const invoiceEntries: any[] = []
      for (const entry of allEntries) {
        const timesheet = weekTimesheets.find((ts: any) => ts.entries.some((e: any) => e.id === entry.id))
        if (!timesheet) continue
        
        // Calculate units based on BCBA Insurance unitMinutes
        const entryUnits = new Decimal(entry.minutes / unitMinutes)
        const entryAmount = entryUnits.times(ratePerUnit)
        
        invoiceEntries.push({
          timesheetId: entry.timesheetId,
          providerId: timesheet.providerId,
          insuranceId: insurance.id, // Use insurance ID from the validated insurance object
          units: entryUnits,
          rate: ratePerUnit.toNumber(), // BCBA Insurance rate
          amount: entryAmount,
        })
      }

      // Create invoice in transaction
      try {
        const invoice = await prisma.$transaction(async (tx) => {
          const newInvoice = await tx.invoice.create({
            data: {
              invoiceNumber,
              clientId,
              startDate: weekStart,
              endDate: weekEnd,
              totalAmount,
              paidAmount: new Decimal(0),
              adjustments: new Decimal(0),
              outstanding: totalAmount,
              status: 'DRAFT',
              createdBy: session.user.id,
              notes: `BCBA Insurance: ${insurance.name} (BCBA Rate: $${ratePerUnit.toNumber()} per ${unitMinutes} min unit)`, // Store BCBA insurance info in notes
              entries: {
                create: invoiceEntries,
              },
            },
          })

          // Mark entries as invoiced
          const entryIds = allEntries.map((e: any) => e.id)
          if (entryIds.length > 0) {
            await tx.timesheetEntry.updateMany({
              where: {
                id: { in: entryIds },
                invoiced: false,
              },
              data: {
                invoiced: true,
              },
            })
          }

          // Mark timesheets as invoiced
          const timesheetIdsForUpdate = weekTimesheets.map((ts: any) => ts.id)
          if (timesheetIdsForUpdate.length > 0) {
            // Format array properly for PostgreSQL - escape IDs to prevent SQL injection
            const escapedIds = timesheetIdsForUpdate.map((id: string) => `'${String(id).replace(/'/g, "''")}'`).join(',')
            const idsArray = `ARRAY[${escapedIds}]` // Use ARRAY[] syntax
            const updateResult = await tx.$executeRawUnsafe(`
              UPDATE "Timesheet"
              SET "invoiceId" = $1, "invoicedAt" = $2
              WHERE id = ANY(${idsArray}::text[])
                AND "deletedAt" IS NULL
                AND ("invoiceId" IS NULL OR "invoiceId" = '')
            `, newInvoice.id, new Date())
            console.log(`[BCBA BATCH INVOICE] Updated ${updateResult} timesheet(s) to link to invoice ${newInvoice.invoiceNumber}`)
          }

          await logCreate('Invoice', newInvoice.id, session.user.id, {
            invoiceNumber: newInvoice.invoiceNumber,
            clientId: newInvoice.clientId,
            totalAmount: newInvoice.totalAmount.toString(),
            timesheetCount: weekTimesheets.length,
            insurance: insurance.name,
          })

          return newInvoice
        })

        createdInvoices.push(invoice.invoiceNumber)
        console.log(`[BCBA BATCH INVOICE] Created invoice ${invoice.invoiceNumber} for client "${client.name}" with ${weekTimesheets.length} timesheet(s)`)
      } catch (error: any) {
        console.error(`[BCBA BATCH INVOICE] Failed to create invoice for client "${client.name}":`, error)
        errors.push(`Failed to create invoice for client "${client.name}": ${error.message}`)
      }
    }

    let message = ''
    if (createdInvoices.length > 0) {
      message = `Successfully generated ${createdInvoices.length} BCBA invoice(s): ${createdInvoices.join(', ')}`
    }
    if (skipped.length > 0) {
      message += (message ? '. ' : '') + `Skipped ${skipped.length} group(s)`
    }
    if (errors.length > 0) {
      message += (message ? '. ' : '') + `Errors: ${errors.join('; ')}`
    }

    if (createdInvoices.length === 0 && errors.length > 0) {
      return NextResponse.json(
        { error: message || 'Failed to generate invoices', errors, skipped },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: message || 'BCBA invoices generated successfully',
      invoicesCreated: createdInvoices.length,
      invoices: createdInvoices,
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[BCBA BATCH INVOICE GEN] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate BCBA invoices', details: error.message },
      { status: 500 }
    )
  }
}
