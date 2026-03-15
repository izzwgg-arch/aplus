import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, format } from 'date-fns'
import { getTimesheetVisibilityScope } from '@/lib/permissions'
import { startPerfLog } from '@/lib/api-performance'

export async function GET(request: NextRequest) {
  const perf = startPerfLog('GET /api/analytics')
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const providerId = searchParams.get('providerId')
    const clientId = searchParams.get('clientId')
    const bcbaId = searchParams.get('bcbaId')
    const insuranceId = searchParams.get('insuranceId')

    // Default to last 12 months if no date range provided
    const endDate = endDateParam ? new Date(endDateParam) : new Date()
    const startDate = startDateParam
      ? new Date(startDateParam)
      : subMonths(endDate, 12)

    // Build where clause for timesheets
    const timesheetWhere: any = {
      deletedAt: null,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    }

    if (providerId) timesheetWhere.providerId = providerId
    if (clientId) timesheetWhere.clientId = clientId
    if (bcbaId) timesheetWhere.bcbaId = bcbaId
    if (insuranceId) timesheetWhere.insuranceId = insuranceId

    // Apply timesheet visibility scope (for consistency, even though admins typically have viewAll)
    const visibilityScope = await getTimesheetVisibilityScope(session.user.id)
    if (!visibilityScope.viewAll) {
      timesheetWhere.userId = { in: visibilityScope.allowedUserIds }
    }

    // Build where clause for invoices
    const invoiceWhere: any = {
      deletedAt: null,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    }

    if (clientId) invoiceWhere.clientId = clientId
    if (insuranceId) {
      invoiceWhere.entries = {
        some: {
          insuranceId,
        },
      }
    }

    // Fetch all data in parallel
    // PERFORMANCE FIX: Limit timesheets query to prevent scanning all records
    // Analytics only needs aggregated data, not full records
    const [
      timesheets,
      invoices,
      allProviders,
      allClients,
      allBCBAs,
      allInsurances,
    ] = await Promise.all([
      // PERFORMANCE FIX: Limit timesheets and use select instead of include
      prisma.timesheet.findMany({
        where: timesheetWhere,
        select: {
          id: true,
          createdAt: true,
          status: true,
          entries: {
            select: {
              units: true,
              minutes: true,
            },
          },
          provider: {
            select: {
              id: true,
              name: true,
            },
          },
          client: {
            select: {
              id: true,
              name: true,
            },
          },
          bcba: {
            select: {
              id: true,
              name: true,
            },
          },
          insurance: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        take: 5000, // PERFORMANCE: Reduced limit
        orderBy: { createdAt: 'desc' },
      }),

      // Invoices with entries, payments, and adjustments
      (prisma as any).invoice.findMany({
        where: invoiceWhere,
        include: {
          entries: {
            include: {
              provider: true,
              insurance: true,
            },
          },
          payments: true,
          adjustmentsList: true,
        },
      }),

      // Get all entities for filtering (if no filters applied)
      !providerId
        ? prisma.provider.findMany({
            where: { active: true, deletedAt: null },
          })
        : Promise.resolve([]),
      !clientId
        ? prisma.client.findMany({
            where: { active: true, deletedAt: null },
            include: { insurance: true },
          })
        : Promise.resolve([]),
      !bcbaId
        ? (prisma as any).bCBA.findMany({ where: { deletedAt: null } })
        : Promise.resolve([]),
      !insuranceId
        ? prisma.insurance.findMany({
            where: { active: true, deletedAt: null },
          })
        : Promise.resolve([]),
    ])

    // Process data for charts

    // 1. Revenue trends over time (monthly)
    const revenueTrends = calculateMonthlyRevenue(invoices, startDate, endDate)

    // 2. Timesheet creation trends (monthly)
    const timesheetTrends = calculateMonthlyTimesheetCounts(
      timesheets,
      startDate,
      endDate
    )

    // 3. Provider productivity (total units/hours by provider)
    const providerProductivity = calculateProviderProductivity(
      timesheets,
      providerId ? [providerId] : undefined
    )

    // 4. Client billing totals
    const clientBilling = calculateClientBilling(invoices, clientId ? [clientId] : undefined)

    // 5. Invoice status distribution
    const invoiceStatusDistribution = calculateInvoiceStatusDistribution(invoices)

    // 6. Financial waterfall (billed → paid → adjustments → outstanding)
    const financialWaterfall = calculateFinancialWaterfall(invoices)

    // 7. Insurance payout comparisons
    const insuranceComparisons = calculateInsuranceComparisons(invoices)

    // 8. Timesheet status breakdown
    const timesheetStatusBreakdown = calculateTimesheetStatusBreakdown(timesheets)

    // 9. Summary statistics
    const summary = calculateSummary(timesheets, invoices)

    const result = NextResponse.json({
      summary,
      revenueTrends,
      timesheetTrends,
      providerProductivity,
      clientBilling,
      invoiceStatusDistribution,
      financialWaterfall,
      insuranceComparisons,
      timesheetStatusBreakdown,
      filters: {
        providers: allProviders,
        clients: allClients,
        bcbas: allBCBAs,
        insurances: allInsurances,
      },
    })
    
    return result
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    )
  }
}

