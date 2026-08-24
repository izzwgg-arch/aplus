"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A 12-hour clock input.
 *
 * `<input type="time">` renders in whatever format the BROWSER locale dictates,
 * so a workstation set to a 24-hour locale showed BCBA notes being written at
 * "14:30". Clinical staff write and read service times as "2:30 PM", so note
 * timing is entered through this control instead: hour + minute dropdowns and
 * an AM/PM toggle.
 *
 * The value passed in and out is still the 24-hour "HH:MM" string the Note
 * model stores — only the presentation is 12-hour. An empty string means "no
 * time entered".
 */

type Props = {
  value:      string;
  onChange:   (value: string) => void;
  ariaLabel?: string;
  /** Minute granularity offered in the dropdown. Off-grid stored values are preserved. */
  minuteStep?: number;
};

type Meridiem = "AM" | "PM";

function parse(value: string): { hour12: number; minute: number; meridiem: Meridiem } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec((value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minute = Number(match[2]);
  if (hours > 23 || minute > 59) return null;
  return {
    hour12:   hours % 12 === 0 ? 12 : hours % 12,
    minute,
    meridiem: hours < 12 ? "AM" : "PM",
  };
}

function toStored(hour12: number, minute: number, meridiem: Meridiem): string {
  const hours24 = meridiem === "AM" ? (hour12 === 12 ? 0 : hour12) : (hour12 === 12 ? 12 : hour12 + 12);
  return `${String(hours24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Which half of the day an hour most likely belongs to when the user picks the
 * hour before touching AM/PM. ABA sessions run late morning through evening,
 * so 8–11 default to AM and everything else to PM — the toggle is right there
 * and always shows what was chosen.
 */
function defaultMeridiem(hour12: number): Meridiem {
  return hour12 >= 8 && hour12 <= 11 ? "AM" : "PM";
}

const SELECT_CLASS =
  "field-input w-full text-sm appearance-none pr-7 text-center";

export function TimeInput12h({ value, onChange, ariaLabel, minuteStep = 5 }: Props) {
  const parsed = parse(value);
  const [hour12,   setHour12]   = useState<number | null>(parsed?.hour12   ?? null);
  const [minute,   setMinute]   = useState<number>(parsed?.minute          ?? 0);
  const [meridiem, setMeridiem] = useState<Meridiem>(parsed?.meridiem      ?? "AM");

  /* Re-sync when the value is replaced from outside (opening another note). */
  useEffect(() => {
    const next = parse(value);
    setHour12(next?.hour12 ?? null);
    setMinute(next?.minute ?? 0);
    if (next) setMeridiem(next.meridiem);
  }, [value]);

  function emit(nextHour: number | null, nextMinute: number, nextMeridiem: Meridiem) {
    setHour12(nextHour);
    setMinute(nextMinute);
    setMeridiem(nextMeridiem);
    onChange(nextHour === null ? "" : toStored(nextHour, nextMinute, nextMeridiem));
  }

  const minuteOptions = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  if (!minuteOptions.includes(minute)) minuteOptions.push(minute);   // keep an off-grid stored minute
  minuteOptions.sort((a, b) => a - b);

  return (
    <div className="flex items-center gap-1.5" aria-label={ariaLabel}>
      {/* Hour */}
      <div className="relative flex-1 min-w-[3.75rem]">
        <select
          aria-label={ariaLabel ? `${ariaLabel} hour` : "Hour"}
          value={hour12 === null ? "" : String(hour12)}
          onChange={(e) => {
            if (e.target.value === "") { emit(null, minute, meridiem); return; }
            const h = Number(e.target.value);
            emit(h, minute, hour12 === null ? defaultMeridiem(h) : meridiem);
          }}
          className={SELECT_CLASS}
        >
          <option value="">--</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
      </div>

      <span className="text-sm font-semibold text-zinc-500">:</span>

      {/* Minute */}
      <div className="relative flex-1 min-w-[3.75rem]">
        <select
          aria-label={ariaLabel ? `${ariaLabel} minutes` : "Minutes"}
          value={String(minute)}
          onChange={(e) => {
            // With no hour picked yet this only parks the minute — the field
            // stays empty until an hour is chosen.
            emit(hour12, Number(e.target.value), meridiem);
          }}
          className={SELECT_CLASS}
        >
          {minuteOptions.map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
      </div>

      {/* AM / PM */}
      <div className="flex rounded-xl border border-[var(--glass-border)] overflow-hidden shrink-0">
        {(["AM", "PM"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => emit(hour12, minute, m)}
            className={`px-2 py-2 text-xs font-semibold transition-colors ${
              meridiem === m
                ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
