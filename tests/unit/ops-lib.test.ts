import { describe, expect, it } from "vitest";
import { auditLabel, describeChanges } from "@/lib/audit-labels";
import { parseItemKey, stockState } from "@/lib/ops-constants";
import { DEFAULT_ROLES, DEALER_ONLY_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { dealerPaymentSchema, salesOrderSchema, stockAdjustSchema, voucherSchema } from "@/lib/validation-ops";
import { searchKnowledge } from "@/server/assistant/guide";

describe("audit presentation", () => {
  it("labels known actions and humanises unknown ones", () => {
    expect(auditLabel("inventory.adjusted")).toBe("Stock adjusted");
    expect(auditLabel("something.new_thing_happened")).toBe("New thing happened");
  });

  it("flattens changes into readable pairs and drops sensitive keys", () => {
    const rows = describeChanges({ amount: 5000, status: { from: "PENDING", to: "POSTED" }, ipAddress: "1.2.3.4", token: "abc", passwordHash: "x", userAgent: "ua", note: null, lines: ["a", "b"], ok: true });
    expect(rows).toEqual([
      { key: "Amount", value: "5000" },
      { key: "Status", value: "PENDING → POSTED" },
      { key: "Note", value: "—" },
      { key: "Lines", value: "a, b" },
      { key: "Ok", value: "Yes" },
    ]);
    expect(describeChanges(null)).toEqual([]);
    expect(describeChanges("text")).toEqual([]);
  });
});

describe("stock helpers", () => {
  it("classifies stock levels against the reorder level", () => {
    expect(stockState(0, 0)).toBe("OUT");
    expect(stockState(0, 5)).toBe("OUT");
    expect(stockState(5, 5)).toBe("LOW");
    expect(stockState(3, 5)).toBe("LOW");
    expect(stockState(6, 5)).toBe("OK");
    expect(stockState(1, 0)).toBe("OK"); // no reorder level set = never "low"
  });

  it("parses item keys for bikes and spare parts and rejects anything else", () => {
    expect(parseItemKey("B:abc")).toEqual({ bikeModelId: "abc" });
    expect(parseItemKey("P:xyz")).toEqual({ productId: "xyz" });
    expect(parseItemKey("X:abc")).toBeNull();
    expect(parseItemKey("B:")).toBeNull();
    expect(parseItemKey("")).toBeNull();
  });
});

describe("input validation", () => {
  it("rejects bad quantities, prices and tax", () => {
    expect(stockAdjustSchema.safeParse({ itemId: "i", mode: "ADD", quantity: 0 }).success).toBe(false); // adding nothing
    expect(stockAdjustSchema.safeParse({ itemId: "i", mode: "SET", quantity: 0 }).success).toBe(true); // recount to zero is fine
    expect(stockAdjustSchema.safeParse({ itemId: "i", mode: "ADD", quantity: 1.5 }).success).toBe(false);
    expect(salesOrderSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(salesOrderSchema.safeParse({ customerName: "A", lines: [{ itemKey: "B:1", quantity: 1, unitPrice: 5 }] }).success).toBe(false); // name too short and no contact
    expect(salesOrderSchema.safeParse({ customerName: "Ali Khan", lines: [{ itemKey: "B:1", quantity: 1, unitPrice: -5 }] }).success).toBe(false);
    expect(salesOrderSchema.safeParse({ customerName: "Ali Khan", lines: [{ itemKey: "B:1", quantity: 2, unitPrice: 5 }] }).success).toBe(true);
    expect(dealerPaymentSchema.safeParse({ amount: 0, entryDate: "2026-01-01", method: "CASH" }).success).toBe(false);
    expect(dealerPaymentSchema.safeParse({ amount: "1500.50", entryDate: "2026-01-01", method: "BANK_TRANSFER" }).success).toBe(true);
    expect(voucherSchema.safeParse({ voucherDate: "2026-01-01", category: "Rent & utilities", amount: 100 }).success).toBe(true);
    expect(voucherSchema.safeParse({ voucherDate: "nope", category: "Rent & utilities", amount: 100 }).success).toBe(false);
  });
});

describe("permission catalogue", () => {
  it("every default role grant refers to a real permission", () => {
    for (const r of DEFAULT_ROLES) for (const p of r.permissions) expect(PERMISSIONS, `${r.key}: ${p}`).toHaveProperty(p);
  });

  it("dealership-only permissions are held by dealership roles and never by central ones", () => {
    for (const r of DEFAULT_ROLES) {
      const held = r.permissions.filter((p) => DEALER_ONLY_PERMISSIONS.includes(p));
      if (r.scope === "CENTRAL") expect(held, r.key).toEqual([]);
    }
    const manager = DEFAULT_ROLES.find((r) => r.key === "DEALER_MANAGER")!;
    for (const p of ["inventory.manage", "procurement.order", "ledger.pay", "vouchers.manage", "dealerdocs.upload", "audit.view"] as const) expect(manager.permissions).toContain(p);
    const rep = DEFAULT_ROLES.find((r) => r.key === "DEALER_REP")!;
    for (const p of ["inventory.manage", "procurement.order", "ledger.pay", "ledger.view", "audit.view"] as const) expect(rep.permissions).not.toContain(p);
  });

  it("the procurement role can run the desk but cannot touch dealership-only actions", () => {
    const proc = DEFAULT_ROLES.find((r) => r.key === "PROCUREMENT")!;
    expect(proc.scope).toBe("CENTRAL");
    for (const p of ["procurement.view", "procurement.manage", "ledger.manage", "vouchers.view_all", "dealerdocs.admin", "catalog.manage"] as const) expect(proc.permissions).toContain(p);
    for (const p of ["inventory.manage", "salesorders.manage", "ledger.pay"] as const) expect(proc.permissions).not.toContain(p);
  });
});

describe("built-in knowledge search", () => {
  it("finds the right topic for a plain-language question", () => {
    expect(searchKnowledge("how do I download my ledger as excel", "portal")[0]?.id).toBe("ledger");
    expect(searchKnowledge("which orders are overdue for delivery dispatch", "procurement")[0]?.id).toMatch(/procurement-desk|stock-orders|statuses/); // all three explain overdue deliveries
    expect(searchKnowledge("???", "portal")).toEqual([]);
  });
});
