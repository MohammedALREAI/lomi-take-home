"use client";

import { useEffect, useRef } from "react";

/** The version's parsed text, with the selected value's evidence highlighted. */
export function DocumentText({
  text,
  highlight,
}: {
  text: string | null;
  highlight: { start: number; end: number } | null;
}) {
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight?.start, highlight?.end]);

  if (text === null) return <p className="muted">The document text appears once it has been parsed.</p>;
  if (!highlight) return <pre>{text}</pre>;
  return (
    <pre>
      {text.slice(0, highlight.start)}
      <mark ref={markRef}>{text.slice(highlight.start, highlight.end)}</mark>
      {text.slice(highlight.end)}
    </pre>
  );
}
