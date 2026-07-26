import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Toaster } from "@/components/Toaster";

const queryClient = new QueryClient();

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
