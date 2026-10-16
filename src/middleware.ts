import { NextResponse, type NextRequest } from "next/server";

// Fast cookie-presence gate. Real session validation and authorization happen
// server-side in every layout, page, server action and route handler.
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has("yadea_session");
  const isPortalPublic = pathname === "/portal/login" || pathname === "/portal/no-access";
  if (!hasSession && (pathname.startsWith("/crm") || (pathname.startsWith("/portal") && !isPortalPublic))) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith("/portal") ? "/portal/login" : "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  // Expose the path to server layouts (used to enforce "must change temporary password").
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/crm/:path*", "/portal/:path*"] };
