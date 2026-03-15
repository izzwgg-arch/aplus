import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const output = execSync('/opt/smartsteps-ops/health/healthcheck.sh 2>&1', {
      timeout: 30000,
      shell: '/bin/bash' as any,
    }).toString()
    return NextResponse.json({ success: true, output, timestamp: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      output: e.stdout?.toString() || e.message,
      timestamp: new Date().toISOString(),
    })
  }
}
