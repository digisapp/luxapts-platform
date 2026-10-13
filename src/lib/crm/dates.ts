// Calendar dates for follow-ups, in New York time on server and browser
// alike, so "due today" means the same day everywhere.

export const CRM_TIME_ZONE = "America/New_York";

const keyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CRM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-10-12" for an instant, in New York. */
export function nyDateKey(at: Date = new Date()): string {
  return keyFormatter.format(at);
}

/** The date key `days` after `key` (negative goes back). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both date keys). */
export function daysBetween(from: string, to: string): number {
  const ms = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** "Today", "Tomorrow", "Overdue 3d", "Thu", "Oct 30" for a due date. */
export function dueLabel(due: string, today: string): string {
  const diff = daysBetween(today, due);
  if (diff < 0) return `Overdue ${-diff}d`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  const [y, m, d] = due.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (diff < 7) {
    return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(y === Number(today.slice(0, 4)) ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(date);
}

/** Quick follow-up choices: label and the date key they set. */
export function followUpPresets(today: string): { label: string; due: string }[] {
  return [
    { label: "Today", due: today },
    { label: "Tomorrow", due: addDays(today, 1) },
    { label: "3 days", due: addDays(today, 3) },
    { label: "1 week", due: addDays(today, 7) },
    { label: "2 weeks", due: addDays(today, 14) },
    { label: "1 month", due: addDays(today, 30) },
  ];
}
