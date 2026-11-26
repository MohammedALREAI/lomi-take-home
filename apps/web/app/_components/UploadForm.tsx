"use client";

import { DOCUMENT_TYPES } from "@app/core";
import { useState, type FormEvent } from "react";
import { ApiError } from "./api";

const TYPE_LABELS: Record<(typeof DOCUMENT_TYPES)[number], string> = {
  invoice: "Invoice",
  lease: "Lease",
  market_report: "Market report",
};

/**
 * Uploads a PDF, either as a new document (with a type) or as a new version of
 * an existing one. The server answers at once; extraction runs afterwards.
 */
export function UploadForm({
  mode,
  submit,
  onUploaded,
}: {
  mode: "document" | "version";
  submit: (form: FormData) => Promise<{ documentId: string; number: number }>;
  onUploaded: (result: { documentId: string; number: number }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const result = await submit(new FormData(formEl));
      formEl.reset();
      onUploaded(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="row" onSubmit={onSubmit}>
      {mode === "document" && (
        <>
          <label className="field">
            Type
            <select name="type" required defaultValue="invoice">
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Title (optional)
            <input name="title" placeholder="Defaults to the file name" />
          </label>
        </>
      )}
      <label className="field">
        {mode === "document" ? "PDF" : "Revised PDF"}
        <input name="file" type="file" accept="application/pdf,.pdf" required />
      </label>
      <button type="submit" className="primary" disabled={busy}>
        {busy ? "Uploading…" : mode === "document" ? "Upload" : "Upload new version"}
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
