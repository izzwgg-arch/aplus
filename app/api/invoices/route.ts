import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { logCreate } from '@/lib/audit'
import { calculateEntryTotals } from '@/lib/billing'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const clientId = searchParams.get('clientId') || ''
    const insuranceId = searchParams.get('insuranceId') || ''

    const where: any = { deletedAt: null }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    if (status) {
      where.status = status
    }

    if (clientId) {
      where.clientId = clientId
    }

    if (insuranceId) {
      where.entries = {
        some: {
          insurance: { id: insuranceId }
        }
      }
    }

    // Users can only see invoices (read-only) unless admin
    // This is enforced at UI level, but we can add DB level if needed

    // Debug: Log the where clause
    console.log('[INVOICES GET] Query params:', { page, limit, search, status, clientId, insuranceId })
    console.log('[INVOICES GET] Where clause:', JSON.stringify(where, null, 2))

    // Use (prisma as any) to handle Prisma client recognition issues
    const [invoices, total] = await Promise.all([
      (prisma as any).invoice.findMany({
        where,
        include: {
          client: {
            include: { insurance: true },
          },
          entries: {
            include: {
              provider: true,
              timesheet: {
                select: {
                  isBCBA: true,
                },
              },
            },
          },
          timesheets: {
            select: {
              isBCBA: true,
            },
          },
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (prisma as any).invoice.count({ where }),
    ])

    console.log('[INVOICES GET] Found', invoices.length, 'invoices (total:', total, ')')
    if (invoices.length > 0) {
      console.log('[INVOICES GET] Sample invoice:', {
        id: invoices[0].id,
        invoiceNumber: invoices[0].invoiceNumber,
        createdAt: invoices[0].createdAt,
        deletedAt: invoices[0].deletedAt,
      })
    }

    return NextResponse.json({
      invoices,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[INVOICES GET] Error fetching invoices:', error)
    if (error instanceof Error) {
      console.error('[INVOICES GET] Error details:', error.message, error.stack)
    }
    return NextResponse.json(
      { error: 'Failed to fetch invoices', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    const { clientId, startDate, endDate, timesheetIds } = data

    if (!clientId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Client, start date, and end date are required' },
        { status: 400 }
      )
    }

    // Find approved timesheets for the client in date range
    const timesheets = await prisma.timesheet.findMany({
      where: {
        clientId,
        status: 'APPROVED',
        startDate: { gte: new Date(startDate) },
        endDate: { lte: new Date(endDate) },
        // Timesheets that are approved/emailed can be invoiced (not locked)
        deletedAt: null,
        ...(timesheetIds && timesheetIds.length > 0
          ? { id: { in: timesheetIds } }
          : {}),
      },
      include: {
        entries: true,
        insurance: true,
        provider: true,
      },
    })

    if (timesheets.length === 0) {
      return NextResponse.json(
        { error: 'No approved timesheets found for the selected period' },
        { status: 400 }
      )
    }

    // Check for existing invoices that might overlap
    const existingInvoices = await prisma.invoice.findMany({
      where: {
        clientId,
        deletedAt: null,
        OR: [
          {
            AND: [
              { startDate: { lte: new Date(endDate) } },
              { endDate: { gte: new Date(startDate) } },
            ],
          },
        ],
      },
    })

    if (existingInvoices.length > 0 && !timesheetIds) {
      return NextResponse.json(
        {
          error:
            'Overlapping invoices exist. Please select specific timesheets or adjust date range.',
        },
        { status: 400 }
      )
    }

    // Generate invoice number
    const invoiceCount = await prisma.invoice.count()
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(
      invoiceCount + 1
    ).padStart(5, '0')}`

    // Calculate totals using billing utility (ceil rounding per entry)
    let totalAmount = new Decimal(0)
    const invoiceEntries: any[] = []
    const unitMinutes = 15 // Standard unit size

    for (const timesheet of timesheets) {
      // Skip BCBA timesheets (they don't have insurance)
      if (!timesheet.insurance || timesheet.isBCBA) {
        continue
      }

      // Use regular-specific rates, with fallbacks
      const ratePerUnit = (timesheet.insurance as any).regularRatePerUnit
        ? new Decimal((timesheet.insurance as any).regularRatePerUnit.toString())
        : new Decimal(timesheet.insurance.ratePerUnit.toString())
      // Get unit duration from Insurance (BCBA vs regular)
      const unitMinutesForTimesheet = timesheet.isBCBA
        ? ((timesheet.insurance as any).bcbaUnitMinutes || (timesheet.insurance as any).regularUnitMinutes || 15)
        : ((timesheet.insurance as any).regularUnitMinutes || 15)

      for (const entry of timesheet.entries) {
        // Calculate units and amount for this entry using Insurance unit duration
        const { units, amount: entryAmount } = calculateEntryTotals(
          entry.minutes,
          entry.notes,
          ratePerUnit,
          !timesheet.isBCBA, // isRegularTimesheet
          unitMinutesForTimesheet // unitMinutes from Insurance
        )
        
        totalAmount = totalAmount.plus(entryAmount)

        invoiceEntries.push({
          timesheetId: timesheet.id,
          providerId: timesheet.providerId,
          insuranceId: timesheet.insuranceId!,
          units: new Decimal(units),
          rate: ratePerUnit.toNumber(),
          amount: entryAmount,
        })
      }
    }

    // Create invoice
    const invoice = await prisma.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          clientId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          totalAmount,
          paidAmount: new Decimal(0),
          adjustments: new Decimal(0),
          outstanding: totalAmount,
          status: 'DRAFT',
          createdBy: session.user.id,
          entries: {
            create: invoiceEntries,
          },
        },
        include: {
          client: true,
          entries: {
            include: {
              provider: true,
              timesheet: true,
            },
          },
        },
      })

      // Mark all timesheet entries as invoiced
      const timesheetEntryIds = timesheets.flatMap(ts => ts.entries.map((e: any) => e.id))
      await tx.timesheetEntry.updateMany({
        where: {
          id: { in: timesheetEntryIds },
        },
        data: {
          invoiced: true,
        },
      })

      // Mark all timesheets as invoiced (set invoiceId)
      // Only update timesheets that are not deleted
      const timesheetIds = timesheets.map((t) => t.id)
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

      return newInvoice
    })

    // Log audit
    await logCreate('Invoice', invoice.id, session.user.id, {
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      totalAmount: invoice.totalAmount.toString(),
      timesheetCount: timesheets.length,
    })

    // Timesheet locking removed - invoice tracking handled via invoiceEntries

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('Error creating invoice:', error)
    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 }
    )
  }
}
