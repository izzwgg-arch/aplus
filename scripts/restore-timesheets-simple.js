const { PrismaClient } = require('@prisma/client')
const { execSync } = require('child_process')
const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('RESTORE TIMESHEETS FROM DATABASE BACKUP')
  console.log('='.repeat(80))
  console.log('')

  const backupPath = process.argv[2]

  if (!backupPath) {
    console.error('❌ Please provide the backup file path')
    console.error('')
    console.error('Usage: node restore-timesheets-simple.js <backup-file-path>')
    console.error('')
    console.error('Example:')
    console.error('  node restore-timesheets-simple.js /path/to/backup.sql')
    console.error('  node restore-timesheets-simple.js /path/to/backup.dump')
    process.exit(1)
  }

  console.log(`Backup file: ${backupPath}`)
  console.log('')

  // Deleted user IDs from the deletion
  const deletedUserIds = [
    'cmk3k4kl9000nqq64cis7p2ho',
    'cmk3l6fqm0001zicw23yisqdi',
    'cmk4c6ct9000las18v9lj9h0i',
    'cmkblty02000bmgij4o7chlr8',
    'cmkblq4tb0001mgijs7w3a2ri',
    'cmk3gyrqj0000z6aeqaj3hsqb',
    'cmk4tjskc001asbiapl4k3dp4',
    'cmk6fstqz0001n8vuva2p43ic',
  ]

  console.log('Step 1: Creating temporary database...')
  const tempDbName = `apluscenter_restore_${Date.now()}`
  
  try {
    // Create temp database
    execSync(`createdb ${tempDbName} 2>&1`, { stdio: 'inherit' })
    console.log(`✓ Created temporary database: ${tempDbName}`)
    console.log('')

    // Restore backup
    console.log('Step 2: Restoring backup to temporary database...')
    if (backupPath.endsWith('.dump')) {
      execSync(`pg_restore -d ${tempDbName} ${backupPath} 2>&1`, { stdio: 'inherit' })
    } else {
      execSync(`psql -d ${tempDbName} -f ${backupPath} 2>&1`, { stdio: 'inherit' })
    }
    console.log('✓ Backup restored')
    console.log('')

    // Connect to temp database
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/apluscenter'
    const tempDbUrl = dbUrl.replace(/\/[^\/]+$/, `/${tempDbName}`)
    
    const tempPrisma = new PrismaClient({
      datasources: {
        db: { url: tempDbUrl }
      }
    })

    console.log('Step 3: Extracting timesheets from backup...')
    
    // Get timesheets from backup that belong to deleted users
    const backupTimesheets = await tempPrisma.timesheet.findMany({
      where: {
        userId: { in: deletedUserIds },
      },
      include: {
        entries: true,
      },
    })

    console.log(`Found ${backupTimesheets.length} timesheets from deleted users in backup`)
    console.log('')

    if (backupTimesheets.length === 0) {
      console.log('No timesheets found in backup for deleted users.')
      await tempPrisma.$disconnect()
      execSync(`dropdb ${tempDbName} 2>&1`, { stdio: 'inherit' })
      await prisma.$disconnect()
      return
    }

    // Check which ones don't exist in current database
    const existingTimesheets = await prisma.timesheet.findMany({
      where: {
        id: { in: backupTimesheets.map(t => t.id) },
      },
      select: { id: true },
    })

    const existingIds = new Set(existingTimesheets.map(t => t.id))
    const missingTimesheets = backupTimesheets.filter(t => !existingIds.has(t.id))

    console.log(`Timesheets in backup: ${backupTimesheets.length}`)
    console.log(`Already exist in current DB: ${existingTimesheets.length}`)
    console.log(`Missing (need to restore): ${missingTimesheets.length}`)
    console.log('')

    if (missingTimesheets.length === 0) {
      console.log('✓ All timesheets from backup already exist in current database')
      await tempPrisma.$disconnect()
      execSync(`dropdb ${tempDbName} 2>&1`, { stdio: 'inherit' })
      await prisma.$disconnect()
      return
    }

    // Find admin user for reassignment
    const adminUser = await prisma.user.findFirst({
      where: {
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
        deletedAt: null,
        active: true,
      },
      select: { id: true, email: true },
    })

    if (!adminUser) {
      console.error('❌ ERROR: No active admin user found!')
      await tempPrisma.$disconnect()
      execSync(`dropdb ${tempDbName} 2>&1`, { stdio: 'inherit' })
      await prisma.$disconnect()
      process.exit(1)
    }

    console.log(`Step 4: Restoring ${missingTimesheets.length} timesheets...`)
    console.log(`Reassigning to admin user: ${adminUser.email} (${adminUser.id})`)
    console.log('')

    let restoredCount = 0
    let entriesRestored = 0
    const restoredIds = []
    const failedIds = []

    for (const ts of missingTimesheets) {
      try {
        // Create timesheet
        await prisma.timesheet.create({
          data: {
            id: ts.id,
            userId: adminUser.id,
            providerId: ts.providerId,
            clientId: ts.clientId,
            bcbaId: ts.bcbaId,
            insuranceId: ts.insuranceId,
            isBCBA: ts.isBCBA,
            serviceType: ts.serviceType,
            sessionData: ts.sessionData,
            status: ts.status,
            startDate: ts.startDate,
            endDate: ts.endDate,
            timezone: ts.timezone,
            rejectionReason: ts.rejectionReason,
            approvedAt: ts.approvedAt,
            rejectedAt: ts.rejectedAt,
            queuedAt: ts.queuedAt,
            emailedAt: ts.emailedAt,
            lastEditedBy: ts.lastEditedBy,
            lastEditedAt: ts.lastEditedAt,
            createdAt: ts.createdAt,
            updatedAt: ts.updatedAt,
            deletedAt: null,
          },
        })

        // Restore entries
        if (ts.entries.length > 0) {
          await prisma.timesheetEntry.createMany({
            data: ts.entries.map(entry => ({
              id: entry.id,
              timesheetId: entry.timesheetId,
              date: entry.date,
              startTime: entry.startTime,
              endTime: entry.endTime,
              minutes: entry.minutes,
              units: entry.units,
              notes: entry.notes,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
            })),
            skipDuplicates: true,
          })
          entriesRestored += ts.entries.length
        }

        restoredCount++
        restoredIds.push(ts.id)
        console.log(`  ✓ Restored ${ts.id} (${ts.entries.length} entries, status: ${ts.status})`)
      } catch (error) {
        console.error(`  ❌ Failed to restore ${ts.id}:`, error.message)
        failedIds.push({ id: ts.id, error: error.message })
      }
    }

    console.log('')
    console.log('='.repeat(80))
    console.log('RESTORATION SUMMARY')
    console.log('='.repeat(80))
    console.log(`Total timesheets in backup: ${backupTimesheets.length}`)
    console.log(`Already existed: ${existingTimesheets.length}`)
    console.log(`Successfully restored: ${restoredCount}`)
    console.log(`Timesheet entries restored: ${entriesRestored}`)
    console.log(`Failed: ${failedIds.length}`)
    console.log('')

    if (restoredIds.length > 0) {
      console.log('Restored timesheet IDs:')
      restoredIds.forEach(id => console.log(`  - ${id}`))
    }

    if (failedIds.length > 0) {
      console.log('')
      console.log('Failed timesheet IDs:')
      failedIds.forEach(({ id, error }) => console.log(`  - ${id}: ${error}`))
    }

    await tempPrisma.$disconnect()
    
    // Clean up
    console.log('')
    console.log('Cleaning up temporary database...')
    execSync(`dropdb ${tempDbName} 2>&1`, { stdio: 'inherit' })
    console.log('✓ Done')
  } catch (error) {
    console.error('❌ Error:', error.message)
    // Try to clean up
    try {
      execSync(`dropdb ${tempDbName} 2>&1`, { stdio: 'ignore' })
    } catch {}
  }

  await prisma.$disconnect()
}

main().catch(console.error)
