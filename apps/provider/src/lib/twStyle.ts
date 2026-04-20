/**
 * Runtime Tailwind-like class string → React Native style.
 * Use for automated migration: replace className="..." with style={twStyle("...")}.
 * Matches Tailwind spacing (4px scale), Colors, and common utilities so native layout works.
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
  // red
  "bg-red-50": "#FEF2F2",
  "bg-red-100": "#FEE2E2",
  "bg-red-200": "#FECACA",
  "bg-red-400": "#F87171",
  "bg-red-500": "#EF4444",
  "bg-red-600": "#DC2626",
  "text-red-500": "#EF4444",
  "text-red-600": "#DC2626",
  "text-red-700": "#B91C1C",
  "text-red-800": "#991B1B",
  "border-red-100": "#FEE2E2",
  "border-red-200": "#FECACA",
  "border-red-400": "#F87171",
  "border-red-500": "#EF4444",
  // green
  "bg-green-50": "#DCFCE7",
  "bg-green-100": "#DCFCE7",
  "bg-green-500": "#22C55E",
  "bg-green-600": "#16A34A",
  "text-green-600": "#16A34A",
  "text-green-700": "#15803D",
  "text-green-800": "#166534",
  "border-green-100": "#DCFCE7",
  // amber
  "bg-amber-50": "#FFFBEB",
  "bg-amber-100": "#FEF3C7",
  "bg-amber-500": "#F59E0B",
  "text-amber-700": "#B45309",
  "text-amber-800": "#92400E",
  "border-amber-100": "#FEF3C7",
  "border-amber-200": "#FDE68A",
  // indigo
  "bg-indigo-50": "#EEF2FF",
  "bg-indigo-100": "#E0E7FF",
  "bg-indigo-600": "#4F46E5",
  "text-indigo-600": "#4F46E5",
  "text-indigo-700": "#4338CA",
  "border-indigo-200": "#C7D2FE",
  "border-indigo-300": "#A5B4FC",
  // violet / purple
  "bg-violet-50": "#F5F3FF",
  "bg-violet-100": "#EDE9FE",
  "bg-violet-200": "#C4B5FD",
  "text-violet-700": "#6D28D9",
  "border-violet-200": "#C4B5FD",
  "border-violet-300": "#C4B5FD",
  // pink
  "bg-pink-50": "#FDF2F8",
  "bg-pink-100": "#FCE7F3",
  "text-pink-700": "#BE185D",
  "text-pink-800": "#9D174D",
  "border-pink-100": "#FCE7F3",
  // blue
  "bg-blue-50": "#EFF6FF",
  "bg-blue-100": "#DBEAFE",
  "text-blue-700": "#1D4ED8",
  "border-blue-200": "#BFDBFE",
  // sky
  "bg-sky-50": "#F0F9FF",
  "bg-sky-100": "#E0F2FE",
  // teal
  "bg-teal-50": "#F0FDFA",
  "bg-teal-100": "#CCFBF1",
  "text-teal-700": "#0F766E",
  // emerald
  "bg-emerald-50": "#ECFDF5",
  "bg-emerald-100": "#D1FAE5",
  "text-emerald-600": "#059669",
  "border-emerald-100": "#A7F3D0",
  // rose
  "bg-rose-50": "#FFF1F2",
  "text-rose-700": "#BE123C",
  // cyan
  "bg-cyan-50": "#ECFEFF",
  // purple
  "bg-purple-50": "#FAF5FF",
  "bg-purple-100": "#F3E8FF",
  "text-purple-700": "#7E22CE",
};

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
  return SPACE[key] ?? parsePx(key) ?? 0;
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
      if (prop === "min-h") style.minHeight = Number.isNaN(num) ? value : num;
      else if (prop === "max-h") style.maxHeight = Number.isNaN(num) ? value : num;
      else if (prop === "min-w") style.minWidth = isPct || Number.isNaN(num) ? value : num;
      else if (prop === "max-w") style.maxWidth = isPct || Number.isNaN(num) ? value : num;
      else if (prop === "w") style.width = isPct || Number.isNaN(num) ? value : num;
      else if (prop === "h") style.height = isPct || Number.isNaN(num) ? value : num;
      continue;
    }

    // Flex
    if (c === "flex-1") { style.flex = 1; continue; }
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

    // Border
    if (c === "border") { style.borderWidth = 1; continue; }
    if (c === "border-2") { style.borderWidth = 2; continue; }
    if (c === "border-t") { style.borderTopWidth = 1; continue; }
    if (c === "border-b") { style.borderBottomWidth = 1; continue; }
    if (c === "border-l") { style.borderLeftWidth = 1; continue; }
    if (c === "border-r") { style.borderRightWidth = 1; continue; }
    const bMatch = c.match(/^border(?:t|b|l|r)?-(?:gray|red|amber|indigo|violet|pink|blue|green|white|black)-(\d+)$/);
    if (bMatch) {
      const colorKey = c.replace(/^border(?:t|b|l|r)?-/, "border-");
      const color = COLOR_MAP[colorKey];
      if (color) {
        if (c.includes("border-t-")) style.borderTopWidth = 1;
        else if (c.includes("border-b-")) style.borderBottomWidth = 1;
        else if (c.includes("border-l-")) style.borderLeftWidth = 1;
        else if (c.includes("border-r-")) style.borderRightWidth = 1;
        else style.borderWidth = 1;
        if (!style.borderColor) style.borderColor = color;
      }
      continue;
    }
    if (c === "border-dashed") { style.borderStyle = "dashed"; continue; }

    // Rounded
    if (c === "rounded") style.borderRadius = 4;
    else if (c === "rounded-md") style.borderRadius = 6;
    else if (c === "rounded-lg") style.borderRadius = 8;
    else if (c === "rounded-xl") style.borderRadius = 12;
    else if (c === "rounded-2xl") style.borderRadius = 16;
    else if (c === "rounded-full") style.borderRadius = 9999;
    else if (c === "rounded-t-md") {
      style.borderTopLeftRadius = 6;
      style.borderTopRightRadius = 6;
    } else if (c === "rounded-t-2xl") {
      style.borderTopLeftRadius = 16;
      style.borderTopRightRadius = 16;
    } else if (c.match(/^rounded-/)) {
      const rMatch = c.match(/rounded-(\d+)/);
      if (rMatch) style.borderRadius = getSpace(rMatch[1]);
    }

    // Text color (check before bg so we don't set backgroundColor for text-*)
    if (c.startsWith("text-")) {
      const textColor = COLOR_MAP[c];
      if (textColor) {
        style.color = textColor;
        continue;
      }
    }

    // Background color (including opacity: bg-black/40, bg-primary/10, etc.)
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
      const grayKey = c.replace("bg-gray-", "");
      if (grayKey in GRAY) {
        style.backgroundColor = (GRAY as Record<string, string>)[grayKey];
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

    // Shadow (RN: shadowColor, shadowOffset, shadowOpacity, shadowRadius)
    if (c === "shadow") {
      style.shadowColor = "#000";
      style.shadowOffset = { width: 0, height: 1 };
      style.shadowOpacity = 0.05;
      style.shadowRadius = 2;
    } else if (c === "shadow-lg") {
      style.shadowColor = "#000";
      style.shadowOffset = { width: 0, height: 4 };
      style.shadowOpacity = 0.1;
      style.shadowRadius = 8;
    }

    // Opacity / overflow
    if (c === "opacity-60") style.opacity = 0.6;
    if (c === "overflow-hidden") style.overflow = "hidden";

    // Special: last:border-b-0 is not applicable in RN (we use index in list). Skip.
    if (c.startsWith("last:") || c.startsWith("active:") || c.startsWith("disabled:")) continue;
  }

  return style as ViewStyle & TextStyle;
}
