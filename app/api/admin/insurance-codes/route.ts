import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatDateOnlyFromUTC, parseDateOnlyToUTC } from '@/lib/insuranceCodes/dateOnly'
import { getServiceTypeMatchValues, normalizeServiceType } from '@/lib/insuranceCodes/constants'

const requireAdmin = async () => {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return null
  }
  return session
}

const buildServiceTypeFilter = (serviceType: string) => {
  const values = getServiceTypeMatchValues(serviceType as any)
  return { in: values }
}

const sumUnitsForRange = async (params: {
  clientId: string
  insuranceId: string
  serviceType: string
  isBCBA: boolean
  startDate: Date
  endDate: Date
}) => {
  if (params.startDate > params.endDate) return 0
  const result = await prisma.timesheetEntry.aggregate({
    _sum: { units: true },
    where: {
      date: {
        gte: params.startDate,
        lte: params.endDate,
      },
      timesheet: {
        clientId: params.clientId,
        insuranceId: params.insuranceId,
        isBCBA: params.isBCBA,
        deletedAt: null,
        serviceType: buildServiceTypeFilter(params.serviceType),
      },
    },
  })

  return Number(result._sum.units || 0)
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = (searchParams.get('search') || '').trim()
    const normalizedSearchType = normalizeServiceType(search)

    const where: any = {}
    if (search) {
      where.OR = [
        { cptCode: { contains: search, mode: 'insensitive' } },
        { codeName: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { insurance: { name: { contains: search, mode: 'insensitive' } } },
      ]
      if (normalizedSearchType) {
        where.OR.push({ serviceType: normalizedSearchType })
      }
    }

    const authorizations = await prisma.insuranceCodeAuthorization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, name: true } },
        insurance: { select: { id: true, name: true } },
      },
    })

    const overlapLookup = authorizations.reduce<Record<string, typeof authorizations>>((acc, auth) => {
      const key = `${auth.clientId}|${auth.insuranceId}|${auth.cptCode}|${auth.serviceType}|${auth.isActive}`
      if (!acc[key]) acc[key] = []
      acc[key].push(auth)
      return acc
    }, {})

    const withUsage = await Promise.all(
      authorizations.map(async (auth) => {
        const key = `${auth.clientId}|${auth.insuranceId}|${auth.cptCode}|${auth.serviceType}|${auth.isActive}`
        const overlaps = overlapLookup[key]?.filter((other) =>
          other.id !== auth.id &&
          auth.startDate <= other.endDate &&
          auth.endDate >= other.startDate
        ) || []

        const usedUnitsRegular = auth.appliesTo === 'BCBA'
          ? 0
          : await sumUnitsForRange({
              clientId: auth.clientId,
              insuranceId: auth.insuranceId,
              serviceType: auth.serviceType,
              isBCBA: false,
              startDate: auth.startDate,
              endDate: auth.endDate,
            })

        const usedUnitsBcba = auth.appliesTo === 'REGULAR'
          ? 0
          : await sumUnitsForRange({
              clientId: auth.clientId,
              insuranceId: auth.insuranceId,
              serviceType: auth.serviceType,
              isBCBA: true,
              startDate: auth.startDate,
              endDate: auth.endDate,
            })

        const usedUnitsTotal = usedUnitsRegular + usedUnitsBcba
        const remainingUnits = auth.authorizedUnits - usedUnitsTotal

        return {
          ...auth,
          startDate: formatDateOnlyFromUTC(auth.startDate),
          endDate: formatDateOnlyFromUTC(auth.endDate),
          usedUnitsAuthRange: usedUnitsTotal,
          remainingUnitsAuthRange: remainingUnits,
          hasOverlap: overlaps.length > 0,
        }
      })
    )

    return NextResponse.json(withUsage)
  } catch (error) {
    console.error('Error fetching insurance codes:', error)
    return NextResponse.json({ error: 'Failed to fetch insurance codes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    const {
      clientId,
      insuranceId,
      cptCode,
      codeName,
      serviceType,
      appliesTo,
      startDate,
      endDate,
      authorizedUnits,
      notes,
      isActive,
    } = data

    if (!clientId || !insuranceId || !cptCode || !codeName || !serviceType || !appliesTo || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const unitsValue = Number(authorizedUnits)
    if (!Number.isFinite(unitsValue) || unitsValue <= 0 || !Number.isInteger(unitsValue)) {
      return NextResponse.json({ error: 'Authorized units must be a positive integer' }, { status: 400 })
    }

    const start = parseDateOnlyToUTC(startDate)
    const end = parseDateOnlyToUTC(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }
    if (end < start) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
    }

    const created = await prisma.insuranceCodeAuthorization.create({
      data: {
        clientId,
        insuranceId,
        cptCode: cptCode.trim(),
        codeName: codeName.trim(),
        serviceType,
        appliesTo,
        startDate: start,
        endDate: end,
        authorizedUnits: unitsValue,
        notes: notes?.trim() || null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
      include: {
        client: { select: { id: true, name: true } },
        insurance: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('Error creating insurance code:', error)
    return NextResponse.json({ error: 'Failed to create insurance code' }, { status: 500 })
  }
}
