import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserPermissions } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { generatePayrollRunPDF } from '@/lib/pdf/payrollRunPDF'

/**
 * GET /api/payroll/runs/[id]/export/pdf
 * 
 * Export payroll run as PDF
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
    const run = await (prisma as any).payrollRun.findUnique({
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

    const pdfBuffer = await generatePayrollRunPDF(run as any)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="payroll-run-${id}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Error exporting PDF:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to export PDF' },
      { status: 500 }
    )
  }
}
