"use client";
import { useEffect, useState, useTransition } from "react";
import { Check, CreditCard, Landmark, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { quoteAction, startCheckoutAction, submitPaymentAction } from "@/server/actions/billing";

export type PlanCard = {
  key: string;
  name: string;
  description: string | null;
  recommended: boolean;
  features: string[];
  limits: { users: number; dealerships: number; contacts: number; storageMb: number };
  prices: { MONTH: number | null; YEAR: number | null };
};
export type PayAccount = { id: string; method: string; title: string; accountName: string | null; accountNo: string; bankName: string | null; instructions: string | null };
type Interval = "MONTH" | "YEAR";
type Quote = { planName: string; base: number; setupFee: number; discount: number; total: number; currency: string; coupon: string | null; couponMessage: string | null };

const METHOD_LABEL: Record<string, string> = { BANK_TRANSFER: "Bank transfer", RAAST: "Raast", EASYPAISA: "Easypaisa", JAZZCASH: "JazzCash", SADAPAY: "SadaPay", NAYAPAY: "NayaPay" };
const money = (n: number, c: string) => `${c} ${n.toLocaleString("en-US")}`;

export function PlanPicker({ plans, currency, currentPlanKey, currentInterval, stripeEnabled, accounts, hasPending }: { plans: PlanCard[]; currency: string; currentPlanKey: string | null; currentInterval: Interval; stripeEnabled: boolean; accounts: PayAccount[]; hasPending: boolean }) {
  const [interval, setInterval] = useState<Interval>(currentInterval);
  const [chosen, setChosen] = useState<PlanCard | null>(null);
  return (
    <section aria-label="Plans">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink-900">Choose a plan</h2>
        <div role="group" aria-label="Billing period" className="flex rounded-lg border border-ink-200 bg-white p-0.5 text-sm">
          {(["MONTH", "YEAR"] as const).map((i) => (
            <button key={i} type="button" aria-pressed={interval === i} onClick={() => setInterval(i)} className={cn("rounded-md px-3 py-1.5 font-medium transition", interval === i ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100")}>
              {i === "MONTH" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const price = p.prices[interval];
          const current = p.key === currentPlanKey;
          const saving = p.prices.MONTH && p.prices.YEAR ? p.prices.MONTH * 12 - p.prices.YEAR : 0;
          return (
            <article key={p.key} className={cn("card relative flex flex-col p-5", p.recommended && "ring-2 ring-brand-500")}>
              {p.recommended && <span className="bg-gradient-brand absolute -top-3 left-5 rounded-full px-3 py-0.5 text-xs font-semibold text-white">Recommended</span>}
              <h3 className="text-lg font-bold text-ink-900">{p.name}</h3>
              {p.description && <p className="mt-0.5 text-sm text-ink-500">{p.description}</p>}
              <p className="mt-4 text-3xl font-bold tracking-tight text-ink-900 tabular-nums">
                {price === null ? "—" : money(price, currency)}
                <span className="ml-1 text-sm font-medium text-ink-500">/ {interval === "MONTH" ? "month" : "year"}</span>
              </p>
              {interval === "YEAR" && saving > 0 && <p className="text-xs font-medium text-emerald-700">Save {money(saving, currency)} a year</p>}
              <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-700">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{f}</li>
                ))}
              </ul>
              <Button className="mt-5 w-full" variant={p.recommended ? "primary" : "secondary"} disabled={price === null || hasPending} onClick={() => setChosen(p)}>
                {current ? "Renew or switch billing period" : `Choose ${p.name}`}
              </Button>
              {hasPending && <p className="mt-2 text-center text-xs text-ink-500">A payment is waiting to be confirmed.</p>}
            </article>
          );
        })}
      </div>
      {chosen && <PayDialog plan={chosen} interval={interval} currency={currency} stripeEnabled={stripeEnabled} accounts={accounts} onClose={() => setChosen(null)} />}
    </section>
  );
}

function PayDialog({ plan, interval, currency, stripeEnabled, accounts, onClose }: { plan: PlanCard; interval: Interval; currency: string; stripeEnabled: boolean; accounts: PayAccount[]; onClose: () => void }) {
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [mode, setMode] = useState<"card" | "local">(stripeEnabled ? "card" : "local");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const account = accounts.find((a) => a.id === accountId);

  const refresh = (code: string) =>
    start(async () => {
      const r = await quoteAction({ planKey: plan.key, interval, couponCode: code || null });
      if (r.ok) setQuote(r.data as Quote);
      else toast.error(r.error);
    });
  useEffect(() => { refresh(""); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const card = () =>
    start(async () => {
      const r = await startCheckoutAction({ planKey: plan.key, interval, couponCode: coupon || null });
      if (r.ok) window.location.assign((r.data as { url: string }).url);
      else toast.error(r.error);
    });
  const submit = () =>
    start(async () => {
      setErr({});
      const r = await submitPaymentAction({ planKey: plan.key, interval, couponCode: coupon || null, method: account!.method, reference, note });
      if (r.ok) { toast.success(r.message ?? "Submitted"); onClose(); window.location.reload(); }
      else { setErr(r.fieldErrors ?? {}); toast.error(r.error); }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${plan.name} — ${interval === "MONTH" ? "monthly" : "yearly"}`} description="Review the price, then pay by card or by bank/wallet transfer." size="md">
      <div className="space-y-4">
        <div className="rounded-xl bg-ink-50 p-4 text-sm">
          {quote ? (
            <dl className="space-y-1.5">
              <div className="flex justify-between"><dt className="text-ink-600">{quote.planName} plan</dt><dd className="tabular-nums">{money(quote.base, quote.currency)}</dd></div>
              {quote.setupFee > 0 && <div className="flex justify-between"><dt className="text-ink-600">One-time setup fee</dt><dd className="tabular-nums">{money(quote.setupFee, quote.currency)}</dd></div>}
              {quote.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount ({quote.coupon})</dt><dd className="tabular-nums">−{money(quote.discount, quote.currency)}</dd></div>}
              <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold"><dt>Total today</dt><dd className="tabular-nums">{money(quote.total, quote.currency)}</dd></div>
            </dl>
          ) : (
            <p className="flex items-center gap-2 text-ink-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculating…</p>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex-1"><Field label="Coupon code">{(p) => <Input {...p} value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Optional" />}</Field></div>
          <Button variant="secondary" className="mt-[26px]" onClick={() => refresh(coupon)} loading={pending}><Tag className="h-4 w-4" /> Apply</Button>
        </div>
        {quote?.couponMessage && <p className={cn("-mt-2 text-xs", quote.coupon ? "text-emerald-700" : "text-red-600")}>{quote.couponMessage}</p>}

        <div role="tablist" aria-label="Payment method" className="flex rounded-lg border border-ink-200 bg-white p-0.5 text-sm">
          <button role="tab" aria-selected={mode === "card"} disabled={!stripeEnabled} onClick={() => setMode("card")} className={cn("flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 font-medium", mode === "card" ? "bg-ink-900 text-white" : "text-ink-600 disabled:opacity-40")}><CreditCard className="h-4 w-4" /> Card</button>
          <button role="tab" aria-selected={mode === "local"} disabled={!accounts.length} onClick={() => setMode("local")} className={cn("flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 font-medium", mode === "local" ? "bg-ink-900 text-white" : "text-ink-600 disabled:opacity-40")}><Landmark className="h-4 w-4" /> Bank / wallet</button>
        </div>

        {mode === "card" ? (
          <Button className="w-full" size="lg" onClick={card} loading={pending}><CreditCard className="h-4 w-4" /> Pay by card</Button>
        ) : accounts.length ? (
          <div className="space-y-3">
            <Field label="Pay to">{(p) => <Select {...p} value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{METHOD_LABEL[a.method] ?? a.method} — {a.title}</option>)}</Select>}</Field>
            {account && (
              <div className="rounded-xl border border-ink-200 p-3 text-sm">
                <p className="font-semibold text-ink-900">{account.accountName ?? account.title}</p>
                <p className="font-mono text-ink-800 select-all">{account.accountNo}</p>
                {account.bankName && <p className="text-ink-500">{account.bankName}</p>}
                {account.instructions && <p className="mt-1 text-xs text-ink-500">{account.instructions}</p>}
              </div>
            )}
            <Field label="Transaction ID / reference" required error={err.reference} help="From your payment receipt. Each reference can be used once.">{(p) => <Input {...p} value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
            <Field label="Note (optional)">{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            <Button className="w-full" size="lg" onClick={submit} loading={pending} disabled={!reference.trim()}>I have paid — submit for confirmation</Button>
            <p className="text-xs text-ink-500">We confirm the money arrived (usually within one working day), then your plan is activated and an invoice is issued.</p>
          </div>
        ) : (
          <p className="text-sm text-ink-500">No payment method is available yet. Please contact support.</p>
        )}
      </div>
    </Dialog>
  );
}
