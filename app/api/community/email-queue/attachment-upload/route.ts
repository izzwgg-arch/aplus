import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'community-email-attachments')

/**
 * POST /api/community/email-queue/attachment-upload
 * 
 * Upload an additional PDF attachment for Community Classes email queue
 * Permission: communityEmailQueue.attachPdf
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check Community Classes subsection permission
    const { canAccessCommunitySection } = await import('@/lib/permissions')
    const hasAccess = await canAccessCommunitySection(session.user.id, 'emailQueue')
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden - No access to Community Classes Email Queue' },
        { status: 403 }
      )
    }

    // TODO: Check granular permission communityEmailQueue.attachPdf
    // For now, if they have emailQueue access, they can attach

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Validate PDF header (first 4 bytes should be %PDF)
    const header = buffer.slice(0, 4).toString('ascii')
    if (header !== '%PDF') {
      return NextResponse.json(
        { error: 'Invalid PDF file: PDF header not found' },
        { status: 400 }
      )
    }

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 11)
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${timestamp}-${randomStr}-${sanitizedFilename}`
    const filepath = join(UPLOAD_DIR, filename)

    // Save file
    await writeFile(filepath, buffer)

    // Return file reference
    return NextResponse.json({
      success: true,
      attachmentKey: filename,
      attachmentUrl: `/api/community/email-queue/attachment/${filename}`,
      attachmentFilename: file.name,
      size: file.size,
    })
  } catch (error: any) {
    console.error('[ATTACHMENT_UPLOAD] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload attachment' },
      { status: 500 }
    )
  }
}
