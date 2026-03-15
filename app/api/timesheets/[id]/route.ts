import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateUnits } from '@/lib/utils'
import { detectTimesheetOverlaps } from '@/lib/server/timesheetOverlapValidation'
import { getTimesheetVisibilityScope, getUserPermissions } from '@/lib/permissions'
import { parseDateOnly } from '@/lib/dateUtils'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const timesheet = await prisma.timesheet.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        provider: true,
        bcba: true,
        insurance: true,
        entries: {
          orderBy: { date: 'asc' },
        },
        user: true,
      },
    })

    if (!timesheet || timesheet.deletedAt) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    // Check timesheet visibility scope
    const visibilityScope = await getTimesheetVisibilityScope(session.user.id)
    if (!visibilityScope.viewAll && !visibilityScope.allowedUserIds.includes(timesheet.userId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(timesheet)
  } catch (error) {
    console.error('Error fetching timesheet:', error)
    return NextResponse.json(
      { error: 'Failed to fetch timesheet' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const timesheet = await prisma.timesheet.findUnique({
      where: { id: params.id },
    })

    if (!timesheet || timesheet.deletedAt) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    // Only DRAFT timesheets can be edited (EMAILED timesheets cannot be edited)
    if (timesheet.status === 'EMAILED') {
      return NextResponse.json(
        { error: 'Emailed timesheets cannot be edited' },
        { status: 400 }
      )
    }
    if (timesheet.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Only draft timesheets can be edited' },
        { status: 400 }
      )
    }

    // Check timesheet visibility scope for editing (must be able to view to edit)
    const visibilityScope = await getTimesheetVisibilityScope(session.user.id)
    if (!visibilityScope.viewAll && !visibilityScope.allowedUserIds.includes(timesheet.userId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await request.json()
    const { entries, ...timesheetData } = data

    // Validate entries
    if (!entries || entries.length === 0) {
      return NextResponse.json(
        { error: 'At least one entry is required' },
        { status: 400 }
      )
    }

    // Get timesheet timezone (use existing or new timezone from request)
    const timesheetTimezone = (timesheetData as any).timezone || timesheet.timezone || 'America/New_York'
    const { isSaturdayInTimezone } = await import('@/lib/dateUtils')

    // Validate startDate and endDate are not Saturdays (if provided, using timesheet timezone)
    if ((timesheetData as any).startDate) {
      if (isSaturdayInTimezone((timesheetData as any).startDate, timesheetTimezone)) {
        return NextResponse.json(
          { error: 'Timesheets cannot be created on Saturdays' },
          { status: 400 }
        )
      }
    }
    if ((timesheetData as any).endDate) {
      if (isSaturdayInTimezone((timesheetData as any).endDate, timesheetTimezone)) {
        return NextResponse.json(
          { error: 'Timesheets cannot be created on Saturdays' },
          { status: 400 }
        )
      }
    }

    // Validate entry format and times
    for (const entry of entries) {
      if (!entry.date || !entry.startTime || !entry.endTime) {
        return NextResponse.json(
          { error: 'Each entry must have date, startTime, and endTime' },
          { status: 400 }
        )
      }

      // Validate entry date is not Saturday (using timesheet timezone)
      if (isSaturdayInTimezone(entry.date, timesheetTimezone)) {
        return NextResponse.json(
          { error: 'Timesheets cannot be created on Saturdays' },
          { status: 400 }
        )
      }

      // Validate time format (HH:mm)
      const timeFormat = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/
      if (!timeFormat.test(entry.startTime) || !timeFormat.test(entry.endTime)) {
        return NextResponse.json(
          { error: `Invalid time format. Expected HH:mm, got startTime: ${entry.startTime}, endTime: ${entry.endTime}` },
          { status: 400 }
        )
      }

      // Validate time range (end > start)
      const [startH, startM] = entry.startTime.split(':').map(Number)
      const [endH, endM] = entry.endTime.split(':').map(Number)
      const startMinutes = startH * 60 + startM
      const endMinutes = endH * 60 + endM

      if (endMinutes <= startMinutes) {
        return NextResponse.json(
          { error: `End time must be after start time. Got ${entry.startTime} - ${entry.endTime}` },
          { status: 400 }
        )
      }

      const calculatedMinutes = endMinutes - startMinutes

      // Validate minutes matches calculated duration (allow small rounding differences)
      if (Math.abs(entry.minutes - calculatedMinutes) > 1) {
        return NextResponse.json(
          { error: `Minutes mismatch. Expected ${calculatedMinutes}, got ${entry.minutes}` },
          { status: 400 }
        )
      }

      if (!entry.minutes || entry.minutes <= 0) {
        return NextResponse.json(
          { error: 'Minutes must be greater than 0' },
          { status: 400 }
        )
      }
    }

    // Overlap validation (provider OR client OR both), excluding the current timesheet
    const providerId = timesheetData.providerId || timesheet.providerId || ''
    const clientId = timesheetData.clientId || timesheet.clientId
    const isBCBA = (timesheetData as any).isBCBA !== undefined ? (timesheetData as any).isBCBA : (timesheet as any).isBCBA

    // For BCBA timesheets, use a placeholder provider if needed
    let finalProviderId = providerId
    if (isBCBA && !providerId) {
      const firstProvider = await prisma.provider.findFirst({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      })
      if (firstProvider) {
        finalProviderId = firstProvider.id
      }
    }

    const [provider, client] = await Promise.all([
      finalProviderId ? prisma.provider.findUnique({ where: { id: finalProviderId }, select: { name: true } }) : Promise.resolve(null),
      prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }),
    ])

    // Skip overlap validation for BCBA timesheets - they allow overlaps
    if (!isBCBA) {
      const overlapConflicts = await detectTimesheetOverlaps({
        providerId: finalProviderId || '',
        clientId,
        providerName: provider?.name || '',
        clientName: client?.name || 'Unknown Client',
        entries,
        excludeTimesheetId: params.id,
      })

      if (overlapConflicts.length > 0) {
        return NextResponse.json(
          { error: 'Overlap conflicts detected', code: 'OVERLAP_CONFLICT', conflicts: overlapConflicts },
          { status: 400 }
        )
      }
    } else {
      console.log('[OVERLAP] Skipped overlap validation for BCBA timesheet')
    }

    // Update timesheet
    const updated = await prisma.$transaction(async (tx) => {
      // Delete existing entries
      await tx.timesheetEntry.deleteMany({
        where: { timesheetId: params.id },
      })

      // Update timesheet
      const updateData: any = {
        providerId: finalProviderId || timesheet.providerId, // Use placeholder for BCBA timesheets
        clientId: timesheetData.clientId || timesheet.clientId,
        bcbaId: timesheetData.bcbaId || timesheet.bcbaId,
        insuranceId: (timesheetData as any).insuranceId !== undefined ? (timesheetData as any).insuranceId : (timesheet.insuranceId || ((timesheet as any).bcbaInsuranceId || null)), // Fallback to bcbaInsuranceId for migration
        startDate: (timesheetData as any).startDate ? new Date((timesheetData as any).startDate) : timesheet.startDate, // Accept any date format
        endDate: (timesheetData as any).endDate ? new Date((timesheetData as any).endDate) : timesheet.endDate, // Accept any date format
        timezone: (timesheetData as any).timezone || timesheet.timezone,
        lastEditedBy: session.user.id,
        lastEditedAt: new Date(),
      }

      // Add BCBA-specific fields if provided
      if ((timesheetData as any).isBCBA !== undefined) {
        updateData.isBCBA = (timesheetData as any).isBCBA
      } else if ((timesheet as any).isBCBA !== undefined) {
        updateData.isBCBA = (timesheet as any).isBCBA
      }
      
      if ((timesheetData as any).serviceType !== undefined) {
        updateData.serviceType = (timesheetData as any).serviceType
      }
      
      if ((timesheetData as any).sessionData !== undefined) {
        updateData.sessionData = (timesheetData as any).sessionData
      }

      updateData.entries = {
        create: entries.map((entry: any) => {
          // Calculate units (1 unit = 15 minutes, no rounding)
          const units = entry.minutes / 15
          
            return {
              date: parseDateOnly(entry.date, (timesheetData as any).timezone || timesheet.timezone),
              startTime: entry.startTime, // Already validated as HH:mm
              endTime: entry.endTime, // Already validated as HH:mm
              minutes: entry.minutes, // Store actual minutes
              units: units, // Store units (1 unit = 15 minutes)
              notes: entry.notes || null,
              invoiced: entry.invoiced || false,
            }
        }),
      }

      const updatedTimesheet = await tx.timesheet.update({
        where: { id: params.id },
        data: updateData,
        include: {
          client: true,
          provider: true,
          bcba: true,
          insurance: true,
          entries: true,
        },
      })

      return updatedTimesheet
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating timesheet:', error)
    return NextResponse.json(
      { error: 'Failed to update timesheet' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const timesheet = await prisma.timesheet.findUnique({
      where: { id: params.id },
    })

    if (!timesheet || timesheet.deletedAt) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    // Check if user has delete permission or is admin
    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
    const permissions = await getUserPermissions(session.user.id)
    const canDelete = permissions['timesheets.delete']?.canDelete === true || isAdmin
    
    // Allow users to delete their own DRAFT timesheets even without delete permission
    const isOwnTimesheet = timesheet.userId === session.user.id
    const canDeleteOwnDraft = isOwnTimesheet && timesheet.status === 'DRAFT'
    
    if (!canDelete && !canDeleteOwnDraft) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if timesheet is APPROVED - only admins can delete approved timesheets
    if (timesheet.status === 'APPROVED' && !isAdmin) {
      return NextResponse.json(
        { error: 'Approved timesheets cannot be deleted' },
        { status: 400 }
      )
    }

    // Check timesheet visibility scope for deleting (must be able to view to delete)
    // Skip this check if user is deleting their own timesheet
    if (!isOwnTimesheet) {
      const visibilityScope = await getTimesheetVisibilityScope(session.user.id)
      if (!visibilityScope.viewAll && !visibilityScope.allowedUserIds.includes(timesheet.userId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Delete timesheet entries first (cascade should handle this, but being explicit)
    // Then soft delete the timesheet
    await prisma.$transaction(async (tx) => {
      // Delete entries (cascade will handle this automatically, but being explicit for safety)
      await tx.timesheetEntry.deleteMany({
        where: { timesheetId: params.id },
      })

      // Soft delete the timesheet
      await tx.timesheet.update({
        where: { id: params.id },
        data: { deletedAt: new Date() },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting timesheet:', error)
    return NextResponse.json(
      { error: 'Failed to delete timesheet' },
      { status: 500 }
    )
  }
}
