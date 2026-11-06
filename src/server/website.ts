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
};

export const DEFAULT_WEBSITE: WebsiteConfig = {
  published: false,
  siteName: "",
  tagline: "Electric two-wheelers, sold and serviced near you",
  heroTitle: "Ride the future",
  heroSubtitle: "Explore our range, visit a showroom or book a test drive in minutes.",
  heroImageUrl: "",
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
