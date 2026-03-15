import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await Promise.resolve(params)

    const payrollImport = await prisma.payrollImport.findUnique({
      where: { id },
      include: {
        rows: {
          orderBy: { rowIndex: 'asc' },
          take: 50, // First 50 rows for analysis
        },
      },
    })

    if (!payrollImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    // Get total row count
    const totalRows = await prisma.payrollImportRow.count({
      where: { importId: id }
    })

    // Extract column names from first row
    let columns: string[] = []
    let sampleRows: any[] = []

    if (payrollImport.rows.length > 0) {
      const firstRowRaw = payrollImport.rows[0].rawJson as any
      columns = Object.keys(firstRowRaw)

      // Get sample rows with raw data
      sampleRows = payrollImport.rows.map((row) => ({
        rowIndex: row.rowIndex,
        rawData: row.rawJson,
        parsed: {
          employee: row.employeeNameRaw || row.employeeExternalIdRaw,
          workDate: row.workDate,
          inTime: row.inTime,
          outTime: row.outTime,
          hoursWorked: row.hoursWorked,
          minutesWorked: row.minutesWorked,
        },
      }))
    }

    return NextResponse.json({
      import: {
        id: payrollImport.id,
        fileName: payrollImport.originalFileName,
        uploadedAt: payrollImport.uploadedAt,
        status: payrollImport.status,
        totalRows,
        mapping: payrollImport.mappingJson,
      },
      columns,
      sampleRows,
    })
  } catch (error: any) {
    console.error('Error fetching raw import data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch raw import data', details: error.message },
      { status: 500 }
    )
  }
}
