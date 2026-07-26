import { ServerCrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ServerErrorPageProps {
  message?: string;
  onRetry?: () => void;
}

/**
 * The default shape ErrorBoundary falls back to, also usable standalone as a
 * route element for a 500 response from a data loader.
 */
export function ServerErrorPage({ message, onRetry }: ServerErrorPageProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <ServerCrashIcon className="text-muted-foreground size-10" />
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          {message ?? "An unexpected error occurred. Please try again."}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
