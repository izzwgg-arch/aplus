const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const { execSync } = require('child_process')
const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('RESTORE TIMESHEETS FROM DATABASE BACKUP')
  console.log('='.repeat(80))
  console.log('')

  // Get backup file path from command line argument
  const backupPath = process.argv[2]

  if (!backupPath) {
    console.error('Usage: node restore-timesheets-from-backup.js <backup-file-path>')
    console.error('')
    console.error('Example: node restore-timesheets-from-backup.js /path/to/backup.sql')
    process.exit(1)
  }

  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Backup file not found: ${backupPath}`)
    process.exit(1)
  }

  console.log(`Backup file: ${backupPath}`)
  console.log(`File size: ${(fs.statSync(backupPath).size / 1024 / 1024).toFixed(2)} MB`)
  console.log('')

  // Check if it's a SQL file or a custom dump
  const isSQL = backupPath.endsWith('.sql')
  const isDump = backupPath.endsWith('.dump')

  if (!isSQL && !isDump) {
    console.log('⚠️  Warning: File extension not recognized. Assuming SQL format.')
  }

  console.log('Step 1: Extracting timesheet data from backup...')
  console.log('')

  // For SQL files, we'll extract timesheet INSERT statements
  // For dump files, we'd need to restore to a temp database first
  let timesheetData = []

  if (isSQL || backupPath.endsWith('.sql')) {
    console.log('Reading SQL backup file...')
    const sqlContent = fs.readFileSync(backupPath, 'utf8')
    
    // Extract Timesheet table data
    // Look for INSERT INTO "Timesheet" statements
    const timesheetInsertRegex = /INSERT INTO "Timesheet" \([^)]+\) VALUES\s*\(([^)]+)\)/gi
    const matches = [...sqlContent.matchAll(timesheetInsertRegex)]
    
    console.log(`Found ${matches.length} timesheet INSERT statements in backup`)
    
    // Also check for COPY format (pg_dump custom format)
    if (matches.length === 0) {
      console.log('No INSERT statements found. Checking for COPY format...')
      // COPY format is harder to parse, we might need to restore to temp DB
    }

    // For now, let's try a different approach - restore to a temporary database
    console.log('')
    console.log('Step 2: Creating temporary database to extract data...')
    
    const tempDbName = `apluscenter_restore_${Date.now()}`
    
    try {
      // Create temp database
      execSync(`createdb ${tempDbName}`, { stdio: 'inherit' })
      console.log(`✓ Created temporary database: ${tempDbName}`)
      
      // Restore backup to temp database
      console.log('Restoring backup to temporary database...')
      if (isDump) {
        execSync(`pg_restore -d ${tempDbName} ${backupPath}`, { stdio: 'inherit' })
      } else {
        execSync(`psql -d ${tempDbName} -f ${backupPath}`, { stdio: 'inherit' })
      }
      console.log('✓ Backup restored to temporary database')
      
      // Query timesheets from temp database
      console.log('')
      console.log('Step 3: Extracting timesheet data from temporary database...')
      
      const tempPrisma = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL?.replace(/\/[^\/]+$/, `/${tempDbName}`) || `postgresql://postgres:postgres@localhost:5432/${tempDbName}`
          }
        }
      })

      // Get deleted user IDs
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

      if (missingTimesheets.length > 0) {
        console.log('Missing timesheets to restore:')
        missingTimesheets.forEach(ts => {
          console.log(`  - ${ts.id}: Created ${ts.createdAt}, Status: ${ts.status}, Entries: ${ts.entries.length}, UserId: ${ts.userId}`)
        })
        console.log('')

        // Find admin user for reassignment
        const adminUser = await prisma.user.findFirst({
          where: {
            role: { in: ['ADMIN', 'SUPER_ADMIN'] },
            deletedAt: null,
            active: true,
          },
          select: { id: true },
        })

        if (!adminUser) {
          console.error('❌ ERROR: No active admin user found!')
          await tempPrisma.$disconnect()
          await prisma.$disconnect()
          execSync(`dropdb ${tempDbName}`, { stdio: 'inherit' })
          process.exit(1)
        }

        console.log(`Step 4: Restoring ${missingTimesheets.length} timesheets...`)
        console.log(`Reassigning to admin user: ${adminUser.id}`)
        console.log('')

        let restoredCount = 0
        const restoredIds = []

        for (const ts of missingTimesheets) {
          try {
            // Create timesheet with admin user
            const restored = await prisma.timesheet.create({
              data: {
                id: ts.id,
                userId: adminUser.id, // Reassign to admin
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
                deletedAt: null, // Ensure not deleted
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
            }

            restoredCount++
            restoredIds.push(ts.id)
            console.log(`  ✓ Restored timesheet ${ts.id} (${ts.entries.length} entries)`)
          } catch (error) {
            console.error(`  ❌ Failed to restore timesheet ${ts.id}:`, error.message)
          }
        }

        console.log('')
        console.log('='.repeat(80))
        console.log('RESTORATION SUMMARY')
        console.log('='.repeat(80))
        console.log(`Total timesheets in backup: ${backupTimesheets.length}`)
        console.log(`Already existed: ${existingTimesheets.length}`)
        console.log(`Successfully restored: ${restoredCount}`)
        console.log(`Failed: ${missingTimesheets.length - restoredCount}`)
        console.log('')

        if (restoredIds.length > 0) {
          console.log('Restored timesheet IDs:')
          restoredIds.forEach(id => console.log(`  - ${id}`))
        }
      } else {
        console.log('✓ All timesheets from backup already exist in current database')
      }

      await tempPrisma.$disconnect()
      
      // Clean up temp database
      console.log('')
      console.log('Cleaning up temporary database...')
      execSync(`dropdb ${tempDbName}`, { stdio: 'inherit' })
      console.log('✓ Temporary database removed')
    } catch (error) {
      console.error('❌ Error during restoration:', error.message)
      // Try to clean up temp database
      try {
        execSync(`dropdb ${tempDbName}`, { stdio: 'ignore' })
      } catch {}
    }
  } else {
    console.error('❌ Unsupported backup format. Please provide a .sql or .dump file.')
  }

  await prisma.$disconnect()
}

main().catch(console.error)
