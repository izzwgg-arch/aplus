// Theme: dark | light | system — 2026 polish
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "dark" | "light";
}

function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return theme;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      resolved: "dark",
      setTheme: (theme) => {
        const resolved = theme === "system"
          ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
          : theme;
        set({ theme, resolved });
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", resolved);
        }
      },
    }),
    { name: "smart-steps-theme" }
  )
);

// Hydrate resolved from system on load
if (typeof window !== "undefined") {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const sync = () => {
    useThemeStore.setState((s) => ({
      resolved: s.theme === "system" ? (media.matches ? "light" : "dark") : s.theme,
    }));
  };
  media.addEventListener("change", sync);
  sync();
}
