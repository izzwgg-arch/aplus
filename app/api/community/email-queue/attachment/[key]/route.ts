import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'community-email-attachments')

/**
 * GET /api/community/email-queue/attachment/[key]
 * 
 * Download an uploaded attachment (for verification/testing)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> | { key: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const key = resolvedParams.key

    // Sanitize filename to prevent directory traversal
    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      return NextResponse.json({ error: 'Invalid file key' }, { status: 400 })
    }

    const filepath = join(UPLOAD_DIR, key)

    if (!existsSync(filepath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const buffer = await readFile(filepath)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${key}"`,
      },
    })
  } catch (error: any) {
    console.error('[ATTACHMENT_DOWNLOAD] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to download attachment' },
      { status: 500 }
    )
  }
}
