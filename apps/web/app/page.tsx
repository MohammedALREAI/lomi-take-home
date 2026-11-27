"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppShell } from "./_components/AppShell";
import {
  HeroAiIllustration,
  Icon,
  MiniDocPreview,
  PdfUploadIllustration,
} from "./_components/Icon";
import { ProgressSummary } from "./_components/ProgressSummary";
import { TableSkeleton } from "./_components/Skeleton";
import { VersionStatusBadge } from "./_components/StatusBadge";
import { useToast } from "./_components/Toast";
import { DOCUMENT_TYPE_LABELS, TypeBadge } from "./_components/TypeBadge";
import { UploadForm } from "./_components/UploadForm";
import { POLL_MS, api, isInProgress, type DocumentSummary } from "./_components/api";

type ListFilter = "all" | "needs_review" | "in_progress" | "failed" | "completed";

function matchesListFilter(doc: DocumentSummary, filter: ListFilter): boolean {
  if (filter === "all") return true;
  if (filter === "failed") return doc.status === "failed";
  if (filter === "in_progress") return isInProgress(doc.status);
  if (filter === "needs_review") return doc.progress.pending > 0;
  if (filter === "completed") {
    return doc.status === "extracted" && doc.progress.total > 0 && doc.progress.pending === 0;
  }
  return true;
}

