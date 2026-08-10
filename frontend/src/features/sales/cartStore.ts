import { create } from "zustand";

const STORAGE_KEY = "erp-pos-cart";

export interface CartLineDraft {
  productId: string;
  name: string;
  sku: string;
  /** Unit price in integer cents, captured when the line was added. */
  unitPriceCents: number;
  /** Only present for configurable products — the exact choices sold. */
  configuration?: Record<string, string>;
  /**
   * Only present for configurable lines: how many the chosen configuration
   * can build from stock, so the stepper can't exceed it (plain lines cap
   * against the warehouse stock instead).
   */
  maxQuantity?: number;
}

export interface CartLine extends CartLineDraft {
  /**
   * Unique identity of the line. Plain products key on the product id; a
   * configurable product has one line per distinct configuration, so two
   * different "Triangle Double 28/19 F3 GD 4m" vs "…F2 WH 2m" both belong to
   * the same product but must be separate sale lines.
   */
  key: string;
  quantity: number;
}

export function cartLineKey(productId: string, configuration?: Record<string, string>): string {
  if (!configuration) return productId;
  const parts = Object.keys(configuration)
    .sort()
    .map((key) => `${key}=${configuration[key]}`);
  return `${productId}:${parts.join("|")}`;
}

interface PersistedCart {
  storeId: string | null;
  lines: CartLine[];
}

interface CartState extends PersistedCart {
  setStore: (storeId: string) => void;
  /** Adds one unit, or increments an existing line. */
  addItem: (item: CartLineDraft) => void;
  setQuantity: (key: string, quantity: number) => void;
  /** Override the charged unit price — the cashier discounts a line for a client. */
  setUnitPrice: (key: string, unitPriceCents: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
}

function load(): PersistedCart {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { storeId: null, lines: [] };
    const parsed = JSON.parse(raw) as PersistedCart;
    return {
      storeId: parsed.storeId ?? null,
      // Carts saved before configurable products existed have no `key`.
      lines: (parsed.lines ?? []).map((line) => ({
        ...line,
        key: line.key ?? cartLineKey(line.productId, line.configuration),
      })),
    };
  } catch {
    return { storeId: null, lines: [] };
  }
}

function persist(state: PersistedCart): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        storeId: state.storeId,
        lines: state.lines,
      }),
    );
  } catch {
    // Private-mode / quota failures shouldn't break the till.
  }
}

/**
 * The open sale.
 *
 * Persisted to localStorage so an accidental reload mid-sale doesn't lose a
 * half-rung basket — the realistic failure mode when someone is working on a
 * phone. Unit price is snapshotted onto the line at add-time, so editing a
 * product's price mid-sale can't silently repriced what's already scanned.
 */
export const useCartStore = create<CartState>((set, get) => ({
  ...load(),

  setStore: (storeId) => {
    // Switching store invalidates the basket: stock and availability are
    // per-warehouse, so carrying lines across would let you sell from the
    // wrong place.
    const next = { ...get(), storeId, lines: [] };
    set({ storeId, lines: [] });
    persist(next);
  },

  addItem: (item) => {
    const lines = [...get().lines];
    const key = cartLineKey(item.productId, item.configuration);
    const existing = lines.findIndex((l) => l.key === key);
    if (existing >= 0) {
      const current = lines[existing];
      if (current) lines[existing] = { ...current, quantity: current.quantity + 1 };
    } else {
      lines.push({ ...item, key, quantity: 1 });
    }
    set({ lines });
    persist({ ...get(), lines });
  },

  setQuantity: (key, quantity) => {
    const lines =
      quantity <= 0
        ? get().lines.filter((l) => l.key !== key)
        : get().lines.map((l) => (l.key === key ? { ...l, quantity } : l));
    set({ lines });
    persist({ ...get(), lines });
  },

  setUnitPrice: (key, unitPriceCents) => {
    const lines = get().lines.map((l) =>
      l.key === key ? { ...l, unitPriceCents: Math.max(0, unitPriceCents) } : l,
    );
    set({ lines });
    persist({ ...get(), lines });
  },

  removeLine: (key) => {
    const lines = get().lines.filter((l) => l.key !== key);
    set({ lines });
    persist({ ...get(), lines });
  },

  clear: () => {
    set({ lines: [] });
    persist({ ...get(), lines: [] });
  },
}));

/** Subtotal and item count. Each line carries its own charged unit price (the
 *  cashier can discount one), so totals are just quantity × that price. */
export function computeTotals(lines: CartLine[]): {
  subtotalCents: number;
  totalCents: number;
  itemCount: number;
} {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  return { subtotalCents, totalCents: subtotalCents, itemCount };
}
