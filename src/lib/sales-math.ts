// Money maths shared by quotations, invoices and returns. Pure functions so they can be unit-tested.

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Tax is charged on the discounted amount: total = (subtotal − discount) × (1 + rate/100). */
export function documentTotals(lineTotals: number[], discount: number, taxRatePct: number) {
  const subtotal = round2(lineTotals.reduce((s, n) => s + n, 0));
  const net = round2(Math.max(0, subtotal - discount));
  const taxAmount = round2((net * taxRatePct) / 100);
  return { subtotal, net, taxAmount, total: round2(net + taxAmount) };
}

/** What the customer gets back for `quantity` units of a line: its share of the discount and of the tax is returned too. */
export function refundForQuantity(inv: { subtotal: number; discount: number; taxRate: number }, unitPrice: number, quantity: number) {
  if (inv.subtotal <= 0) return 0;
  const net = Math.max(0, inv.subtotal - inv.discount);
  return round2(unitPrice * quantity * (net / inv.subtotal) * (1 + inv.taxRate / 100));
}

/** Pakistani NTN: 7 digits + check digit ("1234567-8"). CNIC: 13 digits ("35202-1234567-1"). Returns the canonical form or null. */
export function normalizeNtn(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/[\s-]/g, "");
  return /^\d{8}$/.test(d) ? `${d.slice(0, 7)}-${d.slice(7)}` : null;
}
export function normalizeCnic(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/[\s-]/g, "");
  return /^\d{13}$/.test(d) ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : null;
}
