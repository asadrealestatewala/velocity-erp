import "server-only";
import { db } from "@/lib/db";

/** A workspace's public website. Stored as one JSON row in the tenant `Setting` table (key "website"), so it needs no migration. */
export type WebsiteConfig = {
  published: boolean;
  siteName: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
  /** Logo shown in the header instead of the business name. https:// link or a path such as /brand/yadea-vi-logo.png. */
  logoUrl: string;
  /** Show the hero image as a plain banner (for artwork with its own text) with the headline in a bar below it. */
  heroPlainImage: boolean;
  primaryColor: string;
  about: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  showModels: boolean;
  showShowrooms: boolean;
  /** Public "in stock" page listing which models each showroom has available (no chassis numbers or counts). */
  showInventory: boolean;
  /** Slug of the published form used for the "Book a test drive" button. */
  testDriveFormSlug: string;
  contactFormSlug: string;
  seoTitle: string;
  seoDescription: string;
  /** Home-page sections. One item per line, fields separated by " | ". */
  statsText: string; // "9 years | Global No.1 in sales"
  highlightsText: string; // "Title | Short description" (why choose us / technology)
  programsText: string; // "Title | Short description" (finance / lease options)
  socialsText: string; // "Facebook | https://..."
  navLinksText: string; // extra header links: "Support | /forms/contact"
  /** Heading and intro of the dark "Why us" section (highlightsText items become expandable cards). */
  highlightsTitle: string;
  highlightsIntro: string;
  /** "Our impact" section: "value | label | optional image link" per line. */
  impactTitle: string;
  impactText: string;
  /** Info cards (stores, support...): "Title | text | link" per line. */
  cardsText: string;
  /** Banner slider: "image | optional link | optional alt" per line. Replaces the single plain hero banner when set. */
  slidesText: string;
  /** Heading of the "latest models" slider (empty hides it). Shows models with their key specs. */
  featuredTitle: string;
  /** Feature blocks: "Title | Text | point; point; point | optional button label | optional button link | optional image" per line. */
  blocksText: string;
  /** Heading of the latest-blog-posts section on the home page (empty hides it). */
  insightsTitle: string;
  /** Subscribe box: heading and text (empty heading hides it). The button opens the contact form. */
  subscribeTitle: string;
  subscribeText: string;
};

/** Parse "a | b | c" lines into trimmed columns. */
export function parseRows(text: string): string[][] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split("|").map((c) => c.trim()));
}

/** Parse "a | b" lines into pairs. */
export function parsePairs(text: string): { a: string; b: string }[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [a, ...rest] = l.split("|");
    return { a: a!.trim(), b: rest.join("|").trim() };
  });
}

export const DEFAULT_WEBSITE: WebsiteConfig = {
  published: false,
  siteName: "",
  tagline: "Electric two-wheelers, sold and serviced near you",
  heroTitle: "Ride the future",
  heroSubtitle: "Explore our range, visit a showroom or book a test drive in minutes.",
  heroImageUrl: "",
  logoUrl: "",
  heroPlainImage: false,
  primaryColor: "#e11d2e",
  about: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  showModels: true,
  showShowrooms: true,
  showInventory: true,
  testDriveFormSlug: "test-drive",
  contactFormSlug: "general-inquiry",
  seoTitle: "",
  seoDescription: "",
  statsText: "",
  highlightsText: "",
  programsText: "",
  socialsText: "",
  navLinksText: "",
  highlightsTitle: "",
  highlightsIntro: "",
  impactTitle: "",
  impactText: "",
  cardsText: "",
  slidesText: "",
  featuredTitle: "",
  blocksText: "",
  insightsTitle: "",
  subscribeTitle: "",
  subscribeText: "",
};

const KEY = "website";

export async function getWebsite(): Promise<WebsiteConfig> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  return { ...DEFAULT_WEBSITE, ...((row?.value ?? {}) as Partial<WebsiteConfig>) };
}

export async function saveWebsite(next: WebsiteConfig) {
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: next }, update: { value: next } });
  return next;
}

import { cache } from "react";
import { headers } from "next/headers";
import { currentTenant } from "@/server/platform/runtime";
import { entitlementsFor } from "@/server/platform/plans";
import { SITE_BASE_DOMAIN } from "@/server/platform/tenants";

/** Where the public site is mounted: "" on its own hostname, "/site" inside the app. */
export async function siteBase(): Promise<string> {
  return (await headers()).get("x-site-host") ? "" : "/site";
}

/** The site config if this workspace's website is published and its plan includes it; otherwise null (render 404). */
export const publishedWebsite = cache(async (): Promise<WebsiteConfig | null> => {
  const [s, t] = await Promise.all([getWebsite(), currentTenant()]);
  if (!s.published) return null;
  if (!t.isLegacy && !(await entitlementsFor(t)).website) return null;
  return s;
});

/** Addresses the website answers on, for the editor. */
export async function siteAddresses() {
  const t = await currentTenant();
  const subdomain = SITE_BASE_DOMAIN ? `https://${t.slug}.${SITE_BASE_DOMAIN}` : null;
  return { slug: t.slug, subdomain, customDomain: t.siteDomain ? `https://${t.siteDomain}` : null };
}

/** Blog posts and simple pages (About, FAQ, Support...). Stored as one JSON row (key "website-content"); bodies are plain text. */
export type SiteEntry = {
  slug: string;
  kind: "post" | "page";
  title: string;
  summary: string;
  body: string;
  date: string; // ISO day
  published: boolean;
  /** Pages only: false keeps the page out of the header menu (it is still linked from the footer). Missing means shown. */
  inMenu?: boolean;
  /** Optional cover photo (https or site-relative URL) behind the page header. Missing means the brand gradient. */
  cover?: string;
};
// Posts reuse `cover` as the card / hero image.

const CONTENT_KEY = "website-content";

export async function getSiteEntries(): Promise<SiteEntry[]> {
  const row = await db.setting.findUnique({ where: { key: CONTENT_KEY } });
  return Array.isArray(row?.value) ? (row!.value as unknown as SiteEntry[]) : [];
}

export async function saveSiteEntries(entries: SiteEntry[]) {
  const value = entries as unknown as object;
  await db.setting.upsert({ where: { key: CONTENT_KEY }, create: { key: CONTENT_KEY, value }, update: { value } });
}
