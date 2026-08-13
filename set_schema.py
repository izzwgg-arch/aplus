from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

env_path = Path("/opt/aba/server/.env")
lines = env_path.read_text(encoding="utf-8").splitlines()
updated = []

for line in lines:
    if line.startswith("DATABASE_URL="):
        raw = line.split("=", 1)[1].strip().strip('"').strip("'")
        parsed = urlparse(raw)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query["schema"] = "aplus_sched"
        rebuilt = urlunparse(
            (parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(query), parsed.fragment)
        )
        line = f'DATABASE_URL="{rebuilt}"'
    updated.append(line)

env_path.write_text("\n".join(updated) + "\n", encoding="utf-8")
print("SCHEMA_SET")
