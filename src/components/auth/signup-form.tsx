"use client";
import { useActionState, useState } from "react";
import { AlertCircle, Building2, Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import Link from "next/link";
import { signupAction } from "@/server/actions/signup";
import { cn } from "@/lib/utils";

const field = (invalid: boolean) =>
  cn(
    "peer h-12 w-full rounded-xl border bg-white pr-11 pl-11 text-[15px] text-ink-900 shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition duration-200 placeholder:text-ink-400",
    "hover:border-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none",
    invalid ? "border-red-400" : "border-ink-200",
  );

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function SignupForm({ baseUrl, trialDays }: { baseUrl: string; trialDays: number }) {
  const [state, action, pending] = useActionState(signupAction, undefined);
  const [company, setCompany] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [show, setShow] = useState(false);
  const fe = state?.fieldErrors ?? {};
  const shownSlug = slugTouched ? slug : slugify(company);

  const Icon = ({ children }: { children: React.ReactNode }) => <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-400 peer-focus:text-brand-600">{children}</span>;
  const Err = ({ k }: { k: string }) => (fe[k] ? <p className="mt-1.5 text-xs font-medium text-red-600">{fe[k]}</p> : null);

  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      {state?.error && !Object.keys(fe).length && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}
      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div>
        <label htmlFor="su-company" className="label">Company name</label>
        <div className="relative">
          <input id="su-company" name="companyName" required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme E-Mobility" autoComplete="organization" className={field(!!fe.companyName)} />
          <Icon><Building2 className="h-[18px] w-[18px]" aria-hidden /></Icon>
        </div>
        <Err k="companyName" />
      </div>

      <div>
        <label htmlFor="su-slug" className="label">Workspace code</label>
        <div className="relative">
          <input
            id="su-slug"
            name="slug"
            required
            value={shownSlug}
            onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
            placeholder="acme"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="su-slug-hint"
            className={field(!!fe.slug)}
          />
          <Icon><span className="text-sm font-semibold">#</span></Icon>
        </div>
        <p id="su-slug-hint" className="mt-1.5 text-xs text-ink-500">
          Your team signs in with this code, or at <span className="font-medium text-ink-700">{baseUrl}/w/{shownSlug || "your-code"}</span>. 3–40 letters, numbers or hyphens.
        </p>
        <Err k="slug" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="su-name" className="label">Your name</label>
          <div className="relative">
            <input id="su-name" name="ownerName" required placeholder="Full name" autoComplete="name" className={field(!!fe.ownerName)} />
            <Icon><User className="h-[18px] w-[18px]" aria-hidden /></Icon>
          </div>
          <Err k="ownerName" />
        </div>
        <div>
          <label htmlFor="su-email" className="label">Work email</label>
          <div className="relative">
            <input id="su-email" name="ownerEmail" type="email" required placeholder="you@company.com" autoComplete="email" className={field(!!fe.ownerEmail)} />
            <Icon><Mail className="h-[18px] w-[18px]" aria-hidden /></Icon>
          </div>
          <Err k="ownerEmail" />
        </div>
      </div>

      <div>
        <label htmlFor="su-pw" className="label">Password</label>
        <div className="relative">
          <input id="su-pw" name="password" type={show ? "text" : "password"} required minLength={10} placeholder="10+ characters, a letter and a number" autoComplete="new-password" className={field(!!fe.password)} />
          <Icon><Lock className="h-[18px] w-[18px]" aria-hidden /></Icon>
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-700">
            {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        </div>
        <Err k="password" />
      </div>

      <label className="flex items-start gap-2.5 text-sm text-ink-600">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 cursor-pointer rounded border-ink-300 accent-brand-600" />
        <span>
          I agree to the <Link href="/legal/terms" className="link text-brand-600" target="_blank">Terms of Service</Link> and <Link href="/legal/privacy" className="link text-brand-600" target="_blank">Privacy Policy</Link>.
        </span>
      </label>
      <Err k="terms" />

      <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-action text-[15px] font-semibold text-white shadow-[var(--shadow-glow)] transition hover:brightness-110 active:scale-[0.985] disabled:opacity-70">
        {pending ? (<><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Creating your workspace…</>) : trialDays > 0 ? `Start ${trialDays}-day free trial` : "Create workspace"}
      </button>
      <p className="text-center text-xs text-ink-500">No card needed. Your company gets its own private database.</p>
    </form>
  );
}
