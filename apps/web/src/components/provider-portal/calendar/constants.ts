export const HOUR_HEIGHT = 60;
export const TIME_COLUMN_WIDTH = 70;
export const UNASSIGNED_ID = "__unassigned__";
export const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export const SERVICE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  haircut: { bg: "#7dd3d8", border: "#5fc4c9", text: "#1a3a4a" },
  cut: { bg: "#7dd3d8", border: "#5fc4c9", text: "#1a3a4a" },
  color: { bg: "#f8d59f", border: "#e8c57a", text: "#6b5520" },
  highlight: { bg: "#ffe0b2", border: "#ffca80", text: "#6b4520" },
  balayage: { bg: "#f8bbd0", border: "#f48fb1", text: "#6a2c4a" },
  process: { bg: "#f8bbd0", border: "#f48fb1", text: "#6a2c4a" },
  double: { bg: "#f8bbd0", border: "#f48fb1", text: "#6a2c4a" },
  single: { bg: "#c8e6c9", border: "#a5d6a7", text: "#2e5a2f" },
  facial: { bg: "#e0e0e0", border: "#bdbdbd", text: "#424242" },
  manicure: { bg: "#b3e0f2", border: "#81c7e8", text: "#1a4a5a" },
  pedicure: { bg: "#b3e0f2", border: "#81c7e8", text: "#1a4a5a" },
  nail: { bg: "#b3e0f2", border: "#81c7e8", text: "#1a4a5a" },
  massage: { bg: "#c8e6c9", border: "#a5d6a7", text: "#2e5a2f" },
  wax: { bg: "#ffccbc", border: "#ffab91", text: "#5a3020" },
  brow: { bg: "#d7ccc8", border: "#bcaaa4", text: "#4e342e" },
  lash: { bg: "#d7ccc8", border: "#bcaaa4", text: "#4e342e" },
  correction: { bg: "#b3d1f2", border: "#81aee8", text: "#1a3a5a" },
  treatment: { bg: "#ce93d8", border: "#ba68c8", text: "#4a148c" },
  refresh: { bg: "#80deea", border: "#4dd0e1", text: "#006064" },
  signature: { bg: "#ffab91", border: "#ff8a65", text: "#bf360c" },
  conditioning: { bg: "#a5d6a7", border: "#81c784", text: "#1b5e20" },
  blowout: { bg: "#b0bec5", border: "#90a4ae", text: "#37474f" },
  default: { bg: "#e8e8e8", border: "#d0d0d0", text: "#424242" },
};

const STAFF_GRADIENTS = [
  { from: "#FF0077", to: "#FF6B35" },
  { from: "#7C3AED", to: "#A855F7" },
  { from: "#0891B2", to: "#06B6D4" },
  { from: "#059669", to: "#10B981" },
  { from: "#D946EF", to: "#F472B6" },
  { from: "#F59E0B", to: "#FBBF24" },
  { from: "#6366F1", to: "#818CF8" },
  { from: "#EC4899", to: "#F472B6" },
];

export function getStaffColor(index: number) {
  return STAFF_GRADIENTS[index % STAFF_GRADIENTS.length];
}
