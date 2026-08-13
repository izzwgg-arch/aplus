/* One-off diagnostic: decrypt the stored SmartSteps SMTP password and attempt a
   real Gmail login. Prints NO secret — only length/among diagnostics + result. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const envPath = path.join(process.cwd(), ".env.local");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
process.env.DATABASE_URL = env.DATABASE_URL;
const ENC = env.ENCRYPTION_KEY || "";

function decrypt(payload) {
  if (!payload) return "";
  const key = crypto.createHash("sha256").update(ENC).digest();
  const [ivHex, encHex] = payload.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const d = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

(async () => {
  console.log("ENCRYPTION_KEY present:", Boolean(ENC), "len:", ENC.length);
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const row = await prisma.organizationSettings.findUnique({ where: { id: "singleton" } });
  if (!row) { console.log("NO SETTINGS ROW"); process.exit(1); }

  let pass = "";
  try { pass = decrypt(row.smtpPasswordEnc); }
  catch (e) { console.log("DECRYPT_FAIL:", e.message); }

  console.log("host=%s port=%s secure=%s", row.smtpHost, row.smtpPort, row.smtpSecure);
  console.log("emailUser=[%s]", row.emailUser);
  console.log("emailFromAddress=[%s]", row.emailFromAddress);
  console.log("decrypted pass length=%d  hasSpaces=%s  allAlnum=%s",
    pass.length, /\s/.test(pass), /^[A-Za-z0-9]+$/.test(pass));

  const nodemailer = require("nodemailer");
  const user = row.emailUser || row.emailFromAddress;

  async function tryLogin(label, opts) {
    const t = nodemailer.createTransport(opts);
    try { await t.verify(); console.log(label, "=> VERIFY_OK"); return true; }
    catch (e) { console.log(label, "=> FAIL:", (e && e.message ? e.message : e)); return false; }
  }

  // Try the saved config, plus common alternates, to pinpoint the cause.
  await tryLogin("465/SSL   ", { host: "smtp.gmail.com", port: 465, secure: true,  auth: { user, pass } });
  await tryLogin("587/STARTTLS", { host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true, auth: { user, pass } });

  await prisma.$disconnect();
})().catch((e) => { console.log("SCRIPT_ERROR:", e.message); process.exit(1); });
