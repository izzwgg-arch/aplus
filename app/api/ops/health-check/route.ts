import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execSync } from 'child_process'
import { logHealthEvent, logOpsAction } from '@/lib/ops-logger'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  let output = ''
  let success = false

  try {
    output = execSync('/opt/smartsteps-ops/health/healthcheck.sh 2>&1', {
      timeout: 30000,
      shell: '/bin/bash' as any,
    }).toString()
    success = true
  } catch (e: any) {
    output = e.stdout?.toString() || e.message
    success = false
  }

  const hasFail = output.toUpperCase().includes('FAIL')

  await Promise.all([
    logHealthEvent('MANUAL_HEALTH_CHECK', `Manual health check triggered`, {
      actorEmail: session.user.email || 'admin',
      actorRole: session.user.role,
      actorUserId: session.user.id,
      level: hasFail ? 'warning' : 'info',
      source: 'healthcheck',
      status: success && !hasFail ? 'success' : 'failure',
      metadata: { summary: output.slice(-300) },
    }),
    logOpsAction('MANUAL_HEALTH_CHECK', `Health check run by ${session.user.email}`, {
      actorEmail: session.user.email || 'admin',
      actorUserId: session.user.id,
      status: success ? 'success' : 'failure',
    }),
  ])

  return NextResponse.json({ success, output, timestamp: new Date().toISOString() })
}
