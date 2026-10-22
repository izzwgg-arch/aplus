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
  domain's MASTERED, active, and NEW targets. `buildCategoryGoalsHtml` ALWAYS
  returns content — a domain with no goals gets the heading plus an editable
  no-goals line, never the template's raw placeholder text (2026-08-31).
- **Category assignment is EXCLUSIVE** (fixed 2026-08-31): every goal belongs
  to exactly one fixed category via `fixedCategoryIndex()` — first keyword
  match in document order, with a bare-"Behavior" domain falling back to
  CHALLENGING BEHAVIOR. The challenging-behavior keyword list deliberately has
  NO bare "behavior" keyword ("Adaptive Behavior"/"Verbal Behavior" contain
  that word); do not re-add it, or adaptive goals show up in both the
  Challenging Behavior chart group and both domain summaries again.
- **Behavior Intervention Plan** (Attachment A): at most TWO target behaviors,
  taken ONLY from CHALLENGING BEHAVIOR goals, with the Function of Behavior
  inferred from the goal's own wording (`inferBehaviorFunction()` — heuristic,
  BCBA reviews).
- **Domain summaries are clinical PROSE, not a goal list** (2026-09-01): each
  paragraph states where the child is now (skill areas involved, objectives
  already mastered, objectives in treatment, average trial accuracy when data
  exists), then a "Because <domain rationale>, the objectives to be targeted
  during this service period are: …" transition into the upcoming goals, and
  closes with why those goals were chosen. Per-domain framing lives in
  `DOMAIN_VOICES`; challenging behavior gets behavior-reduction wording, the
  skill domains get skill-building wording.
  **Summaries describe THEMES, they do not enumerate goals** (2026-09-01):
  quoting every definition read as a list, so `goalTopic()` reduces a goal to
  a short verb phrase — it strips trailing prompt/trial codes ("v/p", "(8-12)")
  and everything up to the last "will", then normalizes the learn-form
  ("will learn that X" -> "understand that X", "will learn not to X" ->
  "not to X"). At most THREE topics are folded into "…focus on helping <Name>
  X, Y, and Z", and the remainder is referred to the goal chart by count.
  `goalTopic()` returns null when the wording has no "will" clause and the
  caller then omits it — a goal is never rewritten in a way that could invert
  a negation, which would be a clinical error. Do not "improve" this into a
  general paraphraser.
- **Editor formatting survives into the PDF** (fixed 2026-09-01):
  `normalizeSectionHtml()` in `printAssessment.ts` used to unwrap every
  `<span>` and strip every `style`, so font size, font, color and highlight
  applied in the report editor were silently discarded when printing. It now
  preserves `font-size`, `font-family`, `color`, `background-color` and
  `text-align` on every element, and unwraps only spans carrying no style.
- **RichTextEditor**: point sizes (9–24pt) lead the size list — an assessment
  is a printed document. Applying a size/font/color with NOTHING selected
  formats the WHOLE section rather than silently doing nothing (that no-op
  read as "the font size button is broken"). Strikethrough and Clear
  formatting were added; `sanitizeHtml` allows `<s>` and maps `<strike>` /
  `<del>` onto it.
- **"Add goal" is always visible** on every report section (it used to be
  `opacity-0` until hover on any section whose title did not map to a goal
  table, which is most of the live template), and reads "Add parent goal" on a
  parent-training section.
- **"Update from data"** in the report editor calls
  `POST /api/client-reports/[reportId]/regenerate`: rebuilds every
  builder-generated section of an EXISTING report from the client's current
  info/goals/trials (provider + service period recovered from the report's own
  provider-info fact table; assessment type from the template/report name).
  Passthrough sections are never touched; edits inside builder sections are
  overwritten after an explicit confirm. Both generation routes share one core
  (`src/lib/reportSectionGeneration.ts`) so they cannot drift.
  Generated reports are stored snapshots: a report created before a generator
  fix keeps its old content until regenerated (the two reports generated while
  the "-Summary" sections still produced the signature block were repaired
  in the prod DB on 2026-08-31 — log: `/root/summary-repair-20260831.log`).
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
- **The Behavior Intervention Plan always STARTS ON ITS OWN PAGE** when printed
  (2026-09-07). It is a standalone clinical attachment that gets detached,
  signed and filed separately, so it must not begin halfway down a page.
  `startsOwnPage()` in `printAssessment.ts` flags the section with
  `data-own-page="1"` and the paginator opens a fresh page before it — unless
  the current page is still empty, so no blank page is ever emitted.
  Because this is RENDER-time, it applies to every already-generated report the
  next time it is printed; nothing stored is rewritten and hand-edited content
  is untouched.
  **The title alone is not a sufficient test.** Reports generated before the
  live template was repaired carry the BIP under headings like "New Section"
  (49 of them) or "BIP" — only 3 of 57 production BIP sections had a matching
  title. So the CONTENT test requires BOTH `TARGET BEHAVIOR #` and
  `Function of Behavior:`. Both are required to keep the rule off the
  Challenging Behavior domain section, whose template says "Identified Target
  Behaviors:" and a bare "Function:"; the pair matched all 53 real plans and 0
  domain summaries in production. Verified in the print harness for a properly
  titled BIP and for a legacy one titled "New Section" — each lands alone on a
  fresh final page with no blank page introduced.
- **A BIP is never numbered, and a stray section heading above it is dropped**
  (2026-09-07). All 50 legacy BIP sections in production sit under a stray
  title ("New Section" x49, "BIP" x1) AND already open with their own centered
  "Attachment A: Behavior Intervention Plan" line, so they used to print as
  "9. New Section" followed by the real heading. At render time the section is
  now titled by `BIP_HEADING` when its own title is not an attachment title,
  and `leadsWithBipHeading()` suppresses the section heading entirely when the
  content already carries it — one heading, never two.
  **The section TITLES were deliberately NOT renamed in the database.** All 50
  are hand-written clinical plans with zero generator placeholders, and
  `detectSectionType("Attachment A: …")` maps to `behavior_plan`: renaming them
  would make "Update from data" regenerate over a BCBA's hand-written plan.
  Left as passthrough, that content is protected. Do not "tidy" these titles.
- `public/letterhead/smart-steps-top.png` was edited 2026-08-17 to align the
  envelope icon and email text with the other contact rows (cache-buster
  `?v=aligned-20260817`).
- **Guardian/parent contact info never appears in a generated assessment**
  (removed 2026-08-31): `buildProviderInfoHtml` emits no guardian rows and the
  route defines no `guardian_*` placeholder values. Do not re-add them.
- **Passthrough prose placeholders resolve to the FIRST name too**: the route's
  `client_name` value is `firstNameOnly(...)`; use `client_full_name` if a
  template ever genuinely needs the legal name (2026-08-31).
- **`detectSectionType()` checks domain categories BEFORE the summary kind** —
  live templates carry titles like "Language & Communication -Summary", which
  are domain sections, not the closing summary/contact block. Keep the
  `/summary|contact information/` test at the very bottom (fixed 2026-08-31;
  before this, all five "-Summary" sections generated the signature block).
- **The live "Initial ABA Assessment Template" was repaired in the prod DB on
  2026-08-31**: its two untitled "New Section" duplicates of the
  medical-necessity paragraph and the goals-chart intro were deleted (both are
  generated by the why-ABA / skill-acquisition builders now), "3. Mastered
  Goals and Objectives" was inserted, "Current Goals and Objectives" was
  retitled "4. Goals and Objectives for Skill Acquisition", and the trailing
  "New Section" became "Attachment A: Behavior Intervention Plan". Every
  section title now maps to a builder. Full pre-change backup:
  `/root/initial-template-fix-20260831.log` on the server.

## Tracker client DOB is validated (fixed 2026-09-10)

"Failed to create client" was a stray digit in the date-of-birth year ("20009",
"62025"): `new Date()` parses those fine, so the old isNaN check passed, and
Prisma then refused the out-of-range timestamp with a 500.
`smart-steps/src/lib/dob.ts` (`parseDob`, `DOB_ERROR`, `MIN_DOB_YEAR`,
`todayDateInputValue`) is the single source of truth: DOB must be between 1900
and today. Enforced in `POST /api/clients`, `PATCH /api/clients/[clientId]`
(which previously did not validate the date at all), and both client forms
(min/max on the date input + a specific toast before submit). No corrupt DOB
ever reached the prod DB — the bad creates all failed.

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

## Tracker durations are shown in HOURS (2026-08-19)

`smart-steps/src/lib/formatDuration.ts` is the single source of truth for how
long a session or note ran. Clinical staff read and bill service time in hours,
so nothing in the Tracker prints a raw minute count any more.

- `formatMinutesAsHours(150)` → `"2.5 hrs"`; trailing zeros are trimmed
  (`120` → `"2 hrs"`) and 60 minutes is singular (`"1 hr"`).
- `formatSessionHours(startedAt, endedAt)` returns null — so callers render
  nothing or an em dash — when there is no end time, the span is negative, or it
  exceeds `MAX_PLAUSIBLE_SESSION_MINUTES` (8 h). A session left open overnight
  must never read as billable service time.
- `formatClockRangeHours(timeIn, timeOut)` works off the `"HH:MM"` strings a
  Note stores, and treats a time-out before time-in as crossing midnight.

Call sites: SessionsTab cards, SessionSnapshotDrawer, DataEntryTab session
history, SessionNotesTab note cards (the time range now renders for BT notes
too, not only BCBA notes — it was already stored, just hidden), the printed
note PDF (`printNotes.ts`), the client Schedule tab, and the parent portal.
Add new duration displays through this module rather than dividing by 60000
inline.

## Tracker session timing saves what was ENTERED (fixed 2026-08-19)

The New Session Setup form collects Session Date, Time In, Time Out and
Provider, and `POST /api/sessions` stored them correctly — but **End Session
then overwrote the end with `new Date()`**, the current clock. On a backdated
session that put the end days after the start; on a same-day session it
discarded the Time Out the user had typed. Both entry points had the bug:
`DataEntryTab.endSession()` and `session/new/page.tsx`'s save mutation.

The fix, in both files:

- The setup the session was started with is kept in `activeSetupRef` (a ref, so
  callbacks read it without being re-created). Every later write — the
  end-of-session PATCH, the offline retry POST, the Dexie queue — reads its
  timing from there.
- End time = the entered Time Out. Only when none was entered is it stamped as
  `startedAt + measured elapsed`, **never** `Date.now()`, so an unfinished
  backdated session still ends on its own service date.
- The offline retry `POST /api/sessions` used to send a bare `{ clientId }`,
  which defaulted `startedAt` to now and silently lost the service date of a
  backdated session. It now resends the entered start/end/mode/provider.
- `queueSession()` (`src/lib/dexie.ts`) carries `endedAt` and `providerId`, and
  `/api/sync` persists them — an offline session used to sync back with no end
  time and the syncing user as provider.
