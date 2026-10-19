import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CRM_NAV, PORTAL_NAV, PROCUREMENT_NAV, type NavItem } from "@/components/shell/nav";
import { HOWTOS, howtosFor } from "@/server/assistant/howtos";
import { GLOSSARY } from "@/server/assistant/glossary";
import { GUIDE, SUGGESTIONS } from "@/server/assistant/guide";
import { PAGES, linkFor, pagesFor, sidebarGroups, sitemapText } from "@/server/assistant/sitemap";

const APP_DIR = path.join(process.cwd(), "src", "app");

/** Every real page route, e.g. "/portal/inventory" or "/crm/contacts/[id]" (route groups like (app) don't appear in URLs). */
function routes(dir = APP_DIR, prefix = ""): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const seg = e.name.startsWith("(") ? "" : `/${e.name}`;
      out.push(...routes(path.join(dir, e.name), prefix + seg));
    } else if (e.name === "page.tsx") out.push(prefix || "/");
  }
  return out;
}
const ROUTES = new Set(routes());
const baseOf = (p: string) => p.split("?")[0]!;

describe("assistant knowledge stays in step with the app", () => {
  it("every screen in the page map is a real route", () => {
    const missing = PAGES.filter((p) => !ROUTES.has(baseOf(p.path))).map((p) => `${p.id}: ${p.path}`);
    expect(missing).toEqual([]);
  });

  it("every sidebar item has a page-map entry with the same path, permission and sidebar group", () => {
    const groups = sidebarGroups();
    const check = (workspace: "crm" | "portal" | "procurement", nav: NavItem[]) => {
      let section: string | undefined;
      const problems: string[] = [];
      for (const n of nav) {
        if (n.section) section = n.section;
        const page = PAGES.find((p) => p.workspace === workspace && p.label === n.label);
        if (!page) { problems.push(`${workspace}: “${n.label}” is in the sidebar but not in the page map`); continue; }
        if (page.path !== n.href) problems.push(`${n.label}: path ${page.path} ≠ sidebar ${n.href}`);
        if (n.perm && page.perm !== n.perm) problems.push(`${n.label}: permission ${page.perm} ≠ sidebar ${n.perm}`);
        if (!!n.managerOnly !== !!page.managerOnly) problems.push(`${n.label}: managerOnly differs`);
        if ((groups.get(page.id) ?? undefined) !== section) problems.push(`${n.label}: group “${groups.get(page.id)}” ≠ sidebar “${section}”`);
        if (page.sidebar === false) problems.push(`${n.label}: marked as not in the sidebar`);
      }
      return problems;
    };
    expect([...check("crm", CRM_NAV), ...check("portal", PORTAL_NAV), ...check("procurement", PROCUREMENT_NAV)]).toEqual([]);
  });

  it("page ids and recipe ids are unique and every recipe has steps", () => {
    const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes(PAGES.map((p) => p.id))).toEqual([]);
    expect(dupes(HOWTOS.map((h) => h.id))).toEqual([]);
    expect(dupes(HOWTOS.map((h) => h.q))).toEqual([]);
    expect(dupes(GUIDE.map((g) => g.id))).toEqual([]);
    for (const h of HOWTOS) expect(h.steps.length, h.id).toBeGreaterThan(0);
  });

  it("every link a recipe offers resolves to a real, linkable screen", () => {
    const bad: string[] = [];
    for (const h of HOWTOS) for (const g of h.go ?? []) if (!linkFor(g, PAGES)) bad.push(`${h.id}: ${g}`);
    expect(bad).toEqual([]);
  });

  it("the glossary has unique terms and only links to real screens", () => {
    const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes(GLOSSARY.map((t) => t.id))).toEqual([]);
    expect(dupes(GLOSSARY.map((t) => t.term))).toEqual([]);
    const bad: string[] = [];
    for (const t of GLOSSARY) {
      expect(t.definition.length, t.id).toBeGreaterThan(20);
      for (const g of t.go ?? []) if (!linkFor(g, PAGES)) bad.push(`${t.id}: ${g}`);
    }
    expect(bad).toEqual([]);
    for (const a of ["crm", "portal", "procurement"] as const) expect(GLOSSARY.filter((t) => t.audience.includes(a)).length, a).toBeGreaterThanOrEqual(10);
  });

  it("covers all three workspaces with step-by-step recipes", () => {
    for (const a of ["crm", "portal", "procurement"] as const) expect(HOWTOS.filter((h) => h.audience.includes(a)).length, a).toBeGreaterThanOrEqual(15);
  });

  it("the suggested questions exist for every workspace", () => {
    for (const a of ["crm", "portal", "procurement"] as const) expect(SUGGESTIONS[a].length).toBeGreaterThanOrEqual(4);
  });
});

describe("page map filtering", () => {
  const viewer = (perms: string[], manager = false) => ({ can: (p: string) => perms.includes(p), isDealerManager: manager });

  it("hides screens the role lacks permission for, and manager-only screens from reps", () => {
    const rep = pagesFor("portal", viewer(["contacts.view", "inventory.view"])).map((p) => p.id);
    expect(rep).toContain("portal-inventory");
    expect(rep).not.toContain("portal-audit");
    expect(rep).not.toContain("portal-team");
    const mgr = pagesFor("portal", viewer(["contacts.view", "audit.view"], true)).map((p) => p.id);
    expect(mgr).toContain("portal-audit");
    expect(mgr).toContain("portal-team");
  });

  it("only head office also reaches the procurement screens, and never the dealer portal", () => {
    const head = pagesFor("crm", viewer(["dashboard.view", "procurement.view", "ledger.view"])).map((p) => p.id);
    expect(head).toContain("proc-ledger");
    expect(head.some((id) => id.startsWith("portal-"))).toBe(false);
    expect(howtosFor("crm", viewer(["procurement.view"])).some((h) => h.id === "proc-verify-payment")).toBe(true);
    expect(howtosFor("crm", viewer([])).some((h) => h.id === "proc-verify-payment")).toBe(false);
  });

  it("links are withheld for screens outside the viewer's reach", () => {
    const allowed = pagesFor("portal", viewer(["contacts.view"]));
    expect(linkFor("/portal/leads", allowed)).toMatchObject({ label: "All Dealership Leads" });
    expect(linkFor("/portal/ledger", allowed)).toBeNull();
    expect(linkFor("/crm/dashboard", allowed)).toBeNull();
    expect(linkFor("/crm/contacts/[id]", allowed)).toBeNull();
  });

  it("the text given to the AI names every path it may link to", () => {
    const text = sitemapText(PAGES);
    for (const p of PAGES) expect(text).toContain(`\`${p.path}\``);
  });
});
