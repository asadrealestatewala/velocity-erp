"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3, Bell, Bike, Building2, CheckSquare, FileCheck2, FileText, Footprints, History, Inbox, KanbanSquare,
  LayoutDashboard, List, LogOut, Menu as MenuIcon, Search, Settings, Shield, Store, Trophy, UserCheck, Users, UsersRound, X, Zap, KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { Avatar } from "@/components/ui/misc";
import { Menu, MenuItem, MenuLabel, MenuLink, MenuSeparator } from "@/components/ui/menu";
import type { NavItem } from "./nav";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "layout-dashboard": LayoutDashboard, users: Users, kanban: KanbanSquare, inbox: Inbox, "file-text": FileText, bike: Bike,
  store: Store, "file-check": FileCheck2, zap: Zap, "check-square": CheckSquare, "bar-chart": BarChart3, bell: Bell, shield: Shield,
  settings: Settings, history: History, trophy: Trophy, "user-check": UserCheck, list: List, building: Building2, footprints: Footprints,
  "users-round": UsersRound,
};

export function AppShell({
  variant,
  nav,
  user,
  unread,
  subtitle,
  children,
}: {
  variant: "crm" | "portal";
  nav: NavItem[];
  user: { name: string; email: string; roleName: string };
  unread: number;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => setOpen(false), [pathname, search]);

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

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-ink-100 px-5">
        <Link href={`${base}/dashboard`} className="flex items-center gap-2.5">
          <Image src="/brand/yadea-logo-dark.png" alt="YADEA" width={110} height={24} priority className="h-6 w-auto" />
        </Link>
        <span className={cn("ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase", variant === "crm" ? "bg-ink-900 text-white" : "bg-brand-500 text-white")}>
          {variant === "crm" ? "CRM" : "Dealer"}
        </span>
      </div>
      {subtitle && (
        <div className="border-b border-ink-100 px-5 py-3">
          <p className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">Dealership</p>
          <p className="truncate text-sm font-semibold text-ink-900">{subtitle}</p>
        </div>
      )}
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3" aria-label="Main">
        {nav.map((item) => {
          const Icon = ICONS[item.icon] ?? List;
          const active = isActive(item.href);
          return (
            <div key={item.href}>
              {item.section && <p className="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">{item.section}</p>}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600")} />
                <span className="truncate">{item.label}</span>
                {item.icon === "bell" && unread > 0 && (
                  <span className="ml-auto rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-ink-100 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user.name} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-500">{user.roleName}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-ink-200/70 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-ink-950/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] animate-pop-in bg-white shadow-xl">
            <button className="absolute top-4 right-3 rounded-md p-1.5 text-ink-500 hover:bg-ink-100" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <Topbar base={base} unread={unread} user={user} onMenu={() => setOpen(true)} />
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function Topbar({ base, unread, user, onMenu }: { base: string; unread: number; user: { name: string; email: string; roleName: string }; onMenu: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200/70 bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <MenuIcon className="h-5 w-5" />
      </button>
      <form
        role="search"
        className="relative max-w-md flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`${base}/contacts?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contacts by name, phone, email, business…"
          aria-label="Search contacts"
          className="h-9 w-full rounded-lg border border-ink-200 bg-ink-50 pr-3 pl-9 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
        />
      </form>
      <div className="ml-auto flex items-center gap-1.5">
        <Link href={`${base}/notifications`} className="relative rounded-lg p-2 text-ink-600 hover:bg-ink-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />}
        </Link>
        <Menu
          trigger={
            <button className="flex items-center gap-2 rounded-lg p-1 hover:bg-ink-100" aria-label="Account menu">
              <Avatar name={user.name} size={30} />
            </button>
          }
        >
          <MenuLabel>{user.email}</MenuLabel>
          <MenuLink href={`${base}/account`}>
            <KeyRound className="h-4 w-4" /> Account & password
          </MenuLink>
          <MenuSeparator />
          <MenuItem danger onSelect={() => void logoutAction()}>
            <LogOut className="h-4 w-4" /> Sign out
          </MenuItem>
        </Menu>
      </div>
    </header>
  );
}
