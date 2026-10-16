import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { clientIp, userAgent } from "@/server/request";
import { hashIdentifier, rateLimit } from "@/server/rate-limit";
import { checkFormToken } from "@/server/services/form-token";
import { processSubmission } from "@/server/services/form-submission";

const HONEYPOT = "company_website";
const MAX_FIELDS = 120;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = await clientIp();
  const ipHash = hashIdentifier(ip);

  if (!(await rateLimit(`submit:${slug}:${ipHash}`, 8, 10 * 60))) {
    return NextResponse.json({ ok: false, error: "Too many submissions from your network. Please try again in a few minutes." }, { status: 429 });
  }
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_TOTAL_BYTES) return NextResponse.json({ ok: false, error: "The upload is too large." }, { status: 413 });

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid submission." }, { status: 400 });
  }

  const form = await db.form.findUnique({ where: { slug }, select: { id: true } });
  if (!form) return NextResponse.json({ ok: false, error: "This form is not available." }, { status: 404 });

  const raw: Record<string, string | string[]> = {};
  const files: Record<string, File[]> = {};
  let count = 0;
  for (const [k, v] of fd.entries()) {
    if (++count > MAX_FIELDS) break;
    if (v instanceof File) {
      if (v.size > 0) (files[k] ??= []).push(v);
      continue;
    }
    const s = v.slice(0, 10_000);
    if (raw[k] === undefined) raw[k] = s;
    else raw[k] = Array.isArray(raw[k]) ? [...(raw[k] as string[]), s] : [raw[k] as string, s];
  }

  const idempotencyKey = typeof raw._idem === "string" && /^[0-9a-f-]{36}$/i.test(raw._idem) ? raw._idem : null;
  if (!idempotencyKey) return NextResponse.json({ ok: false, error: "Please reload the page and try again." }, { status: 400 });

  // Spam heuristics: filled honeypot, missing/invalid render token, or a form completed impossibly fast.
  const token = checkFormToken(form.id, typeof raw._token === "string" ? raw._token : undefined);
  if (!token.ok && token.reason === "expired") {
    return NextResponse.json({ ok: false, error: "This page has been open for a long time. Please reload it and submit again." }, { status: 400 });
  }
  const spam = !!(raw[HONEYPOT] && String(raw[HONEYPOT]).trim()) || !token.ok;

  const utm: Record<string, string> = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) {
    const v = raw[`utm_${k}`];
    if (typeof v === "string" && v) utm[k] = v.slice(0, 120);
  }

  const result = await processSubmission({
    slug,
    raw,
    files,
    idempotencyKey,
    spam,
    meta: { ipHash, userAgent: await userAgent(), referrer: typeof raw._referrer === "string" ? raw._referrer : req.headers.get("referer"), utm },
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
