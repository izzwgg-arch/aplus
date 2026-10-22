/**
 * Phrasing variation for generated BT session notes.
 *
 * Every number in a clinical note comes from a row in the database, and
 * regenerating an unchanged session must reproduce the same text — the same
 * rule the BCBA generators follow. So variation here is DETERMINISTIC: the
 * wording is chosen from the session's own id, never from a clock or a random
 * number. Two different sessions read differently; one session reads the same
 * way every time it is generated.
 *
 * Why this exists: a note whose every sentence is identical across sessions,
 * children and therapists reads as cloned documentation, which is one of the
 * first things a payer audit flags.
 *
 * Variants within a slot must be strictly equivalent in meaning and must carry
 * exactly the same facts. Never add a variant that adds, drops or softens a
 * number.
 */

/** FNV-1a over the session id. Stable across processes and deploys. */
export function voiceSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Chooses one variant for `slot` from `seed`. The slot is mixed in so two
 * slots on the same session do not move in lockstep — otherwise every note
 * would use "variant 2" for all of its sentences at once.
 */
export function pickVariant<T>(seed: number, slot: number, options: readonly T[]): T {
  if (options.length === 0) throw new Error("pickVariant requires at least one option");
  let h = (seed ^ Math.imul(slot + 1, 2654435761)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return options[(h >>> 0) % options.length];
}

/* ── Slot ids. Keep them distinct and stable: changing one re-rolls the
   wording of every already-generated note the next time it regenerates. ── */
const SLOT = {
  opening:    1,
  data:       2,
  noData:     3,
  addedOnly:  4,
  behavior:   5,
  noBehavior: 6,
} as const;

export type OpeningFacts = {
  clientName:   string;
  modeLabel:    string;
  dateStr:      string;
  providerName: string;
};

export function openingSentence(seed: number, f: OpeningFacts): string {
  const { clientName: c, modeLabel: m, dateStr: d, providerName: p } = f;
  return pickVariant(seed, SLOT.opening, [
    `${c} attended a ${m} session on ${d} with ${p}.`,
    `${p} ran a ${m} session with ${c} on ${d}.`,
    `On ${d}, ${c} took part in a ${m} session with ${p}.`,
    `${c} was seen for a ${m} session on ${d}; the service was provided by ${p}.`,
  ]);
}

export type DataFacts = { totalTrials: number; goalCount: number; overallPct: number };

export function dataSentence(seed: number, f: DataFacts): string {
  const { totalTrials: n, goalCount: g, overallPct: p } = f;
  const trials = `${n} trial${n !== 1 ? "s" : ""}`;
  const goals  = `${g} goal${g !== 1 ? "s" : ""}`;
  /* A single trial takes a singular verb — "1 trial were run" reads as a bug
     to anyone reviewing the record. */
  const wereWas = n !== 1 ? "were" : "was";
  return pickVariant(seed, SLOT.data, [
    `${trials} across ${goals}, ${p}% overall accuracy.`,
    `Data was taken on ${goals} over ${trials}, averaging ${p}%.`,
    `Across ${goals}, ${trials} ${wereWas} recorded at ${p}% overall accuracy.`,
    `${trials} ${wereWas} run across ${goals} for an overall accuracy of ${p}%.`,
  ]);
}

export function noDataSentence(seed: number): string {
  return pickVariant(seed, SLOT.noData, [
    `No trial data was recorded.`,
    `No trials were recorded this session.`,
    `Trial data was not collected during this session.`,
  ]);
}

export function addedOnlySentence(seed: number, count: number): string {
  const goals = `${count} additional goal${count !== 1 ? "s" : ""}`;
  return pickVariant(seed, SLOT.addedOnly, [
    `${goals} ${count !== 1 ? "were" : "was"} addressed without data.`,
    count !== 1
      ? `A further ${count} goals were worked on with no data taken.`
      : `One further goal was worked on with no data taken.`,
    `${goals} ${count !== 1 ? "were" : "was"} covered, though no trials were run on ${count !== 1 ? "them" : "it"}.`,
  ]);
}

export function behaviorSentence(seed: number, counts: string, abcCount: number): string {
  const abc = abcCount > 0 ? ` ABC data collected on ${abcCount}.` : "";
  return pickVariant(seed, SLOT.behavior, [
    `Behavior events: ${counts}.${abc} BIP procedures implemented as written.`,
    `Recorded this session: ${counts}.${abc} The behavior plan was followed as written.`,
    `${counts} recorded.${abc} BIP procedures were implemented as written.`,
  ]);
}

export function noBehaviorSentence(seed: number, clientName: string): string {
  return pickVariant(seed, SLOT.noBehavior, [
    `No target behaviors observed. ${clientName} participated appropriately throughout.`,
    `No target behaviors were recorded; ${clientName} engaged appropriately for the session.`,
    `${clientName} participated appropriately and no target behaviors were observed.`,
  ]);
}
