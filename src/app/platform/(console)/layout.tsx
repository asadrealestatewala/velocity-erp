import Image from "next/image";
import { LogOut } from "lucide-react";
import { Rail, type RailItem } from "@/components/platform/rail";
import { platformLogoutAction } from "@/server/actions/platform";
import { adminCan, requireAdminPage, type PlatformPerm } from "@/server/platform/admin-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Velocity console", template: "%s · Velocity console" }, icons: { icon: "/brand/velocity-app-icon.png" }, robots: { index: false, follow: false } };

const NAV: (RailItem & { perm: PlatformPerm })[] = [
  { href: "/platform", label: "Overview", icon: "overview", perm: "dashboard" },
  { href: "/platform/workspaces", label: "Workspaces", icon: "workspaces", perm: "tenants.view" },
  { href: "/platform/payments", label: "Payments & invoices", icon: "payments", perm: "payments.manage" },
  { href: "/platform/plans", label: "Plans & coupons", icon: "plans", perm: "plans.manage" },
  { href: "/platform/settings", label: "Settings", icon: "settings", perm: "settings.manage" },
  { href: "/platform/admins", label: "Platform staff", icon: "staff", perm: "admins.manage" },
  { href: "/platform/audit", label: "Audit log", icon: "audit", perm: "audit.view" },
  { href: "/platform/system", label: "System", icon: "system", perm: "system.manage" },
];

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  const items: RailItem[] = [...NAV.filter((n) => adminCan(admin.role, n.perm)).map(({ perm: _p, ...i }) => i), { href: "/platform/account", label: "My account", icon: "account" }];
  return (
    <div className="pf min-h-dvh bg-[#e4e1de] p-2 sm:p-5">
      <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-[1560px] overflow-hidden rounded-[2rem] bg-[#efedea] shadow-2xl shadow-black/15 sm:min-h-[calc(100dvh-2.5rem)]">
        <aside className="flex w-[4.75rem] shrink-0 flex-col items-center bg-[#0f1220] py-5">
          <div className="mb-7 flex size-11 items-center justify-center rounded-2xl bg-white">
            <Image src="/brand/velocity-mark.png" alt="Velocity platform" width={28} height={28} className="size-7 object-contain" />
          </div>
          <Rail items={items} />
          <div className="mt-4 flex flex-col items-center gap-3">
            <span title={`${admin.name} · ${admin.role.toLowerCase()}`} className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 text-sm font-bold text-white ring-2 ring-white/20">{initials(admin.name)}</span>
            <form action={platformLogoutAction}>
              <button type="submit" aria-label="Sign out" title="Sign out" className="flex size-10 items-center justify-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white"><LogOut className="size-[18px]" aria-hidden /></button>
            </form>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
