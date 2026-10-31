import "server-only";
import type { MailMailbox } from "@yadea/platform-client";
import { platformDb } from "./client";
import { DEFAULT_BRAND, type MailBrand } from "./mail-layout";
import { MAIL_CATEGORIES, type MailCategory } from "./mail-templates";
import { getPlatformSettings } from "./settings";

export type MailRouting = Record<MailCategory, string>;
export type MailConfig = { brand: MailBrand; routing: MailRouting; mailboxes: MailMailbox[] };

/** The domain mail is sent from: MAIL_DOMAIN, else the domain of MAIL_FROM, else velocityerp.co. */
export function mailDomain(): string {
  if (process.env.MAIL_DOMAIN) return process.env.MAIL_DOMAIN.trim().toLowerCase();
  const m = (process.env.MAIL_FROM || process.env.EMAIL_FROM || "").match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  return (m ? m[1]! : "velocityerp.co").toLowerCase();
}

/** The address in MAIL_FROM (`Name <a@b.co>` or bare), used for the no-reply identity. */
function envFromAddress(): string | null {
  const raw = process.env.MAIL_FROM || process.env.EMAIL_FROM || "";
  const m = raw.match(/<([^>]+)>/) ?? raw.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1]!.trim().toLowerCase() : null;
}

export const DEFAULT_MAILBOXES = (companyName: string) => [
  { key: "no-reply", address: envFromAddress() ?? `no-reply@${mailDomain()}`, displayName: companyName, replyTo: `support@${mailDomain()}`, signature: "", receives: false },
  { key: "billing", address: `billing@${mailDomain()}`, displayName: `${companyName} Billing`, replyTo: null, signature: `Kind regards,\n${companyName} Billing Team`, receives: true },
  { key: "support", address: `support@${mailDomain()}`, displayName: `${companyName} Support`, replyTo: null, signature: `Kind regards,\n${companyName} Support Team`, receives: true },
];

export const defaultRouting = (): MailRouting => Object.fromEntries(MAIL_CATEGORIES.map((c) => [c.key, c.defaultMailbox])) as MailRouting;

type Stored = { brand?: Partial<MailBrand>; routing?: Partial<MailRouting> };

let cache: { at: number; value: MailConfig } | null = null;
export const clearMailConfigCache = () => { cache = null; };

async function readStored(): Promise<Stored> {
  const row = await platformDb().siteSetting.findUnique({ where: { key: "mail" } });
  return (row?.value ?? {}) as Stored;
}

/** Brand + category routing + mailboxes (default mailboxes are created the first time they are needed). Cached for 15 s. */
export async function loadMailConfig(): Promise<MailConfig> {
  if (cache && Date.now() - cache.at < 15_000) return cache.value;
  const db = platformDb();
  const [stored, settings] = await Promise.all([readStored(), getPlatformSettings()]);
  const brand: MailBrand = { ...DEFAULT_BRAND, supportEmail: settings.support.email, supportPhone: settings.support.phone, ...(process.env.PLATFORM_NAME ? { companyName: process.env.PLATFORM_NAME } : {}), ...(stored.brand ?? {}) };
  await db.mailMailbox.createMany({ data: DEFAULT_MAILBOXES(brand.companyName), skipDuplicates: true });
  const mailboxes = await db.mailMailbox.findMany({ orderBy: { key: "asc" } });
  const routing = { ...defaultRouting(), ...(stored.routing ?? {}) } as MailRouting;
  cache = { at: Date.now(), value: { brand, routing, mailboxes } };
  return cache.value;
}

export async function saveMailBrand(brand: MailBrand) {
  const stored = await readStored();
  await platformDb().siteSetting.upsert({ where: { key: "mail" }, create: { key: "mail", value: { ...stored, brand } as object }, update: { value: { ...stored, brand } as object } });
  clearMailConfigCache();
}

export async function saveMailRouting(routing: MailRouting) {
  const stored = await readStored();
  await platformDb().siteSetting.upsert({ where: { key: "mail" }, create: { key: "mail", value: { ...stored, routing } as object }, update: { value: { ...stored, routing } as object } });
  clearMailConfigCache();
}

export type Sender = { mailboxKey: string; address: string; from: string; replyTo: string | null; signature: string };

const q = (s: string) => s.replace(/["\r\n<>]/g, "").trim();
export const formatFrom = (name: string, address: string) => (name.trim() ? `${q(name)} <${address}>` : address);

/** Which identity a category is sent from (falls back to no-reply, then to MAIL_FROM, so mail never stops because of a config mistake). */
export async function senderFor(category: MailCategory, mailboxOverride?: string): Promise<Sender> {
  try {
    const cfg = await loadMailConfig();
    const wanted = mailboxOverride ?? cfg.routing[category];
    const box = cfg.mailboxes.find((m) => m.key === wanted && m.isActive) ?? cfg.mailboxes.find((m) => m.key === "no-reply" && m.isActive);
    if (box) return { mailboxKey: box.key, address: box.address, from: formatFrom(box.displayName, box.address), replyTo: box.replyTo, signature: box.signature };
  } catch (e) {
    console.error("[mail] could not load mailboxes:", (e as Error).message);
  }
  const from = process.env.MAIL_FROM || process.env.EMAIL_FROM || "Velocity ERP <no-reply@example.com>";
  return { mailboxKey: "no-reply", address: envFromAddress() ?? "no-reply@example.com", from, replyTo: null, signature: "" };
}

export async function saveWebhookSecretEnc(enc: string) {
  const stored = (await readStored()) as Stored & { webhookSecretEnc?: string };
  const value = { ...stored, webhookSecretEnc: enc } as object;
  await platformDb().siteSetting.upsert({ where: { key: "mail" }, create: { key: "mail", value }, update: { value } });
}
