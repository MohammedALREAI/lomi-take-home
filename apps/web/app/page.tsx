"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProgressSummary } from "./_components/ProgressSummary";
import { VersionStatusBadge } from "./_components/StatusBadge";
import { UploadForm } from "./_components/UploadForm";
import { POLL_MS, api, isInProgress } from "./_components/api";

const TYPE_LABELS: Record<string, string> = { invoice: "Invoice", lease: "Lease", market_report: "Market report" };

export default function DocumentListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: api.listDocuments,
    refetchInterval: (query) => (query.state.data?.some((d) => isInProgress(d.status)) ? POLL_MS : false),
  });

  return (
    <main className="page">
      <header className="header">
        <h1>Document review</h1>
      </header>

      <section className="panel" aria-labelledby="upload-heading">
        <h2 id="upload-heading" style={{ marginBottom: "var(--space-3)" }}>
          Upload a document
        </h2>
        <UploadForm
          mode="document"
          submit={api.uploadDocument}
          onUploaded={({ documentId }) => {
            void queryClient.invalidateQueries({ queryKey: ["documents"] });
            router.push(`/documents/${encodeURIComponent(documentId)}`);
          }}
        />
      </section>

      <section aria-labelledby="documents-heading" style={{ display: "grid", gap: "var(--space-3)" }}>
        <h2 id="documents-heading">Documents</h2>
        {documents.isPending ? (
          <p className="muted">Loading…</p>
        ) : documents.isError ? (
          <div className="banner banner-failed" role="alert">
            Could not load documents: {documents.error.message}
            <button type="button" onClick={() => void documents.refetch()}>
              Try again
            </button>
          </div>
        ) : documents.data.length === 0 ? (
          <p className="muted">No documents yet. Upload a PDF to start.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Type</th>
                <th scope="col">Version</th>
                <th scope="col">Extraction</th>
                <th scope="col">Review</th>
              </tr>
            </thead>
            <tbody>
              {documents.data.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <Link href={`/documents/${encodeURIComponent(doc.id)}`}>{doc.title}</Link>
                  </td>
                  <td>{TYPE_LABELS[doc.type] ?? doc.type}</td>
                  <td>v{doc.currentVersion}</td>
                  <td>
                    <VersionStatusBadge status={doc.status} />
                    {doc.status === "failed" && doc.failureReason && (
                      <div className="error">{doc.failureReason}</div>
                    )}
                  </td>
                  <td>
                    <ProgressSummary counts={doc.progress} />
                    {doc.countedVersion !== null && doc.countedVersion !== doc.currentVersion && (
                      <div className="muted">counts for v{doc.countedVersion}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
