import { FileQuestionIcon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <FileQuestionIcon className="text-muted-foreground size-10" />
      <div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The page you're looking for doesn't exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
