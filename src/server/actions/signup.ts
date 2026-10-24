"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/server/errors";
import { clientIp } from "@/server/request";
import { hashIdentifier } from "@/server/rate-limit";
import { createSession } from "@/server/auth/session";
import { createWorkspace } from "@/server/platform/provision";
import { platformRateLimit } from "@/server/platform/guard";
import { renderMail, sendSystemMail, workspaceUrl, appBaseUrl } from "@/server/platform/mail";
import { sendPlanEmail } from "@/server/platform/plan-mail";
import { runInTenant } from "@/server/platform/runtime";
import { getPlatformSettings } from "@/server/platform/settings";
import { isReservedSlug, isValidSlug, DEFAULT_SLUG } from "@/server/platform/tenants";
import { platformDb } from "@/server/platform/client";
import { passwordSchema } from "@/lib/password-policy";

export type SignupState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const schema = z.object({
  companyName: z.string().trim().min(2, "Enter your company name").max(80),
  slug: z.string().trim().toLowerCase().min(3, "At least 3 characters").max(40),
  ownerName: z.string().trim().min(2, "Enter your name").max(80),
  ownerEmail: z.string().trim().toLowerCase().email("Enter a valid email address").max(160),
  password: passwordSchema,
  terms: z.literal("on", { errorMap: () => ({ message: "Please accept the terms to continue" }) }),
  website: z.string().max(0).optional(), // honeypot: real people leave it empty
});

/** Public signup: creates the company's own database, its owner login and a trial, then signs the owner in. */
export async function signupAction(_: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  if (!isValidSlug(v.slug)) return { error: "Please correct the highlighted fields.", fieldErrors: { slug: "Use 3–40 lowercase letters, numbers or single hyphens." } };
  if (isReservedSlug(v.slug) || v.slug === DEFAULT_SLUG) return { error: "Please correct the highlighted fields.", fieldErrors: { slug: "That code is reserved. Choose another." } };

  const ip = hashIdentifier(await clientIp());
  if (!(await platformRateLimit(`signup:ip:${ip}`, 5, 3600)) || !(await platformRateLimit(`signup:email:${hashIdentifier(v.ownerEmail)}`, 3, 86_400))) {
    return { error: "Too many sign-up attempts. Please try again later." };
  }

  let created;
  try {
    created = await createWorkspace({ slug: v.slug, companyName: v.companyName, ownerName: v.ownerName, ownerEmail: v.ownerEmail, ownerPassword: v.password, source: "SIGNUP" });
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }

  // Welcome email with the one-time confirmation link (the owner cannot invite people until it is used).
  const settings = await getPlatformSettings();
  const confirmUrl = `${appBaseUrl()}/confirm-email/${created.confirmToken}`;
  const mail = renderMail({
    heading: `Welcome to ${process.env.PLATFORM_NAME || "YADEA CRM"}, ${v.ownerName.split(" ")[0]}!`,
    paragraphs: [
      `Your workspace "${v.companyName}" is ready${created.trial ? ` and your ${settings.trialDays}-day free trial has started` : ""}.`,
      `Sign in any time with your workspace code "${v.slug}" at ${workspaceUrl(v.slug, "/login")}.`,
      "Please confirm your email address so you can invite your team.",
    ],
    cta: { label: "Confirm my email", url: confirmUrl },
    footer: "This link works once and expires in 3 days. If you did not create this workspace, you can ignore this email.",
  });
  await sendSystemMail({ to: v.ownerEmail, subject: "Confirm your email — your workspace is ready", text: mail.text, html: mail.html });

  // What the trial includes and when it ends (separate from the confirmation link so each email has one job).
  if (created.trial) await sendPlanEmail(created.tenantId, "trial-started");

  // Sign the new owner in, inside their own workspace.
  await runInTenant(v.slug, async () => {
    const owner = await db.user.findUniqueOrThrow({ where: { email: v.ownerEmail } });
    await createSession(owner.id);
    await db.user.update({ where: { id: owner.id }, data: { lastLoginAt: new Date() } });
  });
  await platformDb().tenant.update({ where: { id: created.tenantId }, data: { lastSeenAt: new Date() } });
  redirect("/crm/dashboard");
}
