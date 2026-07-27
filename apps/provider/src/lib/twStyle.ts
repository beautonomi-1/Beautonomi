/**
 * Runtime Tailwind-like class string → React Native style.
 * Use for automated migration: replace className="..." with style={twStyle("...")}.
 * Matches Tailwind spacing (4px scale), Colors, and common utilities so native layout works.
 *
 * §Provider-audit 2026-05: the curated `COLOR_MAP` below was missing many
 * shades that screens actually use (e.g. `bg-emerald-600`, `text-indigo-800`,
 * `border-pink-300`). Anywhere a missing class was rendered, the active state
 * silently dropped to no background colour while the text class still
 * resolved to `#fff`, producing "white-on-white" chips and buttons across
 * tip pickers, time pickers, the Next-step CTA, and many setting screens.
 *
 * The fix: keep `COLOR_MAP` as the fast/authoritative path for the curated
 * tokens we already used, but add a fallback `PALETTE` that resolves the
 * full standard Tailwind shade range (50…900 + 950) for the colours the app
 * uses. The fallback only runs when a class isn't in the explicit map, so
 * existing styles are unchanged.
 */
import type { ViewStyle, TextStyle } from "react-native";

const GRAY = {
  50: "#F9FAFB",
  100: "#F3F4F6",
  200: "#E5E7EB",
  300: "#D1D5DB",
  400: "#9CA3AF",
  500: "#6B7280",
  600: "#4B5563",
  700: "#374151",
  800: "#1F2937",
  900: "#111827",
} as const;

const PRIMARY = "#FF0077";

const COLOR_MAP: Record<string, string> = {
  // primary (brand)
  "text-primary": PRIMARY,
  "bg-primary": PRIMARY,
  "border-primary": PRIMARY,
  "bg-primary/10": "rgba(255, 0, 119, 0.1)",
  "border-primary/20": "rgba(255, 0, 119, 0.2)",
  // gray
  "bg-gray-50": GRAY[50],
  "bg-gray-100": GRAY[100],
  "bg-gray-200": GRAY[200],
  "bg-gray-300": GRAY[300],
  "bg-gray-400": GRAY[400],
  "bg-gray-500": GRAY[500],
  "bg-gray-600": GRAY[600],
  "bg-gray-700": GRAY[700],
  "bg-gray-800": GRAY[800],
  "bg-gray-900": GRAY[900],
  "text-gray-50": GRAY[50],
  "text-gray-100": GRAY[100],
  "text-gray-200": GRAY[200],
  "text-gray-300": GRAY[300],
  "text-gray-400": GRAY[400],
  "text-gray-500": GRAY[500],
  "text-gray-600": GRAY[600],
  "text-gray-700": GRAY[700],
  "text-gray-800": GRAY[800],
  "text-gray-900": GRAY[900],
  "border-gray-50": GRAY[50],
  "border-gray-100": GRAY[100],
  "border-gray-200": GRAY[200],
  "border-gray-300": GRAY[300],
  "border-gray-400": GRAY[400],
  "border-gray-500": GRAY[500],
  // white / black
  "bg-white": "#FFFFFF",
  "bg-black": "#000000",
  "text-white": "#FFFFFF",
  "text-black": "#000000",
};

/**
 * Standard Tailwind palette (v3) for fallback resolution.
 * Only includes the colours the provider app uses.
 */
