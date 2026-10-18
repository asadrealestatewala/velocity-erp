import "server-only";
import { db as defaultDb } from "@/lib/db";
import { DEFAULT_GRANT_UPGRADES, DEFAULT_ROLES, PERMISSIONS } from "@/lib/permissions";
import type { PrismaClient } from "@prisma/client";

/**
 * Brings the database in line with the permission catalogue in code. Safe to run repeatedly:
 *  - adds permission rows that don't exist yet and refreshes descriptions;
 *  - creates default roles that don't exist yet (e.g. Procurement & Accounts) with their default grants;
 *  - for roles that already exist, grants ONLY permissions that are newly introduced by this run.
 *    A grant an administrator deliberately removed earlier is never silently restored.
 */
export async function syncPermissionCatalog(client: PrismaClient = defaultDb) {
  const existing = new Set((await client.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const created: string[] = [];
  for (const [key, p] of Object.entries(PERMISSIONS)) {
    if (existing.has(key)) {
      await client.permission.update({ where: { key }, data: { group: p.group, description: p.description } });
    } else {
      await client.permission.create({ data: { key, group: p.group, description: p.description } });
      created.push(key);
    }
  }
  const ids = Object.fromEntries((await client.permission.findMany()).map((p) => [p.key, p.id]));

  const rolesCreated: string[] = [];
  let grantsAdded = 0;
  for (const def of DEFAULT_ROLES) {
    const role = await client.role.findUnique({ where: { key: def.key } });
    if (!role) {
      const r = await client.role.create({ data: { key: def.key, name: def.name, description: def.description, scope: def.scope, isSystem: true } });
      await client.rolePermission.createMany({ data: def.permissions.map((k) => ({ roleId: r.id, permissionId: ids[k]! })), skipDuplicates: true });
      rolesCreated.push(def.key);
      grantsAdded += def.permissions.length;
      continue;
    }
    const fresh = def.permissions.filter((k) => created.includes(k));
    if (fresh.length) {
      const res = await client.rolePermission.createMany({ data: fresh.map((k) => ({ roleId: role.id, permissionId: ids[k]! })), skipDuplicates: true });
      grantsAdded += res.count;
    }
  }
  // One-time default-grant upgrades for roles that already existed before they were introduced.
  const row = await client.setting.findUnique({ where: { key: "permission-upgrades" } });
  const applied = new Set(((row?.value ?? {}) as { applied?: string[] }).applied ?? []);
  const newlyApplied: string[] = [];
  for (const up of DEFAULT_GRANT_UPGRADES) {
    if (applied.has(up.id)) continue;
    for (const [roleKey, keys] of Object.entries(up.grants)) {
      const role = await client.role.findUnique({ where: { key: roleKey } });
      if (!role) continue;
      const res = await client.rolePermission.createMany({ data: keys.map((k) => ({ roleId: role.id, permissionId: ids[k]! })), skipDuplicates: true });
      grantsAdded += res.count;
    }
    newlyApplied.push(up.id);
  }
  if (newlyApplied.length) {
    const value = { applied: [...applied, ...newlyApplied] };
    await client.setting.upsert({ where: { key: "permission-upgrades" }, create: { key: "permission-upgrades", value }, update: { value } });
  }
  return { permissionsCreated: created.length, rolesCreated, grantsAdded, upgradesApplied: newlyApplied };
}
