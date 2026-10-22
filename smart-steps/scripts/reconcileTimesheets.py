"""
Reconcile the note/session date mismatches against the clinic's timesheets.

For each mismatch there are exactly two candidate service dates: the one stored
on the note and the one stored on the session. A timesheet line for that
provider and child is independent evidence of which actually happened.

Timesheet layout, verified against November 2025 (one workbook per provider,
child and half-month):
    E3  child name          I3  provider name       I7  BCBA
    D7  month/year
    row 9 down: D date, E time in, F time out, G hours, H service code, I location
Service codes seen: DR direct service, SV supervision, SSG social skills.

Reads nothing but the spreadsheets and the mismatch CSV. Writes a report.
"""
import csv
import datetime
import os
import re
import sys
import warnings

warnings.filterwarnings("ignore")
import openpyxl

# Where the clinic keeps its timesheets. Override with TIMESHEET_ROOT in the
# environment; the default is the path on the clinic's own workstation.
TIMESHEET_ROOT = os.environ.get(
    "TIMESHEET_ROOT", r"D:\ABA Doc\OneDrive\ABA Folder\Timesheets"
)
SCRATCH = os.path.dirname(os.path.abspath(__file__))

# The months the mismatches could fall in, plus their neighbours.
MONTH_DIRS = [
    ("2025", "October"), ("2025", "November"), ("2025", "December"),
    ("2026", "January"), ("2026", "FEB"), ("2026", "MARCH"),
    ("2026", "APRIL"), ("2026", "JUNE"), ("2026", "JULY"),
]


def norm(s):
    """Lowercase letters only, for comparing names across spellings."""
    return re.sub(r"[^a-z]", "", (s or "").lower())


def edit_distance(a, b):
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def names_match(a, b):
    """Mintz / Minz / Mints are one child; two different people are not."""
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    return edit_distance(na, nb) <= 2 and abs(len(na) - len(nb)) <= 2


def as_date(v):
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    return None


def as_clock(v):
    if isinstance(v, datetime.time):
        return v.strftime("%H:%M")
    if isinstance(v, datetime.datetime):
        return v.strftime("%H:%M")
    if isinstance(v, str) and re.match(r"^\d{1,2}:\d{2}", v.strip()):
        return v.strip()[:5]
    return None


def to24(v):
    """'6:15 PM' -> '18:15'. The report CSV renders clock times for people."""
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?\s*$", v or "")
    if not m:
        return None
    h, mi, ap = int(m.group(1)), m.group(2), m.group(3).lower()
    if ap == "p" and h != 12:
        h += 12
    if ap == "a" and h == 12:
        h = 0
    return f"{h:02d}:{mi}"


def read_timesheet(path):
    """Returns (provider, child, [entries]) or None when the file is not a timesheet."""
    try:
        wb = openpyxl.load_workbook(path, data_only=True, read_only=False)
    except Exception as e:
        return None, None, [], f"unreadable: {e}"
    ws = wb[wb.sheetnames[0]]
    child = ws["E3"].value
    provider = ws["I3"].value
    if not child or not provider:
        wb.close()
        return None, None, [], "no child/provider header"
    entries = []
    for r in range(9, (ws.max_row or 9) + 1):
        d = as_date(ws.cell(r, 4).value)
        if d is None:
            continue
        entries.append({
            "date": d,
            "in": as_clock(ws.cell(r, 5).value),
            "out": as_clock(ws.cell(r, 6).value),
            "hours": ws.cell(r, 7).value,
            "service": (ws.cell(r, 8).value or ""),
            "file": os.path.basename(path),
        })
    wb.close()
    return str(provider).strip(), str(child).strip(), entries, None


PDF_ROW = re.compile(
    r"^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})/(\d{1,2})/(\d{4})\s+"
    r"(\d{1,2}:\d{2}\s*[AaPp][Mm])\s+(\d{1,2}:\d{2}\s*[AaPp][Mm])\s+"
    r"([\d.]+)\s+(\S+)",
    re.IGNORECASE,
)


def read_timesheet_pdf(path):
    """From January 2026 the clinic prints timesheets to PDF instead of Excel.

    Names come from the FILENAME, as "<one name>- <other name>.pdf" — the order
    is not consistent (both "Provider- Child" and "Child- Provider" occur), so
    the pair is matched order-insensitively by the caller.

    Some of these PDFs embed a font with a broken character map and extract as
    glyph codes rather than text. Those are reported, never guessed at."""
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            text = "\n".join((pg.extract_text() or "") for pg in pdf.pages)
    except Exception as e:
        return None, [], f"unreadable: {e}"

    if "(cid:" in text or re.search(r"/\d+/\d+/\d+", text):
        return None, [], "font has no usable character map (extracts as glyph codes)"

    entries = []
    for line in text.splitlines():
        m = PDF_ROW.match(line.strip())
        if not m:
            continue
        mo, da, yr, tin, tout, hrs, svc = m.groups()
        try:
            d = datetime.date(int(yr), int(mo), int(da))
        except ValueError:
            continue
        entries.append({
            "date": d,
            "in": to24(tin.upper().replace(" ", "").replace("AM", " AM").replace("PM", " PM").strip()),
            "out": to24(tout.upper().replace(" ", "").replace("AM", " AM").replace("PM", " PM").strip()),
            "hours": float(hrs),
            "service": svc,
            "file": os.path.basename(path),
        })
    if not entries:
        return None, [], "no timesheet rows found"

    base = os.path.splitext(os.path.basename(path))[0]
    parts = [x.strip() for x in base.split("-") if x.strip()]
    return parts[:2], entries, None


