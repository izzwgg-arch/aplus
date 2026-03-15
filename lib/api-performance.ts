/**
 * Simple API performance logging
 * Add to routes: const perf = startPerfLog('route-name'); ... perf.end();
 */

export function startPerfLog(routeName: string) {
  const startTime = Date.now()
  const startDbTime = process.hrtime.bigint()
  
  return {
    routeName,
    startTime,
    startDbTime,
    end: () => {
      const totalTime = Date.now() - startTime
      const endDbTime = process.hrtime.bigint()
      // Note: DB time is approximate without Prisma middleware
      
      if (totalTime > 500) {
        console.log(`[PERF] ${routeName}: ${totalTime}ms`)
      }
      
      return {
        routeName,
        totalTime,
        timestamp: new Date().toISOString(),
      }
    },
  }
}
