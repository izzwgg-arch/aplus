"use client";

import { useEffect, useState } from "react";

/**
 * Catches errors thrown by the ROOT layout itself (e.g. Providers,
 * RegisterSW) — errors below that are caught by `error.tsx` instead.
 * Must render its own <html>/<body> since the root layout is unmounted.
 * See error.tsx for why we auto-reload on stale-build chunk errors.
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

const RELOAD_GUARD_KEY = "smartsteps:last-auto-reload-global";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error(error);
    if (typeof window === "undefined") return;

    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (isStaleBuildError(error) && Date.now() - last > 10_000) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      setReloading(true);
      window.location.reload();
    }
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body style={{ background: "#0a0a0a", color: "#ededed", fontFamily: "sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "14px", color: "#a1a1aa" }}>
            {reloading || isStaleBuildError(error)
              ? "Loading the latest version…"
              : error.message || "Something went wrong."}
          </p>
          {!reloading && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                borderRadius: "12px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                background: "#22d3ee",
                color: "#0a0a0a",
                border: "none",
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
