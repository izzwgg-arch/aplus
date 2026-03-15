/**
 * Prisma performance monitoring
 * Wraps Prisma client to log query counts and durations
 */

import { PrismaClient } from '@prisma/client'
import { prisma as basePrisma } from './prisma'

interface QueryLog {
  query: string
  duration: number
  timestamp: number
}

class PerformancePrismaClient {
  private queryLogs: QueryLog[] = []
  private queryCount = 0
  private totalDbTime = 0
  private requestStartTime: number | null = null

  constructor(private prisma: PrismaClient) {
    // Enable query logging in development
    if (process.env.NODE_ENV === 'development') {
      this.setupLogging()
    }
  }

  private setupLogging() {
    // Prisma doesn't expose query hooks directly, so we'll use middleware
    // This is a simplified version - actual implementation may need Prisma middleware
  }

  startRequest() {
    this.requestStartTime = Date.now()
    this.queryLogs = []
    this.queryCount = 0
    this.totalDbTime = 0
  }

  logQuery(query: string, duration: number) {
    this.queryCount++
    this.totalDbTime += duration
    this.queryLogs.push({
      query,
      duration,
      timestamp: Date.now(),
    })
  }

  getStats() {
    return {
      queryCount: this.queryCount,
      totalDbTime: this.totalDbTime,
      queries: this.queryLogs,
      requestDuration: this.requestStartTime ? Date.now() - this.requestStartTime : 0,
    }
  }

  reset() {
    this.queryLogs = []
    this.queryCount = 0
    this.totalDbTime = 0
    this.requestStartTime = null
  }

  // Proxy all Prisma methods
  get client() {
    return this.prisma
  }
}

// Export a wrapper that tracks performance
export const performancePrisma = new PerformancePrismaClient(basePrisma)
