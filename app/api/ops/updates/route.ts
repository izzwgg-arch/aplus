import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

function run(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 8000, shell: '/bin/bash' as any }).toString().trim()
  } catch {
    return 'unknown'
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const securityUpdatesRaw = run("apt list --upgradable 2>/dev/null | grep -c 'security' || echo 0")
  const securityUpdatesCount = parseInt(securityUpdatesRaw) || 0

  const nodeVersion = run('node -v 2>/dev/null')
  const npmVersion = run('npm -v 2>/dev/null')
  const postgresVersion = run("psql --version 2>/dev/null | head -1")
  const nginxVersion = run('nginx -v 2>&1 | head -1')
  const pm2Version = run('pm2 -v 2>/dev/null')
  const osName = run('lsb_release -d 2>/dev/null | cut -d: -f2- | xargs')
  const kernelVersion = run('uname -r 2>/dev/null')
  const prismaVersion = run('cd /var/www/aplus-center && npx prisma -v 2>/dev/null | grep "prisma" | head -1 || echo "unknown"')

  return NextResponse.json({
    securityUpdatesCount,
    nodeVersion,
    npmVersion,
    prismaVersion,
    postgresVersion,
    nginxVersion,
    pm2Version,
    osName,
    kernelVersion,
  })
}
