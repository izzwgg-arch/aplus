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

- **Which sections get the button** is decided by `goalTableKind()` in
  `smart-steps/src/lib/reportGoalTables.ts`, which delegates to
  `detectSectionType()` — the four kinds whose generated content is a TABLE:
  `mastered_goals`, `current_goals`, `new_goals`, `parent_goals`. Prose
  sections (the per-domain `category_goals` paragraphs, biopsychosocial, …) do
  not get one. Renaming a template section changes both generation and this
  button together, because there is still only the one detector.
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

### A+ Center Scheduling

Still manual: `/opt/aba` is not git-managed. Changes to `client/` or
`server/` do NOT reach production via git pull — coordinate with the user
before touching `/opt/aba`. Never run destructive git commands on
`/var/www/aplus` (frozen rollback state).
