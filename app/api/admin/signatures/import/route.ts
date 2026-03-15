import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import * as XLSX from 'xlsx'
import AdmZip from 'adm-zip'
import { normalizeName, parseName, normalizeFullName } from '@/lib/signature-import/nameMatching'
import { checkLibreOffice, convertEmfToPng, sanitizePath } from '@/lib/signatures/emfConvert'

const requestId = () => `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'signatures')

export async function POST(request: NextRequest) {
  const reqId = requestId()
  console.log(`[SIGNATURE_IMPORT] ${reqId} Starting import`)
  
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      console.log(`[SIGNATURE_IMPORT] ${reqId} Unauthorized`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      console.log(`[SIGNATURE_IMPORT] ${reqId} Forbidden - not admin`)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check LibreOffice availability
    const libreOfficeCheck = await checkLibreOffice()
    if (!libreOfficeCheck.available) {
      console.log(`[SIGNATURE_IMPORT] ${reqId} LibreOffice not available: ${libreOfficeCheck.error}`)
      return NextResponse.json(
        { 
          error: 'LIBREOFFICE_NOT_INSTALLED',
          message: 'Install libreoffice to enable EMF conversion.'
        },
        { status: 500 }
      )
    }
    console.log(`[SIGNATURE_IMPORT] ${reqId} LibreOffice check passed`)

    const formData = await request.formData()
    const excelFile = formData.get('excel') as File | null
    const zipFile = formData.get('zip') as File | null
    const selectedRowsJson = formData.get('selectedRows') as string | null
    const overwriteExisting = formData.get('overwriteExisting') === 'true'
    const createAuditLog = formData.get('createAuditLog') === 'true'

    if (!excelFile || !zipFile || !selectedRowsJson) {
      return NextResponse.json(
        { error: 'Excel file, ZIP file, and selected rows are required' },
        { status: 400 }
      )
    }

    const selectedRows = JSON.parse(selectedRowsJson) as number[]
    if (!Array.isArray(selectedRows) || selectedRows.length === 0) {
      return NextResponse.json(
        { error: 'No rows selected for import' },
        { status: 400 }
      )
    }

    // Validate ZIP file size
    const MAX_ZIP_SIZE = 200 * 1024 * 1024 // 200MB
    const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB per file
    const MAX_FILES = 500

    if (zipFile.size > MAX_ZIP_SIZE) {
      return NextResponse.json(
        { error: 'ZIP_LIMIT_EXCEEDED', message: `ZIP file exceeds ${MAX_ZIP_SIZE / 1024 / 1024}MB limit` },
        { status: 400 }
      )
    }

    // Parse Excel file (same logic as dry-run)
    const excelBuffer = Buffer.from(await excelFile.arrayBuffer())
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' }) as any[]
    const columns = Object.keys(rows[0] || {})

    const firstNameCol = columns.find(c => /first.*name/i.test(c)) || columns.find(c => /first/i.test(c))
    const lastNameCol = columns.find(c => /last.*name/i.test(c)) || columns.find(c => /last/i.test(c))
    const fullNameCol = columns.find(c => /full.*name/i.test(c) || /name/i.test(c) && !firstNameCol && !lastNameCol)
    const signatureFilenameCol = columns.find(c => /signature.*filename/i.test(c) || /filename/i.test(c))

    // Parse ZIP file
    const zipBuffer = Buffer.from(await zipFile.arrayBuffer())
    const zip = new AdmZip(zipBuffer)
    const zipEntries = zip.getEntries()
    const fileEntries = zipEntries.filter(e => !e.isDirectory)
    
    // Validate file count
    if (fileEntries.length > MAX_FILES) {
      return NextResponse.json(
        { error: 'ZIP_LIMIT_EXCEEDED', message: `ZIP contains ${fileEntries.length} files, maximum is ${MAX_FILES}` },
        { status: 400 }
      )
    }

    // Validate individual file sizes
    for (const entry of fileEntries) {
      if (entry.header.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'ZIP_LIMIT_EXCEEDED', message: `File ${entry.entryName} exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
          { status: 400 }
        )
      }
    }

    // Setup temp directories
    const tempBase = join('/tmp', 'signature-import', reqId)
    const tempIn = join(tempBase, 'in')
    const tempOut = join(tempBase, 'out')
    
    try {
      await mkdir(tempIn, { recursive: true })
      await mkdir(tempOut, { recursive: true })
    } catch (error: any) {
      console.error(`[SIGNATURE_IMPORT] ${reqId} Failed to create temp directories:`, error)
      return NextResponse.json(
        { error: 'Failed to create temporary directories' },
        { status: 500 }
      )
    }

    // Extract ZIP files with Zip Slip protection
    const extractedFiles = new Map<string, string>() // original filename -> extracted path
    const emfFiles: Array<{ originalName: string; extractedPath: string }> = []
    
    for (const entry of fileEntries) {
      const sanitized = sanitizePath(entry.entryName, tempIn)
      if (!sanitized) {
        console.warn(`[SIGNATURE_IMPORT] ${reqId} Zip Slip blocked: ${entry.entryName}`)
        continue
      }

      try {
        const data = entry.getData()
        await writeFile(sanitized, data)
        const filename = entry.entryName.split('/').pop() || entry.entryName
        extractedFiles.set(filename, sanitized)
        
        // Track EMF files for conversion
        if (/\.emf$/i.test(filename)) {
          emfFiles.push({ originalName: filename, extractedPath: sanitized })
        }
      } catch (error: any) {
        console.error(`[SIGNATURE_IMPORT] ${reqId} Failed to extract ${entry.entryName}:`, error)
      }
    }

    console.log(`[SIGNATURE_IMPORT] ${reqId} Extracted ${extractedFiles.size} files, ${emfFiles.length} EMF files to convert`)

    // Convert EMF files to PNG
    const convertedFiles = new Map<string, string>() // original name -> converted PNG path
    for (const emfFile of emfFiles) {
      try {
        const result = await convertEmfToPng(emfFile.extractedPath, tempOut, 10000)
        if (result.ok && result.outputPath) {
          convertedFiles.set(emfFile.originalName, result.outputPath)
          console.log(`[SIGNATURE_IMPORT] ${reqId} Converted ${emfFile.originalName} -> ${result.outputPath}`)
        } else {
          console.warn(`[SIGNATURE_IMPORT] ${reqId} Failed to convert ${emfFile.originalName}: ${result.error}`)
        }
      } catch (error: any) {
        console.error(`[SIGNATURE_IMPORT] ${reqId} Error converting ${emfFile.originalName}:`, error)
      }
    }

    // Helper function to extract name from filename (removes prefixes, suffixes, etc.)
    const extractNameFromFilename = (filename: string): string => {
      // Remove extension
      let name = filename.replace(/\.(png|jpg|jpeg|emf)$/i, '')
      
      // Remove numeric prefix (e.g., "01__" or "01_")
      name = name.replace(/^\d+[_\s]+/, '')
      
      // Remove suffix patterns like "__image15" or "_image15" or "-image15"
      name = name.replace(/[_\s-]+image\d+$/i, '')
      name = name.replace(/[_\s-]+img\d+$/i, '')
      name = name.replace(/[_\s-]+\d+$/i, '') // Remove trailing numbers
      
      // Normalize the extracted name
      return normalizeName(name)
    }
    
    // Build image map (normalized) - includes original PNG/JPG and converted PNGs
    const imageMap = new Map<string, { filename: string; path: string; isConverted: boolean }>()
    
    // Add original PNG/JPG/JPEG files
    for (const [filename, path] of extractedFiles.entries()) {
      if (/\.(png|jpg|jpeg)$/i.test(filename)) {
        const normalized = extractNameFromFilename(filename)
        imageMap.set(normalized, { filename, path, isConverted: false })
        // Also add with direct normalization for backward compatibility
        const directNormalized = normalizeName(filename.replace(/\.(png|jpg|jpeg)$/i, ''))
        if (directNormalized !== normalized) {
          imageMap.set(directNormalized, { filename, path, isConverted: false })
        }
      }
    }
    
    // Add converted PNG files (from EMF)
    for (const [originalName, convertedPath] of convertedFiles.entries()) {
      const baseName = originalName.replace(/\.emf$/i, '')
      const normalized = extractNameFromFilename(originalName)
      const pngFilename = `${baseName}.png`
      imageMap.set(normalized, { filename: pngFilename, path: convertedPath, isConverted: true })
      // Also add with direct normalization for backward compatibility
      const directNormalized = normalizeName(baseName)
      if (directNormalized !== normalized) {
        imageMap.set(directNormalized, { filename: pngFilename, path: convertedPath, isConverted: true })
      }
    }

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Create import batch
    const batch = await prisma.signatureImportBatch.create({
      data: {
        createdByUserId: session.user.id,
        type: 'SIGNATURE_IMPORT',
        notes: `Import of ${selectedRows.length} signatures`,
      },
    })

    console.log(`[SIGNATURE_IMPORT] ${reqId} Created batch ${batch.id}`)

    let successCount = 0
    let failedCount = 0
    const errors: string[] = []

    // Process selected rows
    for (const rowIndex of selectedRows) {
      if (rowIndex < 0 || rowIndex >= rows.length) {
        failedCount++
        errors.push(`Row ${rowIndex}: Invalid row index`)
        continue
      }

      const row = rows[rowIndex]
      
      // Extract name (same logic as dry-run)
      let firstName = ''
      let lastName = ''
      let detectedName = ''

      if (fullNameCol && row[fullNameCol]) {
        detectedName = String(row[fullNameCol]).trim()
        const parsed = parseName(detectedName)
        firstName = parsed.firstName
        lastName = parsed.lastName
      } else {
        if (firstNameCol && row[firstNameCol]) {
          firstName = String(row[firstNameCol]).trim()
        }
        if (lastNameCol && row[lastNameCol]) {
          lastName = String(row[lastNameCol]).trim()
        }
        detectedName = `${firstName} ${lastName}`.trim()
      }

      const normalizedName = normalizeFullName(firstName, lastName)

      // Find image
      let imageBuffer: Buffer | null = null
      let imageFilename: string | null = null
      let imagePath: string | null = null

      // Try signature_filename column first
      if (signatureFilenameCol && row[signatureFilenameCol]) {
        const filename = String(row[signatureFilenameCol]).trim()
        const baseName = filename.replace(/\.(png|jpg|jpeg|emf)$/i, '')
        const normalized = normalizeName(baseName)
        const imageInfo = imageMap.get(normalized)
        
        if (imageInfo) {
          imagePath = imageInfo.path
          imageFilename = imageInfo.filename
        } else {
          // Try direct filename match in extracted files
          const extractedPath = extractedFiles.get(filename)
          if (extractedPath) {
            imagePath = extractedPath
            imageFilename = filename
          }
        }
      }

      // Try normalized name match
      if (!imagePath) {
        const imageInfo = imageMap.get(normalizedName)
        if (imageInfo) {
          imagePath = imageInfo.path
          imageFilename = imageInfo.filename
        }
      }

      if (!imagePath) {
        failedCount++
        errors.push(`Row ${rowIndex} (${detectedName}): Image not found`)
        continue
      }

      // Read image buffer from file path
      try {
        imageBuffer = await readFile(imagePath)
      } catch (error: any) {
        failedCount++
        errors.push(`Row ${rowIndex} (${detectedName}): Failed to read image file: ${error.message}`)
        continue
      }

      // Match against database (re-validate server-side)
      const providers = await prisma.provider.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, signature: true },
      })

      const clients = await prisma.client.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, signature: true },
      })

      const matchedProviders = providers.filter(p => normalizeName(p.name) === normalizedName)
      const matchedClients = clients.filter(c => normalizeName(c.name) === normalizedName)

      if (matchedProviders.length > 1 || matchedClients.length > 1 || (matchedProviders.length === 1 && matchedClients.length === 1)) {
        failedCount++
        errors.push(`Row ${rowIndex} (${detectedName}): Ambiguous match`)
        continue
      }

      if (matchedProviders.length === 0 && matchedClients.length === 0) {
        failedCount++
        errors.push(`Row ${rowIndex} (${detectedName}): No profile found`)
        continue
      }

      // Determine entity
      let entityType: 'CLIENT' | 'PROVIDER'
      let entityId: string
      let originalSignatureUrl: string | null = null

      if (matchedProviders.length === 1) {
        entityType = 'PROVIDER'
        entityId = matchedProviders[0].id
        originalSignatureUrl = matchedProviders[0].signature || null

        // Check existing signature
        if (matchedProviders[0].signature && matchedProviders[0].signature.trim().length > 0 && !overwriteExisting) {
          failedCount++
          errors.push(`Row ${rowIndex} (${detectedName}): Signature already exists`)
          continue
        }
      } else {
        entityType = 'CLIENT'
        entityId = matchedClients[0].id
        originalSignatureUrl = matchedClients[0].signature || null

        // Check existing signature
        if (matchedClients[0].signature && matchedClients[0].signature.trim().length > 0 && !overwriteExisting) {
          failedCount++
          errors.push(`Row ${rowIndex} (${detectedName}): Signature already exists`)
          continue
        }
      }

      // Determine file extension (always PNG for converted EMF, or original extension)
      const ext = imageFilename?.match(/\.(png|jpg|jpeg)$/i)?.[1]?.toLowerCase() || 'png'
      const safeExt = ['png', 'jpg', 'jpeg'].includes(ext) ? ext : 'png'

      // Save file
      const entityDir = join(UPLOAD_DIR, entityType.toLowerCase() + 's')
      if (!existsSync(entityDir)) {
        await mkdir(entityDir, { recursive: true })
      }

      const filePath = join(entityDir, `${entityId}.${safeExt}`)
      await writeFile(filePath, imageBuffer)

      const signatureUrl = `/api/admin/signatures/file/${entityType.toLowerCase()}/${entityId}.${safeExt}`

      // Update database
      if (entityType === 'PROVIDER') {
        await prisma.provider.update({
          where: { id: entityId },
          data: { signature: signatureUrl },
        })
      } else {
        await prisma.client.update({
          where: { id: entityId },
          data: { signature: signatureUrl },
        })
      }

      // Create batch item
      await prisma.signatureImportBatchItem.create({
        data: {
          batchId: batch.id,
          entityType,
          entityId,
          originalSignatureUrl,
          newSignatureUrl: signatureUrl,
          status: 'SUCCESS',
        },
      })

      // Create audit log if requested
      if (createAuditLog) {
        await prisma.auditLog.create({
          data: {
            action: 'UPDATE',
            entityType: entityType,
            entityId,
            userId: session.user.id,
            oldValues: JSON.stringify({ signature: originalSignatureUrl }),
            newValues: JSON.stringify({ signature: signatureUrl }),
            metadata: JSON.stringify({ batchId: batch.id, importType: 'SIGNATURE_IMPORT' }),
          },
        })
      }

      successCount++
      console.log(`[SIGNATURE_IMPORT] ${reqId} Successfully imported signature for ${entityType} ${entityId}`)
    }

    console.log(`[SIGNATURE_IMPORT] ${reqId} Completed: ${successCount} success, ${failedCount} failed`)

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      successCount,
      failedCount,
      errors: errors.slice(0, 10), // Limit error messages
    })
  } catch (error: any) {
    console.error(`[SIGNATURE_IMPORT] ${reqId} Error:`, error)
    return NextResponse.json(
      { error: error.message || 'Failed to import signatures' },
      { status: 500 }
    )
  }
}
