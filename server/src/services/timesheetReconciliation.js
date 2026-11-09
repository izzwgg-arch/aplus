import { prisma } from "../config/prisma.js";

/**
 * Parse a regular timesheet entry
 * Format: {provider, bcba, child, date, timeIn, timeOut, hours, type, location}
 */
export function parseRegularTimesheet(rows) {
  return rows.map(row => ({
    provider: row.provider?.trim() || null,
    bcba: row.bcba?.trim() || null,
    child: row.child?.trim() || null,
    date: parseDate(row.date),
    timeIn: row.timeIn?.trim() || null,
    timeOut: row.timeOut?.trim() || null,
    hours: parseFloat(row.hours) || 0,
    type: row.type?.trim()?.toUpperCase() || null, // DR, SV, etc.
    location: row.location?.trim() || null,
    raw: row // Keep original for debugging
  })).filter(row => row.date); // Filter out invalid dates
}

/**
 * Parse a BCBA timesheet entry
 * Format: {bcba, client, date, type, timeIn, timeOut, hours}
 */
export function parseBcbaTimesheet(rows) {
  return rows.map(row => ({
    bcba: row.bcba?.trim() || null,
    client: row.client?.trim() || null,
    date: parseDate(row.date),
    type: row.type?.trim() || null, // S (Supervision), TP (Treatment Planning), etc.
    timeIn: row.timeIn?.trim() || null,
    timeOut: row.timeOut?.trim() || null,
    hours: parseFloat(row.hours) || 0,
    raw: row
  })).filter(row => row.date);
}

/**
 * Parse date string to Date object
 * Handles: "sun 10/25/2026", "10/25/2026", "2026-10-25", etc.
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Remove day of week if present (e.g., "sun 10/25/2026" -> "10/25/2026")
  const cleaned = dateStr.replace(/^(mon|tue|wed|thu|fri|sat|sun)\s+/i, '').trim();

  try {
    const parsed = new Date(cleaned);
    if (isNaN(parsed)) return null;

    // Return date at midnight in clinic timezone
    return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  } catch {
    return null;
  }
}

/**
 * Parse time string to HH:MM format
 * Handles: "7:30 AM", "7:30AM", "19:30", "7:30", etc.
 */
