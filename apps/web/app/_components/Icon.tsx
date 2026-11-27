import type { SVGProps } from "react";

export type IconName =
  | "logo"
  | "documents"
  | "search"
  | "sun"
  | "moon"
  | "help"
  | "arrowRight"
  | "arrowLeft"
  | "upload"
  | "sparkles"
  | "refresh"
  | "eye"
  | "check"
  | "close"
  | "edit"
  | "alert"
  | "carryOver"
  | "clock"
  | "calendar"
  | "currency"
  | "hash"
  | "building"
  | "invoice"
  | "lease"
  | "market_report"
  | "layers"
  | "quote"
  | "zoomIn"
  | "zoomOut"
  | "copy"
  | "expand"
  | "collapse"
  | "menu"
  | "panelLeftClose"
  | "panelLeftOpen"
  | "chevronLeft"
  | "chevronRight"
  | "download"
  | "keyboard";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, className, ...rest }: IconProps) {
  const base: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: "false",
    className,
    ...rest,
  };

  switch (name) {
    case "logo":
      return (
        <svg {...base} strokeWidth={2}>
          <path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5Z" fill="currentColor" fillOpacity={0.18} />
          <path d="M12 2.5v9.5l8 5" />
          <path d="M12 12 4 7" />
        </svg>
      );
    case "documents":
      return (
        <svg {...base}>
          <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v5h5" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      );
    case "search":
      return (
        <svg {...base}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "sun":
      return (
        <svg {...base}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      );
    case "moon":
      return (
        <svg {...base}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      );
    case "help":
      return (
        <svg {...base}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 4.8.8c0 1.7-2.3 2.2-2.3 3.7" />
          <circle cx="12" cy="17" r="0.6" fill="currentColor" />
        </svg>
      );
    case "arrowRight":
      return (
        <svg {...base}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "arrowLeft":
      return (
        <svg {...base}>
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
      );
    case "upload":
      return (
        <svg {...base}>
          <path d="M4 16.5A4.5 4.5 0 0 1 7.5 8 5.5 5.5 0 0 1 18 9a4 4 0 0 1 .5 7.9" />
          <path d="M12 12v9M8.5 15.5 12 12l3.5 3.5" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...base}>
          <path
            d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"
            fill="currentColor"
            fillOpacity={0.18}
          />
          <path d="M19 16v4M17 18h4" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...base}>
          <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      );
    case "eye":
      return (
        <svg {...base}>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "check":
      return (
        <svg {...base} strokeWidth={2.3}>
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      );
    case "close":
      return (
        <svg {...base} strokeWidth={2.1}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    case "edit":
      return (
        <svg {...base}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "alert":
      return (
        <svg {...base}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4.5" />
          <circle cx="12" cy="16" r="0.6" fill="currentColor" />
        </svg>
      );
    case "carryOver":
      return (
        <svg {...base}>
          <path d="M17 4l3 3-3 3" />
          <path d="M4 11V9a2 2 0 0 1 2-2h14" />
          <path d="M7 20l-3-3 3-3" />
          <path d="M20 13v2a2 2 0 0 1-2 2H4" />
        </svg>
      );
    case "clock":
      return (
        <svg {...base}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...base}>
          <rect x="3" y="5" width="18" height="16" rx="2.5" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      );
    case "currency":
      return (
        <svg {...base}>
          <circle cx="12" cy="12" r="9" />
          <path d="M14.8 9.2a2.5 2.5 0 0 0-2.3-1.2h-1a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4h-1a2.5 2.5 0 0 1-2.3-1.2M12 6.5v11" />
        </svg>
      );
    case "hash":
      return (
        <svg {...base}>
          <path d="M4 9h16M4 15h16M10 4 8 20M16 4l-2 16" />
        </svg>
      );
    case "building":
      return (
        <svg {...base}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4" />
        </svg>
      );
    case "invoice":
      return (
        <svg {...base}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </svg>
      );
    case "lease":
      return (
        <svg {...base}>
          <path d="m3 10.5 9-7 9 7" />
          <path d="M5.5 9v10.5h13V9" />
          <path d="M10 19.5v-5h4v5" />
        </svg>
      );
    case "market_report":
      return (
        <svg {...base}>
          <path d="M4 19.5h16" />
          <path d="M7 16v-4M12 16V7M17 16v-7" strokeWidth={2.4} />
        </svg>
      );
    case "layers":
      return (
        <svg {...base}>
          <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
          <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
        </svg>
      );
    case "quote":
      return (
        <svg {...base}>
          <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
          <path d="M9 11h6M9 15h4" />
        </svg>
      );
    case "zoomIn":
      return (
        <svg {...base}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
        </svg>
      );
    case "zoomOut":
      return (
        <svg {...base}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5M8 11h6" />
        </svg>
      );
    case "copy":
      return (
        <svg {...base}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "expand":
      return (
        <svg {...base}>
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      );
    case "collapse":
      return (
        <svg {...base}>
          <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
        </svg>
      );
    case "menu":
      return (
        <svg {...base}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case "panelLeftClose":
      return (
        <svg {...base}>
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <path d="M9 3v18M16 15l-3-3 3-3" />
        </svg>
      );
    case "panelLeftOpen":
      return (
        <svg {...base}>
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <path d="M9 3v18M13 9l3 3-3 3" />
        </svg>
      );
    case "chevronLeft":
      return (
        <svg {...base} strokeWidth={2.2}>
          <path d="m14.5 6.5-5.5 5.5 5.5 5.5" />
        </svg>
      );
    case "chevronRight":
      return (
        <svg {...base} strokeWidth={2.2}>
          <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />
        </svg>
      );
    case "download":
      return (
        <svg {...base}>
          <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      );
    case "keyboard":
      return (
        <svg {...base}>
          <rect x="2" y="5" width="20" height="14" rx="2.5" />
          <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15h6" />
        </svg>
      );
  }
}

/** Maps an extracted field name or type to a semantic field icon. */
export function fieldIconName(field: string, type: string): IconName {
  if (type === "date" || field.includes("date")) return "calendar";
  if (type === "money" || field.includes("amount") || field.includes("rent") || field.includes("income")) {
    return "currency";
  }
  if (type === "percent" || field.includes("number") || field.includes("rate")) return "hash";
  if (field.includes("terms") || field.includes("months")) return "clock";
  if (
    field.includes("vendor") ||
    field.includes("landlord") ||
    field.includes("tenant") ||
    field.includes("region") ||
    field.includes("address")
  ) {
    return "building";
  }
  return "documents";
}

/** Hero AI + Document vector art shown on the right of the Document List header. */
export function HeroAiIllustration() {
  return (
    <svg width="168" height="82" viewBox="0 0 168 82" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="86" cy="48" rx="68" ry="30" fill="#DBEAFE" fillOpacity="0.6" />
      {/* Document card */}
      <g transform="rotate(-5 64 42)">
        <rect x="34" y="10" width="54" height="64" rx="9" fill="#FFFFFF" stroke="#BFDBFE" strokeWidth="1.5" />
        <rect x="43" y="21" width="24" height="4.5" rx="2.25" fill="#93C5FD" />
        <rect x="43" y="30" width="35" height="4" rx="2" fill="#CBD5E1" />
        <rect x="43" y="38" width="31" height="4" rx="2" fill="#CBD5E1" />
        <rect x="43" y="46" width="27" height="4" rx="2" fill="#CBD5E1" />
        <rect x="43" y="55" width="19" height="4.5" rx="2.25" fill="#86EFAC" />
      </g>
      {/* AI processor badge */}
      <g transform="rotate(6 112 43)">
        <path
          d="M98 18v-5M110 18v-5M122 18v-5M98 70v-5M110 70v-5M122 70v-5M87 31h-5M87 43h-5M87 55h-5M138 31h-5M138 43h-5M138 55h-5"
          stroke="#3B82F6"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <rect x="87" y="18" width="46" height="46" rx="12" fill="url(#aiChip)" />
        <text
          x="110"
          y="48"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="Plus Jakarta Sans, Inter, sans-serif"
          fontWeight="800"
          fontSize="19"
        >
          AI
        </text>
      </g>
      {/* Sparkle accents */}
      <path d="M150 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#60A5FA" />
      <circle cx="22" cy="26" r="3" fill="#93C5FD" />
      <defs>
        <linearGradient id="aiChip" x1="87" y1="18" x2="133" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** PDF sheet + cloud upload badge shown inside the Upload a Document panel. */
export function PdfUploadIllustration() {
  return (
    <svg width="118" height="106" viewBox="0 0 118 106" fill="none" aria-hidden="true" focusable="false">
      <circle cx="56" cy="54" r="44" fill="#E8EEFF" />
      {/* Back sheet */}
      <rect
        x="30"
        y="18"
        width="50"
        height="64"
        rx="8"
        transform="rotate(-6 30 18)"
        fill="#DBEAFE"
      />
      {/* Main PDF sheet */}
      <rect x="33" y="15" width="52" height="68" rx="9" fill="#FFFFFF" stroke="#DCE4F7" strokeWidth="1.5" />
      <rect x="42" y="26" width="22" height="4" rx="2" fill="#E2E8F0" />
      <rect x="42" y="34" width="34" height="4" rx="2" fill="#E2E8F0" />
      <rect x="42" y="44" width="34" height="17" rx="5" fill="#FFE4E6" />
      <text
        x="59"
        y="56"
        textAnchor="middle"
        fill="#E11D48"
        fontFamily="Plus Jakarta Sans, Inter, sans-serif"
        fontWeight="800"
        fontSize="11"
      >
        PDF
      </text>
      <rect x="42" y="68" width="26" height="4" rx="2" fill="#E2E8F0" />
      {/* Cloud upload circle */}
      <circle cx="84" cy="74" r="17" fill="#2563EB" />
      <path
        d="M78 76.5a3.5 3.5 0 0 1 .7-6.9 4.4 4.4 0 0 1 8.5.8 3.2 3.2 0 0 1 .4 6.3M84 72v7M81.3 74.7 84 72l2.7 2.7"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Miniature vector page thumbnail individualized by document type. */
export function MiniDocPreview({ type }: { type: string }) {
  const accent = type === "lease" ? "#10B981" : type === "market_report" ? "#8B5CF6" : "#3B82F6";
  return (
    <span className="doc-thumb" aria-hidden="true">
      <svg width="32" height="42" viewBox="0 0 32 42" fill="none">
        <rect x="1" y="1" width="30" height="40" rx="4" fill="#FFFFFF" stroke="#E2E8F0" />
        <rect x="5" y="6" width="12" height="3" rx="1.5" fill={accent} />
        <rect x="5" y="12" width="22" height="2.2" rx="1.1" fill="#CBD5E1" />
        <rect x="5" y="16.5" width="19" height="2.2" rx="1.1" fill="#CBD5E1" />
        {type === "market_report" ? (
          <>
            <rect x="6" y="29" width="4" height="7" rx="1" fill="#C4B5FD" />
            <rect x="13" y="24" width="4" height="12" rx="1" fill="#8B5CF6" />
            <rect x="20" y="27" width="4" height="9" rx="1" fill="#60A5FA" />
          </>
        ) : (
          <>
            <rect x="5" y="23" width="22" height="6" rx="2" fill="#F1F5F9" />
            <rect x="5" y="32" width="14" height="2.5" rx="1.25" fill={accent} fillOpacity="0.65" />
          </>
        )}
      </svg>
    </span>
  );
}

/** Compact circular progress ring used on the Document Review toolbar. */
export function CircularProgress({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 10.5;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <circle cx="14" cy="14" r={r} fill="none" stroke="var(--color-border)" strokeWidth="3.2" />
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke="var(--status-done-bar)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 14 14)"
      />
    </svg>
  );
}
