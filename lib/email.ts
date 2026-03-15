import nodemailer from 'nodemailer'
import { createAuditLog } from './audit'

/**
 * Get default email recipients for timesheet/invoice approval emails
 * Returns comma-separated string of recipient emails
 */
export function getDefaultRecipients(): string {
  return process.env.EMAIL_APPROVAL_RECIPIENTS || 'info@productivebilling.com,jacobw@apluscenterinc.org'
}

/**
 * Parse recipients string into array of email addresses
 */
export function parseRecipients(recipientsStr: string | null | undefined): string[] {
  if (!recipientsStr) {
    return getDefaultRecipients().split(',').map((email) => email.trim()).filter(Boolean)
  }
  return recipientsStr.split(',').map((email) => email.trim()).filter(Boolean)
}

// Validate SMTP configuration
function validateSMTPConfig(): { valid: boolean; error?: string } {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD

  if (!host || !port || !user || !pass) {
    return {
      valid: false,
      error: 'SMTP configuration incomplete. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS',
    }
  }

  return { valid: true }
}

// Create reusable transporter for main email queue
let transporter: nodemailer.Transporter | null = null
let transporterPassword: string | null = null // Track password to detect changes

function getTransporter(): nodemailer.Transporter {
  const currentPassword = process.env.SMTP_PASS || process.env.SMTP_PASSWORD
  
  // Recreate transporter if password changed (to pick up new env vars after restart)
  if (transporter && transporterPassword !== currentPassword) {
    console.log('[EMAIL] Password changed, recreating transporter')
    transporter = null
    transporterPassword = null
  }
  
  if (!transporter) {
    const config = validateSMTPConfig()
    if (!config.valid) {
      throw new Error(config.error || 'SMTP not configured')
    }

    const smtpConfig = {
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT!),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD!,
      },
    }
    
    console.log('[EMAIL] Creating transporter with config:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      user: smtpConfig.auth.user,
      pass: smtpConfig.auth.pass ? '***SET***' : 'MISSING',
    })
    
    transporter = nodemailer.createTransport(smtpConfig)
    transporterPassword = smtpConfig.auth.pass // Store current password
  }
  return transporter
}

// Create separate transporter for Community Classes emails
let communityTransporter: nodemailer.Transporter | null = null
let communityTransporterPassword: string | null = null // Track password to detect changes

function getCommunityTransporter(): nodemailer.Transporter {
  const currentPassword = process.env.COMMUNITY_SMTP_PASS || process.env.COMMUNITY_SMTP_PASSWORD || process.env.SMTP_PASS || process.env.SMTP_PASSWORD
  
  // Recreate transporter if password changed (to pick up new env vars after restart)
  if (communityTransporter && communityTransporterPassword !== currentPassword) {
    console.log('[EMAIL_COMMUNITY] Password changed, recreating transporter')
    communityTransporter = null
    communityTransporterPassword = null
  }
  
  if (!communityTransporter) {
    // Use community-specific SMTP config if provided, otherwise fall back to main config
    const communityHost = process.env.COMMUNITY_SMTP_HOST || process.env.SMTP_HOST!
    const communityPort = process.env.COMMUNITY_SMTP_PORT || process.env.SMTP_PORT!
    const communitySecure = (process.env.COMMUNITY_SMTP_SECURE || process.env.SMTP_SECURE) === 'true'
    const communityUser = process.env.COMMUNITY_SMTP_USER || process.env.SMTP_USER!
    const communityPass = process.env.COMMUNITY_SMTP_PASS || process.env.COMMUNITY_SMTP_PASSWORD || process.env.SMTP_PASS || process.env.SMTP_PASSWORD!

    if (!communityUser || !communityPass) {
      throw new Error('Community SMTP not configured')
    }

    const smtpConfig = {
      host: communityHost,
      port: parseInt(communityPort),
      secure: communitySecure,
      auth: {
        user: communityUser,
        pass: communityPass,
      },
    }
    
    console.log('[EMAIL_COMMUNITY] Creating community transporter with config:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      user: smtpConfig.auth.user,
      pass: smtpConfig.auth.pass ? '***SET***' : 'MISSING',
      passLength: smtpConfig.auth.pass ? smtpConfig.auth.pass.length : 0,
    })
    
    // Verify environment variables are set correctly
    console.log('[EMAIL_COMMUNITY] Environment check:', {
      COMMUNITY_SMTP_USER: process.env.COMMUNITY_SMTP_USER ? 'SET' : 'MISSING',
      COMMUNITY_SMTP_PASS: process.env.COMMUNITY_SMTP_PASS ? 'SET' : 'MISSING',
      COMMUNITY_SMTP_PASSWORD: process.env.COMMUNITY_SMTP_PASSWORD ? 'SET' : 'MISSING',
      usingUser: smtpConfig.auth.user,
    })
    
    communityTransporter = nodemailer.createTransport(smtpConfig)
    communityTransporterPassword = communityPass // Store current password
  }
  return communityTransporter
}

