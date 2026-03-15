import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exec } from 'child_process'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  exec('/opt/smartsteps-ops/scripts/backup_all.sh >> /opt/smartsteps-ops/logs/backup.log 2>&1 &', {
    shell: '/bin/bash',
  })

  return NextResponse.json({
    started: true,
    message: 'Backup started in background. Check the Backup Logs section in a few minutes.',
    timestamp: new Date().toISOString(),
  })
}
