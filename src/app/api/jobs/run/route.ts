import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runScheduledJobs } from "@/server/services/jobs";

/** Scheduler entry point: POST with header `x-cron-secret: $CRON_SECRET` every 5–15 minutes. */
export async function POST(req: NextRequest) {
  const secret = env.cronSecret;
  const given = req.headers.get("x-cron-secret") ?? "";
  const ok = secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runScheduledJobs()) });
  } catch (e) {
    console.error("[jobs] failed", e);
    return NextResponse.json({ ok: false, error: "Job run failed" }, { status: 500 });
  }
}
