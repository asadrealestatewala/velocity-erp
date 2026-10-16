/**
 * Seed script — FICTIONAL DEMONSTRATION DATA ONLY.
 * All people, dealerships, phone numbers and bike models below are invented examples.
 * Bike models carry no official YADEA specifications or prices; replace them with
 * administrator-entered data before going live.
 *
 * Run:  npm run db:seed   (refuses to run when NODE_ENV=production unless ALLOW_PROD_SEED=1)
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLES, PERMISSIONS } from "../src/lib/permissions";
import { DEALERSHIP_APPLICATION_FORM, GENERAL_INQUIRY_FORM, TEST_DRIVE_FORM } from "../src/lib/forms/defaults";
import { DEFAULT_SETTINGS } from "../src/server/settings";
import { createLead, changeStage, recordInteraction } from "../src/server/services/leads";
import { assignLead } from "../src/server/services/assignment";
import { normalizeEmail, normalizePhone } from "../src/lib/utils";
import { award } from "../src/server/services/gamification";

const db = new PrismaClient();

// Local development password for every seeded account. Override with SEED_PASSWORD.
// NEVER use seeded accounts or this password in production.
const DEV_PASSWORD = process.env.SEED_PASSWORD || "Yadea@Dev2026";

// Deterministic PRNG so the demo looks the same on every machine
let s = 42;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
const daysAgo = (d: number, h = 10) => {
  const x = new Date();
  x.setDate(x.getDate() - d);
  x.setHours(h, Math.floor(rnd() * 60), 0, 0);
  // Never in the future (for "today" dates)
  return x.getTime() > Date.now() - 3600_000 ? new Date(Date.now() - 3600_000 - Math.floor(rnd() * 3) * 3600_000) : x;
};

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
    throw new Error("Refusing to seed demo data in production.");
  }
  console.log("Seeding YADEA CRM demo data…");

  await db.setting.upsert({ where: { key: "system" }, create: { key: "system", value: DEFAULT_SETTINGS }, update: {} });

  // ── Permissions & roles
  for (const [key, p] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({ where: { key }, create: { key, group: p.group, description: p.description }, update: { group: p.group, description: p.description } });
  }
  const perms = await db.permission.findMany();
  const permId = Object.fromEntries(perms.map((p) => [p.key, p.id]));
  const roles: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const role = await db.role.upsert({
      where: { key: r.key },
      create: { key: r.key, name: r.name, description: r.description, scope: r.scope, isSystem: true },
      update: { name: r.name, description: r.description, scope: r.scope },
    });
    roles[r.key] = role.id;
    const existing = await db.rolePermission.count({ where: { roleId: role.id } });
    if (!existing) {
      await db.rolePermission.createMany({ data: r.permissions.map((k) => ({ roleId: role.id, permissionId: permId[k]! })) });
    }
  }

  if (await db.user.count()) {
    console.log("Users already exist — skipping demo records (run `npm run db:reset` for a clean demo).");
    return;
  }

  const hash = await bcrypt.hash(DEV_PASSWORD, 12);
  const dept = await db.department.create({ data: { name: "Sales & Marketing" } });
  await db.department.create({ data: { name: "Dealer Development" } });
  const mkUser = (email: string, name: string, role: string, phone?: string) =>
    db.user.create({ data: { email, name, phone, passwordHash: hash, roleId: roles[role]!, departmentId: role === "CRM_STAFF" ? dept.id : null } });

  const admin = await mkUser("admin@yadea-demo.local", "Ayesha Admin (Demo)", "SUPER_ADMIN");
  const mgmt = await mkUser("management@yadea-demo.local", "Bilal Management (Demo)", "MANAGEMENT");
  const crm1 = await mkUser("crm1@yadea-demo.local", "Sana CRM (Demo)", "CRM_STAFF");
  const crm2 = await mkUser("crm2@yadea-demo.local", "Omar CRM (Demo)", "CRM_STAFF");

  // ── Locations (configurable data, not a permanent list)
  const provinces = {
    punjab: await db.province.create({ data: { name: "Punjab", sortOrder: 1 } }),
    sindh: await db.province.create({ data: { name: "Sindh", sortOrder: 2 } }),
    kp: await db.province.create({ data: { name: "Khyber Pakhtunkhwa", sortOrder: 3 } }),
    ict: await db.province.create({ data: { name: "Islamabad Capital Territory", sortOrder: 4 } }),
  };
  const city = async (name: string, provinceId: string, sortOrder: number) => db.city.create({ data: { name, provinceId, sortOrder } });
  const cities = {
    lahore: await city("Lahore", provinces.punjab.id, 1),
    faisalabad: await city("Faisalabad", provinces.punjab.id, 2),
    multan: await city("Multan", provinces.punjab.id, 3),
    rawalpindi: await city("Rawalpindi", provinces.punjab.id, 4),
    karachi: await city("Karachi", provinces.sindh.id, 5),
    hyderabad: await city("Hyderabad", provinces.sindh.id, 6),
    peshawar: await city("Peshawar", provinces.kp.id, 7),
    islamabad: await city("Islamabad", provinces.ict.id, 8),
  };

  // ── Bike models (fictional seed examples — no official specs/prices)
  const models = await Promise.all(
    [
      { name: "Sample E-Moped S1", code: "DEMO-EM-S1", category: "E-Moped" },
      { name: "Sample E-Moped S2", code: "DEMO-EM-S2", category: "E-Moped" },
      { name: "Sample E-Bike C1", code: "DEMO-EB-C1", category: "E-Bike" },
      { name: "Sample E-Kick Scooter K1", code: "DEMO-KS-K1", category: "E-Kick Scooter" },
      { name: "Sample E-Moped Legacy", code: "DEMO-EM-L0", category: "E-Moped", isActive: false, availability: "DISCONTINUED" as const },
    ].map((m, i) =>
      db.bikeModel.create({
        data: {
          ...m,
          displayOrder: i + 1,
          isSeedExample: true,
          description: "Seed example for demonstration — replace with administrator-entered official product data.",
          specifications: { note: "Specifications to be entered by an administrator" },
        },
      }),
    ),
  );
  const activeModels = models.filter((m) => m.isActive);

  // ── Dealerships / outlets (fictional)
  const weekHours = Object.fromEntries(
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, d === "sun" ? { open: "10:00", close: "18:00", closed: true } : { open: "10:00", close: "20:00" }]),
  );
  const mkDealer = (data: Omit<Prisma.DealershipUncheckedCreateInput, "operatingHours"> & { modelIds?: string[] }) => {
    const { modelIds, ...rest } = data;
    return db.dealership.create({
      data: {
        ...rest,
        operatingHours: weekHours,
        testDriveSlotCapacity: 2,
        bikeModels: { create: (modelIds ?? activeModels.map((m) => m.id)).map((id) => ({ bikeModelId: id })) },
      },
    });
  };
  const d = {
    lhr1: await mkDealer({ code: "LHR-01", name: "Gulberg E-Mobility (Demo)", type: "DEALERSHIP", legalName: "Gulberg E-Mobility Pvt Ltd (Demo)", contactName: "Hamza Manager", email: "gulberg@demo-dealer.local", phone: "+92 300 0000101", provinceId: provinces.punjab.id, cityId: cities.lahore.id, address: "12 Demo Boulevard, Gulberg III", status: "ACTIVE", acceptsLeads: true, openingDate: daysAgo(400) }),
    lhr2: await mkDealer({ code: "LHR-02", name: "DHA Ride Hub (Demo)", type: "OUTLET", contactName: "Zara Manager", email: "dha@demo-dealer.local", phone: "+92 300 0000102", provinceId: provinces.punjab.id, cityId: cities.lahore.id, address: "45 Demo Avenue, DHA Phase 5", status: "ACTIVE", acceptsLeads: true, openingDate: daysAgo(200), modelIds: activeModels.slice(0, 3).map((m) => m.id) }),
    khi1: await mkDealer({ code: "KHI-01", name: "Clifton EV Center (Demo)", type: "DEALERSHIP", contactName: "Faisal Manager", email: "clifton@demo-dealer.local", phone: "+92 300 0000103", provinceId: provinces.sindh.id, cityId: cities.karachi.id, address: "7 Demo Road, Clifton Block 5", status: "ACTIVE", acceptsLeads: true, openingDate: daysAgo(300) }),
    isb1: await mkDealer({ code: "ISB-01", name: "Blue Area Motors (Demo)", type: "FRANCHISE", contactName: "Nadia Manager", email: "bluearea@demo-dealer.local", phone: "+92 300 0000104", provinceId: provinces.ict.id, cityId: cities.islamabad.id, address: "Demo Plaza, Blue Area", status: "ACTIVE", acceptsLeads: true, openingDate: daysAgo(150) }),
    fsd1: await mkDealer({ code: "FSD-01", name: "Faisalabad Volt (Demo — onboarding)", type: "DEALERSHIP", provinceId: provinces.punjab.id, cityId: cities.faisalabad.id, address: "Demo Market, D Ground", status: "PENDING", acceptsLeads: false }),
    pew1: await mkDealer({ code: "PEW-01", name: "Peshawar Wheels (Demo — suspended)", type: "SUB_DEALER", provinceId: provinces.kp.id, cityId: cities.peshawar.id, address: "Demo Street, University Road", status: "SUSPENDED", acceptsLeads: false }),
  };

  const dealerStaff: Record<string, { manager: string; reps: string[] }> = {};
  const staff = [
    { key: "lhr1", dealer: d.lhr1, mgr: ["manager.gulberg@yadea-demo.local", "Hamza Gulberg (Demo)"], reps: [["rep1.gulberg@yadea-demo.local", "Ali Rep (Demo)"], ["rep2.gulberg@yadea-demo.local", "Hina Rep (Demo)"]] },
    { key: "lhr2", dealer: d.lhr2, mgr: ["manager.dha@yadea-demo.local", "Zara DHA (Demo)"], reps: [["rep1.dha@yadea-demo.local", "Usman Rep (Demo)"]] },
    { key: "khi1", dealer: d.khi1, mgr: ["manager.clifton@yadea-demo.local", "Faisal Clifton (Demo)"], reps: [["rep1.clifton@yadea-demo.local", "Mehwish Rep (Demo)"], ["rep2.clifton@yadea-demo.local", "Kamran Rep (Demo)"]] },
    { key: "isb1", dealer: d.isb1, mgr: ["manager.bluearea@yadea-demo.local", "Nadia Blue Area (Demo)"], reps: [["rep1.bluearea@yadea-demo.local", "Saad Rep (Demo)"]] },
  ] as const;
  for (const st of staff) {
    const m = await mkUser(st.mgr[0], st.mgr[1], "DEALER_MANAGER");
    await db.dealershipMembership.create({ data: { userId: m.id, dealershipId: st.dealer.id, role: "MANAGER" } });
    const reps: string[] = [];
    for (const [email, name] of st.reps) {
      const r = await mkUser(email, name, "DEALER_REP");
      await db.dealershipMembership.create({ data: { userId: r.id, dealershipId: st.dealer.id, role: "SALES_REP" } });
      reps.push(r.id);
    }
    dealerStaff[st.key] = { manager: m.id, reps };
  }

  // ── Pipeline configuration
  const stageDefs = [
    ["NEW", "New Lead", "#3b82f6", "OPEN"],
    ["CONTACT_ATTEMPTED", "Contact Attempted", "#8b5cf6", "OPEN"],
    ["CONTACTED", "Contacted", "#06b6d4", "OPEN"],
    ["QUALIFIED", "Qualified", "#14b8a6", "OPEN"],
    ["TEST_DRIVE_SCHEDULED", "Test Drive Scheduled", "#f59e0b", "OPEN"],
    ["TEST_DRIVE_COMPLETED", "Test Drive Completed", "#f97316", "OPEN"],
    ["NEGOTIATION", "Negotiation", "#ec4899", "OPEN"],
    ["CONVERTED", "Converted", "#16a34a", "WON"],
    ["LOST", "Lost", "#ef4444", "LOST"],
  ] as const;
  const stages: Record<string, string> = {};
  for (const [i, [key, name, color, kind]] of stageDefs.entries()) {
    const st = await db.leadStage.create({ data: { key, name, color, kind, sortOrder: (i + 1) * 10, isDefault: key === "NEW", notifyOnEnter: key === "CONVERTED" || key === "NEGOTIATION" } });
    stages[key] = st.id;
  }
  const lossReasons: { id: string }[] = [];
  for (const [i, name] of ["Price", "Model unavailable", "No response", "Competitor selected", "Purchase postponed", "Other"].entries()) {
    lossReasons.push(await db.lossReason.create({ data: { name, sortOrder: i } }));
  }
  const sourceDefs = ["Website", "Facebook", "Instagram", "TikTok", "Google", "Referral", "Phone Call", "Walk-in", "Email", "SMS", "WhatsApp", "Event", "Other"];
  const sources: Record<string, string> = {};
  for (const [i, name] of sourceDefs.entries()) {
    const key = name.toUpperCase().replace(/[^A-Z]+/g, "_");
    sources[key] = (await db.leadSource.create({ data: { key, name, sortOrder: i } })).id;
  }

  await db.customFieldDefinition.create({ data: { entity: "CONTACT", key: "preferred_color", label: "Preferred colour", type: "SELECT", options: ["Black", "White", "Red", "Blue", "Grey"], sortOrder: 1 } });
  await db.customFieldDefinition.create({ data: { entity: "CONTACT", key: "financing_interest", label: "Interested in financing", type: "CHECKBOX", sortOrder: 2 } });

  // ── Forms (published, version 1)
  const forms: Record<string, { id: string; versionId: string }> = {};
  for (const [type, def] of [["TEST_DRIVE", TEST_DRIVE_FORM], ["GENERAL_INQUIRY", GENERAL_INQUIRY_FORM], ["DEALERSHIP_APPLICATION", DEALERSHIP_APPLICATION_FORM]] as const) {
    const form = await db.form.create({
      data: {
        slug: def.slug, name: def.name, type, status: "PUBLISHED", description: def.description,
        draftSchema: { fields: def.fields } as unknown as Prisma.InputJsonValue, draftSettings: def.settings as unknown as Prisma.InputJsonValue, createdById: admin.id,
      },
    });
    const v = await db.formVersion.create({ data: { formId: form.id, version: 1, schema: { fields: def.fields } as unknown as Prisma.InputJsonValue, settings: def.settings as unknown as Prisma.InputJsonValue, publishedById: admin.id } });
    await db.form.update({ where: { id: form.id }, data: { publishedVersionId: v.id } });
    forms[type] = { id: form.id, versionId: v.id };
  }

  // ── Gamification config
  const achievements = [
    ["QUICK_RESPONDER", "Quick Responder", "Responded to 5 new leads within the response window", "zap", { eventType: "FAST_RESPONSE_BONUS", count: 5 }],
    ["FOLLOW_UP_CHAMPION", "Follow-up Champion", "Completed 10 follow-ups", "repeat", { eventType: "FOLLOW_UP_COMPLETED", count: 10 }],
    ["TEST_DRIVE_SPECIALIST", "Test Drive Specialist", "Completed 5 test drives", "bike", { eventType: "TEST_DRIVE_COMPLETED", count: 5 }],
    ["CONVERSION_ACHIEVER", "Conversion Achiever", "Converted 3 leads into customers", "trophy", { eventType: "LEAD_CONVERTED", count: 3 }],
    ["TEAM_PLAYER", "Team Player", "Earned 100 performance points", "users", { totalPoints: 100 }],
    ["CONSISTENCY_CHAMPION", "Consistency Champion", "Completed 10 tasks on time", "calendar-check", { eventType: "TASK_ON_TIME", count: 10 }],
  ] as const;
  for (const [key, name, description, icon, criteria] of achievements) {
    await db.achievement.create({ data: { key, name, description, icon, criteria } });
  }
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
  for (const dl of [d.lhr1, d.lhr2, d.khi1, d.isb1]) {
    await db.goal.createMany({
      data: [
        { name: "Monthly conversions", metric: "CONVERSIONS", targetValue: 6, dealershipId: dl.id, startsAt: monthStart, endsAt: monthEnd },
        { name: "Test drives completed", metric: "TEST_DRIVES_COMPLETED", targetValue: 10, dealershipId: dl.id, startsAt: monthStart, endsAt: monthEnd },
        { name: "Avg. first response (hours)", metric: "RESPONSE_TIME_HOURS", targetValue: 4, dealershipId: dl.id, startsAt: monthStart, endsAt: monthEnd },
        { name: "Follow-up completion %", metric: "FOLLOW_UP_COMPLETION_RATE", targetValue: 85, dealershipId: dl.id, startsAt: monthStart, endsAt: monthEnd },
      ],
    });
  }

  // ── Contacts & leads (fictional people)
  const first = ["Ahmed", "Fatima", "Usman", "Ayesha", "Hassan", "Maryam", "Zain", "Iqra", "Bilal", "Noor", "Hamza", "Sara", "Danish", "Amna", "Fahad", "Rabia", "Imran", "Sadia", "Tariq", "Hira", "Kashif", "Mahnoor", "Waqas", "Anum", "Junaid", "Saba", "Adeel", "Komal", "Yasir", "Laiba"];
  const last = ["Khan", "Ahmed", "Malik", "Hussain", "Butt", "Raza", "Sheikh", "Qureshi", "Chaudhry", "Siddiqui", "Mirza", "Abbasi"];
  const dealerByCity: Record<string, { key: string; id: string }[]> = {
    [cities.lahore.id]: [{ key: "lhr1", id: d.lhr1.id }, { key: "lhr2", id: d.lhr2.id }],
    [cities.karachi.id]: [{ key: "khi1", id: d.khi1.id }],
    [cities.islamabad.id]: [{ key: "isb1", id: d.isb1.id }],
  };
  const leadCities = [cities.lahore, cities.lahore, cities.lahore, cities.karachi, cities.karachi, cities.islamabad, cities.multan, cities.rawalpindi];
  const companySources = ["WEBSITE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "GOOGLE", "REFERRAL", "PHONE_CALL", "WHATSAPP", "EVENT", "EMAIL"];
  const stageFlow = ["NEW", "CONTACT_ATTEMPTED", "CONTACTED", "QUALIFIED", "TEST_DRIVE_SCHEDULED", "TEST_DRIVE_COMPLETED", "NEGOTIATION"];

  for (let i = 0; i < 64; i++) {
    const c = pick(leadCities);
    const isWalkIn = i % 5 === 4 && dealerByCity[c.id];
    const fn = first[i % first.length]!;
    const ln = pick(last);
    const phone = `+92 3${String(10 + (i % 40)).padStart(2, "0")} ${String(1000000 + i * 7919).slice(0, 7)}`;
    const email = i % 3 === 0 ? null : `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`;
    const created = daysAgo(Math.floor(rnd() * 85), 9 + Math.floor(rnd() * 9));
    const outlets = dealerByCity[c.id];
    const outlet = outlets ? pick(outlets) : null;
    const model = pick(activeModels.slice(0, outlet?.key === "lhr2" ? 3 : 4));
    const sourceKey = isWalkIn ? "WALK_IN" : pick(companySources);

    await db.$transaction(async (tx) => {
      const actingUser = isWalkIn && outlet ? pick([dealerStaff[outlet.key]!.manager, ...dealerStaff[outlet.key]!.reps]) : pick([crm1.id, crm2.id]);
      const contact = await tx.contact.create({
        data: {
          firstName: fn, lastName: ln, phone, phoneNormalized: normalizePhone(phone), email, emailNormalized: normalizeEmail(email),
          cityId: c.id, provinceId: c.provinceId, sourceId: sources[sourceKey], country: "Pakistan",
          gender: rnd() > 0.5 ? "Male" : "Female", profession: pick(["Student", "Engineer", "Teacher", "Business owner", "Doctor", "Banker", null]),
          consentMarketing: rnd() > 0.3, createdById: actingUser, ownerId: isWalkIn ? null : actingUser, createdAt: created,
        },
      });
      const lead = await createLead(tx, {
        contactId: contact.id,
        origin: isWalkIn ? "DEALERSHIP_WALK_IN" : "COMPANY",
        originDealershipId: isWalkIn && outlet ? outlet.id : null,
        inquiryType: isWalkIn ? "WALK_IN" : rnd() > 0.4 ? "TEST_DRIVE" : "GENERAL_INQUIRY",
        sourceId: sources[sourceKey],
        cityId: c.id,
        interestedModelId: model.id,
        preferredDealershipId: outlet?.id ?? null,
        description: isWalkIn ? "Visited the showroom and asked about range and charging." : "Interested in an electric two-wheeler for daily commute.",
        campaign: sourceKey === "FACEBOOK" || sourceKey === "INSTAGRAM" ? "Demo Spring Campaign" : null,
        createdById: actingUser,
        ownerId: isWalkIn ? null : actingUser,
      });

      // Leave a few company leads unassigned for the manual queue (incl. cities without outlets)
      const assignTo = outlet && !(i % 11 === 0 && !isWalkIn) ? outlet : null;
      if (assignTo) {
        const team = dealerStaff[assignTo.key]!;
        const rep = rnd() > 0.25 ? pick(team.reps) : null;
        await assignLead(tx, {
          leadId: lead.id, dealershipId: assignTo.id, userId: rep, type: isWalkIn ? "MANUAL" : rnd() > 0.5 ? "AUTOMATIC" : "MANUAL",
          reason: isWalkIn ? "Walk-in at own dealership" : "Seed assignment", assignedById: isWalkIn ? actingUser : crm1.id,
        });
      }

      // Progress through the pipeline
      const target = Math.floor(rnd() * 10); // 0..9
      const worker = assignTo ? (await tx.lead.findUnique({ where: { id: lead.id } }))!.assignedUserId ?? dealerStaff[assignTo.key]!.manager : actingUser;
      if (target >= 1) {
        await recordInteraction(tx, { leadId: lead.id, contactId: contact.id, type: pick(["CALL_LOGGED", "WHATSAPP_LOGGED"] as const), title: "Intro call", body: "Discussed models and pricing range.", outcome: "Interested", direction: "OUTBOUND", userId: worker, dealershipId: assignTo?.id ?? null });
      }
      const steps = Math.min(target, stageFlow.length - 1);
      for (let k = 1; k <= steps; k++) {
        await changeStage(tx, { leadId: lead.id, stageId: stages[stageFlow[k]!]!, userId: worker });
      }
      if (target === 8 && assignTo) {
        await changeStage(tx, { leadId: lead.id, stageId: stages.CONVERTED!, userId: worker, conversionValue: 150000 + Math.floor(rnd() * 20) * 5000, soldModelId: model.id, conversionNotes: "Seed conversion" });
        await tx.payment.create({
          data: { reference: `PAY-${1000 + i}`, contactId: contact.id, leadId: lead.id, dealershipId: assignTo.id, type: "BOOKING_FEE", amount: 25000, currency: "PKR", paymentDate: daysAgo(Math.floor(rnd() * 20)), method: pick(["CASH", "BANK_TRANSFER", "CARD"] as const), status: "PAID", description: "Booking fee (seed example)", recordedById: worker },
        });
      }
      if (target === 9) {
        await changeStage(tx, { leadId: lead.id, stageId: stages.LOST!, userId: worker, lossReasonId: pick(lossReasons).id, lossNotes: "Seed example loss" });
      }

      // Test drives for leads that reached those stages
      if (assignTo && steps >= 4) {
        const completed = steps >= 5;
        const when = completed ? daysAgo(Math.floor(rnd() * 20) + 1, 11 + Math.floor(rnd() * 6)) : (() => { const x = new Date(); x.setDate(x.getDate() + 1 + Math.floor(rnd() * 10)); x.setHours(11 + Math.floor(rnd() * 7), 0, 0, 0); return x; })();
        const booking = await tx.testDriveBooking.create({
          data: { contactId: contact.id, leadId: lead.id, dealershipId: assignTo.id, cityId: c.id, bikeModelId: model.id, scheduledAt: when, status: completed ? "COMPLETED" : pick(["REQUESTED", "CONFIRMED"] as const), completedAt: completed ? when : null, confirmedAt: completed ? when : null, assignedUserId: worker === dealerStaff[assignTo.key]!.manager ? null : worker, createdById: worker },
        });
        if (completed) await award(tx, { userId: worker, dealershipId: assignTo.id, type: "TEST_DRIVE_COMPLETED", uniqueKey: `td-complete:${booking.id}`, leadId: lead.id });
      }

      // Follow-up tasks
      if (target < 8) {
        const due = new Date(Date.now() + (rnd() * 6 - 2) * 86400_000);
        const assignee = assignTo ? worker : actingUser;
        await tx.task.create({
          data: { title: `Follow up with ${fn}`, description: "Check interest and next steps.", type: pick(["CALL", "FOLLOW_UP", "EMAIL"] as const), contactId: contact.id, leadId: lead.id, dealershipId: assignTo?.id ?? null, assignedToId: assignee, createdById: assignee, dueAt: due, priority: pick(["LOW", "MEDIUM", "HIGH"] as const), reminderMinutesBefore: 60 },
        });
        await tx.lead.update({ where: { id: lead.id }, data: { nextFollowUpAt: due } });
      }
      if (rnd() > 0.6) {
        await tx.note.create({ data: { contactId: contact.id, leadId: lead.id, dealershipId: assignTo?.id ?? null, authorId: worker, body: "Customer prefers evening calls. Asked about charging time and warranty.", isPinned: rnd() > 0.7 } });
      }

      // Backdate records so dashboards show realistic trends
      await tx.lead.update({ where: { id: lead.id }, data: { createdAt: created, assignedAt: assignTo ? new Date(created.getTime() + 3600_000) : null } });
      await tx.leadStageHistory.updateMany({ where: { leadId: lead.id, fromStageId: null }, data: { changedAt: created } });
      await tx.activity.updateMany({ where: { leadId: lead.id, type: { in: ["LEAD_CREATED", "LEAD_ASSIGNED"] } }, data: { occurredAt: created } });
    }, { timeout: 60000 });
  }

  // ── Dealership applications in different review states
  const apps = [
    { firstName: "Rashid", lastName: "Applicant", businessName: "Multan Motors (Demo)", city: cities.multan, status: "SUBMITTED" as const },
    { firstName: "Samina", lastName: "Applicant", businessName: "Hyderabad Auto House (Demo)", city: cities.hyderabad, status: "UNDER_REVIEW" as const },
    { firstName: "Javed", lastName: "Applicant", businessName: "Rawalpindi Riders (Demo)", city: cities.rawalpindi, status: "INFO_REQUIRED" as const },
    { firstName: "Nida", lastName: "Applicant", businessName: "Faisalabad Volt (Demo)", city: cities.faisalabad, status: "APPROVED" as const },
    { firstName: "Kamal", lastName: "Applicant", businessName: "Quick Bikes (Demo)", city: cities.peshawar, status: "REJECTED" as const },
  ];
  for (const [i, a] of apps.entries()) {
    const app = await db.dealershipApplication.create({
      data: {
        salutation: "Mr.", firstName: a.firstName, lastName: a.lastName, email: `${a.firstName.toLowerCase()}@applicant.example.com`, phone: `+92 333 00010${i}`,
        businessName: a.businessName, businessAddress: "Demo address", yearsInBusiness: 3 + i * 2, isOemDealer: i % 2 === 0,
        provinceId: a.city.provinceId, cityId: a.city.id, propertyOwnership: pick(["Owned", "Rented / Leased"]), businessStructure: pick(["Partnership", "Private Limited Company"]),
        status: a.status, consentGiven: true, consentText: DEFAULT_SETTINGS.consentText, consentAt: daysAgo(30 - i * 5), createdAt: daysAgo(30 - i * 5),
        reviewerId: a.status === "SUBMITTED" ? null : mgmt.id,
        infoRequest: a.status === "INFO_REQUIRED" ? "Please upload your showroom lease agreement." : null,
        decisionReason: a.status === "REJECTED" ? "Location already covered by an existing dealership." : a.status === "APPROVED" ? "Strong automotive track record." : null,
        approvedAt: a.status === "APPROVED" ? daysAgo(5) : null,
        rejectedAt: a.status === "REJECTED" ? daysAgo(3) : null,
        onboarding: a.status === "APPROVED" ? { verified: true, dealershipCreated: true } : {},
      },
    });
    await db.applicationStatusHistory.create({ data: { applicationId: app.id, toStatus: "SUBMITTED", note: "Submitted via public form", createdAt: daysAgo(30 - i * 5) } });
    if (a.status !== "SUBMITTED") await db.applicationStatusHistory.create({ data: { applicationId: app.id, fromStatus: "SUBMITTED", toStatus: a.status === "INFO_REQUIRED" || a.status === "REJECTED" || a.status === "APPROVED" ? "UNDER_REVIEW" : a.status, changedById: mgmt.id } });
    if (["INFO_REQUIRED", "REJECTED", "APPROVED"].includes(a.status)) await db.applicationStatusHistory.create({ data: { applicationId: app.id, fromStatus: "UNDER_REVIEW", toStatus: a.status, changedById: mgmt.id } });
    if (a.status === "APPROVED") await db.dealership.update({ where: { id: d.fsd1.id }, data: { applicationId: app.id } });
  }

  console.log("Seed complete.");
  console.log(`Demo accounts (local only): admin@yadea-demo.local, management@yadea-demo.local, crm1@yadea-demo.local,`);
  console.log(`  manager.gulberg@yadea-demo.local, rep1.gulberg@yadea-demo.local, manager.clifton@yadea-demo.local … (see README)`);
  console.log(`Password: value of SEED_PASSWORD, or the default documented in README (local development only).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
