import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { clientIp } from "@/server/request";
import { hashIdentifier, rateLimit } from "@/server/rate-limit";

/**
 * Public, unauthenticated option lookups for published forms.
 * Returns only public business information (names, outlet addresses) — never customer data.
 *
 *   ?source=cities[&provinceId=]   active cities
 *   ?source=provinces              active provinces
 *   ?source=bikeModels             active models
 *   ?source=outlets&cityId=…[&bikeModelId=]   ACTIVE outlets in that city that accept leads
 */
export async function GET(req: NextRequest) {
  const ip = await clientIp();
  if (!(await rateLimit(`options:${hashIdentifier(ip)}`, 120, 60))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const p = req.nextUrl.searchParams;
  const source = p.get("source");
  const headers = { "Cache-Control": "no-store" };

  switch (source) {
    case "provinces": {
      const rows = await db.province.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
      return NextResponse.json({ options: rows }, { headers });
    }
    case "cities": {
      const provinceId = p.get("provinceId");
      const rows = await db.city.findMany({
        where: { isActive: true, province: { isActive: true }, ...(provinceId ? { provinceId } : {}) },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      });
      return NextResponse.json({ options: rows }, { headers });
    }
    case "bikeModels": {
      const rows = await db.bikeModel.findMany({ where: { isActive: true, availability: { not: "DISCONTINUED" } }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } });
      return NextResponse.json({ options: rows }, { headers });
    }
    case "outlets": {
      const cityId = p.get("cityId");
      if (!cityId) return NextResponse.json({ options: [] }, { headers });
      const bikeModelId = p.get("bikeModelId");
      const rows = await db.dealership.findMany({
        where: {
          cityId,
          status: "ACTIVE",
          acceptsLeads: true,
          city: { isActive: true },
          ...(bikeModelId ? { bikeModels: { some: { bikeModelId } } } : {}),
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true },
      });
      return NextResponse.json({ options: rows.map((r) => ({ id: r.id, name: r.name, hint: r.address })) }, { headers });
    }
    default:
      return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  }
}