export interface EmailOptions {
  to: string | string[] // Single email or comma-separated string or array
  subject: string
  html: string
  text?: string
  from?: string // Optional custom from field (format: "Display Name <email@domain.com>")
  replyTo?: string // Optional reply-to address
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
  useCommunityTransporter?: boolean // If true, use community-specific SMTP credentials
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
  recipients: string[]
}

/**
 * Safe email sending wrapper with validation and audit logging
 * Returns structured result instead of throwing
 */
export async function sendMailSafe(
  options: EmailOptions,
  auditMetadata?: {
    action: string
    entityType?: string
    entityId?: string
    userId?: string
  }
): Promise<EmailResult> {
  // Validate SMTP config based on which transporter we're using
  const useCommunity = options.useCommunityTransporter === true
  
  if (useCommunity) {
    // Validate community SMTP config
    const communityHost = process.env.COMMUNITY_SMTP_HOST || process.env.SMTP_HOST
    const communityPort = process.env.COMMUNITY_SMTP_PORT || process.env.SMTP_PORT
    const communityUser = process.env.COMMUNITY_SMTP_USER || process.env.SMTP_USER
    const communityPass = process.env.COMMUNITY_SMTP_PASS || process.env.COMMUNITY_SMTP_PASSWORD || process.env.SMTP_PASS || process.env.SMTP_PASSWORD
    
    if (!communityHost || !communityPort || !communityUser || !communityPass) {
      const errorMsg = 'Community SMTP configuration incomplete. Required: COMMUNITY_SMTP_USER, COMMUNITY_SMTP_PASS'
      console.warn(`[EMAIL_COMMUNITY] ${errorMsg}. Would send email to:`, options.to)
      
      if (auditMetadata?.userId) {
        try {
          await createAuditLog({
            action: 'EMAIL_FAILED' as any,
            entityType: auditMetadata.entityType || 'Email',
            entityId: auditMetadata.entityId || 'unknown',
            userId: auditMetadata.userId,
            metadata: { reason: 'SMTP_NOT_CONFIGURED', to: Array.isArray(options.to) ? options.to.join(',') : options.to },
          })
        } catch (e) {
          // Non-blocking
        }
      }

      return {
        success: false,
        error: errorMsg,
        recipients: Array.isArray(options.to) ? options.to : [options.to],
      }
    }
  } else {
    // Validate main SMTP config
    const config = validateSMTPConfig()
    if (!config.valid) {
      const errorMsg = config.error || 'SMTP not configured'
      console.warn(`[EMAIL] ${errorMsg}. Would send email to:`, options.to)
      
      // Log audit event
      if (auditMetadata?.userId) {
        try {
          await createAuditLog({
            action: 'EMAIL_FAILED' as any,
            entityType: auditMetadata.entityType || 'Email',
            entityId: auditMetadata.entityId || 'unknown',
            userId: auditMetadata.userId,
            metadata: { reason: 'SMTP_NOT_CONFIGURED', to: Array.isArray(options.to) ? options.to.join(',') : options.to },
          })
        } catch (e) {
          // Non-blocking
        }
      }

      return {
        success: false,
        error: errorMsg,
        recipients: Array.isArray(options.to) ? options.to : [options.to],
      }
    }
  }

  // Normalize recipients
  let recipients: string[]
  if (Array.isArray(options.to)) {
    recipients = options.to
  } else if (typeof options.to === 'string') {
    // Handle comma-separated string
    recipients = options.to.split(',').map((email) => email.trim()).filter(Boolean)
  } else {
    recipients = []
  }

  if (recipients.length === 0) {
    return {
      success: false,
      error: 'No recipients specified',
      recipients: [],
    }
  }

  try {
    // Debug: Log SMTP config (without sensitive data)
    const useCommunity = options.useCommunityTransporter === true
    const logPrefix = useCommunity ? '[EMAIL_COMMUNITY]' : '[EMAIL]'
    
    console.log(`${logPrefix} SMTP Config Check:`, {
      context: useCommunity ? 'COMMUNITY' : 'MAIN',
      host: useCommunity 
        ? (process.env.COMMUNITY_SMTP_HOST || process.env.SMTP_HOST ? 'SET' : 'MISSING')
        : (process.env.SMTP_HOST ? 'SET' : 'MISSING'),
      port: useCommunity 
        ? (process.env.COMMUNITY_SMTP_PORT || process.env.SMTP_PORT ? 'SET' : 'MISSING')
        : (process.env.SMTP_PORT ? 'SET' : 'MISSING'),
      user: useCommunity
        ? (process.env.COMMUNITY_SMTP_USER || process.env.SMTP_USER ? 'SET' : 'MISSING')
        : (process.env.SMTP_USER ? 'SET' : 'MISSING'),
      pass: useCommunity
        ? ((process.env.COMMUNITY_SMTP_PASS || process.env.COMMUNITY_SMTP_PASSWORD || process.env.SMTP_PASS || process.env.SMTP_PASSWORD) ? 'SET' : 'MISSING')
        : ((process.env.SMTP_PASS || process.env.SMTP_PASSWORD) ? 'SET' : 'MISSING'),
      from: process.env.EMAIL_FROM || 'NOT SET',
    })

    const transporter = useCommunity ? getCommunityTransporter() : getTransporter()
    // Use custom from field if provided, otherwise use env vars or defaults
    const from = options.from || process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@smartstepsabapc.org'
    
    console.log(`${logPrefix} Attempting to send email to:`, recipients.join(', '))
    console.log(`${logPrefix} From:`, from)
    if (options.replyTo) {
      console.log(`${logPrefix} Reply-To:`, options.replyTo)
    }
    
    const mailOptions: any = {
      from,
      to: recipients.join(', '),
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    }
    
    // Add replyTo if provided
    if (options.replyTo) {
      mailOptions.replyTo = options.replyTo
    }
    
    const info = await transporter.sendMail(mailOptions)

    console.log(`${logPrefix} Sent successfully. MessageId: ${info.messageId}, To: ${recipients.join(', ')}`)

    // Log audit event (non-blocking)
    if (auditMetadata?.userId) {
      try {
        await createAuditLog({
          action: 'EMAIL_SENT' as any,
          entityType: auditMetadata.entityType || 'Email',
          entityId: auditMetadata.entityId || info.messageId || 'unknown',
          userId: auditMetadata.userId,
          metadata: {
            messageId: info.messageId,
            recipients: recipients.length,
            subject: options.subject,
          },
        })
      } catch (e) {
        console.error('[EMAIL] Failed to log audit event:', e)
      }
    }

    return {
      success: true,
      messageId: info.messageId,
      recipients,
    }
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error'
    console.error(`[EMAIL] Failed to send. Error: ${errorMsg}, To: ${recipients.join(', ')}`)

    // Log audit event (non-blocking)
    if (auditMetadata?.userId) {
      try {
        await createAuditLog({
          action: 'EMAIL_FAILED' as any,
          entityType: auditMetadata.entityType || 'Email',
          entityId: auditMetadata.entityId || 'unknown',
          userId: auditMetadata.userId,
          metadata: {
            error: errorMsg.replace(/password|pass|token|secret/gi, '***'),
            recipients: recipients.length,
          },
        })
      } catch (e) {
        // Non-blocking
      }
    }

    return {
      success: false,
      error: errorMsg.replace(/password|pass|token|secret/gi, '***'), // Sanitize error
      recipients,
    }
  }
}

