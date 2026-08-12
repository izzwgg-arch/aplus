import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import { gregorianToHebrewForDisplay, gregorianToHebrewFromYMD } from "../../lib/hebrewDate";
import { getAllHolidays, dateKey } from "../../lib/holidayService";
import AppointmentDetailsModal, { STATUS_CONFIG } from "./AppointmentDetailsDrawer";

/* ─── Layout constants ──────────────────────────────────────────────────────── */
const HOUR_H      = 64;
const START_HOUR  = 7;
const END_HOUR    = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const SLOT_H      = HOUR_H / 4;                              // 16 px = 15 min
const HOURS       = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);
const DAYS_SHORT  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ─── Color system ──────────────────────────────────────────────────────────── */
export const EVENT_COLORS = [
  { id: "purple", light: "#ede9fe", swatch: "#7c3aed", dark: "#5b21b6", label: "Purple" },
  { id: "blue",   light: "#dbeafe", swatch: "#2563eb", dark: "#1d4ed8", label: "Blue"   },
  { id: "teal",   light: "#ccfbf1", swatch: "#0d9488", dark: "#0f766e", label: "Teal"   },
  { id: "green",  light: "#dcfce7", swatch: "#16a34a", dark: "#15803d", label: "Green"  },
  { id: "amber",  light: "#fef3c7", swatch: "#d97706", dark: "#b45309", label: "Amber"  },
  { id: "red",    light: "#fee2e2", swatch: "#dc2626", dark: "#b91c1c", label: "Red"    },
  { id: "pink",   light: "#fce7f3", swatch: "#db2777", dark: "#be185d", label: "Pink"   },
  { id: "slate",  light: "#f1f5f9", swatch: "#475569", dark: "#334155", label: "Slate"  },
];

const CTAG_MAP = {
  purple: "purple", blue: "blue", green: "green", orange: "amber",
  red: "red", teal: "teal", pink: "pink", indigo: "blue", gray: "slate",
};

// getColor supports both named EVENT_COLORS ids and arbitrary hex strings
function apptColor(a, overrides) {
  return overrides?.[a.id] ?? a.colorId ?? CTAG_MAP[a.service?.colorTag ?? "blue"] ?? "blue";
}

// All valid AppointmentStatus enum values in the DB (must match schema.prisma exactly).
const DB_VALID_STATUSES = new Set([
  "SCHEDULED", "PENDING", "CONFIRMED", "COMPLETED",
  "CANCELLED", "RESCHEDULED", "NO_SHOW", "PAID", "RUNNING_LATE", "CUSTOM",
]);

/* ─── Status options ────────────────────────────────────────────────────────── */
// STATUS_CONFIG is imported from AppointmentDetailsDrawer (single source of truth).
// All values here exist in the DB AppointmentStatus enum — every selection can be saved.
const STATUS_OPTS = [
  { value: "",             label: "— Keep current —" },
  { value: "SCHEDULED",   label: "Scheduled"         },
  { value: "PENDING",     label: "Pending"           },
  { value: "CONFIRMED",   label: "Confirmed"         },
  { value: "COMPLETED",   label: "Complete"          },
  { value: "CANCELLED",   label: "Cancelled"         },
  { value: "RESCHEDULED", label: "Rescheduled"       },
  { value: "NO_SHOW",     label: "No-show"           },
  { value: "PAID",        label: "Paid"              },
  { value: "RUNNING_LATE",label: "Running late"      },
  { value: "CUSTOM",      label: "Custom"            },
];

/* ─── Date helpers ──────────────────────────────────────────────────────────── */
function getWeekStart(d) {
  const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}
function pad(n) { return String(n).padStart(2, "0"); }
function toLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fmt12(h, m = 0) { return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`; }
function fmtShortDate(d) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function getMonthDates(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first); start.setDate(1 - start.getDay());
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}
function weekRangeLabel(ws) {
  const we = new Date(ws); we.setDate(we.getDate() + 6);
  if (ws.getMonth() === we.getMonth())
    return `${ws.toLocaleDateString("en-US",{month:"long"})} ${ws.getDate()}–${we.getDate()}, ${we.getFullYear()}`;
  return `${ws.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${we.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`;
}

/* ─── HolidayBadge ──────────────────────────────────────────────────────────── */
function HolidayBadge({ name, type = "heb" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${
      type === "us"
        ? "bg-blue-100 text-blue-700"
        : "bg-amber-100 text-amber-800"
    }`}>
      {name}
    </span>
  );
}

/* ─── Color helpers ──────────────────────────────────────────────────────────── */
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getColor(id) {
  if (!id) return EVENT_COLORS[1];
  if (id.startsWith("#") && id.length >= 7) {
    return { id, light: hexToRgba(id, 0.15), swatch: id, dark: id, label: "Custom" };
  }
  return EVENT_COLORS.find((c) => c.id === id) ?? EVENT_COLORS[1];
}

// Darkens a hex color by a given factor (0–1) — used for left-border accents
function darkenColor(hex, factor = 0.25) {
  if (!hex || !hex.startsWith("#") || hex.length < 7) return hex;
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - Math.round(parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - Math.round(parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - Math.round(parseInt(hex.slice(5, 7), 16) * factor));
  return `rgb(${r},${g},${b})`;
}

/* ─── CurrentTimeLine ───────────────────────────────────────────────────────── */
function CurrentTimeLine() {
  const [top, setTop] = useState(() => {
    const n = new Date();
    return ((n.getHours() - START_HOUR) * 60 + n.getMinutes()) / 60 * HOUR_H;
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setTop(((n.getHours() - START_HOUR) * 60 + n.getMinutes()) / 60 * HOUR_H);
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  if (top < 0 || top > TOTAL_HOURS * HOUR_H) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top }}>
      <div className="h-2.5 w-2.5 flex-none rounded-full bg-rose-500 -ml-1.5 ring-2 ring-white" />
      <div className="h-[2px] flex-1 bg-rose-500" />
    </div>
  );
}

