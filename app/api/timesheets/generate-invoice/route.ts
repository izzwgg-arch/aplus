import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { logCreate } from '@/lib/audit'
import { getWeekStart, getWeekEnd, getWeekKey } from '@/lib/weekUtils'
import { utcToZonedTime, format } from 'date-fns-tz'
import { minutesToUnits, calculateEntryTotals, calculateInvoiceTotals } from '@/lib/billing'

/**
 * POST /api/timesheets/generate-invoice
 * Generate invoices from selected timesheets
 * Groups by client + calendar week (Monday-Sunday)
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
    const canViewTimesheets = permissions['timesheets.view']?.canView === true || 
                              permissions['bcbaTimesheets.view']?.canView === true ||
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

    // Fetch selected timesheets with all necessary data
    // Both APPROVED and EMAILED timesheets can be invoiced
    const timesheets = await prisma.timesheet.findMany({
      where: {
        id: { in: timesheetIds },
        deletedAt: null,
        status: {
          in: ['APPROVED', 'EMAILED'], // Both approved and emailed timesheets can be invoiced
        },
      },
      include: {
        entries: {
          // Get ALL entries - we'll filter invoiced ones later to avoid excluding entire timesheets
        },
        client: {
          include: {
            insurance: true,
          },
        },
        provider: true,
        insurance: true,
      },
    })

    if (timesheets.length === 0) {
      return NextResponse.json(
        { error: 'No eligible timesheets found. Timesheets must be APPROVED or EMAILED and not deleted.' },
        { status: 400 }
      )
    }

    console.log(`[INVOICE_GEN] Fetched ${timesheets.length} timesheets`)
    console.log(`[INVOICE_GEN] Timesheets:`, timesheets.map(ts => ({
      id: ts.id,
      clientId: ts.clientId,
      clientName: ts.client.name,
      entriesCount: ts.entries.length,
      nonInvoicedEntries: ts.entries.filter(e => !e.invoiced).length,
    })))

    // Initialize arrays for tracking results
    const createdInvoices: string[] = []
    const errors: string[] = []
    const skipped: string[] = []

    // Group timesheets by client + week (Monday-Sunday)
    const grouped = new Map<string, typeof timesheets>()
    
    for (const timesheet of timesheets) {
      // Check if timesheet is already directly linked to an invoice
      if (timesheet.invoiceId) {
        const linkedInvoice = await prisma.invoice.findUnique({
          where: { id: timesheet.invoiceId },
          select: { invoiceNumber: true },
        })
        if (linkedInvoice) {
          const skipMsg = `Timesheet ${timesheet.id} (${timesheet.client.name}) is already linked to Invoice ${linkedInvoice.invoiceNumber}`
          console.log(`[INVOICE_GEN] ${skipMsg}`)
          skipped.push(skipMsg)
          continue
        }
      }
      
      // Only process timesheets that have at least one non-invoiced entry
      const nonInvoicedEntries = timesheet.entries.filter(e => !e.invoiced)
      if (nonInvoicedEntries.length === 0) {
        console.log(`[INVOICE_GEN] Skipping timesheet ${timesheet.id} (${timesheet.client.name}) - all entries already invoiced`)
        continue
      }
      
      // Get the week key based on the timesheet's start date
      const weekKey = `${timesheet.clientId}-${getWeekKey(timesheet.startDate)}`
      
      if (!grouped.has(weekKey)) {
        grouped.set(weekKey, [])
      }
      grouped.get(weekKey)!.push(timesheet)
      
      console.log(`[INVOICE_GEN] Added timesheet ${timesheet.id} to group ${weekKey} (Client: ${timesheet.client.name}, ${nonInvoicedEntries.length} non-invoiced entries)`)
    }

    // Get initial invoice count for sequential numbering
    let invoiceCounter = await prisma.invoice.count()

    console.log(`[INVOICE_GEN] Processing ${grouped.size} client+week groups`)
    console.log(`[INVOICE_GEN] Group keys:`, Array.from(grouped.keys()))

    // Process each client + week group
    for (const [weekKey, weekTimesheets] of grouped.entries()) {
      if (weekTimesheets.length === 0) {
        console.log(`[INVOICE_GEN] Skipping empty group: ${weekKey}`)
        continue
      }

      const client = weekTimesheets[0].client
      const clientId = weekTimesheets[0].clientId

      console.log(`[INVOICE_GEN] Processing group ${weekKey}: Client "${client.name}", ${weekTimesheets.length} timesheets`)

      // Get insurance from timesheet's insuranceId (for regular timesheets)
      // Use the insurance specified on the timesheet, not just client's default
      const timesheetInsuranceId = weekTimesheets[0].insuranceId
      let insurance = client.insurance // Fallback to client's insurance
      
      if (timesheetInsuranceId) {
        // Fetch the insurance from the timesheet's insuranceId
        const timesheetInsurance = await prisma.insurance.findUnique({
          where: { id: timesheetInsuranceId, deletedAt: null },
        })
        if (timesheetInsurance) {
          insurance = timesheetInsurance
        }
      }
      
      if (!insurance) {
        const errorMsg = `MISSING_INSURANCE_RATE: Client "${client.name}" has no insurance assigned`
        console.error(`[INVOICE_GEN] ${errorMsg}`)
        errors.push(errorMsg)
        continue
      }

      // Use regular-specific rates, with fallbacks
      const ratePerUnit = (insurance as any).regularRatePerUnit 
        ? new Decimal((insurance as any).regularRatePerUnit.toString())
        : new Decimal(insurance.ratePerUnit.toString()) // Legacy fallback
      const unitMinutes = (insurance as any).regularUnitMinutes || 15 // Default to 15 minutes

      // Validate rate exists
      if (!ratePerUnit || ratePerUnit.toNumber() <= 0) {
        const errorMsg = `MISSING_INSURANCE_RATE: Client "${client.name}" has invalid or missing rate per unit`
        console.error(`[INVOICE_GEN] ${errorMsg}`)
        errors.push(errorMsg)
        continue
      }

      // Calculate week start and end dates
      const weekStart = getWeekStart(weekTimesheets[0].startDate)
      const weekEnd = getWeekEnd(weekTimesheets[0].startDate)

      console.log(`[INVOICE_GEN] Week range: ${format(utcToZonedTime(weekStart, 'America/New_York'), 'MMM d, yyyy')} to ${format(utcToZonedTime(weekEnd, 'America/New_York'), 'MMM d, yyyy')}`)

      // Check for existing invoice for this client + week
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          clientId,
          deletedAt: null,
          startDate: { lte: weekEnd },
          endDate: { gte: weekStart },
        },
      })

      if (existingInvoice) {
        const weekStartStr = format(utcToZonedTime(weekStart, 'America/New_York'), 'MMM d, yyyy')
        const weekEndStr = format(utcToZonedTime(weekEnd, 'America/New_York'), 'MMM d, yyyy')
        const skipMsg = `Client "${client.name}" - Week ${weekStartStr} to ${weekEndStr} (Invoice ${existingInvoice.invoiceNumber} already exists)`
        console.log(`[INVOICE_GEN] ${skipMsg}`)
        skipped.push(skipMsg)
        continue
      }

      // Collect all entries from all timesheets in this group
      // IMPORTANT: Get ALL entries from ALL timesheets in the group, then filter non-invoiced
      const allEntries = weekTimesheets.flatMap(ts => {
        const nonInvoiced = ts.entries.filter(e => !e.invoiced)
        console.log(`[INVOICE_GEN] Timesheet ${ts.id} has ${ts.entries.length} total entries, ${nonInvoiced.length} non-invoiced`)
        return nonInvoiced
      })

      console.log(`[INVOICE_GEN] Group ${weekKey}: ${weekTimesheets.length} timesheets, ${allEntries.length} total non-invoiced entries from all timesheets`)

      if (allEntries.length === 0) {
        const errorMsg = `No eligible entries found for client "${client.name}" in this week (all entries may already be invoiced)`
        console.error(`[INVOICE_GEN] ${errorMsg}`)
        errors.push(errorMsg)
        continue
      }

      // Check if this is a BCBA timesheet (use BCBA rates if so)
      const isBCBATimesheet = weekTimesheets.some(ts => ts.isBCBA === true)
      const rateToUse = isBCBATimesheet 
        ? ((insurance as any).bcbaRatePerUnit 
            ? new Decimal((insurance as any).bcbaRatePerUnit.toString())
            : ratePerUnit) // Fallback to regular rate if BCBA rate not set
        : ratePerUnit
      
      // Get unit duration from Insurance (BCBA vs regular)
      const unitMinutesToUse = isBCBATimesheet
        ? ((insurance as any).bcbaUnitMinutes || unitMinutes)
        : unitMinutes

      // Generate invoice number (increment counter for each invoice)
      invoiceCounter++
      const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCounter).padStart(4, '0')}`

      // Create invoice entries (calculate per entry, then sum)
      // CRITICAL: For regular timesheets, SV entries = $0 (displayed but not charged)
      // For BCBA timesheets, all entries charged at BCBA rate
      const invoiceEntries: any[] = []
      let entryTotalUnits = 0 // All units (for display)
      let entryTotalAmount = new Decimal(0) // Only charged amount
      
      for (const entry of allEntries) {
        const timesheet = weekTimesheets.find(ts => ts.entries.some(e => e.id === entry.id))
        if (!timesheet) continue
        
        // Get unit duration for this specific timesheet (in case of mixed BCBA/regular)
        const entryUnitMinutes = timesheet.isBCBA
          ? ((insurance as any).bcbaUnitMinutes || unitMinutes)
          : unitMinutes
        
        // Calculate units and amount for this entry using Insurance unit duration
        const { units, amount: entryAmount } = calculateEntryTotals(
          entry.minutes,
          entry.notes,
          rateToUse,
          !timesheet.isBCBA, // isRegularTimesheet
          entryUnitMinutes // unitMinutes from Insurance
        )
        
        entryTotalUnits += units // Always add units (for display)
        entryTotalAmount = entryTotalAmount.plus(entryAmount) // Only charged amount
        
        invoiceEntries.push({
          timesheetId: entry.timesheetId,
          providerId: timesheet.providerId,
          insuranceId: client.insuranceId!,
          units: new Decimal(units),
          rate: rateToUse.toNumber(),
          amount: entryAmount,
        })
      }
      
      console.log(`[INVOICE_GEN] Creating invoice ${invoiceNumber} for client "${client.name}"`)
      console.log(`[INVOICE_GEN] Calculation breakdown:`)
      console.log(`  - Total units (all): ${entryTotalUnits}`)
      console.log(`  - Rate per unit: $${rateToUse.toNumber()}`)
      console.log(`  - Total amount (charged): $${entryTotalAmount.toNumber()}`)
      console.log(`  - Date range: ${format(utcToZonedTime(weekStart, 'America/New_York'), 'MMM d, yyyy')} to ${format(utcToZonedTime(weekEnd, 'America/New_York'), 'MMM d, yyyy')}`)
      console.log(`  - Entries included: ${allEntries.length}`)

      // Create invoice in transaction
      try {
        const invoice = await prisma.$transaction(async (tx) => {
          const newInvoice = await tx.invoice.create({
            data: {
              invoiceNumber,
              clientId,
              startDate: weekStart,
              endDate: weekEnd,
              totalAmount: entryTotalAmount, // Use sum of entry amounts (may differ slightly from aggregate due to per-entry rounding)
              paidAmount: new Decimal(0),
              adjustments: new Decimal(0),
              outstanding: entryTotalAmount,
              status: 'DRAFT',
              createdBy: session.user.id,
              entries: {
                create: invoiceEntries,
              },
            },
          })
          
          console.log(`[INVOICE_GEN] ✅ Invoice ${newInvoice.invoiceNumber} created with ID ${newInvoice.id}`)
          console.log(`[INVOICE_GEN] Final totals: ${entryTotalUnits} units, $${entryTotalAmount.toNumber()}`)

          // Mark all timesheet entries as invoiced
          const entryIds = allEntries.map(e => e.id)
          if (entryIds.length > 0) {
            await tx.timesheetEntry.updateMany({
              where: {
                id: { in: entryIds },
                invoiced: false, // Only update entries that aren't already invoiced
              },
              data: {
                invoiced: true,
              },
            })
          }

          // Mark all timesheets as invoiced (set invoiceId)
          // Only update timesheets that are not deleted
          const timesheetIds = weekTimesheets.map(ts => ts.id)
          if (timesheetIds.length > 0) {
            await tx.timesheet.updateMany({
              where: {
                id: { in: timesheetIds },
                deletedAt: null,
                invoiceId: null, // Only update timesheets that aren't already invoiced
              },
              data: {
                invoiceId: newInvoice.id,
                invoicedAt: new Date(),
              },
            })
          }

          // Log audit
          await logCreate('Invoice', newInvoice.id, session.user.id, {
            invoiceNumber: newInvoice.invoiceNumber,
            clientId: newInvoice.clientId,
            totalAmount: newInvoice.totalAmount.toString(),
            timesheetCount: weekTimesheets.length,
          })

          return newInvoice
        })

        console.log(`[INVOICE_GEN] ✅ Successfully created invoice ${invoice.invoiceNumber} for client "${client.name}"`)
        createdInvoices.push(invoice.invoiceNumber)
      } catch (error: any) {
        const errorMsg = `Failed to create invoice for client "${client.name}": ${error.message}`
        console.error(`[INVOICE_GEN] ❌ ${errorMsg}`, error)
        errors.push(errorMsg)
      }
    }

    // Build response message
    console.log(`[INVOICE_GEN] Summary: ${createdInvoices.length} created, ${skipped.length} skipped, ${errors.length} errors`)
    
    let message = ''
    if (createdInvoices.length > 0) {
      message = `Successfully generated ${createdInvoices.length} invoice(s): ${createdInvoices.join(', ')}`
    }
    if (skipped.length > 0) {
      message += (message ? '. ' : '') + `Skipped ${skipped.length} group(s) (invoices already exist)`
      if (skipped.length <= 5) {
        message += ': ' + skipped.join('; ')
      } else {
        message += `: ${skipped.slice(0, 5).join('; ')} and ${skipped.length - 5} more`
      }
    }
    if (errors.length > 0) {
      message += (message ? '. ' : '') + `Errors: ${errors.join('; ')}`
    }

    // If no invoices created and no groups processed, provide helpful message
    if (createdInvoices.length === 0 && grouped.size === 0) {
      return NextResponse.json(
        { 
          error: 'No eligible timesheets found. All selected timesheets may have entries that are already invoiced.',
          details: 'Please select timesheets with non-invoiced entries.',
          invoicesCreated: 0,
          invoices: [],
        },
        { status: 400 }
      )
    }

    if (createdInvoices.length === 0 && errors.length > 0) {
      return NextResponse.json(
        { error: message || 'Failed to generate invoices', errors, skipped },
        { status: 400 }
      )
    }

    if (createdInvoices.length === 0 && skipped.length > 0) {
      // Extract invoice numbers from skipped messages
      const invoiceNumbers = skipped
        .map(msg => {
          const match = msg.match(/Invoice (INV-\d{4}-\d+|I-\d+)/i)
          return match ? match[1] : null
        })
        .filter(Boolean) as string[]
      
      // Format invoice numbers for display (convert INV-YYYY-XXXX to I-XXXX)
      const formattedInvoiceNumbers = invoiceNumbers.map(inv => {
        const match = inv.match(/INV-\d{4}-(\d+)/)
        return match ? `I-${match[1]}` : inv
      })
      
      let errorMessage = 'No invoices created. All selected timesheets already have invoices for their date ranges.'
      if (formattedInvoiceNumbers.length > 0) {
        const uniqueInvoices = [...new Set(formattedInvoiceNumbers)]
        errorMessage += ` Existing invoice(s): ${uniqueInvoices.join(', ')}`
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          skipped,
          invoicesCreated: 0,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: message || 'Invoices generated successfully',
      invoicesCreated: createdInvoices.length,
      invoices: createdInvoices,
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[INVOICE_GEN] ❌ Unhandled error:', error)
    console.error('[INVOICE_GEN] Error stack:', error?.stack)
    return NextResponse.json(
      { error: 'Failed to generate invoices', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
