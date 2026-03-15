import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Backfill script to grant all payroll permissions to ADMIN role
 * This ensures existing Admin accounts can access Payroll Management immediately
 */
async function seedPayrollPermissions() {
  console.log('🔧 Backfilling payroll permissions for ADMIN role...')
  
  try {
    // Get all payroll permissions
    const payrollPermissions = await prisma.permission.findMany({
      where: {
        category: 'payroll',
      },
    })

    console.log(`📋 Found ${payrollPermissions.length} payroll permissions`)

    // Get ADMIN role (or all roles with name containing "admin" case-insensitive)
    const adminRoles = await prisma.role.findMany({
      where: {
        OR: [
          { name: { equals: 'Admin', mode: 'insensitive' } },
          { name: { equals: 'Administrator', mode: 'insensitive' } },
        ],
        active: true,
      },
    })

    if (adminRoles.length === 0) {
      console.log('⚠️  No ADMIN role found. Checking for roles with admin-like names...')
      const allRoles = await prisma.role.findMany({
        where: { active: true },
      })
      console.log(`Found ${allRoles.length} active roles:`, allRoles.map(r => r.name))
      
      // If no admin role found, grant to all active roles as fallback
      // Or create a default admin role
      console.log('ℹ️  Skipping role-based backfill. Permissions will be granted via getUserPermissions() for ADMIN users.')
      return
    }

    let totalGrants = 0

    for (const role of adminRoles) {
      console.log(`\n👤 Processing role: ${role.name} (${role.id})`)
      
      for (const perm of payrollPermissions) {
        // Check if permission already exists
        const existing = await prisma.rolePermission.findUnique({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: perm.id,
            },
          },
        })

        if (existing) {
          // Update to ensure all flags are true
          await prisma.rolePermission.update({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: perm.id,
              },
            },
            data: {
              canView: true,
              canCreate: true,
              canUpdate: true,
              canDelete: false, // Keep delete false for safety
              canApprove: true,
              canExport: true,
            },
          })
          console.log(`  ✅ Updated: ${perm.name}`)
        } else {
          // Create new permission grant
          await prisma.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: perm.id,
              canView: true,
              canCreate: true,
              canUpdate: true,
              canDelete: false,
              canApprove: true,
              canExport: true,
            },
          })
          console.log(`  ➕ Created: ${perm.name}`)
        }
        totalGrants++
      }
    }

    // Also grant dashboard.payroll permission
    const dashboardPayrollPerm = await prisma.permission.findUnique({
      where: { name: 'dashboard.payroll' },
    })

    if (dashboardPayrollPerm) {
      for (const role of adminRoles) {
        const existing = await prisma.rolePermission.findUnique({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: dashboardPayrollPerm.id,
            },
          },
        })

        if (existing) {
          await prisma.rolePermission.update({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: dashboardPayrollPerm.id,
              },
            },
            data: {
              canView: true,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
              canApprove: false,
              canExport: false,
            },
          })
        } else {
          await prisma.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: dashboardPayrollPerm.id,
              canView: true,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
              canApprove: false,
              canExport: false,
            },
          })
        }
        totalGrants++
      }
    }

    console.log(`\n✅ Successfully granted ${totalGrants} payroll permissions to ${adminRoles.length} admin role(s)`)
    console.log('✅ Admin users will now have full access to Payroll Management')
  } catch (error) {
    console.error('❌ Error backfilling payroll permissions:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seedPayrollPermissions()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
