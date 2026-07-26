import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/lib/toast";
import { ApiError } from "@/services/api/client";

import type { Transfer, TransferCreateInput, TransferStatus } from "./api";
import {
  approveTransfer,
  cancelTransfer,
  completeTransfer,
  createTransfer,
  getTransfer,
  listTransfers,
  submitTransfer,
} from "./api";

const LIST_KEY = ["transfers"] as const;
const detailKey = (id: string) => ["transfers", id] as const;

export function useTransfers(status?: TransferStatus) {
  return useQuery({
    queryKey: [...LIST_KEY, status ?? "all"],
    queryFn: () => listTransfers(status),
  });
}

export function useTransfer(id: string) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getTransfer(id), enabled: !!id });
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "insufficient_stock") return "Not enough stock at the source warehouse.";
    if (error.code === "invalid_transfer_status") return "That action isn't valid right now.";
    if (error.code === "warehouse_inactive") return "One of the warehouses is not active.";
    if (error.code === "transfer_not_transferable") return "That warehouse doesn't allow transfers.";
    if (error.code === "permission_denied") return "You don't have permission for that.";
  }
  return "Something went wrong. Please try again.";
}

function useTransferAction(
  action: (id: string) => Promise<Transfer>,
  successTitle: string,
  failTitle: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (transfer) => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: detailKey(transfer.id) });
      toast({ title: successTitle });
    },
    onError: (error) =>
      toast({ title: failTitle, description: errorMessage(error), variant: "destructive" }),
  });
}

export function useCreateTransferMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferCreateInput) => createTransfer(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      toast({ title: "Transfer created" });
    },
    onError: (error) =>
      toast({ title: "Create failed", description: errorMessage(error), variant: "destructive" }),
  });
}

export function useSubmitTransferMutation() {
  return useTransferAction(submitTransfer, "Transfer submitted", "Submit failed");
}

export function useApproveTransferMutation() {
  return useTransferAction(approveTransfer, "Transfer approved", "Approve failed");
}

export function useCompleteTransferMutation() {
  return useTransferAction(completeTransfer, "Transfer completed", "Complete failed");
}

export function useCancelTransferMutation() {
  return useTransferAction(cancelTransfer, "Transfer cancelled", "Cancel failed");
}
