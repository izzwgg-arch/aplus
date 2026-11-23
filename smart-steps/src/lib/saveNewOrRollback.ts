"use client";

import { toast } from "sonner";

/**
 * Sends the ONE create request for a category / skill area / goal that has
 * already been added to the local store optimistically, and takes the local row
 * back out again if the server does not accept it.
 *
 * Why: these create paths used to fire the POST, ignore the answer, and toast
 * "created" regardless. A refused request (403 — an RBT has no
 * `goals.create` / `targets.create`) or a failed one left the row in that ONE
 * browser forever, looking saved, while nobody else ever saw it — nothing ever
 * re-sends an unsaved row. Reported 2026-11-18: ~30 goals an RBT "added" for a
 * client, every POST answered 403, the server held none of them.
 *
 * The success toast is shown only once the server has confirmed.
 */
export async function saveNewOrRollback(opts: {
  url: string;
  body: unknown;
  /** Lower-case, singular: "goal", "skill area", "category". */
  noun: string;
  onSaved: (serverId: string) => void;
  rollback: () => void;
  /** Toast on success (default: true). */
  announce?: boolean;
}): Promise<string | null> {
  const { url, body, noun, onSaved, rollback, announce = true } = opts;
  const label = noun.charAt(0).toUpperCase() + noun.slice(1);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    rollback();
    toast.error(`${label} was NOT saved — the server could not be reached. Check the connection and add it again.`);
    return null;
  }

  const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
  if (!res.ok || !data?.id) {
    rollback();
    if (res.status === 403) {
      toast.error(`${label} was NOT saved — your account is not allowed to add a ${noun}. Ask a BCBA or an admin to add it.`);
    } else {
      toast.error(`${label} was NOT saved${data?.error ? `: ${data.error}` : ""}. Please try again.`);
    }
    return null;
  }

  onSaved(data.id);
  if (announce) toast.success(`${label} created`);
  return data.id;
}