export default function DocumentListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListFilter>("all");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: api.listDocuments,
    refetchInterval: (query) =>
      query.state.data?.some((d) => isInProgress(d.status)) ? POLL_MS : false,
  });

  const retryMutation = useMutation({
    mutationFn: async (docId: string) => {
      setRetryingId(docId);
      return api.retry(docId);
    },
    onSuccess: () => {
      toast.info("Extraction requeued");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    },
    onSettled: () => {
      setRetryingId(null);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const allDocs = documents.data ?? [];

  const filterCounts = useMemo(
    () => ({
      all: allDocs.length,
      needs_review: allDocs.filter((d) => matchesListFilter(d, "needs_review")).length,
      in_progress: allDocs.filter((d) => matchesListFilter(d, "in_progress")).length,
      failed: allDocs.filter((d) => matchesListFilter(d, "failed")).length,
      completed: allDocs.filter((d) => matchesListFilter(d, "completed")).length,
    }),
    [allDocs],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allDocs.filter((doc) => {
      if (!matchesListFilter(doc, statusFilter)) return false;
      if (!q) return true;
      const typeLabel = (DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type).toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.id.toLowerCase().includes(q) ||
        typeLabel.includes(q) ||
        doc.status.toLowerCase().includes(q)
      );
    });
  }, [allDocs, searchQuery, statusFilter]);

  return (
    <AppShell
      search={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search documents…",
      }}
    >
      <header className="hero-header">
        <div className="hero-title-group">
          <span className="hero-badge-icon">
            <Icon name="documents" size={26} />
          </span>
          <div>
            <h1>Document Review</h1>
            <p className="hero-subtitle">
              Upload documents, extract data with AI, and review results
            </p>
          </div>
        </div>
        <div className="hero-illustration">
          <HeroAiIllustration />
        </div>
      </header>

      <section className="upload-shell" aria-labelledby="upload-heading">
        <div className="upload-card">
          <div className="upload-art">
            <PdfUploadIllustration />
          </div>
          <div className="upload-body">
            <h2 id="upload-heading">Upload a Document</h2>
            <p className="muted">
              Select a PDF or drag and drop it right here, then choose its document type
            </p>
            <UploadForm
              mode="document"
              submit={api.uploadDocument}
              onUploaded={({ documentId }) => {
                toast.success("Document uploaded — queued for AI extraction");
                void queryClient.invalidateQueries({ queryKey: ["documents"] });
                router.push(`/documents/${encodeURIComponent(documentId)}`);
              }}
            />
          </div>
          <aside className="upload-aside" aria-label="Supported file formats">
            <span className="upload-aside-icon">
              <Icon name="sparkles" size={22} />
            </span>
            <strong>Supported Formats</strong>
            <small>PDF files only, up to 10MB · Drag & drop ready</small>
          </aside>
        </div>
      </section>

      <section className="documents-card" aria-labelledby="documents-heading">
        <div className="documents-card-head">
          <div className="documents-card-title">
            <span className="section-icon">
              <Icon name="documents" size={19} />
            </span>
            <div>
              <h2 id="documents-heading">Documents</h2>
              <p className="muted">Manage and review your uploaded documents</p>
            </div>
          </div>

          <div className="documents-head-controls">
            {allDocs.length > 0 && (
              <div className="filter-pills" role="group" aria-label="Filter documents by status">
                {(
                  [
                    ["all", "All", filterCounts.all],
                    ["needs_review", "Needs review", filterCounts.needs_review],
                    ["in_progress", "Extracting", filterCounts.in_progress],
                    ["failed", "Failed", filterCounts.failed],
                    ["completed", "Reviewed", filterCounts.completed],
                  ] as const
                ).map(([key, labelText, count]) =>
                  key !== "all" && count === 0 ? null : (
                    <button
                      key={key}
                      type="button"
                      className={`filter-pill${statusFilter === key ? " filter-pill--active" : ""}`}
                      onClick={() => setStatusFilter(key)}
                    >
                      <span>{labelText}</span>
                      <span className="filter-pill-count">{count}</span>
                    </button>
                  ),
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void documents.refetch()}
              disabled={documents.isFetching}
            >
              <Icon
                name="refresh"
                size={15}
                className={documents.isFetching ? "spin" : undefined}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {documents.isPending ? (
          <TableSkeleton rows={3} />
        ) : documents.isError ? (
          <div style={{ padding: "18px" }}>
            <div className="banner banner-failed" role="alert">
              <span className="banner-body">
                <Icon name="alert" size={17} />
                <span>Could not load documents: {documents.error.message}</span>
              </span>
              <button type="button" onClick={() => void documents.refetch()}>
                Try again
              </button>
            </div>
          </div>
        ) : allDocs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <Icon name="documents" size={22} />
            </span>
            <h3>No documents yet</h3>
            <p className="muted">
              Upload a PDF above to start your first extraction and review.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <Icon name="search" size={22} />
            </span>
            <h3>No matching documents</h3>
            <p className="muted">No documents matched your current search or filter.</p>
            <button
              type="button"
              className="btn-sm"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Extraction</th>
                  <th>Progress</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => {
                  const href = `/documents/${encodeURIComponent(doc.id)}`;
                  const isRetrying = retryMutation.isPending && retryingId === doc.id;
                  return (
                    <tr key={doc.id}>
                      <td>
                        <div className="doc-cell">
                          <MiniDocPreview type={doc.type} />
                          <div className="doc-meta">
                            <Link className="doc-title-link" href={href}>
                              {doc.title}
                            </Link>
                            <span className="doc-sub">{doc.id}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <TypeBadge type={doc.type} />
                      </td>
                      <td>
                        <span className="version-chip">v{doc.currentVersion}</span>
                      </td>
                      <td>
                        <VersionStatusBadge status={doc.status} />
                      </td>
                      <td>
                        {doc.status === "failed" && doc.countedVersion === null ? (
                          <div className="row-error-box">
                            <span
                              className="row-error-title"
                              title={doc.failureReason ?? undefined}
                            >
                              <Icon name="alert" size={13} />
                              <span>
                                Extraction failed:{" "}
                                {(doc.failureReason ?? "unknown error").replace(
                                  /^Extraction failed:\s*/i,
                                  "",
                                )}
                              </span>
                            </span>
                            <Link className="row-error-link" href={href}>
                              View details →
                            </Link>
                          </div>
                        ) : (
                          <>
                            <ProgressSummary counts={doc.progress} variant="table" />
                            {doc.countedVersion !== null &&
                              doc.countedVersion !== doc.currentVersion && (
                                <div className="muted" style={{ marginTop: "4px" }}>
                                  Counts for v{doc.countedVersion}
                                </div>
                              )}
                          </>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {doc.status === "failed" ? (
                            <>
                              <button
                                type="button"
                                className="primary btn-sm"
                                disabled={isRetrying}
                                onClick={() => retryMutation.mutate(doc.id)}
                              >
                                <Icon
                                  name="refresh"
                                  size={14}
                                  className={isRetrying ? "spin" : undefined}
                                />
                                <span>{isRetrying ? "Retrying…" : "Retry"}</span>
                              </button>
                              <Link className="btn btn-sm" href={href}>
                                <Icon name="eye" size={14} />
                                <span>View</span>
                              </Link>
                            </>
                          ) : (
                            <Link className="btn btn-sm" href={href}>
                              <Icon name="eye" size={14} />
                              <span>View</span>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
