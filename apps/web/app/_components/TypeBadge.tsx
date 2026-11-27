import { Icon, type IconName } from "./Icon";

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  lease: "Lease",
  market_report: "Market Report",
};

const TYPE_ICON: Record<string, IconName> = {
  invoice: "invoice",
  lease: "lease",
  market_report: "market_report",
};

export function TypeBadge({ type }: { type: string }) {
  const icon = TYPE_ICON[type] ?? "documents";
  const label = DOCUMENT_TYPE_LABELS[type] ?? type;
  const modifier = type in DOCUMENT_TYPE_LABELS ? type : "invoice";
  return (
    <span className={`type-badge type-badge--${modifier}`}>
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </span>
  );
}
