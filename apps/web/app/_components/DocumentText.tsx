"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

const ZOOM_STEPS = [85, 100, 115, 130] as const;

/** Parsed text paper viewer + Original PDF preview toggle, zoom, copy, and download. */
export function DocumentText({
  documentId,
  text,
  fileName,
  versionNumber,
  highlight,
  expanded,
  onToggleExpand,
}: {
  documentId: string;
  text: string | null;
  fileName?: string;
  versionNumber: number;
  highlight: { start: number; end: number } | null;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const markRef = useRef<HTMLElement>(null);
  const toast = useToast();
  const [zoomIdx, setZoomIdx] = useState(1);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"text" | "pdf">("text");

  const zoom = ZOOM_STEPS[zoomIdx] ?? 100;
  const fontSizePx = Math.round(((13 * zoom) / 100) * 10) / 10;
  const pdfBaseUrl = `/api/documents/${encodeURIComponent(documentId)}/pdf?version=${versionNumber}`;

  // When a value's quote is selected, ensure Parsed Text tab is visible and scroll to the quote.
  useEffect(() => {
    if (highlight) {
      setMode("text");
      window.requestAnimationFrame(() => {
        markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  }, [highlight?.start, highlight?.end, highlight]);

  async function copyText() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.info("Copied parsed text to clipboard");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable; ignore gracefully.
    }
  }

  return (
    <div className="doc-viewer">
      <div className="doc-viewer-bar">
        <div className="doc-viewer-file">
          <span className="pdf-mini-badge">PDF</span>
          <span title={fileName}>{fileName ?? "document.pdf"}</span>
          <span className="version-chip">v{versionNumber}</span>
        </div>

        <div className="doc-viewer-controls">
          <div className="viewer-tabs" role="tablist" aria-label="Document view mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "text"}
              className={mode === "text" ? "viewer-tab viewer-tab--active" : "viewer-tab"}
              onClick={() => setMode("text")}
            >
              Parsed Text
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "pdf"}
              className={mode === "pdf" ? "viewer-tab viewer-tab--active" : "viewer-tab"}
              onClick={() => setMode("pdf")}
            >
              Original PDF
            </button>
          </div>

          {mode === "text" && (
            <div className="zoom-group" role="group" aria-label="Document text zoom">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoomIdx === 0}
                onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
              >
                <Icon name="zoomOut" size={14} />
              </button>
              <span className="zoom-readout">{zoom}%</span>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoomIdx === ZOOM_STEPS.length - 1}
                onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              >
                <Icon name="zoomIn" size={14} />
              </button>
            </div>
          )}

          {mode === "text" && text && (
            <button
              type="button"
              className="btn-sm"
              onClick={() => void copyText()}
              aria-label="Copy document text"
            >
              <Icon name={copied ? "check" : "copy"} size={14} />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          )}

          <a
            href={`${pdfBaseUrl}&download=1`}
            className="btn btn-sm"
            aria-label="Download original PDF"
            title="Download original PDF"
          >
            <Icon name="download" size={14} />
          </a>

          {onToggleExpand && (
            <button
              type="button"
              className="btn-sm"
              onClick={onToggleExpand}
              aria-label={expanded ? "Restore split view" : "Expand document viewer"}
              title={expanded ? "Restore split view" : "Expand document viewer"}
            >
              <Icon name={expanded ? "collapse" : "expand"} size={14} />
            </button>
          )}
        </div>
      </div>

      {mode === "pdf" ? (
        <div className="pdf-frame-wrap">
          <iframe
            src={pdfBaseUrl}
            title={`Original PDF — ${fileName ?? documentId} v${versionNumber}`}
            className="pdf-frame"
          />
        </div>
      ) : (
        <div className="doc-viewer-canvas">
          <div className="doc-paper">
            {text === null ? (
              <p className="muted" style={{ padding: "28px" }}>
                The document text appears once it has been parsed.
              </p>
            ) : !highlight ? (
              <pre style={{ fontSize: `${fontSizePx}px` }}>{text}</pre>
            ) : (
              <pre style={{ fontSize: `${fontSizePx}px` }}>
                {text.slice(0, highlight.start)}
                <mark ref={markRef}>{text.slice(highlight.start, highlight.end)}</mark>
                {text.slice(highlight.end)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
