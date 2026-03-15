import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as fs from 'fs'
import { logOpsAction, logAuditEvent } from '@/lib/ops-logger'

export const dynamic = 'force-dynamic'

const SETTINGS_FILE = '/opt/smartsteps-ops/config/ops-settings.json'

const DEFAULT_SETTINGS = {
  alertEmail: '',
  diskThreshold: 85,
  memThreshold: 90,
  refreshInterval: 30,
  anomalySensitivity: 'medium',
}

function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  return NextResponse.json(readSettings())
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const oldSettings = readSettings()
    const settings = {
      alertEmail: String(body.alertEmail || '').substring(0, 100),
      diskThreshold: Math.min(99, Math.max(50, parseInt(body.diskThreshold) || 85)),
      memThreshold: Math.min(99, Math.max(50, parseInt(body.memThreshold) || 90)),
      refreshInterval: Math.min(300, Math.max(10, parseInt(body.refreshInterval) || 30)),
      anomalySensitivity: ['low', 'medium', 'high'].includes(body.anomalySensitivity)
        ? body.anomalySensitivity
        : 'medium',
    }
    fs.mkdirSync('/opt/smartsteps-ops/config', { recursive: true })
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))

    await Promise.all([
      logOpsAction('SETTINGS_UPDATED', `Ops Center settings updated by ${session.user.email}`, {
        actorEmail: session.user.email || 'admin',
        actorRole: session.user.role,
        actorUserId: session.user.id,
        status: 'success',
        metadata: { changes: Object.keys(settings).filter(k => (oldSettings as any)[k] !== (settings as any)[k]) },
      }),
      logAuditEvent('SETTINGS_CHANGE', `Ops settings changed by ${session.user.email}`, {
        actorEmail: session.user.email || 'admin',
        actorUserId: session.user.id,
      }),
    ])

    return NextResponse.json({ success: true, settings })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
