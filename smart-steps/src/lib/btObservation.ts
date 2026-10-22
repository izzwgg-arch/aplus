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

export const BT_OBSERVATION_LABEL = "Your observations";

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
