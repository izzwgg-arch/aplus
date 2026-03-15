import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

function isActive(service: string): boolean {
  try {
    const out = execSync(`systemctl is-active ${service} 2>/dev/null`, {
      timeout: 3000,
      shell: '/bin/bash' as any,
    }).toString().trim()
    return out === 'active'
  } catch {
    return false
  }
}

function isPm2AppOnline(): boolean {
  try {
    const out = execSync('pm2 jlist 2>/dev/null', {
      timeout: 5000,
      shell: '/bin/bash' as any,
    }).toString()
    const list = JSON.parse(out || '[]')
    const app = list.find((p: any) => p.name === 'aplus-center')
    return app?.pm2_env?.status === 'online'
  } catch {
    return false
  }
}

const SERVICE_LIST = [
  { name: 'aplus-center (PM2)', key: 'pm2', displayName: 'A+ Center App', type: 'app', isPm2: true },
  { name: 'nginx', key: 'nginx', displayName: 'Nginx Web Server', type: 'web' },
  { name: 'postgresql', key: 'postgresql', displayName: 'PostgreSQL Database', type: 'db' },
  { name: 'crowdsec', key: 'crowdsec', displayName: 'CrowdSec IDS', type: 'security' },
  { name: 'crowdsec-firewall-bouncer', key: 'crowdsec-firewall-bouncer', displayName: 'CrowdSec Bouncer', type: 'security' },
  { name: 'smartsteps-health.timer', key: 'smartsteps-health.timer', displayName: 'Health Check Timer', type: 'timer' },
  { name: 'unattended-upgrades', key: 'unattended-upgrades', displayName: 'Auto Security Updates', type: 'system' },
]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const services = SERVICE_LIST.map(svc => {
    const active = (svc as any).isPm2 ? isPm2AppOnline() : isActive(svc.key)
    return {
      name: svc.name,
      displayName: svc.displayName,
      type: svc.type,
      active,
      status: active ? 'active' : 'inactive',
    }
  })

  return NextResponse.json({ services })
}
