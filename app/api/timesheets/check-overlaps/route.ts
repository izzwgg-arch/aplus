import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { detectTimesheetOverlaps } from '@/lib/server/timesheetOverlapValidation'

/**
 * POST /api/timesheets/check-overlaps
 * Check for overlaps before saving a timesheet
 * Used by frontend to validate in real-time
 */
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
      entries,
      excludeTimesheetId, // Optional: exclude current timesheet when editing
      isBCBA, // Optional: if true, skip overlap check
    } = data

    // Skip overlap check for BCBA timesheets - they allow overlaps
    if (isBCBA === true) {
      console.log('[OVERLAP] Skipped overlap validation for BCBA timesheet')
      return NextResponse.json({
        hasOverlaps: false,
        conflicts: [],
      })
    }

    if (!providerId || !clientId || !entries || !Array.isArray(entries)) {
      return NextResponse.json(
        { error: 'providerId, clientId, and entries array are required' },
        { status: 400 }
      )
    }

    // Fetch provider and client names for error messages
    const { prisma } = await import('@/lib/prisma')
    const [provider, client] = await Promise.all([
      prisma.provider.findUnique({ where: { id: providerId }, select: { name: true } }),
      prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }),
    ])

    if (!provider || !client) {
      return NextResponse.json(
        { error: 'Provider or Client not found' },
        { status: 404 }
      )
    }

    // Check for overlaps
    const overlapConflicts = await detectTimesheetOverlaps({
      providerId,
      clientId,
      providerName: provider.name,
      clientName: client.name,
      entries,
      excludeTimesheetId,
    })

    return NextResponse.json({
      hasOverlaps: overlapConflicts.length > 0,
      conflicts: overlapConflicts,
    })
  } catch (error) {
    console.error('Error checking overlaps:', error)
    return NextResponse.json(
      { error: 'Failed to check overlaps' },
      { status: 500 }
    )
  }
}
