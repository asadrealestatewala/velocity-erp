"use server";
import { db } from "@/lib/db";
import { requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { AppError, notFound, runAction } from "@/server/errors";
import { toolByName } from "@/server/assistant/tools";

/**
 * Carries out a change the assistant proposed — only the exact record the signed-in user is looking at, only once,
 * and only while it is still fresh. It runs through the same server actions as the rest of the app, so the user's
 * own permissions, validation and audit trail all apply.
 */
export async function confirmAssistantAction(actionId: string) {
  return runAction(async () => {
    const user = await requireUser("assistant.write");
    const row = await db.assistantAction.findFirst({ where: { id: actionId, userId: user.id } });
    if (!row) throw notFound("That proposal wasn't found.");
    // Claim it atomically: a double-click or a second tab can never run it twice.
    const claimed = await db.assistantAction.updateMany({ where: { id: actionId, userId: user.id, status: "PENDING", expiresAt: { gt: new Date() } }, data: { status: "CONFIRMED", resolvedAt: new Date() } });
    if (claimed.count !== 1) {
      if (row.status === "PENDING" && row.expiresAt <= new Date()) await db.assistantAction.update({ where: { id: actionId }, data: { status: "EXPIRED", resolvedAt: new Date() } });
      throw new AppError(row.status === "PENDING" || row.status === "EXPIRED" ? "This proposal has expired. Ask the assistant again." : `This proposal was already ${row.status.toLowerCase()}.`, "CONFLICT");
    }
    const tool = toolByName(row.tool);
    try {
      if (!tool || tool.kind !== "write" || !tool.access(user) || !tool.execute) throw new AppError("Your role no longer allows this change.", "FORBIDDEN");
      const message = await tool.execute(user, row.args as never);
      await db.assistantAction.update({ where: { id: actionId }, data: { result: { message } } });
      await audit({ userId: user.id, action: "assistant.action_confirmed", entityType: "AssistantAction", entityId: actionId, changes: { tool: row.tool, summary: row.summary.slice(0, 300) } });
      return { ok: true as const, data: { message }, message };
    } catch (e) {
      const error = e instanceof AppError ? e.message : "The change could not be completed.";
      if (!(e instanceof AppError)) console.error("[assistant confirm]", e);
      await db.assistantAction.update({ where: { id: actionId }, data: { status: "FAILED", error } });
      throw new AppError(error);
    }
  });
}

export async function cancelAssistantAction(actionId: string) {
  return runAction(async () => {
    const user = await requireUser("assistant.use");
    const res = await db.assistantAction.updateMany({ where: { id: actionId, userId: user.id, status: "PENDING" }, data: { status: "CANCELLED", resolvedAt: new Date() } });
    if (res.count !== 1) throw new AppError("That proposal is no longer pending.", "CONFLICT");
    return { ok: true as const, message: "Cancelled — nothing was changed." };
  });
}
