import { create } from "zustand";

const STORAGE_KEY = "erp-selected-warehouse-id";

interface WarehouseSelectionState {
  selectedWarehouseId: string | null;
  setSelectedWarehouseId: (id: string) => void;
}

/** Persists to localStorage directly (sync, unlike the IndexedDB-backed
 * authStore) since this is just a UI preference, not session data that
 * needs to survive alongside offline mutation state. */
export const useWarehouseStore = create<WarehouseSelectionState>((set) => ({
  selectedWarehouseId: localStorage.getItem(STORAGE_KEY),
  setSelectedWarehouseId: (id) => {
    localStorage.setItem(STORAGE_KEY, id);
    set({ selectedWarehouseId: id });
  },
}));
