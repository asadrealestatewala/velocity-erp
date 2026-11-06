import { NextResponse, type NextRequest } from "next/server";

// Fast cookie-presence gate. Real session validation and authorization happen
// server-side in every layout, page, server action and route handler.
const PUBLIC = new Set(["/portal/login", "/portal/no-access", "/procurement/login"]);

// /w/<workspace-code>/…  addresses a specific company. The prefix is stripped (rewrite) and the code is handed to the
// server in the x-tenant header and remembered in the yadea_tenant cookie, so every page works unchanged inside it.
const WORKSPACE_PATH = /^\/w\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])(\/.*)?$/;

// Workspace websites: any hostname other than the app's own (APP_URL) is a customer's site. "/" and the public inventory/model pages
// are rewritten to /site/*; forms, files and public APIs pass through. The tenant is resolved from the hostname in the data layer.
const APP_HOST = (() => { try { return process.env.APP_URL ? new URL(process.env.APP_URL).host.toLowerCase() : null; } catch { return null; } })();
const SITE_PATHS = /^\/(inventory|models\/[^/]+)?\/?$/;

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (APP_HOST && host && host !== APP_HOST && !host.startsWith("localhost") && !host.startsWith("127.")) {
    const headers = new Headers(req.headers);
    headers.set("x-site-host", host);
    headers.delete("x-tenant");
    const url = req.nextUrl.clone();
    if (SITE_PATHS.test(url.pathname)) url.pathname = "/site" + (url.pathname === "/" ? "" : url.pathname);
    else if (!/^\/(forms\/|api\/(public|files)\/)/.test(url.pathname)) url.pathname = "/site/__not_found"; // the CRM, portal and admin consoles are not served on site hostnames
    return NextResponse.rewrite(url, { request: { headers } });
  }
  const { pathname, search } = req.nextUrl;
  const m = WORKSPACE_PATH.exec(pathname);
  const workspace = m ? m[1]! : null;
  const effective = m ? m[2] || "/" : pathname;
  const prefix = workspace ? `/w/${workspace}` : "";

  const hasSession = req.cookies.has("yadea_session") || req.cookies.has("yadea_viewas");
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

// Everything except static assets, so site hostnames are caught too; app-host requests outside the listed prefixes pass straight through.
export const config = { matcher: ["/((?!_next/|icons/|brand/|downloads/|favicon\\.ico|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|webp|svg|ico|css|js|map|txt|xml)$).*)"] };
