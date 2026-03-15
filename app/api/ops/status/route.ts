import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execSync } from 'child_process'
import * as fs from 'fs'

export const dynamic = 'force-dynamic'

function run(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000, shell: '/bin/bash' as any }).toString().trim()
  } catch {
    return ''
  }
}

function parseMemPercent(): string {
  try {
    const mem = fs.readFileSync('/proc/meminfo', 'utf8')
    const totalMatch = mem.match(/MemTotal:\s+(\d+)/)
    const availMatch = mem.match(/MemAvailable:\s+(\d+)/)
    if (totalMatch && availMatch) {
      const total = parseInt(totalMatch[1])
      const avail = parseInt(availMatch[1])
      const usedPct = Math.round(((total - avail) / total) * 100)
      return `${usedPct}%`
    }
  } catch {}
  return 'unknown'
}

function parseSwapStatus(): string {
  try {
    const swap = fs.readFileSync('/proc/swaps', 'utf8').trim()
    const lines = swap.split('\n').slice(1).filter(Boolean)
    if (lines.length === 0) return 'none'
    const parts = lines[0].split(/\s+/)
    const total = parseInt(parts[2] || '0')
    const used = parseInt(parts[3] || '0')
    if (total === 0) return 'inactive'
    return `${Math.round((used / total) * 100)}% used`
  } catch {
    return 'unknown'
  }
}

function getDiskUsage(): string {
  try {
    const out = run("df / | tail -1 | awk '{print $5}'")
    return out || 'unknown'
  } catch {
    return 'unknown'
  }
}

function getLastBackup(): string {
  try {
    const log = fs.readFileSync('/opt/smartsteps-ops/logs/backup.log', 'utf8')
    const lines = log.split('\n').filter(l => l.toLowerCase().includes('success') || l.toLowerCase().includes('complete'))
    if (lines.length > 0) return lines[lines.length - 1].substring(0, 50)
  } catch {}
  return 'No backup log found'
}

function getBlockedIPCount(): number {
  try {
    const out = run("cscli decisions list 2>/dev/null | grep -c 'ban'")
    const n = parseInt(out)
    return isNaN(n) ? 0 : n
  } catch {
    return 0
  }
}

function isServiceActive(service: string): string {
  const out = run(`systemctl is-active ${service} 2>/dev/null`)
  return out || 'unknown'
}

function isPm2Online(): string {
  try {
    const out = run("pm2 jlist 2>/dev/null")
    const list = JSON.parse(out || '[]')
    const app = list.find((p: any) => p.name === 'aplus-center')
    return app?.pm2_env?.status || 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const cpuRaw = run("cat /proc/loadavg | awk '{print $1}'")
  const appStatus = isPm2Online()
  const dbStatus = isServiceActive('postgresql')
  const nginxStatus = isServiceActive('nginx')
  const crowdsecStatus = isServiceActive('crowdsec')

  return NextResponse.json({
    systemStatus: 'ok',
    appStatus,
    dbStatus,
    nginxStatus,
    crowdsecStatus,
    lastBackup: getLastBackup(),
    activeAlerts: 0,
    blockedIPs: getBlockedIPCount(),
    cpuLoad: cpuRaw || 'unknown',
    memUsage: parseMemPercent(),
    diskUsage: getDiskUsage(),
    swapStatus: parseSwapStatus(),
  })
}
