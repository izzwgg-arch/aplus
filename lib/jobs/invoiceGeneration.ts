import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { calculateWeeklyBillingPeriod, formatBillingPeriod } from '@/lib/billingPeriodUtils'

export interface InvoiceGenerationResult {
  success: boolean
  invoicesCreated: number
  clientsProcessed: number
  errors: string[]
}

/**
 * Generate invoices automatically for approved timesheets in the weekly billing period.
 * 
 * Billing Period: Monday 12:00 AM → Monday 11:59 PM (whole week, Monday to Monday)
 * Groups by Client (one invoice per client)
 * Uses rounding policy: Round UP to nearest 15 minutes
 * Rate: Insurance rate per unit (1 unit = 15 minutes)
 * 
 * This function is idempotent - safe to run multiple times without creating duplicates.
 */
export async function generateInvoicesForApprovedTimesheets(
  customBillingPeriod?: { startDate: Date; endDate: Date }
): Promise<InvoiceGenerationResult> {
  const result: InvoiceGenerationResult = {
    success: true,
    invoicesCreated: 0,
    clientsProcessed: 0,
    errors: [],
  }

  try {
    // Calculate billing period
    const calculatedPeriod = calculateWeeklyBillingPeriod()
    const billingPeriod = customBillingPeriod 
      ? { 
          startDate: customBillingPeriod.startDate, 
          endDate: customBillingPeriod.endDate,
          periodLabel: formatBillingPeriod(customBillingPeriod.startDate, customBillingPeriod.endDate)
        }
      : calculatedPeriod
    const { startDate, endDate, periodLabel } = billingPeriod

    console.log(`[INVOICE GENERATION] Starting for billing period: ${periodLabel}`)
    console.log(`[INVOICE GENERATION] Period: ${startDate.toISOString()} to ${endDate.toISOString()}`)

    // Find all approved timesheets in the billing period that haven't been fully invoiced
    // Only include entries that are NOT already invoiced
    // Exclude BCBA timesheets (they don't have insurance)
    const approvedTimesheets = await prisma.timesheet.findMany({
      where: {
        isBCBA: false, // Only regular timesheets can be invoiced
        status: 'APPROVED',
        deletedAt: null,
        // Timesheet must overlap with billing period
        OR: [
          {
            AND: [
              { startDate: { lte: endDate } },
              { endDate: { gte: startDate } },
            ],
          },
        ],
        // Must have at least one non-invoiced entry
        entries: {
          some: {
            invoiced: false,
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
      include: {
        entries: {
          where: {
            // Only include entries in the billing period that are not invoiced
            date: {
              gte: startDate,
              lte: endDate,
            },
            invoiced: false,
          },
        },
        insurance: true,
        provider: true,
        client: true,
      },
      orderBy: [
        { clientId: 'asc' },
        { insuranceId: 'asc' },
        { startDate: 'asc' },
      ],
    })

    if (approvedTimesheets.length === 0) {
      console.log(`[INVOICE GENERATION] No approved timesheets with non-invoiced entries found for period: ${periodLabel}`)
      return result
    }

    // Group timesheets by Client (one invoice per client)
    const timesheetsByClient = new Map<string, typeof approvedTimesheets>()
    
    for (const timesheet of approvedTimesheets) {
      // Skip if no eligible entries
      if (timesheet.entries.length === 0) continue
      
      const clientId = timesheet.clientId
      if (!timesheetsByClient.has(clientId)) {
        timesheetsByClient.set(clientId, [])
      }
      timesheetsByClient.get(clientId)!.push(timesheet)
    }

    result.clientsProcessed = timesheetsByClient.size

    const invoicesCreated: any[] = []

    // Process each Client (one invoice per client)
    for (const [clientId, timesheets] of timesheetsByClient) {
      try {
        // Filter out timesheets without insurance (shouldn't happen with isBCBA filter, but safety check)
        const timesheetsWithInsurance = timesheets.filter((ts) => ts.insurance !== null) as TimesheetWithInsurance[]
        
        if (timesheetsWithInsurance.length === 0) {
          console.log(`[INVOICE GENERATION] Skipping client ${clientId}: no timesheets with insurance`)
          continue
        }
        
        const invoice = await generateInvoiceForClient(
          clientId,
          timesheetsWithInsurance,
          billingPeriod
        )
        invoicesCreated.push(invoice)
        result.invoicesCreated++
      } catch (error) {
        const errorMessage = `Failed to generate invoice for client ${clientId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(`[INVOICE GENERATION] ${errorMessage}`, error)
        result.errors.push(errorMessage)
        result.success = false
      }
    }

    // Create notifications for admins if invoices were created
    if (result.invoicesCreated > 0) {
      // Calculate total amount for all created invoices
      const totalAmount = invoicesCreated.reduce((sum, inv) => {
        return sum + parseFloat(inv.totalAmount.toString())
      }, 0)

      await notifyAdminsOfInvoiceGeneration(result.invoicesCreated, totalAmount)
    }

    return result
  } catch (error) {
    const errorMessage = `Invoice generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    console.error(errorMessage, error)
    result.success = false
    result.errors.push(errorMessage)
    return result
  }
}

type TimesheetWithRelations = Awaited<ReturnType<typeof prisma.timesheet.findMany>>[0] & {
  entries: Array<{
    id: string
    date: Date
    startTime: string
    endTime: string
    minutes: number
    units: Decimal
    notes: string | null
    overnight: boolean
    invoiced: boolean
  }>
  insurance: {
    id: string
    name: string
    ratePerUnit: Decimal
  } | null
  provider: {
    id: string
    name: string
  }
  client: {
    id: string
    name: string
  }
}

// Type for timesheets that definitely have insurance (for invoice generation)
type TimesheetWithInsurance = Omit<TimesheetWithRelations, 'insurance'> & {
  insurance: {
    id: string
    name: string
    ratePerUnit: Decimal
  }
}

/**
 * Generate a single invoice for a Client
 * 
 * Aggregates all timesheets for the client within the billing period.
 * Uses insurance rate per unit (1 unit = 15 minutes).
 * 
 * This function is idempotent - it checks for existing invoices before creating new ones.
 */
async function generateInvoiceForClient(
  clientId: string,
  timesheets: TimesheetWithInsurance[],
  billingPeriod: { startDate: Date; endDate: Date; periodLabel: string }
) {
  if (timesheets.length === 0) {
    throw new Error('No timesheets provided')
  }

  // Use the billing period dates
  const { startDate, endDate, periodLabel } = billingPeriod

  // IDEMPOTENCY CHECK: Check if an invoice already exists for this client + billing period
  const existingInvoice = await prisma.invoice.findFirst({
    where: {
      clientId,
      deletedAt: null,
      // Check if invoice covers the same billing period (within 1 day tolerance)
      startDate: {
        gte: new Date(startDate.getTime() - 24 * 60 * 60 * 1000), // 1 day before
        lte: new Date(startDate.getTime() + 24 * 60 * 60 * 1000), // 1 day after
      },
      endDate: {
        gte: new Date(endDate.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000),
      },
    },
  })

  if (existingInvoice) {
    // Check if all eligible entries are already invoiced
    const timesheetEntryIds = timesheets.flatMap(ts => ts.entries.map(e => e.id))
    const alreadyInvoiced = await prisma.timesheetEntry.findMany({
      where: {
        id: { in: timesheetEntryIds },
        invoiced: true,
      },
    })

    if (alreadyInvoiced.length === timesheetEntryIds.length) {
      console.log(`[INVOICE GENERATION] All entries already invoiced for client ${clientId} in period ${periodLabel}`)
      throw new Error(`Invoice already exists for this billing period: ${existingInvoice.invoiceNumber}`)
    }
  }

  // Get the first admin user to use as creator (system-generated invoices)
  const adminUser = await prisma.user.findFirst({
    where: {
      role: 'ADMIN',
      active: true,
      deletedAt: null,
    },
  })

  if (!adminUser) {
    throw new Error('No active admin user found to assign as invoice creator')
  }

  // Generate invoice number
  const invoiceCount = await prisma.invoice.count()
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(
    invoiceCount + 1
  ).padStart(5, '0')}`

  // Get client to find their insurance
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { insurance: true },
  })

  if (!client) {
    throw new Error(`Client ${clientId} not found`)
  }

  // Get insurance rate (snapshot at generation time)
  // All timesheets for a client should have the same insurance, but we'll use the client's insurance
  const insurance = client.insurance
  const ratePerUnit = parseFloat(insurance.ratePerUnit.toString())
  if (isNaN(ratePerUnit) || ratePerUnit < 0) {
    throw new Error(`Invalid insurance rate: ${insurance.ratePerUnit}`)
  }

  // Get unit duration from Insurance
  const regularUnitMinutes = (insurance as any).regularUnitMinutes || 15
  const bcbaUnitMinutes = (insurance as any).bcbaUnitMinutes || regularUnitMinutes

  // Calculate totals using billing utility with Insurance unit duration
  const { calculateEntryTotals } = await import('@/lib/billing')
  
  let totalAmount = new Decimal(0)
  let totalMinutes = 0
  let totalUnits = 0
  const invoiceEntries: any[] = []

  // Check if this is a BCBA timesheet (use BCBA rates if so)
  const isBCBATimesheet = timesheets.some(ts => (ts as any).isBCBA === true)
  const rateToUse = isBCBATimesheet 
    ? ((insurance as any).bcbaRatePerUnit 
        ? parseFloat((insurance as any).bcbaRatePerUnit.toString())
        : ratePerUnit) // Fallback to regular rate if BCBA rate not set
    : ratePerUnit

  for (const timesheet of timesheets) {
    // Get unit duration for this timesheet (BCBA vs regular)
    const unitMinutesForTimesheet = (timesheet as any).isBCBA
      ? bcbaUnitMinutes
      : regularUnitMinutes
    
    for (const entry of timesheet.entries) {
      // Calculate units and amount for this entry using Insurance unit duration
      const { units, amount: entryAmount } = calculateEntryTotals(
        entry.minutes,
        entry.notes,
        rateToUse,
        !(timesheet as any).isBCBA, // isRegularTimesheet
        unitMinutesForTimesheet // unitMinutes from Insurance
      )
      
      // Guard against NaN
      if (isNaN(entry.minutes) || isNaN(units) || isNaN(entryAmount.toNumber())) {
        console.error(`[INVOICE GENERATION] Invalid calculation for entry ${entry.id}: minutes=${entry.minutes}, units=${units}`)
        throw new Error(`Invalid calculation for timesheet entry ${entry.id}`)
      }

      totalAmount = totalAmount.plus(entryAmount)
      totalMinutes += entry.minutes
      totalUnits += units // Always add units (for display)

      invoiceEntries.push({
        timesheetId: timesheet.id,
        providerId: timesheet.providerId,
        insuranceId: timesheet.insuranceId,
        units: new Decimal(units),
        rate: rateToUse, // Snapshot rate per unit
        amount: entryAmount,
      })
    }
  }
  
  console.log(`[INVOICE GENERATION] Calculation summary:`)
  console.log(`  - Total minutes: ${totalMinutes}`)
  console.log(`  - Total units billed (ceil): ${totalUnits}`)
  console.log(`  - Rate per unit: $${ratePerUnit.toFixed(2)}`)
  console.log(`  - Total amount: $${totalAmount.toNumber()}`)

  if (invoiceEntries.length === 0) {
    throw new Error('No eligible entries found for invoice generation')
  }

  // Create invoice and lock timesheets in a transaction (atomic operation)
  // If any step fails, the entire transaction is rolled back
  const newInvoice = await prisma.$transaction(async (tx) => {
    // Validate we have entries before creating invoice
    if (invoiceEntries.length === 0) {
      throw new Error('No eligible entries found for invoice generation')
    }

    // Validate totals are not NaN
    if (isNaN(totalAmount.toNumber()) || isNaN(totalUnits) || isNaN(totalMinutes)) {
      throw new Error(`Invalid totals calculated: amount=${totalAmount}, units=${totalUnits}, minutes=${totalMinutes}`)
    }

    // Create invoice
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        clientId,
        startDate,
        endDate,
        totalAmount,
        paidAmount: new Decimal(0),
        adjustments: new Decimal(0),
        outstanding: totalAmount,
        status: 'DRAFT',
        createdBy: adminUser.id,
        entries: {
          create: invoiceEntries,
        },
      },
    })

    // Mark all timesheet entries as invoiced (prevents double billing)
    const timesheetEntryIds = timesheets.flatMap(ts => ts.entries.map(e => e.id))
    if (timesheetEntryIds.length > 0) {
      await tx.timesheetEntry.updateMany({
        where: {
          id: { in: timesheetEntryIds },
        },
        data: {
          invoiced: true,
        },
      })
    }

    // Mark all timesheets as invoiced (set invoicedAt and invoiceId)
    // Only update timesheets that are not deleted
    const timesheetIds = timesheets.map(ts => ts.id)
    if (timesheetIds.length > 0) {
      await tx.timesheet.updateMany({
        where: {
          id: { in: timesheetIds },
          deletedAt: null, // Only update non-deleted timesheets
          invoiceId: null, // Only update timesheets that aren't already invoiced
        },
        data: {
          invoicedAt: new Date(),
          invoiceId: invoice.id,
        },
      })
    }

    console.log(
      `[INVOICE GENERATION] Generated invoice ${invoiceNumber} for client ${clientId} ` +
      `(${timesheets.length} timesheets, ${invoiceEntries.length} entries, ${totalMinutes} minutes, ${totalUnits.toFixed(2)} units, $${totalAmount.toFixed(2)})`
    )
    
    return invoice
  }, {
    timeout: 30000, // 30 second timeout for large transactions
  })

  return newInvoice
}

/**
 * Create notifications and send emails for all admin users when invoices are generated
 */
async function notifyAdminsOfInvoiceGeneration(invoiceCount: number, totalAmount: number) {
  try {
    const adminUsers = await prisma.user.findMany({
      where: {
        role: 'ADMIN',
        active: true,
        deletedAt: null,
      },
    })

    const notifications = adminUsers.map(user => ({
      userId: user.id,
      title: 'Automatic Invoice Generation',
      message: `${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''} ${invoiceCount !== 1 ? 'were' : 'was'} automatically generated for approved timesheets.`,
    }))

    if (notifications.length > 0) {
      await prisma.notification.createMany({
        data: notifications,
      })
      console.log(`Created notifications for ${adminUsers.length} admin user(s)`)
    }

    // Send emails to admins
    try {
      const { sendEmail, getInvoiceGeneratedEmailHtml } = await import('@/lib/email')
      const emailPromises = adminUsers.map((admin) =>
        sendEmail({
          to: admin.email,
          subject: `Automatic Invoice Generation - ${invoiceCount} Invoice${invoiceCount !== 1 ? 's' : ''} Created`,
          html: getInvoiceGeneratedEmailHtml(invoiceCount, totalAmount),
        })
      )

      await Promise.allSettled(emailPromises)
      console.log(`Sent invoice generation emails to ${adminUsers.length} admin user(s)`)
    } catch (error) {
      console.error('Failed to send invoice generation emails:', error)
      // Don't fail the entire job if emails fail
    }
  } catch (error) {
    console.error('Failed to create notifications:', error)
    // Don't fail the entire job if notifications fail
  }
}
