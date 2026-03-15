import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createLoginActivity } from '@/lib/activity'

/**
 * API route to log login activity
 * Called after successful authentication to record the login event
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get IP address and user agent from request headers
    const ipAddress = 
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      request.ip ||
      'unknown'
    
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Log the login activity
    await createLoginActivity({
      actorUserId: session.user.id,
      actorEmail: session.user.email || '',
      actorRole: session.user.role as any,
      ipAddress,
      userAgent,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error logging login activity:', error)
    // Don't fail the request if activity logging fails
    return NextResponse.json({ success: false, error: 'Failed to log activity' }, { status: 500 })
  }
}
