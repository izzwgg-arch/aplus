import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export const dynamic = 'force-dynamic'

function run(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000, shell: '/bin/bash' as any }).toString().trim()
  } catch {
    return ''
  }
}

function getDirSize(dirPath: string): string {
  const out = run(`du -sh ${dirPath} 2>/dev/null | cut -f1`)
  return out || 'unknown'
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const jupiter2Path = '/opt/backups/smartsteps/Jupiter2'
  const jupiter2Exists = fs.existsSync(jupiter2Path)
  const jupiter2Size = jupiter2Exists ? getDirSize(jupiter2Path) : '—'

  const timestampedDir = '/opt/backups/smartsteps/timestamped'
  let timestampedBackups: { name: string; size: string; created: string; type: string }[] = []
  if (fs.existsSync(timestampedDir)) {
    try {
      const entries = fs.readdirSync(timestampedDir)
        .filter(e => fs.statSync(path.join(timestampedDir, e)).isDirectory())
        .sort()
        .reverse()
        .slice(0, 20)
      timestampedBackups = entries.map(name => {
        const fullPath = path.join(timestampedDir, name)
        const stat = fs.statSync(fullPath)
        return {
          name,
          size: getDirSize(fullPath),
          created: stat.mtime.toISOString(),
          type: 'timestamped',
        }
      })
    } catch {}
  }

  let lastSuccess = ''
  let recentLogs: string[] = []
  const logPath = '/opt/smartsteps-ops/logs/backup.log'
  if (fs.existsSync(logPath)) {
    try {
      const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
      recentLogs = lines.slice(-20).reverse()
      const successLine = [...lines].reverse().find(l => l.toLowerCase().includes('success') || l.toLowerCase().includes('complete'))
      if (successLine) lastSuccess = successLine.substring(0, 80)
    } catch {}
  }

  return NextResponse.json({
    jupiter2Exists,
    jupiter2Path,
    jupiter2Size,
    timestampedBackups,
    lastSuccess,
    recentLogs,
    retentionPolicy: 'Jupiter2 is permanent and never deleted. Timestamped backups kept for 7 days.',
  })
}
