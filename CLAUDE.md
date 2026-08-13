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
