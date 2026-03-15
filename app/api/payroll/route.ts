import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserPermissions } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'
import { createHash } from 'crypto'

/**
 * POST /api/payroll/import/process
 * 
 * Process imported time logs with column mapping
 * Permission: payroll.import_logs
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await getUserPermissions(session.user.id)
    const canImport = 
                      session.user.role === 'ADMIN' || 
                      session.user.role === 'SUPER_ADMIN'

    if (!canImport) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const mappingJson = formData.get('mapping') as string
    const timezone = formData.get('timezone') as string || 'America/New_York'
    const templateName = formData.get('templateName') as string | null

    if (!file || !mappingJson) {
      return NextResponse.json(
        { error: 'File and mapping are required' },
        { status: 400 }
      )
    }

    const mapping = JSON.parse(mappingJson)
    const { employeeColumn, timestampColumn, dateColumn, timeColumn, eventTypeColumn } = mapping

    if (!employeeColumn) {
      return NextResponse.json(
        { error: 'Employee column mapping is required' },
        { status: 400 }
      )
    }

    if (!timestampColumn && (!dateColumn || !timeColumn)) {
      return NextResponse.json(
        { error: 'Either timestamp column or both date and time columns are required' },
        { status: 400 }
      )
    }

    // Read and parse file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileHash = createHash('sha256').update(buffer).digest('hex')
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))

    let data: any[] = []
    try {
      if (fileExtension === '.csv') {
        const csvText = buffer.toString('utf-8')
        const lines = csvText.split('\n').filter(line => line.trim())
        if (lines.length === 0) {
          return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 })
        }
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
          const row: any = {}
          headers.forEach((header, idx) => {
            row[header] = values[idx] || ''
          })
          data.push(row)
        }
      } else {
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        data = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' })
      }
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to parse file: ${error.message}` },
        { status: 400 }
      )
    }

    // Check if file was already imported
    if (!prisma || !(prisma as any).payrollImport) {
      console.error('[PAYROLL IMPORT] Prisma client or PayrollImport model not available')
      return NextResponse.json(
        { error: 'Database connection error. Please try again.' },
        { status: 500 }
      )
    }

    // Check for existing import by original filename and upload date
    const existingImport = await (prisma as any).payrollImport.findFirst({
      where: { 
        originalFileName: file.name,
        uploadedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Within last 24 hours
        },
      },
    })

    if (existingImport) {
      return NextResponse.json(
        { error: 'This file has already been imported', importId: existingImport.id },
        { status: 400 }
      )
    }

    // Save template if name provided
    let templateId: string | null = null
    if (templateName) {
      const template = await (prisma as any).payrollImportTemplate.create({
        data: {
          name: templateName,
          employeeColumn,
          timestampColumn: timestampColumn || null,
          dateColumn: dateColumn || null,
          timeColumn: timeColumn || null,
          eventTypeColumn: eventTypeColumn || null,
          timezone,
          createdById: session.user.id,
        },
      })
      templateId = template.id
    }

    // Create import record
    const importRecord = await (prisma as any).payrollImport.create({
      data: {
        fileName: file.name,
        fileHash,
        fileSize: file.size,
        rowCount: data.length,
        importedRows: 0,
        skippedRows: 0,
        timezone,
        templateId,
        createdById: session.user.id,
      },
    })

    // Process rows and create time logs
    const timeLogs: Array<{
      employeeCode: string | null
      employeeName: string | null
      timestamp: Date
      eventType: 'IN' | 'OUT' | null
      timezone: string
      importId: string
      fileHash: string
      rowSignature: string
    }> = []

    let importedCount = 0
    let skippedCount = 0

    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      
      try {
        // Extract employee identifier
        const employeeValue = row[employeeColumn]
        if (!employeeValue || String(employeeValue).trim() === '') {
          skippedCount++
          continue
        }

        // Parse timestamp
        let timestamp: Date
        if (timestampColumn) {
          const timestampValue = row[timestampColumn]
          if (!timestampValue) {
            skippedCount++
            continue
          }
          timestamp = new Date(timestampValue)
          if (isNaN(timestamp.getTime())) {
            skippedCount++
            continue
          }
        } else if (dateColumn && timeColumn) {
          const dateValue = row[dateColumn]
          const timeValue = row[timeColumn]
          if (!dateValue || !timeValue) {
            skippedCount++
            continue
          }
          // Combine date and time
          const dateTimeStr = `${dateValue} ${timeValue}`
          timestamp = new Date(dateTimeStr)
          if (isNaN(timestamp.getTime())) {
            skippedCount++
            continue
          }
        } else {
          skippedCount++
          continue
        }

        // Parse event type (optional)
        let eventType: 'IN' | 'OUT' | null = null
        if (eventTypeColumn) {
          const eventValue = String(row[eventTypeColumn] || '').toUpperCase().trim()
          if (eventValue === 'IN' || eventValue === 'OUT') {
            eventType = eventValue as 'IN' | 'OUT'
          }
        }

        // Create row signature for deduplication
        const rowSignature = createHash('sha256')
          .update(`${employeeValue}|${timestamp.toISOString()}|${eventType || ''}`)
          .digest('hex')

        // Check for duplicate
        const existing = await (prisma as any).payrollTimeLog.findFirst({
          where: {
            fileHash,
            rowSignature,
          },
        })

        if (existing) {
          skippedCount++
          continue
        }

        timeLogs.push({
          employeeCode: String(employeeValue).trim(),
          employeeName: String(employeeValue).trim(), // Will be matched later
          timestamp,
          eventType,
          timezone,
          importId: importRecord.id,
          fileHash,
          rowSignature,
        })

        importedCount++
      } catch (error: any) {
        console.error(`Error processing row ${i + 1}:`, error)
        skippedCount++
      }
    }

    // Batch insert time logs
    if (timeLogs.length > 0) {
      await (prisma as any).payrollTimeLog.createMany({
        data: timeLogs,
        skipDuplicates: true,
      })
    }

    // Update import record
    await (prisma as any).payrollImport.update({
      where: { id: importRecord.id },
      data: {
        importedRows: importedCount,
        skippedRows: skippedCount,
      },
    })

    return NextResponse.json({
      importId: importRecord.id,
      importedRows: importedCount,
      skippedRows: skippedCount,
      totalRows: data.length,
    })
  } catch (error: any) {
    console.error('Error processing import:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process import' },
      { status: 500 }
    )
  }
}
