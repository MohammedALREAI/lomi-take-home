// Text normalization and verbatim evidence matching.
//
// Evidence must appear in the parsed text of the version it was extracted
// from. "Verbatim" here tolerates differences in whitespace only (PDF text
// has runs of spaces in tables and line breaks in the middle of phrases) and
// respects token boundaries, so "Net 30" does not match inside "Net 300".

/** Applied once when a PDF is parsed. Every stored offset indexes into this string. */
export function normalizeText(raw: string): string {
  return raw.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\0/g, "");
}

/** Whitespace-insensitive form used to compare whole documents. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface EvidenceMatch {
  start: number;
  end: number;
  /** The exact slice of the source text, which may differ from the quote in whitespace. */
  text: string;
}

const ALNUM = /[\p{L}\p{N}]/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function evidencePattern(quote: string): RegExp | null {
  const tokens = quote.normalize("NFC").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const body = tokens.map(escapeRegExp).join("\\s+");
  const first = tokens[0]!.charAt(0);
  const last = tokens[tokens.length - 1]!.slice(-1);
  // A token continues through a letter or digit, or through . , - between
  // letters or digits ("1,985.50", "INV-2025-0847-A").
  const before = ALNUM.test(first) ? "(?<![\\p{L}\\p{N}])(?<![\\p{L}\\p{N}][.,\\-])" : "";
  const after = ALNUM.test(last) ? "(?![\\p{L}\\p{N}])(?![.,\\-][\\p{L}\\p{N}])" : "";
  return new RegExp(before + body + after, "gu");
}

/** All places the quote occurs in the text. */
export function findEvidenceAll(text: string, quote: string): EvidenceMatch[] {
  const pattern = evidencePattern(quote);
  if (!pattern) return [];
  return [...text.matchAll(pattern)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    text: m[0],
  }));
}

/** The first place the quote occurs, or null if it does not occur. */
export function findEvidence(text: string, quote: string): EvidenceMatch | null {
  return findEvidenceAll(text, quote)[0] ?? null;
}
