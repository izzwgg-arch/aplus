# Community Classes Email DNS Configuration Requirements

## Overview
To remove the generic Gmail avatar icon from Community Classes emails, the sending domain must have proper email authentication DNS records.

## Current Configuration
- **Sender Name:** KJ Play Center
- **Sender Email:** invoices@kjplaycenter.com (or value from `COMMUNITY_EMAIL_FROM_ADDRESS`)

## Required DNS Records

### 1. SPF Record (Sender Policy Framework)
**Purpose:** Authorizes the SMTP server (Gmail SMTP) to send emails for the domain.

**Record Type:** TXT
**Name/Host:** `@` (or domain root)
**Value:** 
```
v=spf1 include:_spf.google.com ~all
```
If using Gmail SMTP: `v=spf1 include:_spf.google.com ~all`
If using other SMTP providers, update accordingly.

**Verification:**
```bash
dig TXT kjplaycenter.com
# Should return: "v=spf1 include:_spf.google.com ~all"
```

### 2. DKIM Record (DomainKeys Identified Mail)
**Purpose:** Cryptographically signs emails to prove authenticity.

**Requirements:**
- DKIM must be configured in Gmail/Google Workspace admin console
- Public key must be published in DNS
- Typically created automatically by Gmail when sending from Google Workspace domain

**For Google Workspace:**
1. Go to Google Admin Console → Apps → Google Workspace → Gmail
2. Enable DKIM signing
3. Copy the DNS TXT record provided (format: `google._domainkey`)
4. Add TXT record to domain DNS

**Record Type:** TXT
**Name/Host:** `google._domainkey` (or provider-specific selector)
**Value:** (Provided by email provider)

**Verification:**
```bash
dig TXT google._domainkey.kjplaycenter.com
```

### 3. DMARC Record (Domain-based Message Authentication)
**Purpose:** Policy framework for email authentication failures.

**Record Type:** TXT
**Name/Host:** `_dmarc`
**Value:**
```
v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@kjplaycenter.com; ruf=mailto:dmarc-forensics@kjplaycenter.com; pct=100
```

**Options:**
- `p=none` - Monitor only (recommended for initial setup)
- `p=quarantine` - Send failed emails to spam
- `p=reject` - Reject failed emails

**Verification:**
```bash
dig TXT _dmarc.kjplaycenter.com
```

## Gmail Avatar Behavior

### When Generic Avatar Appears:
- Sender email uses `@gmail.com` domain
- Domain lacks SPF/DKIM/DMARC records
- Domain authentication fails

### When Avatar Disappears:
- Domain has proper SPF/DKIM/DMARC records
- Email passes authentication checks
- Gmail recognizes authenticated sender

**Note:** Even with proper DNS records, Gmail may show a generic avatar if:
- Domain is very new
- Authentication hasn't propagated (can take 24-48 hours)
- Email provider hasn't properly configured DKIM signing

## Testing Email Authentication

Use these tools to verify DNS records:
- **SPF Checker:** https://mxtoolbox.com/spf.aspx
- **DKIM Checker:** https://mxtoolbox.com/dkim.aspx
- **DMARC Checker:** https://mxtoolbox.com/dmarc.aspx
- **Email Header Analyzer:** https://mxtoolbox.com/emailheaders.aspx

## Code Changes Made

1. **Updated default email address:**
   - Changed from `info@smartstepsabapc.org` (Gmail-based)
   - To `invoices@kjplaycenter.com` (domain-based)

2. **Added logging:**
   - Logs the exact From header used: `[COMMUNITY_EMAIL] Email From header:`

3. **Updated attachment filenames:**
   - Changed from `Community_Invoice_...`
   - To `KJ_Play_Center_Invoice_...`

4. **Environment variable:**
   - `COMMUNITY_EMAIL_FROM_ADDRESS` can be set to override default
   - Example: `COMMUNITY_EMAIL_FROM_ADDRESS=invoices@kjplaycenter.com`

## Next Steps

1. **Configure DNS records** (SPF, DKIM, DMARC) for `kjplaycenter.com`
2. **Set environment variable** on server:
   ```bash
   echo 'COMMUNITY_EMAIL_FROM_ADDRESS=invoices@kjplaycenter.com' >> /var/www/aplus-center/.env
   ```
3. **Verify DNS records** using tools above (wait 24-48 hours for propagation)
4. **Send test email** and check Gmail - generic avatar should disappear once authenticated
5. **Check server logs** for `[COMMUNITY_EMAIL] Email From header:` to verify From address used

## Verification Checklist

- [ ] SPF record added and verified
- [ ] DKIM configured and verified
- [ ] DMARC record added and verified
- [ ] Environment variable set on server
- [ ] Test email sent
- [ ] Gmail shows "KJ Play Center" as sender
- [ ] No generic avatar icon in Gmail
- [ ] Server logs show correct From header
