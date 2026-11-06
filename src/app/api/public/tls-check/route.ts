import { NextResponse, type NextRequest } from "next/server";
import { getTenant, tenantSlugForHost } from "@/server/platform/tenants";

/**
 * Used by the web server (Caddy on-demand TLS `ask`) to decide whether to request a certificate for a hostname.
 * 200 only for a workspace website address (<workspace-code>.SITE_BASE_DOMAIN or a verified custom domain) of an active workspace;
 * 404 for everything else, so random names cannot make the server request certificates. Returns no workspace data.
 */
export async function GET(req: NextRequest) {
  const domain = (req.nextUrl.searchParams.get("domain") ?? "").trim().toLowerCase();
  if (!domain || domain.length > 253) return new NextResponse(null, { status: 404 });
  try {
    const slug = await tenantSlugForHost(domain);
    const t = slug ? await getTenant(slug) : null;
    if (t && t.status === "ACTIVE") return new NextResponse("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    /* fall through */
  }
  return new NextResponse(null, { status: 404 });
}
