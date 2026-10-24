"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Building2, Check, Copy, Eye, EyeOff, FlaskConical, Loader2, Lock, LogIn, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { loginAction, loginWithResultAction } from "@/server/actions/auth";
import { cn } from "@/lib/utils";
import type { DemoGroup, DemoInfo } from "@/server/demo";
import { useScene } from "./auth-scene";

type Portal = "crm" | "portal" | "procurement";
type FieldErrors = { identifier?: string; password?: string };

const fieldCls = (invalid: boolean) =>
  cn(
    "peer h-12 w-full rounded-xl border bg-white pr-11 pl-11 text-[15px] text-ink-900 shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition duration-200 placeholder:text-ink-400",
    "hover:border-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none disabled:bg-ink-50 disabled:text-ink-400",
    invalid ? "border-red-400 focus:border-red-500 focus:ring-red-500/15" : "border-ink-200",
  );

export function LoginForm({ portal, next, demo, defaultWorkspace = "", notice }: { portal: Portal; next?: string; demo?: DemoInfo; defaultWorkspace?: string; notice?: string }) {
  const router = useRouter();
  const { phase, setPhase } = useScene();
  // Without JavaScript the form still posts to the server action (it redirects on success). With JavaScript the
  // submit handler below takes over so the scene can show the real outcome before navigating.
  const [fallback, fallbackAction] = useActionState(loginAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const busy = phase === "submitting" || phase === "success";
  const message = error ?? fallback?.error ?? null;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const useAccount = (identifier: string) => {
    if (!demo || busy) return;
    idRef.current!.value = identifier;
    passwordRef.current!.value = demo.password;
    formRef.current?.requestSubmit();
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return; // one request at a time — no duplicate sign-ins
    const data = new FormData(e.currentTarget);
    const identifier = String(data.get("identifier") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const fe: FieldErrors = {};
    if (identifier.length < 3) fe.identifier = "Enter your email address or mobile number.";
    if (!password) fe.password = "Enter your password.";
    setFieldErrors(fe);
    setError(null);
    if (fe.identifier || fe.password) {
      (fe.identifier ? idRef.current : passwordRef.current)?.focus();
      return;
    }
    setPhase("submitting");
    try {
      const result = await loginWithResultAction(undefined, data);
      if (!result.ok && result.needsCode) {
        // Password was right and this account uses two-factor: ask for the code (the form keeps what was typed).
        setNeedsCode(true);
        setError(result.error || null);
        setPhase(result.error ? "error" : "idle");
        setTimeout(() => codeRef.current?.focus(), 0);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        setPhase("error");
        passwordRef.current?.select();
        return;
      }
      // The server has confirmed the credentials and created the session: only now does the success scene play.
      setPhase("success");
      router.prefetch(result.redirectTo);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      timers.current.push(setTimeout(() => router.replace(result.redirectTo), reduce ? 0 : 750));
      timers.current.push(setTimeout(() => window.location.assign(result.redirectTo), 8000)); // safety net if client navigation stalls
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setPhase("error");
    }
  };

  const clearFeedback = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) setFieldErrors((f) => ({ ...f, [field]: undefined }));
    if (phase === "error") setPhase("idle");
  };

  return (
    <>
      <form ref={formRef} action={fallbackAction} onSubmit={onSubmit} noValidate className="space-y-5" aria-busy={busy}>
        <input type="hidden" name="portal" value={portal} />
        {next && <input type="hidden" name="next" value={next} />}

        {notice && !message && (
          <div role="status" className="reveal flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span>{notice}</span>
          </div>
        )}
        {message && (
          <div role="alert" className="reveal flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
            <span>{message}</span>
          </div>
        )}

        <div>
          <label htmlFor="login-ws" className="label">Workspace code <span className="font-normal text-ink-400">(optional)</span></label>
          <div className="relative">
            <input
              id="login-ws"
              name="workspace"
              type="text"
              autoComplete="organization"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              defaultValue={defaultWorkspace}
              placeholder="your-company"
              aria-describedby="login-ws-hint"
              className={fieldCls(false)}
            />
            <Building2 className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-ink-400 transition-colors peer-focus:text-brand-600" aria-hidden />
          </div>
          <p id="login-ws-hint" className="mt-1.5 text-xs text-ink-500">Your company&apos;s code from signup. Leave it empty for the default workspace.</p>
        </div>

        <div>
          <label htmlFor="login-id" className="label">Email or mobile number</label>
          <div className="relative">
            <input
              id="login-id"
              ref={idRef}
              name="identifier"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={busy}
              placeholder="name@company.com or 03xx xxxxxxx"
              aria-invalid={fieldErrors.identifier ? true : undefined}
              aria-describedby={fieldErrors.identifier ? "login-id-err" : undefined}
              onInput={() => clearFeedback("identifier")}
              className={fieldCls(!!fieldErrors.identifier)}
            />
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-ink-400 transition-colors peer-focus:text-brand-600" aria-hidden />
          </div>
          {fieldErrors.identifier && <p id="login-id-err" className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.identifier}</p>}
        </div>

        <div>
          <label htmlFor="login-pw" className="label">Password</label>
          <div className="relative">
            <input
              id="login-pw"
              ref={passwordRef}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={busy}
              placeholder="Your password"
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={cn(fieldErrors.password && "login-pw-err", capsLock && "login-caps") || undefined}
              onInput={() => clearFeedback("password")}
              onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
              onBlur={() => setCapsLock(false)}
              className={fieldCls(!!fieldErrors.password)}
            />
            <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-ink-400 transition-colors peer-focus:text-brand-600" aria-hidden />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              disabled={busy}
              className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 disabled:opacity-50"
            >
              {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>
          <div className="mt-1.5 text-right"><a href="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline">Forgot your password?</a></div>
          {fieldErrors.password && <p id="login-pw-err" className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.password}</p>}
          {capsLock && <p id="login-caps" className="mt-1.5 text-xs font-medium text-amber-700">Caps Lock is on.</p>}
        </div>

        {needsCode && (
          <div>
            <label htmlFor="login-code" className="label">Authenticator code</label>
            <div className="relative">
              <input id="login-code" ref={codeRef} name="code" type="text" inputMode="text" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} disabled={busy} placeholder="6-digit code or recovery code" className={fieldCls(false)} />
              <ShieldCheck className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-ink-400 transition-colors peer-focus:text-brand-600" aria-hidden />
            </div>
            <p className="mt-1.5 text-xs text-ink-500">Open your authenticator app and type the current code.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          data-state={phase}
          className={cn(
            "group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] font-semibold text-white shadow-[var(--shadow-glow)] transition duration-200",
            "bg-gradient-to-b from-yadea-500 to-yadea-600 hover:-translate-y-px hover:to-yadea-700 active:translate-y-0 active:scale-[0.985]",
            "disabled:pointer-events-none",
            phase === "success" && "!from-emerald-500 !to-emerald-600",
            phase === "submitting" && "opacity-90",
          )}
        >
          <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/25 opacity-0 transition duration-700 group-hover:translate-x-[420%] group-hover:opacity-100 motion-reduce:hidden" />
          {phase === "success" ? (
            <>
              <Check className="h-5 w-5" aria-hidden /> Welcome back
            </>
          ) : phase === "submitting" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Signing in…
            </>
          ) : (
            <>
              Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </>
          )}
        </button>
      </form>
      {demo && <DemoAccounts demo={demo} portal={portal} onUse={useAccount} />}
    </>
  );
}