- Both setup forms now reject a Time Out at or before Time In, since the values
  are stored verbatim and a negative span renders as "—".

The ad-hoc single-trial log in `TargetDetailPanel` has no date field and is
correctly stamped "now" — left alone. Trial-level reporting already keys off
`session.startedAt`, not `trial.createdAt`, so backdated trials land on the
right date in graphs.

## Tracker sessions — note status + goals added without data (2026-08-20)

Two things a session card could not tell you before: whether it had been written
up, and which goals were worked on when no trials were taken.

- **Note status is on the card.** `GET /api/sessions` returns `noteCount`,
  `noteGeneratedAt`, `noteIsGenerated` (from the session's `Note[]` relation)
  and `addedGoalCount`. `SessionsTab` renders a green "Note generated" /
  "Note written" chip or an amber "No note yet" chip on every card. The chip
  reflects REAL notes (`Note.sessionId`), not the session's own `notes`
  free-text field — that is now labelled "field notes" so the two never read as
  the same thing.
- **Filter by note status.** `GET /api/sessions` accepts `hasNote=1|0`
  (`sessionNotes: { some: {} }` / `{ none: {} }`), exposed in the Sessions tab
  filter panel as "Session note: Any / Note written / Needs a note". Like every
  other session filter it is server-side — the list is paginated.
- **Generating twice is now explicit.** `POST .../generate-note` always creates
  an ADDITIONAL note; the Session Snapshot drawer confirms first when one
  already exists, and its button reads "Generate Again".

**Goals attached without trial data** use a new `SessionTarget` join model
(migration `20260820000000_session_added_goals`): `sessionId` + `targetId`
unique, optional `note`, `addedById`. `POST /api/sessions/[sessionId]/targets`
(accepts `targetId` or `targetIds`, upserts so re-adding just refreshes the
note) and `DELETE ...?targetId=` are gated on `smartsteps.sessions.edit` plus
client access, and reject a target that does not belong to the session's client.

- `GET /api/sessions/[sessionId]` merges the links into `sessionTargets`: a goal
  that also has trials keeps its trial data and is flagged `addedManually`; one
  with no trials joins with `trialCount: 0`. The drawer shows it under Goals
  Worked with a "No data" badge, an "Added to session by <name>" chip, its note,
  and an X to detach (only hand-attached goals can be detached — a trial-backed
  goal leaves by deleting its trials).
- `POST /api/sessions/[sessionId]/generate-note` merges the same links, so the
  goal lands in GOALS ADDRESSED, gets a PROGRESS line reading "addressed this
  session; no trial data recorded" plus its note, and adds a next-step to
  collect data on it. **Session accuracy is computed from `scoredTargets`
  (`trialCount > 0`) only** — averaging a zero-trial goal in would drag the
  session percentage toward 0.
- The picker in the drawer loads `/api/clients/[clientId]/targets` lazily (only
  while it is open) and hides goals already on the session.

**Trial data can be entered against any goal on a saved session** (added
2026-08-20, same drawer). Every goal card in Goals Worked carries an "Add trial
data" / "Add more trials" button, gated on `smartsteps.trials.create`; adding a
goal through the picker drops straight into that panel for the goal just added.
The panel posts a batch to the existing `POST /api/trials`
(`{ sessionId, trials: [...] }`) — no new endpoint.

- Result choices are `CORRECT | PROMPTED | INCORRECT | NR`, the values that
  route accepts verbatim. Do NOT offer `NO_RESPONSE` here: `POST /api/trials`
  validates against `TRIAL_RESULTS` and silently coerces anything unknown to
  `NR`, while `PATCH /api/trials/[trialId]` does not validate — which is why
  older rows carry `NO_RESPONSE` and `RESULT_STYLES` now labels both.
- **Trials are stamped inside the session's own window**, not at `now`:
  `startedAt + (existing trial count + i) seconds`, capped at `endedAt`. A
  session backdated to last week must not collect trials timestamped today, or
  the Trial History reads as though the work happened when it was typed.
  (Graphs were already safe — trial reporting keys off `session.startedAt`.)
- Logging the first data on a `NEW` goal promotes it to `ACQUISITION`, the same
  fire-and-forget PATCH the live data-entry panel performs — a BT without
  `targets.edit` still gets their trials saved.
- Batches are clamped to 1-50 rows by `clampTrialCount()`. The optional note is
  copied onto every trial in the batch; the note generator de-dupes it.
- An existing session note does NOT update when trials are added afterwards —
  notes are point-in-time. The drawer's button reads "Generate Again" and
  confirms, since generating produces an ADDITIONAL note.

## Tracker BT session notes are SHORT (2026-10-22)

The generated BT session note was five sections long and listed every goal
twice — once under GOALS ADDRESSED as a name, again under PROGRESS with its
numbers — then closed with fixed boilerplate (reinforcement delivered, BIP
implemented as written, "demonstrated strong/developing/emerging skills") and
up to five recommendations of which two were always the same two sentences.
A BT writes one of these per session, so the length was all skim-past text.

`generateBTNoteContent()` in
`smart-steps/src/app/api/sessions/[sessionId]/generate-note/route.ts` now emits
three sections — SESSION SUMMARY, GOALS & DATA, BEHAVIOR:

- **Summary is two sentences**: who/what/when/with whom, then trials, goals and
  overall accuracy. The weekday was dropped from the date and the
  strong/developing/emerging sentence is gone — the percentage says it.
- **Each goal appears ONCE**, with its skill area in parentheses and its own
  numbers on the same line. The separate GOALS ADDRESSED list is gone, as are
  the "Mastery Achieved" / "New Targets Introduced" trailer lines; mastery is a
  clause on the goal's own line and the phase is implicit.
- **BEHAVIOR is one line**, and only the recorded events. The two boilerplate
  sentences were removed.
- **Recommendations are data-driven only** (below 60%, at or above 80%,
  mastered), with ONE generic fallback line used when the data says nothing.
  Next-session items are capped at two and no longer repeat the recommendations.

Nothing was dropped from the record: trial counts, percentages, prompt codes,
per-trial notes, hand-attached goals and their notes, behavior counts and ABC
counts all still print. Accuracy is still averaged over `scoredTargets` only.
No consumer parses these headers (checked) — the note body is free text — so
renaming PROGRESS to GOALS & DATA is safe. Notes are point-in-time snapshots,
so existing notes keep their old long text.

## Tracker session notes show date, timing and provider (2026-08-19)

A note typed by hand carries its own `serviceDate` / `timeIn` / `timeOut` /
`providerName`. A note produced by `POST /api/sessions/[sessionId]/generate-note`
carries only the service date and provider name — the times live on the
**session**, so generated BT notes used to show no timing at all, and the time
range was additionally hidden for every non-BCBA note.

`GET /api/notes` now returns the linked `session` (`startedAt`, `endedAt`,
`mode`, provider) alongside each note, and `noteMeta()` in `SessionNotesTab`
resolves what to display: note field first, session fallback second. Session
timestamps are converted to the note's stored `"HH:MM"` shape **client-side**
(`toClockString`) — never on the server, whose timezone is not the clinic's.
The same resolver feeds `toPrintable()`, so the printed PDF and the provider
search box see the same values as the card.

## Tracker session timing is REQUIRED (2026-08-19)

Session Date, Time In and Time Out are all mandatory on both session setup
forms (`DataEntryTab` setup view and `clients/[clientId]/session/new`) and in
the Session Snapshot drawer's edit panel. The Start button is disabled until all
three are filled and reads "Enter date, time in and time out"; each field is
individually validated on submit, and a Time Out at or before Time In is
rejected. `PATCH /api/sessions/[sessionId]` now always receives an `endedAt`
from the drawer.

Rationale: the service window is what reports, graphs and billing read. A
session saved without an end time renders as "—" everywhere and has to be
chased down and corrected later. Combined with the entered-timing fix above,
every new session now stores a complete, verbatim service window.

## Tracker notes — 12-hour clock, note-type + provider dropdowns (2026-08-24)

Notes are written and read by clinical staff, who work in a 12-hour clock and
pick a service type by NAME, not by billing code.

- **Time is never shown or entered in 24-hour form.**
  `smart-steps/src/lib/formatDuration.ts` gained `formatClockTime12h()`
  ("13:30" -> "1:30 PM") and `formatClockRange12h()` ("1:30 PM – 3:00 PM"); both
  return `""` for a missing/malformed value so the caller can drop the field.
  Used by the note cards (SessionNotesTab) and the printed note PDF
  (`printNotes.ts`). The DB still stores the 24-hour `"HH:MM"` string — only the
  presentation changed, so `formatClockRangeHours()` keeps working unchanged.
- **Entry uses `TimeInput12h`** (`src/components/common/TimeInput12h.tsx`), not
  `<input type="time">`. A bare time input renders in the BROWSER's locale
  format, so a workstation set to a 24-hour locale showed BCBA notes being
  written at "14:30". The control is hour + minute dropdowns with an AM/PM
  toggle, and its value in/out is still the stored `"HH:MM"` 24-hour string.
  Picking an hour before touching AM/PM defaults to AM for 8–11 and PM
  otherwise (an ABA day runs late morning to evening); the toggle always shows
  what was chosen. An off-grid stored minute (e.g. `:07`) is kept as an option.
- **`src/lib/noteTypes.ts` is the single source of truth for the note taxonomy**
  — `NOTE_TYPES` (BT_SESSION / BCBA / GENERAL) and `BCBA_SERVICE_TYPES`
  (DSU / TM / TP / PRT / ASSES with plain-English labels), plus
  `bcbaServiceLabel()` and `bcbaServiceLabelWithCode()`. NoteEditorModal,
  SessionNotesTab and printNotes all read from it; the ids must stay in sync
  with `VALID_BCBA` in `src/app/api/notes/route.ts`.
- **The note type is a dropdown next to the Title field.** The old grid of
  DSU/TM/TP/PRT/ASSES buttons is gone; a BCBA now picks "Direct Supervision
  (DSU)", "Treatment Planning (TP)", "Parent Training (PRT)"… from a select
  beside the title. The top BT/BCBA/General selector is labelled **Note
  Category** so the two do not both read as "Note Type".
- **Auto-titling follows that dropdown** until the user types their own title:
  `titleTouched` starts `true` for a note that already has a saved title, so an
  existing title is never rewritten, and the generated title now uses the
  descriptive label ("Parent Training Note – Aug 24, 2026"), not the code.
  Switching service type re-seeds the narrative only while it is still one of
  the generated templates — a BCBA who has started writing keeps their text.
- **Provider is a dropdown** (`ProviderSelect` inside NoteEditorModal) fed by
  `GET /api/users?forDropdown=1`, on BCBA, BT and General notes. `Note` stores
  a NAME (`providerName`), not a user id, so the picker keeps a free-text
  escape hatch ("Other — type a name…") and offers any unrecognised existing
  value as its own option — editing an old note never silently blanks its
  provider.

## Tracker staff — providers without an email or login (2026-08-24)

Not every provider whose name has to appear on a session or note is a Tracker
user. Settings → Staff therefore has a fourth login method, **"No Login — name
on record only"**: name + role, no email, no password, no invite.

- `User.email` is now **nullable** (migration `20260824000000_optional_staff_email`
  — `ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL`). The `@unique`
  index is unchanged: Postgres treats NULLs as distinct, so any number of
  login-less records coexist.
- `POST /api/staff` accepts `loginMethod: "none"` — email optional, password and
  invite ignored, `invitedAt` null. Email stays **mandatory** for the sso /
  local / invite methods, because every sign-in path identifies the person BY
  email.
- `PATCH /api/staff/[userId]` with an **empty** `email` converts an existing
  account to record-only: it clears the address and revokes the login with it
  (`passwordHash` and `invitedAt` are nulled) rather than leaving credentials
  nothing can authenticate against. Clearing your OWN email is refused — it
  would lock you out. Adding an email back later restores a real account, and
  `ensureUser()` links the SSO login to that row by email as usual.
- `POST /api/staff/[userId]/resend-invite` 400s on a provider with no email.
- The staff card shows a grey **"No login"** chip and "No email — record only"
  in place of the SSO/local chip, and hides the invite button.
- Record-only providers are ordinary `User` rows, so they already appear in the
  provider dropdowns (`GET /api/users?forDropdown=1`) on sessions and notes, and
  can be assigned clients.
- `scripts/mergeDuplicateUsers.mjs` **skips rows with no email**. They are
  distinct people sharing one null key — grouping them would merge unrelated
  providers into one.

## Tracker assessments — add goals from the Goal Library (2026-08-24)

An assessment report's goal tables used to be filled in by typing into the
table. Every goal-table section in the report editor
(`/assessments/reports/[id]`) now carries an **"Add goal"** button that opens
the Goal Library in a dropdown, and a goal picked there becomes a REAL goal for
the child — not just a row of table text — so a BT can start taking data on it
the same day and the report never drifts from the treatment program.

- **Which sections get the button.** `goalTableKind()` in
  `smart-steps/src/lib/reportGoalTables.ts` delegates to `detectSectionType()`
  for the four kinds whose generated content is a TABLE: `mastered_goals`,
  `current_goals`, `new_goals`, `parent_goals`. Renaming a template section
  changes both generation and this button together — there is still only the
  one detector.
  **A title test alone is not enough.** Templates in the wild do not keep the
  generated names: the live "Initial ABA Assessment Template" carries
  `"7. Parent / Guardian Involvement"`, `"Language & Communication -Summary"`
  and three bare `"New Section"` headings, so real goal tables sat in sections
  that mapped to nothing. `inferGoalTableKind(content)` therefore also reads the
  section's own `<th>` headings (regex, not DOM, so it is safe during render):
  "Date Mastered" -> mastered, "Carrying Over" -> parent, an
  objective/operational-definition column -> current. A section matching either
  test shows the button always; **every other section still shows it on hover**,
  defaulting to the current-goals columns, so a goal can be filed into a section
  named anything at all.
- **The dropdown is the whole library**, not a top-N search: it reads
  `GET /api/goal-library` / `GET /api/parent-goal-library` (neither takes a
  limit) and groups items into `<optgroup>`s by their own category/domain, with
  a filter box above it and an "Not in the library — type it below" escape
  hatch. `(Client)` / `{{client}}` placeholders resolve to the child's name.
  The button is hidden unless the user holds `smartsteps.goal_library.view` or
  `smartsteps.parent_goal_library.view`.
- **Both item types are offered**: a **Goal** (DB `Target`) or a **Skill area /
  parent goal** (DB `ParentGoal`), matching the two libraries in the sidebar.
- **`POST /api/clients/[clientId]/goal-library-import`** does the writing. It
  resolves Category (DB `Program`) and Skill Area (DB `ParentGoal`) **by name,
  case-insensitively**, and creates them when they do not exist — "if it is a
  new skill area then a new skill area should open". It then creates the
  `Target` under that skill area with `phase: "NEW"`, mapping
  `operationalDefinition` onto `Target.baseline` exactly as `POST /api/targets`
  does, so an imported goal is indistinguishable from one added in the
  Goals & Targets tab. The chosen Start Date is stored as
  `masteryRule.openedDate`, which is what `getTargetStartDate()` reads back
  when the report is regenerated.
  - Requires client access plus `smartsteps.targets.create` (goal) /
    `smartsteps.goals.create` (skill area). Creating the **category** is a side
    effect, so it is skipped (goal lands uncategorised) rather than failing the
    import when the user lacks `smartsteps.programs.create`.
  - **Idempotent on the goal**: re-importing the same definition under the same
    skill area returns the existing `Target` with `duplicate: true`. Report
    tables get edited repeatedly — stacking copies would corrupt the program.
  - An existing skill area with no `programId` adopts the resolved category;
    an unlinked skill area is invisible in the Goals & Targets drill-down.
  - Library usage/`usageCount` is recorded here, mirroring
    `POST /api/goal-library/recently-used`.
- **Where the row lands** is decided by `insertGoalRow()` in the same lib file.
  It reads the table's own `<thead>` and maps cells **by column NAME**, never by
  position, so a template that renames or reorders a column still fills
  correctly (the objective/definition test runs before the catch-all that reads
  "goal" as a label column — "Behavior / Goal" is a label, "Goal/Operational
  Definition" is not). The row is filed at the END of the matching category
  group rather than the bottom of the table, `&` and `AND` heading spellings
  both match, and `NEW GOALS – …` banners count as part of the group above
  them. With no table in the section, one is built with that kind's standard
  columns.
- **Parent-training rows are the exception to auto-creating a goal.** The
  "Also add to <name>'s Goals & Targets" switch defaults ON everywhere except a
  `parent_goals` section, where the objectives belong to the caregivers and a
  `Target` on the child's program would be wrong. The user can flip it either
  way.

## Tracker assessment print — nothing is ever clipped (2026-08-24)

`printAssessment.ts`'s paginator measures real overflow and pushes content onto
continuation pages, so adding text to a section moves everything below it down.
Two paths used to give up and clip instead, which in a clinical PDF is silent
data loss:

- a **non-table block taller than an empty page** (one long narrative
  paragraph, or a long list) was appended and left to clip;
- after `startContinuationShell()` the block was appended **without
  re-checking overflow**, so a block too tall for the fresh page clipped there.

Both now go through `spillBlockAcrossPages()`, which keeps splitting the block
onto further pages until it fits. `splitOverflowingBlock()` does the splitting
via `atomize()`: element children stay whole (a list sheds whole `<li>`s,
inline markup is never torn) and a text child becomes one atom per word, each
carrying its own surrounding whitespace so re-joining reproduces the original
text exactly.

**How much fits is found by BINARY SEARCH, not by shedding one word at a
time.** Height grows monotonically with the atom count, so ~12 layout
measurements settle what took 4000 before: a 4000-word paragraph plus a
400-item list paginated in **354 ms instead of 11.2 s** (23 pages, zero words
or items lost, zero pages clipping). Do not "simplify" this back to a
peel-one-word-off-the-end loop.

If not even one atom fits, one is kept anyway so the split still makes
progress; a single unsplittable atom taller than a page is kept and allowed to
clip rather than looping forever.

## A+ Scheduling Hebrew calendar is on the AMERICAN day (fixed 2026-08-26)

The calendar's Hebrew date read one day ahead of every US Jewish calendar, and
the Jewish holiday chips landed on the Gregorian day before the real one. Two
separate causes, both in `client/src/lib/`:

- **`hebrewDate.js` had `H_EPOCH = 347997`** — the Julian Day Number of
  1 Tishrei AM 1 is **347998**. One day low means `doy = jdn - hNewYear(y)`
  came out one too high, so EVERY converted date was pushed a day forward:
  12 Sep 2026 rendered as 2 Tishrei 5787 instead of 1 Tishrei, 2 Apr 2026 as
  16 Nisan instead of 15. `gToJDN()` was verified correct (JDN 2451545 for
  2000-01-01); the epoch constant was the only defect. The fix is checked
  against 20 anchors (Rosh Hashanah 5784-5789, Yom Kippur, Pesach, Purim in
  both a plain and a leap year, Chanukah, Shavuot) — the anchor list is in the
  comment above the constant. **Do not change that constant without re-running
  them.**
- **`gregorianToHebrewForDisplay()` rolled the date the wrong way.** The Jewish
  day starts at sunset, so a rollover should move to the NEXT Hebrew day after
  sunset; it returned the PREVIOUS day's date BEFORE sunset. The two bugs
  cancelled for "today" only, which is why today's cell looked right while
  every other cell was a day ahead.

The rollover is now gone entirely rather than corrected: a calendar square is
labelled with its **daytime** Hebrew date, the way a printed US Jewish calendar
prints it. Shifting one cell in the evening would put it a day ahead of its own
neighbours and a day ahead of the holiday chip beside it, since
`holidayService.js` keys `HEB_HOLIDAYS` off the daytime date — that
disagreement is what reads as "the calendar is on Israeli time".
`gregorianToHebrewForDisplay()` is kept as the single display entry point (it
now just delegates) and all three call sites in `AppointmentsPage.jsx` — week
header, month grid, appointment modal — go through it, so a future change to
the display rule lands in one place.

Deployed to `/opt/aba` on 2026-08-26 (see the A+ deploy recipe in Rule 5).

## A+ Scheduling Jewish holidays are the DIASPORA set (fixed 2026-08-26)

Follow-up to the Hebrew-date fix above. The clinic is in **New York**, so the
holiday table in `client/src/lib/holidayService.js` must keep diaspora practice,
and three separate defects made it read as an Israeli calendar:

- **Pesach was 7 days (15-21 Nisan).** The diaspora keeps **8** (15-22 Nisan).
  The 8th day is now `[1, 22, "Passover"]` -- for 5786 that restores
  Thu 9 Apr 2026. (Shavuot's 2 days and the split Shemini Atzeret / Simchat
  Torah were already diaspora-correct, so only Pesach was short.)
- **Hanukkah was a fixed list of 25-29 Kislev + 1-3 Tevet**, which silently
  assumes a 29-day Kislev. Kislev has **30 days in some years**, and in those the
  list punched a HOLE in the middle of the festival and added a bogus 9th day --
  5787 lost Thu 10 Dec 2026 (30 Kislev) and gained 13 Dec. It is now computed by
  `isHanukkah()` from `hebrewMonthLength(y, 9)` (newly exported from
  `hebrewDate.js`), which yields 8 consecutive days in every year.
- **Adar was keyed on the RAW month number.** In a leap year the raw months are
  12 = Adar I and 13 = Adar II, and Purim belongs to **Adar II**. The old table
  carried rows for both, so 2027 showed **Purim twice** (21 Feb on Adar I and
  23 Mar on Adar II) and put Ta'anit Esther in the wrong month entirely.
  `hebrewLookupMonth()` now remaps before lookup: `ADAR` (12) always means the
  Adar that carries Purim, `ADAR_I` (14) is the extra month and holds
  Purim Katan / Shushan Purim Katan. **Write new Adar rows with those constants,
  never with a raw 12 or 13.**

**Fast days never fall on Shabbat.** Four minor fasts move when the nominal date
is a Saturday: Tzom Gedaliah, Shiva Asar B'Tammuz and Tisha B'Av are postponed
to the Sunday after, and Ta'anit Esther is pulled BACK to the Thursday before
(the day before Purim would otherwise be a Friday). They now live in
`SHIFTED_FASTS` rather than `HEB_HOLIDAYS`, matched by
`shiftedFastsOn(month, day, weekday)`. Testing the weekday alone is sufficient
because each alternate day falls on its listed weekday exactly when the nominal
day was Shabbat (11 Adar is a Thursday iff 13 Adar is a Shabbat, 4 Tishrei is a
Sunday iff 3 Tishrei is a Shabbat, and so on). Asara B'Tevet is deliberately
left in the static table -- it is the one fast that is never moved, and 10 Tevet
can never land on Shabbat. Before this, 17 of the years 2024-2036 showed a fast
scheduled on a Saturday.

Verified 2024-2036: no fast on Shabbat, each fast exactly once a year, Purim
exactly once a year and always in the last Adar, Hanukkah always 8 consecutive
days, Pesach always 8 days. Re-run those checks if the table is edited.

## Tracker BCBA notes generate FROM THE SERVICE DELIVERED (2026-08-27)

A BCBA note documents a service, so the narrative has to describe the service
that was actually delivered. Before this, `bcbaDefaultContent()` seeded one
fixed paragraph per service type with only the names swapped in — a supervision
note for Tuesday and one for Thursday, for two different children, read
identically and had to be rewritten by hand.

- **`src/lib/sessionNoteData.ts` is the one session → note data layer.** The
  prisma include and the per-goal aggregation (trials + hand-attached
  `SessionTarget`s, prompt codes, percentages) moved out of the BT note route
  into it, and BOTH generators now call `summarizeSessionTargets()`. If the BT
  note says 42 trials at 78% and the supervision note written about that same
  session says something else, one of them is wrong in a clinical record — one
  aggregation is what prevents that.
- **`src/lib/bcbaNoteGenerators.ts` holds one generator per service type**, and
  `generateBcbaNote()` dispatches on it, so switching the note-type dropdown
  produces genuinely different documentation rather than the same paragraph
  relabelled:
  - **DSU** — supervision OF the selected BT's session that day: therapist and
    role, the service window, mode, trials/targets/accuracy, every goal observed
    with its own numbers, behavior events, then the feedback paragraph, with the
    below-60% / at-or-above-80% / mastered goals named from the data.
  - **TP** — the program reviewed against the last N days (default 30): active
    goals by phase, domains, what mastered, what is ready to advance, what is
    below criteria, newly opened goals awaiting baseline.
  - **PRT** — caregiver training anchored to that day's session, listing the
    goals reviewed with the caregiver and the ones needing home practice.
  - **TM** / **ASSES** — the team and program picture, and observation data.
  All deterministic — every number comes from a row in the database. A clinical
  record must never contain an invented figure, and regenerating from unchanged
  data must reproduce the same text.
- **`POST /api/clients/[clientId]/generate-bcba-note`** does the work and
  **returns the narrative WITHOUT saving it** (`smartsteps.notes.create` + client
  access). The BCBA reviews and edits in the modal and saves through the ordinary
  note routes, so generating never writes to the record.
  - Body: `serviceType`, `serviceDate` ("YYYY-MM-DD"), `tzOffsetMinutes`,
    optional `btUserId` / `sessionId` / `windowDays`.
  - **The service date is the CLINIC's day.** The browser sends its offset FOR
    that date (DST-correct) and the server builds the midnight-to-midnight
    window from it — the server's timezone is not the clinic's, and every date
    and time inside the narrative is rendered through the same offset.
  - The program snapshot uses `prisma.trial.groupBy` for per-goal counts rather
    than reading every trial row in the window.
- **The BCBA selects the BT.** The service card has a "BT / Therapist for this
  service" dropdown (user IDs, from `/api/users?forDropdown=1`); it filters the
  day's sessions to that therapist, and "Any therapist on this date" folds in
  all of them. When exactly one session matches, the note is LINKED to it
  (`Note.sessionId`) and its Time In / Time Out are filled from the session
  window when empty.
- **An untouched note is kept in step with the data.** A note whose narrative is
  still the boilerplate template (or empty) has not been written by anyone, so it
  regenerates whenever the service type, date or selected BT changes — including
  on open, which is what brings OLDER boilerplate notes in line with what was
  actually entered. `isTemplateContent()` tests the template against the
  plausible provider names (the note's saved provider, the logged-in user, and
  the "the BCBA" fallback), because an old note was seeded with whichever name
  was in the field at the time. The moment a BCBA edits the text it matches no
  template and this never touches it again; the explicit "Generate from session
  data" button confirms first in that case, and only a forced generation
  replaces recommendations / next steps that already have text.
- With no session on the date, the note is still generated — from the program
  data — and the modal says so rather than silently producing a supervision
  narrative about a session that does not exist.

## Tracker Goals & Targets tab — server hierarchy wins over the local cache (fixed 2026-08-27)

Reported as "I can't see Shlomo Schiff's goals". The goals were never missing:
the client has 13 ACTIVE skill areas across 5 categories and ~51 targets, and
`GET /api/clients/[clientId]/goals` returned all 13 to every ADMIN/BCBA account
and 12 to the assigned RBTs (the 13th is a duplicate empty "Receptive Language"
whose only target is inactive). The data was being hidden by the BROWSER, in
`ProgramsTab.tsx`'s cross-device hydration effect.

That tab renders from the persisted Zustand store (`useABAStore`, localStorage),
not from the fetch response. The server response only ever ADDED to the store.
Three defects let a bad parent link hide server data permanently:

- **The two fetches raced.** Categories (`GET /api/programs?clientId=`) and skill
  areas (`GET /api/clients/[clientId]/goals`) were two concurrent promises. A
  locally-created category keeps a `local-…` id with `serverId` set, so if the
  goals response landed first the category lookup missed and the skill area was
  filed under the raw SERVER `Program` id. `categorySkills` filters
  `item.categoryId === selectedCategory.id` against the LOCAL id, so that skill
  area — and every goal under it — silently vanished from the drill-down. The
  categories fetch is now **awaited** before skill areas are read.
- **The loop read one stale snapshot.** `useABAStore.getState()` was destructured
  once before the skill-area loop, so step 1's `addCategory` writes and the
  loop's own earlier writes were invisible to later iterations. It is now
  re-read every iteration, matching what the categories loop already did.
- **Repair only filled BLANK links.** `else if (categoryId && !localSkill.categoryId)`
  and `if (!localTarget.programId)` healed an empty parent id but never a
  *wrong* one. Because the store is persisted, once a row had been written with
  a bad non-empty id no reload, re-navigation or new session could fix it. Both
  now **reconcile** against the server (`!== categoryId` / `!== skillLocalId`),
  which is safe because the server is the source of truth for the hierarchy.

The effect also carries a `cancelled` flag so a client switch mid-fetch cannot
write one client's hierarchy into another's.

**Follow-up (same day): a goal hidden by a FAILED delete stayed hidden.** Leah
Fulop (ADMIN, `.all` on every scope, so never phase-filtered) still could not see
*some* of Shlomo Schiff's goals. Two more local-cache divergences, both of which
hide a goal in ONE browser while every other user keeps seeing it:

- **`deleteGoal()` in ProgramsTab never read the DELETE response.** It set
  `isActive: false` locally, fired
  `DELETE /api/targets/[targetId]` with `.catch(() => {})`, and toasted
  "Goal deleted." unconditionally. A refused (403), failed or offline delete
  therefore left the goal ACTIVE on the server and hidden forever in that
  browser — the store is persisted and hydration only filled BLANK fields. It
  now checks `res?.ok`, rolls the local hide back on failure, and reports the
  error, matching `deleteSkillArea()` / `deleteCategory()`, which already did.
- **`handleRemoveTarget()` on the goals page archived nothing.** It called
  `removeTarget(targetId)` and only *then* looked the row up with
  `useABAStore.getState().targets.find(...)` to read its `serverId`. Zustand's
  `set` is synchronous, so that lookup always returned `undefined` and the
  `PATCH { isActive: false }` was dead code 100% of the time — the target
  disappeared locally and stayed active on the server. The row is now captured
  before the removal.

**Hydration therefore reconciles every field the drill-down FILTERS on**, not
just the parent links: `isActive` and `clientId` on targets, and `clientId` on
skill areas. The goals endpoint only ever returns active targets, so the server
returning a goal proves it is active — restoring `isActive: true` cannot
resurrect a real delete (a successful delete stops the server returning it, and
local deletes are hard `filter()` removals, not soft flags). This is what heals
browsers already carrying a bad value. Content fields (title, phase) are left
alone so unsynced local edits are not clobbered.

**Access is a separate axis and was working correctly.** `smartsteps.goals.view`
is scoped: `.all` (ADMIN / BCBA / SUPERVISOR / READ_ONLY) sees every client;
`.assigned` (RBT, PARENT_VIEWER) requires a `ClientAssignment` row. An RBT with
no assignment gets a 403 on the client itself, so their goals tab is empty
because the whole client is out of scope — not because goals are filtered. Fix
that by assigning the client in Settings → Staff, not by widening the role:
PARENT_VIEWER shares the same scope machinery, so granting `.all` broadly would
let a parent open every other child's clinical record.

## Tracker data entry offers OPEN goals only (2026-08-27)

A mastered goal is finished clinical work — nobody runs trials on it any more —
so it is no longer listed anywhere a session's data is entered. Only unmastered,
open goals are offered.

`smart-steps/src/lib/targetVisibility.ts` remains the single source of truth and
gained the data-entry side of the rule:

- `isOpenForDataEntry(target)` — the client-side test. False for
  `phase === "MASTERED"` **and** for a local store row carrying
  `status: "mastered"` (a locally-created goal can hold a stale phase until it
  is re-hydrated from the server).
- `targetPhaseWhere({ restricted, excludeMastered })` — the prisma fragment for
  `GET /api/clients/[clientId]/targets`. A restricted viewer keeps their phase
  allow-list (`RESTRICTED_VISIBLE_PHASES`, which already excludes MASTERED);
  an unrestricted viewer passing `excludeMastered=1` gets `phase: { not:
  "MASTERED" }`. The two must be built together — spreading both would collide
  on the same `phase` key.

Applied at the three data-entry surfaces:

- **DataEntryTab** renders from the persisted Zustand store, not from the fetch,
  so the filter goes on the `allGoals` memo. Filtering there rather than at the
  render keeps the category/skill pill counts and the "no active goals" notice
  in step with the cards actually shown. Its `/targets` fetch is deliberately
  left UNFILTERED — it is a serverId sync into the shared store, not a picker,
  and dropping mastered rows from it would leave those goals unlinked for
  analytics.
- **`clients/[clientId]/session/new`** merges store targets with server targets,
  so both halves are filtered: `excludeMastered=1` on the fetch and
  `isOpenForDataEntry` on the store memo.
- **Session Snapshot drawer's "add goal" picker** passes `excludeMastered=1`.

Everything else still shows mastered goals: Goals & Targets, analytics, reports,
and a session's own recorded Goals Worked (a goal already on a session keeps
showing there even after it masters). `ProgramsTab`'s hydration calls the same
endpoint WITHOUT the flag and still receives mastered goals — do not add the
flag there, or mastered goals created on another device stop hydrating into the
hierarchy. `TargetDetailPanel`'s ad-hoc single-trial log is reached by opening
one specific goal, so it is untouched.

## A+ Scheduling appointment length follows the SERVICE (2026-08-27)

Every new appointment used to open as a flat 60 minutes whatever the service
was, so a **Phone Appointment** (15 min) and a **2 H Mercier Therapy** both had
to be re-timed by hand on every booking.

`client/src/lib/serviceDuration.js` is the single source of truth for how long a
service runs:

1. **`Service.durationMinutes`** — what Settings -> Services stores. Edit it
   there to change a service's length; it always wins. ("Phone Appointment"
   already carries 15 in prod.)
