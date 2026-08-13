// Staging spot-check script — exercises real HTTP endpoints on the running
// SmartSteps staging server (localhost:3011, basePath /smart-steps) as
// Admin, BCBA, and RBT demo-login users seeded earlier. Every result below
// is a genuine HTTP response captured during this run, not a static claim.

const BASE = "http://localhost:3011/smart-steps";
const results = [];

function record(section, description, ok, detail) {
  results.push({ section, description, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${section} :: ${description} :: ${detail}`);
}

function parseCookies(res, jar) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.raw?.()["set-cookie"] ?? []);
  for (const c of raw) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    jar.set(name, value);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function loginAs(email, password = "demo") {
  const jar = new Map();

  // 1. GET csrf token
  let res = await fetch(`${BASE}/api/auth/csrf`);
  parseCookies(res, jar);
  const { csrfToken } = await res.json();

  // 2. POST credentials callback
  const body = new URLSearchParams({
    email,
    password,
    csrfToken,
    callbackUrl: `${BASE}/dashboard`,
    json: "true",
  });
  res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(jar),
    },
    body: body.toString(),
    redirect: "manual",
  });
  parseCookies(res, jar);

  // 3. Confirm session established
  res = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } });
  const session = await res.json();
  if (!session?.user) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(session)}`);
  }
  return { jar, session };
}

async function api(jar, path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(jar),
      ...(opts.headers || {}),
    },
  });
  let bodyJson = null;
  try { bodyJson = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: bodyJson };
}

