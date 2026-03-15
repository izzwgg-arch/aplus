import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function readLatestImport() {
  try {
    // Get the most recent import
    const latestImport = await prisma.payrollImport.findFirst({
      orderBy: { uploadedAt: 'desc' },
      include: {
        rows: {
          orderBy: { rowIndex: 'asc' },
          take: 20, // First 20 rows
        },
      },
    })

    if (!latestImport) {
      console.log('No imports found')
      return
    }

    console.log('='.repeat(80))
    console.log('LATEST PAYROLL IMPORT')
    console.log('='.repeat(80))
    console.log(`Import ID: ${latestImport.id}`)
    console.log(`File Name: ${latestImport.originalFileName}`)
    console.log(`Uploaded: ${latestImport.uploadedAt}`)
    console.log(`Status: ${latestImport.status}`)
    
    // Get total row count
    const totalRows = await prisma.payrollImportRow.count({
      where: { importId: latestImport.id }
    })
    console.log(`Total Rows: ${totalRows}`)
    
    console.log(`\nColumn Mapping:`)
    console.log(JSON.stringify(latestImport.mappingJson, null, 2))
    console.log('\n' + '='.repeat(80))
    console.log('RAW FILE DATA (First 20 rows)')
    console.log('='.repeat(80))

    // Display raw data from first few rows
    latestImport.rows.forEach((row: any, idx: number) => {
      console.log(`\n--- Row ${row.rowIndex + 1} (Index ${row.rowIndex}) ---`)
      console.log('Raw JSON (original file data):')
      console.log(JSON.stringify(row.rawJson, null, 2))
      console.log('\nParsed Data:')
      console.log(`  Employee: ${row.employeeNameRaw || row.employeeExternalIdRaw || 'N/A'}`)
      console.log(`  Work Date: ${row.workDate}`)
      console.log(`  IN Time: ${row.inTime || 'N/A'}`)
      console.log(`  OUT Time: ${row.outTime || 'N/A'}`)
      console.log(`  Hours: ${row.hoursWorked || 'N/A'}`)
      console.log(`  Minutes: ${row.minutesWorked || 'N/A'}`)
    })

    // Show column names from first row
    if (latestImport.rows.length > 0) {
      const firstRowRaw = latestImport.rows[0].rawJson as any
      console.log('\n' + '='.repeat(80))
      console.log('DETECTED COLUMNS IN FILE:')
      console.log('='.repeat(80))
      const columns = Object.keys(firstRowRaw)
      columns.forEach((col: string, idx: number) => {
        console.log(`${idx + 1}. "${col}"`)
      })
      
      // Show sample values for each column
      console.log('\n' + '='.repeat(80))
      console.log('SAMPLE VALUES FROM FIRST ROW:')
      console.log('='.repeat(80))
      columns.forEach((col: string) => {
        const value = firstRowRaw[col]
        console.log(`  "${col}": ${JSON.stringify(value)} (type: ${typeof value})`)
      })
    }

  } catch (error) {
    console.error('Error reading import:', error)
  } finally {
    await prisma.$disconnect()
  }
}

readLatestImport()