// Legacy wrapper for backward compatibility
export async function sendEmail(options: EmailOptions): Promise<void> {
  const result = await sendMailSafe(options)
  if (!result.success) {
    throw new Error(result.error || 'Failed to send email')
  }
}

export function getPasswordResetEmailHtml(
  resetLink: string,
  userName?: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h1 style="color: #2563eb; margin-top: 0;">Smart Steps</h1>
      </div>
      
      <div style="background-color: #ffffff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Password Reset Request</h2>
        
        <p>${userName ? `Hello ${userName},` : 'Hello,'}</p>
        
        <p>We received a request to reset your password for your Smart Steps account. If you didn't make this request, you can safely ignore this email.</p>
        
        <p>To reset your password, click the button below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
        <p style="color: #2563eb; font-size: 12px; word-break: break-all;">${resetLink}</p>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          <strong>Note:</strong> This link will expire in 1 hour for security reasons.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">
          If you didn't request a password reset, please ignore this email or contact support if you have concerns.
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Smart Steps. All rights reserved.</p>
      </div>
    </body>
    </html>
  `
}

export function getPasswordResetEmailText(resetLink: string): string {
  return `
Password Reset Request

We received a request to reset your password for your Smart Steps account.

To reset your password, click the following link:
${resetLink}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, please ignore this email or contact support if you have concerns.
  `.trim()
}

// Timesheet Email Templates

export function getTimesheetSubmittedEmailHtml(
  timesheetId: string,
  clientName: string,
  providerName: string,
  startDate: string,
  endDate: string
): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const timesheetUrl = `${baseUrl}/timesheets`

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Timesheet Submitted</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h1 style="color: #2563eb; margin-top: 0;">Smart Steps</h1>
      </div>
      
      <div style="background-color: #ffffff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Timesheet Submitted for Review</h2>
        
        <p>A new timesheet has been submitted and is awaiting your approval.</p>
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Client:</strong> ${clientName}</p>
          <p style="margin: 5px 0;"><strong>Provider:</strong> ${providerName}</p>
          <p style="margin: 5px 0;"><strong>Period:</strong> ${startDate} - ${endDate}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${timesheetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Review Timesheet</a>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Smart Steps. All rights reserved.</p>
      </div>
    </body>
    </html>
  `
}

