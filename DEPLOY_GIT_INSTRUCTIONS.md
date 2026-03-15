# Git-Based Deployment Instructions

## Current Status
- Local directory is not a git repository
- Server directory is not a git repository

## Option 1: Set Up Git Repository (Recommended)

### On Local Machine:

```powershell
cd "c:\dev\projects\A Plus center"

# Initialize git (if not already done)
git init
git add .
git commit -m "Timesheet time input replacement - complete refactor"

# Add remote (if you have a git remote)
# git remote add origin <your-git-repo-url>
# git push -u origin main
```

### On Server:

```bash
ssh -i ~/.ssh/id_ed25519_smartsteps -o IdentitiesOnly=yes root@66.94.105.43

cd /var/www/aplus-center

# If this is a fresh setup, clone the repo:
# git clone <your-git-repo-url> .

# Or if git is already set up:
git pull origin main
```

## Option 2: Direct Deployment (No Git Setup)

If you prefer not to set up git, you can deploy directly:

### On Server (SSH in first):

```bash
ssh -i ~/.ssh/id_ed25519_smartsteps -o IdentitiesOnly=yes root@66.94.105.43

cd /var/www/aplus-center

# Manually update files (or use rsync from local)
# Then run:
npm install --production --legacy-peer-deps
npx prisma generate
npm run build
pm2 restart aplus-center
pm2 status
```

## Option 3: One-Line SSH Command (If Git is Set Up)

```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519_smartsteps -o IdentitiesOnly=yes root@66.94.105.43 "cd /var/www/aplus-center && git pull && npm install --production --legacy-peer-deps && npx prisma generate && npm run build && pm2 restart aplus-center && pm2 status"
```

## Files Changed (Need to Deploy)

- `lib/timeParts.ts` (NEW)
- `components/timesheets/TimePartsInput.tsx` (NEW)
- `components/timesheets/TimesheetForm.tsx` (MODIFIED)
- `components/timesheets/TimeInput.tsx` (MODIFIED - deprecated)
- `lib/__tests__/timeParts.test.ts` (NEW)

## Next Steps

1. **If you have a git remote**: Push changes, then pull on server
2. **If no git remote**: Set one up, or use direct file transfer
3. **Run deployment commands** on server

Which approach would you like to use?
