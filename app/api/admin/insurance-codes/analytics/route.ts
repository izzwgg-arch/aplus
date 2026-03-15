import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { computeInsuranceCodesAnalytics } from '@/lib/insuranceCodes/calcUsage'

const requireAdmin = async () => {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return null
  }
  return session
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get('clientId') || undefined
    const insuranceId = searchParams.get('insuranceId') || undefined
    const search = (searchParams.get('search') || '').trim()
    const dateParam = searchParams.get('date')
    const baseDate = dateParam ? new Date(dateParam) : new Date()
    const debug = searchParams.get('debug') === '1'

    const where: any = {}
    if (clientId) where.clientId = clientId
    if (insuranceId) where.insuranceId = insuranceId
    if (search) {
      where.OR = [
        { cptCode: { contains: search, mode: 'insensitive' } },
        { codeName: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { insurance: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const stats = await computeInsuranceCodesAnalytics({
      clientId,
      insuranceId,
      search,
      today: baseDate,
      debug,
    })

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching insurance code analytics:', error)
    return NextResponse.json({ error: 'Failed to fetch insurance code analytics' }, { status: 500 })
  }
}
