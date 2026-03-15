const fs = require('fs')
const path = require('path')

// Load .env file
const envPath = path.join(__dirname, '..', '.env')
const envVars = {}
try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const equalIndex = trimmed.indexOf('=')
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim()
          let value = trimmed.substring(equalIndex + 1).trim()
          // Remove surrounding quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
          }
          if (key && value !== undefined) {
            envVars[key] = value
          }
        }
      }
    })
    console.log('Loaded', Object.keys(envVars).length, 'environment variables from .env')
  } else {
    console.warn('Warning: .env file not found at', envPath)
  }
} catch (error) {
  console.error('Error loading .env file:', error.message)
}

module.exports = {
  apps: [{
    name: 'aplus-center',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/aplus-center',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      ...envVars // Merge all .env variables
    },
    error_file: '/var/log/aplus-center/error.log',
    out_file: '/var/log/aplus-center/out.log',
    // Ensure log directory exists (create manually: mkdir -p /var/log/aplus-center)
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false
  }]
}
