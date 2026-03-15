import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as fs from 'fs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const logPath = '/opt/smartsteps-ops/logs/healthcheck.log'
    if (!fs.existsSync(logPath)) {
      return NextResponse.json({ entries: [] })
    }

    const content = fs.readFileSync(logPath, 'utf8')
    const lines = content.split('\n').filter(Boolean).slice(-50)

    const entries = lines.map(line => {
      // Lines like: [2026-03-15 05:52:54] OK:   PM2 aplus-center is online
      const match = line.match(/^\[([^\]]+)\]\s+(OK|FAIL|WARN):\s+(.+)$/)
      if (match) {
        return {
          timestamp: match[1],
          result: match[2],
          check: match[3].trim(),
          raw: line,
        }
      }
      return {
        timestamp: '',
        result: 'INFO',
        check: line,
        raw: line,
      }
    }).reverse()

    return NextResponse.json({ entries })
  } catch (e: any) {
    return NextResponse.json({ entries: [], error: e.message })
  }
}
