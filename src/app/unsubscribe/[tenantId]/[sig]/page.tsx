import { notFound } from "next/navigation";
import { optOut, verifyUnsubscribe } from "@/server/platform/campaigns";
import { platformDb } from "@/server/platform/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

/** Opening the link only shows a button: mail scanners that pre-fetch links must not unsubscribe anyone. */
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ tenantId: string; sig: string }>; searchParams: Promise<{ done?: string }> }) {
  const { tenantId, sig } = await params;
  const { done } = await searchParams;
  if (!verifyUnsubscribe(tenantId, sig)) notFound();
  const t = await platformDb().tenant.findUnique({ where: { id: tenantId }, select: { name: true, marketingOptOutAt: true } });
  if (!t) notFound();
  async function confirm() {
    "use server";
    const { redirect } = await import("next/navigation");
    await optOut(tenantId);
    redirect(`/unsubscribe/${tenantId}/${sig}?done=1`);
  }
  const off = Boolean(t.marketingOptOutAt) || done === "1";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-xl font-semibold">{off ? "You are unsubscribed" : "Unsubscribe from product news?"}</h1>
      <p className="text-sm text-slate-600">
        {off ? `We will no longer send product news about ${t.name}. You will still get account, security and billing emails.` : `We will stop sending product news about ${t.name}. You will still get account, security and billing emails.`}
      </p>
      {!off && <form action={confirm}><button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Unsubscribe</button></form>}
    </main>
  );
}
