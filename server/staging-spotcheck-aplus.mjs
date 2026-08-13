// Supplementary A Plus staging check — confirms login + permission-gated
// endpoints correctly differentiate ADMIN vs STAFF after the same
// migrate -> seed/backfill -> deploy sequence used for SmartSteps.

const BASE = "http://localhost:4010/api";
const results = [];

function record(section, description, ok, detail) {
  results.push({ section, description, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${section} :: ${description} :: ${detail}`);
}

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (res.status !== 200 || !body.token) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(body)}`);
  return body.token;
}

async function api(token, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { /* noop */ }
  return { status: res.status, body };
}

async function main() {
  const adminToken = await login("admin@apluscenter.local", "StagingPass123!");
  const staffToken = await login("staff@apluscenter.local", "StagingPass123!");
  console.log("Logged in as ADMIN and STAFF via /api/auth/login (JWT).");

  const adminUsers = await api(adminToken, "/users");
  record("A Plus Admin", "GET /users (admin-only) accessible", adminUsers.status === 200, `status=${adminUsers.status}`);

  const staffUsers = await api(staffToken, "/users");
  record("A Plus Staff", "GET /users (admin-only) forbidden for STAFF", staffUsers.status === 403, `status=${staffUsers.status} body=${JSON.stringify(staffUsers.body)}`);

  const staffAppts = await api(staffToken, "/appointments");
  record("A Plus Staff", "GET /appointments accessible (staff scope)", staffAppts.status === 200, `status=${staffAppts.status}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} A Plus checks passed ===`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error("A PLUS SPOT-CHECK ERROR:", err);
  process.exitCode = 1;
});
