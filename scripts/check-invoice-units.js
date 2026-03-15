// Try to load .env if it exists, but don't fail if dotenv is not available
try {
  require('dotenv').config()
} catch (e) {
  // dotenv not available, assume environment variables are already set
}

const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

const prisma = new PrismaClient()

/**
 * Convert minutes to units
 * Formula: Units = (Minutes / 60) × 4 = Hours × 4
 */
function minutesToUnits(minutes) {
  if (minutes <= 0) return 0
  const hours = minutes / 60
  const units = hours * 4
  return Math.round(units * 100) / 100
}

/**
 * Format invoice number for display (I-XXXX from INV-YYYY-XXXX)
 */
function formatInvoiceNumberForDisplay(invoiceNumber) {
  if (!invoiceNumber) return invoiceNumber
  
  if (/^I-\d+$/.test(invoiceNumber)) {
    return invoiceNumber
  }
  
  const match = invoiceNumber.match(/^INV-\d{4}-(\d+)$/)
  if (match) {
    const sequence = match[1]
    return `I-${sequence}`
  }
  
  const fallbackMatch = invoiceNumber.match(/(\d+)$/)
  if (fallbackMatch) {
    return `I-${fallbackMatch[1]}`
  }
  
  return invoiceNumber
}

/**
 * Parse display format to full invoice number
 */
function parseInvoiceNumber(displayNumber) {
  // I-0052 -> INV-2026-0052
  const match = displayNumber.match(/^I-(\d+)$/)
  if (match) {
    const sequence = match[1]
    const year = new Date().getFullYear()
    return `INV-${year}-${sequence.padStart(4, '0')}`
  }
  return displayNumber
}

async function checkInvoiceUnits(invoiceDisplayNumber) {
  try {
    // Convert I-0052 to INV-2026-0052
    const fullInvoiceNumber = parseInvoiceNumber(invoiceDisplayNumber)
    console.log(`Looking for invoice: ${fullInvoiceNumber} (display: ${invoiceDisplayNumber})`)
    
    const invoice = await prisma.invoice.findUnique({
      where: {
        invoiceNumber: fullInvoiceNumber,
      },
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
        timesheets: {
          include: {
            entries: true,
          },
        },
      },
    })

    if (!invoice) {
      console.log(`Invoice ${fullInvoiceNumber} not found`)
      return
    }

    console.log(`\n=== Invoice ${invoiceDisplayNumber} ===`)
    console.log(`Status: ${invoice.status}`)
    console.log(`Period: ${invoice.startDate.toISOString().split('T')[0]} to ${invoice.endDate.toISOString().split('T')[0]}`)
    console.log(`Total Amount: $${invoice.totalAmount}`)
    console.log(`\nInvoice Entries: ${invoice.entries.length}`)
    console.log(`Linked Timesheets: ${invoice.timesheets.length}`)

    // Method 1: Calculate from unique timesheet entries (correct way)
    console.log(`\n--- Method 1: From Unique Timesheet Entries ---`)
    const uniqueTimesheets = new Map()
    invoice.timesheets.forEach(ts => {
      if (!uniqueTimesheets.has(ts.id)) {
        uniqueTimesheets.set(ts.id, ts)
      }
    })

    let totalMinutes = 0
    let totalUnits = 0
    const entriesByDate = new Map()

    uniqueTimesheets.forEach((timesheet) => {
      timesheet.entries.forEach(entry => {
        const dateKey = entry.date.toISOString().split('T')[0]
        const minutes = entry.minutes || 0
        const units = minutesToUnits(minutes)
        
        totalMinutes += minutes
        totalUnits += units

        if (!entriesByDate.has(dateKey)) {
          entriesByDate.set(dateKey, { minutes: 0, units: 0, count: 0 })
        }
        const dateEntry = entriesByDate.get(dateKey)
        dateEntry.minutes += minutes
        dateEntry.units += units
        dateEntry.count += 1
      })
    })

    console.log(`Unique Timesheets: ${uniqueTimesheets.size}`)
    console.log(`Total Timesheet Entries: ${Array.from(uniqueTimesheets.values()).reduce((sum, ts) => sum + ts.entries.length, 0)}`)
    console.log(`Total Minutes: ${totalMinutes}`)
    console.log(`Total Units: ${totalUnits.toFixed(2)}`)
    console.log(`\nEntries by Date:`)
    Array.from(entriesByDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([date, data]) => {
        console.log(`  ${date}: ${data.count} entries, ${data.minutes} min, ${data.units.toFixed(2)} units`)
      })

    // Method 2: Calculate from InvoiceEntry records (may have duplicates)
    console.log(`\n--- Method 2: From InvoiceEntry Records (may have duplicates) ---`)
    let invoiceEntryMinutes = 0
    let invoiceEntryUnits = 0
    const invoiceEntryByDate = new Map()

    invoice.entries.forEach(invoiceEntry => {
      if (invoiceEntry.timesheet && invoiceEntry.timesheet.entries) {
        invoiceEntry.timesheet.entries.forEach(entry => {
          const dateKey = entry.date.toISOString().split('T')[0]
          const minutes = entry.minutes || 0
          const units = minutesToUnits(minutes)
          
          invoiceEntryMinutes += minutes
          invoiceEntryUnits += units

          if (!invoiceEntryByDate.has(dateKey)) {
            invoiceEntryByDate.set(dateKey, { minutes: 0, units: 0, count: 0 })
          }
          const dateEntry = invoiceEntryByDate.get(dateKey)
          dateEntry.minutes += minutes
          dateEntry.units += units
          dateEntry.count += 1
        })
      }
    })

    console.log(`InvoiceEntry Records: ${invoice.entries.length}`)
    console.log(`Total Minutes (from InvoiceEntries): ${invoiceEntryMinutes}`)
    console.log(`Total Units (from InvoiceEntries): ${invoiceEntryUnits.toFixed(2)}`)
    
    if (invoiceEntryMinutes !== totalMinutes || invoiceEntryUnits !== totalUnits) {
      console.log(`\n⚠️  WARNING: Duplicate counting detected!`)
      console.log(`   Difference in minutes: ${invoiceEntryMinutes - totalMinutes}`)
      console.log(`   Difference in units: ${(invoiceEntryUnits - totalUnits).toFixed(2)}`)
      console.log(`   This suggests InvoiceEntry records are duplicating timesheet entries.`)
    }

    // Method 3: Sum from InvoiceEntry units field
    console.log(`\n--- Method 3: Sum InvoiceEntry.units Field ---`)
    const sumFromInvoiceEntries = invoice.entries.reduce((sum, entry) => {
      return sum + parseFloat(entry.units.toString())
    }, 0)
    console.log(`Sum of InvoiceEntry.units: ${sumFromInvoiceEntries.toFixed(2)}`)

    console.log(`\n=== Summary ===`)
    console.log(`Expected Units (from unique timesheets): ${totalUnits.toFixed(2)}`)
    console.log(`InvoiceEntry sum: ${sumFromInvoiceEntries.toFixed(2)}`)
    console.log(`Current display calculation: ${invoiceEntryUnits.toFixed(2)} (WRONG - has duplicates)`)
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Get invoice number from command line
const invoiceNumber = process.argv[2] || 'I-0052'
checkInvoiceUnits(invoiceNumber)
