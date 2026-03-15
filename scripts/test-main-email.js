const fs = require('fs')
const nodemailer = require('nodemailer')

// Read .env file manually
function loadEnv() {
  const envContent = fs.readFileSync('.env', 'utf8')
  const env = {}
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=')
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        env[key.trim()] = value.trim()
      }
    }
  })
  return env
}

const env = loadEnv()

async function testMainEmail() {
  console.log('Testing Main Email Queue SMTP Configuration...\n')
  
  const smtpHost = env.SMTP_HOST
  const smtpPort = env.SMTP_PORT
  const smtpSecure = env.SMTP_SECURE === 'true'
  const smtpUser = env.SMTP_USER
  const smtpPass = env.SMTP_PASS || env.SMTP_PASSWORD

  console.log('Configuration:')
  console.log('  Host:', smtpHost)
  console.log('  Port:', smtpPort)
  console.log('  Secure:', smtpSecure)
  console.log('  User:', smtpUser)
  console.log('  Pass:', smtpPass ? `SET (${smtpPass.length} chars)` : 'MISSING')
  console.log('')

  if (!smtpUser || !smtpPass) {
    console.error('ERROR: Main SMTP credentials not configured!')
    process.exit(1)
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort),
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })

  console.log('Sending test email...')
  console.log('  From: Smart Steps ABA <info@smartstepsabapc.org>')
  console.log('  To: info@productivebilling.com, jacobw@apluscenterinc.org')
  console.log('')

  try {
    const info = await transporter.sendMail({
      from: 'Smart Steps ABA <info@smartstepsabapc.org>',
      to: 'info@productivebilling.com, jacobw@apluscenterinc.org',
      subject: 'Test Email - Main Email Queue SMTP',
      html: `
        <h2>Test Email from Main Email Queue</h2>
        <p>This is a test email to verify the Main Email Queue SMTP configuration.</p>
        <p><strong>From:</strong> info@smartstepsabapc.org</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      `,
      text: 'This is a test email to verify the Main Email Queue SMTP configuration.',
    })

    console.log('✅ SUCCESS!')
    console.log('  Message ID:', info.messageId)
    console.log('  Response:', info.response)
    console.log('')
    console.log('Email sent successfully!')
  } catch (error) {
    console.error('❌ FAILED!')
    console.error('  Error:', error.message)
    console.error('  Code:', error.code)
    if (error.response) {
      console.error('  Response:', error.response)
    }
    process.exit(1)
  }
}

testMainEmail()
