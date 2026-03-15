import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const fileName = file.name.toLowerCase()
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
    const isCsv = fileName.endsWith('.csv')

    if (!isExcel && !isCsv) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload .csv, .xls, or .xlsx' },
        { status: 400 }
      )
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let data: any[] = []
    let columns: string[] = []

    if (isExcel) {
      // Parse Excel file
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      data = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' })
      
      if (data.length > 0) {
        columns = Object.keys(data[0] || {})
      }
    } else if (isCsv) {
      // Parse CSV file using XLSX (it can read CSV)
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      data = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' })
      
      if (data.length > 0) {
        columns = Object.keys(data[0] || {})
      }
    }

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: 'File is empty or invalid' },
        { status: 400 }
      )
    }

    // Preview first 50 rows (increased from 10) with parsing analysis
    // NOTE: All rows will be imported, this is just for preview
    const previewRows = data.slice(0, 50).map((row, index) => {
      const normalizedRow: any = {}
      const issues: string[] = []

      columns.forEach(col => {
        normalizedRow[col] = row[col] || ''
      })

      // Check for parsing issues
      if (!normalizedRow[Object.keys(normalizedRow)[0]]) {
        issues.push('First column is empty')
      }

      return {
        rowIndex: index + 1,
        raw: normalizedRow,
        issues,
      }
    })

    return NextResponse.json({
      columns,
      totalRows: data.length,
      previewRows,
      fileName: file.name,
    })
  } catch (error: any) {
    console.error('Error previewing import file:', error)
    return NextResponse.json(
      { error: 'Failed to preview file', details: error.message },
      { status: 500 }
    )
  }
}
