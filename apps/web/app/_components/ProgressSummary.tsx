import { CircularProgress, Icon } from "./Icon";

export interface Counts {
  total: number;
  pending: number;
  approved: number;
  corrected: number;
  carriedOver: number;
}

/** Segmented review progress bar for table rows ("3 / 3 reviewed") or detail toolbar. */
export function ProgressSummary({
  counts,
  variant = "table",
}: {
  counts: Counts;
  variant?: "table" | "toolbar";
}) {
  if (counts.total === 0) return <span className="muted">No values yet</span>;

  const done = counts.approved + counts.corrected;
  const reviewed = done + counts.carriedOver;
  const pct = (n: number) => `${(n / counts.total) * 100}%`;
  const percentReviewed = Math.round((reviewed / counts.total) * 100);

  const parts = [
    counts.pending > 0 && `${counts.pending} need${counts.pending === 1 ? "s" : ""} review`,
    counts.carriedOver > 0 && `${counts.carriedOver} carried over`,
    done > 0 && `${done} done`,
  ].filter(Boolean);

  if (variant === "toolbar") {
    return (
      <div className="toolbar-progress-row">
        <div className="toolbar-bar-group">
          <span className="progress-bar" aria-hidden="true">
            <span className="seg-done" style={{ width: pct(done) }} />
            <span className="seg-carried" style={{ width: pct(counts.carriedOver) }} />
            <span className="seg-pending" style={{ width: pct(counts.pending) }} />
          </span>
          <span className="toolbar-summary-text">
            {counts.pending === 0 ? `All ${counts.total} reviewed` : parts.join(" · ")}
          </span>
        </div>
        <span className="toolbar-ring-badge">
          <span>
            Reviewed: <strong>{percentReviewed}%</strong>
          </span>
          <CircularProgress percent={percentReviewed} />
        </span>
      </div>
    );
  }

  return (
    <div className="progress-stack">
      <span className="progress-bar" aria-hidden="true">
        <span className="seg-done" style={{ width: pct(done) }} />
        <span className="seg-carried" style={{ width: pct(counts.carriedOver) }} />
        <span className="seg-pending" style={{ width: pct(counts.pending) }} />
      </span>
      <span className={`progress-caption${counts.pending === 0 ? " progress-caption--done" : ""}`}>
        {counts.pending === 0 ? (
          <>
            <Icon name="check" size={13} />
            <span>
              {counts.total} / {counts.total} reviewed
            </span>
          </>
        ) : (
          <span>
            {reviewed} / {counts.total} reviewed · {counts.pending} pending
          </span>
        )}
      </span>
    </div>
  );
}
