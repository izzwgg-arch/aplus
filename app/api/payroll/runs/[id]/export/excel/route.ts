import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserPermissions } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

/**
 * GET /api/payroll/runs/[id]/export/excel
 * 
 * Export payroll run as Excel
 * Permission: payroll.export
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await getUserPermissions(session.user.id)
    const canExport = permissions['payroll.export']?.canExport === true ||
                      session.user.role === 'ADMIN' || 
                      session.user.role === 'SUPER_ADMIN'

    if (!canExport) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await Promise.resolve(params)
    // @ts-ignore - Prisma client may not have payrollRun yet
    const run: any = await (prisma as any).payrollRun?.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            employee: true,
            payments: true,
          },
        },
        createdBy: {
          select: {
            username: true,
          },
        },
      },
    })

    if (!run) {
      return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
    }

    // Create workbook
    const workbook = XLSX.utils.book_new()

    // Summary sheet
    const summaryData = [
      ['Payroll Run Summary'],
      [''],
      ['Run Name:', run.name || 'N/A'],
      ['Period:', `${new Date(run.periodStart).toLocaleDateString()} - ${new Date(run.periodEnd).toLocaleDateString()}`],
      ['Status:', run.status],
      ['Created By:', run.createdBy.username],
      ['Created At:', new Date(run.createdAt).toLocaleString()],
      [''],
    ]
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

    // Line items sheet
    const lineItemsData = [
      ['Employee', 'Total Hours', 'Hourly Rate', 'Gross Pay', 'Paid', 'Owed'],
      ...(run.lines || []).map((item: any) => [
        item.employee.fullName,
        Number(item.totalHours).toFixed(2),
        Number(item.hourlyRateUsed).toFixed(2),
        Number(item.grossPay).toFixed(2),
        Number(item.amountPaid).toFixed(2),
        Number(item.amountOwed).toFixed(2),
      ]),
    ]
    const lineItemsSheet = XLSX.utils.aoa_to_sheet(lineItemsData)
    XLSX.utils.book_append_sheet(workbook, lineItemsSheet, 'Line Items')

    // Generate buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="payroll-run-${id}.xlsx"`,
      },
    })
  } catch (error: any) {
    console.error('Error exporting Excel:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to export Excel' },
      { status: 500 }
    )
  }
}
