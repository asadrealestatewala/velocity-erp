import { describe, expect, it } from "vitest";
import { documentTotals, normalizeCnic, normalizeNtn, refundForQuantity } from "@/lib/sales-math";

describe("sales maths", () => {
  it("charges tax on the discounted amount", () => {
    expect(documentTotals([100000, 50000], 10000, 18)).toEqual({ subtotal: 150000, net: 140000, taxAmount: 25200, total: 165200 });
    expect(documentTotals([100], 500, 18).total).toBe(0);
  });
  it("refunds a line's share of discount and tax", () => {
    const inv = { subtotal: 150000, discount: 15000, taxRate: 18 };
    // 1 × 100,000 → 100,000 × 0.9 × 1.18
    expect(refundForQuantity(inv, 100000, 1)).toBe(106200);
    expect(refundForQuantity({ ...inv, subtotal: 0 }, 100, 1)).toBe(0);
  });
  it("normalises NTN and CNIC", () => {
    expect(normalizeNtn("12345678")).toBe("1234567-8");
    expect(normalizeNtn(" 1234567-8 ")).toBe("1234567-8");
    expect(normalizeNtn("123")).toBeNull();
    expect(normalizeCnic("3520212345671")).toBe("35202-1234567-1");
    expect(normalizeCnic("35202-1234567")).toBeNull();
  });
});
