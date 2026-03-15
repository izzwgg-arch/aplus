import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execSync } from 'child_process'
import * as fs from 'fs'

export const dynamic = 'force-dynamic'

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/

function run(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 8000, shell: '/bin/bash' as any }).toString().trim()
  } catch (e: any) {
    return e.stdout?.toString() || ''
  }
}

function logAction(action: string, ip: string, extra: string, user: string) {
  try {
    const logDir = '/opt/smartsteps-ops/logs'
    fs.mkdirSync(logDir, { recursive: true })
    const line = `[${new Date().toISOString()}] ${action} ip=${ip} ${extra} user=${user}\n`
    fs.appendFileSync(`${logDir}/crowdsec_actions.log`, line)
  } catch {}
}

function parseDecisions(output: string): { ip: string; reason: string; duration: string; expiresAt: string; source: string }[] {
  if (!output) return []
  const lines = output.split('\n').filter(l => l.includes('|') && !l.includes('---') && !l.match(/^\s*ID\s*\|/))
  return lines.slice(0, 100).map(line => {
    const parts = line.split('|').map(p => p.trim())
    return {
      ip: parts[5] || parts[4] || '',
      reason: parts[3] || '',
      duration: parts[2] || '',
      expiresAt: parts[6] || '',
      source: parts[1] || '',
    }
  }).filter(d => d.ip && d.ip.match(IP_REGEX))
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const out = run('cscli decisions list 2>/dev/null')
  return NextResponse.json({ decisions: parseDecisions(out) })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, ip, duration, reason } = body

  if (!ip || !IP_REGEX.test(ip)) {
    return NextResponse.json({ error: 'Invalid IP format' }, { status: 400 })
  }

  const safeIP = ip.replace(/[^0-9./]/g, '')

  if (action === 'ban') {
    const safeDuration = (duration || '24h').replace(/[^0-9hdm]/g, '')
    const safeReason = (reason || 'manual-admin-ban').replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 50)
    run(`cscli decisions add --ip ${safeIP} --duration ${safeDuration} --reason ${safeReason} --type ban 2>/dev/null`)
    logAction('BAN', safeIP, `duration=${safeDuration} reason=${safeReason}`, session.user.email || 'admin')
    return NextResponse.json({ success: true, message: `${safeIP} banned for ${safeDuration}` })
  }

  if (action === 'unban') {
    run(`cscli decisions delete --ip ${safeIP} 2>/dev/null`)
    logAction('UNBAN', safeIP, '', session.user.email || 'admin')
    return NextResponse.json({ success: true, message: `${safeIP} unbanned` })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
