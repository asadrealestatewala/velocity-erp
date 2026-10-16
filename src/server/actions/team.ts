"use server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword } from "@/server/auth/session";
import { can, isCentral, managedDealershipIds, requireUser } from "@/server/authz";
import { audit } from "@/server/audit";
import { AppError, forbidden, notFound, runAction } from "@/server/errors";
import { notify } from "@/server/services/notifications";

type Actor = Awaited<ReturnType<typeof requireUser>>;

/** Central dealership managers can manage any team; a dealership manager only their own reps. */
function assertTeamAuthority(user: Actor, dealershipId: string, role: "MANAGER" | "SALES_REP") {
  if (isCentral(user)) {
    if (!can(user, "dealerships.manage")) throw forbidden();
    return;
  }
  if (!can(user, "team.manage") || !managedDealershipIds(user).includes(dealershipId)) throw forbidden();
  if (role === "MANAGER") throw forbidden("Only YADEA staff can appoint dealership managers.");
}

/** A readable temporary password, shown once to the person creating the account. */
function tempPassword() {
  return `Yd-${randomBytes(6).toString("base64url")}-${Math.floor(10 + Math.random() * 89)}`;
}

const addSchema = z.object({
  dealershipId: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(["MANAGER", "SALES_REP"]),
});

export async function addTeamMemberAction(input: z.input<typeof addSchema>) {
  return runAction(async () => {
    const user = await requireUser();
    const v = addSchema.parse(input);
    assertTeamAuthority(user, v.dealershipId, v.role);
    const dealership = await db.dealership.findUnique({ where: { id: v.dealershipId } });
    if (!dealership) throw notFound();
    const roleKey = v.role === "MANAGER" ? "DEALER_MANAGER" : "DEALER_REP";
    const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });

    const existing = await db.user.findUnique({ where: { email: v.email }, include: { role: true } });
    let password: string | null = null;
    const result = await db.$transaction(async (tx) => {
      let userId: string;
      if (existing) {
        // Never attach a central (head-office) account to a dealership — keeps scopes separate.
        if (existing.role.scope !== "DEALERSHIP") throw new AppError("That email belongs to a YADEA central account.", "CONFLICT", { email: "Central account" });
        userId = existing.id;
        if (v.role === "MANAGER" && existing.role.key !== "DEALER_MANAGER") await tx.user.update({ where: { id: userId }, data: { roleId: role.id } });
      } else {
        password = tempPassword();
        const u = await tx.user.create({ data: { email: v.email, name: v.name, phone: v.phone, passwordHash: await hashPassword(password), roleId: role.id, mustChangePassword: true } });
        userId = u.id;
      }
      const m = await tx.dealershipMembership.upsert({
        where: { userId_dealershipId: { userId, dealershipId: v.dealershipId } },
        create: { userId, dealershipId: v.dealershipId, role: v.role },
        update: { role: v.role, isActive: true },
      });
      await tx.outboxMessage.create({
        data: {
          to: v.email,
          subject: `[YADEA] You've been added to ${dealership.name}`,
          body: `Hello ${v.name},\n\nYou now have ${v.role === "MANAGER" ? "manager" : "sales representative"} access to ${dealership.name} in the YADEA Dealer Portal.\n\nSign in: ${env.appUrl}/portal/login\n${password ? "Your administrator will share your temporary password; you'll be asked to change it." : "Use your existing password."}`,
        },
      });
      await notify(tx, { userIds: [userId], type: "DEALERSHIP_ONBOARDING", title: `Welcome to ${dealership.name}`, body: "Your dealer portal access is ready.", link: { portal: "/portal/dashboard" } });
      await audit({ userId: user.id, action: "team.member_added", entityType: "Dealership", entityId: v.dealershipId, changes: { member: v.email, role: v.role, newAccount: !existing } }, tx);
      return m;
    });
    return {
      ok: true as const,
      data: { membershipId: result.id, tempPassword: password as string | null },
      message: existing ? "Existing user added to the dealership." : "Account created.",
    };
  });
}

export async function updateMembershipAction(membershipId: string, patch: { role?: "MANAGER" | "SALES_REP"; isActive?: boolean }) {
  return runAction(async () => {
    const user = await requireUser();
    const m = await db.dealershipMembership.findUnique({ where: { id: membershipId }, include: { user: true } });
    if (!m) throw notFound();
    assertTeamAuthority(user, m.dealershipId, patch.role === "MANAGER" || m.role === "MANAGER" ? "MANAGER" : "SALES_REP");
    if (m.userId === user.id) throw forbidden("You can't change your own access.");
    await db.$transaction(async (tx) => {
      await tx.dealershipMembership.update({ where: { id: membershipId }, data: patch });
      if (patch.role) {
        const role = await tx.role.findUniqueOrThrow({ where: { key: patch.role === "MANAGER" ? "DEALER_MANAGER" : "DEALER_REP" } });
        await tx.user.update({ where: { id: m.userId }, data: { roleId: role.id } });
      }
      if (patch.isActive === false) {
        // Return the person's open leads in this dealership to the manager's queue (dealership stays the same).
        const leads = await tx.lead.findMany({ where: { dealershipId: m.dealershipId, assignedUserId: m.userId, stage: { kind: "OPEN" } }, select: { id: true } });
        for (const l of leads) {
          await tx.lead.update({ where: { id: l.id }, data: { assignedUserId: null } });
          await tx.leadAssignmentHistory.create({ data: { leadId: l.id, fromDealershipId: m.dealershipId, toDealershipId: m.dealershipId, fromUserId: m.userId, toUserId: null, type: "MANUAL", reason: "Team member deactivated", assignedById: user.id } });
        }
        await tx.session.deleteMany({ where: { userId: m.userId } });
      }
      await audit({ userId: user.id, action: "team.member_updated", entityType: "Dealership", entityId: m.dealershipId, changes: { member: m.user.email, ...patch } }, tx);
    });
    return { ok: true as const, message: patch.isActive === false ? "Access removed. Their open leads returned to the unassigned team queue." : "Member updated." };
  });
}

export async function resetMemberPasswordAction(membershipId: string) {
  return runAction(async () => {
    const user = await requireUser();
    const m = await db.dealershipMembership.findUnique({ where: { id: membershipId }, include: { user: true } });
    if (!m) throw notFound();
    assertTeamAuthority(user, m.dealershipId, m.role === "MANAGER" ? "MANAGER" : "SALES_REP");
    if (m.userId === user.id) throw forbidden("Use Account settings to change your own password.");
    const pw = tempPassword();
    await db.user.update({ where: { id: m.userId }, data: { passwordHash: await hashPassword(pw), mustChangePassword: true } });
    await db.session.deleteMany({ where: { userId: m.userId } });
    await audit({ userId: user.id, action: "team.password_reset", entityType: "User", entityId: m.userId });
    return { ok: true as const, data: { tempPassword: pw }, message: "Temporary password generated." };
  });
}
