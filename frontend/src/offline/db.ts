import Dexie, { type EntityTable } from "dexie";

import type { QueuedMutation } from "./types";

export interface SyncMetaRow {
  key: string;
  value: number;
}

export interface AuthSessionRow {
  key: "current";
  tenantId: string;
  refreshToken: string;
}

export interface ConflictRecord {
  id: string;
  entityType: string;
  entityId: string;
  serverRecord: Record<string, unknown>;
  detectedAt: string;
}

export interface LocalProduct {
  id: string;
  tenantId: string;
  version: number;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  price: string;
  costPrice: string | null;
  status: string;
  categoryId: string | null;
  brandId: string | null;
  unitId: string | null;
  defaultWarehouseId: string | null;
  updatedAt: string;
}

export interface LocalInventoryMovement {
  id: string;
  tenantId: string;
  version: number;
  productId: string;
  warehouseId: string;
  movementType: string;
  quantityDelta: number;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

class OfflineDatabase extends Dexie {
  mutationQueue!: EntityTable<QueuedMutation, "clientMutationId">;
  syncMeta!: EntityTable<SyncMetaRow, "key">;
  conflicts!: EntityTable<ConflictRecord, "id">;
  products!: EntityTable<LocalProduct, "id">;
  inventoryMovements!: EntityTable<LocalInventoryMovement, "id">;
  authSession!: EntityTable<AuthSessionRow, "key">;

  constructor() {
    super("erp-offline");
    this.version(1).stores({
      mutationQueue: "clientMutationId, entityType, entityId, status",
      syncMeta: "key",
      conflicts: "id, entityType, entityId",
    });
    this.version(2).stores({
      products: defineSyncableTable(["sku"]),
      inventoryMovements: defineSyncableTable(["productId"]),
    });
    this.version(3).stores({
      authSession: "key",
    });
    this.version(4).stores({
      // Re-declares inventoryMovements' index list with warehouseId added.
      // warehouses themselves are online-only reference data (like
      // categories/brands/units) — no offline Dexie table.
      inventoryMovements: defineSyncableTable(["productId", "warehouseId"]),
    });
    this.version(5).stores({
      products: defineSyncableTable(["sku", "defaultWarehouseId"]),
    });
  }
}

export const db = new OfflineDatabase();

/**
 * Builds the Dexie index string for a syncable entity's local table, so a
 * future feature module declares its own object store consistently:
 *
 *   db.version(2).stores({ products: defineSyncableTable(["sku"]) })
 *
 * Every syncable table is indexed by id/tenantId/version at minimum; extra
 * indexes are per-entity.
 */
export function defineSyncableTable(indexes: string[] = []): string {
  return ["id", "tenantId", "version", ...indexes].join(", ");
}