def load_all():
    """Walks each month folder recursively. December 2025 keeps its timesheets in
    Week 1..Week 4 subfolders, so a flat listing finds nothing there."""
    sheets = []
    problems = []
    for year, month in MONTH_DIRS:
        root = os.path.join(TIMESHEET_ROOT, year, month)
        if not os.path.isdir(root):
            problems.append(f"missing folder: {year}/{month}")
            continue
        found = 0
        for dirpath, _dirnames, filenames in os.walk(root):
            for fn in sorted(filenames):
                if not fn.lower().endswith((".xlsx", ".xlsm")) or fn.startswith("~$"):
                    continue
                full = os.path.join(dirpath, fn)
                prov, child, entries, err = read_timesheet(full)
                if err:
                    problems.append(f"{os.path.relpath(full, TIMESHEET_ROOT)}: {err}")
                    continue
                found += 1
                sheets.append({
                    "year": year, "month": month, "provider": prov, "child": child,
                    "pair": [prov, child], "entries": entries,
                    "file": os.path.relpath(full, os.path.join(TIMESHEET_ROOT, year)),
                })
        for dirpath, _dirnames, filenames in os.walk(root):
            # Only provider timesheets, never the session-note or ABC-data PDFs
            # that live in the same month folders.
            low = dirpath.lower()
            if any(k in low for k in ("session note", "abc note", "abc notes", "attestation")):
                continue
            for fn in sorted(filenames):
                if not fn.lower().endswith(".pdf"):
                    continue
                full = os.path.join(dirpath, fn)
                pair, entries, err = read_timesheet_pdf(full)
                if err:
                    problems.append(f"{os.path.relpath(full, TIMESHEET_ROOT)}: {err}")
                    continue
                found += 1
                sheets.append({
                    "year": year, "month": month,
                    "pair": pair, "provider": None, "child": None,
                    "entries": entries,
                    "file": os.path.relpath(full, os.path.join(TIMESHEET_ROOT, year)),
                })
        if found == 0:
            problems.append(f"no timesheets of any kind under {year}/{month}")
    return sheets, problems


def sheet_is_for(sh, provider, child):
    """An Excel sheet names provider and child in known cells. A PDF only gives
    a filename pair whose order is inconsistent, so either order counts."""
    if sh.get("provider") and sh.get("child"):
        return names_match(sh["provider"], provider) and names_match(sh["child"], child)
    pair = sh.get("pair") or []
    if len(pair) < 2:
        return False
    a, b = pair[0], pair[1]
    return ((names_match(a, provider) and names_match(b, child)) or
            (names_match(b, provider) and names_match(a, child)))


def lines_for(sheets, provider, child, date):
    hits = []
    for sh in sheets:
        if not sheet_is_for(sh, provider, child):
            continue
        for e in sh["entries"]:
            if e["date"] == date:
                hits.append({**e, "sheetFile": sh["file"],
                             "sheetMonth": sh["year"] + "/" + sh["month"]})
    return hits


def fmt_hours(v):
    """Excel stores these as time arithmetic, so 1 hour arrives as
       0.9999999999999991. Round to a sane precision before showing it."""
    if isinstance(v, (int, float)):
        r = round(float(v), 2)
        return str(int(r)) if r == int(r) else str(r)
    return str(v)


def fmt_lines(hits):
    if not hits:
        return "none"
    return "; ".join(
        f"{h['in'] or '?'}-{h['out'] or '?'} {fmt_hours(h['hours'])}h {str(h['service']).strip()}"
        for h in hits
    )


