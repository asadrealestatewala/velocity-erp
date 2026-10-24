import Link from "next/link";
import { LayoutDashboard, Building2, Wallet, Layers, Settings, ShieldCheck, ScrollText, Activity, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platformLogoutAction } from "@/server/actions/platform";
import { adminCan, requireAdminPage, type PlatformPerm } from "@/server/platform/admin-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Platform console", template: "%s · Platform console" }, robots: { index: false, follow: false } };

const NAV: { href: string; label: string; icon: typeof Activity; perm: PlatformPerm }[] = [
  { href: "/platform", label: "Overview", icon: LayoutDashboard, perm: "dashboard" },
  { href: "/platform/workspaces", label: "Workspaces", icon: Building2, perm: "tenants.view" },
  { href: "/platform/payments", label: "Payments & invoices", icon: Wallet, perm: "payments.manage" },
  { href: "/platform/plans", label: "Plans & coupons", icon: Layers, perm: "plans.manage" },
  { href: "/platform/settings", label: "Settings", icon: Settings, perm: "settings.manage" },
  { href: "/platform/admins", label: "Platform staff", icon: ShieldCheck, perm: "admins.manage" },
  { href: "/platform/audit", label: "Audit log", icon: ScrollText, perm: "audit.view" },
  { href: "/platform/system", label: "System", icon: Activity, perm: "system.manage" },
];

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <div className="min-h-dvh bg-slate-50 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-slate-200 bg-white p-4 lg:border-r lg:border-b-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Platform console</p>
        <nav className="mt-3 flex flex-wrap gap-1 lg:flex-col">
          {NAV.filter((n) => adminCan(admin.role, n.perm)).map((n) => (
            <Link key={n.href} href={n.href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              <n.icon className="size-4" aria-hidden /> {n.label}
            </Link>
          ))}
          <Link href="/platform/account" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            <UserCog className="size-4" aria-hidden /> My account
          </Link>
        </nav>
        <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <p className="truncate">{admin.email}</p>
          <p>{admin.role.toLowerCase()}</p>
          <form action={platformLogoutAction} className="mt-2"><Button type="submit" size="sm" variant="secondary">Sign out</Button></form>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-6">{children}</main>
    </div>
  );
}