async function main() {
  console.log("=== Logging in as Admin, BCBA, RBT (demo credentials login) ===");
  const admin = await loginAs("admin@admin.com");
  const bcba = await loginAs("bcba@bcba.com");
  const rbt = await loginAs("rbt@example.org");
  console.log("Admin session role:", admin.session.user.role, "| BCBA:", bcba.session.user.role, "| RBT:", rbt.session.user.role);

  const CLIENT_A = "client-assigned-alex";   // RBT is assigned here
  const CLIENT_B = "client-unassigned-jordan"; // RBT is NOT assigned here

  // ── Admin full access ──────────────────────────────────────────────
  {
    const clients = await api(admin.jar, "/clients");
    record("Admin", "GET /clients returns all clients (unrestricted)", clients.status === 200 && clients.body.length === 2, `status=${clients.status} count=${clients.body?.length}`);
    const staff = await api(admin.jar, "/staff");
    record("Admin", "GET /staff (staff directory) accessible", staff.status === 200, `status=${staff.status}`);
    const org = await api(admin.jar, "/organization/settings");
    record("Admin", "GET /organization/settings accessible", org.status === 200, `status=${org.status}`);
    const assessments = await api(admin.jar, `/clients/${CLIENT_A}/assessments`);
    record("Admin", "GET assigned-client assessments accessible", assessments.status === 200, `status=${assessments.status}`);
    const roles = await api(admin.jar, "/roles");
    record("Admin", "GET /roles (permissions admin) accessible", roles.status === 200, `status=${roles.status}`);
  }

  // ── BCBA full SmartSteps access ────────────────────────────────────
  let customReportId = null;
  {
    const clients = await api(bcba.jar, "/clients");
    record("BCBA", "GET /clients returns all clients (unrestricted)", clients.status === 200 && clients.body.length === 2, `status=${clients.status} count=${clients.body?.length}`);
    const orgGet = await api(bcba.jar, "/organization/settings");
    record("BCBA", "GET /organization/settings accessible", orgGet.status === 200, `status=${orgGet.status}`);
    const orgPatch = await api(bcba.jar, "/organization/settings", { method: "PATCH", body: JSON.stringify({ orgName: "A+ Center (BCBA edited, staging)" }) });
    record("BCBA", "PATCH /organization/settings (edit) succeeds", orgPatch.status === 200, `status=${orgPatch.status}`);
    const assessmentsGet = await api(bcba.jar, `/clients/${CLIENT_A}/assessments`);
    record("BCBA", "GET assigned-client assessments accessible", assessmentsGet.status === 200, `status=${assessmentsGet.status}`);
    const createAssessment = await api(bcba.jar, `/clients/${CLIENT_A}/assessments`, { method: "POST", body: JSON.stringify({ templateId: "template-vbmapp" }) });
    record("BCBA", "POST create client assessment succeeds", createAssessment.status === 201, `status=${createAssessment.status}`);

    const customTitle = "Alex Assigned — Custom Staging Report Title 2026-07-03";
    const generateReport = await api(bcba.jar, "/report-templates/report-template-initial/generate-report", {
      method: "POST",
      body: JSON.stringify({ clientId: CLIENT_A, title: customTitle }),
    });
    record("BCBA", "POST generate-report with custom title succeeds (201)", generateReport.status === 201, `status=${generateReport.status}`);
    customReportId = generateReport.body?.id ?? null;
    record("Custom report name", `Created report title exactly matches submitted custom title`, generateReport.body?.title === customTitle, `title="${generateReport.body?.title}"`);
  }

  // ── RBT sees assigned clients only ─────────────────────────────────
  {
    const clients = await api(rbt.jar, "/clients");
    const ids = (clients.body ?? []).map((c) => c.id);
    record("RBT", "GET /clients returns ONLY the assigned client (1 of 2)", clients.status === 200 && ids.length === 1 && ids[0] === CLIENT_A, `status=${clients.status} ids=${JSON.stringify(ids)}`);
  }

  // ── RBT cannot access assessments (incl. assigned-client URL) ──────
  let createdAssessmentId = null;
  {
    const asBcbaList = await api(bcba.jar, `/clients/${CLIENT_A}/assessments`);
    createdAssessmentId = asBcbaList.body?.[0]?.id ?? null;

    const ownClient = await api(rbt.jar, `/clients/${CLIENT_A}/assessments`);
    record("RBT", "GET own assigned client's /assessments -> 403", ownClient.status === 403, `status=${ownClient.status} body=${JSON.stringify(ownClient.body)}`);
    const otherClient = await api(rbt.jar, `/clients/${CLIENT_B}/assessments`);
    record("RBT", "GET non-assigned client's /assessments -> 403", otherClient.status === 403, `status=${otherClient.status}`);
    const templates = await api(rbt.jar, "/assessments/templates");
    record("RBT", "GET assessment templates catalog -> 403", templates.status === 403, `status=${templates.status}`);
    if (createdAssessmentId) {
      const specificAssessment = await api(rbt.jar, `/clients/${CLIENT_A}/assessments/${createdAssessmentId}`);
      record("RBT", "GET specific assigned-client assessment by ID (direct URL) -> 403", specificAssessment.status === 403, `status=${specificAssessment.status} body=${JSON.stringify(specificAssessment.body)}`);
    }
  }

  // ── RBT cannot access reports (incl. assigned-client URL) ──────────
  {
    const ownClientReports = await api(rbt.jar, `/clients/${CLIENT_A}/reports`);
    record("RBT", "GET own assigned client's /reports -> 403", ownClientReports.status === 403, `status=${ownClientReports.status} body=${JSON.stringify(ownClientReports.body)}`);
    if (customReportId) {
      const reportDirect = await api(rbt.jar, `/client-reports/${customReportId}`);
      record("RBT", "GET the specific generated report by ID (assigned client) -> 404 (fail-closed, not found)", reportDirect.status === 404, `status=${reportDirect.status}`);
    }
    const reportsExport = await api(rbt.jar, "/reports");
    record("RBT", "GET /reports (report console) -> 403", reportsExport.status === 403, `status=${reportsExport.status}`);
  }

  // ── RBT cannot access organization settings ────────────────────────
  {
    const orgGet = await api(rbt.jar, "/organization/settings");
    record("RBT", "GET /organization/settings -> 403", orgGet.status === 403, `status=${orgGet.status} body=${JSON.stringify(orgGet.body)}`);
    const orgPatch = await api(rbt.jar, "/organization/settings", { method: "PATCH", body: JSON.stringify({ orgName: "Hacked" }) });
    record("RBT", "PATCH /organization/settings -> 403", orgPatch.status === 403, `status=${orgPatch.status}`);
  }

  // ── RBT can still view assigned client goals, read-only ────────────
  let goalId = null;
  {
    const goals = await api(rbt.jar, `/clients/${CLIENT_A}/goals`);
    goalId = goals.body?.[0]?.id ?? null;
    record("RBT", "GET assigned client's goals -> 200 with data", goals.status === 200 && Array.isArray(goals.body) && goals.body.length === 1, `status=${goals.status} count=${goals.body?.length}`);
  }

  // ── RBT cannot create/edit/delete goals ─────────────────────────────
  {
    const createGoal = await api(rbt.jar, `/clients/${CLIENT_A}/goals`, { method: "POST", body: JSON.stringify({ title: "RBT should not be able to create this" }) });
    record("RBT", "POST create goal -> 403", createGoal.status === 403, `status=${createGoal.status}`);
    if (goalId) {
      const editGoal = await api(rbt.jar, `/clients/${CLIENT_A}/goals/${goalId}`, { method: "PATCH", body: JSON.stringify({ title: "Hacked title" }) });
      record("RBT", "PATCH edit goal -> 403", editGoal.status === 403, `status=${editGoal.status}`);
      const deleteGoal = await api(rbt.jar, `/clients/${CLIENT_A}/goals/${goalId}`, { method: "DELETE" });
      record("RBT", "DELETE goal -> 403", deleteGoal.status === 403, `status=${deleteGoal.status}`);
    }
  }

  // ── RBT can perform data entry (sessions + trials) ──────────────────
  let sessionId = null;
  {
    const createSession = await api(rbt.jar, "/sessions", { method: "POST", body: JSON.stringify({ clientId: CLIENT_A, mode: "DTT" }) });
    sessionId = createSession.body?.id ?? null;
    record("RBT", "POST create session for assigned client succeeds", createSession.status === 200 && !!sessionId, `status=${createSession.status} id=${sessionId}`);
    if (sessionId) {
      const createTrial = await api(rbt.jar, "/trials", { method: "POST", body: JSON.stringify({ sessionId, targetId: "target-alex-mand", result: "CORRECT" }) });
      record("RBT", "POST create trial (data entry) succeeds", createTrial.status === 201, `status=${createTrial.status}`);
    }
  }

  // ── RBT can create/view session notes ───────────────────────────────
  {
    const createNote = await api(rbt.jar, "/notes", { method: "POST", body: JSON.stringify({ clientId: CLIENT_A, sessionId, type: "BT_SESSION", content: "Staging spot-check session note by RBT." }) });
    record("RBT", "POST create session note for assigned client succeeds", createNote.status === 201, `status=${createNote.status}`);
    const listNotes = await api(rbt.jar, `/notes?clientId=${CLIENT_A}`);
    record("RBT", "GET session notes for assigned client succeeds", listNotes.status === 200 && listNotes.body.length >= 1, `status=${listNotes.status} count=${listNotes.body?.length}`);
  }

  // ── Saved assessment / custom report opens without 404 (as BCBA/Admin) ──
  if (customReportId) {
    const asBcba = await api(bcba.jar, `/client-reports/${customReportId}`);
    record("Saved report", "BCBA can open the generated report by ID (no 404)", asBcba.status === 200, `status=${asBcba.status}`);
    const asAdmin = await api(admin.jar, `/client-reports/${customReportId}`);
    record("Saved report", "Admin can open the generated report by ID (no 404)", asAdmin.status === 200, `status=${asAdmin.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(` - [${f.section}] ${f.description}: ${f.detail}`);
    process.exitCode = 1;
  }

  console.log("\n=== JSON_RESULTS_START ===");
  console.log(JSON.stringify(results, null, 2));
  console.log("=== JSON_RESULTS_END ===");
}

main().catch((err) => {
  console.error("SPOT-CHECK SCRIPT ERROR:", err);
  process.exitCode = 1;
});
