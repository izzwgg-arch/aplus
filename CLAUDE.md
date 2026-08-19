# A Plus Center — Project Rules

## What this repo is (read this first — the repos were split 2026-08-12)

- **This repo (`izzwgg-arch/aplus`)** contains TWO apps:
  - **A+ Center Scheduling** — `client/` + `server/` (clinic ops: appointments,
    providers, invoicing). Live at `https://app.apluscenterinc.org/aplus`.
  - **Smart Steps ABA Tracker** — `smart-steps/` (session data tracking, goals,
    assessments). Live at `https://app.apluscenterinc.org/smart-steps`.
- **`izzwgg-arch/Smart-steps`** is a DIFFERENT product: the **Smart Steps ABA
  Management platform** (timesheets, invoicing, email queue, community classes).
  Live at `https://app.smartstepsabapc.org` on a different server (`66.94.105.43`).
  Never commit its files here, and never commit A+ / Tracker files there.
- Pre-split state of both repos is preserved in branch `backup/pre-split-main`
  on each repo. Old layout had these apps under `aplus-center-scheduling/`.

## Rule 0: Task lifecycle (mandatory, every task)

**Start of every task:** read this file and any other relevant `.md` files in
the repo before doing anything else (Rule 1).

**Immediately after finishing every task** (no batching, no exceptions), in
this order:

1. **Commit** — `git add -A && git commit -m "<short description>"`.
2. **Push** — `git push origin main`.
3. **Deploy** — per Rule 5: if `smart-steps/` changed, run the Tracker
   git-based deploy; for docs-only changes, `git pull` on the server clone
   (`/var/www/aplus2`) to keep it in sync; `client/`/`server/` changes are a
   manual deploy — coordinate with the user before touching `/opt/aba`.
4. **Update MD files** — per Rule 4. Fold doc updates into the task's commit
   whenever possible; if any are made after deploying, commit and push them
   too. The working tree must end clean.

## Rule 1: Read the MD files first

At the start of **every task**, before doing anything else, read this file and any
other relevant `.md` files in the repo. They are the source of truth.

## Rule 2: Server access (SSH)

- **Server IP:** `91.229.245.143` (hosts A+ Scheduling + ABA Tracker)
- **SSH user:** `root`
- **Private key (this machine):** `C:\Users\A Plus Server\.ssh\id_ed25519`

```
ssh -i "C:\Users\A Plus Server\.ssh\id_ed25519" root@91.229.245.143 "<command>"
```

Never generate a new key, never ask for a password, and never print or copy the
**private** key anywhere (not into files, commits, logs, or chat).

Server layout (verified 2026-08-13):

- A+ Scheduling runs from `/opt/aba` (port 4000, `node server/src/server.js`,
  **not git-managed** — deployed as tarball).
- ABA Tracker runs from `/var/www/aplus2/smart-steps` (port 3000, PM2 process
  `smart-steps`). `/var/www/aplus2` is a clean clone of this repo on `main`.
- `/var/www/aplus` is the FROZEN pre-split live state (branch
  `preserve/server-live-20260728`, old layout) — kept as rollback. Do not
  modify or delete it.
- nginx: `app.apluscenterinc.org` → `/` to 4000, `/smart-steps` to 3000.
  (The dead `smartsteps-abapc` nginx site was removed 2026-08-13; backup in
  `/root/nginx-backup`.)

## Rule 3: Git — commit and push after EVERY task

- **Repository:** `https://github.com/izzwgg-arch/aplus.git`, branch `main`.

Immediately after **every completed task** (no batching):

1. `git add -A`
2. `git commit -m "<short description of the task>"`
3. `git push origin main`

**The working tree must always stay empty.** `git status` must be clean at the
end of every task. If you find uncommitted changes at the start of a task, commit
and push them first before starting new work — but check WHICH app they belong
to first (see "What this repo is"): ABA Management files go to the
`Smart-steps` repo, not here.

## Rule 4: Update the MD files after EVERY task

After finishing each task, update the appropriate `.md` file so the docs always
match reality (this file for build/run/deploy changes; `README.md` for features).
The MD update is part of the task's commit. If no doc change is needed, say so
explicitly in the task summary.

## Regression audit (2026-08-13)

`main` was verified as a strict superset of live production:

