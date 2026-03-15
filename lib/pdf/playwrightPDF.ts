/**
 * Playwright PDF Generation
 * 
 * Provides a singleton browser instance for PDF generation using Playwright Chromium.
 * Reuses browser instance to avoid slow startup times.
 */

import { chromium, Browser, Page } from 'playwright'
import { randomBytes } from 'crypto'

// Global browser instance (singleton)
let browserInstance: Browser | null = null
let browserPromise: Promise<Browser> | null = null

/**
 * Get or create browser instance (singleton)
 */
async function getBrowser(): Promise<Browser> {
  if (browserInstance) {
    return browserInstance
  }
  
  if (browserPromise) {
    return browserPromise
  }
  
  browserPromise = (async () => {
    console.log('[PLAYWRIGHT_PDF] Launching Chromium browser...')
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for server environments
    })
    console.log('[PLAYWRIGHT_PDF] Browser launched successfully')
    
    // Handle browser close events
    browser.on('disconnected', () => {
      console.log('[PLAYWRIGHT_PDF] Browser disconnected, resetting instance')
      browserInstance = null
      browserPromise = null
    })
    
    browserInstance = browser
    
    // Cleanup on process exit
    if (typeof process !== 'undefined') {
      process.on('SIGTERM', async () => {
        if (browserInstance) {
          await browserInstance.close()
          browserInstance = null
          browserPromise = null
        }
      })
      process.on('SIGINT', async () => {
        if (browserInstance) {
          await browserInstance.close()
          browserInstance = null
          browserPromise = null
        }
      })
    }
    
    return browser
  })()
  
  return browserPromise
}

/**
 * Generate PDF from HTML string using Playwright
 * 
 * @param html HTML content to render
 * @param correlationId Optional correlation ID for logging
 * @returns PDF buffer
 */
export async function generatePDFFromHTML(
  html: string,
  correlationId?: string
): Promise<Buffer> {
  const corrId = correlationId || `pdf-${Date.now()}-${randomBytes(4).toString('hex')}`
  const startTime = Date.now()
  
  console.log(`[PLAYWRIGHT_PDF] ${corrId} Starting PDF generation`)
  
  try {
    const browser = await getBrowser()
    const page = await browser.newPage()
    
    try {
      // Set content and wait for load
      await page.setContent(html, { waitUntil: 'load' })
      
      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: {
          top: '0.5in',
          bottom: '0.5in',
          left: '0.5in',
          right: '0.5in',
        },
      })
      
      const duration = Date.now() - startTime
      console.log(`[PLAYWRIGHT_PDF] ${corrId} PDF generated successfully`, {
        bytes: pdfBuffer.length,
        duration: `${duration}ms`,
      })
      
      return Buffer.from(pdfBuffer)
    } finally {
      await page.close()
    }
  } catch (error: any) {
    console.error(`[PLAYWRIGHT_PDF] ${corrId} PDF generation failed`, {
      error: error?.message,
      stack: error?.stack,
    })
    throw error
  }
}

/**
 * Close browser instance (useful for cleanup/testing)
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    console.log('[PLAYWRIGHT_PDF] Closing browser instance')
    await browserInstance.close()
    browserInstance = null
    browserPromise = null
  }
}