const PALETTE: Record<string, Record<string, string>> = {
  red: {
    50: "#FEF2F2",
    100: "#FEE2E2",
    200: "#FECACA",
    300: "#FCA5A5",
    400: "#F87171",
    500: "#EF4444",
    600: "#DC2626",
    700: "#B91C1C",
    800: "#991B1B",
    900: "#7F1D1D",
  },
  orange: {
    50: "#FFF7ED",
    100: "#FFEDD5",
    200: "#FED7AA",
    300: "#FDBA74",
    400: "#FB923C",
    500: "#F97316",
    600: "#EA580C",
    700: "#C2410C",
    800: "#9A3412",
    900: "#7C2D12",
  },
  amber: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    200: "#FDE68A",
    300: "#FCD34D",
    400: "#FBBF24",
    500: "#F59E0B",
    600: "#D97706",
    700: "#B45309",
    800: "#92400E",
    900: "#78350F",
  },
  yellow: {
    50: "#FEFCE8",
    100: "#FEF9C3",
    200: "#FEF08A",
    300: "#FDE047",
    400: "#FACC15",
    500: "#EAB308",
    600: "#CA8A04",
    700: "#A16207",
    800: "#854D0E",
    900: "#713F12",
  },
  lime: {
    50: "#F7FEE7",
    100: "#ECFCCB",
    200: "#D9F99D",
    300: "#BEF264",
    400: "#A3E635",
    500: "#84CC16",
    600: "#65A30D",
    700: "#4D7C0F",
    800: "#3F6212",
    900: "#365314",
  },
  green: {
    50: "#F0FDF4",
    100: "#DCFCE7",
    200: "#BBF7D0",
    300: "#86EFAC",
    400: "#4ADE80",
    500: "#22C55E",
    600: "#16A34A",
    700: "#15803D",
    800: "#166534",
    900: "#14532D",
  },
  emerald: {
    50: "#ECFDF5",
    100: "#D1FAE5",
    200: "#A7F3D0",
    300: "#6EE7B7",
    400: "#34D399",
    500: "#10B981",
    600: "#059669",
    700: "#047857",
    800: "#065F46",
    900: "#064E3B",
  },
  teal: {
    50: "#F0FDFA",
    100: "#CCFBF1",
    200: "#99F6E4",
    300: "#5EEAD4",
    400: "#2DD4BF",
    500: "#14B8A6",
    600: "#0D9488",
    700: "#0F766E",
    800: "#115E59",
    900: "#134E4A",
  },
  cyan: {
    50: "#ECFEFF",
    100: "#CFFAFE",
    200: "#A5F3FC",
    300: "#67E8F9",
    400: "#22D3EE",
    500: "#06B6D4",
    600: "#0891B2",
    700: "#0E7490",
    800: "#155E75",
    900: "#164E63",
  },
  sky: {
    50: "#F0F9FF",
    100: "#E0F2FE",
    200: "#BAE6FD",
    300: "#7DD3FC",
    400: "#38BDF8",
    500: "#0EA5E9",
    600: "#0284C7",
    700: "#0369A1",
    800: "#075985",
    900: "#0C4A6E",
  },
  blue: {
    50: "#EFF6FF",
    100: "#DBEAFE",
    200: "#BFDBFE",
    300: "#93C5FD",
    400: "#60A5FA",
    500: "#3B82F6",
    600: "#2563EB",
    700: "#1D4ED8",
    800: "#1E40AF",
    900: "#1E3A8A",
  },
  indigo: {
    50: "#EEF2FF",
    100: "#E0E7FF",
    200: "#C7D2FE",
    300: "#A5B4FC",
    400: "#818CF8",
    500: "#6366F1",
    600: "#4F46E5",
    700: "#4338CA",
    800: "#3730A3",
    900: "#312E81",
  },
  violet: {
    50: "#F5F3FF",
    100: "#EDE9FE",
    200: "#DDD6FE",
    300: "#C4B5FD",
    400: "#A78BFA",
    500: "#8B5CF6",
    600: "#7C3AED",
    700: "#6D28D9",
    800: "#5B21B6",
    900: "#4C1D95",
  },
  purple: {
    50: "#FAF5FF",
    100: "#F3E8FF",
    200: "#E9D5FF",
    300: "#D8B4FE",
    400: "#C084FC",
    500: "#A855F7",
    600: "#9333EA",
    700: "#7E22CE",
    800: "#6B21A8",
    900: "#581C87",
  },
  fuchsia: {
    50: "#FDF4FF",
    100: "#FAE8FF",
    200: "#F5D0FE",
    300: "#F0ABFC",
    400: "#E879F9",
    500: "#D946EF",
    600: "#C026D3",
    700: "#A21CAF",
    800: "#86198F",
    900: "#701A75",
  },
  pink: {
    50: "#FDF2F8",
    100: "#FCE7F3",
    200: "#FBCFE8",
    300: "#F9A8D4",
    400: "#F472B6",
    500: "#EC4899",
    600: "#DB2777",
    700: "#BE185D",
    800: "#9D174D",
    900: "#831843",
  },
  rose: {
    50: "#FFF1F2",
    100: "#FFE4E6",
    200: "#FECDD3",
    300: "#FDA4AF",
    400: "#FB7185",
    500: "#F43F5E",
    600: "#E11D48",
    700: "#BE123C",
    800: "#9F1239",
    900: "#881337",
  },
  slate: {
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569",
    700: "#334155",
    800: "#1E293B",
    900: "#0F172A",
  },
  zinc: {
    50: "#FAFAFA",
    100: "#F4F4F5",
    200: "#E4E4E7",
    300: "#D4D4D8",
    400: "#A1A1AA",
    500: "#71717A",
    600: "#52525B",
    700: "#3F3F46",
    800: "#27272A",
    900: "#18181B",
  },
  stone: {
    50: "#FAFAF9",
    100: "#F5F5F4",
    200: "#E7E5E4",
    300: "#D6D3D1",
    400: "#A8A29E",
    500: "#78716C",
    600: "#57534E",
    700: "#44403C",
    800: "#292524",
    900: "#1C1917",
  },
};

