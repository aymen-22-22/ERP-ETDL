import { AlertTriangleIcon, ArrowLeftIcon, CheckIcon, Trash2Icon } from "lucide-react";
import { useNavigate } from "react-router";

import { PageLoader } from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptServerVersion, resolveConflict, useConflicts } from "@/features/sync/hooks";

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function FieldRow({ label, server }: { label: string; server: unknown }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
      <span className="text-muted-foreground font-medium">{label}</span>
      <span className="bg-green-500/10 truncate rounded px-2 py-0.5">{formatValue(server)}</span>
    </div>
  );
}

export function ConflictsPage() {
  const navigate = useNavigate();
  const conflicts = useConflicts();

  if (conflicts === undefined) return <PageLoader />;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => void navigate(-1)}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold">Sync Conflicts</h1>
      </div>

      {conflicts.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            No conflicts — all mutations synced successfully.
          </CardContent>
        </Card>
      )}

      {conflicts.map((conflict) => (
        <ConflictCard
          key={conflict.id}
          conflict={conflict}
          onAcceptServer={() => void acceptServerVersion(conflict.id)}
          onDiscard={() => void resolveConflict(conflict.id)}
        />
      ))}
    </div>
  );
}

function ConflictCard({
  conflict,
  onAcceptServer,
  onDiscard,
}: {
  conflict: {
    id: string;
    entityType: string;
    entityId: string;
    serverRecord: Record<string, unknown>;
    detectedAt: string;
  };
  onAcceptServer: () => void;
  onDiscard: () => void;
}) {
  const serverFields = conflict.serverRecord;
  const fieldNames = Object.keys(serverFields).filter(
    (key) => !["id", "tenant_id", "version", "updated_at", "_payload_version"].includes(key),
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangleIcon className="text-destructive size-4" />
            {conflict.entityType.replace(/_/g, " ")}
          </CardTitle>
          <span className="text-muted-foreground text-xs">
            {new Date(conflict.detectedAt).toLocaleString()}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          ID: <code className="bg-muted rounded px-1">{conflict.entityId}</code>
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="text-muted-foreground grid grid-cols-[100px_1fr] gap-2 text-xs font-medium">
          <span>Field</span>
          <span className="text-green-600">Server value</span>
        </div>
        {fieldNames.map((key) => (
          <FieldRow key={key} label={key} server={serverFields[key]} />
        ))}
        <p className="text-muted-foreground text-xs">
          The server rejected your local change because the record was modified elsewhere. The
          server's current values are shown above.
        </p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={onAcceptServer}>
            <CheckIcon className="mr-1 size-3.5" />
            Accept Server
          </Button>
          <Button size="sm" variant="outline" onClick={onDiscard}>
            <Trash2Icon className="mr-1 size-3.5" />
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
