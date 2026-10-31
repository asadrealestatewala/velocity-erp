"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Building2, Flag, Layers, LayoutDashboard, LifeBuoy, Mail, Megaphone, ScrollText, Settings, ShieldCheck, UserCog, Wallet } from "lucide-react";

const ICONS = { overview: LayoutDashboard, workspaces: Building2, payments: Wallet, plans: Layers, settings: Settings, staff: ShieldCheck, audit: ScrollText, system: Activity, account: UserCog, mail: Mail, announcements: Megaphone, support: LifeBuoy, flags: Flag } as const;
export type RailIcon = keyof typeof ICONS;
export type RailItem = { href: string; label: string; icon: RailIcon };

/** Icon rail: each item has a visible tooltip on hover/focus and a text label for screen readers. */
export function Rail({ items }: { items: RailItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Platform console" className="flex flex-1 flex-col items-center gap-2">
      {items.map((n) => {
        const Icon = ICONS[n.icon];
        const active = n.href === "/platform" ? path === "/platform" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex h-11 w-11 items-center justify-center rounded-2xl transition ${active ? "bg-white/90 text-[#0f1220] shadow-lg" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
          >
            <Icon className="size-5" aria-hidden />
            <span className="sr-only">{n.label}</span>
            <span aria-hidden className="pointer-events-none absolute left-14 z-30 hidden rounded-lg bg-[#0f1220] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg ring-1 ring-white/10 group-hover:block group-focus-visible:block">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
