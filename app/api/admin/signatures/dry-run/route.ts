import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'
import AdmZip from 'adm-zip'
import { normalizeName, parseName, normalizeFullName } from '@/lib/signature-import/nameMatching'
import { checkLibreOffice, convertEmfToPng, sanitizePath } from '@/lib/signatures/emfConvert'
import { mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const requestId = () => `dry-run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export async function POST(request: NextRequest) {
  const reqId = requestId()
  console.log(`[SIGNATURE_DRY_RUN] ${reqId} Starting dry-run`)
  
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      console.log(`[SIGNATURE_DRY_RUN] ${reqId} Unauthorized`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      console.log(`[SIGNATURE_DRY_RUN] ${reqId} Forbidden - not admin`)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check LibreOffice availability
    const libreOfficeCheck = await checkLibreOffice()
    if (!libreOfficeCheck.available) {
      console.log(`[SIGNATURE_DRY_RUN] ${reqId} LibreOffice not available: ${libreOfficeCheck.error}`)
      return NextResponse.json(
        { 
          error: 'LIBREOFFICE_NOT_INSTALLED',
          message: 'Install libreoffice to enable EMF conversion.'
        },
        { status: 500 }
      )
    }
    console.log(`[SIGNATURE_DRY_RUN] ${reqId} LibreOffice check passed`)

    const formData = await request.formData()
    const excelFile = formData.get('excel') as File | null
    const zipFile = formData.get('zip') as File | null

    if (!excelFile || !zipFile) {
      return NextResponse.json(
        { error: 'Both Excel and ZIP files are required' },
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

    // Parse Excel file
    console.log(`[SIGNATURE_DRY_RUN] ${reqId} Parsing Excel file: ${excelFile.name}`)
    const excelBuffer = Buffer.from(await excelFile.arrayBuffer())
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' }) as any[]

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Excel file is empty' },
        { status: 400 }
      )
    }

    // Extract column names
    const columns = Object.keys(rows[0] || {})
    console.log(`[SIGNATURE_DRY_RUN] ${reqId} Excel columns: ${columns.join(', ')}`)

    // Find name columns (case-insensitive)
    const firstNameCol = columns.find(c => /first.*name/i.test(c)) || columns.find(c => /first/i.test(c))
    const lastNameCol = columns.find(c => /last.*name/i.test(c)) || columns.find(c => /last/i.test(c))
    const fullNameCol = columns.find(c => /full.*name/i.test(c) || /name/i.test(c) && !firstNameCol && !lastNameCol)
    const signatureFilenameCol = columns.find(c => /signature.*filename/i.test(c) || /filename/i.test(c))
    const roleCol = columns.find(c => /role/i.test(c) || /type/i.test(c))

    // Parse ZIP file
    console.log(`[SIGNATURE_DRY_RUN] ${reqId} Parsing ZIP file: ${zipFile.name}`)
    const zipBuffer = Buffer.from(await zipFile.arrayBuffer())
    const zip = new AdmZip(zipBuffer)
    const zipEntries = zip.getEntries()
    
    // Validate file count
    const fileEntries = zipEntries.filter(e => !e.isDirectory)
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
      console.error(`[SIGNATURE_DRY_RUN] ${reqId} Failed to create temp directories:`, error)
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
        console.warn(`[SIGNATURE_DRY_RUN] ${reqId} Zip Slip blocked: ${entry.entryName}`)
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
        console.error(`[SIGNATURE_DRY_RUN] ${reqId} Failed to extract ${entry.entryName}:`, error)
      }
    }

    console.log(`[SIGNATURE_DRY_RUN] ${reqId} Extracted ${extractedFiles.size} files, ${emfFiles.length} EMF files to convert`)

    // Convert EMF files to PNG
    const convertedFiles = new Map<string, string>() // original name -> converted PNG path
    for (const emfFile of emfFiles) {
      try {
        const result = await convertEmfToPng(emfFile.extractedPath, tempOut, 10000)
        if (result.ok && result.outputPath) {
          const baseName = emfFile.originalName.replace(/\.emf$/i, '')
          convertedFiles.set(emfFile.originalName, result.outputPath)
          console.log(`[SIGNATURE_DRY_RUN] ${reqId} Converted ${emfFile.originalName} -> ${result.outputPath}`)
        } else {
          console.warn(`[SIGNATURE_DRY_RUN] ${reqId} Failed to convert ${emfFile.originalName}: ${result.error}`)
        }
      } catch (error: any) {
        console.error(`[SIGNATURE_DRY_RUN] ${reqId} Error converting ${emfFile.originalName}:`, error)
      }
    }

    // Build image filename map (normalized) - includes original PNG/JPG and converted PNGs
    const imageMap = new Map<string, { filename: string; path: string; isConverted: boolean }>()
    
    // Add original PNG/JPG/JPEG files
    for (const [filename, path] of extractedFiles.entries()) {
      if (/\.(png|jpg|jpeg)$/i.test(filename)) {
        const normalized = normalizeName(filename.replace(/\.(png|jpg|jpeg)$/i, ''))
        imageMap.set(normalized, { filename, path, isConverted: false })
      }
    }
    
    // Add converted PNG files (from EMF)
    for (const [originalName, convertedPath] of convertedFiles.entries()) {
      const baseName = originalName.replace(/\.emf$/i, '')
      const normalized = normalizeName(baseName)
      const pngFilename = `${baseName}.png`
      imageMap.set(normalized, { filename: pngFilename, path: convertedPath, isConverted: true })
    }

    console.log(`[SIGNATURE_DRY_RUN] ${reqId} Built image map: ${imageMap.size} images (${convertedFiles.size} converted from EMF)`)

    // Process each row
    const results: Array<{
      rowIndex: number
      detectedName: string
      normalizedName: string
      roleGuess: 'CLIENT' | 'PROVIDER' | 'UNKNOWN'
      matchedProfile: {
        type: 'CLIENT' | 'PROVIDER'
        id: string
        name: string
      } | null
      imageFound: boolean
      imageFilename: string | null
      status: 'READY' | 'NO_PROFILE' | 'AMBIGUOUS' | 'MISSING_IMAGE' | 'CONFLICT_EXISTING_SIGNATURE'
      canAttach: boolean
      errorDetail?: string
    }> = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      
      // Extract name
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

      if (!detectedName) {
        continue // Skip empty rows
      }

      const normalizedName = normalizeFullName(firstName, lastName)

      // Find image
      let imageFound = false
      let imageFilename: string | null = null
      let imagePath: string | null = null

      // Try signature_filename column first
      if (signatureFilenameCol && row[signatureFilenameCol]) {
        const filename = String(row[signatureFilenameCol]).trim()
        const baseName = filename.replace(/\.(png|jpg|jpeg|emf)$/i, '')
        const normalized = normalizeName(baseName)
        const imageInfo = imageMap.get(normalized)
        
        if (imageInfo) {
          imageFound = true
          imageFilename = imageInfo.filename
          imagePath = imageInfo.path
        } else {
          // Try direct filename match in extracted files
          const extractedPath = extractedFiles.get(filename)
          if (extractedPath) {
            imageFound = true
            imageFilename = filename
            imagePath = extractedPath
          }
        }
      }

      // Try normalized name match
      if (!imageFound) {
        const imageInfo = imageMap.get(normalizedName)
        if (imageInfo) {
          imageFound = true
          imageFilename = imageInfo.filename
          imagePath = imageInfo.path
        }
      }

      // Match against database
      const matchedProviders: Array<{ id: string; name: string }> = []
      const matchedClients: Array<{ id: string; name: string }> = []

      // Match providers
      const providers = await prisma.provider.findMany({
        where: {
          deletedAt: null,
        },
        select: { id: true, name: true },
      })

      for (const provider of providers) {
        const providerNormalized = normalizeName(provider.name)
        if (providerNormalized === normalizedName) {
          matchedProviders.push({ id: provider.id, name: provider.name })
        }
      }

      // Match clients
      const clients = await prisma.client.findMany({
        where: {
          deletedAt: null,
        },
        select: { id: true, name: true },
      })

      for (const client of clients) {
        const clientNormalized = normalizeName(client.name)
        if (clientNormalized === normalizedName) {
          matchedClients.push({ id: client.id, name: client.name })
        }
      }

      // Determine status
      let status: 'READY' | 'NO_PROFILE' | 'AMBIGUOUS' | 'MISSING_IMAGE' | 'CONFLICT_EXISTING_SIGNATURE' = 'NO_PROFILE'
      let matchedProfile: { type: 'CLIENT' | 'PROVIDER'; id: string; name: string } | null = null
      let roleGuess: 'CLIENT' | 'PROVIDER' | 'UNKNOWN' = 'UNKNOWN'

      if (!imageFound) {
        status = 'MISSING_IMAGE'
      } else if (matchedProviders.length > 1 || matchedClients.length > 1) {
        status = 'AMBIGUOUS'
      } else if (matchedProviders.length === 1 && matchedClients.length === 1) {
        status = 'AMBIGUOUS' // Both match
      } else if (matchedProviders.length === 1) {
        matchedProfile = { type: 'PROVIDER', id: matchedProviders[0].id, name: matchedProviders[0].name }
        roleGuess = 'PROVIDER'
        
        // Check if signature already exists
        const provider = await prisma.provider.findUnique({
          where: { id: matchedProviders[0].id },
          select: { signature: true },
        })
        
        if (provider?.signature && provider.signature.trim().length > 0) {
          status = 'CONFLICT_EXISTING_SIGNATURE'
        } else {
          status = 'READY'
        }
      } else if (matchedClients.length === 1) {
        matchedProfile = { type: 'CLIENT', id: matchedClients[0].id, name: matchedClients[0].name }
        roleGuess = 'CLIENT'
        
        // Check if signature already exists
        const client = await prisma.client.findUnique({
          where: { id: matchedClients[0].id },
          select: { signature: true },
        })
        
        if (client?.signature && client.signature.trim().length > 0) {
          status = 'CONFLICT_EXISTING_SIGNATURE'
        } else {
          status = 'READY'
        }
      }

      // Use role column if available
      if (roleCol && row[roleCol]) {
        const roleValue = String(row[roleCol]).toUpperCase()
        if (roleValue.includes('PROVIDER')) {
          roleGuess = 'PROVIDER'
        } else if (roleValue.includes('CLIENT')) {
          roleGuess = 'CLIENT'
        }
      }

      results.push({
        rowIndex: i,
        detectedName,
        normalizedName,
        roleGuess,
        matchedProfile,
        imageFound,
        imageFilename,
        status,
        canAttach: status === 'READY',
      })
    }

    console.log(`[SIGNATURE_DRY_RUN] ${reqId} Completed: ${results.length} results`)
    console.log(`[SIGNATURE_DRY_RUN] ${reqId} Status breakdown:`, {
      READY: results.filter(r => r.status === 'READY').length,
      NO_PROFILE: results.filter(r => r.status === 'NO_PROFILE').length,
      AMBIGUOUS: results.filter(r => r.status === 'AMBIGUOUS').length,
      MISSING_IMAGE: results.filter(r => r.status === 'MISSING_IMAGE').length,
      CONFLICT: results.filter(r => r.status === 'CONFLICT_EXISTING_SIGNATURE').length,
    })

    // Cleanup temp directories
    try {
      await rm(tempBase, { recursive: true, force: true })
      console.log(`[SIGNATURE_DRY_RUN] ${reqId} Cleaned up temp directory`)
    } catch (cleanupError: any) {
      console.warn(`[SIGNATURE_DRY_RUN] ${reqId} Failed to cleanup temp directory:`, cleanupError)
      // Non-fatal, continue
    }

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        ready: results.filter(r => r.status === 'READY').length,
        noProfile: results.filter(r => r.status === 'NO_PROFILE').length,
        ambiguous: results.filter(r => r.status === 'AMBIGUOUS').length,
        missingImage: results.filter(r => r.status === 'MISSING_IMAGE').length,
        conflict: results.filter(r => r.status === 'CONFLICT_EXISTING_SIGNATURE').length,
      },
    })
  } catch (error: any) {
    console.error(`[SIGNATURE_DRY_RUN] ${reqId} Error:`, error)
    
    // Cleanup on error
    const tempBase = join('/tmp', 'signature-import', reqId)
    try {
      await rm(tempBase, { recursive: true, force: true })
    } catch (cleanupError: any) {
      console.warn(`[SIGNATURE_DRY_RUN] ${reqId} Failed to cleanup temp directory on error:`, cleanupError)
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to process dry-run' },
      { status: 500 }
    )
  }
}
