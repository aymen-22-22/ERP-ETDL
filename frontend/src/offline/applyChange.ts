import { db } from "./db";
import type { ChangeRecord } from "./types";

// Each snapshot is the full server row (snake_case). A snapshot whose
// deleted_at is set is a tombstone -> remove the local row. Otherwise upsert.

function isTombstone(payload: Record<string, unknown>): boolean {
  return payload.deleted_at != null;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  return asString(value);
}

async function applyProduct(change: ChangeRecord): Promise<void> {
  const p = change.payload;
  if (isTombstone(p)) {
    await db.products.delete(change.entityId);
    return;
  }
  await db.products.put({
    id: String(p.id),
    tenantId: String(p.tenant_id),
    version: Number(p.version),
    name: String(p.name),
    sku: String(p.sku),
    barcode: (p.barcode as string | null) ?? null,
    description: (p.description as string | null) ?? null,
    price: String(p.price),
    costPrice: asNullableString(p.cost_price),
    status: asString(p.status, "active"),
    categoryId: (p.category_id as string | null) ?? null,
    brandId: (p.brand_id as string | null) ?? null,
    unitId: (p.unit_id as string | null) ?? null,
    defaultWarehouseId: (p.default_warehouse_id as string | null) ?? null,
    updatedAt: String(p.updated_at),
  });
}

async function applyMovement(change: ChangeRecord): Promise<void> {
  const m = change.payload;
  if (isTombstone(m)) {
    await db.inventoryMovements.delete(change.entityId);
    return;
  }
  await db.inventoryMovements.put({
    id: String(m.id),
    tenantId: String(m.tenant_id),
    version: Number(m.version),
    productId: String(m.product_id),
    warehouseId: String(m.warehouse_id),
    movementType: String(m.movement_type),
    quantityDelta: Number(m.quantity_delta),
    referenceId: (m.reference_id as string | null) ?? null,
    note: (m.note as string | null) ?? null,
    createdAt: String(m.created_at),
    updatedAt: String(m.updated_at),
  });
}

/** Routes a pulled change to the local table for its entity type. Unknown
 * entity types are ignored (a newer server may emit types this client build
 * doesn't cache yet). */
export async function applyChange(change: ChangeRecord): Promise<void> {
  if (change.entityType === "product") {
    await applyProduct(change);
  } else if (change.entityType === "inventory_movement") {
    await applyMovement(change);
  }
}
