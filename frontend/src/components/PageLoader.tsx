import { Spinner } from "@/components/ui/spinner";

/**
 * Default React.Suspense fallback for route-level lazy loading (code
 * splitting per the architecture's routing convention). Full-viewport so it
 * reads as "the page is loading," not "a widget is loading."
 */
export function PageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
