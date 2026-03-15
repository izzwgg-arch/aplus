const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function createTables() {
  try {
    // Create CommunityClient table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CommunityClient" (
        id TEXT PRIMARY KEY,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "deletedAt" TIMESTAMP,
        status TEXT DEFAULT 'ACTIVE',
        "firstName" TEXT NOT NULL,
        "lastName" TEXT NOT NULL,
        address TEXT,
        city TEXT,
        state TEXT,
        "zipCode" TEXT,
        phone TEXT,
        email TEXT,
        notes TEXT
      )
    `)
    console.log('✅ CommunityClient table created')

    // Create CommunityClass table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CommunityClass" (
        id TEXT PRIMARY KEY,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        name TEXT NOT NULL,
        "ratePerUnit" DECIMAL(10,2) NOT NULL,
        "isActive" BOOLEAN DEFAULT true,
        "deletedAt" TIMESTAMP
      )
    `)
    console.log('✅ CommunityClass table created')

    // Create enum
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "CommunityInvoiceStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'QUEUED', 'EMAILED', 'FAILED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)
    console.log('✅ CommunityInvoiceStatus enum created')

    // Create CommunityInvoice table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CommunityInvoice" (
        id TEXT PRIMARY KEY,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "deletedAt" TIMESTAMP,
        "clientId" TEXT NOT NULL,
        "classId" TEXT NOT NULL,
        units INTEGER NOT NULL,
        "unitMinutes" INTEGER DEFAULT 30,
        "ratePerUnit" DECIMAL(10,2) NOT NULL,
        "totalAmount" DECIMAL(10,2) NOT NULL,
        status "CommunityInvoiceStatus" DEFAULT 'DRAFT',
        "approvedAt" TIMESTAMP,
        "approvedByUserId" TEXT,
        "rejectedAt" TIMESTAMP,
        "rejectedByUserId" TEXT,
        "queuedAt" TIMESTAMP,
        "emailedAt" TIMESTAMP,
        notes TEXT,
        "serviceDate" TIMESTAMP,
        "createdByUserId" TEXT NOT NULL,
        FOREIGN KEY ("clientId") REFERENCES "CommunityClient"(id),
        FOREIGN KEY ("classId") REFERENCES "CommunityClass"(id)
      )
    `)
    console.log('✅ CommunityInvoice table created')

    console.log('✅ All Community tables created successfully!')
  } catch (error) {
    console.error('❌ Error creating tables:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

createTables()
