import "server-only";
import { APP_TZ } from "@/lib/utils";
import { AppError } from "@/server/errors";

/** Business-timezone wall-clock time → instant. Date-only input means 09:00 in the business timezone. */
export function zonedTimeToDate(input: string): Date {
  const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
  if (!m) {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) throw new AppError(`“${input}” is not a valid date. Use YYYY-MM-DD or YYYY-MM-DD HH:mm.`);
    return d;
  }
  const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 9), Number(m[5] ?? 0)];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asLocal - guess));
}

/** The calendar day (YYYY-MM-DD) an instant falls on in the business timezone. */
export function tzYmd(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** YYYY-MM-DD plus a number of days (calendar arithmetic, timezone-free). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Midnight at the start of a business-timezone calendar day. */
export const dayStart = (ymd: string) => zonedTimeToDate(`${ymd} 00:00`);

/** Monday of the week containing the given day. */
export function weekStart(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(ymd, -dow);
}

export type DateBound = { at: Date; /** true when a whole calendar day was given (so “on or before D” means before the next midnight) */ wholeDay: boolean };

/**
 * A date the model or a user gave: YYYY-MM-DD (a whole business day), YYYY-MM-DD HH:mm, or a keyword —
 * today, yesterday, tomorrow, now, start_of_week, start_of_month, start_of_year, start_of_last_month, or "N_days_ago".
 */
export function parseDateToken(input: string, now = new Date()): DateBound {
  const t = input.trim().toLowerCase().replace(/\s+/g, "_");
  const today = tzYmd(now);
  if (t === "now") return { at: now, wholeDay: false };
  if (t === "today") return { at: dayStart(today), wholeDay: true };
  if (t === "yesterday") return { at: dayStart(addDays(today, -1)), wholeDay: true };
  if (t === "tomorrow") return { at: dayStart(addDays(today, 1)), wholeDay: true };
  if (t === "start_of_week") return { at: dayStart(weekStart(today)), wholeDay: true };
  if (t === "start_of_month") return { at: dayStart(`${today.slice(0, 7)}-01`), wholeDay: true };
  if (t === "start_of_last_month") {
    const [y, m] = today.split("-").map(Number) as [number, number];
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    return { at: dayStart(`${prev}-01`), wholeDay: true };
  }
  if (t === "start_of_year") return { at: dayStart(`${today.slice(0, 4)}-01-01`), wholeDay: true };
  const ago = t.match(/^(\d{1,4})_?d(?:ays?)?_ago$/);
  if (ago) return { at: new Date(now.getTime() - Number(ago[1]) * 86_400_000), wholeDay: false };
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { at: dayStart(t), wholeDay: true };
  return { at: zonedTimeToDate(input), wholeDay: false };
}
