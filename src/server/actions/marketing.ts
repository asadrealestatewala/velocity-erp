"use server";
import { z } from "zod";
import { clientIp } from "@/server/request";
import { hashIdentifier } from "@/server/rate-limit";
import { platformDb } from "@/server/platform/client";
import { platformRateLimit } from "@/server/platform/guard";
import { renderMail, sendSystemMail } from "@/server/platform/mail";
import { getPlatformSettings } from "@/server/platform/settings";

export type DemoState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> } | undefined;

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(160),
  company: z.string().trim().max(100).optional(),
  message: z.string().trim().max(1000).optional(),
  website: z.string().max(0).optional(), // honeypot
});

/** Public "talk to us" form. Stored for the operator and emailed to them when email is configured. */
export async function requestDemoAction(_: DemoState, formData: FormData): Promise<DemoState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  const ip = hashIdentifier(await clientIp());
  if (!(await platformRateLimit(`demo:ip:${ip}`, 5, 3600)) || !(await platformRateLimit(`demo:email:${hashIdentifier(v.email)}`, 2, 86_400))) {
    return { error: "Too many requests. Please try again later." };
  }
  await platformDb().demoRequest.create({ data: { name: v.name, email: v.email, company: v.company || null, message: v.message || null } });
  const s = await getPlatformSettings();
  const to = s.billing.operatorEmail || s.support.email;
  if (to) {
    const mail = await renderMail({ heading: "New demo request", paragraphs: [`${v.name} <${v.email}>${v.company ? ` from ${v.company}` : ""}`, v.message || "(no message)"] });
    await sendSystemMail({ to, subject: `Demo request from ${v.name}`, category: "system", ...mail }).catch(() => {});
  }
  return { ok: true };
}
