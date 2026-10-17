"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3, Bell, Bike, Building2, CheckSquare, ChevronDown, FileCheck2, FileText, Footprints, History, Inbox, KanbanSquare,
  LayoutDashboard, List, LogOut, Menu as MenuIcon, Plus, Search, Settings, Share2, Shield, Store, Trophy, UserCheck, Users, UsersRound, X, Zap, KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { Avatar } from "@/components/ui/misc";
import { Menu, MenuItem, MenuLabel, MenuLink, MenuSeparator } from "@/components/ui/menu";
import { buttonClass } from "@/components/ui/button";
import type { NavItem } from "./nav";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "layout-dashboard": LayoutDashboard, users: Users, kanban: KanbanSquare, inbox: Inbox, "file-text": FileText, bike: Bike,
  store: Store, "file-check": FileCheck2, zap: Zap, "check-square": CheckSquare, "bar-chart": BarChart3, bell: Bell, shield: Shield,
  settings: Settings, history: History, trophy: Trophy, "user-check": UserCheck, list: List, building: Building2, footprints: Footprints,
  "users-round": UsersRound,
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
  children,
}: {
  variant: "crm" | "portal";
  nav: NavItem[];
  user: { name: string; email: string; roleName: string };
  unread: number;
  subtitle?: string;
  actions?: QuickAction[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
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

  const base = variant === "crm" ? "/crm" : "/portal";
  const section = nav.find((n) => isActive(n.href))?.label ?? (pathname.includes("/account") ? "Account" : "");
  const [q, setQ] = useState("");
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`${base}/contacts?q=${encodeURIComponent(q.trim())}`);
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

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900 text-slate-300">
      <div className="flex h-[72px] shrink-0 items-center gap-2 bg-navy-950 px-5">
        <Link href={`${base}/dashboard`} className="flex items-center" aria-label="YADEA home">
          <Image src="/brand/yadea-logo-light.png" alt="YADEA" width={134} height={29} priority className="h-[29px] w-auto max-w-none" />
        </Link>
        <span className={cn("ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase", variant === "crm" ? "bg-white/10 text-slate-200" : "bg-accent-500 text-white")}>
          {variant === "crm" ? "CRM" : "Dealer"}
        </span>
      </div>

      <div className="space-y-3 px-4 pt-4">
        <Menu
          align="start"
          trigger={
            <button className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-navy-800/70 px-3 py-2.5 text-left transition hover:bg-navy-800" aria-label="Workspace and account menu">
              <Avatar name={user.name} size={38} className="ring-navy-900" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-white">{user.name}</span>
                <span className="block truncate text-[13px] text-slate-400">{subtitle ?? user.roleName}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          }
        >
          {accountMenu}
        </Menu>

        <form role="search" onSubmit={submitSearch} className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            data-global-search
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts"
            aria-label="Search contacts by name, phone, email or business"
            className="h-10 w-full rounded-lg border border-white/10 bg-navy-800/70 pr-[3.75rem] pl-10 text-[14.5px] text-white placeholder:text-slate-400 focus:border-brand-400 focus:bg-navy-800 focus:ring-2 focus:ring-brand-400/30 focus:outline-none"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-slate-400">Ctrl K</kbd>
        </form>
      </div>

      <nav className="scrollbar-thin mt-3 flex-1 overflow-y-auto px-4 pb-4" aria-label="Main">
        {nav.map((item) => {
          const Icon = ICONS[item.icon] ?? List;
          const active = isActive(item.href);
          return (
            <div key={item.href}>
              {item.section && <p className="mt-5 mb-1.5 px-3 text-[11.5px] font-semibold tracking-wider text-slate-500 uppercase">{item.section}</p>}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors",
                  active ? "bg-navy-700/70 font-semibold text-white" : "font-medium text-slate-300 hover:bg-white/5 hover:text-white",
                )}
              >
                {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand-400" aria-hidden />}
                <Icon className={cn("h-5 w-5 shrink-0", active ? "text-brand-300" : "text-slate-400 group-hover:text-slate-200")} />
                <span className="truncate">{item.label}</span>
                {item.icon === "bell" && unread > 0 && (
                  <span className="ml-auto rounded-full bg-accent-500 px-1.5 py-px text-[11px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64 xl:pl-72">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block xl:w-72">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-80 max-w-[88%] animate-pop-in shadow-xl">
            <button className="absolute top-5 right-3 z-10 rounded-md p-1.5 text-slate-300 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-ink-200 bg-white px-4 sm:px-6 lg:px-8">
        <button className="rounded-md p-2 text-ink-600 hover:bg-ink-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <MenuIcon className="h-5 w-5" />
        </button>
        <p className="truncate text-[17px] font-semibold text-ink-900">{section}</p>
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
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
