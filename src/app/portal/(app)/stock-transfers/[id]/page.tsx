import { notFound } from "next/navigation";
import { activeDealershipId, can, requirePortalPage } from "@/server/authz";
import { db } from "@/lib/db";
import { transferInclude } from "@/server/services/stock-transfers";
import { Badge, PageHeader } from "@/components/ui/misc";
import { TableWrap } from "@/components/ui/table";
import { CloseTransferButton, ReceiveTransferDialog } from "@/components/stock/transfer-controls";
import { TRANSFER_STATUS } from "@/lib/ops-constants";
import { fmtDateTime, sp } from "@/lib/utils";

export const metadata = { title: "Stock transfer" };

export default async function TransferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalPage("inventory.view");
  const { id } = await params;
  const dealershipId = activeDealershipId(user, sp((await searchParams).dealership))!;
  const t = await db.stockTransfer.findFirst({ where: { id, OR: [{ fromDealershipId: dealershipId }, { toDealershipId: dealershipId }] }, include: transferInclude });
  if (!t) notFound();
  const manage = can(user, "inventory.manage");
  const open = t.status === "IN_TRANSIT";
  const isSender = t.fromDealershipId === dealershipId;
  const name = (l: (typeof t.lines)[number]) => l.item.bikeModel?.name ?? l.item.product?.name ?? "Item";
  const meta = TRANSFER_STATUS[t.status]!;

  return (
    <>
      <PageHeader
        title={`Transfer TR-${t.number}`}
        description={`${t.from.name} → ${t.to.name} · sent ${fmtDateTime(t.sentAt)} by ${t.createdBy.name}`}
        breadcrumbs={[{ label: "Portal", href: "/portal/dashboard" }, { label: "Stock transfers", href: "/portal/stock-transfers" }, { label: `TR-${t.number}` }]}
        actions={
          <>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {open && manage && !isSender && <ReceiveTransferDialog dealershipId={dealershipId} transferId={t.id} lines={t.lines.map((l) => ({ id: l.id, name: name(l), quantity: l.quantity }))} />}
            {open && manage && !isSender && <CloseTransferButton dealershipId={dealershipId} transferId={t.id} kind="REJECT" />}
            {open && manage && isSender && <CloseTransferButton dealershipId={dealershipId} transferId={t.id} kind="CANCEL" />}
          </>
        }
      />
      {t.note && <p className="mb-4 text-sm text-ink-600">Note: {t.note}</p>}
      {t.resolutionNote && <p className="mb-4 text-sm text-ink-600">Reason: {t.resolutionNote}</p>}
      <TableWrap>
        <thead className="bg-ink-50/60"><tr><th className="th">Item</th><th className="th">Code</th><th className="th text-right">Sent</th><th className="th text-right">Received</th></tr></thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {t.lines.map((l) => (
            <tr key={l.id}>
              <td className="td font-medium text-ink-900">{name(l)}</td>
              <td className="td font-mono text-xs">{l.item.bikeModel?.code ?? l.item.product?.sku}</td>
              <td className="td text-right tabular-nums">{l.quantity}</td>
              <td className="td text-right tabular-nums">{l.receivedQuantity ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
