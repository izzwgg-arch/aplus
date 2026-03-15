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

function getCPULoad(): number {
  try {
    const load = fs.readFileSync('/proc/loadavg', 'utf8').split(' ')[0]
    return parseFloat(load) || 0
  } catch {
    return 0
  }
}

function getMemPercent(): number {
  try {
    const mem = fs.readFileSync('/proc/meminfo', 'utf8')
    const totalMatch = mem.match(/MemTotal:\s+(\d+)/)
    const availMatch = mem.match(/MemAvailable:\s+(\d+)/)
    if (totalMatch && availMatch) {
      const total = parseInt(totalMatch[1])
      const avail = parseInt(availMatch[1])
      return Math.round(((total - avail) / total) * 100)
    }
  } catch {}
  return 0
}

function getDiskPercent(): number {
  try {
    const out = run("df / | tail -1 | awk '{print $5}' | tr -d '%'")
    return parseInt(out) || 0
  } catch {
    return 0
  }
}

function getSwapPercent(): number {
  try {
    const swaps = fs.readFileSync('/proc/swaps', 'utf8').trim()
    const lines = swaps.split('\n').slice(1).filter(Boolean)
    if (lines.length === 0) return 0
    const parts = lines[0].split(/\s+/)
    const total = parseInt(parts[2] || '0')
    const used = parseInt(parts[3] || '0')
    if (total === 0) return 0
    return Math.round((used / total) * 100)
  } catch {
    return 0
  }
}

function getBlockedCount(): number {
  try {
    const out = run("cscli decisions list 2>/dev/null | grep -c 'ban' || echo 0")
    return parseInt(out) || 0
  } catch {
    return 0
  }
}

// In-memory rolling history (last 20 points)
const metricsHistory: { time: string; cpu: number; memory: number }[] = []

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const now = new Date()
  const cpu = getCPULoad()
  const memory = getMemPercent()

  metricsHistory.push({
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    cpu,
    memory,
  })

  if (metricsHistory.length > 20) {
    metricsHistory.shift()
  }

  return NextResponse.json({
    history: [...metricsHistory],
    diskPercent: getDiskPercent(),
    swapPercent: getSwapPercent(),
    blockedCount: getBlockedCount(),
    currentCpu: cpu,
    currentMem: memory,
  })
}
