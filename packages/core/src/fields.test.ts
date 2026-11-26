import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIELD_DEFINITIONS } from "./fields.js";

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/expected-fields.json", import.meta.url), "utf8"),
) as unknown;

describe("FIELD_DEFINITIONS", () => {
  it("matches fixtures/expected-fields.json exactly", () => {
    expect(FIELD_DEFINITIONS).toEqual(fixture);
  });
});
