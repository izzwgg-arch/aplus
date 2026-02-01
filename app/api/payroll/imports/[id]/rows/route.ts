import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await Promise.resolve(params)
    const body = await request.json()
    const { rows } = body

    if (!Array.isArray(rows)) {
      return NextResponse.json(
        { error: 'Rows must be an array' },
        { status: 400 }
      )
    }

    // Update all rows in a transaction
    await prisma.$transaction(
      rows.map((row: any) => {
        const updateData: any = {}
        
        if (row.workDate !== undefined) {
          // Parse workDate and ensure it's stored as local midnight (no timezone shift)
          const dateValue = row.workDate
          let workDate: Date
          
          if (dateValue instanceof Date) {
            // If already a Date, extract local components to avoid timezone issues
            workDate = new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate(), 0, 0, 0, 0)
          } else if (typeof dateValue === 'string') {
            // Parse ISO string and convert to local date components
            const parsed = new Date(dateValue)
            // Extract local date components (not UTC) to preserve the calendar date
            workDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0)
          } else {
            workDate = new Date(dateValue)
            workDate.setHours(0, 0, 0, 0)
          }
          
          updateData.workDate = workDate
        }
        if (row.inTime !== undefined) {
          updateData.inTime = row.inTime ? new Date(row.inTime) : null
        }
        if (row.outTime !== undefined) {
          updateData.outTime = row.outTime ? new Date(row.outTime) : null
        }
        if (row.minutesWorked !== undefined) {
          updateData.minutesWorked = row.minutesWorked || null
        }
        if (row.hoursWorked !== undefined) {
          updateData.hoursWorked = row.hoursWorked !== null && row.hoursWorked !== '' ? row.hoursWorked : null
        }
        if (row.linkedEmployeeId !== undefined) {
          updateData.linkedEmployeeId = row.linkedEmployeeId || null
        }
        if (row.employeeNameRaw !== undefined) {
          updateData.employeeNameRaw = row.employeeNameRaw || null
        }
        if (row.employeeExternalIdRaw !== undefined) {
          updateData.employeeExternalIdRaw = row.employeeExternalIdRaw || null
        }

        // Recalculate hours/minutes if in/out times changed
        if ((row.inTime !== undefined || row.outTime !== undefined) && updateData.inTime && updateData.outTime) {
          const diffMs = updateData.outTime.getTime() - updateData.inTime.getTime()
          updateData.minutesWorked = Math.floor(diffMs / (1000 * 60))
          updateData.hoursWorked = parseFloat((updateData.minutesWorked / 60).toFixed(2))
        } else if (row.minutesWorked !== undefined && updateData.minutesWorked !== null) {
          updateData.hoursWorked = parseFloat((updateData.minutesWorked / 60).toFixed(2))
        } else if (row.hoursWorked !== undefined && updateData.hoursWorked !== null) {
          updateData.minutesWorked = Math.round(updateData.hoursWorked * 60)
        }

        return prisma.payrollImportRow.update({
          where: { id: row.id },
          data: updateData,
        })
      })
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating import rows:', error)
    return NextResponse.json(
      { error: 'Failed to update import rows', details: error.message },
      { status: 500 }
    )
  }
}