export function getTimesheetApprovedEmailHtml(
  clientName: string,
  providerName: string,
  startDate: string,
  endDate: string
): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const timesheetUrl = `${baseUrl}/timesheets`

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Timesheet Approved</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h1 style="color: #2563eb; margin-top: 0;">Smart Steps</h1>
      </div>
      
      <div style="background-color: #ffffff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #10b981; margin-top: 0;">✓ Timesheet Approved</h2>
        
        <p>Your timesheet has been approved and is ready for invoicing.</p>
        
        <div style="background-color: #f0fdf4; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981;">
          <p style="margin: 5px 0;"><strong>Client:</strong> ${clientName}</p>
          <p style="margin: 5px 0;"><strong>Provider:</strong> ${providerName}</p>
          <p style="margin: 5px 0;"><strong>Period:</strong> ${startDate} - ${endDate}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${timesheetUrl}" style="background-color: #10b981; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Timesheet</a>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Smart Steps. All rights reserved.</p>
      </div>
    </body>
    </html>
  `
}

export function getTimesheetRejectedEmailHtml(
  clientName: string,
  providerName: string,
  startDate: string,
  endDate: string,
  rejectionReason: string | null
): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const timesheetUrl = `${baseUrl}/timesheets`

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Timesheet Rejected</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h1 style="color: #2563eb; margin-top: 0;">Smart Steps</h1>
      </div>
      
      <div style="background-color: #ffffff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #ef4444; margin-top: 0;">Timesheet Rejected</h2>
        
        <p>Your timesheet has been rejected and requires revision.</p>
        
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <p style="margin: 5px 0;"><strong>Client:</strong> ${clientName}</p>
          <p style="margin: 5px 0;"><strong>Provider:</strong> ${providerName}</p>
          <p style="margin: 5px 0;"><strong>Period:</strong> ${startDate} - ${endDate}</p>
          ${rejectionReason ? `<p style="margin: 10px 0 5px 0;"><strong>Reason:</strong></p><p style="margin: 5px 0;">${rejectionReason}</p>` : ''}
        </div>
        
        <p>Please review the timesheet and make the necessary corrections.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${timesheetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Timesheet</a>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Smart Steps. All rights reserved.</p>
      </div>
    </body>
    </html>
  `
}

