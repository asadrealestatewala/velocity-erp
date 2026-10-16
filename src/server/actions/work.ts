"use server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { noteSchema, paymentSchema, taskSchema } from "@/lib/validation";
import { childScope, contextDealershipId, isCentral, requireUser, taskScope } from "@/server/authz";
import { accessibleContact, accessibleLead, assertAssignable } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, forbidden, notFound, runAction } from "@/server/errors";
import { logActivity } from "@/server/services/activity";
import { award } from "@/server/services/gamification";
import { notify } from "@/server/services/notifications";
import { putUpload } from "@/server/storage";
import { DOC_CATEGORIES } from "@/lib/constants";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€ Tasks â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function createTaskAction(input: z.input<typeof taskSchema>) {
  return runAction(async () => {
    const user = await requireUser("tasks.manage");
    const v = taskSchema.parse(input);
    const lead = v.leadId ? await accessibleLead(user, v.leadId) : null;
    if (v.contactId) await accessibleContact(user, v.contactId);
    const dealershipId = contextDealershipId(user, lead?.dealershipId);
    await assertAssignable(user, v.assignedToId, dealershipId);
    await db.$transaction(async (tx) => {
      const t = await tx.task.create({ data: { ...v, contactId: v.contactId ?? lead?.contactId ?? null, dealershipId, createdById: user.id } });
      if (t.contactId) await logActivity(tx, { type: "TASK_CREATED", title: `Task created: ${t.title}`, contactId: t.contactId, leadId: t.leadId, dealershipId, userId: user.id });
      if (t.leadId && (t.type === "FOLLOW_UP" || t.type === "CALL")) {
        const l = await tx.lead.findUnique({ where: { id: t.leadId } });
        if (l && (!l.nextFollowUpAt || l.nextFollowUpAt > t.dueAt || l.nextFollowUpAt < new Date())) await tx.lead.update({ where: { id: l.id }, data: { nextFollowUpAt: t.dueAt } });
      }
      if (t.assignedToId !== user.id) {
        await notify(tx, {
          userIds: [t.assignedToId], type: "TASK_ASSIGNED", title: `New task: ${t.title}`,
          body: `Due ${t.dueAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
          link: { central: "/crm/tasks", portal: "/portal/tasks" }, entityType: "Task", entityId: t.id,
        });
      }
    });
    return { ok: true as const, message: "Task created." };
  });
}

async function accessibleTask(user: Awaited<ReturnType<typeof requireUser>>, id: string) {
  const t = await db.task.findFirst({ where: { AND: [{ id }, taskScope(user)] } });
  if (!t) throw notFound("Task not found.");
  return t;
}

export async function updateTaskAction(id: string, input: z.input<typeof taskSchema>) {
  return runAction(async () => {
    const user = await requireUser("tasks.manage");
    const t = await accessibleTask(user, id);
    const v = taskSchema.parse(input);
    await assertAssignable(user, v.assignedToId, t.dealershipId);
    await db.task.update({ where: { id }, data: { title: v.title, description: v.description, type: v.type, assignedToId: v.assignedToId, dueAt: v.dueAt, priority: v.priority, reminderMinutesBefore: v.reminderMinutesBefore, reminderSentAt: v.dueAt.getTime() !== t.dueAt.getTime() ? null : t.reminderSentAt, overdueNotifiedAt: v.dueAt.getTime() !== t.dueAt.getTime() ? null : t.overdueNotifiedAt } });
    return { ok: true as const, message: "Task updated." };
  });
}

export async function setTaskStatusAction(id: string, status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
  return runAction(async () => {
    const user = await requireUser("tasks.manage");
    const t = await accessibleTask(user, id);
    if (t.status === status) return { ok: true as const };
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { status, completedAt: status === "COMPLETED" ? now : null, completedById: status === "COMPLETED" ? user.id : null } });
      if (status === "COMPLETED") {
        if (t.contactId) await logActivity(tx, { type: "TASK_COMPLETED", title: `Task completed: ${t.title}`, contactId: t.contactId, leadId: t.leadId, dealershipId: t.dealershipId, userId: user.id });
        // Points only for the assignee, once per task, and only for real follow-up work.
        if (t.assignedToId === user.id) {
          if (t.type === "FOLLOW_UP" || t.type === "CALL") await award(tx, { userId: user.id, dealershipId: t.dealershipId, type: "FOLLOW_UP_COMPLETED", uniqueKey: `followup:${t.id}`, leadId: t.leadId });
          if (now <= t.dueAt) await award(tx, { userId: user.id, dealershipId: t.dealershipId, type: "TASK_ON_TIME", uniqueKey: `ontime:${t.id}`, leadId: t.leadId });
        }
        if (t.leadId) {
          const next = await tx.task.findFirst({ where: { leadId: t.leadId, status: { in: ["OPEN", "IN_PROGRESS"] }, id: { not: t.id } }, orderBy: { dueAt: "asc" } });
          await tx.lead.update({ where: { id: t.leadId }, data: { nextFollowUpAt: next?.dueAt ?? null } });
        }
      }
    });
    return { ok: true as const, message: status === "COMPLETED" ? "Task completed." : status === "CANCELLED" ? "Task cancelled." : "Task updated." };
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€ Notes â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function addNoteAction(contactId: string, leadId: string | null, input: z.input<typeof noteSchema>) {
  return runAction(async () => {
    const user = await requireUser("notes.manage");
    await accessibleContact(user, contactId);
    const lead = leadId ? await accessibleLead(user, leadId) : null;
    const v = noteSchema.parse(input);
    const dealershipId = isCentral(user) && v.centralOnly ? null : contextDealershipId(user, lead?.dealershipId);
    await db.$transaction(async (tx) => {
      await tx.note.create({ data: { contactId, leadId: lead?.id ?? null, dealershipId, authorId: user.id, body: v.body, isPinned: v.isPinned, visibility: v.visibility } });
      await logActivity(tx, { type: "NOTE_ADDED", title: v.visibility === "CUSTOMER_SHAREABLE" ? "Note added (approved for customer communication)" : "Internal note added", body: v.body.slice(0, 280), contactId, leadId: lead?.id ?? null, dealershipId, userId: user.id });
    });
    return { ok: true as const, message: "Note added." };
  });
}

export async function updateNoteAction(noteId: string, input: { body?: string; isPinned?: boolean; visibility?: "INTERNAL" | "CUSTOMER_SHAREABLE" }) {
  return runAction(async () => {
    const user = await requireUser("notes.manage");
    const note = await db.note.findFirst({ where: { AND: [{ id: noteId }, childScope(user)] } });
    if (!note || !note.contactId) throw notFound();
    await accessibleContact(user, note.contactId);
    // Only the author can edit the text; anyone in scope may pin/unpin.
    if (input.body !== undefined && note.authorId !== user.id) throw forbidden("Only the author can edit this note.");
    const body = input.body !== undefined ? z.string().trim().min(1).max(5000).parse(input.body) : undefined;
    await db.note.update({ where: { id: noteId }, data: { body, isPinned: input.isPinned, visibility: input.visibility } });
    return { ok: true as const, message: "Note saved." };
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€ Documents â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function uploadDocumentAction(contactId: string, formData: FormData) {
  return runAction(async () => {
    const user = await requireUser("documents.manage");
    await accessibleContact(user, contactId);
    const leadId = (formData.get("leadId") as string) || null;
    const lead = leadId ? await accessibleLead(user, leadId) : null;
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Choose a file to upload.", "VALIDATION", { file: "Required" });
    const meta = z
      .object({ name: z.string().trim().max(160).optional(), category: z.enum(DOC_CATEGORIES).default("Other"), description: z.string().trim().max(500).optional() })
      .parse({ name: formData.get("name") || undefined, category: formData.get("category") || undefined, description: formData.get("description") || undefined });
    const data = await putUpload(file, { kind: "document", uploadedById: user.id, folder: "documents" });
    const dealershipId = contextDealershipId(user, lead?.dealershipId);
    await db.$transaction(async (tx) => {
      const stored = await tx.storedFile.create({ data });
      await tx.document.create({ data: { contactId, leadId: lead?.id ?? null, dealershipId, fileId: stored.id, name: meta.name || data.originalName, category: meta.category, description: meta.description, uploadedById: user.id } });
      await logActivity(tx, { type: "DOCUMENT_UPLOADED", title: `Document uploaded: ${meta.name || data.originalName}`, contactId, leadId: lead?.id ?? null, dealershipId, userId: user.id });
      await audit({ userId: user.id, action: "document.uploaded", entityType: "Contact", entityId: contactId, changes: { file: data.originalName } }, tx);
    });
    return { ok: true as const, message: "Document uploaded." };
  });
}

export async function deleteDocumentAction(documentId: string) {
  return runAction(async () => {
    const user = await requireUser("documents.manage");
    const doc = await db.document.findFirst({ where: { AND: [{ id: documentId, deletedAt: null }, childScope(user)] } });
    if (!doc) throw notFound();
    await accessibleContact(user, doc.contactId);
    // Soft delete: the file stays in storage for audit/retention; it is no longer listed or downloadable.
    await db.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    await audit({ userId: user.id, action: "document.removed", entityType: "Document", entityId: documentId });
    return { ok: true as const, message: "Document removed." };
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€ Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function recordPaymentAction(contactId: string, input: z.input<typeof paymentSchema>) {
  return runAction(async () => {
    const user = await requireUser("payments.manage");
    await accessibleContact(user, contactId);
    const v = paymentSchema.parse(input);
    const lead = v.leadId ? await accessibleLead(user, v.leadId) : null;
    const dealershipId = contextDealershipId(user, lead?.dealershipId);
    const reference = `PAY-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    await db.$transaction(async (tx) => {
      const p = await tx.payment.create({ data: { ...v, reference, contactId, leadId: lead?.id ?? null, dealershipId, recordedById: user.id, isVerified: false } });
      await logActivity(tx, { type: "PAYMENT_RECORDED", title: `Payment recorded: ${v.currency} ${v.amount.toLocaleString()} (${v.status.toLowerCase()})`, body: v.description, contactId, leadId: lead?.id ?? null, dealershipId, userId: user.id, metadata: { paymentId: p.id } });
      await audit({ userId: user.id, action: "payment.recorded", entityType: "Payment", entityId: p.id, changes: { amount: v.amount, currency: v.currency, status: v.status } }, tx);
    });
    return { ok: true as const, message: `Payment ${reference} recorded.` };
  });
}

export async function updatePaymentStatusAction(paymentId: string, status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED") {
  return runAction(async () => {
    const user = await requireUser("payments.manage");
    const p = await db.payment.findFirst({ where: { AND: [{ id: paymentId }, childScope(user)] } });
    if (!p) throw notFound();
    await accessibleContact(user, p.contactId);
    await db.payment.update({ where: { id: paymentId }, data: { status } });
    await audit({ userId: user.id, action: "payment.status_changed", entityType: "Payment", entityId: paymentId, changes: { status: { from: p.status, to: status } } });
    return { ok: true as const, message: "Payment updated." };
  });
}
