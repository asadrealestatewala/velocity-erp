import { LogOut } from "lucide-react";
import { Shell } from "@/components/platform/shell";
import { NAV_DEFS, type NavItem } from "@/components/platform/nav";
import { THEME_BOOT } from "@/components/platform/theme";
import { platformLogoutAction } from "@/server/actions/platform";
import { adminCan, requireAdminPage, type PlatformPerm } from "@/server/platform/admin-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Velocity console", template: "%s · Velocity console" }, icons: { icon: "/brand/velocity-app-icon.png" }, robots: { index: false, follow: false } };

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  const items: NavItem[] = NAV_DEFS.filter((n) => adminCan(admin.role, n.perm as PlatformPerm)).map(({ perm: _p, ...i }) => i);
  const signOut = (
    <form action={platformLogoutAction}>
      <button type="submit" aria-label="Sign out" title="Sign out" className="flex size-8 items-center justify-center rounded-md text-[var(--pf-muted)] hover:bg-[var(--pf-sunken)] hover:text-[var(--pf-text)]"><LogOut className="size-4" aria-hidden /></button>
    </form>
  );
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <Shell items={items} name={admin.name} role={admin.role} signOut={signOut} canAudit={adminCan(admin.role, "audit.view")}>{children}</Shell>
    </>
  );
}
