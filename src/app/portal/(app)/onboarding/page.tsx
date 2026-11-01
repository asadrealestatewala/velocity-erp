import Link from "next/link";
import { Check } from "lucide-react";
import { db } from "@/lib/db";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { CsvImport } from "@/components/onboarding/csv-import";
import { importCustomersAction, importVehiclesAction } from "@/server/actions/onboarding";
import { getDealerSetupCounts } from "@/server/services/dealer-setup";
import { buildDealerChecklist, CUSTOMER_CSV_HEADER, VEHICLE_CSV_HEADER } from "@/lib/dealer-onboarding";
import { cn, sp } from "@/lib/utils";

export const metadata = { title: "Set up your dealership" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage();
  const params = await searchParams;
  const dealershipId = activeDealershipId(user, sp(params.dealership))!;
  const [counts, models] = await Promise.all([getDealerSetupCounts(dealershipId), db.bikeModel.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { name: true } })]);
  const steps = buildDealerChecklist(counts, (p) => can(user, p as Parameters<typeof can>[1]));
  const active = steps.find((s) => s.key === sp(params.step)) ?? steps.find((s) => !s.done) ?? steps[0];

  return (
    <>
      <PageHeader title="Set up your dealership" description="Four short steps to get your showroom ready. Each one is optional and can be done later." breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Setup" }]} />
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <nav aria-label="Setup steps">
          <ol className="card divide-y divide-ink-100">
            {steps.map((s, i) => (
              <li key={s.key}>
                <Link href={s.key === "stock" || s.key === "customers" ? `/portal/onboarding?step=${s.key}` : s.href} aria-current={active?.key === s.key ? "step" : undefined} className={cn("flex items-center gap-3 px-4 py-3 text-sm", active?.key === s.key ? "bg-brand-50" : "hover:bg-ink-50")}>
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", s.done ? "bg-emerald-500 text-white" : "border-2 border-ink-200 text-ink-500")}>{s.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}</span>
                  <span className={cn("font-medium", s.done ? "text-ink-400" : "text-ink-900")}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <div>
          {active?.key === "stock" && (
            <Card>
              <CardHeader title="Import your vehicle stock" description={`Columns: model, chassis_number, engine_number, color, note. Model must match one of: ${models.map((m) => m.name).join(", ") || "(no models yet)"}. Up to 500 rows at a time.`} />
              <div className="p-5"><CsvImport dealershipId={dealershipId} action={importVehiclesAction} header={VEHICLE_CSV_HEADER} example={`${models[0]?.name ?? "Model name"},LC1234567890,EN123456,Black,`} noun="vehicles" /></div>
            </Card>
          )}
          {active?.key === "customers" && (
            <Card>
              <CardHeader title="Import your customers" description="Columns: first_name, last_name, phone, email, address. Each row needs a first name and a phone or email; people already in the system are skipped. Up to 500 rows at a time." />
              <div className="p-5"><CsvImport dealershipId={dealershipId} action={importCustomersAction} header={CUSTOMER_CSV_HEADER} example="Ali,Khan,0300 1234567,ali@example.com," noun="customers" /></div>
            </Card>
          )}
          {active && active.key !== "stock" && active.key !== "customers" && (
            <Card>
              <CardHeader title={active.label} description={active.hint} />
              <div className="p-5"><Link href={active.href} className="font-semibold text-brand-600 hover:underline">Open {active.key === "team" ? "Team" : "Settings"} →</Link></div>
            </Card>
          )}
          {!active && <p className="text-sm text-ink-500">Nothing to set up with your permissions.</p>}
        </div>
      </div>
    </>
  );
}
