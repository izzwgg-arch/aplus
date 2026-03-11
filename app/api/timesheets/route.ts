import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateUnits } from '@/lib/utils'
import { detectTimesheetOverlaps } from '@/lib/server/timesheetOverlapValidation'
import { startOfDay, endOfDay, eachDayOfInterval, format } from 'date-fns'
import { parseDateOnly } from '@/lib/dateUtils'
import { getTimesheetVisibilityScope } from '@/lib/permissions'
import { startPerfLog } from '@/lib/api-performance'

export async function GET(request: NextRequest) {
  const perf = startPerfLog('GET /api/timesheets')
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    const search = searchParams.get('search') || ''
    const isBCBA = searchParams.get('isBCBA') === 'true' // Filter for BCBA timesheets

    const where: any = { deletedAt: null }
    
    // Filter out invoiced timesheets from active list (unless explicitly requesting archived)
    const showArchived = searchParams.get('archived') === 'true'
    
    // Strict separation: filter by isBCBA flag
    if (isBCBA !== undefined) {
      where.isBCBA = isBCBA === true
    }
    
    // Handle archived field filtering using raw SQL since Prisma may not recognize it
    if (showArchived) {
      // Archive page: show invoiced OR archived timesheets
      // First, get IDs of archived timesheets using raw SQL
      const archivedIds = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
        SELECT id FROM "Timesheet"
        WHERE "deletedAt" IS NULL
          ${isBCBA !== undefined ? `AND "isBCBA" = ${isBCBA}` : ''}
          AND "archived" = true
      `)
      const archivedIdList = archivedIds.map((r: any) => r.id)
      
      // Update where clause to include archived IDs OR invoiced
      where.OR = [
        { invoiceEntries: { some: {} } }, // Has invoice entries = invoiced
      ]
      if (archivedIdList.length > 0) {
        where.OR.push({ id: { in: archivedIdList } }) // OR manually archived
      }
    } else {
      // Active list: show only non-invoiced AND non-archived timesheets
      where.invoiceEntries = { none: {} } // No invoice entries = not invoiced
      
      // Exclude archived timesheets using raw SQL
      const archivedIds = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
        SELECT id FROM "Timesheet"
        WHERE "deletedAt" IS NULL
          ${isBCBA !== undefined ? `AND "isBCBA" = ${isBCBA}` : ''}
          AND "archived" = true
      `)
      const archivedIdList = archivedIds.map((r: any) => r.id)
      
      if (archivedIdList.length > 0) {
        where.id = { notIn: archivedIdList }
      }
    }
    const clientId = searchParams.get('clientId')
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const userIdParam = searchParams.get('userId')

    if (search) {
      // If where.OR already exists (for archive), combine with search
      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          {
            OR: [
              { client: { name: { contains: search, mode: 'insensitive' } } },
              { provider: { name: { contains: search, mode: 'insensitive' } } },
            ]
          }
        ]
        delete where.OR
      } else {
        where.OR = [
          { client: { name: { contains: search, mode: 'insensitive' } } },
          { provider: { name: { contains: search, mode: 'insensitive' } } },
        ]
      }
    }

    if (clientId) {
      where.clientId = clientId
    }

    if (status) {
      where.status = status
    }

    if (startDate) {
      where.endDate = { gte: new Date(startDate) }
    }

    if (endDate) {
      where.startDate = { lte: new Date(endDate) }
    }

    // Apply timesheet visibility scope based on user permissions
    const visibilityScope = await getTimesheetVisibilityScope(session.user.id)
    
    console.log('[TIMESHEETS] Visibility scope:', {
      userId: session.user.id,
      role: session.user.role,
      viewAll: visibilityScope.viewAll,
      allowedUserIdsCount: visibilityScope.allowedUserIds.length,
      userIdParam,
    })
    
    // If user has viewAll, only filter by userId if explicitly provided
    if (visibilityScope.viewAll) {
      if (userIdParam) {
        where.userId = userIdParam
      }
      // If viewAll is true and no userId filter, no userId filter is applied (can see all)
    } else {
      // Filter by allowed user IDs
      const allowedIds = visibilityScope.allowedUserIds
      // Safety check: if allowedIds is empty, user can't see any timesheets
      if (allowedIds.length === 0) {
        // Return empty result instead of querying with empty array
        return NextResponse.json({
          timesheets: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        })
      }
      // If userId filter is provided and user has viewSelectedUsers, further filter
      if (userIdParam && allowedIds.includes(userIdParam)) {
        where.userId = userIdParam
      } else {
        where.userId = { in: allowedIds }
      }
    }

    // Fetch timesheets with strict isBCBA filtering
    const [timesheets, total] = await Promise.all([
      prisma.timesheet.findMany({
        where,
        include: {
          client: true,
          provider: true,
          bcba: true,
          insurance: true,
          entries: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.timesheet.count({ where }),
    ])

    const result = NextResponse.json({
      timesheets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
    perf.end()
    return result
  } catch (error) {
    perf.end()
    console.error('Error fetching timesheets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch timesheets' },
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
    const {
      providerId,
      clientId,
      bcbaId,
      insuranceId,
      isBCBA,
      serviceType,
      sessionData,
      startDate,
      endDate,
      timezone,
      entries,
    } = data

    // Validation - BCBA timesheets don't require provider or insurance
    if (isBCBA) {
      // For BCBA timesheets, providerId is optional (use empty string as placeholder)
      if (!clientId || !bcbaId || !startDate || !endDate) {
        return NextResponse.json(
          { error: 'Client, BCBA, Start Date, and End Date are required' },
          { status: 400 }
        )
      }
      // BCBA timesheets require Insurance (with BCBA rates)
      if (!insuranceId) {
        return NextResponse.json(
          { error: 'Insurance is required for BCBA timesheets' },
          { status: 400 }
        )
      }
    } else {
      // Regular timesheets require provider
      if (!providerId || !clientId || !bcbaId || !startDate || !endDate) {
        return NextResponse.json(
          { error: 'Provider, Client, BCBA, Start Date, and End Date are required' },
          { status: 400 }
        )
      }
    }

    // Both regular and BCBA timesheets require insurance
    if (!insuranceId) {
      return NextResponse.json(
        { error: 'Insurance is required' },
        { status: 400 }
      )
    }

    // For BCBA timesheets, use a placeholder provider or find first active provider
    let finalProviderId = providerId
    if (isBCBA && !providerId) {
      const firstProvider = await prisma.provider.findFirst({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
      })
      if (!firstProvider) {
        return NextResponse.json(
          { error: 'No active provider found. At least one provider must exist in the system.' },
          { status: 400 }
        )
      }
      finalProviderId = firstProvider.id
    }

    // Verify entities are active
    const [provider, client, insurance] = await Promise.all([
      finalProviderId ? prisma.provider.findUnique({ where: { id: finalProviderId } }) : Promise.resolve(null),
      prisma.client.findUnique({ where: { id: clientId } }),
      insuranceId ? prisma.insurance.findUnique({ where: { id: insuranceId } }) : Promise.resolve(null),
    ])

    if (!client?.active) {
      return NextResponse.json(
        { error: 'Client must be active' },
        { status: 400 }
      )
    }

    // Only check provider for regular timesheets
    if (!isBCBA && (!provider?.active)) {
      return NextResponse.json(
        { error: 'Provider must be active' },
        { status: 400 }
      )
    }

    // Only check insurance if it's provided (regular timesheets)
    if (insuranceId && !insurance?.active) {
      return NextResponse.json(
        { error: 'Insurance must be active' },
        { status: 400 }
      )
    }

    // Validate entries
    if (!entries || entries.length === 0) {
      return NextResponse.json(
        { error: 'At least one entry is required' },
        { status: 400 }
      )
    }

    // Validate startDate and endDate are not Saturdays (using timesheet timezone)
    const timesheetTimezone = timezone || 'America/New_York'
    const { isSaturdayInTimezone } = await import('@/lib/dateUtils')
    
    if (isSaturdayInTimezone(startDate, timesheetTimezone)) {
      return NextResponse.json(
        { error: 'Timesheets cannot be created on Saturdays' },
        { status: 400 }
      )
    }
    if (isSaturdayInTimezone(endDate, timesheetTimezone)) {
      return NextResponse.json(
        { error: 'Timesheets cannot be created on Saturdays' },
        { status: 400 }
      )
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

    // Overlap validation (provider OR client OR both)
    // Skip overlap validation for BCBA timesheets - they allow overlaps
    if (!isBCBA) {
      const overlapConflicts = await detectTimesheetOverlaps({
        providerId: finalProviderId || '',
        clientId,
        providerName: provider?.name || '',
        clientName: client.name,
        entries,
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

    // Create timesheet
    // Use transaction to create timesheet and then update bcbaInsuranceId if needed (since Prisma client may not recognize it yet)
    const timesheet = await prisma.$transaction(async (tx) => {
      const newTimesheet = await tx.timesheet.create({
        data: {
          userId: session.user.id,
          providerId: finalProviderId, // Use placeholder provider for BCBA timesheets
          clientId,
          bcbaId,
          insuranceId: insuranceId, // Required for both regular and BCBA timesheets
          isBCBA: isBCBA === true,
          serviceType: serviceType || null,
          sessionData: sessionData || null,
          startDate: parseDateOnly(startDate, timezone || 'America/New_York'),
          endDate: parseDateOnly(endDate, timezone || 'America/New_York'),
          timezone: timezone || 'America/New_York',
          status: 'DRAFT',
          lastEditedBy: session.user.id,
          lastEditedAt: new Date(),
          entries: {
            create: entries.map((entry: any) => {
            // Calculate units (1 unit = 15 minutes, no rounding)
            const units = entry.minutes / 15
            
            return {
              date: parseDateOnly(entry.date, timezone || 'America/New_York'),
              startTime: entry.startTime, // Already validated as HH:mm
              endTime: entry.endTime, // Already validated as HH:mm
              minutes: entry.minutes, // Store actual minutes
              units: units, // Store units (1 unit = 15 minutes)
              notes: entry.notes || null,
              invoiced: entry.invoiced || false,
            }
          }),
        },
      },
      include: {
        client: true,
        provider: true,
        bcba: true,
        insurance: true,
        entries: true,
      },
    })

      // BCBA timesheets now use insuranceId (no separate bcbaInsuranceId needed)

      // Fetch the updated timesheet
      return await tx.timesheet.findUnique({
        where: { id: newTimesheet.id },
        include: {
          client: true,
          provider: true,
          bcba: true,
          insurance: true,
          entries: true,
        },
      })
    })

    return NextResponse.json(timesheet, { status: 201 })
  } catch (error) {
    console.error('Error creating timesheet:', error)
    return NextResponse.json(
      { error: 'Failed to create timesheet' },
      { status: 500 }
    )
  }
}
