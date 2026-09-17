import api from "./api";

/**
 * Client-side error reporting.
 *
 * A render error in React 18 unmounts the whole tree, which the user sees as
 * "the page went blank" — and nothing is logged anywhere we can read. Every
 * uncaught error (render, effect, event handler, promise) is now POSTed to
 * `/api/client-errors`, which writes it to the server log, so the next blank
 * page can be diagnosed from `pm2 logs aba-app` instead of guessed at.
 *
 * Reporting is best-effort: it must never throw, never block, and never loop
 * (a failed report is not itself reported). It is throttled so a render loop
 * cannot flood the server.
 */

const MAX_REPORTS_PER_MINUTE = 5;
const sent = [];
let installed = false;

function throttled() {
  const now = Date.now();
  while (sent.length && now - sent[0] > 60_000) sent.shift();
  if (sent.length >= MAX_REPORTS_PER_MINUTE) return true;
  sent.push(now);
  return false;
}

function describe(err) {
  if (err instanceof Error) {
    return { message: err.message || String(err), stack: err.stack || "" };
  }
  if (err && typeof err === "object") {
    let message = "";
    try { message = JSON.stringify(err).slice(0, 500); } catch { message = String(err); }
    return { message, stack: "" };
  }
  return { message: String(err), stack: "" };
}

/** Vite lazy-route chunk that no longer exists on the server (after a deploy). */
export function isChunkLoadError(err) {
  const msg = (err?.message || String(err || "")).toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("unexpected token '<'") ||
    /loading (css )?chunk [\w-]+ failed/.test(msg)
  );
}

export function reportClientError(err, extra = {}) {
  try {
    if (throttled()) return;
    const { message, stack } = describe(err);
    const payload = {
      message: String(message).slice(0, 1000),
      stack: String(stack).slice(0, 4000),
      source: extra.source || "unknown",
      componentStack: String(extra.componentStack || "").slice(0, 2000),
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      at: new Date().toISOString(),
    };
    api.post("/client-errors", payload).catch(() => {});
  } catch {
    // never let reporting break the app
  }
}

/** Catch what no React error boundary sees: handlers, timers, promises. */
export function installGlobalErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    reportClientError(event.error || event.message, { source: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(event.reason, { source: "unhandledrejection" });
  });
}
