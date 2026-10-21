"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Same basePath trap as the manifest: "/sw.js" resolved to the A+
      // Scheduling SPA, which returns HTML, so registration always threw and
      // the empty catch hid it — the Tracker's service worker had never
      // actually registered in production.
      navigator.serviceWorker
        .register("/smart-steps/sw.js", { scope: "/smart-steps/" })
        .catch(() => {});
    }
  }, []);
  return null;
}
