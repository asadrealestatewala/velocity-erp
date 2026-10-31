"use client";
import Image from "next/image";
import Link from "next/link";
import { useActionState, useRef } from "react";
import { ArrowRight, CheckCircle2, FlaskConical, KeyRound, Mail } from "lucide-react";
import { useFormStatus } from "react-dom";
import { platformLoginAction, type PlatformLoginState } from "@/server/actions/platform";
import { PlatformPasswordInput } from "@/components/platform/password-input";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-purple-700 text-sm font-bold tracking-wide text-white uppercase shadow-lg shadow-pink-500/30 transition hover:brightness-105 active:scale-[0.98] disabled:opacity-70"
    >
      {pending ? "Signing in…" : label}
    </button>
  );
}

const pill = "peer h-11 w-full rounded-full bg-neutral-200/80 pr-4 pl-11 text-sm text-neutral-800 placeholder:text-neutral-500 transition focus:bg-white focus:ring-2 focus:ring-pink-500 focus:outline-none";
const icon = "pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-neutral-600 peer-focus:text-pink-600";

/** Shared frame for the platform sign-in screens: coral → pink → violet backdrop, soft shapes on the left, the content on the right. */
export function PlatformAuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-orange-300 via-pink-500 to-purple-700 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-purple-900/30 md:grid-cols-2">
        {/* Decorative panel */}
        <div aria-hidden className="relative hidden min-h-[26rem] overflow-hidden bg-white md:block">
          <div className="absolute -top-24 -left-24 size-[26rem] rounded-full bg-gradient-to-br from-pink-500 to-purple-700" />
          <div className="absolute -top-10 left-8 size-[26rem] rounded-full border-[26px] border-pink-200/70" />
          <div className="absolute -top-16 -right-10 size-40 rounded-b-full bg-gradient-to-br from-pink-400 to-purple-500" />
          <div className="absolute -bottom-14 left-24 size-48 rounded-full bg-gradient-to-tr from-orange-300 to-pink-400" />
          <div className="absolute bottom-24 -left-10 size-28 rounded-full bg-gradient-to-br from-pink-400 to-purple-500" />
          <div className="absolute top-14 left-9 max-w-[13rem] text-white">
            <p className="text-xs font-semibold tracking-widest uppercase opacity-90">Platform console</p>
            <p className="mt-1 text-xl leading-snug font-bold">Run every workspace, plan and payment.</p>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col justify-center px-7 py-10 sm:px-12">
          <Image src="/brand/velocity-logo.png" alt="Velocity" width={900} height={262} priority className="mx-auto mb-5 h-12 w-auto" />
          <h1 className="text-center text-2xl font-bold text-neutral-900">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

/** Platform operator sign-in. `demo` is only passed when the deployment explicitly enables a throwaway demo account. */
export function PlatformLoginCard({ demo, notice }: { demo?: { email: string; password: string } | null; notice?: string }) {
  const [state, action] = useActionState<PlatformLoginState, FormData>(platformLoginAction, undefined);
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  return (
    <PlatformAuthShell title="Platform Login">
      {notice && <p role="status" className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-800"><CheckCircle2 className="size-4 shrink-0" aria-hidden />{notice}</p>}
      <form action={action} className="mt-7 space-y-3">
        <div className="relative">
          <label htmlFor="pf-email" className="sr-only">Email</label>
          <input ref={emailRef} id="pf-email" name="email" type="email" required autoComplete="username" placeholder="Email" className={pill} />
          <Mail className={icon} aria-hidden />
        </div>
        <PlatformPasswordInput id="pf-pass" inputRef={passRef} />
        {state?.needsCode && (
          <div className="relative">
            <label htmlFor="pf-code" className="sr-only">Authenticator code or recovery code</label>
            <input id="pf-code" name="code" autoFocus autoComplete="one-time-code" placeholder="Authenticator or recovery code" className={pill} />
            <KeyRound className={icon} aria-hidden />
          </div>
        )}
        {state?.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-center text-sm text-red-700">{state.error}</p>}
        <div className="text-right"><Link href="/platform/forgot-password" className="text-xs font-medium text-pink-600 hover:underline">Forgot your password?</Link></div>
        <div className="pt-1"><Submit label={state?.needsCode ? "Verify" : "Login"} /></div>
      </form>
      {demo && (
        <section aria-labelledby="pf-demo" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
          <h2 id="pf-demo" className="flex items-center gap-1.5 font-semibold"><FlaskConical className="size-3.5" aria-hidden />Demo account (read-only)</h2>
          <p className="mt-1.5 break-all">Email: <code className="font-mono font-semibold select-all">{demo.email}</code></p>
          <p className="break-all">Password: <code className="font-mono font-semibold select-all">{demo.password}</code></p>
          <button type="button" onClick={() => { if (emailRef.current) emailRef.current.value = demo.email; if (passRef.current) passRef.current.value = demo.password; }} className="mt-2 rounded-full bg-amber-200/70 px-3 py-1 font-semibold hover:bg-amber-200">Fill in the form</button>
        </section>
      )}
      <p className="mt-5 text-center text-xs text-neutral-500">For platform operators only.</p>
      <Link href="/login" className="mt-8 flex items-center justify-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-pink-600">
        Company staff sign in here <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </PlatformAuthShell>
  );
}
