import { Check, CircleDot } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { DISPATCH_FLOW, DISPATCH_STATUS, PROCUREMENT_STATUS } from "@/lib/ops-constants";
import { cn, fmtDate, fmtDateTime, fmtMoney } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const m = PROCUREMENT_STATUS[status];
  return <Badge tone={m?.tone ?? "gray"}>{m?.label ?? status}</Badge>;
}

export function DispatchBadge({ status, orderStatus }: { status: string; orderStatus?: string }) {
  if (orderStatus && ["SUBMITTED", "REJECTED", "CANCELLED"].includes(orderStatus)) return <span className="text-ink-400">—</span>;
  const m = DISPATCH_STATUS[status];
  return <Badge tone={m?.tone ?? "gray"}>{m?.label ?? status}</Badge>;
}

/** Horizontal tracker: Received → Approved → Packing → Dispatched → In transit → Delivered. */
export function OrderTracker({ status, dispatchStatus }: { status: string; dispatchStatus: string }) {
  if (status === "REJECTED" || status === "CANCELLED") {
    return <p className={cn("rounded-lg px-4 py-3 text-sm font-medium", status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-ink-100 text-ink-600")}>{status === "REJECTED" ? "This order was not approved." : "This order was cancelled."}</p>;
  }
  const steps = [
    { key: "SUBMITTED", label: "Received" },
    { key: "APPROVED", label: "Approved" },
    { key: "PACKING", label: "Packing" },
    { key: "DISPATCHED", label: "Dispatched" },
    { key: "IN_TRANSIT", label: "In transit" },
    { key: "DELIVERED", label: "Delivered" },
  ];
  const currentIndex = status === "SUBMITTED" ? 0 : status === "DELIVERED" ? 5 : Math.max(1, DISPATCH_FLOW.indexOf(dispatchStatus as (typeof DISPATCH_FLOW)[number]) + 1);
  return (
    <ol className="flex items-start" aria-label="Order progress">
      {steps.map((s, i) => {
        const done = i < currentIndex || status === "DELIVERED";
        const current = i === currentIndex && status !== "DELIVERED";
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center text-center" aria-current={current ? "step" : undefined}>
            {i > 0 && <span aria-hidden className={cn("absolute top-3.5 right-1/2 h-0.5 w-full", done ? "bg-emerald-400" : "bg-ink-200")} />}
            <span className={cn("relative z-10 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white", done ? "bg-emerald-500 text-white" : "bg-ink-200 text-ink-400", current && "bg-brand-500 text-white")}>
              {done && !current ? <Check className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
            </span>
            <span className={cn("mt-1.5 text-xs", done || current ? "font-semibold text-ink-900" : "text-ink-400")}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

type Line = { id: string; name: string; code: string | null; quantity: number; unitPrice: { toString(): string }; lineTotal: { toString(): string }; quantityReceived: number };

export function OrderLines({ lines, currency, subtotal, showReceived }: { lines: Line[]; currency: string; subtotal: { toString(): string }; showReceived?: boolean }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead className="bg-ink-50/60">
          <tr><th className="th">Item</th><th className="th">Code</th><th className="th text-right">Ordered</th>{showReceived && <th className="th text-right">Received</th>}<th className="th text-right">Unit price</th><th className="th text-right">Line total</th></tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="td font-medium text-ink-900">{l.name}</td>
              <td className="td font-mono text-xs">{l.code ?? "—"}</td>
              <td className="td text-right tabular-nums">{l.quantity}</td>
              {showReceived && <td className={cn("td text-right tabular-nums", l.quantityReceived < l.quantity && "font-semibold text-amber-700")}>{l.quantityReceived}</td>}
              <td className="td text-right tabular-nums">{Number(l.unitPrice.toString()) > 0 ? fmtMoney(l.unitPrice.toString(), currency) : <span className="text-ink-400">TBC</span>}</td>
              <td className="td text-right font-medium tabular-nums">{Number(l.lineTotal.toString()) > 0 ? fmtMoney(l.lineTotal.toString(), currency) : <span className="text-ink-400">TBC</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-ink-200">
          <tr><td colSpan={showReceived ? 5 : 4} className="td text-right font-semibold text-ink-900">Total</td><td className="td text-right text-base font-bold tabular-nums">{Number(subtotal.toString()) > 0 ? fmtMoney(subtotal.toString(), currency) : "To be confirmed"}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

type HistoryRow = { id: string; toStatus: string; dispatchStatus: string | null; note: string | null; createdAt: Date; changedBy: { name: string } | null };

export function OrderHistory({ rows }: { rows: HistoryRow[] }) {
  return (
    <ol className="space-y-4 px-5 py-4">
      {rows.map((h) => {
        const label = h.dispatchStatus ? DISPATCH_STATUS[h.dispatchStatus]?.label : PROCUREMENT_STATUS[h.toStatus]?.label;
        return (
          <li key={h.id} className="relative pl-6">
            <span className="absolute top-1.5 left-0 h-2.5 w-2.5 rounded-full bg-brand-500" aria-hidden />
            <p className="text-sm font-medium text-ink-900">{label ?? h.toStatus}</p>
            <p className="text-xs text-ink-500">{fmtDateTime(h.createdAt)} · {h.changedBy?.name ?? "System"}</p>
            {h.note && <p className="mt-0.5 text-sm text-ink-600">{h.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function ExpectedDelivery({ date, status }: { date: Date | null; status: string }) {
  if (!date) return <span className="text-ink-400">Not set</span>;
  const late = status === "APPROVED" && new Date(date).getTime() < new Date(new Date().toDateString()).getTime();
  return <span className={cn(late && "font-semibold text-red-600")}>{fmtDate(date)}{late && " · overdue"}</span>;
}
