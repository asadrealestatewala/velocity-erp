import { NextResponse, type NextRequest } from "next/server";

// Fast cookie-presence gate. Real session validation and authorization happen
// server-side in every layout, page, server action and route handler.
const PUBLIC = new Set(["/portal/login", "/portal/no-access", "/procurement/login"]);

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has("yadea_session");
  const guarded = pathname.startsWith("/crm") || pathname.startsWith("/portal") || pathname.startsWith("/procurement");
  if (!hasSession && guarded && !PUBLIC.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith("/portal") ? "/portal/login" : pathname.startsWith("/procurement") ? "/procurement/login" : "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  // Expose the path to server layouts (used to enforce "must change temporary password").
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/crm/:path*", "/portal/:path*", "/procurement/:path*"] };