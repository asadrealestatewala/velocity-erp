import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNowStrict } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalise a phone number for duplicate matching.
 * Strips formatting, converts international "00" prefix and local trunk "0" prefix
 * into the default country code (Pakistan, 92, unless configured otherwise).
 */
export function normalizePhone(raw: string | null | undefined, countryCode = "92"): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = countryCode + digits.slice(1);
  digits = digits.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return v.includes("@") ? v : null;
}

export function fullName(c: { firstName?: string | null; lastName?: string | null } | null | undefined) {
  if (!c) return "";
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Business timezone used for every displayed date — identical on server and client (no hydration drift). */
export const APP_TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Karachi";
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: APP_TZ });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: APP_TZ });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: APP_TZ });

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return dateFmt.format(new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return dateTimeFmt.format(new Date(d));
}

export function fmtTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return timeFmt.format(new Date(d));
}

/** YYYY-MM-DD of a date in the business timezone (for date inputs and day bucketing). */
export function isoDay(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: APP_TZ }).format(d);
}

export function fmtRelative(d: Date | string | null | undefined) {
  if (!d) return "—";
  return formatDistanceToNowStrict(new Date(d), { addSuffix: true });
}

export function fmtMoney(amount: number | string | { toString(): string } | null | undefined, currency = "PKR") {
  if (amount === null || amount === undefined) return "—";
  const n = typeof amount === "number" ? amount : Number(amount.toString());
  return new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function fmtNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

export function humanize(s: string | null | undefined) {
  if (!s) return "";
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Read a single string param from Next.js searchParams. */
export function sp(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v === "" ? undefined : v;
}
