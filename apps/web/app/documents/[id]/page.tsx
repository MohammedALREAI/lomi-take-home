"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppShell } from "../../_components/AppShell";
import { DocumentText } from "../../_components/DocumentText";
import { Icon } from "../../_components/Icon";
import { ProgressSummary } from "../../_components/ProgressSummary";
import { DetailSkeleton } from "../../_components/Skeleton";
import { VersionStatusBadge, valueTone } from "../../_components/StatusBadge";
import { useToast } from "../../_components/Toast";
import { DOCUMENT_TYPE_LABELS } from "../../_components/TypeBadge";
import { UploadForm } from "../../_components/UploadForm";
import { ValueCard, formatFieldLabel } from "../../_components/ValueCard";
import {
  ApiError,
  POLL_MS,
  api,
  isInProgress,
  type DocumentDetail,
  type ValueView,
} from "../../_components/api";

// Cards that need the reviewer come first, so the work is visible at a glance.
const TONE_ORDER = { pending: 0, gap: 0, carried: 1, done: 2 } as const;

type ValueFilter = "all" | "pending" | "carried" | "done";

function counts(values: ValueView[]) {
  return {
    total: values.length,
    pending: values.filter((v) => v.state === "pending").length,
    approved: values.filter((v) => v.state === "approved").length,
    corrected: values.filter((v) => v.state === "corrected").length,
    carriedOver: values.filter((v) => v.state === "carried_over").length,
  };
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

const pollWhileRunning = (doc: DocumentDetail | undefined) =>
  doc?.versions.some((v) => isInProgress(v.status)) ? POLL_MS : false;

function DocumentDetailView({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const requested = Number(searchParams.get("version")) || undefined;
  const queryClient = useQueryClient();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correctSignal, setCorrectSignal] = useState<{
    id: string;
    seq: number;
  }>({
    id: "",
    seq: 0,
  });
  const [fieldQuery, setFieldQuery] = useState("");
  const [valueFilter, setValueFilter] = useState<ValueFilter>("all");
  const [viewerExpanded, setViewerExpanded] = useState(false);

  // The current version; while it is still extracting, the page shows the
  // latest extracted version, which stays reviewable until the new one lands.
  const current = useQuery({
    queryKey: ["document", id, "current"],
    queryFn: () => api.getDocument(id),
    refetchInterval: (q) => pollWhileRunning(q.state.data),
  });
  const fallback =
    current.data &&
    !requested &&
    current.data.currentVersion.status !== "extracted"
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

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["document", id] }),
    [queryClient, id],
  );
  const retry = useMutation({
    mutationFn: () => api.retry(id),
    onSuccess: () => toast.info("Extraction requeued"),
    onSettled: refresh,
  });

  const sortedValues = useMemo(
    () =>
      [...(doc?.values ?? [])].sort(
        (a, b) => TONE_ORDER[valueTone(a)] - TONE_ORDER[valueTone(b)],
      ),
    [doc?.values],
  );

  const summaryCounts = useMemo(() => counts(sortedValues), [sortedValues]);

  const visibleValues = useMemo(() => {
    const q = fieldQuery.trim().toLowerCase();
    return sortedValues.filter((v) => {
      const tone = valueTone(v);
      if (valueFilter === "pending" && tone !== "pending" && tone !== "gap")
        return false;
      if (valueFilter === "carried" && tone !== "carried") return false;
      if (valueFilter === "done" && tone !== "done") return false;

      if (!q) return true;
      return (
        v.field.replace(/_/g, " ").toLowerCase().includes(q) ||
        (v.value ?? "").toLowerCase().includes(q) ||
        (v.effectiveValue ?? "").toLowerCase().includes(q) ||
        (v.evidence ?? "").toLowerCase().includes(q)
      );
    });
  }, [sortedValues, fieldQuery, valueFilter]);

  const review = useCallback(
    async (valueId: string, body: Parameters<typeof api.review>[1]) => {
      const target = sortedValues.find((v) => v.id === valueId);
      const nextPending = sortedValues.find(
        (v) => v.id !== valueId && v.state === "pending" && v.evidence !== null,
      );
      try {
        await api.review(valueId, body);
        const fieldName = target ? formatFieldLabel(target.field) : "field";
        toast.success(
          body.action === "approve"
            ? `Approved ${fieldName}`
            : `Saved correction for ${fieldName}`,
        );
        // Auto-advance highlight to the next pending value with a quote.
        if (nextPending) setSelectedId(nextPending.id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) void refresh();
        throw err;
      } finally {
        void refresh();
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
      }
    },
    [sortedValues, toast, refresh, queryClient],
  );

  // Reviewer keyboard shortcuts: J/K navigate cards, A approve, C correct.
  useEffect(() => {
    if (!doc || visibleValues.length === 0) return;
    const reviewable = doc.shownVersion.reviewable;

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableElement(e.target))
        return;
      const key = e.key.toLowerCase();

      if (key === "j") {
        e.preventDefault();
        const idx = visibleValues.findIndex((v) => v.id === selectedId);
        const next = visibleValues[(idx + 1) % visibleValues.length];
        if (next) setSelectedId(next.id);
      } else if (key === "k") {
        e.preventDefault();
        const idx = visibleValues.findIndex((v) => v.id === selectedId);
        const prev = visibleValues[(idx <= 0 ? visibleValues.length : idx) - 1];
        if (prev) setSelectedId(prev.id);
      } else if (key === "a" && reviewable) {
        const active =
          visibleValues.find((v) => v.id === selectedId) ??
          visibleValues.find((v) => v.state === "pending");
        if (active) {
          e.preventDefault();
          void review(active.id, { action: "approve" }).catch(() => undefined);
        }
      } else if (key === "c" && reviewable) {
        const active =
          visibleValues.find((v) => v.id === selectedId) ??
          visibleValues.find((v) => v.state === "pending");
        if (active) {
          e.preventDefault();
          setSelectedId(active.id);
          setCorrectSignal((prev) => ({ id: active.id, seq: prev.seq + 1 }));
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doc, visibleValues, selectedId, review]);

  if (current.isError) {
    return (
      <AppShell>
        <Link href="/" className="back-link">
          <Icon name="arrowLeft" size={15} />
          <span>All documents</span>
        </Link>
        <div className="banner banner-failed" role="alert">
          <span className="banner-body">
            <Icon name="alert" size={17} />
            <span>
              {current.error instanceof ApiError && current.error.status === 404
                ? "This document does not exist."
                : `Could not load the document: ${current.error.message}`}
            </span>
          </span>
          <button type="button" onClick={() => void current.refetch()}>
            Try again
          </button>
        </div>
      </AppShell>
    );
  }

  if (!current.data || !doc) {
    return (
      <AppShell>
        <Link href="/" className="back-link">
          <Icon name="arrowLeft" size={15} />
          <span>All documents</span>
        </Link>
        <DetailSkeleton />
      </AppShell>
    );
  }

  const latest = current.data.currentVersion;
  const view = doc.shownVersion;
  const selected = sortedValues.find((v) => v.id === selectedId) ?? null;
  const typeLabel =
    DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type.replace("_", " ");

  function exportJson() {
    if (!doc) return;
    const payload = {
      id: doc.id,
      title: doc.title,
      type: doc.type,
      version: view.number,
      extractedAt: view.extractedAt,
      run: view.latestRun,
      values: sortedValues.map((v) => ({
        field: v.field,
        effectiveValue: v.effectiveValue,
        modelValue: v.value,
        state: v.state,
        gapReason: v.gap?.reason ?? null,
        evidence: v.evidence,
        reviewNote: v.review?.note ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${doc.id}-v${view.number}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported v${view.number} values as JSON`);
  }

  return (
    <AppShell
      search={{
        value: fieldQuery,
        onChange: setFieldQuery,
        placeholder: "Search extracted fields or quotes…",
      }}
    >
      <Link href="/" className="back-link">
        <Icon name="arrowLeft" size={15} />
        <span>All documents</span>
      </Link>

      <header className="detail-header">
        <div className="detail-header-left">
          <span className="detail-doc-icon">
            <Icon name="documents" size={23} />
          </span>
          <div className="detail-title-wrap">
            <h1>{doc.title}</h1>
            <VersionStatusBadge status={latest.status} />
            <span className="detail-meta">
              {typeLabel} · current version v{latest.number}
            </span>
            {view.latestRun && (
              <span
                className="run-telemetry"
                title="Latest AI extraction run telemetry"
              >
                <Icon name="sparkles" size={13} />
                <span>
                  {view.latestRun.model}
                  {view.latestRun.durationMs !== null &&
                    ` · ${(view.latestRun.durationMs / 1000).toFixed(1)}s`}
                  {view.latestRun.totalTokens !== null &&
                    ` · ${view.latestRun.totalTokens} tokens`}
                  {view.latestRun.attempt > 1 &&
                    ` · attempt #${view.latestRun.attempt}`}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="detail-header-right">
          {sortedValues.length > 0 && (
            <button type="button" className="btn-sm" onClick={exportJson}>
              <Icon name="download" size={14} />
              <span>Export JSON</span>
            </button>
          )}

          <nav className="versions-nav" aria-label="Versions">
            <span className="versions-label">
              <Icon name="layers" size={15} />
              <span>Versions:</span>
            </span>
            {doc.versions.map((v) => (
              <Link
                key={v.number}
                className="version-link"
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
      </header>

      {isInProgress(latest.status) && (
        <div className="banner banner-progress" role="status">
          <span className="banner-body">
            <span className="pulse-dot" aria-hidden="true" />
            <span>
              {latest.status === "queued"
                ? `v${latest.number} is queued for extraction.`
                : `Extracting v${latest.number}…`}
              {view.number !== latest.number &&
                ` v${view.number} below is still the version to review until it finishes.`}
            </span>
          </span>
        </div>
      )}

      {latest.status === "failed" && (
        <div className="banner banner-failed" role="alert">
          <span className="banner-body">
            <Icon name="alert" size={17} />
            <span>
              Extraction of v{latest.number} failed:{" "}
              {(latest.failureReason ?? "unknown error").replace(
                /^Extraction failed:\s*/i,
                "",
              )}
            </span>
          </span>
          <button
            type="button"
            className="primary"
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
          >
            <Icon
              name="refresh"
              size={14}
              className={retry.isPending ? "spin" : undefined}
            />
            <span>{retry.isPending ? "Retrying…" : "Retry"}</span>
          </button>
        </div>
      )}

      {view.status === "extracted" && !view.reviewable && (
        <div className="banner banner-info">
          <span className="banner-body">
            <Icon name="clock" size={16} />
            <span>
              You are looking at v{view.number}, an earlier version. It is
              read-only.{" "}
              {current.data.latestExtractedVersion && (
                <Link
                  href={`/documents/${encodeURIComponent(id)}?version=${current.data.latestExtractedVersion}`}
                >
                  Review v{current.data.latestExtractedVersion}
                </Link>
              )}
            </span>
          </span>
        </div>
      )}

      <section
        className="detail-toolbar"
        aria-label="Review progress and revision upload"
      >
        <ProgressSummary counts={summaryCounts} variant="toolbar" />
        <div className="toolbar-divider" />
        <UploadForm
          mode="version"
          submit={(form) => api.uploadVersion(id, form)}
          onUploaded={({ number }) => {
            toast.success(
              `Version v${number} uploaded — queued for extraction`,
            );
            void refresh();
          }}
        />
      </section>

      {view.status !== "extracted" && sortedValues.length === 0 ? (
        view.parsedText ? (
          <div
            className={`review-layout${viewerExpanded ? " review-layout--expanded" : ""}`}
          >
            {!viewerExpanded && (
              <div className="detail-toolbar">
                <p className="muted">
                  {view.status === "failed"
                    ? "No values: this version's extraction failed."
                    : "Values appear here when extraction finishes."}
                </p>
              </div>
            )}
            <section aria-label={`Document text, version ${view.number}`}>
              <DocumentText
                documentId={id}
                text={view.parsedText}
                fileName={view.fileName}
                versionNumber={view.number}
                expanded={viewerExpanded}
                onToggleExpand={() => setViewerExpanded((e) => !e)}
                highlight={null}
              />
            </section>
          </div>
        ) : (
          <div className="detail-toolbar">
            <p className="muted">
              {view.status === "failed"
                ? "No values: this version's extraction failed."
                : "Values appear here when extraction finishes."}
            </p>
          </div>
        )
      ) : (
        <div
          className={`review-layout${viewerExpanded ? " review-layout--expanded" : ""}`}
        >
          {!viewerExpanded && (
            <section
              className="cards"
              aria-label={`Extracted values, version ${view.number}`}
            >
              <div className="cards-toolbar">
                <div
                  className="filter-pills"
                  role="group"
                  aria-label="Filter extracted fields"
                >
                  {(
                    [
                      ["all", "All", summaryCounts.total],
                      ["pending", "Pending", summaryCounts.pending],
                      ["carried", "Carried", summaryCounts.carriedOver],
                      [
                        "done",
                        "Done",
                        summaryCounts.approved + summaryCounts.corrected,
                      ],
                    ] as const
                  ).map(([key, labelText, count]) => (
                    <button
                      key={key}
                      type="button"
                      className={`filter-pill${valueFilter === key ? " filter-pill--active" : ""}`}
                      onClick={() => setValueFilter(key)}
                    >
                      <span>{labelText}</span>
                      <span className="filter-pill-count">{count}</span>
                    </button>
                  ))}
                </div>

                {view.reviewable && (
                  <span className="shortcut-hint" title="Keyboard shortcuts">
                    <Icon name="keyboard" size={14} />
                    <span>
                      <kbd>J</kbd>/<kbd>K</kbd> nav · <kbd>A</kbd> approve ·{" "}
                      <kbd>C</kbd> correct
                    </span>
                  </span>
                )}
              </div>

              {visibleValues.length === 0 ? (
                <div className="detail-toolbar">
                  <p className="muted">
                    No extracted fields matched your current filter.
                  </p>
                </div>
              ) : (
                visibleValues.map((value) => (
                  <ValueCard
                    key={value.id}
                    value={value}
                    reviewable={view.reviewable}
                    selected={value.id === selectedId}
                    openCorrectSignal={
                      correctSignal.id === value.id ? correctSignal.seq : 0
                    }
                    onSelect={() =>
                      setSelectedId(value.id === selectedId ? null : value.id)
                    }
                    onReview={(body) => review(value.id, body)}
                  />
                ))
              )}
            </section>
          )}

          <section aria-label={`Document text, version ${view.number}`}>
            <DocumentText
              documentId={id}
              text={view.parsedText}
              fileName={view.fileName}
              versionNumber={view.number}
              expanded={viewerExpanded}
              onToggleExpand={() => setViewerExpanded((e) => !e)}
              highlight={
                selected &&
                selected.evidenceStart !== null &&
                selected.evidenceEnd !== null
                  ? { start: selected.evidenceStart, end: selected.evidenceEnd }
                  : null
              }
            />
          </section>
        </div>
      )}
    </AppShell>
  );
}

export default function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <AppShell>
          <DetailSkeleton />
        </AppShell>
      }
    >
      <DocumentDetailView id={id} />
    </Suspense>
  );
}
