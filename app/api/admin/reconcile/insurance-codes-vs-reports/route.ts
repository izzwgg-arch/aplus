import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildTimesheetWhereClause, buildEntryWhereClause } from '@/lib/reports/queryBuilder'
import { calcAuthorizationUsage } from '@/lib/insuranceCodes/calcUsage'
import { normalizeRegularServiceType } from '@/lib/insuranceCodes/normalizeServiceType'
import { parseDateOnlyToUTC } from '@/lib/insuranceCodes/dateOnly'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get('clientId')
    const insuranceId = searchParams.get('insuranceId')
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')

    if (!clientId || !startDateStr || !endDateStr) {
      return NextResponse.json({ error: 'clientId, startDate, and endDate are required' }, { status: 400 })
    }

    const startDate = parseDateOnlyToUTC(startDateStr)
    const endDate = parseDateOnlyToUTC(endDateStr)

    const filters: any = {
      clientId,
      insuranceId: insuranceId && insuranceId !== 'all' ? insuranceId : undefined,
      startDate,
      endDate,
    }

    const timesheetWhereNoDate = buildTimesheetWhereClause({
      ...filters,
      startDate: undefined,
      endDate: undefined,
    })

    const entryWhere = buildEntryWhereClause(filters, timesheetWhereNoDate)

    const entries = await prisma.timesheetEntry.findMany({
      where: entryWhere,
      include: {
        timesheet: {
          select: {
            id: true,
            clientId: true,
            insuranceId: true,
            serviceType: true,
            isBCBA: true,
            status: true,
            insurance: { select: { id: true, name: true } },
          },
        },
      },
    })

    const rawTimesheetRows = entries.map((entry) => {
      const serviceTypeRaw = entry.timesheet.isBCBA
        ? (entry.notes || entry.timesheet.serviceType || '')
        : (entry.notes || entry.timesheet.serviceType || '')
      const normalized = entry.timesheet.isBCBA
        ? serviceTypeRaw
        : (normalizeRegularServiceType(serviceTypeRaw) || serviceTypeRaw)

      return {
        id: entry.timesheetId,
        date: entry.date.toISOString().slice(0, 10),
        source: entry.timesheet.isBCBA ? 'BCBA' : 'REGULAR',
        insuranceId: entry.timesheet.insuranceId,
        insuranceName: entry.timesheet.insurance?.name || null,
        clientId: entry.timesheet.clientId,
        serviceTypeRaw,
        serviceTypeNormalized: normalized,
        status: entry.timesheet.status,
        units: Number(entry.units || 0),
        hours: entry.minutes / 60,
      }
    })

    const reportsTotals = rawTimesheetRows.reduce(
      (acc, row) => {
        acc.totalUnits += row.units
        acc.totalHours += row.hours
        return acc
      },
      { totalUnits: 0, totalHours: 0 }
    )

    const authWhere: any = { clientId }
    if (insuranceId && insuranceId !== 'all') authWhere.insuranceId = insuranceId
    const authorizations = await prisma.insuranceCodeAuthorization.findMany({
      where: authWhere,
      include: {
        insurance: { select: { id: true, regularUnitMinutes: true, bcbaUnitMinutes: true } },
      },
    })

    const unitMinutesByInsurance = authorizations.reduce<Record<string, { regular: number; bcba: number }>>((acc, auth) => {
      if (!acc[auth.insuranceId]) {
        acc[auth.insuranceId] = {
          regular: auth.insurance.regularUnitMinutes || auth.insurance.bcbaUnitMinutes || 15,
          bcba: auth.insurance.bcbaUnitMinutes || auth.insurance.regularUnitMinutes || 15,
        }
      }
      return acc
    }, {})

    const insuranceCodesTotals = authorizations.reduce(
      (acc, auth) => {
        const usage = calcAuthorizationUsage(auth, { entries, unitMinutesByInsurance })
        acc.totalUnits += usage.usedTotal
        acc.totalHours += (usage.usedTotal * (unitMinutesByInsurance[auth.insuranceId]?.regular || 15)) / 60
        return acc
      },
      { totalUnits: 0, totalHours: 0 }
    )

    const mismatchReasons: string[] = []
    if (Math.abs(reportsTotals.totalUnits - insuranceCodesTotals.totalUnits) > 0.01) {
      mismatchReasons.push('Total units differ between reports and insurance codes logic.')
    }
    if (Math.abs(reportsTotals.totalHours - insuranceCodesTotals.totalHours) > 0.01) {
      mismatchReasons.push('Total hours differ between reports and insurance codes logic.')
    }

    return NextResponse.json({
      input: {
        clientId,
        insuranceId: insuranceId || 'all',
        startDate: startDateStr,
        endDate: endDateStr,
      },
      reportsTotals,
      insuranceCodesTotals,
      rawTimesheetRows,
      mismatchReasons,
    })
  } catch (error) {
    console.error('Error reconciling insurance codes vs reports:', error)
    return NextResponse.json({ error: 'Failed to reconcile insurance codes vs reports' }, { status: 500 })
  }
}
