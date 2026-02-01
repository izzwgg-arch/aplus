import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'signatures')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const pathParts = resolvedParams.path || []
    
    if (pathParts.length < 2) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    const entityType = pathParts[0] // 'clients' or 'providers'
    const filename = pathParts[1]

    // Security: Only allow clients or providers
    if (entityType !== 'clients' && entityType !== 'providers') {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
    }

    // Security: Validate filename format (entityId.ext)
    if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const filePath = join(UPLOAD_DIR, entityType, filename)

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const fileBuffer = await readFile(filePath)
    const ext = filename.split('.').pop()?.toLowerCase() || 'png'
    
    const contentType = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      emf: 'application/x-msmetafile',
    }[ext] || 'application/octet-stream'

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    })
  } catch (error: any) {
    console.error('[SIGNATURE_FILE] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to serve file' },
      { status: 500 }
    )
  }
}
