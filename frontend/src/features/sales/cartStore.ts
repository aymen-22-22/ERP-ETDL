import { create } from "zustand";

const STORAGE_KEY = "erp-pos-cart";

export interface CartLine {
  productId: string;
  name: string;
  sku: string;
  /** Unit price in integer cents, captured when the line was added. */
  unitPriceCents: number;
  quantity: number;
}

export type DiscountMode = "amount" | "percent";

interface PersistedCart {
  storeId: string | null;
  lines: CartLine[];
  discountInput: string;
  discountMode: DiscountMode;
}

interface CartState extends PersistedCart {
  setStore: (storeId: string) => void;
  /** Adds one unit, or increments an existing line. */
  addItem: (item: Omit<CartLine, "quantity">) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeLine: (productId: string) => void;
  setDiscountInput: (value: string) => void;
  setDiscountMode: (mode: DiscountMode) => void;
  clear: () => void;
}

function load(): PersistedCart {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { storeId: null, lines: [], discountInput: "", discountMode: "amount" };
    return JSON.parse(raw) as PersistedCart;
  } catch {
    return { storeId: null, lines: [], discountInput: "", discountMode: "amount" };
  }
}

function persist(state: PersistedCart): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        storeId: state.storeId,
        lines: state.lines,
        discountInput: state.discountInput,
        discountMode: state.discountMode,
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
    const existing = lines.findIndex((l) => l.productId === item.productId);
    if (existing >= 0) {
      const current = lines[existing];
      if (current) lines[existing] = { ...current, quantity: current.quantity + 1 };
    } else {
      lines.push({ ...item, quantity: 1 });
    }
    set({ lines });
    persist({ ...get(), lines });
  },

  setQuantity: (productId, quantity) => {
    const lines =
      quantity <= 0
        ? get().lines.filter((l) => l.productId !== productId)
        : get().lines.map((l) => (l.productId === productId ? { ...l, quantity } : l));
    set({ lines });
    persist({ ...get(), lines });
  },

  removeLine: (productId) => {
    const lines = get().lines.filter((l) => l.productId !== productId);
    set({ lines });
    persist({ ...get(), lines });
  },

  setDiscountInput: (discountInput) => {
    set({ discountInput });
    persist({ ...get(), discountInput });
  },

  setDiscountMode: (discountMode) => {
    set({ discountMode });
    persist({ ...get(), discountMode });
  },

  clear: () => {
    set({ lines: [], discountInput: "" });
    persist({ ...get(), lines: [], discountInput: "" });
  },
}));

/** Subtotal, discount and total in cents, clamped so a total can't go negative. */
export function computeTotals(
  lines: CartLine[],
  discountInput: string,
  discountMode: DiscountMode,
): { subtotalCents: number; discountCents: number; totalCents: number; itemCount: number } {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  const raw = Number(discountInput);
  const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
  const requested =
    discountMode === "percent"
      ? Math.round((subtotalCents * Math.min(value, 100)) / 100)
      : Math.round(value * 100);

  const discountCents = Math.min(requested, subtotalCents);
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents, itemCount };
}
