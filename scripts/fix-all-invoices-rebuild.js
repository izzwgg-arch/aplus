/**
 * Fix All Invoices: Rebuild from timesheet entries
 * 
 * Problem: InvoiceEntry records have incorrect units or duplicates
 * Solution: Delete all InvoiceEntry records and rebuild from timesheet entries within date range
 * 
 * Run on server: node scripts/fix-all-invoices-rebuild.js
 */

const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

const prisma = new PrismaClient()

// CORRECT billing function: hours × 4
function minutesToUnits(minutes) {
  if (minutes <= 0) return 0
  const hours = minutes / 60
  const units = hours * 4
  return Math.round(units * 100) / 100
}

function calculateEntryTotals(entryMinutes, entryNotes, ratePerUnit, isRegularTimesheet) {
  const units = minutesToUnits(entryMinutes)
  const rate = ratePerUnit instanceof Decimal ? ratePerUnit : new Decimal(ratePerUnit)
  const isSV = entryNotes === 'SV'
  
  const amount = (isRegularTimesheet && isSV)
    ? new Decimal(0)
    : new Decimal(units).times(rate)
  
  return { units, amount }
}

async function fixAllInvoices() {
  console.log('Starting invoice rebuild from timesheet entries...\n')

  try {
    const invoices = await prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        entries: {
          include: {
            timesheet: {
              include: {
                entries: true,
              },
            },
            provider: true,
          },
        },
        client: {
          include: {
            insurance: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    console.log(`Found ${invoices.length} invoices\n`)

    let fixedCount = 0
    let skippedCount = 0

    for (const invoice of invoices) {
      try {
        const insurance = invoice.client?.insurance
        if (!insurance) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: No insurance`)
          skippedCount++
          continue
        }

        // Determine if this is a BCBA invoice
        const isBCBATimesheet = invoice.entries.some(e => e.timesheet?.isBCBA === true)
        const ratePerUnit = isBCBATimesheet
          ? (insurance.bcbaRatePerUnit 
              ? new Decimal(insurance.bcbaRatePerUnit.toString())
              : new Decimal(insurance.ratePerUnit.toString()))
          : (insurance.regularRatePerUnit 
              ? new Decimal(insurance.regularRatePerUnit.toString())
              : new Decimal(insurance.ratePerUnit.toString()))

        if (ratePerUnit.toNumber() <= 0) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: Invalid rate`)
          skippedCount++
          continue
        }

        // Get ALL timesheets for this client that overlap with invoice date range
        // Then extend the date range to include all entries from those timesheets
        const invoiceStartDate = new Date(invoice.startDate)
        let invoiceEndDate = new Date(invoice.endDate)
        
        const allClientTimesheets = await prisma.timesheet.findMany({
          where: {
            clientId: invoice.clientId,
            startDate: { lte: invoiceEndDate },
            endDate: { gte: invoiceStartDate },
            deletedAt: null,
            status: { in: ['APPROVED', 'EMAILED'] }
          },
          include: {
            entries: true,
            provider: true
          }
        })

        // Extend invoice end date to include all entries from linked timesheets
        // This ensures we don't miss entries that are outside the original date range
        allClientTimesheets.forEach((timesheet) => {
          if (timesheet.entries && timesheet.entries.length > 0) {
            timesheet.entries.forEach((tsEntry) => {
              const entryDate = new Date(tsEntry.date)
              if (entryDate >= invoiceStartDate && entryDate > invoiceEndDate) {
                invoiceEndDate = entryDate
              }
            })
          }
        })

        // Collect all timesheet entries within invoice date range
        const allTimesheetEntries = []
        
        allClientTimesheets.forEach((timesheet) => {
          if (timesheet.entries && timesheet.entries.length > 0) {
            timesheet.entries.forEach((tsEntry) => {
              const entryDate = new Date(tsEntry.date)
              if (entryDate >= invoiceStartDate && entryDate <= invoiceEndDate) {
                allTimesheetEntries.push({ entry: tsEntry, timesheet })
              }
            })
          }
        })

        if (allTimesheetEntries.length === 0) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: No timesheet entries in date range`)
          skippedCount++
          continue
        }

        // Debug: log how many entries we found
        if (invoice.invoiceNumber === 'INV-2026-0052') {
          console.log(`\n🔍 Debug ${invoice.invoiceNumber}:`)
          console.log(`   Timesheets found: ${allClientTimesheets.length}`)
          console.log(`   Total entries: ${allTimesheetEntries.length}`)
        }

        // Group timesheet entries by date+provider to match invoice display
        // The display shows one entry per date, but if multiple providers have entries on the same date,
        // we need to create one InvoiceEntry per date (using the first provider's entry)
        const entriesByDate = new Map()
        
        // Sort entries by date and provider to ensure consistent ordering
        allTimesheetEntries.sort((a, b) => {
          const dateA = new Date(a.entry.date).getTime()
          const dateB = new Date(b.entry.date).getTime()
          if (dateA !== dateB) return dateA - dateB
          // If same date, sort by provider name for consistency
          const providerA = a.timesheet.provider?.name || ''
          const providerB = b.timesheet.provider?.name || ''
          return providerA.localeCompare(providerB)
        })
        
        for (const { entry: tsEntry, timesheet } of allTimesheetEntries) {
          const entryDate = new Date(tsEntry.date)
          const dateKey = entryDate.toISOString().split('T')[0]
          
          if (!entriesByDate.has(dateKey)) {
            const providerId = timesheet.providerId || timesheet.provider?.id
            entriesByDate.set(dateKey, {
              date: dateKey,
              timesheetId: timesheet.id,
              providerId: providerId,
              insuranceId: insurance.id,
              drMinutes: 0,
              svMinutes: 0,
              drUnits: 0,
              svUnits: 0,
            })
          }
          
          const dateEntry = entriesByDate.get(dateKey)
          
          // Only use the FIRST entry of each type (DR or SV) per date
          // This matches how the display works - it shows one entry per date
          if (tsEntry.notes === 'SV') {
            // Only set if we don't already have an SV entry for this date
            if (dateEntry.svMinutes === 0) {
              const { units } = calculateEntryTotals(
                tsEntry.minutes,
                tsEntry.notes,
                ratePerUnit,
                !timesheet.isBCBA
              )
              dateEntry.svMinutes = tsEntry.minutes
              dateEntry.svUnits = units
            }
          } else {
            // Only set if we don't already have a DR entry for this date
            if (dateEntry.drMinutes === 0) {
              const { units } = calculateEntryTotals(
                tsEntry.minutes,
                tsEntry.notes,
                ratePerUnit,
                !timesheet.isBCBA
              )
              dateEntry.drMinutes = tsEntry.minutes
              dateEntry.drUnits = units
            }
          }
        }
        
        if (invoice.invoiceNumber === 'INV-2026-0052') {
          console.log(`   Dates found: ${entriesByDate.size}`)
          entriesByDate.forEach((entry, date) => {
            console.log(`   ${date}: DR=${entry.drUnits.toFixed(2)}, SV=${entry.svUnits.toFixed(2)}, Total=${(entry.drUnits + entry.svUnits).toFixed(2)}`)
          })
        }

        // Create one InvoiceEntry per date with aggregated units
        let totalRecalculatedAmount = new Decimal(0)
        let totalRecalculatedUnits = 0
        const newInvoiceEntries = []

        for (const [dateKey, dateEntry] of entriesByDate) {
          const totalUnits = dateEntry.drUnits + dateEntry.svUnits
          // For regular timesheets: SV units = $0, so only DR units are charged
          // For BCBA timesheets: All units are charged
          const billableUnits = isBCBATimesheet 
            ? totalUnits 
            : dateEntry.drUnits
          const amount = new Decimal(billableUnits).times(ratePerUnit)

          newInvoiceEntries.push({
            timesheetId: dateEntry.timesheetId,
            providerId: dateEntry.providerId,
            insuranceId: dateEntry.insuranceId,
            units: new Decimal(totalUnits), // Total units for display
            rate: ratePerUnit.toNumber(),
            amount: amount, // Only billable amount
          })

          totalRecalculatedAmount = totalRecalculatedAmount.plus(amount)
          totalRecalculatedUnits += totalUnits // Total units for display
        }

        const oldTotal = invoice.totalAmount.toNumber()
        const newTotal = totalRecalculatedAmount.toNumber()
        const oldUnits = invoice.entries.reduce((sum, e) => sum + parseFloat(e.units.toString()), 0)
        const oldEntryCount = invoice.entries.length
        const newEntryCount = newInvoiceEntries.length
        const difference = Math.abs(newTotal - oldTotal)

        // Check if anything changed (entry count, units, or total)
        const hasChanges = oldEntryCount !== newEntryCount || 
                          Math.abs(oldUnits - totalRecalculatedUnits) > 0.01 || 
                          difference > 0.01

        if (!hasChanges) {
          console.log(`✓ ${invoice.invoiceNumber}: Already correct (${oldTotal.toFixed(2)})`)
          skippedCount++
          continue
        }

        console.log(`\n🔧 Fixing ${invoice.invoiceNumber}:`)
        console.log(`   Old Units: ${oldUnits.toFixed(2)} → New Units: ${totalRecalculatedUnits.toFixed(2)}`)
        console.log(`   Old Total: $${oldTotal.toFixed(2)} → New Total: $${newTotal.toFixed(2)}`)
        console.log(`   Entries: ${invoice.entries.length} → ${newInvoiceEntries.length}`)
        console.log(`   Dates: ${entriesByDate.size}`)

        // Rebuild invoice entries
        await prisma.$transaction(async (tx) => {
          // Delete all existing invoice entries
          await tx.invoiceEntry.deleteMany({
            where: { invoiceId: invoice.id },
          })

          // Create new entries from recalculated data
          if (newInvoiceEntries.length > 0) {
            await tx.invoiceEntry.createMany({
              data: newInvoiceEntries.map(e => ({
                invoiceId: invoice.id,
                timesheetId: e.timesheetId,
                providerId: e.providerId,
                insuranceId: e.insuranceId,
                units: e.units,
                rate: e.rate,
                amount: e.amount,
              })),
            })
          }

          // Update invoice totals
          const newOutstanding = totalRecalculatedAmount
            .minus(invoice.paidAmount || 0)
            .plus(invoice.adjustments || 0)

          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              totalAmount: totalRecalculatedAmount,
              outstanding: newOutstanding,
            },
          })
        })

        console.log(`   ✅ Fixed`)
        fixedCount++

      } catch (error) {
        console.error(`❌ Error fixing ${invoice.invoiceNumber}:`, error.message)
        skippedCount++
      }
    }

    console.log(`\n✅ Fixed: ${fixedCount}`)
    console.log(`⚠️  Skipped: ${skippedCount}`)
    console.log(`\nDone!`)

  } catch (error) {
    console.error('Fatal error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

fixAllInvoices()
