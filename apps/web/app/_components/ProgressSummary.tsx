interface Counts {
  total: number;
  pending: number;
  approved: number;
  corrected: number;
  carriedOver: number;
}

/** "3 need review · 2 carried over · 1 done", with a bar in the same order. */
export function ProgressSummary({ counts }: { counts: Counts }) {
  if (counts.total === 0) return <span className="muted">No values yet</span>;
  const done = counts.approved + counts.corrected;
  const pct = (n: number) => `${(n / counts.total) * 100}%`;
  const parts = [
    counts.pending > 0 && `${counts.pending} need${counts.pending === 1 ? "s" : ""} review`,
    counts.carriedOver > 0 && `${counts.carriedOver} carried over`,
    done > 0 && `${done} done`,
  ].filter(Boolean);
  return (
    <span className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
      <span className="progress-bar" aria-hidden="true">
        <span className="seg-pending" style={{ width: pct(counts.pending) }} />
        <span className="seg-carried" style={{ width: pct(counts.carriedOver) }} />
        <span className="seg-done" style={{ width: pct(done) }} />
      </span>
      <span>{counts.pending === 0 ? `All ${counts.total} reviewed` : parts.join(" · ")}</span>
    </span>
  );
}
