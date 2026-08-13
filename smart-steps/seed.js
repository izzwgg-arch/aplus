const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient({
  datasources: { db: { url: "postgresql://aba_user:abapass123@localhost:5432/aba_db?schema=public" } }
});
async function main() {
  const u = await db.user.upsert({
    where: { email: "admin@apluscenterinc.org" },
    create: { email: "admin@apluscenterinc.org", name: "Admin", role: "ADMIN" },
    update: { role: "ADMIN" }
  });
  console.log("User:", u.id, u.email, u.role);
  const users = await db.user.count();
  const clients = await db.client.count();
  console.log("Total users:", users, "Total clients:", clients);
  await db.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });