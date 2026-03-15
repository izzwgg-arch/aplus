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

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    
    startTimer(reqId, 'query')
    // PERFORMANCE FIX: Add pagination and use select instead of include
    const runs = await (prisma as any).payrollRun?.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      select: {
        id: true,
        name: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        _count: {
          select: {
            lines: true,
          },
        },
      },
    }) || []
    endTimer(reqId, 'query')

      const totalMs = endTimer(reqId, 'total') || 0
      const queryCount = getQueryCount(reqId)
      logRequest(reqId, '/api/payroll/runs', totalMs, queryCount)
      resetRequest(reqId)
      
      return NextResponse.json({ runs })
    } catch (error: any) {
      const totalMs = endTimer(reqId, 'total') || 0
      logRequest(reqId, '/api/payroll/runs', totalMs, getQueryCount(reqId))
      resetRequest(reqId)
      console.error('Error fetching payroll runs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch payroll runs', details: error.message },
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
      name,
      periodStart,
      periodEnd,
      sourceImportId,
      selectedEmployeeIds,
      employeeRates,
    } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Run name is required' },
        { status: 400 }
      )
    }

    if (!sourceImportId) {
      return NextResponse.json(
        { error: 'Source import is required' },
        { status: 400 }
      )
    }

    if (!selectedEmployeeIds || !Array.isArray(selectedEmployeeIds) || selectedEmployeeIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one employee must be selected' },
        { status: 400 }
      )
    }

    // Get import rows for the selected import and employees
    let importRows: any[] = []
    
    // First, get the import to determine date range
    const payrollImport = await (prisma as any).payrollImport?.findUnique({
      where: { id: sourceImportId },
      select: { periodStart: true, periodEnd: true },
    })
    
    if (!payrollImport) {
      return NextResponse.json(
        { error: 'Import not found' },
        { status: 404 }
      )
    }
    
    // First, verify that employees exist and are linked to import rows (WITHOUT date filter)
    const employeeCheck = await (prisma as any).payrollImportRow?.findMany({
      where: {
        importId: sourceImportId,
        linkedEmployeeId: { in: selectedEmployeeIds },
      },
      select: {
        linkedEmployeeId: true,
        workDate: true, // Include workDate for debugging
      },
      distinct: ['linkedEmployeeId'],
    })
    
    console.log(`[PAYROLL RUN] Employee check: Found ${employeeCheck.length} unique linked employees for import ${sourceImportId} with ${selectedEmployeeIds.length} selected employees`)
    
    if (employeeCheck.length === 0) {
      return NextResponse.json(
        { 
          error: 'No employees found in import.',
          details: `No import rows are linked to the selected ${selectedEmployeeIds.length} employee(s) in this import. Please go to the import edit page and link employees to the rows first.`
        },
        { status: 400 }
      )
    }
    
    // Use import's period dates if available, otherwise use provided dates
    // Normalize dates to local dates to avoid timezone issues
    let periodStartDate: Date | null = null
    let periodEndDate: Date | null = null
    
    if (payrollImport.periodStart) {
      const start = new Date(payrollImport.periodStart)
      periodStartDate = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0)
    } else if (periodStart) {
      const start = new Date(periodStart)
      periodStartDate = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0)
    }
    
    if (payrollImport.periodEnd) {
      const end = new Date(payrollImport.periodEnd)
      periodEndDate = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)
    } else if (periodEnd) {
      const end = new Date(periodEnd)
      periodEndDate = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)
    }
    
    // If period dates are still null, calculate from the actual row dates
    if (!periodStartDate || !periodEndDate) {
      const rowDates = await (prisma as any).payrollImportRow?.findMany({
        where: {
          importId: sourceImportId,
          linkedEmployeeId: { in: selectedEmployeeIds },
        },
        select: { workDate: true },
        orderBy: { workDate: 'asc' },
      })
      
      if (rowDates && rowDates.length > 0) {
        const dates = rowDates.map((r: any) => new Date(r.workDate)).filter((d: Date) => !isNaN(d.getTime()))
        if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates.map((d: Date) => d.getTime())))
          const maxDate = new Date(Math.max(...dates.map((d: Date) => d.getTime())))
          periodStartDate = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate(), 0, 0, 0, 0)
          periodEndDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 23, 59, 59, 999)
          console.log(`[PAYROLL RUN] Calculated period dates from row dates: ${periodStartDate.toISOString()} to ${periodEndDate.toISOString()}`)
        }
      }
    }
    
    // Ensure we have valid dates - if still null, use current date range
    if (!periodStartDate || !periodEndDate) {
      const today = new Date()
      periodStartDate = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0)
      periodEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)
      console.log(`[PAYROLL RUN] Using fallback period dates: ${periodStartDate.toISOString()} to ${periodEndDate.toISOString()}`)
    }
    
    // Build where clause - only add date filter if period dates are available
    const whereClause: any = {
      importId: sourceImportId,
      linkedEmployeeId: { in: selectedEmployeeIds },
    }
    
    // Only filter by date range if both dates are available
    if (periodStartDate && periodEndDate) {
      whereClause.workDate = {
        gte: periodStartDate,
        lte: periodEndDate,
      }
      console.log(`[PAYROLL RUN] Filtering by date range: ${periodStartDate.toISOString()} to ${periodEndDate.toISOString()}`)
    } else {
      console.log(`[PAYROLL RUN] No date range filter applied (periodStart: ${periodStartDate?.toISOString()}, periodEnd: ${periodEndDate?.toISOString()})`)
    }
    
    // Get all import rows for selected employees (we'll calculate minutes from inTime/outTime if needed)
    importRows = await (prisma as any).payrollImportRow?.findMany({
      where: whereClause,
      include: {
        linkedEmployee: true,
      },
    })
    
    // Debug: Log sample work dates to help diagnose timezone issues
    if (importRows.length > 0) {
      const sampleDates = importRows.slice(0, 3).map((row: any) => ({
        workDate: row.workDate?.toISOString(),
        employeeId: row.linkedEmployeeId,
      }))
      console.log(`[PAYROLL RUN] Sample work dates from found rows:`, sampleDates)
    }
    
    console.log(`[PAYROLL RUN] Found ${importRows.length} linked import rows for import ${sourceImportId} with ${selectedEmployeeIds.length} selected employees`)
    
    // Check if we have any linked rows BEFORE creating the run
    if (importRows.length === 0) {
      // Get count of rows without date filter for better error message
      const rowsWithoutDateFilter = await (prisma as any).payrollImportRow?.findMany({
        where: {
          importId: sourceImportId,
          linkedEmployeeId: { in: selectedEmployeeIds },
        },
        select: { id: true, workDate: true },
      })
      
      let errorDetails = `No import rows found for the selected ${selectedEmployeeIds.length} employee(s) in this import`
      if (periodStartDate && periodEndDate) {
        errorDetails += ` within the date range ${periodStartDate.toISOString().split('T')[0]} to ${periodEndDate.toISOString().split('T')[0]}`
      }
      
      if (rowsWithoutDateFilter && rowsWithoutDateFilter.length > 0) {
        const dateRange = rowsWithoutDateFilter.map((r: any) => r.workDate?.toISOString().split('T')[0]).filter(Boolean)
        const uniqueDates = [...new Set(dateRange)].sort()
        errorDetails += `. Found ${rowsWithoutDateFilter.length} row(s) for these employees, but they are outside the specified date range. Row dates: ${uniqueDates.slice(0, 5).join(', ')}${uniqueDates.length > 5 ? '...' : ''}`
      } else {
        errorDetails += `. Please ensure employees are linked to import rows in the Edit Import page.`
      }
      
      return NextResponse.json(
        { 
          error: 'No import rows found for selected employees.',
          details: errorDetails
        },
        { status: 400 }
      )
    }
    
    // Filter to only rows with valid time data (minutesWorked OR both inTime and outTime)
    const validImportRows = importRows.filter((row: any) => {
      // If minutesWorked exists, use it
      if (row.minutesWorked !== null && row.minutesWorked !== undefined && row.minutesWorked > 0) {
        return true
      }
      // If both inTime and outTime exist, we can calculate minutes
      if (row.inTime && row.outTime) {
        return true
      }
      return false
    })
    
    console.log(`[PAYROLL RUN] Filtered to ${validImportRows.length} rows with valid time data out of ${importRows.length} total rows`)
    
    if (validImportRows.length === 0) {
      return NextResponse.json(
        { 
          error: 'No valid time entries found for selected employees.',
          details: `Found ${importRows.length} import rows for the selected ${selectedEmployeeIds.length} employee(s), but none have valid clock-in/clock-out pairs or minutes worked. Please ensure import rows have valid time data.`
        },
        { status: 400 }
      )
    }
    
    // Use valid rows for processing
    importRows = validImportRows

    // Create the payroll run (only if we have data)
    // Ensure periodStartDate and periodEndDate are not null (required by schema)
    if (!periodStartDate || !periodEndDate) {
      return NextResponse.json(
        { 
          error: 'Invalid date range',
          details: 'Unable to determine period start and end dates. Please ensure the import has period dates set or provide them manually.'
        },
        { status: 400 }
      )
    }
    
    const payrollRun = await prisma.payrollRun.create({
      data: {
        name: name.trim(),
        periodStart: periodStartDate,
        periodEnd: periodEndDate,
        createdByUserId: session.user.id,
        status: 'DRAFT',
        sourceImportId: sourceImportId,
      },
    })

    // Helper function to split time interval into regular and overtime
    const splitTimeInterval = (
      inTime: Date,
      outTime: Date,
      workDate: Date,
      overtimeStartTime: number | null, // Minutes since midnight
      overtimeEnabled: boolean
    ): { regularMinutes: number; overtimeMinutes: number } => {
      if (!overtimeEnabled || overtimeStartTime === null) {
        // No overtime - all time is regular
        const diffMs = outTime.getTime() - inTime.getTime()
        const totalMinutes = Math.floor(diffMs / (1000 * 60))
        return { regularMinutes: totalMinutes, overtimeMinutes: 0 }
      }

      // Create overtime boundary for the work date
      const overtimeBoundary = new Date(workDate)
      overtimeBoundary.setHours(Math.floor(overtimeStartTime / 60), overtimeStartTime % 60, 0, 0)

      // Handle overnight shifts - split into two segments
      const isOvernight = outTime.getDate() !== inTime.getDate()
      
      if (isOvernight) {
        // Segment 1: inTime to end of day1
        const endOfDay1 = new Date(inTime)
        endOfDay1.setHours(23, 59, 59, 999)
        
        // Segment 2: start of day2 to outTime
        const startOfDay2 = new Date(outTime)
        startOfDay2.setHours(0, 0, 0, 0)

        // Process segment 1 (day1)
        let seg1Regular = 0
        let seg1Overtime = 0
        if (inTime < overtimeBoundary) {
          // Starts before overtime
          if (endOfDay1 < overtimeBoundary) {
            // Entirely before overtime
            seg1Regular = Math.floor((endOfDay1.getTime() - inTime.getTime()) / (1000 * 60))
          } else {
            // Crosses overtime boundary
            seg1Regular = Math.floor((overtimeBoundary.getTime() - inTime.getTime()) / (1000 * 60))
            seg1Overtime = Math.floor((endOfDay1.getTime() - overtimeBoundary.getTime()) / (1000 * 60))
          }
        } else {
          // Starts at or after overtime
          seg1Overtime = Math.floor((endOfDay1.getTime() - inTime.getTime()) / (1000 * 60))
        }

        // Process segment 2 (day2 - use same overtime boundary time but on day2)
        const overtimeBoundaryDay2 = new Date(startOfDay2)
        overtimeBoundaryDay2.setHours(Math.floor(overtimeStartTime / 60), overtimeStartTime % 60, 0, 0)
        
        let seg2Regular = 0
        let seg2Overtime = 0
        if (startOfDay2 < overtimeBoundaryDay2) {
          // Starts before overtime
          if (outTime < overtimeBoundaryDay2) {
            // Entirely before overtime
            seg2Regular = Math.floor((outTime.getTime() - startOfDay2.getTime()) / (1000 * 60))
          } else {
            // Crosses overtime boundary
            seg2Regular = Math.floor((overtimeBoundaryDay2.getTime() - startOfDay2.getTime()) / (1000 * 60))
            seg2Overtime = Math.floor((outTime.getTime() - overtimeBoundaryDay2.getTime()) / (1000 * 60))
          }
        } else {
          // Starts at or after overtime
          seg2Overtime = Math.floor((outTime.getTime() - startOfDay2.getTime()) / (1000 * 60))
        }

        return {
          regularMinutes: seg1Regular + seg2Regular,
          overtimeMinutes: seg1Overtime + seg2Overtime,
        }
      } else {
        // Same day shift
        if (outTime <= overtimeBoundary) {
          // Entirely before overtime
          const diffMs = outTime.getTime() - inTime.getTime()
          return { regularMinutes: Math.floor(diffMs / (1000 * 60)), overtimeMinutes: 0 }
        } else if (inTime >= overtimeBoundary) {
          // Entirely after overtime
          const diffMs = outTime.getTime() - inTime.getTime()
          return { regularMinutes: 0, overtimeMinutes: Math.floor(diffMs / (1000 * 60)) }
        } else {
          // Crosses overtime boundary
          const regularMs = overtimeBoundary.getTime() - inTime.getTime()
          const overtimeMs = outTime.getTime() - overtimeBoundary.getTime()
          return {
            regularMinutes: Math.floor(regularMs / (1000 * 60)),
            overtimeMinutes: Math.floor(overtimeMs / (1000 * 60)),
          }
        }
      }
    }

    // Aggregate by employee
    const employeeTotals = new Map<string, {
      employeeId: string
      employee: any
      totalMinutes: number
      regularMinutes: number
      overtimeMinutes: number
      hourlyRate: number
      overtimeRate: number | null
    }>()

    console.log(`[PAYROLL RUN] Processing ${importRows.length} import rows`)
    let unlinkedCount = 0
    let linkedCount = 0

    for (const row of importRows) {
      if (!row.linkedEmployeeId || !row.linkedEmployee) {
        unlinkedCount++
        console.log(`[PAYROLL RUN] Skipping row ${row.id} - no linked employee (employeeName: ${row.employeeNameRaw}, employeeExternalId: ${row.employeeExternalIdRaw})`)
        continue
      }

      linkedCount++
      const employeeId = row.linkedEmployeeId
      
      // Get employee overtime settings
      const overtimeRate = row.linkedEmployee.overtimeRateHourly 
        ? parseFloat(row.linkedEmployee.overtimeRateHourly.toString())
        : null
      const overtimeStartTime = row.linkedEmployee.overtimeStartTime !== null && row.linkedEmployee.overtimeStartTime !== undefined
        ? parseInt(row.linkedEmployee.overtimeStartTime.toString())
        : null
      const overtimeEnabled = row.linkedEmployee.overtimeEnabled === true && overtimeRate !== null && overtimeStartTime !== null

      // Calculate time interval
      let inTime: Date | null = null
      let outTime: Date | null = null
      let workDate: Date | null = null
      
      if (row.inTime && row.outTime) {
        inTime = new Date(row.inTime)
        outTime = new Date(row.outTime)
        workDate = new Date(row.workDate)
        
        // Handle overnight shifts
        if (outTime < inTime) {
          outTime.setDate(outTime.getDate() + 1)
        }
      } else if (row.minutesWorked !== null && row.minutesWorked !== undefined && row.minutesWorked > 0) {
        // If we only have minutesWorked, we can't split into regular/overtime without times
        // Treat all as regular in this case
        workDate = new Date(row.workDate)
      } else {
        console.log(`[PAYROLL RUN] Skipping row ${row.id} - no valid time data`)
        continue
      }

      if (!employeeTotals.has(employeeId)) {
        // Get hourly rate from employeeRates override or employee default
        const hourlyRate = employeeRates?.[employeeId] 
          ? parseFloat(employeeRates[employeeId])
          : parseFloat(row.linkedEmployee.defaultHourlyRate.toString())

        console.log(`[PAYROLL RUN] Adding employee ${row.linkedEmployee.fullName} (${employeeId}) with rate $${hourlyRate}, overtime: ${overtimeEnabled ? `$${overtimeRate} starting at ${overtimeStartTime} minutes` : 'disabled'}`)

        employeeTotals.set(employeeId, {
          employeeId,
          employee: row.linkedEmployee,
          totalMinutes: 0,
          regularMinutes: 0,
          overtimeMinutes: 0,
          hourlyRate,
          overtimeRate,
        })
      }

      const totals = employeeTotals.get(employeeId)!
      
      if (inTime && outTime && workDate) {
        // Split time into regular and overtime
        const split = splitTimeInterval(inTime, outTime, workDate, overtimeStartTime, overtimeEnabled)
        totals.regularMinutes += split.regularMinutes
        totals.overtimeMinutes += split.overtimeMinutes
        totals.totalMinutes += split.regularMinutes + split.overtimeMinutes
        
        console.log(`[PAYROLL RUN] Row ${row.id}: employee=${row.linkedEmployee.fullName}, regular=${split.regularMinutes}m, overtime=${split.overtimeMinutes}m`)
      } else if (row.minutesWorked) {
        // Fallback: if we only have minutesWorked, treat all as regular
        totals.regularMinutes += row.minutesWorked
        totals.totalMinutes += row.minutesWorked
        console.log(`[PAYROLL RUN] Row ${row.id}: employee=${row.linkedEmployee.fullName}, minutes=${row.minutesWorked} (all regular, no time split available)`)
      }
    }

    console.log(`[PAYROLL RUN] Summary: ${linkedCount} linked rows, ${unlinkedCount} unlinked rows, ${employeeTotals.size} employees with totals`)

    if (employeeTotals.size === 0) {
      return NextResponse.json(
        { 
          error: 'No employees found in import rows. Please link employees to import rows first.',
          details: `Found ${importRows.length} import rows, but ${unlinkedCount} are not linked to employees. Please go to the import edit page and link employees to the rows.`
        },
        { status: 400 }
      )
    }

    // Create PayrollRunLine records
    const runLines = Array.from(employeeTotals.values()).map(totals => {
      // Calculate hours and minutes as integers for regular time
      const regularHours = Math.floor(totals.regularMinutes / 60)
      const regularMins = totals.regularMinutes % 60
      
      // Calculate hours and minutes as integers for overtime
      const overtimeHours = Math.floor(totals.overtimeMinutes / 60)
      const overtimeMins = totals.overtimeMinutes % 60
      
      // Calculate pay: regular + overtime
      const regularPay = parseFloat(((regularHours * totals.hourlyRate) + (regularMins / 60 * totals.hourlyRate)).toFixed(2))
      const overtimePay = totals.overtimeRate && totals.overtimeMinutes > 0
        ? parseFloat(((overtimeHours * totals.overtimeRate) + (overtimeMins / 60 * totals.overtimeRate)).toFixed(2))
        : 0
      const grossPay = parseFloat((regularPay + overtimePay).toFixed(2))
      
      // Store totalHours as decimal for backward compatibility
      const totalHoursDecimal = parseFloat((totals.totalMinutes / 60).toFixed(2))
      
      console.log(`[PAYROLL RUN] Creating line for ${totals.employee.fullName}: regular=${totals.regularMinutes}m (${regularHours}h ${regularMins}m), overtime=${totals.overtimeMinutes}m (${overtimeHours}h ${overtimeMins}m), regularPay=$${regularPay}, overtimePay=$${overtimePay}, gross=$${grossPay}`)
      
      return {
        runId: payrollRun.id,
        employeeId: totals.employeeId,
        hourlyRateUsed: totals.hourlyRate,
        totalMinutes: totals.totalMinutes,
        totalHours: totalHoursDecimal,
        regularMinutes: totals.regularMinutes,
        overtimeMinutes: totals.overtimeMinutes,
        regularPay: regularPay,
        overtimePay: overtimePay,
        overtimeRateUsed: totals.overtimeRate,
        grossPay: grossPay,
        amountPaid: 0,
        amountOwed: grossPay,
        notes: null,
      }
    })

    console.log(`[PAYROLL RUN] Creating ${runLines.length} payroll run lines...`)
    await (prisma as any).payrollRunLine?.createMany({
      data: runLines,
    })
    console.log(`[PAYROLL RUN] Successfully created ${runLines.length} payroll run lines`)

    // Fetch the created run with lines
    const createdRun = await (prisma as any).payrollRun?.findUnique({
      where: { id: payrollRun.id },
      include: {
        lines: {
          include: {
            employee: true,
          },
        },
      },
    })

    return NextResponse.json({ run: createdRun })
  } catch (error: any) {
    console.error('Error creating payroll run:', error)
    return NextResponse.json(
      { error: 'Failed to create payroll run', details: error.message },
      { status: 500 }
    )
  }
}
