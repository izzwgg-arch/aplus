/**
 * Performance logging utility for API routes
 * Logs route name, total time, DB time, and query count
 */

interface PerformanceLog {
  route: string
  method: string
  totalTime: number
  dbTime: number
  queryCount: number
  queries: Array<{ query: string; duration: number }>
}

const performanceLogs: Map<string, PerformanceLog> = new Map()

export function startPerformanceLog(route: string, method: string = 'GET') {
  const startTime = Date.now()
  const logId = `${route}-${Date.now()}`
  
  const queries: Array<{ query: string; duration: number }> = []
  let queryCount = 0
  let dbTime = 0

  // Intercept Prisma queries if possible
  const originalQuery = console.log
  const queryStartTimes = new Map<string, number>()

  return {
    logId,
    startTime,
    logQuery: (query: string) => {
      queryCount++
      const queryStart = Date.now()
      queryStartTimes.set(query, queryStart)
    },
    endQuery: (query: string) => {
      const queryStart = queryStartTimes.get(query)
      if (queryStart) {
        const duration = Date.now() - queryStart
        dbTime += duration
        queries.push({ query, duration })
        queryStartTimes.delete(query)
      }
    },
    finish: () => {
      const totalTime = Date.now() - startTime
      const log: PerformanceLog = {
        route,
        method,
        totalTime,
        dbTime,
        queryCount,
        queries,
      }
      
      // Log if slow or high query count
      if (totalTime > 1000 || queryCount > 20) {
        console.log(`[PERF] ${method} ${route}: ${totalTime}ms (DB: ${dbTime}ms, Queries: ${queryCount})`)
        if (queryCount > 20) {
          console.log(`[PERF] ⚠️  HIGH QUERY COUNT: ${queryCount} queries detected`)
        }
        if (queries.length > 0) {
          const slowQueries = queries.filter(q => q.duration > 100)
          if (slowQueries.length > 0) {
            console.log(`[PERF] Slow queries (>100ms):`, slowQueries)
          }
        }
      }
      
      performanceLogs.set(logId, log)
      return log
    },
  }
}

export function getPerformanceLogs() {
  return Array.from(performanceLogs.values())
}

export function clearPerformanceLogs() {
  performanceLogs.clear()
}
