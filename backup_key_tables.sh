#!/usr/bin/env bash
set -euo pipefail

mkdir -p /opt/aba/backups
TS="$(date +%Y%m%d_%H%M%S)"
OUT="/tmp/aplus_sched_clients_services_${TS}.dump"

sudo -u postgres pg_dump -d aba_db -n aplus_sched -t '"Client"' -t '"Service"' -t '"Provider"' -t '"Appointment"' -F c -f "$OUT"

mv "$OUT" /opt/aba/backups/
ls -lat /opt/aba/backups | sed -n '1,4p'
#!/usr/bin/env bash
set -euo pipefail

mkdir -p /opt/aba/backups
TS="$(date +%Y%m%d_%H%M%S)"
OUT="/tmp/aplus_sched_clients_services_${TS}.dump"

sudo -u postgres pg_dump \
  -d aba_db \
  -n aplus_sched \
  -t '"Client"' \
  -t '"Service"' \
  -t '"Provider"' \
  -t '"Appointment"' \
  -F c \
  -f "$OUT"

mv "$OUT" /opt/aba/backups/
ls -lat /opt/aba/backups | sed -n '1,4p'
