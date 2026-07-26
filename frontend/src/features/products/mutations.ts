import { v7 as uuidv7 } from "uuid";

import { db } from "@/offline/db";
import { type SubmitOutcome, submitMutation } from "@/offline/submit";
import { useAuthStore } from "@/store/authStore";

import type { ProductInput } from "./api";

const ENTITY_TYPE = "product";

function currentTenantId(): string {
  return useAuthStore.getState().tenantId ?? "";
}

function cleanInput(input: ProductInput): Record<string, unknown> {
  return {
    name: input.name,
    sku: input.sku,
    barcode: input.barcode || null,
    description: input.description || null,
    price: input.price,
    cost_price: input.costPrice || null,
    status: input.status ?? "active",
    category_id: input.categoryId || null,
    brand_id: input.brandId || null,
    unit_id: input.unitId || null,
    default_warehouse_id: input.defaultWarehouseId || null,
    initial_stock: input.initialStock ? Number(input.initialStock) : null,
  };
}

// Each write applies optimistically to the local Dexie cache first (so the
// UI, which reads from Dexie, reflects it instantly — online or offline),
// then enqueues + drains. On a version conflict the server's truth is pulled
// back over the optimistic row during runSync's pull phase.

export async function submitCreateProduct(input: ProductInput): Promise<SubmitOutcome> {
  const id = uuidv7();
  const cleaned = cleanInput(input);
  await db.products.put({
    id,
    tenantId: currentTenantId(),
    version: 1,
    name: cleaned.name as string,
    sku: cleaned.sku as string,
    barcode: cleaned.barcode as string | null,
    description: cleaned.description as string | null,
    price: cleaned.price as string,
    costPrice: cleaned.cost_price as string | null,
    status: (cleaned.status as string) ?? "active",
    categoryId: cleaned.category_id as string | null,
    brandId: cleaned.brand_id as string | null,
    unitId: cleaned.unit_id as string | null,
    defaultWarehouseId: cleaned.default_warehouse_id as string | null,
    updatedAt: new Date().toISOString(),
  });
  return submitMutation({
    entityType: ENTITY_TYPE,
    entityId: id,
    operation: "create",
    baseVersion: null,
    payload: { id, ...cleaned },
  });
}

export async function submitUpdateProduct(
  productId: string,
  baseVersion: number,
  input: ProductInput,
): Promise<SubmitOutcome> {
  const cleaned = cleanInput(input);
  await db.products.update(productId, {
    name: cleaned.name as string,
    sku: cleaned.sku as string,
    barcode: cleaned.barcode as string | null,
    description: cleaned.description as string | null,
    price: cleaned.price as string,
    costPrice: cleaned.cost_price as string | null,
    status: (cleaned.status as string) ?? "active",
    categoryId: cleaned.category_id as string | null,
    brandId: cleaned.brand_id as string | null,
    unitId: cleaned.unit_id as string | null,
    defaultWarehouseId: cleaned.default_warehouse_id as string | null,
    updatedAt: new Date().toISOString(),
  });
  return submitMutation({
    entityType: ENTITY_TYPE,
    entityId: productId,
    operation: "update",
    baseVersion,
    payload: { ...cleaned },
  });
}

export async function submitDeleteProduct(
  productId: string,
  baseVersion: number,
): Promise<SubmitOutcome> {
  await db.products.delete(productId);
  return submitMutation({
    entityType: ENTITY_TYPE,
    entityId: productId,
    operation: "delete",
    baseVersion,
    payload: {},
  });
}
