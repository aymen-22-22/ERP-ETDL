import { useWarehouses } from "./hooks";

const selectClass =
  "border-input bg-background ring-offset-background flex h-10 rounded-md border px-3 py-2 text-sm";

interface WarehouseSelectorProps {
  value: string | null;
  onChange: (warehouseId: string) => void;
  activeOnly?: boolean;
  className?: string;
}

export function WarehouseSelector({
  value,
  onChange,
  activeOnly = true,
  className,
}: WarehouseSelectorProps) {
  const { data: warehouses } = useWarehouses();
  const options = activeOnly ? (warehouses ?? []).filter((w) => w.is_active) : (warehouses ?? []);

  return (
    <select
      className={className ? `${selectClass} ${className}` : selectClass}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        Select warehouse…
      </option>
      {options.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
          {w.is_default ? " (default)" : ""}
        </option>
      ))}
    </select>
  );
}
