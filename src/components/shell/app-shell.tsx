"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3, Bell, BookOpen, Bike, Boxes, Building2, CheckSquare, ChevronDown, ClipboardList, FileCheck2, FileText, Folder, Footprints, History, Inbox, KanbanSquare,
  LayoutDashboard, List, LogOut, Menu as MenuIcon, Package, PanelLeftClose, PanelLeftOpen, Plus, Receipt, Search, Settings, Share2, Shield, Sparkles, Store, Trophy, Truck, UserCheck, Users, UsersRound, Wallet, X, Zap, KeyRound, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { Avatar } from "@/components/ui/misc";
import { Menu, MenuItem, MenuLabel, MenuLink, MenuSeparator } from "@/components/ui/menu";
import { buttonClass } from "@/components/ui/button";
import type { NavItem } from "./nav";
import { AssistantWidget, type AssistantConfig } from "@/components/assistant/assistant-widget";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "layout-dashboard": LayoutDashboard, users: Users, kanban: KanbanSquare, inbox: Inbox, "file-text": FileText, bike: Bike,
  store: Store, "file-check": FileCheck2, zap: Zap, "check-square": CheckSquare, "bar-chart": BarChart3, bell: Bell, shield: Shield,
  settings: Settings, history: History, trophy: Trophy, "user-check": UserCheck, list: List, building: Building2, footprints: Footprints,
  "users-round": UsersRound, boxes: Boxes, "clipboard-list": ClipboardList, truck: Truck, wallet: Wallet, receipt: Receipt, folder: Folder, package: Package,
  "book-open": BookOpen,
};
const ACTION_ICONS = { plus: Plus, share: Share2 } as const;

export type QuickAction = { label: string; href: string; variant: "primary" | "outline"; icon: keyof typeof ACTION_ICONS; badge?: number };

