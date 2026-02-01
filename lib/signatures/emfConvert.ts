import { exec } from 'child_process'
import { promisify } from 'util'
import { join, basename, extname } from 'path'
import { existsSync, mkdirSync } from 'fs'

const execAsync = promisify(exec)

/**
 * Check if LibreOffice is installed and available
 */
export async function checkLibreOffice(): Promise<{ available: boolean; error?: string }> {
  try {
    const { stdout } = await execAsync('which soffice')
    if (stdout.trim()) {
      // Verify it works
      await execAsync('soffice --version', { timeout: 5000 })
      return { available: true }
    }
    return { available: false, error: 'soffice command not found' }
  } catch (error: any) {
    return { available: false, error: error.message || 'LibreOffice check failed' }
  }
}

/**
 * Convert EMF file to PNG using LibreOffice
 * @param inputPath Full path to input EMF file
 * @param outDir Directory to save output PNG
 * @param timeoutMs Timeout in milliseconds (default 10000)
 * @returns Promise with conversion result
 */
export async function convertEmfToPng(
  inputPath: string,
  outDir: string,
  timeoutMs: number = 10000
): Promise<{ ok: boolean; outputPath?: string; error?: string }> {
  try {
    // Ensure output directory exists
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true })
    }

    // Build output filename (same base name, .png extension)
    const baseName = basename(inputPath, extname(inputPath))
    const outputPath = join(outDir, `${baseName}.png`)

    // Run LibreOffice conversion
    const command = `soffice --headless --nologo --nofirststartwizard --convert-to png --outdir "${outDir}" "${inputPath}"`
    
    await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10MB max output
    })

    // Check if output file was created
    if (existsSync(outputPath)) {
      return { ok: true, outputPath }
    } else {
      // Sometimes LibreOffice creates files with different casing or naming
      // Try to find any PNG file in the output directory
      const { readdirSync } = await import('fs')
      const files = readdirSync(outDir)
      const pngFile = files.find(f => f.toLowerCase().endsWith('.png'))
      if (pngFile) {
        return { ok: true, outputPath: join(outDir, pngFile) }
      }
      return { ok: false, error: 'Conversion completed but output file not found' }
    }
  } catch (error: any) {
    if (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM') {
      return { ok: false, error: 'Conversion timeout' }
    }
    return { ok: false, error: error.message || 'Conversion failed' }
  }
}

/**
 * Validate and sanitize file path to prevent Zip Slip attacks
 * @param filePath Path to validate
 * @param baseDir Base directory that all files must stay within
 * @returns Sanitized path or null if invalid
 */
export function sanitizePath(filePath: string, baseDir: string): string | null {
  const normalized = join(baseDir, filePath)
  const resolved = require('path').resolve(normalized)
  const baseResolved = require('path').resolve(baseDir)
  
  if (!resolved.startsWith(baseResolved)) {
    return null // Path outside base directory
  }
  
  return resolved
}
