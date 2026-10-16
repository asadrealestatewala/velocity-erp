import { describe, expect, it } from "vitest";
import { isFieldVisible, validateValues, type FormField } from "@/lib/forms/schema";
import { TEST_DRIVE_FORM } from "@/lib/forms/defaults";

const f = (x: Partial<FormField> & Pick<FormField, "key" | "type">): FormField => ({ id: x.key, label: x.key, required: false, width: "full", ...x });

describe("form schema validation", () => {
  it("requires required fields", () => {
    const { errors } = validateValues(TEST_DRIVE_FORM.fields, {});
    expect(errors.first_name).toMatch(/required/i);
    expect(errors.phone).toBeTruthy();
    expect(errors.consent).toMatch(/accept/i);
    expect(errors.message).toBeUndefined(); // optional
  });

  it("rejects invalid email and phone", () => {
    const fields = [f({ key: "email", type: "email", required: true }), f({ key: "phone", type: "phone", required: true })];
    expect(validateValues(fields, { email: "not-an-email", phone: "12ab" }).errors).toMatchObject({ email: expect.any(String), phone: expect.any(String) });
    expect(validateValues(fields, { email: "a@b.co", phone: "123" }).errors.phone).toBeTruthy(); // too short
    expect(validateValues(fields, { email: "ok@example.com", phone: "+92 300 1234567" }).errors).toEqual({});
  });

  it("validates static option membership", () => {
    const fields = [f({ key: "cat", type: "select", options: [{ label: "A", value: "a" }] })];
    expect(validateValues(fields, { cat: "zzz" }).errors.cat).toBe("Invalid selection");
    expect(validateValues(fields, { cat: "a" }).values.cat).toBe("a");
  });

  it("ignores hidden conditional fields and enforces visible ones", () => {
    const fields = [
      f({ key: "has_bike", type: "radio", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] }),
      f({ key: "current_bike", type: "text", required: true, conditional: { field: "has_bike", op: "equals", value: "yes" } }),
    ];
    expect(validateValues(fields, { has_bike: "no" }).errors.current_bike).toBeUndefined();
    expect(validateValues(fields, { has_bike: "no", current_bike: "x" }).values.current_bike).toBeUndefined(); // hidden values dropped
    expect(validateValues(fields, { has_bike: "yes" }).errors.current_bike).toMatch(/required/i);
    expect(isFieldVisible(fields[1]!, { has_bike: "yes" })).toBe(true);
  });

  it("validates file counts", () => {
    const fields = [f({ key: "docs", type: "file", required: true, maxFiles: 2 })];
    expect(validateValues(fields, {}, {}).errors.docs).toBeTruthy();
    expect(validateValues(fields, {}, { docs: 3 }).errors.docs).toMatch(/at most/);
    expect(validateValues(fields, {}, { docs: 1 }).errors.docs).toBeUndefined();
  });

  it("validates dates, times, numbers and patterns", () => {
    const fields = [
      f({ key: "d", type: "date" }), f({ key: "t", type: "time" }), f({ key: "n", type: "number", validation: { min: 0, max: 10 } }),
      f({ key: "p", type: "text", validation: { pattern: "^[A-Z]{3}$", patternMessage: "Three capitals" } }),
    ];
    const r = validateValues(fields, { d: "2026-13-45", t: "25:00", n: "11", p: "abc" });
    expect(Object.keys(r.errors).sort()).toEqual(["d", "n", "p", "t"]);
    expect(r.errors.p).toBe("Three capitals");
  });
});
