import type { FieldType } from "./fields.js";

// Canonical forms let two extractions of the same printed value compare equal
// even when the model formats them differently ("$5,230.29" vs "5230.29").
// Returns null when the value cannot be read as the field's type.

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$€£,\s]/g, "").replace(/^USD/i, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function canonicalDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = raw.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS.findIndex((m) => m.startsWith(named[1]!.toLowerCase()) && named[1]!.length >= 3);
    if (month >= 0) return isoDate(Number(named[3]), month + 1, Number(named[2]));
  }
  return null;
}

export function canonicalize(type: FieldType, raw: string): string | null {
  const value = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (value === "") return null;
  switch (type) {
    case "string":
      return value;
    case "date":
      return canonicalDate(value);
    case "money": {
      const n = toNumber(value);
      return n === null ? null : n.toFixed(2);
    }
    case "percent": {
      const n = toNumber(value.replace(/%$/, ""));
      return n === null ? null : String(n);
    }
    case "number": {
      const n = toNumber(value);
      return n === null ? null : String(n);
    }
  }
}

/** Equality on canonical forms. Strings compare case-insensitively. */
export function valuesEqual(type: FieldType, a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  const ca = canonicalize(type, a);
  const cb = canonicalize(type, b);
  if (ca === null || cb === null) return false;
  return type === "string" ? ca.toLowerCase() === cb.toLowerCase() : ca === cb;
}