export function AppShell({
  variant,
  nav,
  user,
  unread,
  subtitle,
  actions = [],
  assistant = null,
  banner = null,
  workspaceName = null,
  children,
}: {
  variant: "crm" | "portal" | "procurement";
  nav: NavItem[];
  user: { name: string; email: string; roleName: string };
  unread: number;
  subtitle?: string;
  actions?: QuickAction[];
  assistant?: AssistantConfig | null;
  banner?: { tone: "info" | "warn" | "danger"; text: string; href?: string } | null;
  workspaceName?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  // Desktop sidebar can collapse to an icon rail; the choice is remembered per browser.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("yadea:sidebar") === "collapsed");
    } catch {
      /* storage unavailable — stay expanded */
    }
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("yadea:sidebar", c ? "expanded" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  useEffect(() => setOpen(false), [pathname, search]);

  // Ctrl/⌘ + K focuses the (visible) search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = [...document.querySelectorAll<HTMLInputElement>("[data-global-search]")].find((i) => i.offsetParent !== null);
        el?.focus();
        el?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => {
    const [p, q] = href.split("?");
    if (q) {
      if (pathname !== p) return false;
      const want = new URLSearchParams(q);
      return [...want.entries()].every(([k, v]) => search.get(k) === v);
    }
    if (pathname === p) {
      // A bare /portal/leads link should not light up when a filtered variant is active
      return !(p === "/portal/leads" && (search.get("origin") || search.get("view")));
    }
    return pathname.startsWith(p + "/") && !nav.some((n) => n.href !== href && pathname.startsWith(n.href.split("?")[0]!) && n.href.length > href.length);
  };

  const base = variant === "crm" ? "/crm" : variant === "portal" ? "/portal" : "/procurement";
  const searchTarget = variant === "procurement" ? `${base}/orders` : `${base}/contacts`;
  const searchNoun = variant === "procurement" ? "orders" : "contacts";
  const section = nav.find((n) => isActive(n.href))?.label ?? (pathname.includes("/account") ? "Account" : "");
  const [q, setQ] = useState("");
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`${searchTarget}?q=${encodeURIComponent(q.trim())}`);
  };

  const accountMenu = (
    <>
      <MenuLabel>{user.email}</MenuLabel>
      <MenuLink href={`${base}/account`}>
        <KeyRound className="h-4 w-4" /> Account & password
      </MenuLink>
      <MenuSeparator />
      <MenuItem danger onSelect={() => void logoutAction()}>
        <LogOut className="h-4 w-4" /> Sign out
      </MenuItem>
    </>
  );

  const renderSidebar = (rail: boolean) => (
    <div className="flex h-full flex-col bg-navy-900 text-slate-300">
      <div className={cn("flex h-[72px] shrink-0 items-center gap-2 border-b border-white/5 bg-navy-950", rail ? "justify-center px-2" : "px-5")}>
        <Link href={`${base}/dashboard`} className="flex items-center" aria-label="Velocity home">
          {rail ? (
            <Image src="/brand/velocity-mark.png" alt="Velocity" width={32} height={32} priority className="h-8 w-8 object-contain" />
          ) : (
            <Image src="/brand/velocity-logo-white.png" alt="Velocity" width={134} height={39} priority className="h-[34px] w-auto max-w-none" />
          )}
        </Link>
        {!rail && (
          <span className={cn("ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase", variant === "crm" ? "bg-white/10 text-slate-200" : variant === "portal" ? "bg-accent-500 text-white" : "bg-brand-500 text-white")}>
            {variant === "crm" ? "CRM" : variant === "portal" ? "Dealer" : "Procurement"}
          </span>
        )}
      </div>

      <div className={cn("space-y-3 pt-4", rail ? "px-2" : "px-4")}>
        {/* Profile card: stacked layout with a colour-edge layer peeking out underneath. The rail keeps just the avatar. */}
        <div className={cn("relative", !rail && "pb-1.5")}>
          {!rail && <span aria-hidden className="absolute inset-x-3 -bottom-0 h-6 rounded-b-2xl bg-gradient-brand opacity-90" />}
          <Menu
            align="start"
            trigger={
              <button
                className={cn(
                  "relative z-10 w-full overflow-hidden border border-white/10 text-left transition",
                  rail ? "flex items-center justify-center rounded-xl bg-navy-800/70 p-1.5 hover:bg-navy-700/70" : "rounded-2xl bg-gradient-to-b from-navy-700 to-navy-800 px-4 pt-4 pb-3.5 shadow-[0_10px_24px_-14px_rgb(0_0_0/0.8)] hover:from-navy-600 hover:to-navy-700",
                )}
                aria-label="Workspace and account menu"
                title={rail ? user.name : undefined}
              >
                {rail ? (
                  <Avatar name={user.name} size={36} className="ring-navy-900" />
                ) : (
                  <>
                    <span aria-hidden className="pointer-events-none absolute -right-2 -bottom-6 text-[96px] leading-none font-black text-white/[0.05] select-none">{user.name.trim().charAt(0).toUpperCase()}</span>
                    <ChevronDown className="absolute top-3 right-3 h-4 w-4 text-slate-400" aria-hidden />
                    <span className="relative flex flex-col items-center text-center">
                      <span className="relative rounded-full bg-gradient-brand p-[3px] shadow-[0_6px_16px_-6px_rgb(226_61_131/0.8)]">
                        <Avatar name={user.name} size={52} className="ring-2 ring-navy-800" />
                        <span aria-hidden title="Signed in" className="absolute right-0.5 bottom-0.5 size-3 rounded-full bg-emerald-400 ring-2 ring-navy-800" />
                      </span>
                      <span className="mt-2.5 block max-w-full truncate text-[16px] leading-tight font-semibold text-white">{user.name}</span>
                      <span className="mt-1 inline-block max-w-full truncate rounded-full bg-white/10 px-2.5 py-0.5 text-[10.5px] font-semibold tracking-wider text-slate-200 uppercase">{subtitle ?? user.roleName}</span>
                      <span className="mt-2.5 block w-full truncate rounded-lg bg-black/25 px-2.5 py-1.5 text-[12px] text-slate-300 ring-1 ring-white/5">{user.email}</span>
                    </span>
                  </>
                )}
              </button>
            }
          >
            {accountMenu}
          </Menu>
        </div>

        {rail ? (
          <button
            type="button"
            onClick={() => router.push(`${searchTarget}`)}
            title={`Search ${searchNoun}`}
            aria-label={`Search ${searchNoun}`}
            className="flex h-10 w-full items-center justify-center rounded-xl border border-white/10 bg-navy-800/70 text-slate-400 transition hover:bg-navy-700/70 hover:text-white"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
        ) : (
          <form role="search" onSubmit={submitSearch} className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              data-global-search
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${searchNoun}`}
              aria-label={variant === "procurement" ? "Search orders by number or dealership" : "Search contacts by name, phone, email or business"}
              className="h-10 w-full rounded-xl border border-white/10 bg-navy-800/70 pr-[3.75rem] pl-10 text-[14.5px] text-white transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-navy-800 focus:ring-2 focus:ring-brand-400/30 focus:outline-none"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-slate-400">Ctrl K</kbd>
          </form>
        )}
      </div>

      <nav className={cn("scrollbar-thin mt-3 flex-1 overflow-y-auto pb-4", rail ? "px-2" : "px-4")} aria-label="Main">
        {nav.map((item) => {
          const Icon = ICONS[item.icon] ?? List;
          const active = isActive(item.href);
          return (
            <div key={item.href}>
              {item.section &&
                (rail ? <div className="mx-2 mt-4 mb-2 h-px bg-white/10" aria-hidden /> : <p className="mt-5 mb-1.5 px-3 text-[11.5px] font-semibold tracking-wider text-slate-500 uppercase">{item.section}</p>)}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={rail ? item.label : undefined}
                className={cn(
                  "group relative flex items-center rounded-xl text-[15px] transition-all duration-200",
                  rail ? "mb-0.5 h-10 justify-center" : "gap-3 px-3 py-2.5",
                  active ? "bg-gradient-brand font-semibold text-white shadow-[0_8px_20px_-8px_rgb(226_61_131/0.75)]" : "font-medium text-slate-300 hover:bg-white/5 hover:text-white",
                )}
              >
                
                <span className="relative">
                  <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110", active ? "text-white" : "text-slate-400 group-hover:text-slate-200")} />
                  {rail && item.icon === "bell" && unread > 0 && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-accent-500 ring-2 ring-navy-900" aria-hidden />}
                </span>
                {rail ? (
                  <span className="sr-only">{item.label}</span>
                ) : (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.icon === "bell" && unread > 0 && (
                      <span className="ml-auto rounded-full bg-accent-500 px-1.5 py-px text-[11px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>
                    )}
                  </>
                )}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/5 p-3 lg:block">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={rail}
          title={rail ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("flex h-9 w-full items-center gap-2 rounded-lg text-[13px] font-medium text-slate-400 transition hover:bg-white/5 hover:text-white", rail ? "justify-center" : "px-3")}
        >
          {rail ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!rail && "Collapse"}
        </button>
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-dvh transition-[padding] duration-300 ease-[var(--ease-out-expo)]", collapsed ? "lg:pl-[76px]" : "lg:pl-64 xl:pl-72")}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-900 focus:shadow-lg">Skip to content</a>
      <aside className={cn("fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-300 ease-[var(--ease-out-expo)] lg:block", collapsed ? "w-[76px]" : "w-64 xl:w-72")}>{renderSidebar(collapsed)}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-navy-950/60 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-80 max-w-[88%] animate-[slide-in-left_0.28s_var(--ease-out-expo)] shadow-xl">
            <button className="absolute top-5 right-3 z-10 rounded-md p-1.5 text-slate-300 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {renderSidebar(false)}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-ink-200/80 bg-white/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <span aria-hidden className="hairline-gradient pointer-events-none absolute inset-x-0 -bottom-px h-px" />
        <button className="rounded-md p-2 text-ink-600 hover:bg-ink-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <MenuIcon className="h-5 w-5" />
        </button>
        <div className="hidden min-w-0 sm:block">
          <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-[12px] text-ink-400 sm:flex">
            <Link href={`${base}/dashboard`} className="transition-colors hover:text-ink-700">{workspaceName ?? (variant === "crm" ? "Central CRM" : variant === "portal" ? "Dealer Portal" : "Procurement")}</Link>
            {section && (
              <>
                <ChevronRight className="h-3 w-3" aria-hidden />
                <span className="text-ink-600">{section}</span>
              </>
            )}
          </nav>
          <p className="truncate text-[17px] leading-tight font-semibold text-ink-900">{section}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {actions.map((a) => {
            const Icon = ACTION_ICONS[a.icon];
            return (
              <Link key={a.href} href={a.href} className={buttonClass(a.variant === "primary" ? "primary" : "outlineBrand", "md", "max-sm:!px-2.5")} aria-label={a.label}>
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{a.label}</span>
                {!!a.badge && <span className="rounded-full bg-brand-500 px-1.5 text-[11px] leading-5 font-semibold text-white">{a.badge > 99 ? "99+" : a.badge}</span>}
              </Link>
            );
          })}
          {assistant && (
            <button
              type="button"
              onClick={() => setAssistantOpen((o) => !o)}
              aria-label="Open the Velocity assistant"
              aria-haspopup="dialog"
              aria-expanded={assistantOpen}
              className={buttonClass("outlineBrand", "md", "max-sm:!px-2.5")}
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Ask Velocity AI</span>
            </button>
          )}
          <Link
            href={`${base}/notifications`}
            className={cn("relative flex h-10 w-10 items-center justify-center rounded-full transition", unread > 0 ? "bg-amber-400 text-white hover:bg-amber-500" : "bg-ink-100 text-ink-500 hover:bg-ink-200")}
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[11px] leading-5 font-bold text-white ring-2 ring-white">{unread > 99 ? "99+" : unread}</span>
            )}
          </Link>
          <Menu trigger={<button className="rounded-full hover:opacity-90" aria-label="Account menu"><Avatar name={user.name} size={40} className="ring-0" /></button>}>{accountMenu}</Menu>
        </div>
      </header>
      {banner && (
        <div
          role="status"
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm sm:px-6 lg:px-8",
            banner.tone === "danger" ? "border-red-200 bg-red-50 text-red-900" : banner.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-200 bg-brand-50 text-brand-900",
          )}
        >
          <span className="font-medium">{banner.text}</span>
          {banner.href ? <Link href={banner.href} className="font-semibold underline underline-offset-2">Plan &amp; billing →</Link> : <span className="opacity-80">Ask your administrator to review the subscription.</span>}
        </div>
      )}
      <main id="main" className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div key={pathname} className="page-enter">{children}</div>
      </main>
      {assistant && <AssistantWidget config={assistant} open={assistantOpen} onOpenChange={setAssistantOpen} />}
    </div>
  );
}
