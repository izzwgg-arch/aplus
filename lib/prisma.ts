import { PrismaClient } from '@prisma/client'
import { incrementQueryCount, logSlowQuery } from './perf'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Wrap Prisma client to track queries when PERF_DEBUG=true
const basePrisma = globalForPrisma.prisma ?? new PrismaClient()

// Store request ID in AsyncLocalStorage for query tracking
const asyncLocalStorage = new (class {
  private store = new Map<number, string>()
  private counter = 0
  
  run<T>(reqId: string, fn: () => T): T {
    const id = ++this.counter
    this.store.set(id, reqId)
    try {
      return fn()
    } finally {
      this.store.delete(id)
    }
  }
  
  getCurrent(): string | null {
    // Get from the most recent entry
    const entries = Array.from(this.store.values())
    return entries[entries.length - 1] || null
  }
})()

// Enable query logging only when PERF_DEBUG=true
if (process.env.PERF_DEBUG === 'true') {
  basePrisma.$use(async (params, next) => {
    const reqId = asyncLocalStorage.getCurrent()
    if (!reqId) {
      // No request context, skip tracking
      return next(params)
    }
    
    const start = Date.now()
    incrementQueryCount(reqId)
    
    try {
      const result = await next(params)
      const duration = Date.now() - start
      
      logSlowQuery(
        reqId,
        `${params.model || 'unknown'}.${params.action || 'unknown'}`,
        duration,
        params.model || undefined,
        params.action || undefined
      )
      
      return result
    } catch (error) {
      const duration = Date.now() - start
      logSlowQuery(reqId, `${params.model || 'unknown'}.${params.action || 'unknown'}`, duration, params.model || undefined, params.action || undefined)
      throw error
    }
  })
}

export const prisma = basePrisma
export { asyncLocalStorage as prismaContext }

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
