const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    const import_ = await prisma.payrollImport.findFirst({
      orderBy: { uploadedAt: 'desc' },
      include: {
        rows: {
          orderBy: { rowIndex: 'asc' },
          take: 5
        }
      }
    })

    if (!import_) {
      console.log('No imports found')
      return
    }

    console.log('=== LATEST IMPORT ===')
    console.log('ID:', import_.id)
    console.log('File:', import_.originalFileName)
    const totalRows = await prisma.payrollImportRow.count({
      where: { importId: import_.id }
    })
    console.log('Total Rows:', totalRows)

    console.log('\n=== COLUMN MAPPING ===')
    console.log(JSON.stringify(import_.mappingJson, null, 2))

    if (import_.rows.length > 0) {
      const firstRow = import_.rows[0]
      const raw = firstRow.rawJson

      console.log('\n=== DETECTED COLUMNS ===')
      Object.keys(raw).forEach((col, i) => {
        console.log(`${i + 1}. "${col}"`)
      })

      console.log('\n=== FIRST ROW RAW DATA ===')
      console.log(JSON.stringify(raw, null, 2))

      console.log('\n=== FIRST 3 ROWS COMPARISON ===')
      import_.rows.slice(0, 3).forEach((r, i) => {
        console.log(`\nRow ${i + 1} (Index ${r.rowIndex}):`)
        const raw = r.rawJson
        const mapping = import_.mappingJson
        const inCol = mapping.inTime
        const outCol = mapping.outTime
        console.log(`  IN Time Column (${inCol}):`, raw[inCol])
        console.log(`  OUT Time Column (${outCol}):`, raw[outCol])
        console.log(`  Parsed IN:`, r.inTime)
        console.log(`  Parsed OUT:`, r.outTime)
        console.log(`  Hours:`, r.hoursWorked)
      })
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