// Invoice Email Templates

export function getInvoiceGeneratedEmailHtml(
  invoiceCount: number,
  totalAmount: number
): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const invoiceUrl = `${baseUrl}/invoices`

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoices Generated</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h1 style="color: #2563eb; margin-top: 0;">Smart Steps</h1>
      </div>
      
      <div style="background-color: #ffffff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Automatic Invoice Generation</h2>
        
        <p>The automatic invoice generation job has completed successfully.</p>
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Invoices Created:</strong> ${invoiceCount}</p>
          <p style="margin: 5px 0;"><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invoiceUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Invoices</a>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Smart Steps. All rights reserved.</p>
      </div>
    </body>
    </html>
  `
}

// New User Invite Email Templates

export function getNewUserInviteEmailHtml(
  email: string,
  temporaryPassword: string,
  loginUrl: string,
  userName?: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Smart Steps</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h1 style="color: #2563eb; margin-top: 0;">Smart Steps</h1>
      </div>
      
      <div style="background-color: #ffffff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Welcome to Smart Steps!</h2>
        
        <p>${userName ? `Hello ${userName},` : 'Hello,'}</p>
        
        <p>Your account has been created. You will need to set a new password on your first login.</p>
        
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 5px 0;"><strong>Your Login Credentials:</strong></p>
          <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background-color: #ffffff; padding: 4px 8px; border-radius: 3px; font-size: 14px; font-weight: bold;">${temporaryPassword}</code></p>
        </div>
        
        <p style="color: #dc2626; font-weight: bold;">⚠️ Important: You must change your password on first login.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Login to Smart Steps</a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          <strong>Security Note:</strong> Please keep your temporary password secure and change it immediately after logging in.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">
          If you did not expect this email, please contact your administrator.
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Smart Steps. All rights reserved.</p>
      </div>
    </body>
    </html>
  `
}

export function getNewUserInviteEmailText(
  email: string,
  temporaryPassword: string,
  loginUrl: string
): string {
  return `
Welcome to Smart Steps!

Your account has been created. You will need to set a new password on your first login.

Your Login Credentials:
Email: ${email}
Temporary Password: ${temporaryPassword}

⚠️ Important: You must change your password on first login.

Login URL: ${loginUrl}

Security Note: Please keep your temporary password secure and change it immediately after logging in.

If you did not expect this email, please contact your administrator.
  `.trim()
}

// Batch Approval Email Template

