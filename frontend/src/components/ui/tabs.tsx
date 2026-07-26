import { createContext, useCallback, useContext, useId, useRef } from "react";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal accessible tabs — hand-rolled rather than pulling in
 * `@radix-ui/react-tabs`, since this is the only place the app needs tabs and
 * the accessible behaviour is small enough to own.
 *
 * Implements the WAI-ARIA tabs pattern: roving tabindex (only the active tab is
 * focusable), Arrow/Home/End key navigation with wraparound, and correct
 * `aria-controls` / `aria-labelledby` wiring between tab and panel.
 */

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error(`${component} must be used inside <Tabs>`);
  return context;
}

const tabId = (baseId: string, value: string) => `${baseId}-tab-${value}`;
const panelId = (baseId: string, value: string) => `${baseId}-panel-${value}`;

interface TabsProps extends Omit<React.ComponentProps<"div">, "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
}

function Tabs({ value, onValueChange, className, ...props }: TabsProps) {
  const baseId = useId();
  return (
    <TabsContext.Provider value={{ value, onValueChange, baseId }}>
      <div data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  const listRef = useRef<HTMLDivElement>(null);

  // Arrow-key navigation across the tabs, per the ARIA tabs pattern.
  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const tabs = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? [],
    );
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
    let nextIndex: number;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;

    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  }, []);

  return (
    <div
      ref={listRef}
      role="tablist"
      data-slot="tabs-list"
      onKeyDown={onKeyDown}
      className={cn(
        "bg-muted text-muted-foreground inline-flex w-full items-center gap-1 rounded-lg p-1 sm:w-auto",
        className,
      )}
      {...props}
    />
  );
}

interface TabsTriggerProps extends React.ComponentProps<"button"> {
  value: string;
}

function TabsTrigger({ value, className, ...props }: TabsTriggerProps) {
  const { value: active, onValueChange, baseId } = useTabs("TabsTrigger");
  const isActive = active === value;

  return (
    <button
      type="button"
      role="tab"
      id={tabId(baseId, value)}
      aria-selected={isActive}
      aria-controls={panelId(baseId, value)}
      // Roving tabindex: Tab enters the tablist once, arrows move within it.
      tabIndex={isActive ? 0 : -1}
      data-state={isActive ? "active" : "inactive"}
      onClick={() => onValueChange(value)}
      className={cn(
        "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors sm:flex-initial",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
        "disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-background text-foreground shadow-xs"
          : "hover:text-foreground hover:bg-background/50",
        className,
      )}
      {...props}
    />
  );
}

interface TabsContentProps extends React.ComponentProps<"div"> {
  value: string;
}

function TabsContent({ value, className, ...props }: TabsContentProps) {
  const { value: active, baseId } = useTabs("TabsContent");
  if (active !== value) return null;

  return (
    <div
      role="tabpanel"
      id={panelId(baseId, value)}
      aria-labelledby={tabId(baseId, value)}
      tabIndex={0}
      data-slot="tabs-content"
      className={cn("focus-visible:ring-ring/50 outline-none focus-visible:ring-2", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