export function parseTime(timeStr) {
  if (!timeStr) return null;

  const cleaned = timeStr.trim();

  // Check for AM/PM
  const isAm = /AM$/i.test(cleaned);
  const isPm = /PM$/i.test(cleaned);
  const time12 = cleaned.replace(/\s?(AM|PM)$/i, '').trim();

  const [hour, minute] = time12.split(':').map(Number);
  if (isNaN(hour) || isNaN(minute)) return null;

  let h = hour;
  if (isAm && h === 12) h = 0; // 12 AM = 00:00
  if (isPm && h !== 12) h += 12; // 1 PM = 13:00

  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Find matching session for a timesheet entry
 * Matches by: provider + client + date + time window
 */
export async function findMatchingSession(entry, searchWindow = 300) {
  if (!entry.provider || !entry.child) return null;

  // Find sessions by provider name and client name (case-insensitive)
  const sessions = await prisma.session.findMany({
    where: {
      startedAt: {
        gte: new Date(entry.date),
        lt: new Date(entry.date.getTime() + 24 * 60 * 60 * 1000)
      },
      deletedAt: null
    },
    include: {
      client: true,
      provider: true,
      supervisor: true
    }
  });

  // Filter by provider and client name match (case-insensitive)
  const candidates = sessions.filter(session => {
    const providerName = session.provider?.name || '';
    const clientName = session.client?.name || '';

    return (
      providerName.toLowerCase().includes(entry.provider.toLowerCase()) &&
      clientName.toLowerCase().includes(entry.child.toLowerCase())
    );
  });

  // If no candidates, return null
  if (!candidates.length) return null;

  // If entry has times, try to match by time window
  if (entry.timeIn && entry.timeOut) {
    return candidates.find(session => {
      const sessionStartTime = formatTimeFromDate(session.startedAt);
      const sessionEndTime = formatTimeFromDate(session.endedAt);

      return (
        timeWindowsOverlap(entry.timeIn, entry.timeOut, sessionStartTime, sessionEndTime, searchWindow)
      );
    }) || candidates[0]; // Fallback to first candidate
  }

  return candidates[0]; // Return first candidate if no time match
}

/**
 * Format time from a Date object as HH:MM
 */
function formatTimeFromDate(date) {
  if (!date) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Check if two time windows overlap (within searchWindow seconds)
 */
function timeWindowsOverlap(start1, end1, start2, end2, searchWindow = 300) {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);

  const startDiff = Math.abs(s1 - s2);
  const endDiff = Math.abs(e1 - e2);

  return startDiff <= (searchWindow / 60) && endDiff <= (searchWindow / 60);
}

/**
 * Convert HH:MM string to minutes since midnight
 */
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Reconcile regular timesheet entries against sessions
 */
export async function reconcileRegularTimesheet(entries) {
  const results = [];

  for (const entry of entries) {
    const matchingSession = await findMatchingSession(entry);

    const result = {
      timesheetEntry: entry,
      matchingSession: matchingSession,
      flags: [],
      canFix: []
    };

    if (!matchingSession) {
      result.flags.push({
        type: 'NO_SESSION',
        severity: 'error',
        message: `No session found for ${entry.provider} + ${entry.child} on ${entry.date.toDateString()}`
      });
    } else {
      // Check for time mismatch
      if (entry.timeIn && entry.timeOut) {
        const sessionStartTime = formatTimeFromDate(matchingSession.startedAt);
        const sessionEndTime = formatTimeFromDate(matchingSession.endedAt);

        if (entry.timeIn !== sessionStartTime || entry.timeOut !== sessionEndTime) {
          result.flags.push({
            type: 'TIME_MISMATCH',
            severity: 'warning',
            message: `Time mismatch: Timesheet ${entry.timeIn}-${entry.timeOut}, Session ${sessionStartTime}-${sessionEndTime}`,
            timesheetTime: `${entry.timeIn}-${entry.timeOut}`,
            sessionTime: `${sessionStartTime}-${sessionEndTime}`
          });
          result.canFix.push('UPDATE_SESSION_TIME');
        }
      }

      // Check for supervision mismatch
      if (entry.type === 'SV' && !matchingSession.supervised) {
        result.flags.push({
          type: 'SUPERVISION_NOT_MARKED',
          severity: 'warning',
          message: `Timesheet shows supervision (SV) but session not marked as supervised`,
          requiresSVNote: true
        });
        result.canFix.push('MARK_SUPERVISED');
      }

      if (entry.type !== 'SV' && matchingSession.supervised) {
        result.flags.push({
          type: 'SUPERVISION_MARKED_INCORRECTLY',
          severity: 'warning',
          message: `Session marked as supervised but timesheet does not show supervision`
        });
      }

      // Check for SV notes if supervision exists
      if ((entry.type === 'SV' || matchingSession.supervised) && matchingSession.id) {
        const svNotes = await prisma.note.count({
          where: {
            sessionId: matchingSession.id,
            type: 'BCBA_SESSION' // DSU/SV notes
          }
        });

        if (svNotes === 0 && entry.type === 'SV') {
          result.flags.push({
            type: 'NO_SV_NOTE',
            severity: 'warning',
            message: `Supervision recorded but no SV note found for this session`,
            requiresManualFix: true
          });
        }
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Reconcile BCBA timesheet entries against sessions
 */
export async function reconcileBcbaTimesheet(entries) {
  const results = [];

  for (const entry of entries) {
    // Try to find matching session by BCBA + client + date
    const sessions = await prisma.session.findMany({
      where: {
        startedAt: {
          gte: new Date(entry.date),
          lt: new Date(entry.date.getTime() + 24 * 60 * 60 * 1000)
        },
        deletedAt: null
      },
      include: {
        client: true,
        supervisor: true
      }
    });

    const matchingSessions = sessions.filter(session => {
      const clientName = session.client?.name || '';
      const supervisorName = session.supervisor?.name || '';

      return (
        clientName.toLowerCase().includes(entry.client?.toLowerCase() || '') ||
        supervisorName.toLowerCase().includes(entry.bcba?.toLowerCase() || '')
      );
    });

    const result = {
      timesheetEntry: entry,
      matchingSessions: matchingSessions,
      flags: [],
      canFix: []
    };

    if (!matchingSessions.length) {
      result.flags.push({
        type: 'NO_SESSIONS',
        severity: 'error',
        message: `No sessions found for BCBA ${entry.bcba} + Client ${entry.client} on ${entry.date.toDateString()}`
      });
    } else {
      // Check for supervision (S = Supervision)
      if (entry.type === 'S') {
        const supervisedSessions = matchingSessions.filter(s => s.supervised);
        if (supervisedSessions.length === 0) {
          result.flags.push({
            type: 'SUPERVISION_NOT_RECORDED',
            severity: 'warning',
            message: `BCBA timesheet shows supervision but no supervised sessions found for this date`
          });
        }
      }

      // Check for SV notes on BCBA type entries
      if (entry.type === 'S') {
        const sessionsWithSVNotes = await Promise.all(
          matchingSessions.map(async session => {
            const hasNote = await prisma.note.count({
              where: {
                sessionId: session.id,
                type: 'BCBA_SESSION'
              }
            });
            return { session, hasNote: hasNote > 0 };
          })
        );

        const withoutNotes = sessionsWithSVNotes.filter(x => !x.hasNote);
        if (withoutNotes.length > 0) {
          result.flags.push({
            type: 'MISSING_SV_NOTES',
            severity: 'warning',
            message: `${withoutNotes.length} supervised session(s) missing SV notes`,
            sessionsWithoutNotes: withoutNotes.map(x => x.session.id)
          });
        }
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Apply fixes to sessions based on reconciliation results
 */
export async function applyFixes(fixes) {
  const results = [];

  for (const fix of fixes) {
    try {
      if (fix.type === 'UPDATE_SESSION_TIME' && fix.sessionId) {
        await prisma.session.update({
          where: { id: fix.sessionId },
          data: {
            startedAt: fix.newStartTime,
            endedAt: fix.newEndTime
          }
        });
        results.push({
          fixType: fix.type,
          sessionId: fix.sessionId,
          status: 'FIXED'
        });
      } else if (fix.type === 'MARK_SUPERVISED' && fix.sessionId) {
        await prisma.session.update({
          where: { id: fix.sessionId },
          data: {
            supervised: true,
            supervisorId: fix.supervisorId || null
          }
        });
        results.push({
          fixType: fix.type,
          sessionId: fix.sessionId,
          status: 'FIXED'
        });
      }
    } catch (error) {
      results.push({
        fixType: fix.type,
        sessionId: fix.sessionId,
        status: 'ERROR',
        error: error.message
      });
    }
  }

  return results;
}
