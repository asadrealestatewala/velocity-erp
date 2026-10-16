import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";

export default function NoAccess() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ShieldOff className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold">No active dealership access</h1>
        <p className="mt-2 text-sm text-ink-500">
          Your account isn&apos;t linked to an active dealership, or the dealership has been suspended. Contact your dealership manager or the YADEA
          dealer-development team.
        </p>
        <form action={logoutAction} className="mt-6">
          <button className="text-sm font-medium text-brand-600 hover:underline">Sign out</button>
        </form>
        <Link href="/login" className="mt-2 block text-xs text-ink-400 hover:underline">
          Central CRM sign-in
        </Link>
      </div>
    </div>
  );
}
