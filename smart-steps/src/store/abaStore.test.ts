/**
 * Regression tests for the "data disappears" bug in Smart Steps.
 *
 * Root cause #1 (this file): the Zustand `activeSession` slot used to be
 * unconditionally overwritten by `startSession(...)` any time a new session
 * was started — for the SAME client (e.g. a stray re-mount / double click)
 * or a DIFFERENT client — silently discarding any unsaved trials/goals data
 * recorded so far. `resolveSessionStart()` is the guard that replaced all
 * direct `startSession()` calls from the UI; these tests lock in that an
 * unsaved session is never silently discarded again.
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { useABAStore as UseABAStore, resolveSessionStart as ResolveSessionStart, SessionStartResult } from "./abaStore";

function expectStartedLocalId(r: SessionStartResult): string {
  if (r.kind !== "started") throw new Error(`expected kind "started", got "${r.kind}"`);
  return r.localId;
}

// zustand's `persist` middleware touches `localStorage` during store
// creation/hydration; stub a minimal in-memory implementation so this store
// module can be imported under Node's test runner (no browser/DOM here).
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

let useABAStore: typeof UseABAStore;
let resolveSessionStart: typeof ResolveSessionStart;

function resetStore() {
  useABAStore.setState({ activeSession: null, categories: [], programs: [], targets: [] });
}

describe("resolveSessionStart — prevents silent loss of unsaved session data", () => {
  before(async () => {
    ({ useABAStore, resolveSessionStart } = await import("./abaStore"));
  });

  beforeEach(() => {
    resetStore();
  });

  test("starting a session with no existing active session just starts fresh", () => {
    const result = resolveSessionStart("client-A");
    assert.equal(result.kind, "started");
    const state = useABAStore.getState();
    assert.ok(state.activeSession, "a new active session should have been created");
    assert.equal(state.activeSession?.clientId, "client-A");
  });

  test("re-entering the SAME client's in-progress session resumes it instead of wiping trials", () => {
    const first = resolveSessionStart("client-A");
    const firstLocalId = expectStartedLocalId(first);
    useABAStore.getState().addTrial(firstLocalId, {
      targetId: "target-1", targetTitle: "Target 1", result: "CORRECT", recordedAt: Date.now(),
    });
    assert.equal(useABAStore.getState().activeSession?.trials.length, 1);

    // Simulate the user navigating back into the same client's data-entry tab.
    const second = resolveSessionStart("client-A");
    assert.equal(second.kind, "resumed");
    if (second.kind === "resumed") {
      assert.equal(second.existing.trials.length, 1, "unsaved trial must still be there");
    }
    assert.equal(
      useABAStore.getState().activeSession?.trials.length,
      1,
      "activeSession must NOT have been reset/overwritten",
    );
  });

  test("THE BUG: starting a session for a DIFFERENT client while unsaved work exists is refused, not silently discarded", () => {
    const first = resolveSessionStart("client-A");
    const firstLocalId = expectStartedLocalId(first);
    useABAStore.getState().addTrial(firstLocalId, {
      targetId: "target-1", targetTitle: "Target 1", result: "CORRECT", recordedAt: Date.now(),
    });
    assert.equal(useABAStore.getState().activeSession?.clientId, "client-A");
    assert.equal(useABAStore.getState().activeSession?.trials.length, 1);

    // Old buggy behavior: calling startSession("client-B") here would
    // silently call `set({ activeSession: newSession })`, permanently
    // destroying client A's unsaved trial with no warning to the user.
    const second = resolveSessionStart("client-B");
    assert.equal(second.kind, "conflict", "must report a conflict instead of proceeding");
    if (second.kind === "conflict") {
      assert.equal(second.existing.clientId, "client-A");
    }

    // Critically: the store must be untouched — client A's data survives.
    const state = useABAStore.getState();
    assert.equal(state.activeSession?.clientId, "client-A");
    assert.equal(state.activeSession?.trials.length, 1, "client A's unsaved trial must survive the conflicting start attempt");
  });

  test("force:true (explicit user confirmation) is the ONLY way to discard another client's unsaved session", () => {
    resolveSessionStart("client-A");
    const forced = resolveSessionStart("client-B", { force: true });
    assert.equal(forced.kind, "started");
    assert.equal(useABAStore.getState().activeSession?.clientId, "client-B");
  });

  test("an already-saved session never blocks starting a new one (no false-positive conflicts)", () => {
    const first = resolveSessionStart("client-A");
    useABAStore.getState().markSessionSaved(expectStartedLocalId(first));

    const second = resolveSessionStart("client-B");
    assert.equal(second.kind, "started", "a saved session must not be treated as in-progress unsaved work");
    assert.equal(useABAStore.getState().activeSession?.clientId, "client-B");
  });
});
