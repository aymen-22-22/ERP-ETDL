import { useMemo } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function shortDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function GreetingSection() {
  const today = useMemo(() => new Date(), []);

  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg leading-6 font-semibold tracking-tight">
          {greeting(today)}
        </h1>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          Here&apos;s what&apos;s happening today
        </p>
      </div>
      <div className="text-muted-foreground shrink-0 text-xs font-medium whitespace-nowrap">
        {shortDate(today)}
      </div>
    </div>
  );
}
