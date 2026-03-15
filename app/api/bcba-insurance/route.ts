import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { getUserPermissions } from '@/lib/permissions'

/**
 * GET /api/bcba-insurance
 * List all BCBA insurance records
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions
    const permissions = await getUserPermissions(session.user.id)
    const canView = 
      permissions['bcbaInsurance.view']?.canView === true ||
      session.user.role === 'ADMIN' ||
      session.user.role === 'SUPER_ADMIN'

    if (!canView) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      )
    }

    // Check if BcbaInsurance table exists, create it if not
    try {
      await prisma.$queryRaw`SELECT id FROM "BcbaInsurance" LIMIT 1`
    } catch (error: any) {
      if (error.message?.includes('relation "BcbaInsurance" does not exist') || 
          error.message?.includes('does not exist')) {
        // Table doesn't exist, create it
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "BcbaInsurance" (
            "id" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "ratePerUnit" DECIMAL(10,2) NOT NULL,
            "unitMinutes" INTEGER NOT NULL DEFAULT 15,
            "active" BOOLEAN NOT NULL DEFAULT true,
            "notes" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            "deletedAt" TIMESTAMP(3),
            CONSTRAINT "BcbaInsurance_pkey" PRIMARY KEY ("id")
          )
        `)
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "BcbaInsurance_name_key" ON "BcbaInsurance"("name")`)
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BcbaInsurance_name_idx" ON "BcbaInsurance"("name")`)
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BcbaInsurance_active_deletedAt_idx" ON "BcbaInsurance"("active", "deletedAt")`)
        
        // Also add bcbaInsuranceId column to Timesheet if it doesn't exist
        try {
          await prisma.$executeRawUnsafe(`ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "bcbaInsuranceId" TEXT`)
          try {
            await prisma.$executeRawUnsafe(`
              ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_bcbaInsuranceId_fkey" 
              FOREIGN KEY ("bcbaInsuranceId") REFERENCES "BcbaInsurance"("id") 
              ON DELETE SET NULL ON UPDATE CASCADE
            `)
          } catch (fkError: any) {
            // Foreign key might already exist, ignore
          }
        } catch (colError: any) {
          // Column might already exist, ignore
        }
      } else {
        throw error
      }
    }

    // Use raw SQL since Prisma client may not recognize the model
    const insurances = await prisma.$queryRawUnsafe<Array<{
      id: string
      name: string
      ratePerUnit: any
      unitMinutes: number
      active: boolean
      notes: string | null
      createdAt: Date
      updatedAt: Date
      deletedAt: Date | null
    }>>(`
      SELECT * FROM "BcbaInsurance"
      WHERE "deletedAt" IS NULL
      ORDER BY "name" ASC
    `)

    // Convert Decimal to number for JSON
    const serialized = insurances.map((ins: any) => ({
      id: ins.id,
      name: ins.name,
      ratePerUnit: typeof ins.ratePerUnit === 'object' && 'toNumber' in ins.ratePerUnit
        ? ins.ratePerUnit.toNumber()
        : Number(ins.ratePerUnit) || 0,
      unitMinutes: ins.unitMinutes,
      active: ins.active,
      notes: ins.notes,
      createdAt: ins.createdAt,
      updatedAt: ins.updatedAt,
    }))

    return NextResponse.json(serialized)
  } catch (error: any) {
    console.error('[BCBA INSURANCE] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch BCBA insurance', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/bcba-insurance
 * Create new BCBA insurance record
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions
    const permissions = await getUserPermissions(session.user.id)
    const canCreate = 
      permissions['bcbaInsurance.manage']?.canCreate === true ||
      session.user.role === 'ADMIN' ||
      session.user.role === 'SUPER_ADMIN'

    if (!canCreate) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      )
    }

    // Check if BcbaInsurance table exists, create it if not
    try {
      await prisma.$queryRaw`SELECT id FROM "BcbaInsurance" LIMIT 1`
    } catch (error: any) {
      if (error.message?.includes('relation "BcbaInsurance" does not exist') || 
          error.message?.includes('does not exist')) {
        // Table doesn't exist, create it
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "BcbaInsurance" (
            "id" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "ratePerUnit" DECIMAL(10,2) NOT NULL,
            "unitMinutes" INTEGER NOT NULL DEFAULT 15,
            "active" BOOLEAN NOT NULL DEFAULT true,
            "notes" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            "deletedAt" TIMESTAMP(3),
            CONSTRAINT "BcbaInsurance_pkey" PRIMARY KEY ("id")
          )
        `)
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "BcbaInsurance_name_key" ON "BcbaInsurance"("name")`)
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BcbaInsurance_name_idx" ON "BcbaInsurance"("name")`)
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BcbaInsurance_active_deletedAt_idx" ON "BcbaInsurance"("active", "deletedAt")`)
      } else {
        throw error
      }
    }

    const body = await request.json()
    const { name, ratePerUnit, unitMinutes, active, notes } = body

    if (!name || !ratePerUnit) {
      return NextResponse.json(
        { error: 'Name and rate per unit are required' },
        { status: 400 }
      )
    }

    // Generate ID (using crypto.randomUUID() for UUID or cuid-like string)
    const { randomUUID } = await import('crypto')
    const id = randomUUID()
    const now = new Date()
    const trimmedName = name.trim()
    const finalUnitMinutes = unitMinutes || 15
    const finalActive = active !== false
    const finalNotes = notes || null

    // Use raw SQL to insert since Prisma client may not recognize the model
    // Cast ratePerUnit to DECIMAL to match column type
    const ratePerUnitDecimal = new Decimal(ratePerUnit)
    await prisma.$executeRawUnsafe(`
      INSERT INTO "BcbaInsurance" (
        "id", "name", "ratePerUnit", "unitMinutes", "active", "notes", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3::DECIMAL(10,2), $4, $5, $6, $7, $8)
    `, id, trimmedName, ratePerUnitDecimal.toString(), finalUnitMinutes, finalActive, finalNotes, now, now)

    // Fetch the created record using raw SQL
    const result = await prisma.$queryRawUnsafe<Array<{
      id: string
      name: string
      ratePerUnit: any
      unitMinutes: number
      active: boolean
      notes: string | null
      createdAt: Date
      updatedAt: Date
      deletedAt: Date | null
    }>>(`
      SELECT * FROM "BcbaInsurance" WHERE "id" = $1
    `, id)

    const insurance = result[0]
    if (!insurance) {
      throw new Error('Failed to retrieve created BCBA insurance record')
    }

    return NextResponse.json({
      id: insurance.id,
      name: insurance.name,
      ratePerUnit: typeof insurance.ratePerUnit === 'object' && 'toNumber' in insurance.ratePerUnit
        ? insurance.ratePerUnit.toNumber()
        : Number(insurance.ratePerUnit) || 0,
      unitMinutes: insurance.unitMinutes,
      active: insurance.active,
      notes: insurance.notes,
      createdAt: insurance.createdAt,
      updatedAt: insurance.updatedAt,
    })
  } catch (error: any) {
    console.error('[BCBA INSURANCE] Error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'BCBA Insurance with this name already exists' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create BCBA insurance', details: error.message },
      { status: 500 }
    )
  }
}
