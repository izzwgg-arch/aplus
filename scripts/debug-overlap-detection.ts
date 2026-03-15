/**
 * Debug script to check what timesheets are being detected for overlap
 * Run with: npx tsx scripts/debug-overlap-detection.ts
 */

import { PrismaClient } from '@prisma/client'
import { utcToZonedTime, format } from 'date-fns-tz'

const prisma = new PrismaClient()

async function debugOverlap() {
  // Example: Check for overlaps on 2026-01-12 for Provider Blimie Weiss and Client Yeshaye Tabak
  const checkDate = '2026-01-12'
  const providerName = 'Blimie Weiss'
  const clientName = 'Yeshaye Tabak'
  const timeRange = { start: '20:30', end: '22:00' } // 8:30 PM - 10:00 PM

  console.log('='.repeat(80))
  console.log('DEBUGGING OVERLAP DETECTION')
  console.log('='.repeat(80))
  console.log(`Date: ${checkDate}`)
  console.log(`Provider: ${providerName}`)
  console.log(`Client: ${clientName}`)
  console.log(`Time Range: ${timeRange.start} - ${timeRange.end}`)
  console.log('')

  // Find provider and client
  const provider = await prisma.provider.findFirst({
    where: { name: { contains: providerName, mode: 'insensitive' } },
  })
  const client = await prisma.client.findFirst({
    where: { name: { contains: clientName, mode: 'insensitive' } },
  })

  if (!provider) {
    console.log(`❌ Provider "${providerName}" not found`)
    return
  }
  if (!client) {
    console.log(`❌ Client "${clientName}" not found`)
    return
  }

  console.log(`✅ Found Provider: ${provider.id} - ${provider.name}`)
  console.log(`✅ Found Client: ${client.id} - ${client.name}`)
  console.log('')

  // Parse date range for query
  const NY_TIMEZONE = 'America/New_York'
  const { zonedTimeToUtc } = await import('date-fns-tz')
  const startOfDayNY = zonedTimeToUtc(`${checkDate}T00:00:00`, NY_TIMEZONE)
  const endOfDayNY = zonedTimeToUtc(`${checkDate}T23:59:59`, NY_TIMEZONE)

  // Query for existing entries (same as overlap detection)
  const existing = await prisma.timesheetEntry.findMany({
    where: {
      date: {
        gte: new Date(startOfDayNY.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(endOfDayNY.getTime() + 24 * 60 * 60 * 1000),
      },
      timesheet: {
        deletedAt: null,
        OR: [{ providerId: provider.id }, { clientId: client.id }],
      },
    },
    include: {
      timesheet: {
        select: {
          id: true,
          providerId: true,
          clientId: true,
          deletedAt: true,
          provider: { select: { name: true } },
          client: { select: { name: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
  })

  console.log(`Found ${existing.length} existing entries in date range`)
  console.log('')

  // Filter to same date in NY timezone
  const sameDateEntries = existing.filter((ex) => {
    const exDateInNY = utcToZonedTime(ex.date, NY_TIMEZONE)
    const exDate = format(exDateInNY, 'yyyy-MM-dd')
    return exDate === checkDate
  })

  console.log(`Entries on ${checkDate} (NY timezone): ${sameDateEntries.length}`)
  console.log('')

  if (sameDateEntries.length === 0) {
    console.log('✅ No entries found on this date - no overlap should be detected')
    return
  }

  // Check for time overlaps
  function parseHHMMToMinutes(hhmm: string): number | null {
    if (!hhmm) return null
    const match = hhmm.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/)
    if (!match) return null
    const h = Number(match[1])
    const m = Number(match[2])
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  }

  function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
    return startA < endB && startB < endA
  }

  const checkStart = parseHHMMToMinutes(timeRange.start)
  const checkEnd = parseHHMMToMinutes(timeRange.end)

  if (checkStart === null || checkEnd === null) {
    console.log('❌ Invalid time range')
    return
  }

  console.log('Checking for time overlaps:')
  console.log(`  Checking: ${timeRange.start} - ${timeRange.end} (${checkStart} - ${checkEnd} minutes)`)
  console.log('')

  const overlappingEntries = sameDateEntries.filter((ex) => {
    const exStart = parseHHMMToMinutes(ex.startTime)
    const exEnd = parseHHMMToMinutes(ex.endTime)
    if (exStart === null || exEnd === null) return false
    return rangesOverlap(checkStart, checkEnd, exStart, exEnd)
  })

  if (overlappingEntries.length === 0) {
    console.log('✅ No time overlaps found')
    console.log('')
    console.log('All entries on this date:')
    sameDateEntries.forEach((ex) => {
      const exDateInNY = utcToZonedTime(ex.date, NY_TIMEZONE)
      const exDate = format(exDateInNY, 'yyyy-MM-dd')
      console.log(`  - Timesheet ${ex.timesheet.id}: ${ex.startTime} - ${ex.endTime} (${ex.notes || 'UNKNOWN'})`)
      console.log(`    Provider: ${ex.timesheet.provider?.name || 'N/A'}, Client: ${ex.timesheet.client?.name || 'N/A'}`)
      console.log(`    Deleted: ${ex.timesheet.deletedAt ? 'YES' : 'NO'}`)
      console.log(`    Date in DB (UTC): ${ex.date.toISOString()}`)
      console.log(`    Date in NY: ${exDate}`)
      console.log('')
    })
  } else {
    console.log(`⚠️  Found ${overlappingEntries.length} overlapping entries:`)
    overlappingEntries.forEach((ex) => {
      const exDateInNY = utcToZonedTime(ex.date, NY_TIMEZONE)
      const exDate = format(exDateInNY, 'yyyy-MM-dd')
      console.log(`  - Timesheet ${ex.timesheet.id}: ${ex.startTime} - ${ex.endTime} (${ex.notes || 'UNKNOWN'})`)
      console.log(`    Provider: ${ex.timesheet.provider?.name || 'N/A'}, Client: ${ex.timesheet.client?.name || 'N/A'}`)
      console.log(`    Deleted: ${ex.timesheet.deletedAt ? 'YES ⚠️' : 'NO'}`)
      console.log(`    Date in DB (UTC): ${ex.date.toISOString()}`)
      console.log(`    Date in NY: ${exDate}`)
      console.log('')
    })
  }

  // Also check for deleted timesheets that might be causing issues
  const deletedTimesheets = await prisma.timesheet.findMany({
    where: {
      deletedAt: { not: null },
      OR: [{ providerId: provider.id }, { clientId: client.id }],
    },
    include: {
      entries: {
        where: {
          date: {
            gte: new Date(startOfDayNY.getTime() - 24 * 60 * 60 * 1000),
            lte: new Date(endOfDayNY.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      },
    },
  })

  if (deletedTimesheets.length > 0) {
    console.log('')
    console.log(`⚠️  Found ${deletedTimesheets.length} DELETED timesheets with entries in this date range:`)
    deletedTimesheets.forEach((ts) => {
      const entriesOnDate = ts.entries.filter((e) => {
        const eDateInNY = utcToZonedTime(e.date, NY_TIMEZONE)
        const eDate = format(eDateInNY, 'yyyy-MM-dd')
        return eDate === checkDate
      })
      if (entriesOnDate.length > 0) {
        console.log(`  - Deleted Timesheet ${ts.id} (deleted at: ${ts.deletedAt})`)
        console.log(`    Has ${entriesOnDate.length} entries on ${checkDate}`)
        entriesOnDate.forEach((e) => {
          console.log(`      Entry: ${e.startTime} - ${e.endTime} (${e.notes || 'UNKNOWN'})`)
        })
      }
    })
  }

  await prisma.$disconnect()
}

debugOverlap().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