const GROUP_LABEL: Record<DemoGroup, string> = { PROCUREMENT: "Procurement portal", CENTRAL: "Central CRM", DEALERSHIP: "Dealer portal" };

function DemoAccounts({ demo, portal, onUse }: { demo: NonNullable<DemoInfo>; portal: Portal; onUse: (identifier: string) => void }) {
  // Show the accounts that belong to this sign-in page first.
  const groups: DemoGroup[] =
    portal === "crm" ? ["CENTRAL", "PROCUREMENT", "DEALERSHIP"] : portal === "procurement" ? ["PROCUREMENT", "CENTRAL", "DEALERSHIP"] : ["DEALERSHIP", "CENTRAL", "PROCUREMENT"];
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error("Couldn't copy — select the text instead"));
  };
  return (
    <section aria-labelledby="demo-accounts" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <h2 id="demo-accounts" className="text-sm font-semibold text-amber-900">Demo accounts — local use only</h2>
          <p className="mt-0.5 text-xs text-amber-800">Click an account to sign in. Dealership accounts can also sign in with their mobile number. This panel only appears when the app runs on localhost.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-amber-200">
        <span className="text-xs text-ink-500">Password for all:</span>
        <code className="flex-1 font-mono font-semibold text-ink-900 select-all">{demo.password}</code>
        <button type="button" onClick={() => copy(demo.password, "Password")} className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Copy demo password">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="scrollbar-thin mt-3 max-h-[min(20rem,32dvh)] space-y-3 overflow-y-auto pr-1">
        {groups.map((group) => {
          const list = demo.accounts.filter((a) => a.group === group);
          if (!list.length) return null;
          return (
            <div key={group}>
              <p className="mb-1 text-[11px] font-semibold tracking-wider text-amber-900/70 uppercase">{GROUP_LABEL[group]}</p>
              <ul className="space-y-1">
                {list.map((a) => (
                  <li key={a.email}>
                    <button
                      type="button"
                      onClick={() => onUse(a.email)}
                      className="group flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-left ring-1 ring-amber-100 transition hover:ring-brand-400"
                      title={`Sign in as ${a.email}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink-900">{a.email}</p>
                        <p className="truncate text-[11px] text-ink-500">
                          {a.role}{a.dealership ? ` · ${a.dealership}` : ""}{a.phone ? ` · ${a.phone}` : ""}
                        </p>
                      </div>
                      <LogIn className="h-4 w-4 shrink-0 text-ink-300 group-hover:text-brand-600" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-amber-800/80">If you changed a demo account&apos;s password, the value above won&apos;t work for it. Turn this panel off with <code>SHOW_DEMO_CREDENTIALS=false</code>.</p>
    </section>
  );
}
