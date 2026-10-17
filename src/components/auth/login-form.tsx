"use client";
import { useActionState, useRef } from "react";
import { Copy, FlaskConical, LogIn } from "lucide-react";
import { toast } from "sonner";
import { loginAction } from "@/server/actions/auth";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { DemoInfo } from "@/server/demo";

export function LoginForm({ portal, next, demo }: { portal: "crm" | "portal"; next?: string; demo?: DemoInfo }) {
  const [state, action] = useActionState(loginAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const useAccount = (email: string) => {
    if (!demo) return;
    emailRef.current!.value = email;
    passwordRef.current!.value = demo.password;
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <form ref={formRef} action={action} className="space-y-4">
        <input type="hidden" name="portal" value={portal} />
        {next && <input type="hidden" name="next" value={next} />}
        <FormError error={state?.error} />
        <Field label="Email">{(p) => <Input {...p} ref={emailRef} name="email" type="email" autoComplete="username" required placeholder="you@company.com" />}</Field>
        <Field label="Password">{(p) => <Input {...p} ref={passwordRef} name="password" type="password" autoComplete="current-password" required />}</Field>
        <SubmitButton className="w-full" size="lg">
          Sign in
        </SubmitButton>
      </form>
      {demo && <DemoAccounts demo={demo} portal={portal} onUse={useAccount} />}
    </>
  );
}

function DemoAccounts({ demo, portal, onUse }: { demo: NonNullable<DemoInfo>; portal: "crm" | "portal"; onUse: (email: string) => void }) {
  // Show the accounts that belong to this sign-in page first.
  const groups = (portal === "crm" ? ["CENTRAL", "DEALERSHIP"] : ["DEALERSHIP", "CENTRAL"]) as ("CENTRAL" | "DEALERSHIP")[];
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error("Couldn't copy — select the text instead"));
  };
  return (
    <section aria-labelledby="demo-accounts" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <h2 id="demo-accounts" className="text-sm font-semibold text-amber-900">Demo accounts — local development only</h2>
          <p className="mt-0.5 text-xs text-amber-800">Click an account to sign in. Hidden automatically in production.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-amber-200">
        <span className="text-xs text-ink-500">Password for all:</span>
        <code className="flex-1 font-mono font-semibold text-ink-900 select-all">{demo.password}</code>
        <button type="button" onClick={() => copy(demo.password, "Password")} className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Copy demo password">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="scrollbar-thin mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
        {groups.map((scope) => {
          const list = demo.accounts.filter((a) => a.scope === scope);
          if (!list.length) return null;
          return (
            <div key={scope}>
              <p className="mb-1 text-[11px] font-semibold tracking-wider text-amber-900/70 uppercase">{scope === "CENTRAL" ? "Central CRM" : "Dealer portal"}</p>
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
                        <p className="truncate text-[11px] text-ink-500">{a.role}{a.dealership ? ` · ${a.dealership}` : ""}</p>
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
