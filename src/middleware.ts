import { NextResponse, type NextRequest } from "next/server";

// Fast cookie-presence gate. Real session validation and authorization happen
// server-side in every layout, page, server action and route handler.
const PUBLIC = new Set(["/portal/login", "/portal/no-access", "/procurement/login"]);

// /w/<workspace-code>/…  addresses a specific company. The prefix is stripped (rewrite) and the code is handed to the
// server in the x-tenant header and remembered in the yadea_tenant cookie, so every page works unchanged inside it.
const WORKSPACE_PATH = /^\/w\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])(\/.*)?$/;

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const m = WORKSPACE_PATH.exec(pathname);
  const workspace = m ? m[1]! : null;
  const effective = m ? m[2] || "/" : pathname;
  const prefix = workspace ? `/w/${workspace}` : "";

  const hasSession = req.cookies.has("yadea_session");
  const guarded = effective.startsWith("/crm") || effective.startsWith("/portal") || effective.startsWith("/procurement");
  if (!hasSession && guarded && !PUBLIC.has(effective)) {
    const url = req.nextUrl.clone();
    url.pathname = prefix + (effective.startsWith("/portal") ? "/portal/login" : effective.startsWith("/procurement") ? "/procurement/login" : "/login");
    url.search = `?next=${encodeURIComponent(effective + search)}`;
    return NextResponse.redirect(url);
  }

  // Expose the path to server layouts (used to enforce "must change temporary password") and the workspace to the data layer.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", effective);
  if (workspace) headers.set("x-tenant", workspace);
  else headers.delete("x-tenant");

  if (workspace) {
    const url = req.nextUrl.clone();
    url.pathname = effective;
    const res = NextResponse.rewrite(url, { request: { headers } });
    res.cookies.set("yadea_tenant", workspace, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
    return res;
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/crm/:path*", "/portal/:path*", "/procurement/:path*", "/w/:path*"] };
