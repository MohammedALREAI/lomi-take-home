"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { use, useMemo, useState } from "react";
import { DocumentText } from "../../_components/DocumentText";
import { ProgressSummary } from "../../_components/ProgressSummary";
import { VersionStatusBadge, valueTone } from "../../_components/StatusBadge";
import { UploadForm } from "../../_components/UploadForm";
import { ValueCard } from "../../_components/ValueCard";
import { ApiError, POLL_MS, api, isInProgress, type DocumentDetail, type ValueView } from "../../_components/api";

// Cards that need the reviewer come first, so the work is visible at a glance.
const TONE_ORDER = { pending: 0, gap: 0, carried: 1, done: 2 } as const;

function counts(values: ValueView[]) {
  return {
    total: values.length,
    pending: values.filter((v) => v.state === "pending").length,
    approved: values.filter((v) => v.state === "approved").length,
    corrected: values.filter((v) => v.state === "corrected").length,
    carriedOver: values.filter((v) => v.state === "carried_over").length,
  };
}

const pollWhileRunning = (doc: DocumentDetail | undefined) =>
  doc?.versions.some((v) => isInProgress(v.status)) ? POLL_MS : false;

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const requested = Number(searchParams.get("version")) || undefined;
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The current version; while it is still extracting, the page shows the
  // latest extracted version, which stays reviewable until the new one lands.
  const current = useQuery({
    queryKey: ["document", id, "current"],
    queryFn: () => api.getDocument(id),
    refetchInterval: (q) => pollWhileRunning(q.state.data),
  });
  const fallback =
    current.data && !requested && current.data.currentVersion.status !== "extracted"
      ? current.data.latestExtractedVersion
      : null;
  const shownNumber = requested ?? fallback ?? undefined;
  const shown = useQuery({
    queryKey: ["document", id, shownNumber],
    queryFn: () => api.getDocument(id, shownNumber),
    enabled: shownNumber !== undefined,
    refetchInterval: (q) => pollWhileRunning(q.state.data),
  });
  const doc = shownNumber === undefined ? current.data : shown.data;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["document", id] });
  const retry = useMutation({ mutationFn: () => api.retry(id), onSettled: refresh });

  const values = useMemo(
    () =>
      [...(doc?.values ?? [])].sort((a, b) => TONE_ORDER[valueTone(a)] - TONE_ORDER[valueTone(b)]),
    [doc?.values],
  );

  if (current.isError) {
    return (
      <main className="page">
        <Link href="/">← All documents</Link>
        <div className="banner banner-failed" role="alert">
          {current.error instanceof ApiError && current.error.status === 404
            ? "This document does not exist."
            : `Could not load the document: ${current.error.message}`}
          <button type="button" onClick={() => void current.refetch()}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!current.data || !doc) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const latest = current.data.currentVersion;
  const view = doc.shownVersion;
  const selected = values.find((v) => v.id === selectedId) ?? null;

  async function review(valueId: string, body: Parameters<typeof api.review>[1]) {
    try {
      await api.review(valueId, body);
    } catch (err) {
      // A newer version may have landed: show it, and tell the reviewer why.
      if (err instanceof ApiError && err.status === 409) void refresh();
      throw err;
    } finally {
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  }

  return (
    <main className="page">
      <Link href="/">← All documents</Link>

      <header className="header">
        <h1>{doc.title}</h1>
        <VersionStatusBadge status={latest.status} />
        <span className="muted">
          {doc.type.replace("_", " ")} · current version v{latest.number}
        </span>
      </header>

      {isInProgress(latest.status) && (
        <div className="banner banner-progress" role="status">
          {latest.status === "queued" ? `v${latest.number} is queued for extraction.` : `Extracting v${latest.number}…`}
          {view.number !== latest.number && ` v${view.number} below is still the version to review until it finishes.`}
        </div>
      )}
      {latest.status === "failed" && (
        <div className="banner banner-failed" role="alert">
          <span>
            Extraction of v{latest.number} failed: {latest.failureReason ?? "unknown error"}
          </span>
          <button type="button" className="primary" disabled={retry.isPending} onClick={() => retry.mutate()}>
            {retry.isPending ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}
      {view.status === "extracted" && !view.reviewable && (
        <div className="banner banner-info">
          You are looking at v{view.number}, an earlier version. It is read-only.{" "}
          {current.data.latestExtractedVersion && (
            <Link href={`/documents/${encodeURIComponent(id)}?version=${current.data.latestExtractedVersion}`}>
              Review v{current.data.latestExtractedVersion}
            </Link>
          )}
        </div>
      )}

      <section className="panel" style={{ display: "grid", gap: "var(--space-3)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <ProgressSummary counts={counts(values)} />
          <nav className="versions" aria-label="Versions">
            <span className="muted">Versions:</span>
            {doc.versions.map((v) => (
              <Link
                key={v.number}
                href={`/documents/${encodeURIComponent(id)}?version=${v.number}`}
                aria-current={v.number === view.number ? "page" : undefined}
                title={v.status}
              >
                v{v.number}
                {v.status !== "extracted" && ` (${v.status})`}
              </Link>
            ))}
          </nav>
        </div>
        <UploadForm mode="version" submit={(form) => api.uploadVersion(id, form)} onUploaded={() => void refresh()} />
      </section>

      {view.status !== "extracted" && values.length === 0 ? (
        <p className="muted">
          {view.status === "failed"
            ? "No values: this version's extraction failed."
            : "Values appear here when extraction finishes."}
        </p>
      ) : (
        <div className="review-layout">
          <section className="cards" aria-label={`Extracted values, version ${view.number}`}>
            {values.map((value) => (
              <ValueCard
                key={value.id}
                value={value}
                reviewable={view.reviewable}
                selected={value.id === selectedId}
                onSelect={() => setSelectedId(value.id === selectedId ? null : value.id)}
                onReview={(body) => review(value.id, body)}
              />
            ))}
          </section>
          <section className="panel document-text" aria-label={`Document text, version ${view.number}`}>
            <DocumentText
              text={view.parsedText}
              highlight={
                selected && selected.evidenceStart !== null && selected.evidenceEnd !== null
                  ? { start: selected.evidenceStart, end: selected.evidenceEnd }
                  : null
              }
            />
          </section>
        </div>
      )}
    </main>
  );
}
