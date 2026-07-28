/**
 * Renumber all existing invoices to the new YYYYMM-XXXX format.
 *
 * Invoices are sorted by createdAt ASC and assigned sequential numbers
 * starting at 202604-0001.  The last existing invoice will have a sequence
 * number ≤ 0214, so the next NEW invoice correctly starts at 202604-0215.
 *
 * Usage (dry run):  npx tsx scripts/renumber-invoices.ts --dry-run
 * Usage (apply):    npx tsx scripts/renumber-invoices.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const invoices = await prisma.invoice.findMany({
    select: { id: true, invoiceNumber: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${invoices.length} invoice(s) to renumber.`)

  if (invoices.length === 0) {
    console.log('Nothing to do.')
    return
  }

  // Build new numbers using each invoice's own creation month
  const updates: { id: string; oldNumber: string; newNumber: string }[] = []

  // Track per-month counters so numbers stay sequential within each month
  // but we also want a single global sequence ≥ 1 so new invoices land at 0215+
  // Strategy: use a global counter, embed YYYYMM of the invoice's createdAt
  let globalSeq = 0

  for (const inv of invoices) {
    globalSeq++
    const d = inv.createdAt
    const prefix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    const newNumber = `${prefix}-${String(globalSeq).padStart(4, '0')}`
    updates.push({ id: inv.id, oldNumber: inv.invoiceNumber, newNumber })
  }

  // Print preview
  console.log('\n── Preview (old → new) ─────────────────────────────────')
  for (const u of updates) {
    console.log(`  ${u.oldNumber.padEnd(22)} →  ${u.newNumber}`)
  }
  console.log(`────────────────────────────────────────────────────────`)
  console.log(`Last sequence used: ${globalSeq}  (next new invoice → seq ${globalSeq + 1})`)

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes written.')
    return
  }

  // Apply updates one at a time (invoiceNumber has a @unique constraint,
  // so we use a temporary placeholder to avoid collisions mid-run)
  console.log('\nApplying updates…')

  // Step 1: rename all to tmp_ + id to free the unique slots
  for (const u of updates) {
    await prisma.invoice.update({
      where: { id: u.id },
      data: { invoiceNumber: `tmp_${u.id}` },
    })
  }

  // Step 2: assign the real new numbers
  for (const u of updates) {
    await prisma.invoice.update({
      where: { id: u.id },
      data: { invoiceNumber: u.newNumber },
    })
    console.log(`  ✓ ${u.oldNumber}  →  ${u.newNumber}`)
  }

  console.log(`\nDone — ${updates.length} invoice(s) renumbered.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
