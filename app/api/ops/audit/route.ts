import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as fs from 'fs'

export const dynamic = 'force-dynamic'

interface AuditEvent {
  timestamp: string
  type: string
  description: string
  user?: string
  raw?: string
}

function readLogFile(path: string, limit = 50): string[] {
  try {
    if (!fs.existsSync(path)) return []
    const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean)
    return lines.slice(-limit)
  } catch {
    return []
  }
}

function parseBackupLog(lines: string[]): AuditEvent[] {
  return lines.map(line => ({
    timestamp: line.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/)?.[0] || '',
    type: 'backup',
    description: line.replace(/^\[.*?\]\s*/, '').substring(0, 100),
    raw: line,
  })).filter(e => e.timestamp)
}

function parseCrowdSecLog(lines: string[]): AuditEvent[] {
  return lines.map(line => {
    const match = line.match(/^\[([^\]]+)\]\s+(BAN|UNBAN)\s+ip=(\S+)/)
    if (!match) return null
    return {
      timestamp: match[1],
      type: match[2].toLowerCase() === 'ban' ? 'ip-ban' : 'ip-unban',
      description: `${match[2]}: ${match[3]} — ${line.replace(/^\[.*?\]/, '').trim()}`,
      raw: line,
    }
  }).filter(Boolean) as AuditEvent[]
}

function parseHealthLog(lines: string[]): AuditEvent[] {
  return lines.filter(l => l.includes('FAIL') || l.includes('[SUMMARY]')).map(line => ({
    timestamp: line.match(/\[([^\]]+)\]/)?.[1] || '',
    type: 'health',
    description: line.replace(/^\[.*?\]\s*/, '').substring(0, 100),
    raw: line,
  })).filter(e => e.timestamp)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const backupLines = readLogFile('/opt/smartsteps-ops/logs/backup.log', 50)
  const crowdsecLines = readLogFile('/opt/smartsteps-ops/logs/crowdsec_actions.log', 50)
  const healthLines = readLogFile('/opt/smartsteps-ops/logs/healthcheck.log', 50)

  const events: AuditEvent[] = [
    ...parseBackupLog(backupLines),
    ...parseCrowdSecLog(crowdsecLines),
    ...parseHealthLog(healthLines),
  ]

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return NextResponse.json({ events: events.slice(0, 100) })
}
