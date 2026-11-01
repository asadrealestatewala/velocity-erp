import "server-only";
import { getCurrentUser } from "@/server/auth/session";
import { can, dealershipIds, isCentral } from "@/server/authz";

/** Same visibility as the customer-order PDF: a dealership's own documents, or any dealership for central inventory oversight. Null = not allowed. */
export async function salesPdfScope(): Promise<{ dealershipId?: { in: string[] } } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const central = isCentral(user) && can(user, "inventory.view_all");
  if (central) return {};
  if (!(can(user, "inventory.view") && dealershipIds(user).length)) return null;
  return { dealershipId: { in: dealershipIds(user) } };
}

export const pdfResponse = (pdf: Buffer, filename: string) =>
  new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