export interface QueuedTimesheetItem {
  id: string
  type: 'REGULAR_TIMESHEET' | 'BCBA_TIMESHEET'
  clientName: string
  providerName: string
  bcbaName: string
  startDate: string
  endDate: string
  totalHours: number
  timesheetUrl: string
  serviceType?: string
  sessionData?: string
}

export function getBatchApprovalEmailHtml(
  regularCount: number,
  bcbaCount: number,
  totalHours: number,
  items: QueuedTimesheetItem[],
  batchDate: string
): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://66.94.105.43:3000'

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Approved Timesheets Batch</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
        <h1 style="color: #2563eb; margin-top: 0; text-align: center;">Smart Steps ABA</h1>
      </div>
      
      <div style="background-color: #ffffff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Approved Timesheets Batch - ${batchDate}</h2>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981;">
          <h3 style="margin-top: 0; color: #059669;">Summary</h3>
          <p style="margin: 5px 0;"><strong>Regular Timesheets:</strong> ${regularCount}</p>
          <p style="margin: 5px 0;"><strong>BCBA Timesheets:</strong> ${bcbaCount}</p>
          <p style="margin: 5px 0;"><strong>Total Timesheets:</strong> ${regularCount + bcbaCount}</p>
          <p style="margin: 5px 0;"><strong>Total Hours:</strong> ${totalHours.toFixed(2)}</p>
        </div>

        <h3 style="color: #1f2937; margin-top: 30px;">Timesheet Details</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f9fafb;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Type</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Client</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Provider</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">BCBA</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Period</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Hours</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => `
              <tr style="${idx % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f9fafb;'}">
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.type === 'BCBA_TIMESHEET' ? 'BCBA' : 'Regular'}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.clientName}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.providerName}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.bcbaName}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${new Date(item.startDate).toLocaleDateString()} - ${new Date(item.endDate).toLocaleDateString()}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;">${item.totalHours.toFixed(2)}</td>
              </tr>
              ${item.type === 'BCBA_TIMESHEET' && item.serviceType ? `
              <tr style="${idx % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f9fafb;'}">
                <td colspan="6" style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                  Service Type: ${item.serviceType}${item.sessionData ? ` | Session Data: ${item.sessionData}` : ''}
                </td>
              </tr>
              ` : ''}
            `).join('')}
          </tbody>
        </table>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/timesheets" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View All Timesheets</a>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Smart Steps ABA. All rights reserved.</p>
      </div>
    </body>
    </html>
  `
}

export function getBatchApprovalEmailText(
  regularCount: number,
  bcbaCount: number,
  totalHours: number,
  items: QueuedTimesheetItem[],
  batchDate: string
): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://66.94.105.43:3000'

  return `
Smart Steps ABA - Approved Timesheets Batch
${batchDate}

Summary:
- Regular Timesheets: ${regularCount}
- BCBA Timesheets: ${bcbaCount}
- Total Timesheets: ${regularCount + bcbaCount}
- Total Hours: ${totalHours.toFixed(2)}

Timesheet Details:
${items.map((item, idx) => `
${idx + 1}. ${item.type === 'BCBA_TIMESHEET' ? 'BCBA' : 'Regular'} Timesheet
   Client: ${item.clientName}
   Provider: ${item.providerName}
   BCBA: ${item.bcbaName}
   Period: ${new Date(item.startDate).toLocaleDateString()} - ${new Date(item.endDate).toLocaleDateString()}
   Hours: ${item.totalHours.toFixed(2)}
   ${item.type === 'BCBA_TIMESHEET' && item.serviceType ? `Service Type: ${item.serviceType}` : ''}
   ${item.type === 'BCBA_TIMESHEET' && item.sessionData ? `Session Data: ${item.sessionData}` : ''}
   View: ${baseUrl}/timesheets/${item.id}
`).join('\n')}

View All Timesheets: ${baseUrl}/timesheets

© ${new Date().getFullYear()} Smart Steps ABA. All rights reserved.
  `.trim()
}
