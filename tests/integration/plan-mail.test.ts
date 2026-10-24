import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as { to: string; subject: string; text: string }[]);
vi.mock("@/server/platform/mail", async (orig) => {
  const real = await orig<typeof import("@/server/platform/mail")>();
  return { ...real, sendSystemMail: async (m: { to: string; subject: string; text: string }) => (sent.push(m), { delivered: true, via: "smtp" as const }) };
});

import { platformDb } from "@/server/platform/client";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, schemaNameFor } from "@/server/platform/migrate";
import { ensureDefaultPlans } from "@/server/platform/plans";
import { buildQuote, confirmPayment, submitLocalPayment } from "@/server/platform/billing";
import { sendPlanEmail } from "@/server/platform/plan-mail";
import { emailHash } from "@/server/platform/crypto";
import { invalidateTenant } from "@/server/platform/tenants";

const SLUG = "t-planmail-co";
const EMAIL = "owner@t-planmail-co.test";
let id = "";
const who = { source: "ADMIN" as const, actor: "operator@test", reason: "test" };

async function cleanup() {
  const p = platformDb();
  await dropSchema(schemaNameFor(SLUG)).catch(() => {});
  await p.tenant.deleteMany({ where: { slug: SLUG } });
  await p.trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(EMAIL) } });
  invalidateTenant();
}

beforeAll(async () => {
  await cleanup();
  await ensureDefaultPlans();
  id = (await createWorkspace({ slug: SLUG, companyName: "Mail Co", ownerName: "Mia Khan", ownerEmail: EMAIL, ownerPassword: "Correct-Horse-Battery-1", source: "SIGNUP" })).tenantId;
}, 180_000);
afterAll(cleanup);

describe("plan emails to the workspace owner", () => {
  it("tells a new trial user what the plan includes and when the trial ends", async () => {
    sent.length = 0;
    expect(await sendPlanEmail(id, "trial-started")).toBe(true);
    const m = sent[0]!;
    expect(m.to).toBe(EMAIL);
    expect(m.subject).toMatch(/free trial has started/i);
    expect(m.text).toMatch(/Growth plan/);
    expect(m.text).toMatch(/staff logins/);
    expect(m.text).toMatch(/read-only/);
    expect(m.text).toContain(SLUG);
  });

  it("acknowledges a bank transfer, then confirms the active plan with the invoice", async () => {
    sent.length = 0;
    const t = await platformDb().tenant.findUniqueOrThrow({ where: { id } });
    const p = await submitLocalPayment(t, { method: "RAAST", reference: `PM-${Date.now()}`, planKey: "starter", interval: "MONTH" });
    expect(sent.map((s) => s.subject)).toContain("We received your payment details");
    expect(sent.find((s) => s.subject.startsWith("We received"))!.text).toMatch(/Starter plan/);

    sent.length = 0;
    await confirmPayment(p.id, who);
    const active = sent.find((s) => /plan is active/i.test(s.subject))!;
    expect(active.to).toBe(EMAIL);
    expect(active.subject).toMatch(/Starter/);
    expect(active.text).toMatch(/INV-\d{5}/);
    expect(active.text).toMatch(/until \d/);
  });

  it("reports an administrator's change", async () => {
    sent.length = 0;
    await sendPlanEmail(id, "plan-updated", { note: "your free trial was extended by 7 day(s)" });
    expect(sent[0]!.subject).toBe("Your plan was updated");
    expect(sent[0]!.text).toMatch(/extended by 7 day/);
  });

  it("never throws and sends nothing for an unknown workspace", async () => {
    sent.length = 0;
    expect(await sendPlanEmail("does-not-exist", "plan-active")).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
