import type { ReactNode } from "react";

// Parent portal is publicly accessible (read-only) — no auth wrapper
export default function ParentLayout({ children }: { children: ReactNode }) {
  return children;
}
