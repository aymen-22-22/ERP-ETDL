import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Toaster } from "@/components/Toaster";
import { ApiError } from "@/services/api/client";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx (bad request, not found, forbidden, ...) is deterministic --
      // retrying it just repeats the same failure and spams the network/
      // console for no benefit. Only retry when the failure might be
      // transient (network error, 5xx), and only up to 3 times.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 3;
      },
    },
  },
});

/**
 * Wiring point for app-wide providers. `Toaster` (Milestone 4) and the
 * TanStack `QueryClient` (Milestone 2, first real consumer: auth mutations)
 * live here so any feature module can use them without each importing its
 * own provider.
 */
export function AppShellProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
