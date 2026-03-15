import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTimesheetVisibilityScope } from '@/lib/permissions'

/**
 * Get timesheet visibility scope for the current user
 * Used by frontend to determine which users to show in filter dropdown
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const scope = await getTimesheetVisibilityScope(session.user.id)
    return NextResponse.json({ scope })
  } catch (error) {
    console.error('Error fetching timesheet scope:', error)
    return NextResponse.json(
      { error: 'Failed to fetch timesheet scope' },
      { status: 500 }
    )
  }
}
