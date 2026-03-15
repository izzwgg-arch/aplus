import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, prismaContext } from '@/lib/prisma'
import { requestId, startTimer, endTimer, logRequest, getQueryCount, resetRequest } from '@/lib/perf'

export async function GET(request: NextRequest) {
  const reqId = requestId()
  startTimer(reqId, 'total')
  
  return prismaContext.run(reqId, async () => {
    try {
      const session = await getServerSession(authOptions)
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      startTimer(reqId, 'query')
      const employees = await (prisma as any).payrollEmployee.findMany({
      orderBy: { fullName: 'asc' },
      take: 50, // PERFORMANCE FIX: Reduced from 1000 to 50 (pagination needed)
    })
    endTimer(reqId, 'query')

    // Convert Decimal to number for JSON serialization
    const serializedEmployees = employees.map((emp: any) => ({
      ...emp,
      defaultHourlyRate: typeof emp.defaultHourlyRate === 'object' && 'toNumber' in emp.defaultHourlyRate
        ? emp.defaultHourlyRate.toNumber()
        : Number(emp.defaultHourlyRate) || 0,
      overtimeRateHourly: emp.overtimeRateHourly && typeof emp.overtimeRateHourly === 'object' && 'toNumber' in emp.overtimeRateHourly
        ? emp.overtimeRateHourly.toNumber()
        : emp.overtimeRateHourly ? Number(emp.overtimeRateHourly) : null,
      overtimeStartTime: emp.overtimeStartTime !== null && emp.overtimeStartTime !== undefined ? Number(emp.overtimeStartTime) : null,
      overtimeEnabled: emp.overtimeEnabled ?? false,
    }))

      const totalMs = endTimer(reqId, 'total') || 0
      const queryCount = getQueryCount(reqId)
      logRequest(reqId, '/api/payroll/employees', totalMs, queryCount)
      resetRequest(reqId)
      
      const result = NextResponse.json({ employees: serializedEmployees })
      return result
    } catch (error: any) {
      const totalMs = endTimer(reqId, 'total') || 0
      logRequest(reqId, '/api/payroll/employees', totalMs, getQueryCount(reqId))
      resetRequest(reqId)
      console.error('Error fetching employees:', error)
      return NextResponse.json(
        { error: 'Failed to fetch employees', details: error.message },
        { status: 500 }
      )
    }
  })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      fullName,
      email,
      phone,
      active,
      defaultHourlyRate,
      overtimeRateHourly,
      overtimeStartTime,
      overtimeEnabled,
      scannerExternalId,
      notes,
    } = body

    if (!fullName || !defaultHourlyRate) {
      return NextResponse.json(
        { error: 'Full name and default hourly rate are required' },
        { status: 400 }
      )
    }

    // Validate overtime fields
    if (overtimeRateHourly !== null && overtimeRateHourly !== undefined) {
      const otRate = parseFloat(overtimeRateHourly)
      if (isNaN(otRate) || otRate <= 0) {
        return NextResponse.json(
          { error: 'Overtime rate must be a positive number' },
          { status: 400 }
        )
      }
      if (overtimeStartTime === null || overtimeStartTime === undefined) {
        return NextResponse.json(
          { error: 'Overtime start time is required when overtime rate is set' },
          { status: 400 }
        )
      }
      const otTime = parseInt(overtimeStartTime)
      if (isNaN(otTime) || otTime < 0 || otTime >= 1440) {
        return NextResponse.json(
          { error: 'Overtime start time must be between 0 and 1439 (minutes since midnight)' },
          { status: 400 }
        )
      }
    }

    const employee = await (prisma as any).payrollEmployee.create({
      data: {
        fullName: fullName.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        active: active !== undefined ? active : true,
        defaultHourlyRate: parseFloat(defaultHourlyRate),
        overtimeRateHourly: overtimeRateHourly !== null && overtimeRateHourly !== undefined ? parseFloat(overtimeRateHourly) : null,
        overtimeStartTime: overtimeStartTime !== null && overtimeStartTime !== undefined ? parseInt(overtimeStartTime) : null,
        overtimeEnabled: overtimeEnabled !== undefined ? overtimeEnabled : (overtimeRateHourly !== null && overtimeRateHourly !== undefined),
        scannerExternalId: scannerExternalId?.trim() || null,
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json({ employee })
  } catch (error: any) {
    console.error('Error creating employee:', error)
    return NextResponse.json(
      { error: 'Failed to create employee', details: error.message },
      { status: 500 }
    )
  }
}
