import { NextResponse, type NextRequest } from "next/server";
import { platformDb } from "@/server/platform/client";
import { platformRateLimit } from "@/server/platform/guard";
import { hashIdentifier } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Only these public pages are counted; anything else is ignored so the table cannot be filled with arbitrary text. */
const PATHS = new Set(["/", "/pricing", "/signup", "/legal/terms", "/legal/privacy"]);

export async function POST(req: NextRequest) {
  if (req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1") return new NextResponse(null, { status: 204 });
  try {
    const { path } = (await req.json()) as { path?: string };
    if (!path || !PATHS.has(path)) return new NextResponse(null, { status: 204 });
    const ip = hashIdentifier(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown");
    if (!(await platformRateLimit(`hit:${ip}`, 120, 3600))) return new NextResponse(null, { status: 204 });
    const day = new Date(new Date().toISOString().slice(0, 10));
    await platformDb().pageView.upsert({ where: { day_path: { day, path } }, create: { day, path }, update: { count: { increment: 1 } } });
  } catch {
    /* never surface analytics errors */
  }
  return new NextResponse(null, { status: 204 });
}
