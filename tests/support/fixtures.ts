import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { DEFAULT_ROLES, PERMISSIONS } from "@/lib/permissions";
import { DEALERSHIP_APPLICATION_FORM, GENERAL_INQUIRY_FORM, TEST_DRIVE_FORM } from "@/lib/forms/defaults";
import { DEFAULT_SETTINGS } from "@/server/settings";
import { loadUser } from "@/server/auth/session";

/** Wipes every table in the test database (test DB only — guarded in load-env). */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename !~ '^_'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

const HASH = bcrypt.hashSync("Test-Password-123", 4);

export type World = Awaited<ReturnType<typeof buildWorld>>;

/** A small, deterministic world: 2 cities, 3 outlets (2 in Lahore), staff for each, forms published. */
export async function buildWorld() {
  await resetDb();
  await db.setting.create({ data: { key: "system", value: { ...DEFAULT_SETTINGS, testDrive: { minLeadHours: 0, maxDaysAhead: 60 } } } });
  for (const [key, p] of Object.entries(PERMISSIONS)) await db.permission.create({ data: { key, group: p.group, description: p.description } });
  const perms = Object.fromEntries((await db.permission.findMany()).map((p) => [p.key, p.id]));
  const roles: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const role = await db.role.create({ data: { key: r.key, name: r.name, scope: r.scope, isSystem: true, permissions: { create: r.permissions.map((k) => ({ permissionId: perms[k]! })) } } });
    roles[r.key] = role.id;
  }
  const user = (email: string, role: string) => db.user.create({ data: { email, name: email.split("@")[0]!, passwordHash: HASH, roleId: roles[role]! } });
  const admin = await user("admin@test.local", "SUPER_ADMIN");
  const staff = await user("staff@test.local", "CRM_STAFF");
  const mgmt = await user("mgmt@test.local", "MANAGEMENT");

  const punjab = await db.province.create({ data: { name: "Punjab" } });
  const sindh = await db.province.create({ data: { name: "Sindh" } });
  const lahore = await db.city.create({ data: { name: "Lahore", provinceId: punjab.id } });
  const karachi = await db.city.create({ data: { name: "Karachi", provinceId: sindh.id } });
  const multan = await db.city.create({ data: { name: "Multan", provinceId: punjab.id } });

  const m1 = await db.bikeModel.create({ data: { name: "Model One", code: "M1" } });
  const m2 = await db.bikeModel.create({ data: { name: "Model Two", code: "M2" } });
  const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "09:00", close: "21:00" }]));
  const dealer = async (code: string, cityId: string, models: string[], extra: Partial<Prisma.DealershipUncheckedCreateInput> = {}) =>
    db.dealership.create({ data: { code, name: `Dealer ${code}`, cityId, status: "ACTIVE", acceptsLeads: true, operatingHours: hours, bikeModels: { create: models.map((bikeModelId) => ({ bikeModelId })) }, ...extra } });
  const A = await dealer("A", lahore.id, [m1.id, m2.id]);
  const B = await dealer("B", lahore.id, [m1.id]);
  const K = await dealer("K", karachi.id, [m1.id, m2.id]);

  const member = async (email: string, dealershipId: string, role: "MANAGER" | "SALES_REP") => {
    const u = await user(email, role === "MANAGER" ? "DEALER_MANAGER" : "DEALER_REP");
    await db.dealershipMembership.create({ data: { userId: u.id, dealershipId, role } });
    return u;
  };
  const aManager = await member("a.manager@test.local", A.id, "MANAGER");
  const aRep = await member("a.rep@test.local", A.id, "SALES_REP");
  const aRep2 = await member("a.rep2@test.local", A.id, "SALES_REP");
  const bManager = await member("b.manager@test.local", B.id, "MANAGER");
  const bRep = await member("b.rep@test.local", B.id, "SALES_REP");

  const stageDefs = [["NEW", "OPEN"], ["CONTACTED", "OPEN"], ["QUALIFIED", "OPEN"], ["TEST_DRIVE_SCHEDULED", "OPEN"], ["TEST_DRIVE_COMPLETED", "OPEN"], ["CONVERTED", "WON"], ["LOST", "LOST"]] as const;
  const stages: Record<string, string> = {};
  for (const [i, [key, kind]] of stageDefs.entries()) stages[key] = (await db.leadStage.create({ data: { key, name: key, kind, sortOrder: (i + 1) * 10, isDefault: key === "NEW" } })).id;
  const loss = await db.lossReason.create({ data: { name: "Price" } });
  for (const [i, key] of ["WEBSITE", "FACEBOOK", "WALK_IN", "OTHER"].entries()) await db.leadSource.create({ data: { key, name: key, sortOrder: i } });
  await db.achievement.create({ data: { key: "TD", name: "Test Drive Specialist", description: "x", criteria: { eventType: "TEST_DRIVE_COMPLETED", count: 1 } } });

  const forms: Record<string, string> = {};
  for (const [type, def] of [["TEST_DRIVE", TEST_DRIVE_FORM], ["GENERAL_INQUIRY", GENERAL_INQUIRY_FORM], ["DEALERSHIP_APPLICATION", DEALERSHIP_APPLICATION_FORM]] as const) {
    const f = await db.form.create({ data: { slug: def.slug, name: def.name, type, status: "PUBLISHED", draftSchema: { fields: def.fields } as unknown as Prisma.InputJsonValue, draftSettings: def.settings as unknown as Prisma.InputJsonValue } });
    const v = await db.formVersion.create({ data: { formId: f.id, version: 1, schema: { fields: def.fields } as unknown as Prisma.InputJsonValue, settings: def.settings as unknown as Prisma.InputJsonValue } });
    await db.form.update({ where: { id: f.id }, data: { publishedVersionId: v.id } });
    forms[type] = f.id;
  }

  return { roles, admin, staff, mgmt, lahore, karachi, multan, punjab, m1, m2, A, B, K, aManager, aRep, aRep2, bManager, bRep, stages, loss, forms };
}

export async function asUser(id: string) {
  const u = await loadUser(id);
  if (!u) throw new Error("user not found");
  return u;
}

/** A future weekday date/time inside the fixture's opening hours. */
export function futureSlot(daysAhead = 3, time = "11:00") {
  const d = new Date(Date.now() + daysAhead * 86400_000);
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return { date: iso, time };
}

export function testDriveRaw(w: World, over: Record<string, string> = {}) {
  const { date, time } = futureSlot();
  return {
    first_name: "Ali", last_name: "Khan", phone: "0300 1234567", email: "ali@example.com",
    test_drive_date: date, test_drive_time: time, city: w.lahore.id, outlet: w.A.id, bike_model: w.m1.id, consent: "on",
    ...over,
  } as Record<string, string>;
}
