import { prisma } from '../lib/prisma'

/**
 * Backfill invoicedAt and invoiceId for all timesheets that are linked to invoices
 * via InvoiceEntry but don't have invoicedAt set.
 * 
 * This script ensures that historical invoiced timesheets appear in the archive.
 */
async function backfillInvoicedTimesheets() {
  console.log('Starting backfill of invoiced timesheets...')

  try {
    // First, check if the columns exist by trying a simple query
    // If they don't exist, we'll use raw SQL to find and update timesheets
    let columnsExist = false
    try {
      await prisma.$queryRaw`SELECT "invoicedAt" FROM "Timesheet" LIMIT 1`
      columnsExist = true
    } catch (error: any) {
      if (error.message?.includes('column "invoicedAt" does not exist')) {
        console.log('Columns do not exist yet. Running migration...')
        // Run the migration SQL
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "invoicedAt" TIMESTAMP(3);
          ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;
          CREATE INDEX IF NOT EXISTS "Timesheet_invoicedAt_idx" ON "Timesheet"("invoicedAt");
          CREATE INDEX IF NOT EXISTS "Timesheet_invoiceId_idx" ON "Timesheet"("invoiceId");
        `)
        // Try to add foreign key if it doesn't exist
        try {
          await prisma.$executeRawUnsafe(`
            ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_invoiceId_fkey" 
            FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          `)
        } catch (fkError: any) {
          if (!fkError.message?.includes('already exists')) {
            console.log('Foreign key may already exist, continuing...')
          }
        }
        // Regenerate Prisma client
        const { execSync } = require('child_process')
        execSync('npx prisma generate', { stdio: 'inherit' })
        columnsExist = true
      } else {
        throw error
      }
    }

    // Find all timesheets that have invoice entries but don't have invoicedAt set
    // Use raw SQL query to avoid Prisma client issues
    const timesheetsWithInvoiceEntries = await prisma.$queryRaw<Array<{
      id: string
      invoiceEntries: Array<{
        invoiceId: string
        invoiceCreatedAt: Date
        invoiceDeletedAt: Date | null
      }>
    }>>`
      SELECT 
        t.id,
        json_agg(
          json_build_object(
            'invoiceId', ie."invoiceId",
            'invoiceCreatedAt', i."createdAt",
            'invoiceDeletedAt', i."deletedAt"
          )
        ) FILTER (WHERE ie.id IS NOT NULL) as "invoiceEntries"
      FROM "Timesheet" t
      LEFT JOIN "InvoiceEntry" ie ON ie."timesheetId" = t.id
      LEFT JOIN "Invoice" i ON i.id = ie."invoiceId"
      WHERE t."deletedAt" IS NULL
        AND (t."invoicedAt" IS NULL OR t."invoiceId" IS NULL)
        AND ie.id IS NOT NULL
      GROUP BY t.id
      HAVING COUNT(ie.id) > 0
    `

    console.log(`Found ${timesheetsWithInvoiceEntries.length} timesheets to backfill`)

    if (timesheetsWithInvoiceEntries.length === 0) {
      console.log('No timesheets need backfilling. Exiting.')
      return
    }

    let updated = 0
    let skipped = 0

    // Process each timesheet
    for (const row of timesheetsWithInvoiceEntries) {
      const timesheetId = row.id
      const invoiceEntries = Array.isArray(row.invoiceEntries) ? row.invoiceEntries : []
      
      // Get all non-deleted invoices that reference this timesheet
      const validInvoices = invoiceEntries
        .filter((entry: any) => entry.invoiceDeletedAt === null)
        .map((entry: any) => ({
          id: entry.invoiceId,
          createdAt: new Date(entry.invoiceCreatedAt),
        }))

      if (validInvoices.length === 0) {
        console.log(`Skipping timesheet ${timesheetId} - all linked invoices are deleted`)
        skipped++
        continue
      }

      // Use the earliest invoice (by createdAt) as the primary invoice
      const primaryInvoice = validInvoices.reduce((earliest, current) => {
        return current.createdAt < earliest.createdAt ? current : earliest
      })

      // Update the timesheet using raw SQL to avoid Prisma client issues
      await prisma.$executeRawUnsafe(`
        UPDATE "Timesheet"
        SET "invoicedAt" = $1::timestamp, "invoiceId" = $2
        WHERE id = $3
      `, primaryInvoice.createdAt, primaryInvoice.id, timesheetId)

      updated++
      console.log(
        `Updated timesheet ${timesheetId} - linked to invoice ${primaryInvoice.id} (created ${primaryInvoice.createdAt.toISOString()})`
      )
    }

    console.log(`\nBackfill complete:`)
    console.log(`  - Updated: ${updated}`)
    console.log(`  - Skipped: ${skipped}`)
    console.log(`  - Total processed: ${timesheetsWithInvoiceEntries.length}`)
  } catch (error) {
    console.error('Error during backfill:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the backfill
backfillInvoicedTimesheets()
  .then(() => {
    console.log('Backfill completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Backfill failed:', error)
    process.exit(1)
  })
