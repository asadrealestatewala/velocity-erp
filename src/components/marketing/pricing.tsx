import Link from "next/link";
import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { cn, fmtMoney } from "@/lib/utils";
import { listPlans, priceOf } from "@/server/platform/plans";

/** Public pricing cards. Every number comes from the plans the operator edits in the platform console. */
export async function Pricing({ currency, interval, basePath }: { currency: "PKR" | "USD"; interval: "MONTH" | "YEAR"; basePath: string }) {
  const plans = await listPlans({ visibleOnly: true });
  const href = (c: string, i: string) => `${basePath}?currency=${c}&interval=${i}`;
  const pill = (active: boolean) => cn("rounded-full px-4 py-1.5 text-sm font-medium", active ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-100");
  return (
    <div>
      <div className="mb-8 flex flex-wrap justify-center gap-3">
        <div className="inline-flex gap-1 rounded-full bg-ink-50 p-1" role="group" aria-label="Billing period">
          <Link href={href(currency, "MONTH")} className={pill(interval === "MONTH")} aria-current={interval === "MONTH"}>Monthly</Link>
          <Link href={href(currency, "YEAR")} className={pill(interval === "YEAR")} aria-current={interval === "YEAR"}>Yearly</Link>
        </div>
        <div className="inline-flex gap-1 rounded-full bg-ink-50 p-1" role="group" aria-label="Currency">
          {(["PKR", "USD"] as const).map((c) => <Link key={c} href={href(c, interval)} className={pill(currency === c)} aria-current={currency === c}>{c}</Link>)}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((p) => {
          const price = priceOf(p, currency, interval);
          const features = Array.isArray(p.features) ? (p.features as string[]) : [];
          return (
            <section key={p.id} className={cn("relative flex flex-col rounded-2xl border bg-white p-6", p.isRecommended ? "border-brand-500 shadow-lg ring-1 ring-brand-500" : "border-ink-200")}>
              {p.isRecommended && <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold text-white">Most popular</span>}
              <h3 className="text-lg font-bold">{p.name}</h3>
              <p className="mt-1 text-sm text-ink-600">{p.description}</p>
              <p className="mt-5 text-3xl font-bold tracking-tight">
                {price ? fmtMoney(price.amount, currency) : "Contact us"}
                {price && <span className="text-sm font-medium text-ink-500"> / {interval === "YEAR" ? "year" : "month"}</span>}
              </p>
              {price && price.setupFee > 0 && <p className="mt-1 text-xs text-ink-500">+ {fmtMoney(price.setupFee, currency)} one-time setup</p>}
              <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-700">
                {features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> {f}</li>)}
              </ul>
              <ButtonLink href="/signup" variant={p.isRecommended ? "primary" : "secondary"} className="mt-6 w-full justify-center">Start free trial</ButtonLink>
            </section>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-ink-500">Prices exclude any local taxes. Pay by card, bank transfer or wallet (Raast, Easypaisa, JazzCash). Cancel any time; nothing is deleted.</p>
    </div>
  );
}