const PALETTE_RE =
  /^(text|bg|border)(?:t|b|l|r)?-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|zinc|stone)-(\d{2,3})(?:\/(\d+))?$/;

function withOpacity(hex: string, opacityPercent?: string): string {
  if (!opacityPercent) return hex;
  const pct = Math.max(0, Math.min(100, parseInt(opacityPercent, 10)));
  const raw = hex.replace("#", "");
  if (raw.length !== 6 || Number.isNaN(pct)) return hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${pct / 100})`;
}

function parseCssLength(value: string): number | string {
  if (value.endsWith("rem")) {
    const rem = parseFloat(value.slice(0, -3));
    return Number.isNaN(rem) ? value : rem * 16;
  }
  if (value.endsWith("px")) {
    const px = parseFloat(value.slice(0, -2));
    return Number.isNaN(px) ? value : px;
  }
  const n = parseFloat(value);
  return Number.isNaN(n) ? value : n;
}

/** Resolve a Tailwind-style colour class against the standard palette. */
function resolvePrimaryColor(cls: string): string | null {
  const m = cls.match(/^(text|bg|border)(?:t|b|l|r)?-primary(?:\/(\d+))?$/);
  if (!m) return null;
  return withOpacity(PRIMARY, m[2]);
}

function resolvePaletteColor(cls: string): string | null {
  const m = cls.match(PALETTE_RE);
  if (!m) return null;
  const shades = PALETTE[m[2]];
  if (!shades) return null;
  const hex = shades[m[3]];
  return hex ? withOpacity(hex, m[4]) : null;
}

function parsePx(value: string): number {
  const n = parseInt(value, 10);
  if (!Number.isNaN(n)) return n;
  if (value.endsWith("px")) return parseInt(value.slice(0, -2), 10) || 0;
  return 0;
}

/** Tailwind 4px scale: 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 14=56, 16=64 */
const SPACE: Record<string, number> = {};
for (let i = 0; i <= 24; i++) SPACE[String(i)] = i * 4;
SPACE["0.5"] = 2;
SPACE["1.5"] = 6;
SPACE["2.5"] = 10;
SPACE["3.5"] = 14;

function getSpace(key: string): number {
  if (SPACE[key] !== undefined) return SPACE[key];
  const numeric = Number(key);
  if (Number.isFinite(numeric)) return numeric * 4;
  return parsePx(key) ?? 0;
}

/** Build a single style object from a class string. Supports static classes only; for conditional classes use twStyle(`base ${cond ? 'a' : 'b'}`). */
export function twStyle(classNames: string): ViewStyle & TextStyle {
  if (!classNames || typeof classNames !== "string") return {};
  const classes = classNames.trim().split(/\s+/).filter(Boolean);
  const style: Record<string, unknown> = {};

  for (const c of classes) {
    // Arbitrary values: w-[100px], min-h-[40px], max-h-[80], etc.
    const arbMatch = c.match(/^(min-h|max-h|min-w|max-w|w|h|top|left|right|bottom)-\[(.+)\]$/);
    if (arbMatch) {
      const [, prop, value] = arbMatch;
      const num = value.endsWith("px") ? parsePx(value) : parseInt(value, 10);
      const isPct = value.endsWith("%");
      if (prop === "min-h") style.minHeight = isPct || Number.isNaN(num) ? value : num;
      else if (prop === "max-h") style.maxHeight = isPct || Number.isNaN(num) ? value : num;
      else if (prop === "min-w") style.minWidth = isPct || Number.isNaN(num) ? value : num;
      else if (prop === "max-w") style.maxWidth = isPct || Number.isNaN(num) ? value : num;
      else if (prop === "w") style.width = isPct || Number.isNaN(num) ? value : num;
      else if (prop === "h") style.height = isPct || Number.isNaN(num) ? value : num;
      continue;
    }

    // Flex
    if (c === "flex-1") { style.flex = 1; continue; }
    if (c.match(/^flex-\[(.+)\]$/)) {
      const raw = c.replace(/^flex-\[|\]$/g, "");
      const flexValue = Number(raw);
      if (Number.isFinite(flexValue)) style.flex = flexValue;
      continue;
    }
    if (c === "flex-row") { style.flexDirection = "row"; continue; }
    if (c === "flex-col") { style.flexDirection = "column"; continue; }
    if (c === "flex-wrap") { style.flexWrap = "wrap"; continue; }
    if (c === "flex-row-reverse") { style.flexDirection = "row-reverse"; continue; }

    // Align / justify
    if (c === "items-center") { style.alignItems = "center"; continue; }
    if (c === "items-start") { style.alignItems = "flex-start"; continue; }
    if (c === "items-end") { style.alignItems = "flex-end"; continue; }
    if (c === "items-stretch") { style.alignItems = "stretch"; continue; }
    if (c === "justify-center") { style.justifyContent = "center"; continue; }
    if (c === "justify-between") { style.justifyContent = "space-between"; continue; }
    if (c === "justify-end") { style.justifyContent = "flex-end"; continue; }
    if (c === "justify-start") { style.justifyContent = "flex-start"; continue; }
    if (c === "self-start") { style.alignSelf = "flex-start"; continue; }
    if (c === "self-end") { style.alignSelf = "flex-end"; continue; }
    if (c === "self-center") { style.alignSelf = "center"; continue; }

    // Padding
    const pMatch = c.match(/^p(?:x|y|t|b|l|r)?-(\d+(?:\.\d+)?)$/);
    if (pMatch) {
      const v = getSpace(pMatch[1]);
      if (c.startsWith("px-")) style.paddingHorizontal = v;
      else if (c.startsWith("py-")) style.paddingVertical = v;
      else if (c.startsWith("pt-")) style.paddingTop = v;
      else if (c.startsWith("pb-")) style.paddingBottom = v;
      else if (c.startsWith("pl-")) style.paddingLeft = v;
      else if (c.startsWith("pr-")) style.paddingRight = v;
      else style.padding = v;
      continue;
    }

    // Margin
    const mMatch = c.match(/^m(?:x|y|t|b|l|r)?-(\d+(?:\.\d+)?)$/);
    if (mMatch) {
      const v = getSpace(mMatch[1]);
      if (c.startsWith("mx-")) style.marginHorizontal = v;
      else if (c.startsWith("my-")) style.marginVertical = v;
      else if (c.startsWith("mt-")) style.marginTop = v;
      else if (c.startsWith("mb-")) style.marginBottom = v;
      else if (c.startsWith("ml-")) style.marginLeft = v;
      else if (c.startsWith("mr-")) style.marginRight = v;
      else style.margin = v;
      continue;
    }

    // Gap
    const gMatch = c.match(/^gap-(\d+(?:\.\d+)?)$/);
    if (gMatch) { style.gap = getSpace(gMatch[1]); continue; }

    // Width — Tailwind rem-scale tokens (must run before numeric w-* which would treat w-80 as 80px)
    if (c === "w-72") { style.width = 288; continue; }
    if (c === "w-80") { style.width = 320; continue; }
    if (c === "w-96") { style.width = 384; continue; }

    // Width / height (fixed)
    const whMatch = c.match(/^(w|h)-(\d+(?:\.\d+)?)$/);
    if (whMatch) {
      const v = getSpace(whMatch[2]);
      if (whMatch[1] === "w") style.width = v;
      else style.height = v;
      continue;
    }
    if (c === "w-full") { style.width = "100%"; continue; }
    if (c === "max-w-sm") { style.maxWidth = 384; continue; }
    if (c === "min-w-0") { style.minWidth = 0; continue; }

    // Position
    if (c === "absolute") { style.position = "absolute"; continue; }
    if (c === "relative") { style.position = "relative"; continue; }
    if (c === "inset-0") {
      style.position = "absolute";
      style.top = 0;
      style.right = 0;
      style.bottom = 0;
      style.left = 0;
      continue;
    }
    const posMatch = c.match(/^(-?)(top|right|bottom|left)-(\d+(?:\.\d+)?)$/);
    if (posMatch) {
      const val = getSpace(posMatch[3]);
      const v = posMatch[1] === "-" ? -val : val;
      if (posMatch[2] === "top") style.top = v;
      else if (posMatch[2] === "right") style.right = v;
      else if (posMatch[2] === "bottom") style.bottom = v;
      else style.left = v;
      continue;
    }

    // Border width (no colour)
    if (c === "border") { style.borderWidth = 1; continue; }
    if (c === "border-2") { style.borderWidth = 2; continue; }
    if (c === "border-t") { style.borderTopWidth = 1; continue; }
    if (c === "border-b") { style.borderBottomWidth = 1; continue; }
    if (c === "border-l") { style.borderLeftWidth = 1; continue; }
    if (c === "border-r") { style.borderRightWidth = 1; continue; }

    // Border colour (curated map first)
    if (c.startsWith("border-")) {
      const direct = COLOR_MAP[c];
      if (direct) {
        // Default to 1 unless an explicit width was set on a side
        if (
          style.borderWidth === undefined &&
          style.borderTopWidth === undefined &&
          style.borderBottomWidth === undefined &&
          style.borderLeftWidth === undefined &&
          style.borderRightWidth === undefined
        ) {
          style.borderWidth = 1;
        }
        if (!style.borderColor) style.borderColor = direct;
        continue;
      }
      const primary = resolvePrimaryColor(c);
      if (primary) {
        if (
          style.borderWidth === undefined &&
          style.borderTopWidth === undefined &&
          style.borderBottomWidth === undefined &&
          style.borderLeftWidth === undefined &&
          style.borderRightWidth === undefined
        ) {
          style.borderWidth = 1;
        }
        if (!style.borderColor) {
          if (c.startsWith("border-t-")) style.borderTopColor = primary;
          else if (c.startsWith("border-b-")) style.borderBottomColor = primary;
          else if (c.startsWith("border-l-")) style.borderLeftColor = primary;
          else if (c.startsWith("border-r-")) style.borderRightColor = primary;
          else style.borderColor = primary;
        }
        continue;
      }
      const palette = resolvePaletteColor(c);
      if (palette) {
        if (
          style.borderWidth === undefined &&
          style.borderTopWidth === undefined &&
          style.borderBottomWidth === undefined &&
          style.borderLeftWidth === undefined &&
          style.borderRightWidth === undefined
        ) {
          style.borderWidth = 1;
        }
        if (!style.borderColor) {
          // Honour `border-t-`/`border-b-`/`border-l-`/`border-r-` colour tokens
          if (c.startsWith("border-t-")) style.borderTopColor = palette;
          else if (c.startsWith("border-b-")) style.borderBottomColor = palette;
          else if (c.startsWith("border-l-")) style.borderLeftColor = palette;
          else if (c.startsWith("border-r-")) style.borderRightColor = palette;
          else style.borderColor = palette;
        }
        continue;
      }
    }
    if (c === "border-dashed") { style.borderStyle = "dashed"; continue; }

    // Rounded
    if (c === "rounded") style.borderRadius = 4;
    else if (c === "rounded-md") style.borderRadius = 6;
    else if (c === "rounded-lg") style.borderRadius = 8;
    else if (c === "rounded-xl") style.borderRadius = 12;
    else if (c === "rounded-2xl") style.borderRadius = 16;
    else if (c === "rounded-3xl") style.borderRadius = 24;
    else if (c === "rounded-full") style.borderRadius = 9999;
    else if (c === "rounded-t-md") {
      style.borderTopLeftRadius = 6;
      style.borderTopRightRadius = 6;
    } else if (c === "rounded-t-2xl") {
      style.borderTopLeftRadius = 16;
      style.borderTopRightRadius = 16;
    } else if (c === "rounded-t-xl") {
      style.borderTopLeftRadius = 12;
      style.borderTopRightRadius = 12;
    } else if (c === "rounded-t-3xl") {
      style.borderTopLeftRadius = 24;
      style.borderTopRightRadius = 24;
    } else if (c.match(/^rounded-\[(.+)\]$/)) {
      const value = c.replace(/^rounded-\[|\]$/g, "");
      const radius = parseCssLength(value);
      if (typeof radius === "number") style.borderRadius = radius;
    } else if (c.match(/^rounded-/)) {
      const rMatch = c.match(/rounded-(\d+)/);
      if (rMatch) style.borderRadius = getSpace(rMatch[1]);
    }

    // Text colour: curated map first, then standard palette
    if (c.startsWith("text-")) {
      const textColor = COLOR_MAP[c];
      if (textColor) {
        style.color = textColor;
        continue;
      }
      const primary = resolvePrimaryColor(c);
      if (primary) {
        style.color = primary;
        continue;
      }
      const palette = resolvePaletteColor(c);
      if (palette) {
        style.color = palette;
        continue;
      }
    }

    // Background colour (including opacity: bg-black/40, bg-primary/10, etc.)
    if (c.startsWith("bg-") && !c.includes("[")) {
      const bgSlash = c.match(/^bg-(black|white)\/(\d+)$/);
      if (bgSlash) {
        const opacity = parseInt(bgSlash[2], 10) / 100;
        style.backgroundColor = bgSlash[1] === "black" ? `rgba(0,0,0,${opacity})` : `rgba(255,255,255,${opacity})`;
        continue;
      }
      const bgColor = COLOR_MAP[c];
      if (bgColor) {
        style.backgroundColor = bgColor;
        continue;
      }
      const primary = resolvePrimaryColor(c);
      if (primary) {
        style.backgroundColor = primary;
        continue;
      }
      const grayKey = c.replace("bg-gray-", "");
      if (grayKey in GRAY) {
        style.backgroundColor = (GRAY as Record<string, string>)[grayKey];
        continue;
      }
      const palette = resolvePaletteColor(c);
      if (palette) {
        style.backgroundColor = palette;
        continue;
      }
    }

    // Font
    if (c === "font-normal") style.fontWeight = "400";
    else if (c === "font-medium") style.fontWeight = "500";
    else if (c === "font-semibold") style.fontWeight = "600";
    else if (c === "font-bold") style.fontWeight = "700";
    else if (c === "text-xs") style.fontSize = 12;
    else if (c === "text-sm") style.fontSize = 14;
    else if (c === "text-base") style.fontSize = 16;
    else if (c === "text-lg") style.fontSize = 18;
    else if (c === "text-2xl") style.fontSize = 24;
    else if (c.match(/^text-\[(\d+)px\]$/)) style.fontSize = parseInt(c.replace(/\D/g, ""), 10);
    else if (c === "text-center") style.textAlign = "center";
    else if (c === "uppercase") style.textTransform = "uppercase";
    else if (c === "capitalize") style.textTransform = "capitalize";
    else if (c === "font-mono") style.fontFamily = "monospace";
    else if (c === "tracking-wide") style.letterSpacing = 1;
    else if (c === "tracking-wider") style.letterSpacing = 2;
    else if (c.match(/^tracking-\[(.+)\]$/)) {
      const val = c.replace(/^tracking-\[|\]$/g, "");
      const n = val.endsWith("px") ? parsePx(val) : parseFloat(val);
      if (!Number.isNaN(n)) style.letterSpacing = n;
    }
    if (c === "leading-relaxed") style.lineHeight = 24;
    else if (c.match(/^leading-\[(.+)\]$/)) {
      const val = c.replace(/^leading-\[|\]$/g, "");
      const lineHeight = parseCssLength(val);
      if (typeof lineHeight === "number") style.lineHeight = lineHeight;
    } else if (c.match(/^leading-(\d+)$/)) {
      const n = parseFloat(c.replace("leading-", ""));
      if (Number.isFinite(n)) style.lineHeight = n * 4;
    }

    // Shadow (RN: shadowColor, shadowOffset, shadowOpacity, shadowRadius)
    if (c === "shadow") {
      style.shadowColor = "#000";
      style.shadowOffset = { width: 0, height: 1 };
      style.shadowOpacity = 0.05;
      style.shadowRadius = 2;
    } else if (c === "shadow-sm") {
      style.shadowColor = "#000";
      style.shadowOffset = { width: 0, height: 1 };
      style.shadowOpacity = 0.04;
      style.shadowRadius = 1;
    } else if (c === "shadow-md") {
      style.shadowColor = "#000";
      style.shadowOffset = { width: 0, height: 2 };
      style.shadowOpacity = 0.08;
      style.shadowRadius = 4;
    } else if (c === "shadow-lg") {
      style.shadowColor = "#000";
      style.shadowOffset = { width: 0, height: 4 };
      style.shadowOpacity = 0.1;
      style.shadowRadius = 8;
    }

    // Opacity / overflow
    if (c === "opacity-50") style.opacity = 0.5;
    if (c === "opacity-60") style.opacity = 0.6;
    if (c === "opacity-70") style.opacity = 0.7;
    if (c === "opacity-80") style.opacity = 0.8;
    if (c === "overflow-hidden") style.overflow = "hidden";

    // Special: last:border-b-0 is not applicable in RN (we use index in list). Skip.
    if (c.startsWith("last:") || c.startsWith("active:") || c.startsWith("disabled:")) continue;
  }

  return style as ViewStyle & TextStyle;
}
