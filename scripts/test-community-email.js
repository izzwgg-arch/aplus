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

async function testCommunityEmail() {
  console.log('Testing Community Classes Email SMTP Configuration...\n')
  
  const communityHost = env.COMMUNITY_SMTP_HOST || env.SMTP_HOST
  const communityPort = env.COMMUNITY_SMTP_PORT || env.SMTP_PORT
  const communitySecure = (env.COMMUNITY_SMTP_SECURE || env.SMTP_SECURE) === 'true'
  const communityUser = env.COMMUNITY_SMTP_USER || env.SMTP_USER
  const communityPass = env.COMMUNITY_SMTP_PASS || env.COMMUNITY_SMTP_PASSWORD || env.SMTP_PASS || env.SMTP_PASSWORD

  console.log('Configuration:')
  console.log('  Host:', communityHost)
  console.log('  Port:', communityPort)
  console.log('  Secure:', communitySecure)
  console.log('  User:', communityUser)
  console.log('  Pass:', communityPass ? `SET (${communityPass.length} chars)` : 'MISSING')
  console.log('')

  if (!communityUser || !communityPass) {
    console.error('ERROR: Community SMTP credentials not configured!')
    process.exit(1)
  }

  const transporter = nodemailer.createTransport({
    host: communityHost,
    port: parseInt(communityPort),
    secure: communitySecure,
    auth: {
      user: communityUser,
      pass: communityPass,
    },
  })

  console.log('Sending test email...')
  console.log('  From: KJ Play Center <billing@kjplaycenter.com>')
  console.log('  To: izzwgg@gmail.com')
  console.log('')

  try {
    const info = await transporter.sendMail({
      from: 'KJ Play Center <billing@kjplaycenter.com>',
      to: 'izzwgg@gmail.com',
      replyTo: 'billing@kjplaycenter.com',
      subject: 'Test Email - Community Classes SMTP',
      html: `
        <h2>Test Email from Community Classes</h2>
        <p>This is a test email to verify the Community Classes SMTP configuration.</p>
        <p><strong>From:</strong> billing@kjplaycenter.com</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      `,
      text: 'This is a test email to verify the Community Classes SMTP configuration.',
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

testCommunityEmail()
