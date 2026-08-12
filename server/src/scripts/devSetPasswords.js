/**
 * DEV ONLY — sets a known password on the seeded local test accounts so
 * they can be used for local development / the "Dev Login" quick panel.
 *
 * Refuses to run against anything that doesn't look like a local dev
 * database, as a safety net against accidentally running in production.
 *
 * Usage: node src/scripts/devSetPasswords.js
 */
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";

export const DEV_PASSWORD = "DevPass123!";

const DEV_ACCOUNTS = [
  { email: "admin@apluscenter.local", role: "ADMIN", fullName: "A+ Admin" },
  { email: "bcba@apluscenter.local", role: "BCBA", fullName: "A+ BCBA" },
  { email: "staff@apluscenter.local", role: "STAFF", fullName: "A+ Staff" },
];

function assertLocalDatabase() {
  const url = env.databaseUrl || process.env.DATABASE_URL || "";
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  if (!isLocal) {
    throw new Error(
      "Refusing to run devSetPasswords: DATABASE_URL does not look like a local database. " +
        "This script is for local development only."
    );
  }
}

async function main() {
  assertLocalDatabase();
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  for (const account of DEV_ACCOUNTS) {
    await prisma.user.upsert({
      where: { email: account.email },
      update: { passwordHash, status: "ACTIVE" },
      create: {
        email: account.email,
        fullName: account.fullName,
        role: account.role,
        status: "ACTIVE",
        passwordHash,
      },
    });
    console.log(`✔ ${account.email} (${account.role}) — password set`);
  }

  console.log(`\nDev password for all accounts above: ${DEV_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
