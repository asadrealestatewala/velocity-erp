"use client";
import { useActionState, useRef } from "react";
import { Copy, FlaskConical, LogIn } from "lucide-react";
import { toast } from "sonner";
import { loginAction } from "@/server/actions/auth";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { DemoGroup, DemoInfo } from "@/server/demo";

type Portal = "crm" | "portal" | "procurement";

export function LoginForm({ portal, next, demo }: { portal: Portal; next?: string; demo?: DemoInfo }) {
  const [state, action] = useActionState(loginAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const useAccount = (identifier: string) => {
    if (!demo) return;
    idRef.current!.value = identifier;
    passwordRef.current!.value = demo.password;
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <form ref={formRef} action={action} className="space-y-4">
        <input type="hidden" name="portal" value={portal} />
        {next && <input type="hidden" name="next" value={next} />}
        <FormError error={state?.error} />
        <Field label="Email or mobile number">
          {(p) => <Input {...p} ref={idRef} name="identifier" type="text" inputMode="email" autoComplete="username" required placeholder="name@company.com or 03xx xxxxxxx" />}
        </Field>
        <Field label="Password">{(p) => <Input {...p} ref={passwordRef} name="password" type="password" autoComplete="current-password" required />}</Field>
        <SubmitButton className="w-full" size="lg">
          Sign in
        </SubmitButton>
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
