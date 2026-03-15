import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateTimesheetPDFFromId } from '@/lib/pdf/playwrightTimesheetPDF'
import { getUserPermissions } from '@/lib/permissions'
import { randomBytes } from 'crypto'

// Ensure Node.js runtime (not Edge)
export const runtime = 'nodejs'

/**
 * GET /api/timesheets/[id]/pdf
 * 
 * Authenticated route for downloading Timesheet PDF (Regular or BCBA)
 * Requires authentication and timesheet view permissions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const correlationId = `pdf-${Date.now()}-${randomBytes(4).toString('hex')}`
  let session: any = null
  
  const method = request.method
  const pathname = request.nextUrl.pathname
  
  console.log(`[TIMESHEET_PDF_ROUTE] ${correlationId} ==== REQUEST START ====`)
  console.log(`[TIMESHEET_PDF_ROUTE] ${correlationId} Method: ${method}, Pathname: ${pathname}`)
  
  try {
    session = await getServerSession(authOptions)
    console.log(`[TIMESHEET_PDF_ROUTE] ${correlationId} Session present: ${!!session}, User ID: ${session?.user?.id || 'N/A'}`)
    
    if (!session) {
      console.error(`[TIMESHEET_PDF_ROUTE] ${correlationId} Unauthorized - returning 401 JSON (NO REDIRECT)`)
      return NextResponse.json({ error: 'Unauthorized', correlationId }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const timesheetId = resolvedParams.id

    console.log(`[TIMESHEET_PDF_ROUTE] ${correlationId} Request received`, {
      route: 'regular',
      timesheetId,
      userId: session.user.id,
      userRole: session.user.role,
    })

    // Check permissions
    const userPermissions = await getUserPermissions(session.user.id)
    const canView = 
      userPermissions['timesheets.view']?.canView === true ||
      session.user.role === 'SUPER_ADMIN' ||
      session.user.role === 'ADMIN'

    if (!canView) {
      console.error(`[TIMESHEET_PDF_ROUTE] ${correlationId} Permission denied`, {
        userId: session.user.id,
        userRole: session.user.role,
      })
      return NextResponse.json(
        { error: 'Forbidden - Not authorized to view timesheets', correlationId },
        { status: 403 }
      )
    }

    // PHASE 2: Fetch timesheet to get row count BEFORE generating PDF
    const timesheetCheck = await prisma.timesheet.findUnique({
      where: { id: timesheetId, deletedAt: null },
      include: {
        entries: {
          select: { id: true },
        },
      },
    })

    const rowsCount = timesheetCheck?.entries?.length || 0
    console.log(`[TIMESHEET_PDF_ROUTE] ${correlationId} Timesheet has ${rowsCount} entries`)

    // Generate PDF using Playwright
    const pdfBuffer = await generateTimesheetPDFFromId(timesheetId, prisma, correlationId)

    // Verify PDF size and content
    const generatedBytes = pdfBuffer.length
    console.log(`[TIMESHEET_PDF_ROUTE] ${correlationId} PDF generated, bytes=${generatedBytes}, entries=${rowsCount}`)
    
    // Hard fail: If no rows
    if (rowsCount === 0) {
      console.error(`[TIMESHEET_PDF_ROUTE] ${correlationId} ERROR: NO_ROWS_TO_PRINT`)
      return NextResponse.json(
        { 
          error: 'NO_ROWS_TO_PRINT',
          message: 'Cannot generate PDF: Timesheet has no entries',
          correlationId 
        },
        { status: 400 }
      )
    }

    // Verify PDF size (must be > 20KB) and header
    if (generatedBytes < 20000) {
      console.error(`[TIMESHEET_PDF_ROUTE] ${correlationId} ERROR: PDF_TOO_SMALL`, {
        rowsCount,
        generatedBytes,
        expectedMin: 20000,
      })
      return NextResponse.json(
        { 
          error: 'PDF_GENERATION_FAILED',
          message: 'PDF generation failed: PDF is too small',
          bytes: generatedBytes,
          correlationId 
        },
        { status: 500 }
      )
    }

    // Verify PDF starts with %PDF
    const pdfHeader = pdfBuffer.slice(0, 4).toString('ascii')
    if (pdfHeader !== '%PDF') {
      console.error(`[TIMESHEET_PDF_ROUTE] ${correlationId} ERROR: PDF does not start with %PDF! First 20 bytes:`, pdfBuffer.slice(0, 20).toString('hex'))
      return NextResponse.json(
        { 
          error: 'PDF_GENERATION_FAILED',
          message: 'Invalid PDF generated',
          bytes: generatedBytes,
          correlationId 
        },
        { status: 500 }
      )
    }

    console.log(`[TIMESHEET_PDF_ROUTE] ${correlationId} PDF generated OK, bytes=${generatedBytes}, response status=200`)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="timesheet-${timesheetId}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error(`[TIMESHEET_PDF_ROUTE] ${correlationId} Error:`, {
      timesheetId: (await Promise.resolve(params)).id,
      userId: session?.user?.id,
      userRole: session?.user?.role,
      error: error?.message,
      stack: error?.stack,
    })
    
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: error.message, correlationId },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        correlationId,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
