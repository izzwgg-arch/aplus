/**
 * Search API - Find timesheets and invoices by ID
 * 
 * GET /api/search?q=T-1001
 * Returns: timesheet and linked invoice (if invoiced)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isValidTimesheetNumber } from '@/lib/timesheet-ids'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''

    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 })
    }

    // Check if query is a timesheet number (T-1001 or BT-1002)
    if (isValidTimesheetNumber(query)) {
      // Find timesheet by number
      const timesheet = await prisma.timesheet.findUnique({
        where: {
          timesheetNumber: query,
        },
        include: {
          client: true,
          provider: true,
          bcba: true,
          entries: true,
          invoice: {
            include: {
              client: true,
            },
          },
        },
      })

      if (!timesheet) {
        return NextResponse.json({
          timesheet: null,
          invoice: null,
          message: 'Timesheet not found',
        })
      }

      // Return timesheet and invoice (if linked)
      return NextResponse.json({
        timesheet: {
          id: timesheet.id,
          timesheetNumber: timesheet.timesheetNumber,
          isBCBA: timesheet.isBCBA,
          client: timesheet.client.name,
          provider: timesheet.provider?.name,
          bcba: timesheet.bcba.name,
          status: timesheet.status,
          startDate: timesheet.startDate,
          endDate: timesheet.endDate,
          invoiceId: timesheet.invoiceId,
        },
        invoice: timesheet.invoice
          ? {
              id: timesheet.invoice.id,
              invoiceNumber: timesheet.invoice.invoiceNumber,
              client: timesheet.invoice.client.name,
              status: timesheet.invoice.status,
              totalAmount: timesheet.invoice.totalAmount.toString(),
              startDate: timesheet.invoice.startDate,
              endDate: timesheet.invoice.endDate,
            }
          : null,
        message: timesheet.invoiceId ? 'Timesheet is invoiced' : 'Timesheet is unbilled',
      })
    }

    // Check if query is an invoice number (INV-2026-00001)
    if (query.startsWith('INV-')) {
      const invoice = await prisma.invoice.findUnique({
        where: {
          invoiceNumber: query,
        },
        include: {
          client: true,
          timesheets: {
            select: {
              id: true,
              timesheetNumber: true,
              isBCBA: true,
              status: true,
              startDate: true,
              endDate: true,
            },
          },
        },
      })

      if (!invoice) {
        return NextResponse.json({
          invoice: null,
          timesheets: [],
          message: 'Invoice not found',
        })
      }

      return NextResponse.json({
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          client: invoice.client.name,
          status: invoice.status,
          totalAmount: invoice.totalAmount.toString(),
          startDate: invoice.startDate,
          endDate: invoice.endDate,
        },
        timesheets: invoice.timesheets.map(ts => ({
          id: ts.id,
          timesheetNumber: ts.timesheetNumber,
          isBCBA: ts.isBCBA,
          status: ts.status,
          startDate: ts.startDate,
          endDate: ts.endDate,
        })),
        message: `Invoice contains ${invoice.timesheets.length} timesheet(s)`,
      })
    }

    // Not a recognized format
    return NextResponse.json({
      error: 'Invalid search format. Use T-1001, BT-1002, or INV-2026-00001',
    }, { status: 400 })

  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}
