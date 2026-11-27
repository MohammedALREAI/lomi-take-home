import { Icon } from "./Icon";
import type { ValueView, VersionStatus } from "./api";

const VERSION_LABELS: Record<VersionStatus, [label: string, tone: string]> = {
  queued: ["Queued", "progress"],
  extracting: ["Extracting…", "progress"],
  extracted: ["Extracted", "done"],
  failed: ["Failed", "failed"],
};

export function VersionStatusBadge({ status }: { status: VersionStatus }) {
  const [label, tone] = VERSION_LABELS[status];
  return (
    <span className={`badge badge-${tone}`}>
      {status === "extracted" && <Icon name="check" size={13} />}
      {status === "failed" && <Icon name="alert" size={13} />}
      {(status === "queued" || status === "extracting") && <span className="pulse-dot" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}

/** The tone a value is shown in: what the reviewer has to do with it. */
export function valueTone(value: ValueView): "pending" | "gap" | "carried" | "done" {
  if (value.state === "pending") return value.gap ? "gap" : "pending";
  if (value.state === "carried_over") return "carried";
  return "done";
}

const VALUE_LABELS = {
  pending: "Needs review",
  gap: "Gap · needs review",
  carried: "Carried over",
  done: "",
} as const;

export function ValueStateBadge({ value }: { value: ValueView }) {
  const tone = valueTone(value);
  const label = tone === "done" ? (value.state === "corrected" ? "Corrected" : "Approved") : VALUE_LABELS[tone];
  return (
    <span className={`badge badge-${tone}`}>
      {(tone === "pending" || tone === "gap") && <Icon name="alert" size={13} />}
      {tone === "carried" && <Icon name="carryOver" size={13} />}
      {tone === "done" && <Icon name="check" size={13} />}
      <span>{label}</span>
    </span>
  );
}
