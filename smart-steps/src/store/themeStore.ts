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
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "light",
      resolved: "light",
      setTheme: (theme) => {
        const resolved = resolveTheme(theme);
        set({ theme, resolved });
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", resolved);
        }
      },
    }),
    {
      name: "smart-steps-theme",
      version: 1,
      // v0 shipped with dark as the default, so every browser has "dark"
      // persisted whether or not the user ever picked it. Reset those to the
      // new light default once; themes chosen in Settings from v1 on persist.
      migrate: () => ({ theme: "light" as Theme, resolved: "light" as const }),
    }
  )
);

// Hydrate resolved from the persisted choice + system preference on load,
// and re-resolve when the OS scheme changes while theme === "system".
if (typeof window !== "undefined") {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    const resolved = resolveTheme(useThemeStore.getState().theme);
    useThemeStore.setState({ resolved });
    document.documentElement.setAttribute("data-theme", resolved);
  };
  media.addEventListener("change", sync);
  sync();
}
