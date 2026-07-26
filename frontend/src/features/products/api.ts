// Product reads now come from the local Dexie cache (see features/products/
// hooks.ts), and writes go through the offline mutation queue (see
// features/products/mutations.ts). This module is just the shared write DTO.

export interface ProductInput {
  name: string;
  sku: string;
  barcode?: string | undefined;
  description?: string | undefined;
  price: string;
  costPrice?: string | undefined;
  status?: string | undefined;
  categoryId?: string | undefined;
  brandId?: string | undefined;
  unitId?: string | undefined;
  defaultWarehouseId?: string | undefined;
  initialStock?: string | undefined;
}
