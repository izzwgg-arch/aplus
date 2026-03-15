import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserPermissions } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await getUserPermissions(session.user.id)

    // Convert to object format for easier frontend access
    const permissionsObj: Record<string, any> = {}
    Object.keys(permissions).forEach((name) => {
      permissionsObj[name] = {
        canView: permissions[name]?.canView || false,
        canCreate: permissions[name]?.canCreate || false,
        canUpdate: permissions[name]?.canUpdate || false,
        canDelete: permissions[name]?.canDelete || false,
        canApprove: permissions[name]?.canApprove || false,
        canExport: permissions[name]?.canExport || false,
      }
    })

    return NextResponse.json({
      permissions: permissionsObj,
      role: session.user.role,
    })
  } catch (error: any) {
    console.error('Error fetching user permissions:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch permissions' },
      { status: 500 }
    )
  }
}
