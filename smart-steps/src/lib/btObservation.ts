/**
 * The BT's own observation on a session note — one rule, one message.
 *
 * A generated session note reports what was entered as data: trials,
 * percentages, prompt codes, behavior counts. It cannot know that the child
 * came in tired, that a program was stopped early, that a parent mentioned
 * something at pickup, or that a new behavior appeared that has no event type
 * yet. Those are the lines a reviewer actually reads, and only the person in
 * the room can write them.
 *
 * So a BT session note is not "written" until it carries one. This module is
 * the single source of truth for that test, shared by the API routes and both
 * note editors, so the server and the form can never disagree about whether a
 * note is complete.
 */

/** Short enough that one honest sentence passes, long enough that "ok" does not. */
export const MIN_BT_OBSERVATION_CHARS = 20;

/** Used when the person filling it in is the one who ran the session. */
export const BT_OBSERVATION_LABEL = "Your observations";

/**
 * Used everywhere else. The missing thing is the account of whoever ran the
 * session, which is usually NOT the person reading the screen — most notes here
 * are transcribed by office staff. Wording that says "your" turns a gap in the
 * record into an accusation aimed at whoever happens to be looking at it, so
 * nothing that flags the gap names a person.
 */
export const BT_OBSERVATION_LABEL_OTHER = "Therapist observations";

/** The chip and filter wording — deliberately about the session, not a person. */
export const BT_OBSERVATION_FLAG_LABEL = "Needs therapist observation";

export const BT_OBSERVATION_HINT =
  "In your own words: how the session went, anything that affected it, anything the team should know. At least one sentence.";

export function isBtObservationComplete(value: string | null | undefined): boolean {
  return (value ?? "").trim().length >= MIN_BT_OBSERVATION_CHARS;
}

/** Returns the message to show, or null when the observation passes. */
export function btObservationError(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text.length === 0) {
    return "Add your own observations before saving this session note.";
  }
  if (text.length < MIN_BT_OBSERVATION_CHARS) {
    return `Your observations need at least ${MIN_BT_OBSERVATION_CHARS} characters — a sentence in your own words about how the session went.`;
  }
  return null;
}

/**
 * WHO has to supply the observation: the person who ran the session.
 *
 * This clinic writes most of its notes centrally — office staff transcribe
 * write-ups for sessions other therapists ran. When this was added, 846 of 891
 * BT session notes were authored by somebody who was NOT the session's
 * provider. Demanding a first-person observation from whoever is at the
 * keyboard therefore blocks the clinic's normal documentation workflow, and the
 * only way to satisfy it would be to invent an account of a session the author
 * never attended — which is exactly what this field exists to prevent. So a
 * transcriber is never blocked.
 *
 * The observation is REQUIRED only when the note's author is the session's own
 * provider: the one case where the author really was in the room. Otherwise the
 * field stays available but optional, and the note still reports itself as
 * needing an observation — the "needs your observations" chip on the session
 * card and the `hasNote=needsObs` session filter both key off the stored value
 * — so the provider's account can still be chased down.
 *
 * A note with no session link has no provider to compare against, so it is not
 * blocked either.
 */
export function btObservationRequired(args: {
  noteType:          string | null | undefined;
  authorId:          string | null | undefined;
  sessionProviderId: string | null | undefined;
}): boolean {
  if (args.noteType !== "BT_SESSION") return false;
  if (!args.authorId || !args.sessionProviderId) return false;
  return args.authorId === args.sessionProviderId;
}

/**
 * The save-time test, for every write path.
 *
 * `required` governs ONLY whether leaving it blank is acceptable. A value that
 * IS supplied must always clear `MIN_BT_OBSERVATION_CHARS`, whoever is saving.
 *
 * That second half matters more than it looks: the "needs an observation" chip
 * tests `isBtObservationComplete()` (shorter than the minimum counts as
 * missing) while the `hasNote=needsObs` filter can only test null-or-empty —
 * Prisma cannot filter on string length. The two agree only while a stored
 * observation is "absent or long enough", which held when every BT note was
 * required to have one. Once the field became optional for transcribers, a
 * saved "ok" would be flagged by the chip and yet be invisible to the filter.
 * Rejecting a too-short value on the way in restores the invariant instead of
 * silently discarding what someone typed.
 */
export function btObservationSaveError(
  value: string | null | undefined,
  required: boolean,
): string | null {
  const text = (value ?? "").trim();
  if (!required && text.length === 0) return null;
  return btObservationError(value);
}

/** Shown under the field when the author did not run the session. */
export const BT_OBSERVATION_OPTIONAL_HINT =
  "Optional here — this session was run by someone else. Record anything the therapist who ran it passed on; otherwise they can add it themselves.";
