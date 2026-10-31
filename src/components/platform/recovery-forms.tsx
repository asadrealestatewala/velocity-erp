"use client";
import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { useFormStatus } from "react-dom";
import { requestPlatformPasswordResetAction, resetPlatformPasswordAction } from "@/server/actions/platform-password-reset";
import { PlatformAuthShell } from "@/components/platform/login-card";
import { PlatformPasswordInput } from "@/components/platform/password-input";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-11 w-full rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-purple-700 text-sm font-bold tracking-wide text-white uppercase shadow-lg shadow-pink-500/30 transition hover:brightness-105 active:scale-[0.98] disabled:opacity-70">
      {pending ? "Please wait…" : label}
    </button>
  );
}

const BackLink = () => (
  <Link href="/platform/login" className="mt-8 flex items-center justify-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-pink-600">
    <ArrowLeft className="size-3.5" aria-hidden /> Back to platform sign-in
  </Link>
);

export function PlatformForgotCard() {
  const [state, action] = useActionState(requestPlatformPasswordResetAction, undefined);
  return (
    <PlatformAuthShell title="Forgot password?">
      {state?.done ? (
        <p role="status" className="mt-7 flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          If an operator account exists for that email, we have sent a link to choose a new password. It works once and expires in 1 hour.
        </p>
      ) : (
        <form action={action} className="mt-7 space-y-3">
          <p className="text-center text-sm text-neutral-600">Enter your operator email and we will send you a reset link.</p>
          <div className="relative">
            <label htmlFor="pf-fg-email" className="sr-only">Email</label>
            <input id="pf-fg-email" name="email" type="email" required autoComplete="email" placeholder="Email" className="peer h-11 w-full rounded-full bg-neutral-200/80 pr-4 pl-11 text-sm text-neutral-800 placeholder:text-neutral-500 transition focus:bg-white focus:ring-2 focus:ring-pink-500 focus:outline-none" />
            <Mail className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-neutral-600 peer-focus:text-pink-600" aria-hidden />
          </div>
          {state?.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-center text-sm text-red-700">{state.error}</p>}
          <div className="pt-2"><Submit label="Email me a reset link" /></div>
        </form>
      )}
      <BackLink />
    </PlatformAuthShell>
  );
}

export function PlatformResetCard({ token }: { token: string }) {
  const [state, action] = useActionState(resetPlatformPasswordAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <PlatformAuthShell title="Choose a new password">
      <form action={action} className="mt-7 space-y-3">
        <input type="hidden" name="token" value={token} />
        <PlatformPasswordInput id="pf-new-pass" placeholder="New password (10+ characters)" autoComplete="new-password" minLength={10} />
        {fe.password && <p className="px-2 text-xs font-medium text-red-600">{fe.password}</p>}
        {state?.error && !fe.password && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-center text-sm text-red-700">{state.error}</p>}
        <div className="pt-2"><Submit label="Save new password" /></div>
      </form>
      <BackLink />
    </PlatformAuthShell>
  );
}
