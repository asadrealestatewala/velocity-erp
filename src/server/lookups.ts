import "server-only";
import { db } from "@/lib/db";

/** Reference data used by filters and forms (all configurable in Settings). */
export async function lookups() {
  const [cities, provinces, dealerships, sources, stages, models, lossReasons] = await Promise.all([
    db.city.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, provinceId: true } }),
    db.province.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.dealership.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true, cityId: true, status: true, acceptsLeads: true } }),
    db.leadSource.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, key: true } }),
    db.leadStage.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, key: true, color: true, kind: true } }),
    db.bikeModel.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true, code: true } }),
    db.lossReason.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return { cities, provinces, dealerships, sources, stages, models, lossReasons };
}

export type Lookups = Awaited<ReturnType<typeof lookups>>;

export const opt = <T extends { id: string; name: string }>(rows: T[]) => rows.map((r) => ({ value: r.id, label: r.name }));
