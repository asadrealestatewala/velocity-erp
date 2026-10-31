"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as D from "@radix-ui/react-dialog";
import { Activity, Building2, ChevronRight, CornerDownLeft, Flag, Keyboard, Layers, LayoutDashboard, LifeBuoy, Mail, Megaphone, Menu, Moon, Search, ScrollText, Settings, ShieldCheck, Siren, Sun, TrendingUp, UserCog, Wallet, X } from "lucide-react";
import { ACCOUNT_ITEM, NAV_GROUPS, isActive, type NavIcon, type NavItem } from "./nav";
import { currentTheme, setTheme, type Theme } from "./theme";

const ICONS: Record<NavIcon, typeof Activity> = { overview: LayoutDashboard, workspaces: Building2, payments: Wallet, plans: Layers, settings: Settings, staff: ShieldCheck, audit: ScrollText, system: Activity, account: UserCog, mail: Mail, announcements: Megaphone, support: LifeBuoy, flags: Flag, growth: TrendingUp, status: Siren };

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function SidebarNav({ items, path, onNavigate }: { items: NavItem[]; path: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Platform console" className="flex-1 overflow-y-auto px-3 pb-3">
      {NAV_GROUPS.map((g) => {
        const list = items.filter((i) => i.group === g);
        if (!list.length) return null;
        return (
          <div key={g || "top"} className={g ? "mt-5" : "mt-1"}>
            {g && <p className="mb-1 px-2 text-[11px] font-semibold tracking-[0.08em] text-[var(--pf-muted)] uppercase">{g}</p>}
            <ul className="space-y-0.5">
              {list.map((n) => {
                const Icon = ICONS[n.icon];
                const active = isActive(path, n.href);
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] ${active ? "bg-[var(--pf-accent-soft)] font-semibold text-[var(--pf-accent)]" : "text-[var(--pf-text)] hover:bg-[var(--pf-sunken)]"}`}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{n.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/platform" className="flex items-center gap-2.5 px-5 py-4" aria-label="Velocity platform console, overview">
      <Image src="/brand/velocity-mark.png" alt="" width={28} height={28} className="size-7 object-contain" />
      <span className="leading-tight">
        <span className="block text-[14px] font-semibold text-[var(--pf-text)]">Velocity</span>
        <span className="block text-[11.5px] text-[var(--pf-muted)]">Platform console</span>
      </span>
    </Link>
  );
}

function Account({ name, role, signOut, onNavigate }: { name: string; role: string; signOut: React.ReactNode; onNavigate?: () => void }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-2 border-t border-[var(--pf-border)] p-3">
      <Link href={ACCOUNT_ITEM.href} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1.5 hover:bg-[var(--pf-sunken)]">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--pf-accent-soft)] text-xs font-semibold text-[var(--pf-accent)]">{initials}</span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block truncate text-[11.5px] text-[var(--pf-muted)] capitalize">{role.toLowerCase().replace("_", " ")} · My account</span>
        </span>
      </Link>
      {signOut}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [["/ or Ctrl K", "Search pages and workspaces"], ["?", "Show this list"], ["g then o / w / p / s …", "Go to a page (the letter is shown in search)"], ["Esc", "Close a panel"]];

function Palette({ open, setOpen, items, canAudit }: { open: boolean; setOpen: (o: boolean) => void; items: NavItem[]; canAudit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [theme, setT] = useState<Theme>("light");
  useEffect(() => { if (open) { setQ(""); setSel(0); setT(currentTheme()); } }, [open]);
  const term = q.trim().toLowerCase();
  const hasWorkspaces = items.some((i) => i.href === "/platform/workspaces");
  const results: { id: string; label: string; hint?: string; key?: string; run: () => void }[] = [
    ...[...items, ACCOUNT_ITEM].filter((i) => !term || i.label.toLowerCase().includes(term) || (i.hint ?? "").toLowerCase().includes(term)).map((i) => ({ id: i.href, label: i.label, hint: i.hint, key: i.key, run: () => router.push(i.href) })),
    ...(term && hasWorkspaces ? [{ id: "ws", label: `Search workspaces for “${q.trim()}”`, hint: "Name, code or owner email", run: () => router.push(`/platform/workspaces?q=${encodeURIComponent(q.trim())}`) }] : []),
    ...(term && canAudit ? [{ id: "audit", label: `Search the audit log for “${q.trim()}”`, hint: "Action, person or id", run: () => router.push(`/platform/audit?q=${encodeURIComponent(q.trim())}`) }] : []),
    ...(!term || "theme dark light".includes(term) ? [{ id: "theme", label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme", run: () => setTheme(theme === "dark" ? "light" : "dark") }] : []),
  ];
  const active = Math.min(sel, Math.max(0, results.length - 1));
  const go = (i: number) => { const r = results[i]; if (!r) return; setOpen(false); r.run(); };
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content aria-describedby={undefined} className="fixed top-[12vh] left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] text-[var(--pf-text)] focus:outline-none">
          <D.Title className="sr-only">Search the console</D.Title>
          <div className="flex items-center gap-2 border-b border-[var(--pf-border)] px-3">
            <Search className="size-4 text-[var(--pf-muted)]" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="pf-palette-list"
              aria-activedescendant={results.length ? `pf-opt-${active}` : undefined}
              aria-label="Search pages and workspaces"
              value={q}
              onChange={(e) => { setQ(e.target.value); setSel(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setSel((active + 1) % Math.max(1, results.length)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSel((active - 1 + results.length) % Math.max(1, results.length)); }
                else if (e.key === "Enter") { e.preventDefault(); go(active); }
              }}
              placeholder="Search pages, or type a workspace name…"
              className="pf-bare h-12 w-full bg-transparent text-[14.5px] placeholder:text-[var(--pf-muted)] focus:outline-none"
            />
            <kbd>Esc</kbd>
          </div>
          <ul id="pf-palette-list" role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-1.5">
            {results.map((r, i) => (
              <li key={r.id} id={`pf-opt-${i}`} role="option" aria-selected={i === active} onMouseMove={() => setSel(i)} onClick={() => go(i)} className={`flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] ${i === active ? "bg-[var(--pf-accent-soft)]" : ""}`}>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.label}</span>{r.hint && <span className="block truncate text-xs text-[var(--pf-muted)]">{r.hint}</span>}</span>
                {r.key && <span className="flex items-center gap-1 text-[11px] text-[var(--pf-muted)]"><kbd>g</kbd><kbd>{r.key}</kbd></span>}
                {i === active && <CornerDownLeft className="size-3.5 text-[var(--pf-muted)]" aria-hidden />}
              </li>
            ))}
            {!results.length && <li className="px-3 py-8 text-center text-sm text-[var(--pf-muted)]">Nothing matches “{q.trim()}”. Try a page name.</li>}
          </ul>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Help({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content aria-describedby={undefined} className="fixed top-[16vh] left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] p-5 text-[var(--pf-text)] focus:outline-none">
          <div className="flex items-center justify-between"><D.Title className="text-base font-semibold">Keyboard shortcuts</D.Title><D.Close aria-label="Close" className="rounded-md p-1 hover:bg-[var(--pf-sunken)]"><X className="size-4" /></D.Close></div>
          <dl className="mt-3 divide-y divide-[var(--pf-border)] text-sm">
            {SHORTCUTS.map(([k, d]) => <div key={k} className="flex items-center justify-between gap-4 py-2"><dt className="text-[var(--pf-muted)]">{d}</dt><dd><kbd>{k}</kbd></dd></div>)}
          </dl>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** The console frame: grouped sidebar, top bar (breadcrumbs, search, theme), shortcuts. No animation anywhere. */
export function Shell({ items, name, role, signOut, canAudit, children }: { items: NavItem[]; name: string; role: string; signOut: React.ReactNode; canAudit: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [theme, setT] = useState<Theme>("light");
  const gPending = useRef<number>(0);
  const mainRef = useRef<HTMLElement>(null);

  // The layout's inline boot script has already set the theme; mirror it into state and clean up on leaving the console.
  useEffect(() => {
    setT(currentTheme());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onSys = () => { try { if (localStorage.getItem("pf-theme")) return; } catch { /* ignore */ } setTheme(mq.matches ? "dark" : "light"); setT(mq.matches ? "dark" : "light"); };
    mq.addEventListener("change", onSys);
    return () => { mq.removeEventListener("change", onSys); document.documentElement.removeAttribute("data-pf"); document.documentElement.removeAttribute("data-pf-theme"); };
  }, []);
  const toggleTheme = () => { const n: Theme = theme === "dark" ? "light" : "dark"; setTheme(n); setT(n); };

  useEffect(() => { setDrawer(false); }, [path]);
  // Move focus to the page content after navigation so keyboard and screen-reader users start in the right place.
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } mainRef.current?.focus({ preventScroll: true }); }, [path]);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.defaultPrevented || typing(e.target)) { return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); setPalette(true); return; }
    if (e.key === "?") { e.preventDefault(); setHelp(true); return; }
    const now = Date.now();
    if (e.key === "g") { gPending.current = now; return; }
    if (gPending.current && now - gPending.current < 1200) {
      gPending.current = 0;
      const hit = [...items, ACCOUNT_ITEM].find((i) => i.key === e.key.toLowerCase());
      if (hit) { e.preventDefault(); router.push(hit.href); }
    }
  }, [items, router]);
  useEffect(() => { window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onKey]);

  const section = [...items, ACCOUNT_ITEM].find((i) => i.href !== "/platform" && isActive(path, i.href));
  const detail = section && path !== section.href;
  const iconBtn = "inline-flex h-8 items-center justify-center gap-2 rounded-md border border-[var(--pf-border)] bg-[var(--pf-surface)] px-2.5 text-[13px] text-[var(--pf-muted)] hover:text-[var(--pf-text)] hover:bg-[var(--pf-sunken)]";

  return (
    <div className="pf min-h-dvh">
      <a href="#pf-main" className="pf-sr-only-focusable fixed top-2 left-2 z-[60] rounded-md bg-[var(--pf-surface)] px-3 py-2 text-sm font-medium shadow-none ring-2 ring-[var(--pf-ring)]">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[var(--pf-border)] bg-[var(--pf-surface)] lg:flex">
        <Brand />
        <SidebarNav items={items} path={path} />
        <Account name={name} role={role} signOut={signOut} />
      </aside>

      <D.Root open={drawer} onOpenChange={setDrawer}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <D.Content aria-describedby={undefined} className="pf fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-[var(--pf-surface)] text-[var(--pf-text)] focus:outline-none lg:hidden">
            <D.Title className="sr-only">Navigation</D.Title>
            <div className="flex items-center justify-between pr-3"><Brand /><D.Close aria-label="Close navigation" className="rounded-md p-1.5 hover:bg-[var(--pf-sunken)]"><X className="size-4" /></D.Close></div>
            <SidebarNav items={items} path={path} onNavigate={() => setDrawer(false)} />
            <Account name={name} role={role} signOut={signOut} onNavigate={() => setDrawer(false)} />
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 sm:px-6">
          <button type="button" aria-label="Open navigation" onClick={() => setDrawer(true)} className={`${iconBtn} lg:hidden`}><Menu className="size-4" aria-hidden /></button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1 text-[13px] text-[var(--pf-muted)]">
              <li className="hidden sm:block"><Link href="/platform" className="hover:text-[var(--pf-text)]">Console</Link></li>
              {section ? (
                <>
                  <li aria-hidden className="hidden sm:block"><ChevronRight className="size-3.5" /></li>
                  <li className="truncate">{detail ? <Link href={section.href} className="hover:text-[var(--pf-text)]">{section.label}</Link> : <span aria-current="page" className="font-medium text-[var(--pf-text)]">{section.label}</span>}</li>
                  {detail && <><li aria-hidden><ChevronRight className="size-3.5" /></li><li aria-current="page" className="font-medium text-[var(--pf-text)]">Details</li></>}
                </>
              ) : (
                <li className="sm:hidden"><span aria-current="page" className="font-medium text-[var(--pf-text)]">Overview</span></li>
              )}
              {!section && <li className="hidden sm:flex sm:items-center sm:gap-1"><ChevronRight className="size-3.5" aria-hidden /><span aria-current="page" className="font-medium text-[var(--pf-text)]">Overview</span></li>}
            </ol>
          </nav>
          <button type="button" onClick={() => setPalette(true)} className={`${iconBtn} sm:min-w-52 sm:justify-start`} aria-label="Search pages and workspaces">
            <Search className="size-4" aria-hidden /><span className="hidden sm:inline">Search</span><span className="ml-auto hidden sm:inline"><kbd>/</kbd></span>
          </button>
          <button type="button" onClick={() => setHelp(true)} className={`${iconBtn} hidden sm:inline-flex`} aria-label="Keyboard shortcuts"><Keyboard className="size-4" aria-hidden /></button>
          <button type="button" onClick={toggleTheme} className={iconBtn} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>{theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}</button>
        </header>
        <main id="pf-main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-[1400px] px-3 py-5 focus:outline-none sm:px-6 sm:py-6">{children}</main>
      </div>
      <Palette open={palette} setOpen={setPalette} items={items} canAudit={canAudit} />
      <Help open={help} setOpen={setHelp} />
    </div>
  );
}
