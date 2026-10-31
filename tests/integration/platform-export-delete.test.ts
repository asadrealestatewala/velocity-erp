import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { platformDb } from "@/server/platform/client";
import { createWorkspace } from "@/server/platform/provision";
import { dropSchema, schemaNameFor, withClient } from "@/server/platform/migrate";
import { ensureDefaultPlans } from "@/server/platform/plans";
import { emailHash } from "@/server/platform/crypto";
import { invalidateTenant } from "@/server/platform/tenants";
import { redact, writeWorkspaceExport } from "@/server/platform/export";
import { deletionBlocker, purgeDueWorkspaces } from "@/server/platform/purge";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const SLUG = "t-export-co";
const EMAIL = "owner@t-export-co.test";
let tenantId = "";

async function cleanup() {
  const p = platformDb();
  await dropSchema(schemaNameFor(SLUG)).catch(() => {});
  await p.tenant.deleteMany({ where: { slug: SLUG } });
  await p.trialClaim.deleteMany({ where: { ownerEmailHash: emailHash(EMAIL) } });
  invalidateTenant();
}

const tenant = () => platformDb().tenant.findUniqueOrThrow({ where: { id: tenantId } });
const schemaExists = () => withClient(undefined, async (c) => (await c.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = $1", [schemaNameFor(SLUG)])).rowCount === 1);

beforeAll(async () => {
  await cleanup();
  await ensureDefaultPlans();
  tenantId = (await createWorkspace({ slug: SLUG, companyName: "Export Co", ownerName: "Exa Port", ownerEmail: EMAIL, ownerPassword: "Correct-Horse-Battery-1", source: "ADMIN" })).tenantId;
});
afterAll(cleanup);

describe("workspace export", () => {
  it("redacts secrets", () => {
    expect(redact({ id: "1", email: "a@b", passwordHash: "x", totpSecretEnc: "y", recoveryCodes: [], tokenHash: "z", name: "n" })).toEqual({ id: "1", email: "a@b", name: "n" });
  });

  it("produces a zip with every table, the owner's data, and no credentials", async () => {
    const chunks: Uint8Array[] = [];
    const summary = await writeWorkspaceExport(await tenant(), (c) => void chunks.push(c));
    const zip = unzipSync(Buffer.concat(chunks));
    expect(Object.keys(zip)).toContain("manifest.json");
    expect(Object.keys(zip)).toContain("data/User.jsonl");
    expect(Object.keys(zip)).not.toContain("data/Session.jsonl");
    const users = strFromU8(zip["data/User.jsonl"]!).trim().split("\n").map((l) => JSON.parse(l));
    expect(users.some((u) => u.email === EMAIL)).toBe(true);
    for (const u of users) expect(Object.keys(u).filter((k) => /password|secret|recovery|totp/i.test(k))).toEqual([]);
    expect(summary.tables.User).toBe(users.length);
    expect(JSON.parse(strFromU8(zip["manifest.json"]!)).workspace.slug).toBe(SLUG);
  });
});

describe("workspace deletion", () => {
  it("only allows suspended or cancelled workspaces, never the legacy one", async () => {
    const t = await tenant();
    expect(deletionBlocker(t)).toMatch(/Suspend or cancel/);
    expect(deletionBlocker({ ...t, status: "SUSPENDED" })).toBeNull();
    expect(deletionBlocker({ ...t, isLegacy: true, status: "CANCELLED" })).toMatch(/original/);
    expect(deletionBlocker({ ...t, status: "CANCELLED", dataPurgedAt: new Date() })).toMatch(/already/);
  });

  it("does nothing before the retention window ends", async () => {
    await platformDb().tenant.update({ where: { id: tenantId }, data: { status: "SUSPENDED", deletionScheduledFor: new Date(Date.now() + 86_400_000) } });
    expect(await purgeDueWorkspaces()).not.toContain(SLUG);
    expect(await schemaExists()).toBe(true);
  });

  it("does not erase a workspace that was reactivated", async () => {
    await platformDb().tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE", deletionScheduledFor: new Date(Date.now() - 1000) } });
    expect(await purgeDueWorkspaces()).not.toContain(SLUG);
    expect(await schemaExists()).toBe(true);
  });

  it("erases data when due, keeps the tenant row and clears personal fields", async () => {
    await platformDb().tenant.update({ where: { id: tenantId }, data: { status: "SUSPENDED", deletionScheduledFor: new Date(Date.now() - 1000) } });
    expect(await purgeDueWorkspaces()).toContain(SLUG);
    expect(await schemaExists()).toBe(false);
    const t = await tenant();
    expect(t.dataPurgedAt).not.toBeNull();
    expect(t.ownerEmail).toBeNull();
    expect(t.status).toBe("CANCELLED");
    const audit = await platformDb().platformAudit.findFirst({ where: { action: "tenant.data_purged", targetId: tenantId } });
    expect(audit).not.toBeNull();
    expect(await purgeDueWorkspaces()).not.toContain(SLUG); // idempotent
  });
});
