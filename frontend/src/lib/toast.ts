import { useToastStore } from "@/store/toastStore";
import type { ToastVariant } from "@/store/toastStore";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

const DEFAULT_DURATION_MS = 5000;

/**
 * Callable from anywhere — components, mutation error handlers, the future
 * sync engine — not just inside a React render. Renders through `<Toaster />`
 * mounted once in AppShellProvider.
 */
export function toast({ title, description, variant = "default", duration }: ToastOptions): string {
  return useToastStore.getState().addToast({
    title,
    description,
    variant,
    duration: duration ?? DEFAULT_DURATION_MS,
  });
}
