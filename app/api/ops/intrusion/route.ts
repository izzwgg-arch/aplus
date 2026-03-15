import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execSync } from 'child_process'
import * as fs from 'fs'

export const dynamic = 'force-dynamic'

function run(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 8000, shell: '/bin/bash' as any }).toString().trim()
  } catch {
    return ''
  }
}

interface IntrusionEvent {
  timestamp: string
  type: 'ssh-fail' | 'crowdsec-block' | 'crowdsec-alert' | 'other'
  description: string
  ip?: string
  scenario?: string
}

function parseAuthLog(): IntrusionEvent[] {
  const events: IntrusionEvent[] = []
  try {
    const out = run("tail -n 200 /var/log/auth.log 2>/dev/null | grep -i 'failed\\|invalid\\|disconnect' | tail -30")
    for (const line of out.split('\n').filter(Boolean)) {
      const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
      const tsMatch = line.match(/^(\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2})/)
      events.push({
        timestamp: tsMatch ? tsMatch[1] : '',
        type: 'ssh-fail',
        description: line.substring(0, 120),
        ip: ipMatch ? ipMatch[1] : undefined,
      })
    }
  } catch {}
  return events.filter(e => e.timestamp)
}

function parseCrowdSecAlerts(): IntrusionEvent[] {
  const events: IntrusionEvent[] = []
  try {
    const out = run("cscli alerts list --limit 50 2>/dev/null")
    const lines = out.split('\n').filter(l => l.includes('|') && !l.includes('---') && !l.match(/^\s*ID\s*\|/))
    for (const line of lines.slice(0, 50)) {
      const parts = line.split('|').map(p => p.trim())
      if (parts.length < 4) continue
      events.push({
        timestamp: parts[2] || '',
        type: 'crowdsec-alert',
        description: `${parts[3]} — CrowdSec detection`,
        ip: parts[4] || undefined,
        scenario: parts[3] || undefined,
      })
    }
  } catch {}
  return events.filter(e => e.timestamp)
}

function parseCrowdSecDecisions(): IntrusionEvent[] {
  const events: IntrusionEvent[] = []
  try {
    const out = run("cscli decisions list 2>/dev/null")
    const lines = out.split('\n').filter(l => l.includes('|') && !l.includes('---') && !l.match(/^\s*ID\s*\|/))
    for (const line of lines.slice(0, 30)) {
      const parts = line.split('|').map(p => p.trim())
      if (parts.length < 4) continue
      events.push({
        timestamp: parts[6] || parts[5] || '',
        type: 'crowdsec-block',
        description: `Blocked: ${parts[4] || parts[3]} — ${parts[3] || 'ban'}`,
        ip: parts[4] || parts[3] || undefined,
        scenario: parts[3] || undefined,
      })
    }
  } catch {}
  return events
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const events: IntrusionEvent[] = [
    ...parseAuthLog(),
    ...parseCrowdSecAlerts(),
    ...parseCrowdSecDecisions(),
  ]

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return NextResponse.json({ events: events.slice(0, 80) })
}
