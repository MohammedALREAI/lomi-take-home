"use client";

import { useState, type FormEvent } from "react";
import { ValueStateBadge, valueTone } from "./StatusBadge";
import type { ValueView } from "./api";

type ReviewBody = { action: "approve" } | { action: "correct"; correctedValue: string; note?: string };

const label = (field: string) => field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** "Was X, approved." / "Was X, corrected from Y." / "Was a gap, filled in as X." */
function previousText(baseline: NonNullable<ValueView["baseline"]>) {
  const { review, value } = baseline;
  let text: string;
  if (!review) text = value === null ? "Was a gap, not reviewed" : `Was ${value}, not reviewed`;
  else if (review.action === "approve") text = value === null ? "Was a gap, confirmed missing" : `Was ${value}, approved`;
  else if (value === null) text = `Was a gap, filled in as ${review.correctedValue}`;
  else text = `Was ${review.correctedValue}, corrected from ${value}`;
  return review?.note ? `${text} (note: ${review.note}).` : `${text}.`;
}

/**
 * One extracted value beside the passage it was quoted from, with the
 * reviewer's actions. A changed value also shows the previous version's value
 * and review, so the reviewer sees what changed.
 */
export function ValueCard({
  value,
  reviewable,
  selected,
  onSelect,
  onReview,
}: {
  value: ValueView;
  reviewable: boolean;
  selected: boolean;
  onSelect: () => void;
  onReview: (body: ReviewBody) => Promise<void>;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tone = valueTone(value);
  const baseline = value.baseline;
  const changed = baseline !== null && value.state === "pending";

  async function send(body: ReviewBody) {
    setBusy(true);
    setError(null);
    try {
      await onReview(body);
      setCorrecting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }

  function onCorrect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const note = String(data.get("note") ?? "").trim();
    void send({ action: "correct", correctedValue: String(data.get("correctedValue") ?? ""), ...(note && { note }) });
  }

  return (
    <article className={`card card-${tone}${selected ? " card-selected" : ""}`}>
      <div className="card-head">
        <h3>{label(value.field)}</h3>
        <ValueStateBadge value={value} />
      </div>

      {value.gap ? (
        <div>
          <div className="value">No value</div>
          <div className="error">Gap: {value.gap.reason}</div>
        </div>
      ) : (
        <div className="value">{value.value}</div>
      )}

      {value.review?.action === "correct" && (
        <div>
          Corrected to <strong>{value.review.correctedValue}</strong>
          {value.review.note && <span className="muted"> · {value.review.note}</span>}
        </div>
      )}
      {value.review?.action === "approve" && value.review.note && <div className="muted">Note: {value.review.note}</div>}

      {value.evidence && (
        <blockquote className="quote" title="Quoted verbatim from the document">
          {value.evidence}
        </blockquote>
      )}

      {changed && (
        <section className="previous" aria-label={`Previous value in version ${baseline.versionNumber}`}>
          <strong>Changed since v{baseline.versionNumber}.</strong> {previousText(baseline)}
          {baseline.evidence && <blockquote className="quote">{baseline.evidence}</blockquote>}
        </section>
      )}
      {value.state === "carried_over" && baseline && (
        <div className="muted">Evidence unchanged since v{baseline.versionNumber}; review carried over.</div>
      )}

      <div className="actions">
        {value.evidence && (
          <button type="button" onClick={onSelect} aria-pressed={selected}>
            Show in document
          </button>
        )}
        {reviewable && !correcting && (
          <>
            <button type="button" className="primary" disabled={busy} onClick={() => void send({ action: "approve" })}>
              {value.gap ? "Confirm missing" : "Approve"}
            </button>
            <button type="button" disabled={busy} onClick={() => setCorrecting(true)}>
              Correct
            </button>
          </>
        )}
      </div>

      {reviewable && correcting && (
        <form className="correct-form" onSubmit={onCorrect}>
          <label className="field">
            Correct value
            <input name="correctedValue" required defaultValue={value.effectiveValue ?? ""} autoFocus />
          </label>
          <label className="field">
            Note (optional)
            <input name="note" />
          </label>
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              Save correction
            </button>
            <button type="button" disabled={busy} onClick={() => setCorrecting(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </article>
  );
}