// Helper functions

function calculateMonthlyRevenue(
  invoices: any[],
  startDate: Date,
  endDate: Date
) {
  const monthlyData = new Map<string, { billed: number; paid: number }>()

  // Initialize all months in range
  let current = startOfMonth(startDate)
  while (current <= endDate) {
    const key = format(current, 'yyyy-MM')
    monthlyData.set(key, { billed: 0, paid: 0 })
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
  }

  // Aggregate invoice data
  invoices.forEach((invoice) => {
    const month = format(new Date(invoice.createdAt), 'yyyy-MM')
    const billed = parseFloat(invoice.totalAmount.toString())
    const paid = parseFloat(invoice.paidAmount.toString())

    if (monthlyData.has(month)) {
      const existing = monthlyData.get(month)!
      existing.billed += billed
      existing.paid += paid
    }
  })

  return Array.from(monthlyData.entries())
    .map(([month, data]) => ({
      month,
      label: format(new Date(month + '-01'), 'MMM yyyy'),
      billed: parseFloat(data.billed.toFixed(2)),
      paid: parseFloat(data.paid.toFixed(2)),
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

function calculateMonthlyTimesheetCounts(
  timesheets: any[],
  startDate: Date,
  endDate: Date
) {
  const monthlyData = new Map<string, {
    created: number
    approved: number
    rejected: number
  }>()

  // Initialize all months
  let current = startOfMonth(startDate)
  while (current <= endDate) {
    const key = format(current, 'yyyy-MM')
    monthlyData.set(key, { created: 0, approved: 0, rejected: 0 })
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
  }

  // Aggregate timesheet data
  timesheets.forEach((ts) => {
    const month = format(new Date(ts.createdAt), 'yyyy-MM')
    if (monthlyData.has(month)) {
      const existing = monthlyData.get(month)!
      existing.created++
      if (ts.status === 'APPROVED') existing.approved++
      if (ts.status === 'REJECTED') existing.rejected++
    }
  })

  return Array.from(monthlyData.entries())
    .map(([month, data]) => ({
      month,
      label: format(new Date(month + '-01'), 'MMM yyyy'),
      created: data.created,
      approved: data.approved,
      rejected: data.rejected,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

function calculateProviderProductivity(timesheets: any[], filterProviderIds?: string[]) {
  const providerMap = new Map<string, {
    name: string
    units: number
    hours: number
    timesheetCount: number
  }>()

  timesheets.forEach((ts) => {
    if (filterProviderIds && !filterProviderIds.includes(ts.providerId)) return

    const providerId = ts.providerId
    const providerName = ts.provider.name

    if (!providerMap.has(providerId)) {
      providerMap.set(providerId, {
        name: providerName,
        units: 0,
        hours: 0,
        timesheetCount: 0,
      })
    }

    const provider = providerMap.get(providerId)!
    provider.timesheetCount++

    ts.entries.forEach((entry: any) => {
      provider.units += parseFloat(entry.units.toString())
      provider.hours += entry.minutes / 60
    })
  })

  return Array.from(providerMap.values())
    .map((p) => ({
      ...p,
      units: parseFloat(p.units.toFixed(2)),
      hours: parseFloat(p.hours.toFixed(2)),
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10) // Top 10
}

function calculateClientBilling(invoices: any[], filterClientIds?: string[]) {
  const clientMap = new Map<string, {
    name: string
    totalBilled: number
    totalPaid: number
    outstanding: number
    invoiceCount: number
  }>()

  invoices.forEach((invoice) => {
    if (filterClientIds && !filterClientIds.includes(invoice.clientId)) return

    const clientId = invoice.clientId
    const clientName = invoice.client?.name || 'Unknown'

    if (!clientMap.has(clientId)) {
      clientMap.set(clientId, {
        name: clientName,
        totalBilled: 0,
        totalPaid: 0,
        outstanding: 0,
        invoiceCount: 0,
      })
    }

    const client = clientMap.get(clientId)!
    client.invoiceCount++
    client.totalBilled += parseFloat(invoice.totalAmount.toString())
    client.totalPaid += parseFloat(invoice.paidAmount.toString())
    client.outstanding += parseFloat(invoice.outstanding.toString())
  })

  return Array.from(clientMap.values())
    .map((c) => ({
      ...c,
      totalBilled: parseFloat(c.totalBilled.toFixed(2)),
      totalPaid: parseFloat(c.totalPaid.toFixed(2)),
      outstanding: parseFloat(c.outstanding.toFixed(2)),
    }))
    .sort((a, b) => b.totalBilled - a.totalBilled)
}

function calculateInvoiceStatusDistribution(invoices: any[]) {
  const statusMap = new Map<string, number>()

  invoices.forEach((invoice) => {
    const status = invoice.status
    statusMap.set(status, (statusMap.get(status) || 0) + 1)
  })

  return Array.from(statusMap.entries()).map(([status, count]) => ({
    status,
    label: status.replace(/_/g, ' '),
    count,
  }))
}

function calculateFinancialWaterfall(invoices: any[]) {
  let totalBilled = 0
  let totalPaid = 0
  let totalAdjustments = 0

  invoices.forEach((invoice) => {
    totalBilled += parseFloat(invoice.totalAmount.toString())
    totalPaid += parseFloat(invoice.paidAmount.toString())
    totalAdjustments += parseFloat(
      (invoice.adjustments || new Decimal(0)).toString()
    )
  })

  const outstanding = totalBilled - totalPaid + totalAdjustments

  return [
    { label: 'Total Billed', value: parseFloat(totalBilled.toFixed(2)) },
    { label: 'Total Paid', value: parseFloat(totalPaid.toFixed(2)) },
    {
      label: 'Adjustments',
      value: parseFloat(totalAdjustments.toFixed(2)),
    },
    { label: 'Outstanding', value: parseFloat(outstanding.toFixed(2)) },
  ]
}

function calculateInsuranceComparisons(invoices: any[]) {
  const insuranceMap = new Map<string, {
    name: string
    totalBilled: number
    totalPaid: number
    invoiceCount: number
  }>()

  invoices.forEach((invoice) => {
    invoice.entries.forEach((entry: any) => {
      const insuranceId = entry.insuranceId
      const insuranceName = entry.insurance?.name || 'Unknown'

      if (!insuranceMap.has(insuranceId)) {
        insuranceMap.set(insuranceId, {
          name: insuranceName,
          totalBilled: 0,
          totalPaid: 0,
          invoiceCount: 0,
        })
      }

      const insurance = insuranceMap.get(insuranceId)!
      insurance.totalBilled += parseFloat(entry.amount.toString())
    })

    // Distribute paid amount proportionally (simplified)
    const invoiceTotal = parseFloat(invoice.totalAmount.toString())
    const paidAmount = parseFloat(invoice.paidAmount.toString())
    const ratio = invoiceTotal > 0 ? paidAmount / invoiceTotal : 0

    invoice.entries.forEach((entry: any) => {
      const insurance = insuranceMap.get(entry.insuranceId)!
      insurance.totalPaid += parseFloat(entry.amount.toString()) * ratio
      insurance.invoiceCount++
    })
  })

  return Array.from(insuranceMap.values())
    .map((i) => ({
      ...i,
      totalBilled: parseFloat(i.totalBilled.toFixed(2)),
      totalPaid: parseFloat(i.totalPaid.toFixed(2)),
    }))
    .sort((a, b) => b.totalBilled - a.totalBilled)
}

function calculateTimesheetStatusBreakdown(timesheets: any[]) {
  const statusMap = new Map<string, number>()

  timesheets.forEach((ts) => {
    const status = ts.status
    statusMap.set(status, (statusMap.get(status) || 0) + 1)
  })

  return Array.from(statusMap.entries()).map(([status, count]) => ({
    status,
    label: status.charAt(0) + status.slice(1).toLowerCase(),
    count,
  }))
}

function calculateSummary(timesheets: any[], invoices: any[]) {
  const totalTimesheets = timesheets.length
  const approvedTimesheets = timesheets.filter((ts) => ts.status === 'APPROVED').length
  const rejectedTimesheets = timesheets.filter((ts) => ts.status === 'REJECTED').length

  let totalBilled = 0
  let totalPaid = 0
  let totalOutstanding = 0

  invoices.forEach((invoice) => {
    totalBilled += parseFloat(invoice.totalAmount.toString())
    totalPaid += parseFloat(invoice.paidAmount.toString())
    totalOutstanding += parseFloat(invoice.outstanding.toString())
  })

  return {
    totalTimesheets,
    approvedTimesheets,
    rejectedTimesheets,
    totalInvoices: invoices.length,
    totalBilled: parseFloat(totalBilled.toFixed(2)),
    totalPaid: parseFloat(totalPaid.toFixed(2)),
    totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
  }
}
