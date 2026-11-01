import { describe, expect, it } from "vitest";
import { csvRecords, parseCsv } from "@/lib/csv";
import { buildDealerChecklist, parseCustomerCsv, parseVehicleCsv } from "@/lib/dealer-onboarding";

const empty = { hasContactDetails: false, hasOperatingHours: false, activeMembers: 1, vehicles: 0, customers: 0 };
const all = () => true;

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines, CRLF, BOM and blank lines", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n"multi\nline",z');
    expect(rows).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["multi\nline", "z"]]);
  });
  it("keys records by normalised header", () => {
    expect(csvRecords(parseCsv("Chassis Number,Engine_Number\nabc,e1"))).toEqual([{ line: 2, values: { chassisnumber: "abc", enginenumber: "e1" } }]);
  });
});

describe("dealer checklist", () => {
  it("starts at nothing done and derives steps from real counts", () => {
    expect(buildDealerChecklist(empty, all).every((s) => !s.done)).toBe(true);
    const done = buildDealerChecklist({ hasContactDetails: true, hasOperatingHours: true, activeMembers: 3, vehicles: 5, customers: 0 }, all);
    expect(Object.fromEntries(done.map((s) => [s.key, s.done]))).toEqual({ profile: true, team: true, stock: true, customers: false });
  });
  it("needs both contact details and hours for the profile step", () => {
    expect(buildDealerChecklist({ ...empty, hasContactDetails: true }, all).find((s) => s.key === "profile")!.done).toBe(false);
  });
  it("only offers steps the user may perform", () => {
    expect(buildDealerChecklist(empty, (p) => p === "inventory.manage").map((s) => s.key)).toEqual(["stock"]);
  });
});

describe("vehicle csv", () => {
  it("normalises chassis numbers and reports bad and duplicate rows with line numbers", () => {
    const r = parseVehicleCsv("model,chassis_number,color\nT-Rex,ab 12345,Red\nT-Rex,AB12345,Blue\nT-Rex,x,Red\n,ZZ99999,");
    expect(r.rows.map((x) => x.data.chassisnumber)).toEqual(["AB12345"]);
    expect(r.issues.map((i) => i.line)).toEqual([3, 4, 5]);
  });
  it("rejects a file without the required columns", () => {
    expect(parseVehicleCsv("model,color\nA,B").headerError).toMatch(/chassisnumber/);
    expect(parseVehicleCsv("").headerError).toMatch(/empty/);
  });
});

describe("customer csv", () => {
  it("requires a name and a phone or email, and validates email", () => {
    const r = parseCustomerCsv("first_name,last_name,phone,email\nAli,Khan,0300 1234567,\nSara,,,SARA@X.COM\nNoContact,,,\nBad,,,not-an-email\n,Q,0300 1111111,");
    expect(r.rows.map((x) => x.data.firstname)).toEqual(["Ali", "Sara"]);
    expect(r.rows[1]!.data.email).toBe("sara@x.com");
    expect(r.issues.map((i) => i.line)).toEqual([4, 5, 6]);
  });
});
