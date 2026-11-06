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
