import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logCreate, logUpdate } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const roles = await prisma.role.findMany({
      where: { 
        deletedAt: null,
        active: true  // Only return active roles
      },
      include: {
        permissions: {
          include: {
            permission: true
          }
        },
        _count: {
          select: { users: true }
        }
      },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ roles })
  } catch (error) {
    console.error('Error fetching roles:', error)
    return NextResponse.json(
      { error: 'Failed to fetch roles' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    const { 
      name, 
      description, 
      active, 
      permissions, 
      dashboardVisibility, 
      timesheetVisibility,
      canViewCommunityClasses,
      canViewCommunityClassesClasses,
      canViewCommunityClassesClients,
      canViewCommunityClassesInvoices,
      canViewCommunityClassesEmailQueue,
      communityEmailQueueView,
      communityEmailQueueSendNow,
      communityEmailQueueSchedule,
      communityEmailQueueAttachPdf,
      communityEmailQueueDelete,
    } = data

    if (!name) {
      return NextResponse.json(
        { error: 'Role name is required' },
        { status: 400 }
      )
    }

    // Check if role already exists
    const existing = await prisma.role.findUnique({
      where: { name }
    })

    if (existing && !existing.deletedAt) {
      return NextResponse.json(
        { error: 'Role with this name already exists' },
        { status: 400 }
      )
    }

    // Create role with permissions and dashboard visibility
    const permissionsData = (permissions || []).map((p: any) => ({
      permissionId: p.permissionId,
      canView: p.canView || false,
      canCreate: p.canCreate || false,
      canUpdate: p.canUpdate || false,
      canDelete: p.canDelete || false,
      canApprove: p.canApprove || false,
      canExport: p.canExport || false,
    }))

    const dashboardVisibilityData = (dashboardVisibility || []).map((dv: any) => ({
      section: dv.section,
      visible: dv.visible || false,
    }))

    const timesheetVisibilityData = Array.isArray(timesheetVisibility) && timesheetVisibility.length > 0
      ? timesheetVisibility.map((userId: string) => ({ userId }))
      : []

    const role = await prisma.role.create({
      data: {
        name,
        description: description || null,
        active: active !== undefined ? active : true,
        // Community Classes permissions
        canViewCommunityClasses: canViewCommunityClasses || false,
        canViewCommunityClassesClasses: canViewCommunityClassesClasses || false,
        canViewCommunityClassesClients: canViewCommunityClassesClients || false,
        canViewCommunityClassesInvoices: canViewCommunityClassesInvoices || false,
        canViewCommunityClassesEmailQueue: canViewCommunityClassesEmailQueue || false,
        // Community Email Queue granular permissions
        communityEmailQueueView: communityEmailQueueView || false,
        communityEmailQueueSendNow: communityEmailQueueSendNow || false,
        communityEmailQueueSchedule: communityEmailQueueSchedule || false,
        communityEmailQueueAttachPdf: communityEmailQueueAttachPdf || false,
        communityEmailQueueDelete: communityEmailQueueDelete || false,
        ...(permissionsData.length > 0 && {
          permissions: {
            create: permissionsData
          }
        }),
        ...(dashboardVisibilityData.length > 0 && {
          dashboardVisibility: {
            create: dashboardVisibilityData
          }
        }),
        ...(timesheetVisibilityData.length > 0 && {
          timesheetVisibility: {
            create: timesheetVisibilityData
          }
        })
      },
      include: {
        permissions: {
          include: {
            permission: true
          }
        },
        dashboardVisibility: true,
        timesheetVisibility: {
          include: {
            user: {
              select: { id: true, username: true, email: true }
            }
          }
        }
      }
    })

    await logCreate('Role', role.id, session.user.id, {
      name: role.name,
      description: role.description,
    })

    return NextResponse.json(role, { status: 201 })
  } catch (error: any) {
    console.error('Error creating role:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    return NextResponse.json(
      { 
        error: 'Failed to create role',
        details: error?.message || String(error)
      },
      { status: 500 }
    )
  }
}