def main():
    sheets, problems = load_all()
    print(f"timesheets parsed: {len(sheets)}")
    if problems:
        print(f"skipped {len(problems)} files/folders")
        for p in problems[:10]:
            print("   ", p)

    csv_path = os.path.join(SCRATCH, "note-mismatch-report.csv")
    rows = [r for r in csv.DictReader(open(csv_path, encoding="utf-8"))
            if r["section"] == "date_mismatch"]
    print(f"mismatches to reconcile: {len(rows)}\n")

    out = []
    out.append("# Timesheet reconciliation of the note/session date mismatches")
    out.append("")
    out.append("Each mismatch has two candidate service dates: the one on the note and the")
    out.append("one on the session. The timesheet line decides. Read directly from the")
    out.append("clinic's own timesheet workbooks; nothing in the database was changed.")
    out.append("")
    out.append("| Client | Provider | Note date | Timesheet on note date | Session date | Timesheet on session date | Verdict |")
    out.append("| --- | --- | --- | --- | --- | --- | --- |")

    tally = {}
    details = []
    for r in rows:
        client, provider = r["client"], r["provider"]
        nd = datetime.date.fromisoformat(r["note_date"])
        sd = datetime.date.fromisoformat(r["session_date"])
        on_note = lines_for(sheets, provider, client, nd)
        on_sess = lines_for(sheets, provider, client, sd)

        sess_window = (r["session_start"], r["session_end"], r["session_hours"])
        s_in, s_out = to24(r["session_start"]), to24(r["session_end"])

        def exact(hits):
            """A timesheet line whose in AND out are the session's own clock times.
               This is the strongest evidence: several of these children have two
               one-hour slots back to back, so hours alone cannot separate them."""
            return [h for h in hits if h["in"] == s_in and h["out"] == s_out]

        def hours_ok(hits):
            if not sess_window[2]:
                return []
            try:
                want = float(sess_window[2])
            except ValueError:
                return []
            return [h for h in hits
                    if isinstance(h["hours"], (int, float))
                    and abs(float(h["hours"]) - want) < 0.26]

        en, es = exact(on_note), exact(on_sess)
        if en and not es:
            verdict = "NOTE date is right"
            basis = "the session's exact time window appears on the note's date only"
        elif es and not en:
            verdict = "SESSION date is right"
            basis = "the session's exact time window appears on the session's date only"
        elif en and es:
            verdict = "BOTH dates carry that window - needs a human"
            basis = "the same time window is billed on both dates"
        else:
            hn, hs = hours_ok(on_note), hours_ok(on_sess)
            if hs and not hn:
                verdict = "SESSION date is right"
                basis = "no exact window match; hours match the session's date only"
            elif hn and not hs:
                verdict = "NOTE date is right"
                basis = "no exact window match; hours match the note's date only"
            elif on_sess and not on_note:
                verdict = "SESSION date is right"
                basis = "the provider billed that child on the session's date only"
            elif on_note and not on_sess:
                verdict = "NOTE date is right"
                basis = "the provider billed that child on the note's date only"
            elif on_note and on_sess:
                verdict = "BOTH dates worked - needs a human"
                basis = "the provider billed that child on both dates, no window match"
            else:
                verdict = "NO timesheet line on either date"
                basis = "no timesheet found for this provider and child on either date"
        tally[verdict] = tally.get(verdict, 0) + 1

        out.append("| " + " | ".join([
            client, provider,
            r["note_date"], fmt_lines(on_note),
            r["session_date"], fmt_lines(on_sess),
            verdict,
        ]) + " |")

        details.append({
            "client": client, "provider": provider,
            "note_date": r["note_date"], "session_date": r["session_date"],
            "session_window": f"{sess_window[0]} to {sess_window[1]} ({sess_window[2]}h)",
            "trials": r["trials"], "verdict": verdict, "basis": basis,
            "note_id": r["note_id"], "session_id": r["session_id"],
            "on_note": on_note, "on_sess": on_sess,
        })

    out.append("")
    out.append("## Where the evidence runs out")
    out.append("")
    out.append("The clinic kept timesheets as Excel workbooks through December 2025 and")
    out.append("switched to PDF from January 2026. Under the Timesheets folder there are")
    out.append("provider timesheets for October, November and December 2025 and for")
    out.append("January 2026 only. February, April and June 2026 hold ABC data and BCBA")
    out.append("session notes but no provider timesheets, and July 2026 onward holds")
    out.append("nothing. That is why ten rows below report no line on either date.")
    out.append("")
    out.append("One January workbook, for Mashy Mintz with Hilda Rachel Barlev, is a PDF")
    out.append("whose embedded font carries no character map, so it extracts as glyph")
    out.append("codes rather than text. I did not guess at it.")
    out.append("")
    out.append("## Summary")
    out.append("")
    for k, v in sorted(tally.items(), key=lambda kv: -kv[1]):
        out.append(f"- {v} x {k}")

    out.append("")
    out.append("## Case by case")
    out.append("")
    for d in details:
        out.append(f"### {d['client']} with {d['provider']} - {d['verdict']}")
        out.append("")
        out.append(f"Basis: {d['basis']}.")
        out.append("")
        out.append(f"- session as recorded: {d['session_date']}, {d['session_window']}, {d['trials']} trials")
        out.append(f"- note claims: {d['note_date']}")
        for label, hits, when in (("note date", d["on_note"], d["note_date"]),
                                  ("session date", d["on_sess"], d["session_date"])):
            if hits:
                for h in hits:
                    out.append(f"- timesheet on the {label} {when}: {h['in']}-{h['out']}, "
                               f"{fmt_hours(h['hours'])}h, {str(h['service']).strip()}, from {h['sheetFile']}")
            else:
                out.append(f"- timesheet on the {label} {when}: no line")
        out.append(f"- note {d['note_id']}, session {d['session_id']}")
        out.append("")

    report = os.path.join(SCRATCH, "timesheet-reconciliation.md")
    open(report, "w", encoding="utf-8").write("\n".join(out))
    print("\n".join(out[:60]))
    print("\nwrote", report)


if __name__ == "__main__":
    main()
