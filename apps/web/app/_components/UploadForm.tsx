"use client";

import { DOCUMENT_TYPES } from "@app/core";
import { useId, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Icon } from "./Icon";
import { ApiError } from "./api";

const TYPE_LABELS: Record<(typeof DOCUMENT_TYPES)[number], string> = {
  invoice: "Invoice",
  lease: "Lease",
  market_report: "Market report",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Uploads a PDF, either as a new document (with a type) or as a new version of
 * an existing one. Supports both click-to-browse and drag-and-drop.
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
  const [dragging, setDragging] = useState(false);
  const [pickedFile, setPickedFile] = useState<{ name: string; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const typeId = useId();
  const titleId = useId();

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPickedFile(file ? { name: file.name, size: file.size } : null);
    setError(null);
  }

  function onDragOver(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dragging) setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (!dropped) return;
    if (!dropped.name.toLowerCase().endsWith(".pdf") && dropped.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(dropped);
      fileInputRef.current.files = dt.files;
      setPickedFile({ name: dropped.name, size: dropped.size });
      setError(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const result = await submit(new FormData(formEl));
      formEl.reset();
      setPickedFile(null);
      onUploaded(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "version") {
    return (
      <form
        className={`version-upload-form${dragging ? " drop-active" : ""}`}
        onSubmit={onSubmit}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <label className="version-upload-label" htmlFor={fileId}>
          Revised PDF
        </label>
        <input
          ref={fileInputRef}
          id={fileId}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          onChange={onFileChange}
        />
        {pickedFile && (
          <span className="picked-file-chip">
            {pickedFile.name} · {formatBytes(pickedFile.size)}
          </span>
        )}
        <button type="submit" className="primary" disabled={busy}>
          <Icon name="upload" size={15} />
          <span>{busy ? "Uploading…" : "Upload new version"}</span>
        </button>
        {error && (
          <span className="error" role="alert">
            {error}
          </span>
        )}
      </form>
    );
  }

  return (
    <form
      className={`upload-form${dragging ? " drop-active" : ""}`}
      onSubmit={onSubmit}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="field">
        <label htmlFor={typeId}>Type</label>
        <select id={typeId} name="type" required defaultValue="invoice">
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={titleId}>Title (optional)</label>
        <input id={titleId} name="title" placeholder="e.g. Q4 Invoice 2026" />
      </div>
      <div className="field field--file">
        <label htmlFor={fileId}>PDF</label>
        <input
          ref={fileInputRef}
          id={fileId}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          onChange={onFileChange}
        />
      </div>
      <button type="submit" className="primary upload-submit" disabled={busy}>
        <Icon name="upload" size={16} />
        <span>{busy ? "Uploading…" : "Upload"}</span>
      </button>
      {pickedFile && (
        <div className="upload-picked-row">
          <span className="picked-file-chip">
            <Icon name="documents" size={13} />
            <span>
              {pickedFile.name} ({formatBytes(pickedFile.size)})
            </span>
          </span>
        </div>
      )}
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
