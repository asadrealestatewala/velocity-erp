import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/auth/session";
import { vehiclesForContact } from "@/server/services/vehicles";
import { can, childScope, contactScope, isCentral, leadScope, taskScope, testDriveScope } from "@/server/authz";

export async function getContactDetail(user: CurrentUser, id: string, selectedLeadId?: string) {
  const contact = await db.contact.findFirst({
    where: { AND: [{ id }, contactScope(user)] },
    include: {
      city: true, province: true, source: true, owner: { select: { id: true, name: true } }, createdBy: { select: { name: true } },
    },
  });
  if (!contact) return null;

  const leads = await db.lead.findMany({
    where: { AND: [{ contactId: id }, leadScope(user)] },
    orderBy: { createdAt: "desc" },
    include: {
      stage: true, source: true, originalSource: true, dealership: { select: { id: true, name: true, code: true } },
      originDealership: { select: { name: true } }, assignedUser: { select: { id: true, name: true } }, owner: { select: { name: true } },
      interestedModel: { select: { id: true, name: true } }, soldModel: { select: { name: true } }, preferredDealership: { select: { name: true } },
      lossReason: { select: { name: true } }, sourceForm: { select: { name: true } }, city: { select: { name: true } },
    },
  });
  const lead = leads.find((l) => l.id === selectedLeadId) ?? leads.find((l) => l.id === contact.currentLeadId) ?? leads[0] ?? null;
  const leadIds = leads.map((l) => l.id);
  const child = childScope(user);
  // Central users see everything; dealership users only child records of their own dealership(s).
  const childWhere = { contactId: id, ...child };

  const [activities, tasks, notes, documents, payments, testDrives, stageHistory, assignmentHistory, submissions, avatar, vehicles] = await Promise.all([
    db.activity.findMany({ where: childWhere, orderBy: { occurredAt: "desc" }, take: 200, include: { user: { select: { name: true } } } }),
    can(user, "tasks.manage")
      ? db.task.findMany({ where: { AND: [{ contactId: id }, taskScope(user)] }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], include: { assignedTo: { select: { id: true, name: true } } } })
      : Promise.resolve([]),
    db.note.findMany({ where: childWhere, orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }], include: { author: { select: { id: true, name: true } } } }),
    can(user, "documents.view")
      ? db.document.findMany({ where: { ...childWhere, deletedAt: null }, orderBy: { createdAt: "desc" }, include: { file: { select: { id: true, originalName: true, mimeType: true, size: true } }, uploadedBy: { select: { name: true } } } })
      : Promise.resolve([]),
    can(user, "payments.view")
      ? db.payment.findMany({ where: childWhere, orderBy: { paymentDate: "desc" }, include: { recordedBy: { select: { name: true } } } })
      : Promise.resolve([]),
    db.testDriveBooking.findMany({
      where: { AND: [{ contactId: id }, testDriveScope(user)] },
      orderBy: { scheduledAt: "desc" },
      include: { bikeModel: { select: { name: true } }, dealership: { select: { name: true } }, assignedUser: { select: { name: true } } },
    }),
    db.leadStageHistory.findMany({ where: { leadId: { in: leadIds } }, orderBy: { changedAt: "desc" }, include: { fromStage: true, toStage: true, changedBy: { select: { name: true } } } }),
    db.leadAssignmentHistory.findMany({
      where: { leadId: { in: leadIds }, ...(isCentral(user) ? {} : { OR: [{ toDealershipId: { in: user.memberships.map((m) => m.dealershipId) } }, { fromDealershipId: { in: user.memberships.map((m) => m.dealershipId) } }] }) },
      orderBy: { createdAt: "desc" },
      include: { fromDealership: { select: { name: true } }, toDealership: { select: { name: true } }, fromUser: { select: { name: true } }, toUser: { select: { name: true } }, assignedBy: { select: { name: true } } },
    }),
    isCentral(user) && can(user, "submissions.view")
      ? db.formSubmission.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" }, include: { form: { select: { name: true } } } })
      : Promise.resolve([]),
    contact.avatarFileId ? Promise.resolve(contact.avatarFileId) : Promise.resolve(null),
    vehiclesForContact(user, id),
  ]);

  return { contact, leads, lead, activities, tasks, notes, documents, payments, testDrives, stageHistory, assignmentHistory, submissions, avatarFileId: avatar, vehicles };
}

export type ContactDetail = NonNullable<Awaited<ReturnType<typeof getContactDetail>>>;
