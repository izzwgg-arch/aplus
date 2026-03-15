/**
 * Assign Timesheet IDs to Existing Timesheets
 * 
 * This script assigns sequential IDs to all existing timesheets:
 * - Regular timesheets: T-1001, T-1002, etc.
 * - BCBA timesheets: BT-1001, BT-1002, etc.
 * 
 * The script is idempotent - it can be run multiple times safely.
 * It will skip timesheets that already have IDs assigned.
 * 
 * Run: node scripts/assign-timesheet-ids.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function formatTimesheetNumber(sequence, isBCBA) {
  const prefix = isBCBA ? 'BT' : 'T'
  return `${prefix}-${String(sequence).padStart(4, '0')}`
}

async function assignTimesheetIds() {
  console.log('Starting timesheet ID assignment...\n')

  try {
    // Get all non-deleted timesheets, ordered by creation date
    const allTimesheets = await prisma.timesheet.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        timesheetNumber: true,
        isBCBA: true,
        createdAt: true,
      },
    })

    console.log(`Found ${allTimesheets.length} timesheets to process\n`)

    // Separate regular and BCBA timesheets
    const regularTimesheets = allTimesheets.filter(ts => !ts.isBCBA)
    const bcbaTimesheets = allTimesheets.filter(ts => ts.isBCBA)

    console.log(`Regular timesheets: ${regularTimesheets.length}`)
    console.log(`BCBA timesheets: ${bcbaTimesheets.length}\n`)

    let regularSequence = 1001
    let bcbaSequence = 1001
    let assignedCount = 0
    let skippedCount = 0

    // Process regular timesheets
    console.log('Processing regular timesheets...')
    for (const timesheet of regularTimesheets) {
      if (timesheet.timesheetNumber) {
        console.log(`  ✓ ${timesheet.id}: Already has ID ${timesheet.timesheetNumber}`)
        skippedCount++
        continue
      }

      const timesheetNumber = formatTimesheetNumber(regularSequence, false)
      
      try {
        await prisma.timesheet.update({
          where: { id: timesheet.id },
          data: { timesheetNumber },
        })
        
        console.log(`  ✅ ${timesheet.id}: Assigned ${timesheetNumber}`)
        assignedCount++
        regularSequence++
      } catch (error) {
        if (error.code === 'P2002') {
          // Unique constraint violation - ID already exists, try next
          console.log(`  ⚠️  ${timesheet.id}: ${timesheetNumber} already exists, trying next...`)
          regularSequence++
          // Retry with next sequence
          const retryNumber = formatTimesheetNumber(regularSequence, false)
          await prisma.timesheet.update({
            where: { id: timesheet.id },
            data: { timesheetNumber: retryNumber },
          })
          console.log(`  ✅ ${timesheet.id}: Assigned ${retryNumber} (retry)`)
          assignedCount++
          regularSequence++
        } else {
          console.error(`  ❌ ${timesheet.id}: Error - ${error.message}`)
        }
      }
    }

    // Process BCBA timesheets
    console.log('\nProcessing BCBA timesheets...')
    for (const timesheet of bcbaTimesheets) {
      if (timesheet.timesheetNumber) {
        console.log(`  ✓ ${timesheet.id}: Already has ID ${timesheet.timesheetNumber}`)
        skippedCount++
        continue
      }

      const timesheetNumber = formatTimesheetNumber(bcbaSequence, true)
      
      try {
        await prisma.timesheet.update({
          where: { id: timesheet.id },
          data: { timesheetNumber },
        })
        
        console.log(`  ✅ ${timesheet.id}: Assigned ${timesheetNumber}`)
        assignedCount++
        bcbaSequence++
      } catch (error) {
        if (error.code === 'P2002') {
          // Unique constraint violation - ID already exists, try next
          console.log(`  ⚠️  ${timesheet.id}: ${timesheetNumber} already exists, trying next...`)
          bcbaSequence++
          // Retry with next sequence
          const retryNumber = formatTimesheetNumber(bcbaSequence, true)
          await prisma.timesheet.update({
            where: { id: timesheet.id },
            data: { timesheetNumber: retryNumber },
          })
          console.log(`  ✅ ${timesheet.id}: Assigned ${retryNumber} (retry)`)
          assignedCount++
          bcbaSequence++
        } else {
          console.error(`  ❌ ${timesheet.id}: Error - ${error.message}`)
        }
      }
    }

    console.log(`\n✅ Assignment complete!`)
    console.log(`   Assigned: ${assignedCount}`)
    console.log(`   Skipped: ${skippedCount}`)
    console.log(`   Next regular ID: ${formatTimesheetNumber(regularSequence, false)}`)
    console.log(`   Next BCBA ID: ${formatTimesheetNumber(bcbaSequence, true)}`)

  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

assignTimesheetIds()
