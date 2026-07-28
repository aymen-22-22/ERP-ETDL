import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

// `| undefined` is explicit on every optional prop because the project runs
// `exactOptionalPropertyTypes`: without it, callers can omit a prop but cannot
// pass one through that happens to be undefined.
export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string | undefined;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string | undefined;
  searchPlaceholder?: string | undefined;
  emptyText?: string | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const needle = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) ||
        (o.description && o.description.toLowerCase().includes(needle)),
    );
  }, [options, search]);

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val === value ? null : val);
      setOpen(false);
      setSearch("");
    },
    [onChange, value],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "border-input bg-background flex h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-base transition-colors outline-none md:h-9 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-2",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-ring ring-ring/50 ring-2",
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={cn("size-4 opacity-50 transition-transform", open && "rotate-180")}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="bg-popover text-popover-foreground absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          <div className="p-1">
            <Input
              ref={inputRef}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div role="listbox" className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="text-muted-foreground py-3 text-center text-sm">{emptyText}</p>
            )}
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "flex min-h-11 w-full flex-col justify-center rounded-sm px-2 py-2 text-left text-sm outline-none",
                  "hover:bg-accent hover:text-accent-foreground",
                  option.value === value && "bg-accent font-medium",
                )}
              >
                <span className="truncate">{option.label}</span>
                {option.description && (
                  <span className="text-muted-foreground truncate text-xs">
                    {option.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