/* ─── AppointmentCard ───────────────────────────────────────────────────────── */
// Single adaptive layout — priority order top-to-bottom so overflow-hidden
// only ever clips LOW-priority items (service, badge), NEVER name or phone:
//   Line 1: client name   (always)
//   Line 2: 📞 phone      (always — positioned 2nd so it's never clipped first)
//   Line 3: time range    (clipped on very small cards)
//   Line 4: service name  (clipped on small cards)
//   Line 5: status badge  (clipped on medium cards)
//
// Colors come from the linked service's calendar color fields (service-first).
// Falls back to the colorId / colorTag system for services not yet configured.
//
// onResizeSave: called once when user finishes a bottom-edge drag.
//   Signature: onResizeSave(appt, newEndsAtISO, newDurMin)
//   Resize state is LOCAL to this component — no parent re-renders during drag.
const AppointmentCard = memo(function AppointmentCard({ appt, onClick, onResizeSave, onMoveDragStart, isDragging }) {
  const start  = new Date(appt.startsAt);
  const end    = new Date(appt.endsAt);
  const startM = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
  const endM   = (end.getHours()   - START_HOUR) * 60 + end.getMinutes();

  // ── Service-first color resolution ───────────────────────────────────────────
  // 1. Use the service's configured calendar colors when available.
  // 2. Fall back to colorId / colorTag system — keeps old appointments working.
  const svc = appt.service;
  let bgColor, borderColor, nameColor, svcColor, timeColor;
  if (svc?.calendarBgColor) {
    bgColor     = svc.calendarBgColor;
    borderColor = darkenColor(svc.calendarBgColor);
    nameColor   = svc.calendarNameColor    || "#1e293b";
    svcColor    = svc.calendarServiceColor || svc.calendarNameColor || "#334155";
    timeColor   = svc.calendarTimeColor    || svc.calendarNameColor || "#475569";
  } else {
    const color = getColor(appt.colorId ?? CTAG_MAP[svc?.colorTag ?? "blue"] ?? "blue");
    bgColor     = color.light;
    borderColor = color.swatch;
    nameColor   = color.dark;
    svcColor    = color.dark;
    timeColor   = color.dark;
  }

  const service     = appt.title || appt.service?.name || appt.serviceNameSnapshot || "Appointment";
  const client      = appt.client?.fullName || appt.clientNameSnapshot || "";
  const clientPhone = appt.client?.phoneCell || appt.client?.phone || "";
  const status      = appt.status;
  const cfg     = status ? STATUS_CONFIG[status] : null;
  const timeStr = fmt12(start.getHours(), start.getMinutes());

  // ── Resize state (local — no parent re-render during drag) ───────────────────
  const [resizeEndM, setResizeEndM] = useState(null); // null = idle; number = dragging
  const dragRef          = useRef(null);  // { startY, origEndM, origStartM }
  const suppressClickRef = useRef(false); // blocks card click after a drag gesture
  const movePendingRef   = useRef(null);  // { startX, startY, offsetY } — pending threshold check

  // Effective dimensions — override during resize
  const effectiveEndM  = resizeEndM ?? endM;
  const effectiveDurM  = Math.max(effectiveEndM - startM, 15);
  const cardH          = Math.max((effectiveDurM / 60) * HOUR_H - 2, 18);

  // Live time range — updates every 15-min snap during drag
  const liveEndHour  = START_HOUR + Math.floor(effectiveEndM / 60);
  const liveEndMin   = effectiveEndM % 60;
  const timeRange    = `${timeStr}–${fmt12(liveEndHour, liveEndMin)}`;

  // ── Shared drag commit (called from both mouse and touch paths) ──────────────
  function commitResize(finalEndM) {
    dragRef.current = null;
    setResizeEndM(null);
    setTimeout(() => { suppressClickRef.current = false; }, 150);

    if (finalEndM === endM || !onResizeSave) return; // no change

    const origStart = new Date(appt.startsAt);
    const newEnd    = new Date(origStart);
    newEnd.setHours(
      START_HOUR + Math.floor(finalEndM / 60),
      finalEndM % 60,
      0, 0,
    );
    onResizeSave(appt, newEnd.toISOString(), finalEndM - startM);
  }

  // ── Snap helper: clamp+round a raw deltaY into valid end-minutes ─────────────
  function snapEndM(deltaY, origEnd, origStart) {
    const slots = Math.round(deltaY / SLOT_H);
    return Math.max(
      origStart + 15,                    // minimum 15-min duration
      Math.min(TOTAL_HOURS * 60, origEnd + slots * 15),  // max = end of visible grid
    );
  }

  // ── Mouse resize ─────────────────────────────────────────────────────────────
  function handleResizeMouseDown(e) {
    e.stopPropagation(); // prevent card click
    e.preventDefault();
    suppressClickRef.current = true;
    dragRef.current = { startY: e.clientY, origEndM: endM, origStartM: startM };
    setResizeEndM(endM);

    function onMove(ev) {
      if (!dragRef.current) return;
      setResizeEndM(snapEndM(ev.clientY - dragRef.current.startY, dragRef.current.origEndM, dragRef.current.origStartM));
    }
    function onUp(ev) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      if (!dragRef.current) return;
      commitResize(snapEndM(ev.clientY - dragRef.current.startY, dragRef.current.origEndM, dragRef.current.origStartM));
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  // ── Touch resize ─────────────────────────────────────────────────────────────
  function handleResizeTouchStart(e) {
    e.stopPropagation();
    const t = e.touches[0];
    suppressClickRef.current = true;
    dragRef.current = { startY: t.clientY, origEndM: endM, origStartM: startM };
    setResizeEndM(endM);

    function onMove(ev) {
      ev.preventDefault();
      if (!dragRef.current) return;
      const pt = ev.touches[0];
      setResizeEndM(snapEndM(pt.clientY - dragRef.current.startY, dragRef.current.origEndM, dragRef.current.origStartM));
    }
    function onEnd(ev) {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend",  onEnd);
      if (!dragRef.current) return;
      const pt = ev.changedTouches[0];
      commitResize(snapEndM(pt.clientY - dragRef.current.startY, dragRef.current.origEndM, dragRef.current.origStartM));
    }
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend",  onEnd);
  }

  // ── Move drag — threshold-based so normal clicks still open the drawer ─────────
  function handleMoveMouseDown(e) {
    if (!onMoveDragStart) return;
    movePendingRef.current = { startX: e.clientX, startY: e.clientY, offsetY: e.nativeEvent.offsetY ?? e.offsetY ?? 0 };
    function onDocMove(ev) {
      if (!movePendingRef.current) return;
      if (Math.hypot(ev.clientX - movePendingRef.current.startX, ev.clientY - movePendingRef.current.startY) > 5) {
        const { offsetY } = movePendingRef.current;
        movePendingRef.current = null;
        suppressClickRef.current = true;
        document.removeEventListener("mousemove", onDocMove);
        document.removeEventListener("mouseup",   onDocUp);
        onMoveDragStart(appt, offsetY);
      }
    }
    function onDocUp() {
      movePendingRef.current = null;
      document.removeEventListener("mousemove", onDocMove);
      document.removeEventListener("mouseup",   onDocUp);
      setTimeout(() => { suppressClickRef.current = false; }, 50);
    }
    document.addEventListener("mousemove", onDocMove);
    document.addEventListener("mouseup",   onDocUp);
  }

  // ── Resize handle element — shows at bottom of SMALL + NORMAL tiers ──────────
  const ResizeHandle = (
    <div
      onMouseDown={handleResizeMouseDown}
      onTouchStart={handleResizeTouchStart}
      title="Drag to resize"
      style={{
        position:   "absolute",
        bottom:     0,
        left:       0,
        right:      0,
        height:     "6px",
        cursor:     "ns-resize",
        zIndex:     30,
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{
        width: "20px", height: "3px", borderRadius: "2px",
        backgroundColor: borderColor, opacity: resizeEndM != null ? 0.8 : 0.35,
        transition: "opacity 0.15s",
      }} />
    </div>
  );

  // ── Shared outer div props ────────────────────────────────────────────────────
  const isResizing = resizeEndM != null;
  const wrapProps = {
    onClick: (e) => {
      e.stopPropagation();
      if (!suppressClickRef.current) onClick(appt);
    },
    onMouseDown: handleMoveMouseDown,
    title: `${client || service}\n${service}\n${timeRange}${cfg ? `\n${cfg.label}` : ""}`,
    style: {
      top:             `${(startM / 60) * HOUR_H + 1}px`,
      height:          `${cardH}px`,
      backgroundColor: bgColor,
      borderLeft:      `3px solid ${borderColor}`,
      transition:      isResizing ? "none" : undefined,
      boxShadow:       isResizing ? `0 4px 16px ${borderColor}44` : undefined,
      opacity:         isDragging ? 0.3 : 1,
      cursor:          isDragging ? "grabbing" : "grab",
    },
    className: "absolute left-0.5 right-0.5 z-10 overflow-hidden rounded-r-md shadow-sm transition-opacity hover:brightness-95 hover:shadow-md",
  };

  // ── ADAPTIVE LAYOUT — phone always visible, extras shown when space allows ──
  //
  // Priority order (highest → lowest):
  //   1. Client name  (always shown)
  //   2. Phone number (always shown — this is the whole point)
  //   3. Time         (shown when cardH >= 26)
  //   4. Service name (shown when cardH >= 38)
  //   5. Status badge (shown when cardH >= 52)
  //
  // For very tiny cards (< 18px) everything is one inline row.

  // ── Universal layout ────────────────────────────────────────────────────────
  // Row 1 is ALWAYS: [name — flex-1 truncate] [📞 phone — shrink-0 never hidden]
  // This guarantees phone visible even on a 14px card because it's inline with
  // the name (which truncates to make room). Subsequent rows stack below and
  // are clipped by overflow-hidden only when the card is too short.
  const isSmall = cardH < 52;
  const fs      = cardH < 28 ? "9px" : isSmall ? "10px" : "11px";
  const nameFs  = cardH < 28 ? "10px" : isSmall ? "11px" : "12px";
  const gap     = cardH < 28 ? 0 : 1;
  const pt      = cardH < 28 ? 1 : 3;

  return (
    <div {...wrapProps}>
      <div
        className="flex flex-col overflow-hidden px-1.5"
        style={{ paddingTop: pt, paddingBottom: pt, gap }}
      >
        {/* ROW 1 — name (truncates) + phone (shrink-0, always visible) */}
        <div className="flex items-center gap-1 overflow-hidden">
          <span
            className="min-w-0 flex-1 truncate font-bold leading-tight"
            style={{ color: nameColor, fontSize: nameFs, lineHeight: 1.2 }}
          >
            {client || service}
          </span>
          {clientPhone && (
            <span
              className="shrink-0 font-semibold leading-tight"
              style={{ color: timeColor, fontSize: fs, lineHeight: 1.2, opacity: 0.9, whiteSpace: "nowrap" }}
            >
              📞 {clientPhone}
            </span>
          )}
        </div>

        {/* ROW 2 — time range (only when card has room) */}
        {cardH > 32 && (
          <p className="truncate leading-tight" style={{ color: timeColor, fontSize: fs, lineHeight: 1.2, opacity: 0.75 }}>
            {timeRange}
          </p>
        )}

        {/* ROW 3 — service name (only when card has room for it) */}
        {cardH > 46 && client && (
          <p className="truncate leading-tight" style={{ color: svcColor, fontSize: fs, lineHeight: 1.2, opacity: 0.8 }}>
            {service}
          </p>
        )}

        {/* ROW 4 — status badge (only on tall cards) */}
        {cardH > 58 && cfg && (
          <span
            className={`inline-block max-w-full truncate rounded px-1 py-px font-bold uppercase tracking-wide leading-tight ${cfg.cls}`}
            style={{ fontSize: "8px", marginTop: 1 }}
          >
            {cfg.label}
          </span>
        )}
      </div>
      {ResizeHandle}
    </div>
  );
});

/* ─── DayColumn ─────────────────────────────────────────────────────────────── */
// FIX: hover state is LOCAL to each column — hovering Tuesday only highlights
//      Tuesday slots, not Monday/Wednesday/etc.
const DayColumn = memo(function DayColumn({
  date, isToday, appts, onSlotClick, onApptClick, onResizeSave, onMoveDragStart, draggingApptId,
}) {
  // ── Local hover state — completely isolated per column ──────────────────────
  const [hovRow, setHovRow] = useState(null);
  const totalH = TOTAL_HOURS * HOUR_H;

  return (
    <div
      className={`relative border-r border-slate-100 last:border-r-0 ${isToday ? "bg-blue-50/20" : ""}`}
      style={{ height: totalH }}
    >
      {/* Hour separator lines */}
      {HOURS.map((h) => (
        <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-slate-100"
             style={{ top: (h - START_HOUR) * HOUR_H }} />
      ))}

      {/* Quarter-hour lines */}
      {Array.from({ length: TOTAL_HOURS * 4 }, (_, i) =>
        i % 4 !== 0 ? (
          <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-slate-50/80"
               style={{ top: i * SLOT_H }} />
        ) : null
      )}

      {/* 15-min clickable slots — each tracks hover independently */}
      {Array.from({ length: TOTAL_HOURS * 4 }, (_, i) => {
        const isHov    = hovRow === i;
        const slotMin  = i * 15;
        const slotH    = START_HOUR + Math.floor(slotMin / 60);
        const slotM    = slotMin % 60;
        return (
          <div
            key={i}
            className={`absolute inset-x-0 cursor-pointer transition-colors duration-75 ${isHov ? "bg-indigo-50/80" : ""}`}
            style={{ top: i * SLOT_H, height: SLOT_H }}
            onMouseEnter={() => setHovRow(i)}
            onMouseLeave={() => setHovRow(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSlotClick(date, slotH, slotM);
            }}
          >
            {/* Time tooltip — appears ONLY in THIS cell, ONLY in THIS column */}
            {isHov && (
              <span className="pointer-events-none absolute left-1 top-0.5 z-30 whitespace-nowrap rounded bg-slate-800 px-1.5 py-px text-[10px] font-semibold text-white shadow">
                {fmt12(slotH, slotM)}
              </span>
            )}
          </div>
        );
      })}

      {/* Current time indicator */}
      {isToday && <CurrentTimeLine />}

      {/* Appointment cards */}
      {appts.map((appt) => (
        <AppointmentCard
          key={appt.id}
          appt={appt}
          onClick={onApptClick}
          onResizeSave={onResizeSave}
          onMoveDragStart={onMoveDragStart}
          isDragging={draggingApptId === appt.id}
        />
      ))}
    </div>
  );
});

/* ─── TimeGrid (Week view + Day view) ───────────────────────────────────────── */
// FIX: removed shared hovRow state — each DayColumn manages its own hover now.
// FIX: removed inner overflow-x-auto that was creating a duplicate scrollbar.
function TimeGrid({ viewDates, appts, onSlotClick, onApptClick, dayHolidays, onResizeSave, onMoveSave }) {
  const bodyRef    = useRef(null);
  const columnsRef = useRef(null);
  const today      = useMemo(() => new Date(), []);
  const isDay      = viewDates.length === 1;

  // ── Move-drag state ───────────────────────────────────────────────────────────
  const [moveState, setMoveState] = useState(null);
  // moveState shape: { appt, colIdx, startM, durM, colW, numCols }
  const moveStateRef = useRef(null); // mirror for stable closure access

  const handleMoveDragStart = useCallback((appt, cardOffsetY) => {
    const colsRect      = columnsRef.current.getBoundingClientRect();
    const numCols       = viewDates.length;
    const colW          = colsRect.width / numCols;
    const durM          = Math.round((new Date(appt.endsAt) - new Date(appt.startsAt)) / 60000);
    const origStart     = new Date(appt.startsAt);
    const origStartM    = (origStart.getHours() - START_HOUR) * 60 + origStart.getMinutes();
    const origColIdx    = Math.max(0, viewDates.findIndex(d => isSameDay(d, origStart)));
    const initScrollTop = bodyRef.current?.scrollTop ?? 0;

    const initial = { appt, colIdx: origColIdx, startM: origStartM, durM, colW, numCols };
    setMoveState(initial);
    moveStateRef.current = initial;

    function computePos(clientX, clientY) {
      const scrollTop  = bodyRef.current?.scrollTop ?? 0;
      const scrollDiff = scrollTop - initScrollTop;
      const rawCol     = Math.floor((clientX - colsRect.left) / colW);
      const clampedCol = Math.max(0, Math.min(numCols - 1, rawCol));
      // Correct content-Y derivation:
      //   colsRect.top was captured when scroll = initScrollTop.
      //   Current viewport-Y of columnsRef = colsRect.top - scrollDiff
      //   Cursor content-Y = clientY - (colsRect.top - scrollDiff) = clientY - colsRect.top + scrollDiff
      //   Card-top content-Y = cursor content-Y - cardOffsetY
      const contentY   = clientY - colsRect.top + scrollDiff - cardOffsetY;
      const rawMinutes = (contentY / HOUR_H) * 60;
      const snapped    = Math.round(rawMinutes / 15) * 15;
      const clamped    = Math.max(0, Math.min(TOTAL_HOURS * 60 - durM, snapped));
      return { colIdx: clampedCol, startM: clamped };
    }

    function onMove(e) {
      const { colIdx, startM } = computePos(e.clientX, e.clientY);
      const next = { ...moveStateRef.current, colIdx, startM };
      setMoveState(next);
      moveStateRef.current = next;
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      const ms = moveStateRef.current;
      setMoveState(null);
      moveStateRef.current = null;
      if (!ms || !onMoveSave) return;
      const targetDate = viewDates[ms.colIdx];
      const newStart   = new Date(targetDate);
      newStart.setHours(START_HOUR + Math.floor(ms.startM / 60), ms.startM % 60, 0, 0);
      const newEnd = new Date(newStart.getTime() + ms.durM * 60000);
      // Only save if the time or day actually changed
      if (newStart.getTime() === new Date(ms.appt.startsAt).getTime()) return;
      onMoveSave(ms.appt, newStart.toISOString(), newEnd.toISOString(), ms.durM);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }, [viewDates, onMoveSave]);

  // Scroll to current time on mount / date change
  useEffect(() => {
    if (!bodyRef.current) return;
    const n = new Date();
    const mins = (n.getHours() - START_HOUR) * 60 + n.getMinutes();
    bodyRef.current.scrollTop = Math.max(0, (mins / 60) * HOUR_H - 120);
  }, [viewDates]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

      {/* Sticky day-header row */}
      <div className="z-10 shrink-0 border-b border-slate-200 bg-white">
        <div className="flex">
          <div className={`shrink-0 border-r border-slate-100 ${isDay ? "w-16" : "w-14"}`} />
          {viewDates.map((date, i) => {
            const isToday = isSameDay(date, today);
            const heb     = gregorianToHebrewForDisplay(date.getFullYear(), date.getMonth() + 1, date.getDate());
            const hols    = dayHolidays?.[dateKey(date)] ?? { all: [], us: [], hebrew: [] };
            return (
              <div key={i}
                className={`flex-1 border-r border-slate-100 last:border-r-0 px-2 py-2 ${isToday ? "bg-blue-50/40" : ""}`}
              >
                <div className="text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${isToday ? "text-indigo-500" : "text-slate-400"}`}>
                    {DAYS_SHORT[date.getDay()]}
                  </p>
                  <p className={`mt-0.5 text-2xl font-bold leading-none ${isToday ? "text-indigo-600" : "text-slate-800"}`}>
                    {date.getDate()}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium text-slate-400" dir="rtl" lang="he">
                    {heb.short}
                  </p>
                </div>
                {hols.all.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 justify-center">
                    {hols.us.map((h, j)     => <HolidayBadge key={`u${j}`} name={h} type="us"  />)}
                    {hols.hebrew.map((h, j) => <HolidayBadge key={`h${j}`} name={h} type="heb" />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable body — FIX: single overflow-y-auto; NO nested overflow-x-auto */}
      <div ref={bodyRef} className="flex min-h-0 flex-1 overflow-y-auto">

        {/* Time rail — hour labels only, no global hover tooltip */}
        <div className={`relative shrink-0 border-r border-slate-100 bg-white ${isDay ? "w-16" : "w-14"}`}>
          {HOURS.map((h) => (
            <div key={h} className="absolute right-2 text-[10px] font-medium text-slate-400"
                 style={{ top: (h - START_HOUR) * HOUR_H - 7 }}>
              {fmt12(h)}
            </div>
          ))}
          <div style={{ height: TOTAL_HOURS * HOUR_H }} />
        </div>

        {/* Day columns — flex container, position:relative needed for ghost overlay */}
        <div ref={columnsRef} className="relative flex flex-1">
          {viewDates.map((date, i) => (
            <div key={i} className="min-w-[80px] flex-1">
              <DayColumn
                date={date}
                isToday={isSameDay(date, today)}
                appts={appts.filter((a) => isSameDay(new Date(a.startsAt), date))}
                onSlotClick={onSlotClick}
                onApptClick={onApptClick}
                onResizeSave={onResizeSave}
                onMoveDragStart={handleMoveDragStart}
                draggingApptId={moveState?.appt?.id ?? null}
              />
            </div>
          ))}

          {/* ── Ghost card during drag-to-move ─────────────────────────────── */}
          {moveState && (() => {
            const { appt: ma, colIdx, startM: ms, durM, colW, numCols } = moveState;
            const ghostH   = Math.max(18, (durM / 60) * HOUR_H - 2);
            const ghostTop = (ms / 60) * HOUR_H + 1;
            const ghostLeft = colIdx * colW + 2;
            const ghostW    = colW - 6;
            const endM      = ms + durM;
            const svc = ma.service;
            let ghostBg, ghostBorder, ghostName, ghostSvc, ghostTime;
            if (svc?.calendarBgColor) {
              ghostBg     = svc.calendarBgColor;
              ghostBorder = darkenColor(svc.calendarBgColor);
              ghostName   = svc.calendarNameColor || "#1e293b";
              ghostSvc    = svc.calendarServiceColor || ghostName;
              ghostTime   = svc.calendarTimeColor || ghostName;
            } else {
              const c = getColor(apptColor(ma));
              ghostBg     = c.light;
              ghostBorder = c.swatch;
              ghostName   = c.dark;
              ghostSvc    = c.dark;
              ghostTime   = c.dark;
            }
            const cName  = ma.client?.fullName || ma.clientNameSnapshot || "";
            const sName  = ma.title || ma.service?.name || "Appointment";
            const tStart = fmt12(START_HOUR + Math.floor(ms / 60),   ms % 60);
            const tEnd   = fmt12(START_HOUR + Math.floor(endM / 60), endM % 60);
            return (
              <div
                key="ghost"
                style={{
                  position:        "absolute",
                  top:             `${ghostTop}px`,
                  left:            `${ghostLeft}px`,
                  width:           `${ghostW}px`,
                  height:          `${ghostH}px`,
                  backgroundColor: ghostBg,
                  borderLeft:      `3px solid ${ghostBorder}`,
                  borderRadius:    "0 6px 6px 0",
                  opacity:         0.9,
                  zIndex:          60,
                  pointerEvents:   "none",
                  boxShadow:       `0 8px 28px ${ghostBorder}55`,
                  transition:      "none",
                  outline:         `2px dashed ${ghostBorder}`,
                  outlineOffset:   "1px",
                }}
              >
                <div className="px-2 py-1 space-y-px overflow-hidden">
                  <p className="truncate text-[12px] font-bold leading-tight" style={{ color: ghostName }}>
                    {cName || sName}
                  </p>
                  {cName && (
                    <p className="truncate text-[10px] font-bold leading-tight" style={{ color: ghostSvc, opacity: 0.85 }}>
                      {sName}
                    </p>
                  )}
                  <p className="truncate text-[10px] font-bold leading-tight" style={{ color: ghostTime, opacity: 0.75 }}>
                    {tStart}–{tEnd}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/* ─── MonthGrid ─────────────────────────────────────────────────────────────── */
function MonthGrid({ viewDate, appts, onDayClick, onApptClick, dayHolidays }) {
  const today      = useMemo(() => new Date(), []);
  const monthDates = useMemo(() =>
    getMonthDates(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Day-of-week header */}
      <div className="grid shrink-0 grid-cols-7 border-b border-slate-200 bg-slate-50">
        {DAYS_SHORT.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{d}</div>
        ))}
      </div>

      {/* Month cells */}
      <div className="grid flex-1 grid-cols-7 overflow-y-auto">
        {monthDates.map((date, i) => {
          const inMonth  = date.getMonth() === viewDate.getMonth();
          const isToday  = isSameDay(date, today);
          const heb      = gregorianToHebrewFromYMD(date.getFullYear(), date.getMonth() + 1, date.getDate());
          const hols     = dayHolidays?.[dateKey(date)] ?? { all: [], us: [], hebrew: [] };
          const dayAppts = appts.filter((a) => isSameDay(new Date(a.startsAt), date));

          return (
            <div
              key={i}
              onClick={() => onDayClick(date)}
              className={`min-h-[100px] cursor-pointer border-r border-b border-slate-100 p-1.5 transition-colors last:border-r-0 hover:bg-slate-50 ${
                !inMonth ? "bg-slate-50/60" : isToday ? "bg-blue-50/30" : ""
              }`}
            >
              {/* Day number + Hebrew */}
              <div className="mb-1 flex items-start justify-between">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                  isToday
                    ? "bg-indigo-600 text-white"
                    : inMonth ? "text-slate-800" : "text-slate-400"
                }`}>
                  {date.getDate()}
                </span>
                <span className="text-[9px] text-slate-400" dir="rtl" lang="he">
                  {heb.numeral}
                </span>
              </div>

              {/* Holiday labels */}
              {hols.us.map((h, j) => (
                <div key={`u${j}`} className="mb-0.5 truncate rounded-sm bg-blue-100 px-1 py-px text-[9px] font-semibold text-blue-700">
                  {h}
                </div>
              ))}
              {hols.hebrew.map((h, j) => (
                <div key={`h${j}`} className="mb-0.5 truncate rounded-sm bg-amber-100 px-1 py-px text-[9px] font-semibold text-amber-800">
                  ✦ {h}
                </div>
              ))}

              {/* Appointments */}
              {dayAppts.slice(0, 3).map((a) => {
                const cfg   = a.status ? STATUS_CONFIG[a.status] : null;
                const label = a.client?.fullName || a.clientNameSnapshot || a.title || a.service?.name || "Appt";
                // Service-first color for month pills
                const asvc = a.service;
                let pillBg, pillText, pillDot;
                if (asvc?.calendarBgColor) {
                  pillBg  = asvc.calendarBgColor;
                  pillText = asvc.calendarNameColor || "#1e293b";
                  pillDot  = darkenColor(asvc.calendarBgColor);
                } else {
                  const c = getColor(apptColor(a));
                  pillBg  = c.light;
                  pillText = c.dark;
                  pillDot  = c.swatch;
                }
                return (
                  <div
                    key={a.id}
                    onClick={(e) => { e.stopPropagation(); onApptClick(a); }}
                    title={cfg ? `${label} · ${cfg.label}` : label}
                    className="mb-0.5 cursor-pointer rounded px-1 py-px text-[10px] font-bold transition-opacity hover:opacity-80"
                    style={{ backgroundColor: pillBg, color: pillText }}
                  >
                    <div className="flex items-center gap-1 overflow-hidden">
                      {cfg && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: pillDot }}
                          title={cfg.label}
                        />
                      )}
                      <span className="truncate">{label}</span>
                    </div>
                  </div>
                );
              })}
              {dayAppts.length > 3 && (
                <p className="text-[9px] text-slate-500">+{dayAppts.length - 3} more</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── AppointmentModal ──────────────────────────────────────────────────────── */
const EMPTY_FORM = {
  title: "", clientId: "", serviceId: "", providerId: "",
  startsAt: "", endsAt: "", notes: "", billingNotes: "",
  location: "", status: "",
  isOvertime: false, removeOvertimeCharge: false,
  recurrenceType: "NONE", recurrenceCount: 4, reminderEnabled: true,
  remindersUseDefaults: true,
  remindClientOverride: true,
  remindProviderOverride: false,
  reminderEmailEnabledOverride: true,
  reminderSmsEnabledOverride: false,
  reminderOffsetsOverrideJson: "",
};

const EMPTY_NEW_CLIENT = {
  firstName: "",
  lastName: "",
  phone: "",
  phoneCell: "",
  email: "",
  zip: ""
};

function AppointmentModal({ modal, onClose, onSaved, onDeleted, clients, services, providers, toast, onClientCreated }) {
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [tab,     setTab]     = useState("service");
  const [saving,  setSaving]  = useState(false);
  const [deleting,setDeleting]= useState(false);
  const [preview, setPreview] = useState(null);
  const [prevLoad,setPrevLoad]= useState(false);
  const [reminderJobs, setReminderJobs] = useState([]);
  const [sendingRem, setSendingRem] = useState(false);
  const [clientMode, setClientMode] = useState("existing");
  const [newClient, setNewClient] = useState(EMPTY_NEW_CLIENT);
  const titleRef = useRef(null);

  const isEdit = modal?.mode === "edit";

  // Populate form
  useEffect(() => {
    if (!modal) return;
    if (isEdit && modal.appt) {
      setClientMode("existing");
      setNewClient(EMPTY_NEW_CLIENT);
      const a = modal.appt;
      setForm({
        title: a.title ?? "", clientId: a.client?.id ?? a.clientId ?? "",
        serviceId: a.service?.id ?? a.serviceId ?? "",
        providerId: a.provider?.id ?? a.providerId ?? "",
        startsAt: toLocal(new Date(a.startsAt)), endsAt: toLocal(new Date(a.endsAt)),
        notes: a.notes ?? "", billingNotes: a.billingNotes ?? "",
        location: a.location ?? "", status: a.status ?? "",
        isOvertime: a.isOvertime ?? false,
        removeOvertimeCharge: a.removeOvertimeCharge ?? false,
        recurrenceType: a.recurrenceType ?? "NONE",
        recurrenceCount: a.recurrenceCount ?? 4,
        reminderEnabled: a.reminderEnabled ?? true,
        remindersUseDefaults: a.remindersUseDefaults !== false,
        remindClientOverride: a.remindClientOverride ?? true,
        remindProviderOverride: a.remindProviderOverride ?? false,
        reminderEmailEnabledOverride: a.reminderEmailEnabledOverride ?? true,
        reminderSmsEnabledOverride: a.reminderSmsEnabledOverride ?? false,
        reminderOffsetsOverrideJson: a.reminderOffsetsOverrideJson || "",
      });
    } else {
      const s = modal?.start ? new Date(modal.start) : new Date();
      const e = modal?.end   ? new Date(modal.end)   : new Date(s.getTime() + 3_600_000);
      setForm({ ...EMPTY_FORM, startsAt: toLocal(s), endsAt: toLocal(e) });
      setClientMode("existing");
      setNewClient(EMPTY_NEW_CLIENT);
    }
    setPreview(null);
    setTimeout(() => titleRef.current?.focus(), 60);
  }, [modal]);

  useEffect(() => {
    if (!isEdit || !modal?.appt?.id) {
      setReminderJobs([]);
      return;
    }
    api.get(`/reminders/appointments/${modal.appt.id}/jobs`)
      .then((r) => setReminderJobs(r.data || []))
      .catch(() => setReminderJobs([]));
  }, [modal, isEdit]);

  const durMin = useMemo(() => {
    if (!form.startsAt || !form.endsAt) return 60;
    const d = Math.round((new Date(form.endsAt) - new Date(form.startsAt)) / 60_000);
    return d > 0 ? d : 60;
  }, [form.startsAt, form.endsAt]);

  // Pricing preview
  useEffect(() => {
    if (!form.serviceId || !form.providerId) { setPreview(null); return; }
    let alive = true; setPrevLoad(true);
    api.post("/appointments/preview-pricing", {
      serviceId: form.serviceId, providerId: form.providerId,
      durationMinutes: durMin, isOvertime: form.isOvertime,
      removeOvertimeCharge: form.removeOvertimeCharge,
    })
      .then((r) => { if (alive) setPreview(r.data); })
      .catch(() => { if (alive) setPreview(null); })
      .finally(() => { if (alive) setPrevLoad(false); });
    return () => { alive = false; };
  }, [form.serviceId, form.providerId, form.isOvertime, form.removeOvertimeCharge, durMin]);

  // Escape key
  useEffect(() => {
    if (!modal) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [modal, onClose]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave(e) {
    e.preventDefault();
    if (!isEdit && clientMode === "existing" && !form.clientId) {
      toast?.error("Select a client.");
      return;
    }
    if (!isEdit && clientMode === "new") {
      const fn = newClient.firstName.trim();
      const ln = newClient.lastName.trim();
      if (!fn || !ln) {
        toast?.error("New client: first and last name are required.");
        return;
      }
      if (!newClient.phone.trim()) {
        toast?.error("New client: phone is required.");
        return;
      }
      if (!newClient.email.trim()) {
        toast?.error("New client: email is required.");
        return;
      }
      if (!newClient.zip.trim()) {
        toast?.error("New client: ZIP code is required.");
        return;
      }
    }
    if (!form.serviceId)  { toast?.error("Select a service.");  return; }
    if (!form.startsAt)   { toast?.error("Set a start time.");  return; }
    if (!form.endsAt)     { toast?.error("Set an end time.");   return; }
    if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      toast?.error("End time must be after start time."); return;
    }
    setSaving(true);
    let effectiveClientId = form.clientId;
    let justCreatedClient = null;
    try {
      if (!isEdit && clientMode === "new") {
        const fullName = `${newClient.lastName.trim()} ${newClient.firstName.trim()}`.trim();
        const { data: created } = await api.post("/clients", {
          firstName: newClient.firstName.trim(),
          lastName: newClient.lastName.trim(),
          fullName,
          phone: newClient.phone.trim(),
          phoneCell: newClient.phoneCell.trim() || null,
          email: newClient.email.trim(),
          zip: newClient.zip.trim(),
          address: "",
          notes: ""
        });
        justCreatedClient = created;
        effectiveClientId = created.id;
        onClientCreated?.(created);
      }

      // CRITICAL: datetime-local inputs yield strings like "2026-03-15T17:30" with
      // NO timezone info.  If sent as-is, the server (CET/UTC+1) parses them as
      // local server time, storing the wrong UTC value.  The browser then reads it
      // back 5 hours earlier than intended — the exact "5:30 PM → 12:30 PM" shift.
      // Fix: always convert to a proper UTC ISO string before sending to the API.
      const startsAtISO = new Date(form.startsAt).toISOString();
      const endsAtISO   = new Date(form.endsAt).toISOString();

      const payload = {
        ...form,
        clientId: effectiveClientId,
        startsAt:        startsAtISO,
        endsAt:          endsAtISO,
        durationMinutes: durMin,
        recurrenceCount: Number(form.recurrenceCount),
        // Guard: only send status if it's a valid DB enum value; otherwise omit it
        // so the server falls back to the current status (avoids Prisma validation error).
        status: DB_VALID_STATUSES.has(form.status) ? form.status : undefined,
        remindersUseDefaults: form.remindersUseDefaults !== false,
        remindClientOverride: form.remindersUseDefaults === false ? form.remindClientOverride : undefined,
        remindProviderOverride: form.remindersUseDefaults === false ? form.remindProviderOverride : undefined,
        reminderEmailEnabledOverride: form.remindersUseDefaults === false ? form.reminderEmailEnabledOverride : undefined,
        reminderSmsEnabledOverride: form.remindersUseDefaults === false ? form.reminderSmsEnabledOverride : undefined,
        reminderOffsetsOverrideJson:
          form.remindersUseDefaults === false && form.reminderOffsetsOverrideJson?.trim()
            ? form.reminderOffsetsOverrideJson.trim()
            : undefined,
      };

      let savedId = isEdit ? modal.appt.id : null;
      if (isEdit) {
        await api.put(`/appointments/${modal.appt.id}`, payload);
        toast?.success("Updated.");
      } else {
        const res = await api.post("/appointments", payload);
        // Server returns an ARRAY (supports recurrence) — take the first element's real ID
        const firstAppt = Array.isArray(res.data) ? res.data[0] : res.data;
        savedId = firstAppt?.id ?? `opt-${Date.now()}`;
        toast?.success("Created.");
      }

      // Build optimistic shape so the calendar re-renders immediately.
      // Use the same ISO strings we sent to the server so times are always in sync.
      const selClient =
        clients.find((c) => c.id === effectiveClientId) ??
        (justCreatedClient
          ? {
              id: justCreatedClient.id,
              fullName: justCreatedClient.fullName,
              firstName: justCreatedClient.firstName,
              lastName: justCreatedClient.lastName
            }
          : null);
      const selService  = services.find((s) => s.id === form.serviceId) ?? null;
      const selProvider = providers.find((p) => p.id === form.providerId) ?? null;
      const optimistic  = {
        id:               savedId,
        title:            form.title || selService?.name || "Appointment",
        startsAt:         startsAtISO,
        endsAt:           endsAtISO,
        durationMinutes:  durMin,
        status:           DB_VALID_STATUSES.has(form.status) ? form.status : (isEdit ? modal.appt.status : "SCHEDULED"),
        notes:            form.notes,
        location:         form.location,
        client:           selClient,
        service:          selService,
        provider:         selProvider,
      };

      onSaved(optimistic);
      onClose();
    } catch (err) {
      toast?.error(err?.response?.data?.error ?? "Could not save.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this appointment?")) return;
    setDeleting(true);
    try {
      await api.delete(`/appointments/${modal.appt.id}`);
      toast?.success("Deleted."); onDeleted(modal.appt.id); onClose();
    } catch { toast?.error("Could not delete."); }
    finally  { setDeleting(false); }
  }

  if (!modal) return null;

  const selSvc     = services.find((s) => s.id === form.serviceId);
  // Derive accent color from the selected service's calendar config (or default indigo)
  const modalAccent = selSvc?.calendarBgColor || "#2563eb";
  const modalLight  = selSvc?.calendarBgColor
    ? `${selSvc.calendarBgColor}22`
    : "#dbeafe";
  const modalText   = selSvc?.calendarNameColor || (selSvc?.calendarBgColor ? "#1e293b" : "#1d4ed8");
  const startDate  = form.startsAt ? new Date(form.startsAt) : null;
  const endDate    = form.endsAt   ? new Date(form.endsAt)   : null;
  const modalHols  = startDate ? getAllHolidays(startDate) : null;
  const hebDate    = startDate ? gregorianToHebrewForDisplay(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate()) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-10">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Color strip */}
        <div className="h-1.5 w-full rounded-t-2xl transition-colors duration-200"
             style={{ backgroundColor: modalAccent }} />

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isEdit ? "Edit Appointment" : "New Appointment"}
            </h2>
            {startDate && (
              <div className="mt-0.5 space-y-0.5">
                <p className="text-xs text-slate-500">
                  {startDate.toLocaleDateString("en-US",{ weekday:"long", month:"long", day:"numeric", year:"numeric" })}
                  {" · "}{fmt12(startDate.getHours(), startDate.getMinutes())}
                  {endDate && ` – ${fmt12(endDate.getHours(), endDate.getMinutes())}`}
                </p>
                {/* Hebrew date in modal */}
                {hebDate && (
                  <p className="text-xs font-medium text-slate-500" dir="rtl" lang="he">
                    {hebDate.short}
                  </p>
                )}
                {/* Holiday info in modal */}
                {modalHols?.all.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {modalHols.us.map((h, i)     => <HolidayBadge key={`u${i}`} name={h} type="us"  />)}
                    {modalHols.hebrew.map((h, i)  => <HolidayBadge key={`h${i}`} name={h} type="heb" />)}
                  </div>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose}
            className="ml-4 flex h-7 w-7 flex-none items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6">
          {[{ key:"service",label:"Service" },{ key:"event",label:"Event" },{ key:"reminders",label:"Reminders" }].map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`mr-6 border-b-2 pb-2 text-sm font-medium transition-colors ${
                tab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Service preview banner */}
        {selSvc && (
          <div className="mx-6 mt-4 flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200"
               style={{ backgroundColor: modalLight, color: modalText, border: `1px solid ${modalAccent}22` }}>
            <span className="h-3 w-3 flex-none rounded-full" style={{ backgroundColor: modalAccent }} />
            {selSvc.name}
            {preview && !prevLoad && (
              <span className="ml-auto text-xs font-normal opacity-70">
                {durMin} min · ${preview.estimatedCharge?.toFixed(2) ?? "—"}
              </span>
            )}
            {prevLoad && <span className="ml-auto text-xs opacity-50">Calculating…</span>}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="max-h-[58vh] overflow-y-auto px-6 py-4">
          {tab === "service" && (
            <div className="space-y-3">
              <FieldLabel label="Service *">
                <select className="saas-input w-full" value={form.serviceId}
                  onChange={(e) => set("serviceId", e.target.value)}>
                  <option value="">Select a service…</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.defaultDuration ? ` · ${s.defaultDuration} mins` : ""}{s.standardRate ? ` · $${Number(s.standardRate).toFixed(0)}` : ""}
                    </option>
                  ))}
                </select>
              </FieldLabel>

              {!isEdit && (
                <div className="flex flex-wrap gap-4 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-sm">
                  <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                    <input
                      type="radio"
                      name="appt-client-mode"
                      className="rounded-full border-slate-300 text-indigo-600"
                      checked={clientMode === "existing"}
                      onChange={() => setClientMode("existing")}
                    />
                    Existing client
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                    <input
                      type="radio"
                      name="appt-client-mode"
                      className="rounded-full border-slate-300 text-indigo-600"
                      checked={clientMode === "new"}
                      onChange={() => setClientMode("new")}
                    />
                    New client
                  </label>
                </div>
              )}

              {(isEdit || clientMode === "existing") && (
                <div className="grid grid-cols-2 gap-3">
                  <FieldLabel label="Client *">
                    <select className="saas-input w-full" value={form.clientId} onChange={(e) => set("clientId", e.target.value)}>
                      <option value="">Select…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.fullName}</option>
                      ))}
                    </select>
                  </FieldLabel>
                  <FieldLabel label="Provider">
                    <select className="saas-input w-full" value={form.providerId} onChange={(e) => set("providerId", e.target.value)}>
                      <option value="">No provider</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.fullName}</option>
                      ))}
                    </select>
                  </FieldLabel>
                </div>
              )}

              {!isEdit && clientMode === "new" && (
                <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                  <p className="text-xs font-semibold text-indigo-900">Create client</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldLabel label="First name *">
                      <input
                        className="saas-input w-full"
                        value={newClient.firstName}
                        onChange={(e) => setNewClient((n) => ({ ...n, firstName: e.target.value }))}
                        autoComplete="given-name"
                      />
                    </FieldLabel>
                    <FieldLabel label="Last name *">
                      <input
                        className="saas-input w-full"
                        value={newClient.lastName}
                        onChange={(e) => setNewClient((n) => ({ ...n, lastName: e.target.value }))}
                        autoComplete="family-name"
                      />
                    </FieldLabel>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldLabel label="Phone *">
                      <input
                        className="saas-input w-full"
                        value={newClient.phone}
                        onChange={(e) => setNewClient((n) => ({ ...n, phone: e.target.value }))}
                        autoComplete="tel"
                      />
                    </FieldLabel>
                    <FieldLabel label="Email *">
                      <input
                        className="saas-input w-full"
                        type="email"
                        value={newClient.email}
                        onChange={(e) => setNewClient((n) => ({ ...n, email: e.target.value }))}
                        autoComplete="email"
                      />
                    </FieldLabel>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldLabel label="ZIP *">
                      <input
                        className="saas-input w-full"
                        value={newClient.zip}
                        onChange={(e) => setNewClient((n) => ({ ...n, zip: e.target.value }))}
                        autoComplete="postal-code"
                      />
                    </FieldLabel>
                    <FieldLabel label="Cell (optional)">
                      <input
                        className="saas-input w-full"
                        value={newClient.phoneCell}
                        onChange={(e) => setNewClient((n) => ({ ...n, phoneCell: e.target.value }))}
                        autoComplete="tel"
                      />
                    </FieldLabel>
                  </div>
                  <FieldLabel label="Provider">
                    <select className="saas-input w-full" value={form.providerId} onChange={(e) => set("providerId", e.target.value)}>
                      <option value="">No provider</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.fullName}</option>
                      ))}
                    </select>
                  </FieldLabel>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <FieldLabel label="Start *">
                  <input className="saas-input w-full" type="datetime-local" value={form.startsAt}
                    onChange={(e) => set("startsAt", e.target.value)} />
                </FieldLabel>
                <FieldLabel label="End *">
                  <input className="saas-input w-full" type="datetime-local" value={form.endsAt}
                    onChange={(e) => set("endsAt", e.target.value)} />
                </FieldLabel>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FieldLabel label="Status">
                  <select className="saas-input w-full" value={form.status} onChange={(e) => set("status", e.target.value)}>
                    {STATUS_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </FieldLabel>
                <FieldLabel label="Recurrence">
                  <select className="saas-input w-full" value={form.recurrenceType} onChange={(e) => set("recurrenceType", e.target.value)}>
                    <option value="NONE">Does not repeat</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </FieldLabel>
              </div>

              {form.recurrenceType !== "NONE" && (
                <FieldLabel label="Repeat count">
                  <input className="saas-input w-28" type="number" min="1" value={form.recurrenceCount}
                    onChange={(e) => set("recurrenceCount", e.target.value)} />
                </FieldLabel>
              )}

              <FieldLabel label="Location">
                <input className="saas-input w-full" placeholder="Add location or video link"
                  value={form.location} onChange={(e) => set("location", e.target.value)} />
              </FieldLabel>

              <FieldLabel label="Notes to provider and client">
                <textarea className="saas-textarea w-full min-h-[68px]" value={form.notes}
                  onChange={(e) => set("notes", e.target.value)} />
              </FieldLabel>

              <div className="flex flex-wrap gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                {[
                  ["isOvertime", "Overtime"],
                  ["removeOvertimeCharge", "Remove overtime charge"],
                  ["reminderEnabled", "Send reminder"],
                ].map(([field, lbl]) => (
                  <label key={field} className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" className="rounded" checked={form[field]}
                      onChange={(e) => set(field, e.target.checked)} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === "reminders" && (
            <div className="space-y-4 text-sm">
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" className="rounded" checked={form.reminderEnabled}
                  onChange={(e) => set("reminderEnabled", e.target.checked)} />
                Reminders enabled for this appointment
              </label>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" className="rounded" checked={form.remindersUseDefaults !== false}
                  onChange={(e) => set("remindersUseDefaults", e.target.checked)} />
                Use system default reminder rules
              </label>
              {form.remindersUseDefaults === false && (
                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Overrides</p>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={form.remindClientOverride} onChange={(e) => set("remindClientOverride", e.target.checked)} />
                      Remind client
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={form.remindProviderOverride} onChange={(e) => set("remindProviderOverride", e.target.checked)} />
                      Remind provider
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={form.reminderEmailEnabledOverride} onChange={(e) => set("reminderEmailEnabledOverride", e.target.checked)} />
                      Email channel
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={form.reminderSmsEnabledOverride} onChange={(e) => set("reminderSmsEnabledOverride", e.target.checked)} />
                      SMS channel
                    </label>
                  </div>
                  <FieldLabel label="Custom offsets JSON (optional)">
                    <textarea className="saas-textarea w-full min-h-[72px] font-mono text-xs" value={form.reminderOffsetsOverrideJson}
                      onChange={(e) => set("reminderOffsetsOverrideJson", e.target.value)} placeholder='[{"value":2,"unit":"HOURS"}]' />
                  </FieldLabel>
                </div>
              )}
              {isEdit && (
                <div className="rounded-xl border border-slate-100 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Scheduled / sent jobs</p>
                  {reminderJobs.length === 0 ? (
                    <p className="text-xs text-slate-400">No jobs yet. Save the appointment or run reconcile from Settings → Reminders.</p>
                  ) : (
                    <ul className="max-h-40 overflow-auto space-y-1 text-xs text-slate-600">
                      {reminderJobs.map((j) => (
                        <li key={j.id}>{j.channel} · {j.targetType} · {j.status} · {new Date(j.scheduledFor).toLocaleString()}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="btn-secondary mt-3 text-xs"
                    disabled={sendingRem}
                    onClick={async () => {
                      setSendingRem(true);
                      try {
                        await api.post(`/reminders/appointments/${modal.appt.id}/send-now`, {});
                        toast?.success("Reminder send queued.");
                        const r = await api.get(`/reminders/appointments/${modal.appt.id}/jobs`);
                        setReminderJobs(r.data || []);
                      } catch (err) {
                        toast?.error(err?.response?.data?.error || "Could not send.");
                      } finally {
                        setSendingRem(false);
                      }
                    }}
                  >
                    {sendingRem ? "Sending…" : "Send reminders now (client + provider)"}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "event" && (
            <div className="space-y-4">
              <FieldLabel label="Event name">
                <input ref={titleRef} className="saas-input w-full" placeholder="Event name"
                  value={form.title} onChange={(e) => set("title", e.target.value)} />
              </FieldLabel>

              {selSvc?.calendarBgColor && (
                <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: selSvc.calendarBgColor }} />
                  Card colors are configured on the <strong className="text-slate-700">{selSvc.name}</strong> service.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <FieldLabel label="Start">
                  <input className="saas-input w-full" type="datetime-local" value={form.startsAt}
                    onChange={(e) => set("startsAt", e.target.value)} />
                </FieldLabel>
                <FieldLabel label="End">
                  <input className="saas-input w-full" type="datetime-local" value={form.endsAt}
                    onChange={(e) => set("endsAt", e.target.value)} />
                </FieldLabel>
              </div>

              <FieldLabel label="Billing notes">
                <textarea className="saas-textarea w-full min-h-[68px]" value={form.billingNotes}
                  onChange={(e) => set("billingNotes", e.target.value)} />
              </FieldLabel>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <div>
            {isEdit && (
              <button type="button" disabled={deleting} onClick={handleDelete}
                className="text-sm font-medium text-rose-500 transition-colors hover:text-rose-700 disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="inline-flex items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-60"
              style={{ backgroundColor: modalAccent, boxShadow: `0 1px 8px ${modalAccent}55` }}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Small helper for labeled form fields */
function FieldLabel({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {children}
    </div>
  );
}

/* ─── ViewSwitcher ──────────────────────────────────────────────────────────── */
function ViewSwitcher({ view, onChange }) {
  const opts = [{ k: "day", l: "Day" }, { k: "week", l: "Week" }, { k: "month", l: "Month" }];
  return (
    <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      {opts.map(({ k, l }) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={`px-3.5 py-2 text-sm font-medium transition-colors ${
            view === k
              ? "bg-indigo-600 text-white"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
          } border-r border-slate-200 last:border-r-0`}>
          {l}
        </button>
      ))}
    </div>
  );
}

/* ─── CalendarToolbar ───────────────────────────────────────────────────────── */
function CalendarToolbar({ view, viewDate, weekStart, onPrev, onNext, onToday, onNew, onViewChange }) {
  let label;
  if (view === "day")   label = viewDate.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  else if (view === "week") label = weekRangeLabel(weekStart);
  else label = viewDate.toLocaleDateString("en-US", { month:"long", year:"numeric" });

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Appointments</h1>
        <p className="mt-0.5 text-sm text-slate-500">{label}</p>
      </div>

      <div className="flex items-center gap-2">
        {/* View switcher */}
        <ViewSwitcher view={view} onChange={onViewChange} />

        {/* Nav arrows + Today */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
          <button type="button" onClick={onPrev} aria-label="Previous"
            className="flex h-9 w-9 items-center justify-center rounded-l-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 text-lg leading-none">
            ‹
          </button>
          <button type="button" onClick={onToday}
            className="border-x border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            style={{ height: 36 }}>
            Today
          </button>
          <button type="button" onClick={onNext} aria-label="Next"
            className="flex h-9 w-9 items-center justify-center rounded-r-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 text-lg leading-none">
            ›
          </button>
        </div>

        <button type="button" onClick={onNew} className="btn-primary flex items-center gap-1.5">
          <span className="text-base leading-none">+</span> New Appointment
        </button>
      </div>
    </div>
  );
}

/* ─── AppointmentsPage ──────────────────────────────────────────────────────── */
export default function AppointmentsPage() {
  const toast = useToast();

  // Calendar state
  const [view,         setView]         = useState("week");
  const [viewDate,     setViewDate]     = useState(() => new Date());
  const [appointments, setAppointments] = useState([]);
  const [services,     setServices]     = useState([]);
  const [providers,    setProviders]    = useState([]);
  const [clients,      setClients]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState(null);
  // Details drawer — stores the ID of the appointment to inspect
  const [drawerApptId, setDrawerApptId] = useState(null);

  /* ── Derived dates ── */
  const weekStart = useMemo(() => getWeekStart(viewDate), [viewDate]);

  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }),
    [weekStart],
  );

  const monthDates = useMemo(() =>
    getMonthDates(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate],
  );

  /* ── Appointment filters ── */
  const visibleAppts = useMemo(() => {
    if (view === "day") {
      return appointments.filter((a) => isSameDay(new Date(a.startsAt), viewDate));
    }
    if (view === "week") {
      // Use isSameDay per weekday — avoids any UTC timestamp edge-cases at day boundaries
      return appointments.filter((a) => {
        const d = new Date(a.startsAt);
        return weekDates.some((wd) => isSameDay(d, wd));
      });
    }
    // month — include all dates in the 6-week grid
    return appointments.filter((a) => {
      const d = new Date(a.startsAt);
      return monthDates.some((md) => isSameDay(d, md));
    });
  }, [appointments, view, viewDate, weekDates, monthDates]);

  /* ── Pre-compute holidays for all visible dates ── */
  const dayHolidays = useMemo(() => {
    const visibleDates = view === "day" ? [viewDate] : view === "week" ? weekDates : monthDates;
    const map = {};
    for (const d of visibleDates) {
      map[dateKey(d)] = getAllHolidays(d);
    }
    return map;
  }, [view, viewDate, weekDates, monthDates]);

  /* ── Load ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c, s, p] = await Promise.all([
        api.get("/appointments"),
        api.get("/clients"),
        api.get("/services", { params: { status: "active" } }),
        api.get("/providers", { params: { status: "active" } }),
      ]);
      setAppointments(a.data);
      // Always alphabetical — backend now sorts, but apply client-side as safety net
      setClients(
        (c.data ?? []).slice().sort((a2, b2) =>
          (a2.fullName ?? "").trim().toLowerCase().localeCompare((b2.fullName ?? "").trim().toLowerCase())
        )
      );
      setServices(s.data);
      setProviders(p.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Navigation ── */
  function navigate(dir) {
    setViewDate((d) => {
      const n = new Date(d);
      if (view === "day")   n.setDate(n.getDate() + dir);
      else if (view === "week")  n.setDate(n.getDate() + dir * 7);
      else n.setMonth(n.getMonth() + dir);
      return n;
    });
  }
  const goToday = () => setViewDate(new Date());

  /* ── Slot click ── */
  const handleSlotClick = useCallback((date, hour, minute) => {
    const s = new Date(date); s.setHours(hour, minute, 0, 0);
    const e = new Date(s.getTime() + 3_600_000);
    setModal({ mode: "create", start: s.toISOString(), end: e.toISOString() });
  }, []);

  /* ── Event click — opens the details drawer (not the edit modal directly) ── */
  const handleApptClick = useCallback((appt) => {
    setDrawerApptId(appt.id);
  }, []);

  /* ── Edit from inside the drawer ── */
  const handleDrawerEdit = useCallback((appt) => {
    setDrawerApptId(null);   // close drawer first
    setModal({ mode: "edit", appt });
  }, []);

  /* ── Month day click → switch to day view ── */
  const handleDayClick = useCallback((date) => {
    setViewDate(date);
    setView("day");
  }, []);

  /* ── New appointment button ── */
  const handleNew = () => {
    const s = new Date(); s.setMinutes(Math.ceil(s.getMinutes() / 15) * 15, 0, 0);
    const e = new Date(s.getTime() + 3_600_000);
    setModal({ mode: "create", start: s.toISOString(), end: e.toISOString() });
  };


  /* ── Soft refresh — updates appointments without the loading skeleton ── */
  const softRefresh = useCallback(async () => {
    try {
      const r = await api.get("/appointments");
      setAppointments(r.data ?? []);
    } catch {}
  }, []);

  /* ── After save: accept the optimistic appointment, add it, then soft-refresh ── */
  const handleSaved = useCallback((optimisticAppt) => {
    if (optimisticAppt) {
      setAppointments((prev) => {
        const idx = prev.findIndex((a) => a.id === optimisticAppt.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = optimisticAppt;
          return next;
        }
        return [optimisticAppt, ...prev];
      });
    }
    softRefresh();
  }, [softRefresh]);

  const handleDeleted = useCallback((id) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    if (drawerApptId === id) setDrawerApptId(null);
  }, [drawerApptId]);

  const handleClientCreated = useCallback((created) => {
    setClients((prev) => {
      const rest = prev.filter((c) => c.id !== created.id);
      const row = { ...created, address: "", notes: "" };
      return [...rest, row].sort((a, b) =>
        (a.fullName ?? "").trim().toLowerCase().localeCompare((b.fullName ?? "").trim().toLowerCase())
      );
    });
  }, []);

  /* ── Resize save — called by AppointmentCard when bottom-edge drag ends ──────
   * Performs an optimistic local update first, then persists via PUT.
   * Uses the same API endpoint and payload shape as the edit modal.
   * No validation bypass — durationMinutes and endsAt are both sent.          */
  const handleResizeSave = useCallback(async (appt, newEndsAtISO, newDurMin) => {
    // 1. Optimistic update so the calendar reflects the new height immediately
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === appt.id
          ? { ...a, endsAt: newEndsAtISO, durationMinutes: newDurMin }
          : a,
      ),
    );
    // 2. Persist to server — same payload shape the edit modal uses
    try {
      await api.put(`/appointments/${appt.id}`, {
        endsAt:          newEndsAtISO,
        durationMinutes: newDurMin,
      });
      // 3. Background sync to pull any server-side changes (reminders, billing, etc.)
      softRefresh();
    } catch {
      toast?.error("Could not save resize — please try again.");
      // 4. Rollback: restore original values on failure
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appt.id
            ? { ...a, endsAt: appt.endsAt, durationMinutes: appt.durationMinutes }
            : a,
        ),
      );
    }
  }, [softRefresh, toast]);

  /* ── Move save — called by TimeGrid when drag-to-move releases ──────────────
   * Same optimistic-update + rollback pattern as handleResizeSave.             */
  const handleMoveSave = useCallback(async (appt, newStartsAtISO, newEndsAtISO, newDurMin) => {
    // 1. Optimistic update
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === appt.id
          ? { ...a, startsAt: newStartsAtISO, endsAt: newEndsAtISO, durationMinutes: newDurMin }
          : a,
      ),
    );
    // 2. Persist to server
    try {
      await api.put(`/appointments/${appt.id}`, {
        startsAt:        newStartsAtISO,
        endsAt:          newEndsAtISO,
        durationMinutes: newDurMin,
      });
      softRefresh();
    } catch {
      toast?.error("Could not move appointment — please try again.");
      // 3. Rollback on failure
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appt.id
            ? { ...a, startsAt: appt.startsAt, endsAt: appt.endsAt, durationMinutes: appt.durationMinutes }
            : a,
        ),
      );
    }
  }, [softRefresh, toast]);

  /* ── View dates for TimeGrid ── */
  const timeGridDates = view === "day" ? [viewDate] : weekDates;

  return (
    <div className="flex h-full flex-col gap-4">
      <CalendarToolbar
        view={view}
        viewDate={viewDate}
        weekStart={weekStart}
        onPrev={() => navigate(-1)}
        onNext={() => navigate(1)}
        onToday={goToday}
        onNew={handleNew}
        onViewChange={(v) => setView(v)}
      />

      {loading ? (
        <div className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-3">
            <div className="skeleton h-10 w-full rounded-lg" />
            <div className="skeleton h-[440px] w-full rounded-xl" />
          </div>
        </div>
      ) : view === "month" ? (
        <MonthGrid
          viewDate={viewDate}
          appts={visibleAppts}
          onDayClick={handleDayClick}
          onApptClick={handleApptClick}
          dayHolidays={dayHolidays}
        />
      ) : (
        <TimeGrid
          viewDates={timeGridDates}
          appts={visibleAppts}
          onSlotClick={handleSlotClick}
          onApptClick={handleApptClick}
          dayHolidays={dayHolidays}
          onResizeSave={handleResizeSave}
          onMoveSave={handleMoveSave}
        />
      )}

      <AppointmentModal
        modal={modal}
        onClose={() => setModal(null)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        clients={clients}
        services={services}
        providers={providers}
        toast={toast}
        onClientCreated={handleClientCreated}
      />

      {drawerApptId && (
        <AppointmentDetailsModal
          appointmentId={drawerApptId}
          onClose={() => setDrawerApptId(null)}
          onEdit={handleDrawerEdit}
          onDeleted={handleDeleted}
          toast={toast}
        />
      )}
    </div>
  );
}
