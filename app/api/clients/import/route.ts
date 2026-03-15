import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
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

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { raw: false })

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'Excel file is empty or invalid' }, { status: 400 })
    }

    // Get all insurances for lookup
    const insurances = await prisma.insurance.findMany({
      where: { deletedAt: null, active: true },
    })
    const insuranceMap = new Map(insurances.map(ins => [ins.name.toLowerCase(), ins.id]))

    const results = {
      success: 0,
      errors: [] as string[],
    }

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any
      const rowNum = i + 2 // +2 because Excel rows start at 1 and we have a header

      try {
        // Normalize column names (case-insensitive, handle spaces)
        const normalizedRow: any = {}
        Object.keys(row).forEach(key => {
          const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '')
          normalizedRow[normalizedKey] = row[key]
        })

        // Extract values
        const name = normalizedRow.name || normalizedRow.clientname || normalizedRow['client name']
        const email = normalizedRow.email || normalizedRow.emailaddress || normalizedRow['email address']
        const phone = normalizedRow.phone || normalizedRow.phonenumber || normalizedRow['phone number']
        const insuranceName = normalizedRow.insurance || normalizedRow.insurancename || normalizedRow['insurance name']
        const active = normalizedRow.active !== undefined 
          ? String(normalizedRow.active).toLowerCase() === 'true' || normalizedRow.active === '1' || normalizedRow.active === 1
          : true

        // Validate required fields
        if (!name || !name.toString().trim()) {
          results.errors.push(`Row ${rowNum}: Name is required`)
          continue
        }

        if (!insuranceName || !insuranceName.toString().trim()) {
          results.errors.push(`Row ${rowNum}: Insurance is required`)
          continue
        }

        // Find insurance by name (case-insensitive)
        const insuranceId = insuranceMap.get(insuranceName.toString().trim().toLowerCase())
        if (!insuranceId) {
          results.errors.push(`Row ${rowNum}: Insurance "${insuranceName}" not found`)
          continue
        }

        // Create client
        await prisma.client.create({
          data: {
            name: name.toString().trim(),
            email: email ? email.toString().trim() : null,
            phone: phone ? phone.toString().trim() : null,
            insuranceId,
            active,
          },
        })

        results.success++
      } catch (error: any) {
        results.errors.push(`Row ${rowNum}: ${error.message || 'Failed to create client'}`)
      }
    }

    return NextResponse.json(results)
  } catch (error: any) {
    console.error('Error importing clients:', error)
    return NextResponse.json(
      { error: 'Failed to import clients', details: error.message },
      { status: 500 }
    )
  }
}
