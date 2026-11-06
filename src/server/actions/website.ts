"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { runAction } from "@/server/errors";
import { assertModule } from "@/server/platform/guard";
import { saveWebsite } from "@/server/website";

const slug = z.string().trim().regex(/^[a-z0-9-]*$/, "Use lowercase letters, numbers and dashes").max(80);
const imageUrl = z.string().trim().max(500).refine((v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v), "Use an https:// link or a path starting with /");

const schema = z.object({
  published: z.boolean(),
  siteName: z.string().trim().min(1, "Enter your business name").max(80),
  tagline: z.string().trim().max(160),
  heroTitle: z.string().trim().min(1, "Enter a headline").max(100),
  heroSubtitle: z.string().trim().max(300),
  heroImageUrl: imageUrl,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #e11d2e"),
  about: z.string().trim().max(3000),
  phone: z.string().trim().max(40),
  whatsapp: z.string().trim().max(40),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  address: z.string().trim().max(300),
  showModels: z.boolean(),
  showShowrooms: z.boolean(),
  showInventory: z.boolean(),
  testDriveFormSlug: slug,
  contactFormSlug: slug,
  seoTitle: z.string().trim().max(70),
  seoDescription: z.string().trim().max(160),
  statsText: z.string().max(1500),
  highlightsText: z.string().max(3000),
  programsText: z.string().max(3000),
  socialsText: z.string().max(1000),
  navLinksText: z.string().max(1000),
});

export async function saveWebsiteAction(input: z.input<typeof schema>) {
  return runAction(async () => {
    const user = await requireUser("settings.manage");
    await assertModule("website");
    const data = schema.parse(input);
    await saveWebsite(data);
    await audit({ userId: user.id, action: data.published ? "website.save_published" : "website.save_draft", entityType: "Website" });
    revalidatePath("/site");
    return { ok: true as const, message: data.published ? "Website saved and live." : "Website saved (not published)." };
  });
}
