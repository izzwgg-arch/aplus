#!/bin/bash
# Seed script - creates admin user and a test client
cd /var/www/aplus/aplus-center-scheduling/smart-steps

node << 'JSEOF'
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({
  datasources: { db: { url: 'postgresql://aba_user:abapass123@localhost:5432/aba_db?schema=public' } }
});

async function seed() {
  try {
    // Create admin user
    const user = await db.user.upsert({
      where: { email: 'admin@apluscenterinc.org' },
      create: {
        email: 'admin@apluscenterinc.org',
        name: 'Admin',
        role: 'ADMIN',
        hashedPassword: null,
      },
      update: { role: 'ADMIN' }
    });
    console.log('User:', user.id, user.email, user.role);

    // Count tables
    const counts = await Promise.all([
      db.user.count(),
      db.client.count(),
      db.program.count(),
    ]);
    console.log('Users:', counts[0], 'Clients:', counts[1], 'Programs:', counts[2]);
    console.log('DB is ready!');
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await db.$disconnect();
  }
}

seed();
JSEOF