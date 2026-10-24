"use client";
import { useActionState, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import { acceptInvitationAction } from "@/server/actions/invitations";
import { requestPasswordResetAction, resetPasswordAction } from "@/server/actions/password-reset";
import { cn } from "@/lib/utils";

const field = (invalid: boolean) =>
  cn(
    "peer h-12 w-full rounded-xl border bg-white pr-11 pl-11 text-[15px] text-ink-900 shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition duration-200 placeholder:text-ink-400",
    "hover:border-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none",
    invalid ? "border-red-400" : "border-ink-200",
  );

const Banner = ({ children }: { children: React.ReactNode }) => (
  <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
    <span>{children}</span>
  </div>
);

const Submit = ({ pending, children }: { pending: boolean; children: React.ReactNode }) => (
  <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-action text-[15px] font-semibold text-white shadow-[var(--shadow-glow)] transition hover:brightness-110 active:scale-[0.985] disabled:opacity-70">
    {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
    {children}
  </button>
);

function PasswordInput({ id, label, error }: { id: string; label: string; error?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input id={id} name="password" type={show ? "text" : "password"} required minLength={10} autoComplete="new-password" placeholder="10+ characters, a letter and a number" className={field(!!error)} />
        <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-ink-400 peer-focus:text-brand-600" aria-hidden />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-700">
          {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function AcceptInviteForm({ token, email, suggestedName }: { token: string; email: string; suggestedName?: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <input type="hidden" name="token" value={token} />
      {state?.error && !Object.keys(fe).length && <Banner>{state.error}</Banner>}
      <div>
        <label className="label" htmlFor="inv-email">Email</label>
        <div className="relative">
          <input id="inv-email" value={email} readOnly className={cn(field(false), "bg-ink-50 text-ink-600")} />
          <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-ink-400" aria-hidden />
        </div>
      </div>
      <div>
        <label htmlFor="inv-name" className="label">Your name</label>
        <div className="relative">
          <input id="inv-name" name="name" required defaultValue={suggestedName} autoComplete="name" placeholder="Full name" className={field(!!fe.name)} />
          <User className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-ink-400 peer-focus:text-brand-600" aria-hidden />
        </div>
        {fe.name && <p className="mt-1.5 text-xs font-medium text-red-600">{fe.name}</p>}
      </div>
      <PasswordInput id="inv-pw" label="Choose a password" error={fe.password} />
      <Submit pending={pending}>Join the workspace</Submit>
    </form>
  );
}

export function ForgotForm({ defaultWorkspace }: { defaultWorkspace: string }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, undefined);
  if (state?.done)
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <p>If an account exists for that email in that workspace, we have sent a link to choose a new password. It works once and expires in 2 hours.</p>
      </div>
    );
  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      {state?.error && <Banner>{state.error}</Banner>}
      <div>
        <label htmlFor="fg-ws" className="label">Workspace code <span className="font-normal text-ink-400">(optional)</span></label>
        <div className="relative">
          <input id="fg-ws" name="workspace" defaultValue={defaultWorkspace} autoCapitalize="none" spellCheck={false} placeholder="your-company" className={field(false)} />
          <Building2 className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-ink-400" aria-hidden />
        </div>
      </div>
      <div>
        <label htmlFor="fg-email" className="label">Email</label>
        <div className="relative">
          <input id="fg-email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" className={field(false)} />
          <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-ink-400" aria-hidden />
        </div>
      </div>
      <Submit pending={pending}>Email me a reset link</Submit>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <input type="hidden" name="token" value={token} />
      {state?.error && !Object.keys(fe).length && <Banner>{state.error}</Banner>}
      <PasswordInput id="rs-pw" label="New password" error={fe.password} />
      <Submit pending={pending}>Save new password</Submit>
    </form>
  );
}
