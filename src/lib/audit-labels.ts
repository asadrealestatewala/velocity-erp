// Human-readable audit log entries (client-safe). Unknown actions fall back to a humanised version of the key.

const LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in attempt",
  "auth.logout": "Signed out",
  "auth.password_changed": "Password changed",
  "lead.assigned": "Lead assigned",
  "lead.reassigned": "Lead reassigned",
  "lead.reassigned_away": "Lead moved to another dealership",
  "lead.stage_changed": "Lead stage changed",
  "contact.exported": "Contacts exported",
  "inventory.item_added": "Item added to inventory",
  "inventory.adjusted": "Stock adjusted",
  "inventory.reorder_level_set": "Reorder level changed",
  "salesorder.created": "Customer order created",
  "salesorder.confirmed": "Customer order confirmed",
  "salesorder.cancelled": "Customer order cancelled",
  "procurement.order_submitted": "Stock order placed",
  "procurement.order_cancelled": "Stock order cancelled",
  "procurement.order_approved": "Stock order approved",
  "procurement.order_rejected": "Stock order rejected",
  "procurement.dispatch_updated": "Delivery status updated",
  "procurement.receipt_confirmed": "Delivery receipt confirmed",
  "ledger.payment_reported": "Payment reported to YADEA",
  "ledger.payment_verified": "Payment verified",
  "ledger.payment_rejected": "Payment rejected",
  "ledger.entry_posted": "Ledger entry posted",
  "ledger.exported": "Ledger exported",
  "voucher.created": "Expense voucher created",
  "voucher.documents_added": "Voucher documents attached",
  "voucher.document_removed": "Voucher document removed",
  "voucher.approved": "Voucher approved",
  "voucher.rejected": "Voucher rejected",
  "voucher.exported": "Vouchers exported",
  "dealerdoc.uploaded": "Document uploaded",
  "dealerdoc.removed": "Document removed",
  "document.uploaded": "Customer document uploaded",
  "document.removed": "Customer document removed",
  "payment.recorded": "Customer payment recorded",
  "payment.status_changed": "Customer payment status changed",
  "team.member_added": "Team member added",
  "team.member_updated": "Team member updated",
  "team.member_deactivated": "Team member deactivated",
  "team.password_reset": "Team member password reset",
  "testdrive.created": "Test drive booked",
  "testdrive.status_changed": "Test drive status changed",
  "lead.bulk_assigned": "Leads assigned in bulk",
  "lead.source_changed": "Lead source changed",
  "contact.updated": "Contact updated",
  "contact.avatar_updated": "Contact photo updated",
  "dealership.created": "Dealership created",
  "dealership.status_changed": "Dealership status changed",
  "dealership.models_updated": "Models offered updated",
  "dealership.updated_by_manager": "Dealership profile updated",
  "application.converted": "Application converted to a dealership",
  "dealership.updated": "Dealership profile updated",
  "message.sent": "Message sent",
  "message.logged": "Message logged",
  "assistant.action_confirmed": "Assistant change confirmed",
};

export function auditLabel(action: string) {
  if (LABELS[action]) return LABELS[action];
  const last = action.split(".").slice(-1)[0] ?? action;
  const words = last.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Matched against the snake_case form of a key, so ipAddress / passwordHash / userAgent are all caught. */
const HIDDEN_KEYS = /(^|_)(ip|token|secret|password|hash|user_agent|cookie|authorization)(_|$)/;
const snake = (k: string) => k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.length > 120 ? `${v.slice(0, 117)}…` : v;
  if (Array.isArray(v)) return v.map(show).join(", ");
  return JSON.stringify(v);
}

/** Flatten an audit `changes` payload into label/value pairs; `{from, to}` diffs read "from → to". Sensitive keys are dropped. */
export function describeChanges(changes: unknown): { key: string; value: string }[] {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  const out: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(changes as Record<string, unknown>)) {
    if (HIDDEN_KEYS.test(snake(k))) continue;
    const label = k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
    const pretty = label.charAt(0).toUpperCase() + label.slice(1);
    if (v && typeof v === "object" && !Array.isArray(v) && "from" in v && "to" in v) {
      const d = v as { from: unknown; to: unknown };
      out.push({ key: pretty, value: `${show(d.from)} → ${show(d.to)}` });
    } else out.push({ key: pretty, value: show(v) });
  }
  return out;
}
