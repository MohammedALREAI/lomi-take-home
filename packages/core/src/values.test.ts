import { describe, expect, it } from "vitest";
import { canonicalize, valuesEqual } from "./values.js";

describe("canonicalize", () => {
  it.each([
    ["money", "$5,230.29", "5230.29"],
    ["money", "5230.29", "5230.29"],
    ["money", "$2,350", "2350.00"],
    ["date", "2025-10-14", "2025-10-14"],
    ["date", "March 1, 2025", "2025-03-01"],
    ["date", "Mar 1 2025", "2025-03-01"],
    ["percent", "4.2%", "4.2"],
    ["percent", "3.80", "3.8"],
    ["number", "24", "24"],
    ["string", "  Dana   Okafor ", "Dana Okafor"],
  ] as const)("%s %j -> %j", (type, raw, expected) => {
    expect(canonicalize(type, raw)).toBe(expected);
  });

  it.each([
    ["money", "about five thousand"],
    ["date", "2025-02-30"],
    ["date", "next Tuesday"],
    ["number", "twenty-four"],
    ["string", "   "],
  ] as const)("rejects %s %j", (type, raw) => {
    expect(canonicalize(type, raw)).toBeNull();
  });
});

describe("valuesEqual", () => {
  it("compares canonical forms", () => {
    expect(valuesEqual("money", "$5,230.29", "5230.29")).toBe(true);
    expect(valuesEqual("money", "5230.29", "6126.45")).toBe(false);
    expect(valuesEqual("string", "MERIDIAN OFFICE SUPPLIES LLC", "Meridian Office Supplies LLC")).toBe(true);
    expect(valuesEqual("date", "March 1, 2025", "2025-03-01")).toBe(true);
  });

  it("never treats null as equal", () => {
    expect(valuesEqual("string", null, null)).toBe(false);
  });
});
