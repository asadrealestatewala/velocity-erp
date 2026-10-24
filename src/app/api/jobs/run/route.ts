import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runScheduledJobs } from "@/server/services/jobs";
import { forEachTenant } from "@/server/platform/runtime";
import { runLifecycle } from "@/server/platform/lifecycle";

/** Constant-time comparison; the secret must be at least 16 characters. */
function authorised(given: string) {
  const secret = env.cronSecret;
  return secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

async function run() {
  try {
    const perWorkspace = await forEachTenant(() => runScheduledJobs());
    // Back-compat: the original response shape is the default workspace's result.
    const first = perWorkspace.find((r) => r.ok)?.result ?? {};
    const lifecycle = await runLifecycle().catch((e) => { console.error("[lifecycle] failed", e); return null; });
    return NextResponse.json({ ok: perWorkspace.every((r) => r.ok), ...first, workspaces: perWorkspace.map((r) => ({ slug: r.slug, ok: r.ok, error: r.error })), lifecycle });
  } catch (e) {
    console.error("[jobs] failed", e);
    return NextResponse.json({ ok: false, error: "Job run failed" }, { status: 500 });
  }
}

/** Scheduler entry point: POST with header `x-cron-secret: $CRON_SECRET` every 5–15 minutes. */
export async function POST(req: NextRequest) {
  if (!authorised(req.headers.get("x-cron-secret") ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}

/** Vercel Cron calls with GET and `Authorization: Bearer $CRON_SECRET` (set CRON_SECRET in the project's environment). */
export async function GET(req: NextRequest) {
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!authorised(bearer)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}
