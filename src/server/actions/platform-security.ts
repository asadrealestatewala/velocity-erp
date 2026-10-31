"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { AppError, runAction } from "@/server/errors";
import { platformAudit, requireAdminAction } from "@/server/platform/admin-auth";
import { ipAllowed, parseEntry } from "@/server/platform/ip-allow";
import { savePlatformSettings } from "@/server/platform/settings";

const schema = z.object({ list: z.string().max(4000) });

/**
 * Saves the staff network allowlist. To make a lock-out by mistake impossible, the list is refused unless it includes the address
 * the owner is using right now. An empty list switches the restriction off.
 */
export async function saveIpAllowlistAction(input: z.input<typeof schema>) {
  return runAction(async () => {
    const a = await requireAdminAction("settings.manage");
    const { list } = schema.parse(input);
    const entries = [...new Set(list.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
    if (entries.length > 50) throw new AppError("Use at most 50 entries.", "VALIDATION", { list: "Too many entries" });
    for (const e of entries) {
      const p = parseEntry(e);
      if (typeof p === "string") throw new AppError(p, "VALIDATION", { list: p });
    }
    const h = await headers();
    const mine = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    if (entries.length && !ipAllowed(mine, entries)) {
      throw new AppError(`Your current address (${mine ?? "unknown"}) is not in this list. Add it first, otherwise you would lock yourself out.`, "VALIDATION", { list: "Must include your current address" });
    }
    await savePlatformSettings({ staffIpAllowlist: entries });
    await platformAudit({ admin: a, action: entries.length ? "security.ip_allowlist_set" : "security.ip_allowlist_cleared", detail: { entries } });
    return { ok: true as const, message: entries.length ? `Only ${entries.length} address${entries.length === 1 ? "" : "es"}/range${entries.length === 1 ? "" : "s"} can use the console now.` : "Console access is open from any network." };
  });
}
