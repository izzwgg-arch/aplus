/**
 * Shared Print Timesheet Handler
 * 
 * Single source of truth for printing timesheets.
 * Used by both the main Print button and the Print button inside View modal.
 */

import toast from 'react-hot-toast'

/**
 * Handle printing a timesheet by fetching PDF and opening it
 * 
 * @param timesheetId - The timesheet ID to print
 * @param type - 'regular' or 'bcba'
 */
export async function handlePrintTimesheet(
  timesheetId: string,
  type: 'regular' | 'bcba' = 'regular'
): Promise<void> {
  const endpoint = type === 'bcba' 
    ? `/api/bcba-timesheets/${timesheetId}/pdf`
    : `/api/timesheets/${timesheetId}/pdf`

  console.log(`[PRINT_TIMESHEET] Printing ${type} timesheet ${timesheetId}`)
  console.log(`[PRINT_TIMESHEET] Endpoint: ${endpoint}`)

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/pdf',
      },
    })

    console.log(`[PRINT_TIMESHEET] Response status: ${response.status}`)
    console.log(`[PRINT_TIMESHEET] Response Content-Type: ${response.headers.get('content-type')}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[PRINT_TIMESHEET] Error response:`, errorText)
      let error
      try {
        error = JSON.parse(errorText)
      } catch {
        error = { error: errorText || 'Failed to generate PDF' }
      }
      toast.error(`${error.error || 'Failed to generate PDF'}`)
      return
    }

    // Verify Content-Type is PDF
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/pdf')) {
      const errorText = await response.text()
      console.error(`[PRINT_TIMESHEET] Response is not PDF. Content-Type: ${contentType}`, errorText.substring(0, 200))
      toast.error('Server returned non-PDF content. Check console for details.')
      return
    }

    // Get blob and verify it's a PDF
    const blob = await response.blob()
    console.log(`[PRINT_TIMESHEET] Blob size: ${blob.size} bytes`)
    console.log(`[PRINT_TIMESHEET] Blob type: ${blob.type}`)

    if (blob.size < 20000) {
      console.error(`[PRINT_TIMESHEET] ERROR: PDF blob is too small (<20KB), likely empty or error document`)
      toast.error('PDF appears to be empty or invalid. Check server logs.')
      return
    }

    // Read first 4 bytes to verify PDF header
    const arrayBuffer = await blob.slice(0, 4).arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    const header = String.fromCharCode(...uint8Array)
    console.log(`[PRINT_TIMESHEET] PDF header check: ${header} (expected: %PDF)`)

    if (header !== '%PDF') {
      console.error(`[PRINT_TIMESHEET] Blob does not start with %PDF! First bytes:`, Array.from(uint8Array).map(b => b.toString(16).padStart(2, '0')).join(' '))
      toast.error('Invalid PDF received from server. Check console for details.')
      return
    }

    // Create blob URL and open PDF in new tab
    const blobUrl = URL.createObjectURL(blob)
    console.log(`[PRINT_TIMESHEET] Created blob URL: ${blobUrl.substring(0, 50)}...`)

    // Guard: Throw if trying to open non-blob URL
    if (!blobUrl.startsWith('blob:')) {
      console.error(`[PRINT_TIMESHEET] CRITICAL ERROR: Blob URL does not start with blob:`)
      throw new Error('PRINT_NAV_GUARD: Attempted to open non-blob URL: ' + blobUrl)
    }

    // Use a link element with target="_blank" to open PDF in new tab
    // This avoids triggering the browser's print dialog that happens with window.open()
    console.log(`[PRINT_TIMESHEET] Creating link to open PDF in new tab`)
    const link = document.createElement('a')
    link.href = blobUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.style.display = 'none'
    document.body.appendChild(link)
    
    console.log(`[PRINT_TIMESHEET] Clicking link to open PDF`)
    link.click()
    
    // Clean up after a short delay to allow the link click to process
    setTimeout(() => {
      document.body.removeChild(link)
      // Don't revoke immediately - give time for the PDF to load in new tab
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
        console.log(`[PRINT_TIMESHEET] Cleaned up blob URL`)
      }, 5000)
    }, 100)
    
    console.log(`[PRINT_TIMESHEET] PDF opened successfully`)
  } catch (error: any) {
    console.error(`[PRINT_TIMESHEET] Exception:`, error)
    if (error.message?.includes('PRINT_NAV_GUARD')) {
      console.error(`[PRINT_TIMESHEET] CRITICAL: Navigation guard triggered!`, error)
      toast.error('CRITICAL: Attempted to navigate to non-blob URL. Check console.')
    } else {
      toast.error(`Failed to generate PDF: ${error.message || 'Unknown error'}`)
    }
  }
}
