import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startPerfLog } from '@/lib/api-performance'

export async function GET(request: NextRequest) {
  const perf = startPerfLog('GET /api/payroll/imports')
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    
    const imports = await prisma.payrollImport.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: limit, // PERFORMANCE: Add pagination
      skip: (page - 1) * limit,
      include: {
        uploadedBy: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        _count: {
          select: {
            rows: true,
          },
        },
      },
    })

    const result = NextResponse.json({ imports })
    perf.end()
    return result
  } catch (error: any) {
    perf.end()
    console.error('Error fetching imports:', error)
    return NextResponse.json(
      { error: 'Failed to fetch imports', details: error.message },
      { status: 500 }
    )
  }
}