- Tracker: every live hotfix from `preserve/server-live-20260728` is present in
  `main` (differences are line-endings or newer feature work). Live server
  checkout had zero uncommitted changes. `tsc --noEmit` passes.
- Scheduling: `/opt/aba` source matches `client/` + `server/` except 3 files
  where the REPO is newer (dev quick-login, invoice edit modal), and 4 stale
  unused files that exist only on the server. Vite production build passes.
- `prisma/migrations/migration_lock.toml` was lost in the big local sync and
  has been restored — do not delete it again.

## Tracker user identity (fixed 2026-08-13)

The same person can be known under two ids: staff profiles created in the
Tracker's Settings → Staff get a cuid, while A+ Center SSO logins arrive with
the main app's user id as `sub`. `ensureUser()` (smart-steps/src/lib/ensureUser.ts)
now resolves the CANONICAL id — by id first, then by email (case-insensitive) —
and every login path plus `requireSession()` uses the returned id. Never trust
`session.user.id` raw in a new API route; always go through `requireSession()`.
Before this fix, SSO staff sessions could point at an orphan/placeholder row
with zero assignments — the "assigned clients don't appear" bug. Orphan rows
were merged into the real profiles directly in the prod DB on 2026-08-13.
`smart-steps/scripts/mergeDuplicateUsers.mjs` (dry-run by default, `--apply`
to write) detects and merges duplicate-email users if it ever recurs.

## Tracker BT goal visibility (fixed 2026-08-17)

Assigned-only viewers (BT/RBT, Parent Viewer — anyone WITHOUT the `.all` scope
on `smartsteps.goals.view` / `smartsteps.targets.view`) used to be filtered to
`Target.phase === "ACQUISITION"` only. That was a deadlock: every target is
created with `phase: "NEW"` (`POST /api/targets`, goals-page target form),
nothing bulk-promotes them, and the NEW -> ACQUISITION promotion only fires
when a BT logs the first trial — which requires the target to be visible. Net
effect: a BT assigned to a client whose goals were all still NEW saw an empty
goals list (reported for client Risi Weiss; 155 of 269 prod targets were NEW).

`smart-steps/src/lib/targetVisibility.ts` is now the single source of truth:
restricted viewers see NEW / BASELINE / ACQUISITION / MAINTENANCE /
GENERALIZATION — everything active except `MASTERED`. Used by
`/api/clients/[clientId]/goals`, `/api/clients/[clientId]/targets`, and
`/api/targets/[targetId]`. Do not re-add an ACQUISITION-only filter; if
finished goals need hiding, extend the exclusion list in that one file.

## Tracker assessment reports — classic letterhead layout (2026-08-17)

Report generation follows the approved Smart Steps assessment document (sample:
Gavriel Schiff-Weiss initial assessment). Key rules, all implemented in
`smart-steps/src/lib/reportGenerationUtils.ts` (builders) and
`smart-steps/src/app/(main)/assessments/reports/[id]/printAssessment.ts` (print):

- **First name only** in all narrative prose; the full legal name appears only
  in the header block / provider-info fact table. `{{client}}`-style tokens in
  BT-entered goal text also resolve to the first name.
- **Biopsychosocial** generates from Client Info (age from DOB, address,
  diagnosis, Intake Notes verbatim, school, ABA history line — initial vs
  reassessment variant).
- **Domain paragraphs** (Language & Communication, Social/Emotional, Challenging
  Behavior, Adaptive Behavior, Executive Functioning) generate from that
  domain's MASTERED, active, and NEW targets.
- **Goal tables** generate from BT-entered data: the mastered-goals table keeps
  the fixed category/skill skeleton (empty on an initial assessment); the
  skill-acquisition chart is grouped under fixed category headers with
  "NEW GOALS – To Be Mastered by <service period end>" rows (Start Date =
  masteryRule.openedDate or TBD, Baseline = target.baseline or "Low", Current
  level = last-30-day trial % — blank on initial).
- **Default paragraphs** (Why-ABA boilerplate, Coordination, Team Training,
  Parent Involvement, Crisis Plan, Transition, Discharge, closing/signature)
  are fixed text with the first name substituted; `detectSectionType()` maps
  section titles to builders, so renaming template sections changes behavior.
