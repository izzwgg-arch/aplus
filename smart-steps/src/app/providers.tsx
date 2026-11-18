"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { useState } from "react";
import { useThemeStore } from "@/store/themeStore";

export function Providers({ children }: { children: React.ReactNode }) {
  const resolved = useThemeStore((s) => s.resolved);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30 * 1000, refetchOnWindowFocus: false },
        },
      })
  );
  return (
    <SessionProvider basePath="/smart-steps/api/auth">
      <QueryClientProvider client={client}>
        {children}
        <Toaster richColors position="top-center" theme={resolved} />
      </QueryClientProvider>
    </SessionProvider>
  );
}
