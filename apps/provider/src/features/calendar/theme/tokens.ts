/**
 * Calendar v2 design tokens — warm neutral surfaces + brand accent.
 */
import { Colors } from "@/constants/colors";

export const CALENDAR_BG = "#FAFAF8";
export const CALENDAR_SURFACE = Colors.white;
export const CALENDAR_DARK_HEADER = "#1a1f3c";
export const CALENDAR_ACCENT = "#4fd1c5";
export const CALENDAR_ACCENT_PRESSED = "#2DD4BF";

export type StatusColorTriple = { bg: string; border: string; text: string };

/** Mirrors legacy calendar.tsx palettes for parity */
export const STATUS_COLORS: Record<string, StatusColorTriple> = {
  confirmed: { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  pending: { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
  unconfirmed: { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
  booked: { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
  waiting: { bg: "#fef3c7", border: "#d97706", text: "#78350f" },
  checked_in: { bg: "#e0f2fe", border: "#0284c7", text: "#075985" },
  in_progress: { bg: "#fdf2f8", border: "#ec4899", text: "#831843" },
  started: { bg: "#fdf2f8", border: "#ec4899", text: "#831843" },
  completed: { bg: Colors.gray[100], border: Colors.gray[400], text: Colors.gray[600] },
  cancelled: { bg: Colors.gray[100], border: Colors.gray[300], text: Colors.gray[400] },
  no_show: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
};

export const SERVICE_COLOR_MAP: [string[], StatusColorTriple][] = [
  [["haircut", "cut", "trim"], { bg: "#ecfeff", border: "#06b6d4", text: "#164e63" }],
  [["color", "colour", "dye"], { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" }],
  [["highlight", "foil"], { bg: "#fefce8", border: "#facc15", text: "#854d0e" }],
  [["balayage", "ombre"], { bg: "#fdf2f8", border: "#f472b6", text: "#831843" }],
  [["facial", "face"], { bg: Colors.gray[100], border: Colors.gray[500], text: Colors.gray[800] }],
  [["manicure", "pedicure", "nail"], { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a8a" }],
  [["massage", "body"], { bg: "#f0fdf4", border: "#22c55e", text: "#14532d" }],
  [["wax"], { bg: "#fff7ed", border: "#fb923c", text: "#9a3412" }],
  [["brow", "lash", "eye"], { bg: "#fafaf9", border: "#78716c", text: "#292524" }],
  [["treatment", "therapy"], { bg: "#f5f3ff", border: "#8b5cf6", text: "#4c1d95" }],
];

export const TEAM_COLORS: StatusColorTriple[] = [
  { bg: "#eef2ff", border: "#6366f1", text: "#312e81" },
  { bg: "#ecfdf5", border: "#10b981", text: "#064e3b" },
  { bg: "#fff1f2", border: "#f43f5e", text: "#9f1239" },
  { bg: "#f0f9ff", border: "#0ea5e9", text: "#0c4a6e" },
  { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
  { bg: "#f5f3ff", border: "#8b5cf6", text: "#4c1d95" },
  { bg: "#f0fdfa", border: "#14b8a6", text: "#134e4a" },
  { bg: "#fdf4ff", border: "#d946ef", text: "#701a75" },
];