- **Print/PDF** renders the classic letterhead on every page (top strip +
  watermark + gold/navy bottom band from `public/letterhead/`), the underlined
  fill-in header block on page 1 (values read from the provider-info section's
  label/value table — keep those labels stable), numbered sections, and
  row-level table splitting across pages (nothing is clipped).
- `public/letterhead/smart-steps-top.png` was edited 2026-08-17 to align the
  envelope icon and email text with the other contact rows (cache-buster
  `?v=aligned-20260817`).

## Tracker sessions — soft delete, filters, at-a-glance cards (2026-08-19)

The client Sessions tab lives in
`smart-steps/src/app/(main)/clients/[clientId]/_components/SessionsTab.tsx`
(extracted out of the client page, alongside DataEntryTab / ProgramsTab /
SessionNotesTab).

- **Session cards show date, time and provider without opening the session**:
  service date + session type badge, `time in – time out · N min` (or
  "in progress"), then provider name + role and the trial count, with the
  %-correct badge on the right.
- **Filters are SERVER-side** (`GET /api/sessions` accepts `from`, `to`,
  `providerId`, `mode`, `withData=1`). The list is paginated — filtering only
  the loaded pages would silently hide older matches. The filter values are
  part of the React Query key, so changing one refetches from offset 0.
- **Delete is a soft delete.** `DELETE /api/sessions/[sessionId]` requires
  `smartsteps.sessions.delete` plus client access, and stamps `deletedAt` on
  `Session` AND on each of its trials (migration
  `20260819000000_session_soft_delete`). Stamping the trials is what makes the
  delete propagate for free: every analytics/report query already filters
  `deletedAt: null` on trials. Session-level `deletedAt: null` filters were
  added to `GET /api/sessions`, `GET/PATCH /api/sessions/[sessionId]`,
  `generate-note`, `GET /api/clients/[clientId]` (overview stats + chart),
  `/api/dashboard/stats` and `/api/reports`. Nothing is destroyed — an admin
  can clear `deletedAt` in the DB to restore a session.
- Delete is offered both on the session card and in the Session Snapshot
  drawer, and is permission-gated in the UI so a BT never sees a button the
  API would refuse.

## Tracker delete affordances elsewhere (2026-08-19)

- **Assessments**: `DELETE /api/clients/[clientId]/assessments/[assessmentId]`
  (hard delete; responses cascade) — `smartsteps.assessments.delete` + client
  access, and the URL's `clientId` must match the row. Surfaced on
  `/clients/[clientId]/assessments`.
- **Clinical reports**: the existing `DELETE /api/client-reports/[reportId]`
  gained the `canForClient` scope check GET already had, and is surfaced on the
  same page (`smartsteps.reports.delete`).
- **Goal hierarchy** (ProgramsTab): categories (DB `Program`) and skill areas
  (DB `ParentGoal`) can now be deleted; deleting a category archives its skill
  areas too, otherwise they survive server-side pointing at an archived parent
  and read as data loss. Both list endpoints already exclude archived rows, so
  the delete sticks across reloads. Individual goals (DB `Target`) already had
  "Delete Goal"; that menu item is now gated on `smartsteps.targets.delete`.
- Notes already had delete inside `NoteEditorModal` — unchanged.

## Rule 5: Deploy (step 3 of the Rule 0 end-of-task sequence)

### Smart Steps ABA Tracker (git-based, re-wired 2026-08-13)

Production runs from `/var/www/aplus2/smart-steps`. To deploy after pushing
to `main`:

```
ssh -i "C:\Users\A Plus Server\.ssh\id_ed25519" root@91.229.245.143 "cd /var/www/aplus2 && git pull && cd smart-steps && npm ci --no-audit --no-fund && npx prisma generate && npm run build && pm2 restart smart-steps && sleep 5 && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/smart-steps"
```

Expect `200` at the end. If new prisma migrations were added, run
`npx prisma migrate deploy` before the restart.

**Rollback:** `pm2 delete smart-steps`, then `pm2 start npm --name smart-steps
-- run start` from `/var/www/aplus/aplus-center-scheduling/smart-steps`
(the frozen pre-split live state), then `pm2 save`.

### A+ Center Scheduling

Still manual: `/opt/aba` is not git-managed. Changes to `client/` or
`server/` do NOT reach production via git pull — coordinate with the user
before touching `/opt/aba`. Never run destructive git commands on
`/var/www/aplus` (frozen rollback state).
