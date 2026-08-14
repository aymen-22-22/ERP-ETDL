import { apiFetchPaginated } from "@/services/api/client";

export interface ActivityLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: "create" | "update" | "delete";
  message: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ErrorLogEntry {
  id: string;
  level: string;
  code: string;
  message: string;
  path: string | null;
  method: string | null;
  traceback: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface LogList<T> {
  data: T[];
  meta: { page: number; page_size: number; total: number; pages: number };
}

export async function listActivityLogs(
  page = 1,
  pageSize = 50,
  entityType?: string,
): Promise<LogList<ActivityLogEntry>> {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("page_size", String(pageSize));
  if (entityType) q.set("entity_type", entityType);
  return apiFetchPaginated<ActivityLogEntry>(`/v1/logs/activity?${q.toString()}`);
}

export async function listErrorLogs(page = 1, pageSize = 50): Promise<LogList<ErrorLogEntry>> {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("page_size", String(pageSize));
  return apiFetchPaginated<ErrorLogEntry>(`/v1/logs/errors?${q.toString()}`);
}