2. **A length spelled out in the service NAME** — `"2 H Mercier Therapy"` ->
   120, `"Therapy 1 hour"` -> 60, `"45 min consult"` -> 45. Several live
   services carry their length in the name with no `durationMinutes` set, so
   reading the name books them correctly without re-typing the config. The unit
   token is required and word-bounded, so a code or dosage in a name
   ("Vitamin B12 Shot", "Smoke Service 1772994633") never matches. Results are
   clamped to 5 min - 12 h.
3. Neither -> null, and the caller keeps the old `DEFAULT_APPT_MINUTES` (60).

In `AppointmentModal` (`client/src/pages/aplus/AppointmentsPage.jsx`):

- **Picking a service resizes the appointment** to that service's length
  (`handleServiceChange`), in both create and edit mode.
- **Moving the Start carries the End with it**, preserving the current length
  (`handleStartChange`) — the same thing dragging the card on the grid already
  did. Falls back to the service length when there is no valid span yet.
- **`endTouched` is the "except if more time was entered" rule.** The moment the
  End field is edited by hand, neither handler recomputes it again, so a longer
  slot the user typed is never silently shrunk back to the service default. The
  ref resets every time the modal is opened.
- Both handlers go through `shiftLocal()`, which refuses to build an end time
  from a half-typed / unparseable `datetime-local` string.
