/**
 * Performance monitoring with PERF_DEBUG flag
 * Only logs when PERF_DEBUG=true environment variable is set
 */

const PERF_DEBUG = process.env.PERF_DEBUG === 'true'

let requestCounter = 0
const timers = new Map<string, number>()
const queryCounts = new Map<string, number>()
const slowQueries: Array<{ requestId: string; query: string; duration: number }> = []

export function requestId(): string {
  return `req-${++requestCounter}-${Date.now()}`
}

export function startTimer(requestId: string, label: string): void {
  if (!PERF_DEBUG) return
  const key = `${requestId}:${label}`
  timers.set(key, Date.now())
}

export function endTimer(requestId: string, label: string): number | null {
  if (!PERF_DEBUG) return null
  const key = `${requestId}:${label}`
  const start = timers.get(key)
  if (!start) return null
  const duration = Date.now() - start
  timers.delete(key)
  return duration
}

export function logRequest(requestId: string, route: string, totalMs: number, queryCount: number): void {
  if (!PERF_DEBUG) return
  console.log(`[PERF] requestId=${requestId} route=${route} ms=${totalMs} queries=${queryCount}`)
}

export function logSlowQuery(requestId: string, query: string, duration: number, model?: string, action?: string): void {
  if (!PERF_DEBUG) return
  if (duration > 200) {
    slowQueries.push({ requestId, query, duration })
    console.log(`[PERF] slowQuery ms=${duration} model=${model || 'unknown'} action=${action || 'unknown'} where=${query.substring(0, 100)}`)
  }
}

export function incrementQueryCount(requestId: string): void {
  if (!PERF_DEBUG) return
  const count = queryCounts.get(requestId) || 0
  queryCounts.set(requestId, count + 1)
}

export function getQueryCount(requestId: string): number {
  return queryCounts.get(requestId) || 0
}

export function resetRequest(requestId: string): void {
  if (!PERF_DEBUG) return
  queryCounts.delete(requestId)
  // Clean up timers for this request
  for (const key of timers.keys()) {
    if (key.startsWith(`${requestId}:`)) {
      timers.delete(key)
    }
  }
}

export function getSlowQueries(requestId: string): Array<{ query: string; duration: number }> {
  return slowQueries.filter(q => q.requestId === requestId).slice(0, 5)
}
