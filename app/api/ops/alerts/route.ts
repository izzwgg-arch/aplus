import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as fs from 'fs'

export const dynamic = 'force-dynamic'

const ALERTS_FILE = '/opt/smartsteps-ops/logs/alerts.json'

function readAlerts() {
  try {
    if (!fs.existsSync(ALERTS_FILE)) return []
    return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'))
  } catch {
    return []
  }
}

function writeAlerts(alerts: any[]) {
  fs.mkdirSync('/opt/smartsteps-ops/logs', { recursive: true })
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2))
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  return NextResponse.json({ alerts: readAlerts() })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const alerts = readAlerts().filter((a: any) => a.id !== id)
  writeAlerts(alerts)
  return NextResponse.json({ success: true })
}
