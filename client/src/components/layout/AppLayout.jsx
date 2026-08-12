import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);
  const routeKey = `${location.pathname}${location.search}`;

  // Persist <main> scroll per route. On scroll we save; on route return we restore.
  // CRITICAL: cleanup must NOT re-save because by that time <Outlet> has swapped
  // content and the browser has already clamped scrollTop to 0.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const key = `route-scroll:${routeKey}`;
    const save = () => sessionStorage.setItem(key, String(el.scrollTop));
    el.addEventListener("scroll", save, { passive: true });
    return () => {
      el.removeEventListener("scroll", save);
      // Do NOT call save() here — content has already changed, scrollTop is 0.
    };
  }, [routeKey]);

  // Restore scroll for this route. We try multiple times because the Outlet's
  // lazy child may not have rendered enough content yet on the first frame.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const key = `route-scroll:${routeKey}`;
    const saved = Number(sessionStorage.getItem(key) || "0");
    if (saved <= 0) return;
    const apply = () => { el.scrollTop = saved; };
    // Try at increasing delays to cover lazy-loaded content + data fetch
    const timers = [
      setTimeout(apply, 0),
      setTimeout(apply, 100),
      setTimeout(apply, 300),
      setTimeout(apply, 600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [routeKey]);

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <Sidebar open={open} setOpen={setOpen} />
      {open && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 bg-slate-900/20 md:hidden"
        />
      )}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden md:ml-56">
        <Topbar onMenuClick={() => setOpen(true)} />
        <main ref={mainRef} id="app-main-scroll" className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
