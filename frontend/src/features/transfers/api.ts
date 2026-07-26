import { apiFetch, apiFetchPaginated } from "@/services/api/client";

export type TransferStatus = "draft" | "pending" | "approved" | "completed" | "cancelled";

export interface TransferLine {
  id: string;
  product_id: string;
  quantity: number;
}

export interface Transfer {
  id: string;
  tenant_id: string;
  source_warehouse_id: string;
  dest_warehouse_id: string;
  status: TransferStatus;
  requested_by: string | null;
  approved_by: string | null;
  note: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  lines: TransferLine[];
}

export interface TransferLineInput {
  productId: string;
  quantity: number;
}

export interface TransferCreateInput {
  sourceWarehouseId: string;
  destWarehouseId: string;
  note?: string | undefined;
  lines: TransferLineInput[];
}

function toLinesPayload(lines: TransferLineInput[]): { product_id: string; quantity: number }[] {
  return lines.map((l) => ({ product_id: l.productId, quantity: l.quantity }));
}

export async function listTransfers(status?: TransferStatus): Promise<Transfer[]> {
  const query = status ? `?status=${status}&page_size=200` : "?page_size=200";
  const result = await apiFetchPaginated<Transfer>(`/api/v1/transfers${query}`);
  return result.data;
}

export async function getTransfer(id: string): Promise<Transfer> {
  return apiFetch<Transfer>(`/api/v1/transfers/${id}`);
}

export async function createTransfer(input: TransferCreateInput): Promise<Transfer> {
  return apiFetch<Transfer>("/api/v1/transfers", {
    method: "POST",
    body: JSON.stringify({
      source_warehouse_id: input.sourceWarehouseId,
      dest_warehouse_id: input.destWarehouseId,
      note: input.note || null,
      lines: toLinesPayload(input.lines),
    }),
  });
}

export async function updateTransferLines(
  id: string,
  lines: TransferLineInput[],
): Promise<Transfer> {
  return apiFetch<Transfer>(`/api/v1/transfers/${id}/lines`, {
    method: "PATCH",
    body: JSON.stringify({ lines: toLinesPayload(lines) }),
  });
}

export async function submitTransfer(id: string): Promise<Transfer> {
  return apiFetch<Transfer>(`/api/v1/transfers/${id}/submit`, { method: "POST" });
}

export async function approveTransfer(id: string): Promise<Transfer> {
  return apiFetch<Transfer>(`/api/v1/transfers/${id}/approve`, { method: "POST" });
}

export async function completeTransfer(id: string): Promise<Transfer> {
  return apiFetch<Transfer>(`/api/v1/transfers/${id}/complete`, { method: "POST" });
}

export async function cancelTransfer(id: string): Promise<Transfer> {
  return apiFetch<Transfer>(`/api/v1/transfers/${id}/cancel`, { method: "POST" });
}
