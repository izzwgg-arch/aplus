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

function parseSSHConfig(): Record<string, string> {
  const result: Record<string, string> = {}
  try {
    const content = fs.readFileSync('/etc/ssh/sshd_config.d/70-smartsteps-hardening.conf', 'utf8')
    for (const line of content.split('\n')) {
      const clean = line.replace(/#.*$/, '').trim()
      const match = clean.match(/^(\w+)\s+(.+)$/)
      if (match) {
        result[match[1]] = match[2].trim()
      }
    }
  } catch {}
  return result
}

function parseUFWRules(): string[] {
  const out = run('ufw status verbose 2>/dev/null')
  if (!out) return []
  return out.split('\n')
    .filter(l => l.match(/ALLOW|DENY|REJECT/))
    .map(l => l.trim())
    .filter(Boolean)
}

function parseCrowdSecAlerts(): { timestamp: string; scenario: string; ip: string }[] {
  try {
    const out = run("cscli alerts list --limit 20 2>/dev/null")
    if (!out) return []
    const lines = out.split('\n').filter(l => l.includes('|') && !l.includes('---') && !l.includes('ID'))
    return lines.slice(0, 20).map(line => {
      const parts = line.split('|').map(p => p.trim())
      return {
        timestamp: parts[2] || '',
        scenario: parts[3] || '',
        ip: parts[4] || '',
      }
    }).filter(d => d.scenario)
  } catch {
    return []
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  return NextResponse.json({
    ufwRules: parseUFWRules(),
    sshHardening: parseSSHConfig(),
    recentDetections: parseCrowdSecAlerts(),
  })
}
