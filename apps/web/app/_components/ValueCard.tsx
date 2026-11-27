"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon, fieldIconName } from "./Icon";
import { ValueStateBadge, valueTone } from "./StatusBadge";
import type { ValueView } from "./api";

type ReviewBody = { action: "approve" } | { action: "correct"; correctedValue: string; note?: string };

export const formatFieldLabel = (field: string) =>
  field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

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
  openCorrectSignal = 0,
  onSelect,
  onReview,
}: {
  value: ValueView;
  reviewable: boolean;
  selected: boolean;
  openCorrectSignal?: number;
  onSelect: () => void;
  onReview: (body: ReviewBody) => Promise<void>;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tone = valueTone(value);
  const baseline = value.baseline;
  const changed = baseline !== null && value.state === "pending";
  const iconName = fieldIconName(value.field, value.type);

  useEffect(() => {
    if (openCorrectSignal > 0 && reviewable) {
      setCorrecting(true);
    }
  }, [openCorrectSignal, reviewable]);

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
      <div className="card-top">
        <div className="card-field-group">
          <span className="field-icon-box">
            <Icon name={iconName} size={18} />
          </span>
          <div className="card-field-titles">
            <h3>{formatFieldLabel(value.field)}</h3>
            {value.gap ? <div className="value value--gap">No value</div> : <div className="value">{value.value}</div>}
          </div>
        </div>
        <ValueStateBadge value={value} />
      </div>

      {value.gap && (
        <div className="gap-callout">
          <Icon name="alert" size={15} />
          <span>Gap: {value.gap.reason}</span>
        </div>
      )}

      {value.review?.action === "correct" && (
        <div className="correction-note">
          <Icon name="check" size={14} />
          <span>
            Corrected to <strong>{value.review.correctedValue}</strong>
            {value.review.note && <span className="muted"> · {value.review.note}</span>}
          </span>
        </div>
      )}
      {value.review?.action === "approve" && value.review.note && <div className="muted">Note: {value.review.note}</div>}

      {value.evidence && (
        <blockquote className="quote" title="Quoted verbatim from the document">
          <Icon name="quote" size={15} className="quote-icon" />
          <span>{value.evidence}</span>
        </blockquote>
      )}

      {changed && (
        <section className="previous" aria-label={`Previous value in version ${baseline.versionNumber}`}>
          <div className="previous-head">
            <Icon name="clock" size={15} />
            <span>
              <strong>Changed since v{baseline.versionNumber}.</strong> {previousText(baseline)}
            </span>
          </div>
          <div className="diff-pills">
            <span className="diff-old">{baseline.effectiveValue ?? baseline.value ?? "Gap"}</span>
            <span aria-hidden="true">→</span>
            <span className="diff-new">{value.value ?? "Gap"}</span>
          </div>
          {baseline.evidence && (
            <blockquote className="quote">
              <Icon name="quote" size={14} className="quote-icon" />
              <span>{baseline.evidence}</span>
            </blockquote>
          )}
        </section>
      )}
      {value.state === "carried_over" && baseline && (
        <div className="carried-note">
          <Icon name="carryOver" size={14} />
          <span>Evidence unchanged since v{baseline.versionNumber}; review carried over.</span>
        </div>
      )}

      <div className="actions">
        {value.evidence && (
          <button type="button" className="btn-sm" onClick={onSelect} aria-pressed={selected}>
            <Icon name="eye" size={14} />
            <span>Show in document</span>
          </button>
        )}
        {reviewable && !correcting && (
          <>
            <button
              type="button"
              className="primary btn-sm"
              disabled={busy}
              onClick={() => void send({ action: "approve" })}
            >
              <Icon name="check" size={14} />
              <span>{value.gap ? "Confirm missing" : "Approve"}</span>
            </button>
            <button type="button" className="btn-sm" disabled={busy} onClick={() => setCorrecting(true)}>
              <Icon name="close" size={13} />
              <span>Correct</span>
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
            <input name="note" placeholder="Reason for correction" />
          </label>
          <div className="actions">
            <button type="submit" className="primary btn-sm" disabled={busy}>
              <Icon name="check" size={14} />
              <span>Save correction</span>
            </button>
            <button type="button" className="btn-sm" disabled={busy} onClick={() => setCorrecting(false)}>
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