- The service banner now always shows the length ("15 min", "2 hrs"), not only
  once the pricing preview has loaded, and the service dropdown shows each
  service's real duration — it read `s.defaultDuration`, a field that does not
  exist on `Service` (the column is `durationMinutes`), so the duration hint
  never rendered at all.

**This change did NOT reach production until 2026-09-17.** It was committed
on 2026-08-27, but `/opt/aba` is a manual deploy (Rule 5) and the copy never
happened: the server had no `serviceDuration.js` and the pre-change
`AppointmentsPage.jsx`, so every phone appointment still opened at an hour
(reported 2026-09-17; 8 of the 59 live phone appointments had been booked as a
full hour). Deployed 2026-09-17 per the Rule 5 recipe (backup
`/root/aba-dist-backup-20260917-171711.tar.gz`; `serviceDuration.js` is now
its own shared chunk imported by both the appointments and waitlist pages).
When a "fixed" scheduling behavior is reported again, hash the server's files
against the repo before reading the code.
**The SSH host drops rapid back-to-back connections** (scp after scp fails
with "Connection closed"): space the calls out, or pipe a file through ONE
ssh session with `base64 -w0 file | ssh … 'base64 -d > target'`.

- **The waitlist "Schedule Appointment" form follows the service too**
  (2026-09-17, `ScheduleModal` in `client/src/pages/aplus/WaitlistPage.jsx`):
  the Duration select opens at the entry's service length and re-follows the
  Service dropdown until the Duration is changed by hand (`durationTouched`,
  the same rule as the calendar modal's `endTouched`). A service length outside
  the preset list is added as an option so the select never shows a wrong value.
- **`Appointment.durationMinutes` is BILLING time, not the calendar span.** The
  details drawer's invoice line editor writes line-item quantity × 60 back onto
  the appointment (`PUT /invoices/:id`, then the drawer's follow-up appointment
  PUT) without moving `endsAt`, and `sync-billing-to-amount` derives it from
  amount ÷ rate. That is why 11 live phone appointments carry a 15-minute
  calendar span with `durationMinutes` 60 (or 64 / 72 / 92 …). The calendar
  card, the edit modal and drag move/resize all read `startsAt` / `endsAt`, so
  this is not the calendar bug. Do not "fix" it by snapping `endsAt` to
  `durationMinutes` on update — that would stretch a 15-minute phone call to an
  hour on the grid whenever it is billed as one unit.
- `POST /appointments/:id/reschedule` still defaults a missing
  `durationMinutes` to 60 instead of the appointment's own length. Nothing in
  the client calls it, so it was left alone.

## Tracker sessions record SUPERVISION, and DSU notes require it (2026-08-27)

A direct-supervision note documents supervision that actually happened. Before
this the DSU generator read every session on the service date, so a session no
BCBA ever attended could be written up as supervised — and a note that says a
BCBA observed a session that was never observed is a false clinical record.

- **`Session.supervised` (Boolean, default false) + `Session.supervisorId`**
  (migration `20260827000000_session_supervision`). The second `Session -> User`
  link means both relations are named: `SessionProvider` (who ran the session)
  and `SessionSupervisor` (who supervised it). Clearing `supervised` clears the
  supervisor with it — an unsupervised session must not keep one on record.
- **Entered where the session is.** "A BCBA supervised this session" plus an
  optional supervising-BCBA dropdown appear on both session setup forms
  (`DataEntryTab` and `clients/[clientId]/session/new`) and in the Session
  Snapshot drawer's edit panel, so a session supervised but not flagged at entry
  can be corrected afterwards. Supervision is per-session and is reset for the
  next one, never carried over. `POST /api/sessions`, `PATCH
  /api/sessions/[sessionId]`, `queueSession()` and `/api/sync` all carry the two
  fields, so an offline session keeps its supervision when it syncs.
- **Visible without opening the session**: a purple "Supervised" chip on the
  session cards (tooltip names the supervisor), a Supervision fact on the
  snapshot, and a `supervised=1|0` filter on `GET /api/sessions` exposed in the
  Sessions tab filter panel — server-side, like every other session filter,
  because the list is paginated.
- **DSU generation is restricted to supervised sessions.**
  `loadClientSessionsInRange({ supervisedOnly })` adds `supervised: true` to the
  query, and `generate-bcba-note` sets it for `serviceType === "DSU"` only —
  every other service type may still reference any session on the date. The
  narrative names the supervising BCBA from the session record when there is
  one, falling back to the note's author.
- **With no supervised session the note refuses to invent one.** It states that
  no supervised session is on record for that date instead of describing an
  observation that did not happen, and the editor's warning says to mark the
  session as supervised on the Sessions tab and generate again — the fix is on
  the session, not in the note.

## Tracker supervision has a TIME WINDOW, recorded from the BT note too (2026-09-07)

A BCBA is often present for only part of a BT session. The DSU note bills the
supervision that actually happened, so the session now records WHEN the BCBA
was there, and the BT writing up the session can record it without leaving
their note.

- **`Session.supervisionStartedAt` / `Session.supervisionEndedAt`** (migration
  `20260907000000_session_supervision_window`), both optional. NULL means the
  BCBA was present for the whole session, so nothing already marked supervised
  changed meaning. `supervisionWindow()` in `src/app/api/sessions/route.ts`
  validates a window (end must be after start; a negative span is refused, not
  stored) and is shared by `POST` and `PATCH /api/sessions/[sessionId]`. On
  PATCH, `supervised: false` clears the window along with the supervisor; the
  offline queue and `/api/sync` carry the two fields like the flag.
- **Three places to enter it**, all alongside the "A BCBA supervised this
  session" checkbox: both session setup forms, the Session Snapshot edit panel,
  and — new — a **Supervision card on the BT session note** in
  `NoteEditorModal`. A BT note shows the client's sessions on its service date
  (`GET /api/sessions?clientId&from&to`), auto-links to the only one when there
  is exactly one, and pulls that session's current supervision into the form
  once per linked session (`supPrefilledFor`). Saving the note then PATCHes the
  session — the note is saved first, and if the session write fails the toast
  says exactly that, so the BT never loses their note over it. **Supervision
  lives on the session, never on the note**, because the session is what a
  DSU note is generated from.
- **The DSU note bills the supervision window.** `supervisionSpan()` in
  `bcbaNoteGenerators.ts` returns the recorded window when there is one and the
  session window otherwise; `generate-bcba-note` returns it as
  `billedStartedAt` / `billedEndedAt` and the editor fills the note's Time In /
  Time Out from THAT, not the session's start/end. The narrative reads
  "Supervision was provided 3:30 PM – 4:30 PM (1 hr) during the
  3:00 PM – 5:00 PM (2 hrs) Discrete Trial Training (DTT) session", and the
  per-session line carries "(supervision 3:30 PM – 4:30 PM (1 hr))".
- The session card chip tooltip and the snapshot's Supervision fact show the
  window in 12-hour form via `formatClockRange12h`.

## A+ Scheduling "page goes blank" — error boundary + error log (2026-09-17)

Reported as "a lot of times when searching stuff the page goes blank". The
API side was clean: every `/api/clients?search=` request in two weeks of nginx
logs answered 200/304, and the rows on the pages that blanked (page 3 of the
directory, several search result pages) have no null names or bad dates. What
the logs DO show is the user reloading the same page over and over
(`/aplus/clients?page=3` fourteen times, even across a re-login) — the
signature of a client-side render crash, which in React 18 unmounts the whole
tree and leaves a white page. **There was no error boundary anywhere and no
error logging, so nothing was ever recorded.** Root cause therefore NOT yet
confirmed; the fix makes the next occurrence visible and self-reporting:

- `client/src/components/common/ErrorBoundary.jsx` wraps the routed page
  (`AppLayout`, keyed by route so navigating away resets it) and the whole
  `App`. A crash now shows "Something went wrong on this page" with the error
  message and Reload / Try again / Go back buttons, while the sidebar and top
  bar stay up. A stale lazy-route chunk after a deploy (`Failed to fetch
  dynamically imported module`) reloads the page automatically, once.
- `client/src/lib/errorReporting.js` POSTs every uncaught error (boundary,
  `window.onerror`, `unhandledrejection`) to **`POST /api/client-errors`**
  (`server/src/routes/clientErrors.routes.js`, auth required, 5/min per tab),
  which writes it to the app log. **Next time it blanks, read
  `/home/aba/.pm2/logs/aba-app-error-0.log` and grep `[client-error]`** — the
  message, stack, component stack, URL and browser are all there.
- Crash candidates found by reading and fixed anyway: the directory `Avatar`
  threw on a null/blank name (`name.charCodeAt`); the details drawer's "View
  Client" navigated to `/aplus/clients/undefined` when an appointment carried
  no `clientId`; the Payments client picker called `.toLowerCase()` on a null
  name; the directory's anchor-row restore used `scrollIntoView`, which also
  scrolls the overflow-hidden app shell (it now scrolls `#app-main-scroll`
  only); `load()` now tolerates an unexpected response shape.

**Search itself was also made better** (same commit):

- **Server (`server/src/services/clientSearch.js`)**: every whitespace-separated
  word must match somewhere (AND across words, OR across fullName / firstName /
  lastName / email / insurance / the three phone fields). `fullName` is stored
  "Last First", so "Libby Schiff" used to find nothing. A digits word is also
  matched against the phone fields with formatting stripped (raw
  `regexp_replace` id lookup), so "7185551234" finds "(718) 555-1234".
- **Clients page**: responses are sequence-numbered and a stale one is dropped
  (with three keystrokes in flight the slowest reply used to win); the search
  box now FOLLOWS the URL when the change came from outside it (sidebar
  "Clients" link, back button) — before, the debounce wrote the old text back
  into the URL, so a search could not be cleared by leaving the page; the text
  is trimmed before it hits the URL; there is a clear (×) button and Esc
  clears; placeholder says what is searchable.
- **Invoices page**: the search is debounced (300 ms) with the same stale-reply
  guard, and the 1.3 MB full client list for the pickers is fetched once on
  mount instead of on every keystroke.

Deployed 2026-09-17 (client rebuild + `pm2 startOrReload` of `aba-app`;
backups `/root/aba-dist-backup-20260917-174847.tar.gz` and
`/root/aba-src-backup-20260917-174848.tar.gz`). At the time `InvoicesPage.jsx`
on the server was NOT the repo file (the repo copy carried an
`EditInvoiceModal` production had not received), so only this task's search
hunk was applied to the server's copy with `patch`. **That gap has since
closed**: as of 2026-10-20 the server's `InvoicesPage.jsx`,
`invoice.routes.js`, `payment.routes.js` and `quickbooksService.js` all
hash-match the repo, and the invoice/payment edit modals are live.

## Git line endings on this machine (2026-09-17)

The system gitconfig has `core.autocrlf=true` but `.git/config` sets it to
`false`, and the working tree was checked out under the old setting: most
files are LF in the index (`git ls-files --eol` → 384 `i/lf`, 22 `i/crlf`) but
CRLF on disk, and git only notices when the file is touched. The Edit tool
preserves CRLF, so editing such a file and committing rewrites EVERY line
(this happened to `WaitlistPage.jsx` in commit `1b52f4c`; restored to LF in
the next commit). **Before committing, normalize each touched file to its
INDEX ending** (`git ls-files --eol <file>`; `i/lf` → `sed -i 's/\r$//'`),
and write new files as LF. `git diff --stat` showing a whole file changed is
the tell.

## A+ Scheduling appointment modal client picker is now searchable (2026-10-13)

The client selection dropdown in the appointment modal now allows typing to
search for clients by full name, first name, or last name, instead of scrolling
through a plain `<select>` list. The new `SearchableClientSelect` component
filters clients as you type, matching any word in the name (handles flexible
name order like "Libby Schiff" or "Schiff Libby").

- `client/src/components/common/SearchableClientSelect.jsx` — reusable
  component with a search input and filtered dropdown list.
- `client/src/pages/aplus/AppointmentsPage.jsx` — updated the appointment
  modal to use `SearchableClientSelect` instead of a plain `<select>` for the
  Client field. Works identically to the `ClientSearchSelect` already in
  `WaitlistPage.jsx`, which shares the same UX pattern.

## A+ Scheduling per-provider calendars to prevent double-booking (2026-10-13)

Each provider (Goldy Silberman, therapists, and other staff) now has their own
calendar view in the appointments scheduler. The calendar toolbar includes a
provider dropdown that filters all visible appointments to show only the
selected provider's schedule — making it easy to see when they are free and
prevent scheduling conflicts.

- Added `selectedProviderId` state to track which provider is being viewed.
- Modified the `visibleAppts` filter to exclude appointments from other
  providers when one is selected.
- Added a provider dropdown to `CalendarToolbar`, alongside the view switcher
  (day/week/month). Selecting a provider shows only their appointments; "All
  Providers" shows the full calendar.
- **Backend validation:** the server already rejects overlapping appointments
  with a `409 Appointment conflict detected` error (see
  `server/src/services/clinic/appointments/appointmentService.js`,
  `hasProviderConflict`). The frontend could display this error in the modal
  if a user tries to create an overlap (currently the API returns the error,
  but the modal toast handling should display it).

## A+ Scheduling payments — `Payment` has NO `metadata` / `notes` column (fixed 2026-10-20)

Reported as "could not record payment" (cash for less than the invoice) and
"editing a payment doesn't save". Both were ONE defect: `POST
/invoices/:id/pay` and `PATCH /invoices/:id/payments/:paymentId` wrote a
`metadata` object onto `Payment`, a column that does not exist — verified
against production `information_schema.columns` (schema and DB agree; no
migration is missing). That code arrived in commit `b4315bb` ("invoice and
payment editing with overpayment support", 2026-10-13), which never reached
`/opt/aba` until the whole route file was copied on 2026-10-15, so the
overpayment feature had never actually run in production.

- **Prisma names the WRONG field.** With an unknown key in `data`, Prisma
  cannot choose between its checked input (`client: { connect }`) and
  unchecked input (`clientId`) types and reports against the checked one:
  `Unknown argument clientId. Did you mean client?`. `clientId` was always
  valid; the real offender (`metadata`) shows up further down the same error.
  On that message, look for a field that is not in the schema — do not
  regenerate the client or rewrite the FK as a nested `connect`.
- Overpayment/partial state was read NOWHERE (no consumer in server or
  client), so it is simply not stored: `description` carries "Partial
  payment" / "Manual overpayment (creates credit)" and the activity log
  carries the amounts. A real `metadata` column is a migration — add it on
  purpose, not as a side effect.
- **Partial payments are allowed**: the pay route rejects only `amount <= 0`.
- **The payment editor is `EditPaymentModal` -> `PATCH
  /invoices/:id/payments/:paymentId`** (`invoice.routes.js`), MANUAL payments
  only. It now also calls `recalculateInvoiceBalance()` (an amount edit used
  to leave `balanceDue`/status stale) and strips a leading "<method> — " from
  the reference the modal sends back (the modal pre-fills that field with the
  whole existing description, so every save used to prepend the method
  again). A second `PATCH /payments/:id` added to `payment.routes.js` on
  2026-10-15 was unused dead code (and wrote a nonexistent `notes` field); it
  was removed — do not re-add a parallel edit endpoint.
- Verify without writing: a `prisma.$transaction` that creates and updates a
  Payment and then throws rolls back cleanly (used 2026-10-20, 0 rows left).
  `cd /opt/aba && node --env-file=.env probe.mjs` resolves both
  `@prisma/client` and `DATABASE_URL`.

**`/opt/aba` deploy lessons from the same incident:**

- `prisma generate` must run as `npm run prisma:generate` from `/opt/aba` (it
  resolves `server/prisma/schema.prisma` through the workspace). A bare
  `npx prisma generate` in `/opt/aba` fails "Could not find Prisma Schema";
  the schema is NOT missing. `/opt/aba/deploy.sh` runs the full sequence.
- `rm -rf node_modules && npm install` as root leaves `node_modules`
  root-owned; restore with `chown -R aba:aba /opt/aba/node_modules`.
- A server-only change needs `pm2 startOrReload` as `aba` — no `npm run
  build` (that only builds the client).
- The server rebooted ~2026-10-18; `pm2-aba.service` brought `aba-app` back
  from the saved dump, which is why its restart counter reset.

## A+ Scheduling QuickBooks — customer lookup matches names in ANY word order (fixed 2026-10-15)

Reported for Shevy Zoldan: `Invalid Reference Id : Names element id 1407 not
found`. The QB customer is "Shevy Zoldan"; the app stores "Zoldan Shevy".
`ensureQBCustomer()` queried QB for the app's exact name, found nothing,
created a duplicate customer, and the invoice then referenced an id QB
refused. It now tries the exact name, the REVERSED word order, then case
variations before creating — the reversed lookup is what matched. A
"fetch every customer and match parts" pass (`SELECT * FROM Customer
MAXRESULTS 1000`) returned no rows in production with the error swallowed, so
do not go back to that. Invoice lines are `SalesItemLineDetail` WITHOUT an
`ItemRef`: the hardcoded `{ value: "1", name: "Services" }` item does not
exist in this QB company, and QB accepts `Qty` + `UnitPrice` alone.
`[QB DEBUG]` lines in `quickbooksService.js` print to `aba-app-error-0.log`
and were left in deliberately for the next lookup mystery.

## Tracker goals listed TWICE in session data entry (fixed 2026-10-20)

Reported for client Libby Weiner: goals appeared twice when entering session
data but only once in Goals & Targets. Her SERVER data is clean — 20 targets in
the goal hierarchy, 0 program-direct, each returned exactly once — so the
duplication was entirely in the persisted Zustand store (localStorage).

**Three effects hydrate that one shared store from the server, concurrently,
across two components**: `ProgramsTab`'s serverId sync, `ProgramsTab`'s
cross-device hydration, and `DataEntryTab`'s serverId sync. Both serverId syncs
read a single `useABAStore.getState()` snapshot BEFORE their loop and tested
"is this row already in the store?" against that stale copy, while `addTarget`
was a blind `[...s.targets, row]` push with no guard. Two of them racing both
concluded the row was missing and both appended it.

Why it showed in data entry but NOT in Goals & Targets: the two paths write
**different parent links for the same goal**. The serverId syncs set `programId`
to the server `ParentGoal` id; hydration sets it to the LOCAL skill-area id. The
drill-down filters `goal.programId === selectedSkill.id` on the local id, so the
extra copy matched no skill area and dropped out of the drill-down — while the
data-entry lists are flat and showed both.

`DataEntryTab`'s sync additionally had the two fields **inverted**
(`programId: groupType === "program" ? groupId : ""`), so a goal-hierarchy
target it added got `programId: ""` and a program target got the Program id in
`programId` — neither matches a skill area. It is now identical to the
ProgramsTab copy; keep them that way.

Fixes, outermost first:

- **`src/lib/storeDedupe.ts`** is the single source of truth for row identity:
  a row's identity is its `serverId` when it has one, else its local id (so a
  locally-created row that has since synced IS the server record, and a
  never-synced row can never collide with one).
- **The store's `addCategory` / `addProgram` / `addTarget` ignore a row it
  already holds.** The guard has to live in the store — the racing callers
  cannot see each other's writes.
- **`persist`'s `merge` dedupes on rehydrate**, so a browser whose localStorage
  already holds doubled rows heals on the next page load rather than needing a
  cache clear.
- **Both serverId syncs re-read `getState()` per iteration** (the same stale-
  snapshot fix the hydration effect got on 2026-08-27).
- **The render paths dedupe too** — `allGoals` in DataEntryTab and the store
  half of the `session/new` picker merge. That merge deduped the SERVER list
  against the store but never the store against itself, so two rows mapping to
  one effective id both came through.
- **`cloneGoal()` no longer inherits the original's `serverId`.** The spread
  `addTarget({ ...goal, id, … })` carried it, so the copy claimed to be the same
  server record — harmless before, but it would have been swallowed by the new
  add guard. A clone is an unsynced row until its own POST returns.

**`POST /api/targets` is now idempotent on (parent, definition)**: re-creating a
goal that already exists under the same sub-goal / parent goal / program returns
the EXISTING row with `duplicate: true` instead of a second copy, mirroring
`goal-library-import`. Scoped to the same parent, so two children — or two skill
areas — may legitimately share wording; an orphan target with no parent is not
scopable and is always created.

**Follow-up (2026-10-21): identity de-duplication was not enough.** Doubles were
still showing on Libby Weiner's file. Ruled out first: her server data is clean
(20 targets, no duplicate wording even ignoring parents), the deployed bundle
really does contain the fix, and `public/sw.js` is already v3 network-first for
pages with cache-first only on hashed `_next/static/*`, so the browser was NOT
serving a stale build.

The gap was the de-duplication KEY. `dedupeStoreRows` collapses rows it can
prove are the same record — `serverId`, else local id. A leftover **unsynced**
row has no `serverId` at all, so its identity is its own local id and the pair
survived.

Those leftovers come from the serverId syncs' title matcher, which was
`(t.title ?? "").trim().toLowerCase() === (st.definition ?? "").trim().toLowerCase()`
— it never collapsed INTERNAL whitespace. A local title differing from the
server definition by only a double space, a newline or a non-breaking space
failed to match, so the sync fell through to `addTarget` and the store kept BOTH
the unsynced local row and the server row.

- **`normalizeLabel()`** (trim + lowercase + collapse whitespace runs) is now the
  one comparison form, used by all four matchers — the two target syncs in
  ProgramsTab/DataEntryTab and the two category matchers in ProgramsTab.
- **`dedupeTargetRows()`** = identity de-duplication, then drop any UNSYNCED row
  whose label already exists on a SYNCED row for the same client. Used by
  `allGoals`, the `session/new` picker, and the persist `merge` so the store is
  cleaned permanently on rehydrate.
- **Two server-backed rows are never collapsed by label.** `POST /api/targets` is
  idempotent only within one parent, so the same wording may legitimately exist
  under two different skill areas; hiding one would be data loss, not a fix.

Nine cases are covered by a throwaway `tsx` harness (same serverId, synced +
whitespace-differing unsynced leftover, newline variant, genuinely-new unsynced
row, two server rows sharing wording, same title across two clients, blank
title, identity-only de-duplication for categories, and unsynced-row upgrade).
Re-run it if this logic is touched.

**If a browser still shows doubles after a reload**, the escape hatch is to clear
the `smart-steps-aba` localStorage key — the store is a cache, the server is
authoritative, and the only thing lost is session data not yet synced.

**Follow-up (2026-10-21, second): the store now PRUNES against the server
instead of relying on matching the duplicate's shape.** Two rounds of
de-duplication keyed on guesses about how the duplicate row looked (identity,
then label). Rather than guess a third time, both serverId syncs now treat the
server's list as authoritative:

- `staleServerRowIds()` returns store rows for the client that claim a
  `serverId` the server did NOT return. Those are removed. That clears a stale
  or duplicated cache **without needing to know how the bad row got there**, and
  also clears goals deleted or archived on another device.
- **Unsynced rows are never pruned** — they are work that has not reached the
  server yet. Leftovers among those are handled by `dedupeTargetRows`, which now
  also collapses two UNSYNCED copies of one goal (previously it only dropped an
  unsynced row that duplicated a SYNCED one).

Two guards make pruning safe, and both must hold for any future caller:

- **Only the UNFILTERED list may drive it.** Both syncs fetch
  `GET /api/clients/[clientId]/targets` with no query flags, which returns every
  active target including MASTERED and program-direct ones. Pointing this at
  `excludeMastered=1` would prune every goal the filter removed.
- **A failed request must not look like "this client has no goals."**
  DataEntryTab's query returned `{ groups: [] }` on a non-OK response, which
  passes an `if (!data?.groups) return` guard and would have pruned the client's
  entire cache on any fetch failure. It now returns `null`.

The `tsx` harness covers 13 cases, including the three pruning safety
properties (never prune an unsynced row, never prune another client's rows,
prune nothing when the server has everything).

**Real duplicate rows found in production** (a different problem — these are in
the database, not the cache). Created 13-60 s apart, which is too slow for a
double-click and is the signature of someone saving a goal, not seeing it appear
because of the drill-down bugs above, and typing it again:

| Client | Goal | Ids |
| --- | --- | --- |
| Aron Wertzberger | "…select appropriate utensils…" | `cmt1r8vsi00ktkq004umjojh3`, `cmt1ra68r00kvkq00aqre2nas` |
| Yisrol Zev Wallach | "…read a 3 word sentence…" | `cmtvvn5c1002qkqghkq3sye9g`, `cmtvvnfhd002skqghhpyosfhf` |
| Yisrol Zev Wallach | "…use a betty crocker safely v/p" | `cmuctvs8f003okqgh5uub9m5g`, `cmuctw74s003qkqghk51unyi2` |
| Yossi Brim | "…does not have to get aggressive…" | `cmpzssgq9003lkqejxsaokx6q`, `cmpzssshg003nkqejn8crp9o2` |

All eight rows have **zero trials, zero session links, zero annotations**, so
either copy of each pair is removable without losing data. Left in place pending
the user's decision — deactivating one is what the app's own Delete Goal does
(`isActive: false`, reversible).

**The four duplicate pairs were cleaned up in the prod DB on 2026-10-20.** In
every pair NEITHER copy had data (0 trials, 0 session links, 0 annotations), so
the rule applied was: keep the copy that has data; if none has data keep the
EARLIEST-created one; never touch a row that has data, and never both members of
a pair. Deactivated (`isActive: false`, the same soft delete the app's Delete
Goal performs — the rows and any future history survive and clearing the flag
restores them):

- `cmt1ra68r00kvkq00aqre2nas` (Aron Wertzberger) — kept `cmt1r8vsi00ktkq004umjojh3`
- `cmtvvnfhd002skqghhpyosfhf` (Yisrol Zev Wallach) — kept `cmtvvn5c1002qkqghkq3sye9g`
- `cmuctw74s003qkqghk51unyi2` (Yisrol Zev Wallach) — kept `cmuctvs8f003okqgh5uub9m5g`
- `cmpzssshg003nkqejn8crp9o2` (Yossi Brim) — kept `cmpzssgq9003lkqejxsaokx6q`

A re-scan afterwards found zero duplicate groups clinic-wide (379 active / 18
inactive targets). The duplicate test is scoped to the same parent, so the same
wording under two different skill areas is not treated as a duplicate.

**Izzy Weinstock's 3 program-direct targets are still outstanding** — no
decision taken, nothing changed.

**Izzy Weinstock has 3 program-direct targets** (`parentGoalId` and `subGoalId`
both null, attached straight to a `Program`): `gdfygfhgkh` (junk, 0 trials),
"izzy will learn to follow a mand…" (4 trials), "will learn not to scream"
(0 trials). `GET /api/clients/[id]/goals` does not return program-direct
targets, so they never hydrate into the store and are **invisible in Goals &
Targets**, while `GET /api/clients/[id]/targets` does return them, so they DO
appear in session data entry. No other client has any. These are legacy
(March 2026) and also await a decision — re-parent them under a skill area to
make them visible, or deactivate.

## Tracker PWA assets ignored basePath — manifest and service worker both broken (fixed 2026-10-21)

Found in a browser console the user opened for an unrelated reason:
`manifest.json:1 Manifest: Line: 1, column: 1, Syntax error.`, repeated.

`next.config` sets `basePath: "/smart-steps"`, but **basePath is not applied to
metadata URLs**, and `layout.tsx` declared `manifest: "/manifest.json"`. nginx
routes `/` to A+ Scheduling on :4000, so the browser fetched the SCHEDULING
SPA's `index.html`, got `200 text/html`, and failed to parse it as a manifest at
line 1, column 1.

`RegisterSW.tsx` had the identical bug: `navigator.serviceWorker.register("/sw.js")`
also resolved to the Scheduling SPA. Registering HTML as a worker script always
threw, and `.catch(() => {})` swallowed it — so **the Tracker's service worker
had never registered in production at all**, despite sw.js being at v3. (Useful
corollary: a stale service worker can be ruled out as a cause of users running
old Tracker code.)

Fixed together, since it is one defect:

- `layout.tsx` -> `manifest: "/smart-steps/manifest.json"`.
- `RegisterSW.tsx` -> `register("/smart-steps/sw.js", { scope: "/smart-steps/" })`.
- **`middleware.ts` now excludes `manifest.json` and `sw.js`.** Both are
  requested on the login page before any session exists, so the auth middleware
  was answering a 302 to `/login` instead of the file — the right path alone
  would still have failed. Neither file contains anything private.
- `public/manifest.json`'s own app-absolute URLs needed the prefix too:
  `start_url` was `/` (launching the installed app into A+ Scheduling) and the
  icon was `/favicon.ico`. Its `background_color`/`theme_color` were `#0a0a0a`
  while `viewport.themeColor` is the light `#f8fafc`; aligned to light.

When adding any new file under `public/` that the BROWSER requests by absolute
path, write the `/smart-steps` prefix explicitly and check the middleware
matcher — neither is applied for you.

## Tracker "Email already in use" now names the blocking record (2026-10-21)

`PATCH /api/staff/[userId]` answered a bare `409 Email already in use`, which is
unactionable: the holder is usually a second, EMPTY record for the same person.
Live example — two rows for Rivka Ruchy Gottlieb:

- `cmrwd4t28065kkqwnqd5j8ek3` — the real one, `albumsbyrivky@gmail.com`,
  213 sessions, 1 assigned client.
- `cmvie69tu0001kqqj7okkdqxx` — added later as `rivkarg@apluscenterinc.org`,
  0 sessions, 0 clients, 0 notes, no password.

Moving the real record onto the work email 409s because the new empty record
already holds it. The error now names the conflicting record, reports whether it
has any clients/sessions/notes, and returns `conflictUserId` /
`conflictIsEmpty`, so an admin can see that the blocker is an empty duplicate
and delete it.

`scripts/mergeDuplicateUsers.mjs` does NOT catch this: it groups by duplicate
EMAIL, and here the two rows have different emails. Same person, two addresses.

## Tracker service worker v4 — every response path returns a real Response (fixed 2026-10-21)

Reported minutes after the registration-path fix above went live:

```
The FetchEvent for ".../smart-steps/clients/<id>?tab=programs" resulted in a
network error response: the promise was rejected.
sw.js:1 Uncaught (in promise) TypeError: Failed to convert value to 'Response'.
```

**This was a regression introduced BY that fix.** `sw.js` had carried two bugs
since v3, but `register("/sw.js")` resolved to the A+ Scheduling SPA, so the
worker had never registered in production and neither bug could fire. Correcting
the path activated both at once:

1. **The offline fallback could resolve to `undefined`.** The handler ended
   `.catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(request)))`,
   and `cache.match` resolves to `undefined` on a miss. `respondWith(undefined)`
   throws "Failed to convert value to 'Response'", and the browser shows a
   network error instead of the page — a blank page on ANY fetch failure for a
   URL outside the precache list, which is every client page. Every path now
   ends in a Response; a miss falls back to a small styled offline notice
   (503) that says entered data is kept, with a Try again button.
2. **`PRECACHE` listed root paths** — `/`, `/login`, `/dashboard` — which nginx
   routes to A+ Scheduling on :4000, so install cached the WRONG app's HTML
   under those keys. They now carry the `/smart-steps` prefix, and entries are
   cached individually with `cache.add(...).catch(() => {})` because a single
   `addAll()` rejection aborts the whole install.

Also hardened: cross-origin and unparseable URLs are skipped, the hashed-asset
branch has its own `.catch`, `res.ok` is checked before caching, and
`cache.put` failures cannot reject the response.

`CACHE_NAME` is bumped to `smart-steps-v4`, so `activate` deletes the v3 cache
(including any Scheduling HTML it had stored under `/`). With `skipWaiting()` +
`clients.claim()` already in place, clients pick up v4 on their next load.

**Lesson for this file: a service worker is the one place where a dormant bug
can take the whole app down the moment registration starts working. Any
`event.respondWith()` must be given a promise that CANNOT resolve to anything
but a Response.**

## Staff merge — same person under two different emails (2026-10-21)

Rivka Ruchy Gottlieb had two rows. Reconstructed from timestamps: at 17:34 she
was added again under her work email (invite sent), and at 17:39 someone tried
to move her REAL record onto that address and hit the 409 above.

- kept `cmrwd4t28065kkqwnqd5j8ek3` — 213 sessions, 1 client, 5 audit entries
- dropped `cmvie69tu0001kqqj7okkdqxx` — created 17:34, already `isActive:false`,
  0 clients / sessions / notes, 1 invite token (cascades on delete)
- the surviving record now carries `rivkarg@apluscenterinc.org`

**Changing her email was safe to do because she has no A+ Scheduling account**
(`aplus_sched."User"` has no row for either address or for the name), so there
was no SSO identity to break — she authenticates through the Tracker invite
flow. Check that before changing any staff email: `ensureUser()` resolves by id
first and then by EMAIL, so renaming a row that an SSO login matches by email
sends that person to a fresh orphan row — the original "assigned clients don't
appear" bug. Both apps share database `aba_db`; the Tracker is schema `public`
and Scheduling is `aplus_sched`, so one connection can check both.

### `scripts/mergeDuplicateUsers.mjs` was STALE and is now fixed

It re-pointed only the relations that existed when it was written. Two added
later were silently left behind, and a merge would have **stripped the
supervising BCBA off every session the duplicate supervised and orphaned the
goals they attached by hand**:

- `Session.supervisorId` (migration `20260827000000_session_supervision`)
- `SessionTarget.addedById` (`20260820000000_session_added_goals`)

Both are re-pointed now. The transaction body was extracted into
`mergeInto(tx, keeper, dupe)` so the two entry points share one implementation
and cannot drift again. **When adding a relation to `User`, add it there.**

It also gained an explicit-pair mode, because grouping by lowercased email
cannot see one person under two addresses:

```
node --env-file=.env.local scripts/mergeDuplicateUsers.mjs \
  --keep <keeperId> --drop <dupeId> [--email new@addr] --apply
```

Dry run by default. It **refuses to drop a row that has clients, sessions or
notes** — getting the direction wrong is the one mistake here that destroys
clinical data, and that guard was verified by running the Rivka merge backwards
first (correctly refused, naming the 213 sessions). It writes a `USER_MERGED`
audit entry recording the dropped id, its email, and the new address.

## Rule 5: Deploy (step 3 of the Rule 0 end-of-task sequence)

### Smart Steps ABA Tracker (git-based, re-wired 2026-08-13)

Production runs from `/var/www/aplus2/smart-steps`. To deploy after pushing
to `main`:

```
ssh -i "C:\Users\A Plus Server\.ssh\id_ed25519" root@91.229.245.143 "cd /var/www/aplus2 && git pull && cd smart-steps && npm ci --no-audit --no-fund && npx prisma generate && npm run build && pm2 restart smart-steps && sleep 5 && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/smart-steps"
```

Expect `200` at the end.

**If new prisma migrations were added**, run `prisma migrate deploy` BEFORE the
build/restart. The Prisma CLI does not read `.env.local` (which is where the
server keeps `DATABASE_URL`), so it must be injected — a bare
`npx prisma migrate deploy` fails with `P1012 Environment variable not found:
DATABASE_URL`:

```
cd /var/www/aplus2/smart-steps && DATABASE_URL=$(node -e "require('dotenv').config({path:'.env.local'});process.stdout.write(process.env.DATABASE_URL)") npx prisma migrate deploy
```

**Rollback:** `pm2 delete smart-steps`, then `pm2 start npm --name smart-steps
-- run start` from `/var/www/aplus/aplus-center-scheduling/smart-steps`
(the frozen pre-split live state), then `pm2 save`.

### A+ Center Scheduling (manual — recipe verified 2026-08-26)

`/opt/aba` is NOT git-managed, so `client/`/`server/` changes never reach
production via `git pull`. **Always confirm with the user before touching
`/opt/aba`.** Never run destructive git commands on `/var/www/aplus` (frozen
rollback state).

Layout: npm workspaces (`server` + `client`) with deps hoisted to
`/opt/aba/node_modules` — there is no `client/node_modules`, and `vite` lives in
the root `.bin`. The app runs under PM2 as process **`aba-app`, user `aba`**
(systemd unit `pm2-aba.service`, `PM2_HOME=/home/aba/.pm2`) — NOT under the root
PM2 that owns `smart-steps`. `/opt/aba/deploy.sh` is the full-rebuild script.

**Copy only the files you changed, then build on the server.** Do not upload a
locally-built `dist`: a few files under `/opt/aba` legitimately differ from this
repo (the pre-split audit lists dev quick-login and the invoice edit modal as
"repo is newer"), so a wholesale `dist` push ships unrelated changes into
production. Diff the specific files against your pre-change baseline first —
if they match, a surgical copy plus rebuild changes exactly what you intend.

```
# 1. back up the live bundle
ssh ... "cd /opt/aba/client && tar czf /root/aba-dist-backup-$(date +%Y%m%d-%H%M%S).tar.gz dist"
# 2. copy the changed source files, restore ownership
scp ... client/src/<changed files> root@91.229.245.143:/opt/aba/client/src/<dir>/
ssh ... "chown aba:aba /opt/aba/client/src/<dir>/<file>"
# 3. build (writes /opt/aba/client/dist), then hand dist back to aba
ssh ... "cd /opt/aba && npm run build"
ssh ... "chown -R aba:aba /opt/aba/client/dist"
```

A **client-only** change needs **no PM2 restart** — the server serves `dist`
straight off disk, so `aba-app` should still show 0 restarts afterwards. A
`server/` change does need `sudo -u aba bash -lc 'export PM2_HOME=/home/aba/.pm2;
cd /opt/aba && pm2 startOrReload ecosystem.config.js --update-env && pm2 save'`.

Verify by hashing the server's copy of each file against yours, confirming the
new chunk is fetchable and the OLD chunk hash is gone, and checking
`https://app.apluscenterinc.org/aplus` returns 200. Note a stale asset URL still
answers 200 — it hits the SPA fallback and returns `index.html`, so check the
BODY, not the status code. **Rollback:** untar the backup over
`/opt/aba/client/dist`.

## A+ Scheduling Transportation Log — separate billing tracker for ABA clients (2026-10-13)

A dedicated **Transportation Log** page tracks transportation usage as a separate billable item for ABA clients, with weekly summary reporting and QuickBooks integration.

- **Model**: `Transportation` (database table added via migration `20261013153200_transportation_log`)
  - `clientId` — which ABA client
  - `serviceDate` — date transportation was used
  - `description` — optional note (e.g., "round-trip transportation")
  - `amount` — billable amount
  - `paymentStatus` — PENDING | AUTHORIZED | SUCCEEDED | FAILED (shared enum with payments)
  - `paymentDate` — when payment was received
  - `paidBy` — who paid (e.g., "Client", "Insurance", "Clinic")
  - `quickbooksItemId` — QB sync ID
  - `quickbooksSyncStatus` / `quickbooksSyncError` — sync state
  - `createdAt`, `updatedAt` — timestamps

- **Backend Routes** (`server/src/routes/transportation.routes.js`):
  - `GET /api/transportation` — list logs with filters (`clientId`, `from`, `to`, `paymentStatus`)
  - `POST /api/transportation` — create entry
  - `PATCH /api/transportation/:id` — update entry
  - `DELETE /api/transportation/:id` — delete entry
  - `GET /api/transportation/weekly-summary` — summary grouped by client and payment status (current week Mon–Sun)
  - `POST /api/transportation/:id/sync-quickbooks` — manually trigger QB sync

- **Frontend Page** (`client/src/pages/aplus/TransportationLogPage.jsx`):
  - **All Entries view**: filterable table by date, client, payment status, date range
  - **Weekly Summary view**: summary by client with pending vs. paid breakdown
  - **Add/Edit modal**: form to record a transportation entry
  - **Delete**: soft confirmation before removal
  - **Totals**: running total amount and entry count per view

- **Navigation**: accessible from sidebar under "Transportation" (uses invoicing permission `aplus.billing.view_invoices` to control access, same as Payments page)

- **QuickBooks sync**: `syncTransportationToQuickbooks()` in `quickbooksService.js` marks the entry as synced; actual QB line-item creation can be extended when QB account setup specifies the account codes for transportation charges.

- **Audit logging**: all CRUD operations logged via `writeAuditLog()`.
