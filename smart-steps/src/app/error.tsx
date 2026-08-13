"use client";

import { useEffect, useState } from "react";

/**
 * Root error boundary — catches any render/render-effect error thrown by the
 * `(main)` layout or any page below it (dashboard, clients, goals, etc.).
 *
 * Why this exists: without an error.tsx anywhere in the app, an uncaught
 * client exception on ANY page bubbles all the way up to Next's implicit
 * root boundary, which tears down the whole React tree and shows the bare
 * "Application error: a client-side exception has occurred" screen. That
 * screen can't recover itself — only a full page reload fixes it.
 *
 * The most common trigger in production: the user has a tab open from
 * before a new deploy went out. Clicking a sidebar link (soft/client-side
 * navigation) tries to lazy-load that route's JS chunk using the OLD build's
 * manifest still in memory, but the server now only has the NEW build's
 * files — the chunk 404s and throws a ChunkLoadError. A hard reload fetches
 * the current HTML/manifest and "fixes" it, which matches exactly what
 * users report ("I have to reload to get the page"). We detect that case
 * and reload automatically instead of making the user do it.
 */
function isStaleBuildError(error: Error) {
  const msg = `${error?.message || ""} ${error?.name || ""}`;
  return (
    /Loading chunk [\w.-]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

const RELOAD_GUARD_KEY = "smartsteps:last-auto-reload";

export default function GlobalPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error(error);

    if (isStaleBuildError(error) && typeof window !== "undefined") {
      // Guard against a reload loop if the server is genuinely down / the
      // chunk is missing for a non-deploy reason — only auto-reload once
      // every 10s per tab.
      const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
        setReloading(true);
        window.location.reload();
      }
    }
  }, [error]);

  if (isStaleBuildError(error)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-cyan)] border-t-transparent" />
        <p className="text-sm text-zinc-400">
          {reloading ? "Loading the latest version…" : "A newer version is available."}
        </p>
        {!reloading && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold"
          >
            Reload
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-semibold text-[var(--foreground)]">Something went wrong</p>
      <p className="max-w-md text-sm text-zinc-500">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl border border-[var(--glass-border)] px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:text-[var(--foreground)] transition-colors"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
