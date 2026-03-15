/**
 * Script to move ALL timesheet entries forward by one day
 * 
 * This fixes timesheets where dates were stored incorrectly due to timezone issues.
 * All entries will be moved forward by one day (Saturday -> Sunday, Sunday -> Monday, etc.)
 * 
 * Run with: npx tsx scripts/move-all-timesheet-entries-forward-one-day.ts
 */

import { PrismaClient } from '@prisma/client'
import { addDays, format } from 'date-fns'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'

const prisma = new PrismaClient()

async function moveAllEntriesForward() {
  console.log('🔍 Finding all timesheet entries...\n')

  // Get all timesheets with their entries
  const allTimesheets = await prisma.timesheet.findMany({
    where: {
      deletedAt: null,
    },
    include: {
      entries: {
        orderBy: { date: 'asc' },
      },
    },
  })

  console.log(`Found ${allTimesheets.length} timesheets\n`)

  const entriesToUpdate: Array<{
    entryId: string
    timesheetId: string
    currentDate: Date
    newDate: Date
    currentDateStr: string
    newDateStr: string
  }> = []

  // Process each timesheet
  for (const timesheet of allTimesheets) {
    const timesheetTimezone = timesheet.timezone || 'America/New_York'
    
    for (const entry of timesheet.entries) {
      // Get the current date in the timesheet's timezone
      const currentZoned = utcToZonedTime(entry.date, timesheetTimezone)
      const currentDateStr = format(currentZoned, 'yyyy-MM-dd EEEE')
      
      // Move forward by one day
      const newZoned = addDays(currentZoned, 1)
      const newDateStr = format(newZoned, 'yyyy-MM-dd EEEE')
      
      // Convert back to UTC for storage
      const newUtc = zonedTimeToUtc(newZoned, timesheetTimezone)
      
      entriesToUpdate.push({
        entryId: entry.id,
        timesheetId: timesheet.id,
        currentDate: entry.date,
        newDate: newUtc,
        currentDateStr: currentDateStr,
        newDateStr: newDateStr,
      })
    }
  }

  console.log(`📊 Found ${entriesToUpdate.length} entries to update\n`)

  if (entriesToUpdate.length === 0) {
    console.log('✅ No entries found. Nothing to update!')
    await prisma.$disconnect()
    return
  }

  // Show first 10 entries as examples
  console.log('First 10 entries to update:')
  entriesToUpdate.slice(0, 10).forEach(({ currentDateStr, newDateStr, timesheetId }) => {
    console.log(`  Timesheet ${timesheetId}: ${currentDateStr} -> ${newDateStr}`)
  })

  // Show summary by timesheet
  console.log('\nSummary by timesheet:')
  const byTimesheet = new Map<string, number>()
  for (const { timesheetId } of entriesToUpdate) {
    const count = byTimesheet.get(timesheetId) || 0
    byTimesheet.set(timesheetId, count + 1)
  }
  
  for (const [timesheetId, count] of byTimesheet.entries()) {
    const timesheet = allTimesheets.find(t => t.id === timesheetId)
    console.log(`  Timesheet ${timesheetId} (${timesheet?.isBCBA ? 'BCBA' : 'Regular'}): ${count} entries`)
  }

  console.log('\n⚠️  About to update ALL entries forward by one day.')
  console.log('This will change dates in the database.')
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Update entries
  let updated = 0
  let errors = 0

  for (const { entryId, newDate, currentDateStr, newDateStr } of entriesToUpdate) {
    try {
      await prisma.timesheetEntry.update({
        where: { id: entryId },
        data: { date: newDate },
      })
      updated++
      if (updated % 50 === 0) {
        console.log(`  Updated ${updated}/${entriesToUpdate.length} entries...`)
      }
    } catch (error) {
      console.error(`❌ Error updating entry ${entryId} (${currentDateStr} -> ${newDateStr}):`, error)
      errors++
    }
  }

  console.log(`\n✅ Updated ${updated} entries forward by one day`)
  if (errors > 0) {
    console.log(`❌ ${errors} errors occurred`)
  }

  // Also update timesheet start/end dates forward by one day
  console.log('\n🔄 Updating timesheet start/end dates forward by one day...')
  
  let timesheetsUpdated = 0
  let timesheetErrors = 0

  for (const timesheet of allTimesheets) {
    const timesheetTimezone = timesheet.timezone || 'America/New_York'
    
    try {
      // Get current dates in timezone
      const startZoned = utcToZonedTime(timesheet.startDate, timesheetTimezone)
      const endZoned = utcToZonedTime(timesheet.endDate, timesheetTimezone)
      
      // Move forward by one day
      const newStartZoned = addDays(startZoned, 1)
      const newEndZoned = addDays(endZoned, 1)
      
      // Convert back to UTC
      const newStartUtc = zonedTimeToUtc(newStartZoned, timesheetTimezone)
      const newEndUtc = zonedTimeToUtc(newEndZoned, timesheetTimezone)
      
      await prisma.timesheet.update({
        where: { id: timesheet.id },
        data: {
          startDate: newStartUtc,
          endDate: newEndUtc,
        },
      })
      
      timesheetsUpdated++
    } catch (error) {
      console.error(`❌ Error updating timesheet ${timesheet.id}:`, error)
      timesheetErrors++
    }
  }

  console.log(`✅ Updated ${timesheetsUpdated} timesheet start/end dates forward by one day`)
  if (timesheetErrors > 0) {
    console.log(`❌ ${timesheetErrors} errors occurred`)
  }

  await prisma.$disconnect()
}

// Run the script
moveAllEntriesForward()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
