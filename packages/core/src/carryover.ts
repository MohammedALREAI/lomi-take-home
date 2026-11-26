import type { FieldType } from "./fields.js";
import { collapseWhitespace, findEvidence } from "./text.js";
import { valuesEqual } from "./values.js";

// Decides whether a review of a field in the previous version still holds for
// the new version. Two independent checks must both pass:
//
//  1. The previous evidence passage still occurs, verbatim, in the new text.
//     This does not depend on which passage the model quotes this time, and it
//     holds up when unrelated text moves around or is added.
//  2. The new extracted value equals the previous value (or the reviewer's
//     correction). This catches a passage that survived while the document now
//     states a different value somewhere else.

export interface PriorValue {
  value: string | null;
  evidence: string | null;
  review: { action: "approve" | "correct"; correctedValue: string | null } | null;
}

export interface NextValue {
  value: string | null;
}

export type CarryOverDecision =
  | { carry: true }
  | { carry: false; reason: "not_reviewed" | "evidence_changed" | "value_changed" | "gap_changed" };

export function decideCarryOver(input: {
  fieldType: FieldType;
  prior: PriorValue;
  next: NextValue;
  priorText: string;
  nextText: string;
}): CarryOverDecision {
  const { fieldType, prior, next, priorText, nextText } = input;
  if (!prior.review) return { carry: false, reason: "not_reviewed" };

  // A reviewed gap has no passage to compare, so only an unchanged document keeps it.
  if (prior.value === null || prior.evidence === null) {
    const same = next.value === null && collapseWhitespace(priorText) === collapseWhitespace(nextText);
    return same ? { carry: true } : { carry: false, reason: "gap_changed" };
  }

  if (!findEvidence(nextText, prior.evidence)) return { carry: false, reason: "evidence_changed" };

  const corrected = prior.review.action === "correct" ? prior.review.correctedValue : null;
  if (valuesEqual(fieldType, next.value, prior.value) || valuesEqual(fieldType, next.value, corrected)) {
    return { carry: true };
  }
  return { carry: false, reason: "value_changed" };
}
