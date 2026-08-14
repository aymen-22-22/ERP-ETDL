import { useQuery } from "@tanstack/react-query";

import { listActivityLogs, listErrorLogs } from "./api";

const ACTIVITY_KEY = "activity-log" as const;
const ERRORS_KEY = "error-log" as const;

export function useActivityLog(page = 1, pageSize = 50, entityType?: string) {
  return useQuery({
    queryKey: [ACTIVITY_KEY, page, pageSize, entityType],
    queryFn: () => listActivityLogs(page, pageSize, entityType),
  });
}

export function useErrorLog(page = 1, pageSize = 50) {
  return useQuery({
    queryKey: [ERRORS_KEY, page, pageSize],
    queryFn: () => listErrorLogs(page, pageSize),
  });
}
