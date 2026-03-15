/**
 * Server initialization module
 * 
 * This module handles server-side initialization tasks like cron jobs.
 * It should be imported in a server component to ensure it runs on server startup.
 */

let initialized = false

export function initializeServer() {
  if (initialized) {
    return
  }

  // Only initialize cron jobs in production or when explicitly enabled
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_CRON_JOBS === 'true') {
    try {
      const { initializeCronJobs } = require('./cron')
      initializeCronJobs()
      console.log('✅ Server initialization complete: Cron jobs started')
    } catch (error) {
      console.error('❌ Failed to initialize cron jobs:', error)
    }
  } else {
    console.log('ℹ️  Cron jobs disabled (set ENABLE_CRON_JOBS=true to enable in development)')
  }

  initialized = true
}

// Auto-initialize when this module is imported (server-side only)
if (typeof window === 'undefined') {
  initializeServer()
}
