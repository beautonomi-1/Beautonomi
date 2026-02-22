/**
 * Scheduler Styles
 * 
 * Mangomint/Fresha-inspired style tokens and utilities.
 * Centralized styling configuration for consistent calendar appearance.
 */

/**
 * Mangomint-inspired color palette for services
 */
export const SERVICE_COLORS = {
  // Hair Services
  haircut: {
    bg: "#7dd3d8",
    border: "#5fc4c9",
    text: "#1a3a4a",
    name: "Cyan",
  },
  cut: {
    bg: "#7dd3d8",
    border: "#5fc4c9",
    text: "#1a3a4a",
    name: "Cyan",
  },
  color: {
    bg: "#f8d59f",
    border: "#e8c57a",
    text: "#6b5520",
    name: "Gold",
  },
  highlight: {
    bg: "#ffe0b2",
    border: "#ffca80",
    text: "#6b4520",
    name: "Peach",
  },
  balayage: {
    bg: "#f8bbd0",
    border: "#f48fb1",
    text: "#6a2c4a",
    name: "Pink",
  },
  
  // Treatments
  treatment: {
    bg: "#ce93d8",
    border: "#ba68c8",
    text: "#4a148c",
    name: "Purple",
  },
  conditioning: {
    bg: "#a5d6a7",
    border: "#81c784",
    text: "#1b5e20",
    name: "Green",
  },
  
  // Styling
  blowout: {
    bg: "#b0bec5",
    border: "#90a4ae",
    text: "#37474f",
    name: "Gray-Blue",
  },
  
  // Nails
  manicure: {
    bg: "#b3e0f2",
    border: "#81c7e8",
    text: "#1a4a5a",
    name: "Sky Blue",
  },
  pedicure: {
    bg: "#b3e0f2",
    border: "#81c7e8",
    text: "#1a4a5a",
    name: "Sky Blue",
  },
  nail: {
    bg: "#b3e0f2",
    border: "#81c7e8",
    text: "#1a4a5a",
    name: "Sky Blue",
  },
  
  // Skin
  facial: {
    bg: "#e0e0e0",
    border: "#bdbdbd",
    text: "#424242",
    name: "Gray",
  },
  wax: {
    bg: "#ffccbc",
    border: "#ffab91",
    text: "#5a3020",
    name: "Coral",
  },
  
  // Brows & Lashes
  brow: {
    bg: "#d7ccc8",
    border: "#bcaaa4",
    text: "#4e342e",
    name: "Taupe",
  },
  lash: {
    bg: "#d7ccc8",
    border: "#bcaaa4",
    text: "#4e342e",
    name: "Taupe",
  },
  
  // Massage
  massage: {
    bg: "#c8e6c9",
    border: "#a5d6a7",
    text: "#2e5a2f",
    name: "Light Green",
  },
  
  // Special
  signature: {
    bg: "#ffab91",
    border: "#ff8a65",
    text: "#bf360c",
    name: "Orange",
  },
  refresh: {
    bg: "#80deea",
    border: "#4dd0e1",
    text: "#006064",
    name: "Turquoise",
  },
  correction: {
    bg: "#b3d1f2",
    border: "#81aee8",
    text: "#1a3a5a",
    name: "Blue",
  },
  
  // Default
  default: {
    bg: "#e8e8e8",
    border: "#d0d0d0",
    text: "#424242",
    name: "Gray",
  },
} as const;

/**
 * Status colors (Mangomint-inspired)
 */
export const STATUS_COLORS = {
  booked: {
    bg: "#d1fae5",
    border: "#10b981",
    text: "#065f46",
    badge: "bg-emerald-100 text-emerald-700",
    name: "Confirmed",
  },
  pending: {
    bg: "#fef3c7",
    border: "#f59e0b",
    text: "#92400e",
    badge: "bg-amber-100 text-amber-700",
    name: "Unconfirmed",
  },
  started: {
    bg: "#fce7f3",
    border: "#ec4899",
    text: "#831843",
    badge: "bg-pink-100 text-pink-700",
    name: "In Service",
  },
  completed: {
    bg: "#d1fae5",
    border: "#10b981",
    text: "#065f46",
    badge: "bg-green-100 text-green-700",
    name: "Completed",
  },
  cancelled: {
    bg: "#f3f4f6",
    border: "#9ca3af",
    text: "#4b5563",
    badge: "bg-gray-100 text-gray-700",
    name: "Cancelled",
  },
  no_show: {
    bg: "#fee2e2",
    border: "#f87171",
    text: "#991b1b",
    badge: "bg-red-100 text-red-700",
    name: "No Show",
  },
} as const;

/**
 * Calendar grid styling
 */
export const GRID_STYLES = {
  hourHeight: 60, // pixels per hour
  timeColumnWidth: 70, // pixels for time labels
  minColumnWidth: 150, // minimum width for staff columns
  borderColor: "#e5e7eb",
  headerBg: "linear-gradient(to right, #1a1f3c, #252a4a)",
  nowLineColor: "#ef4444",
  nowLineShadow: "0 0 8px rgba(239, 68, 68, 0.5)",
} as const;

/**
 * Appointment card styling
 */
export const CARD_STYLES = {
  borderRadius: "6px",
  borderWidth: "2px",
  padding: {
    compact: "4px 8px",
    normal: "8px 12px",
    spacious: "12px 16px",
  },
  shadow: {
    default: "0 1px 3px rgba(0, 0, 0, 0.1)",
    hover: "0 4px 12px rgba(0, 0, 0, 0.15)",
    dragging: "0 8px 24px rgba(0, 0, 0, 0.2)",
  },
  fontSize: {
    compact: "11px",
    normal: "13px",
    spacious: "14px",
  },
} as const;

/**
 * Animation durations
 */
export const ANIMATIONS = {
  fast: "150ms",
  normal: "250ms",
  slow: "350ms",
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/**
 * Responsive breakpoints
 */
export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
} as const;

/**
 * Z-index layers
 */
export const Z_INDEX = {
  base: 1,
  appointment: 10,
  appointmentHover: 20,
  appointmentDragging: 30,
  timeBlock: 5,
  nowLine: 15,
  header: 40,
  sidebar: 50,
  modal: 100,
  toast: 200,
} as const;

/**
 * Get service color by keyword matching
 */
export function getServiceColorByName(serviceName: string) {
  const lowerName = serviceName.toLowerCase();
  
  for (const [keyword, colors] of Object.entries(SERVICE_COLORS)) {
    if (lowerName.includes(keyword)) {
      return colors;
    }
  }
  
  return SERVICE_COLORS.default;
}

/**
 * Get status color
 */
export function getStatusColor(status: string) {
  return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.booked;
}

/**
 * Generate appointment card classes
 */
export function getAppointmentCardClasses(
  isHovered: boolean = false,
  isDragging: boolean = false,
  isSelected: boolean = false,
  compactMode: boolean = false
): string {
  const classes = [
    "absolute",
    "left-0",
    "right-0",
    "overflow-hidden",
    "cursor-pointer",
    "transition-all",
    "duration-200",
  ];
  
  if (isHovered) {
    classes.push("ring-2", "ring-blue-500", "ring-opacity-50");
  }
  
  if (isDragging) {
    classes.push("opacity-70", "scale-105");
  }
  
  if (isSelected) {
    classes.push("ring-2", "ring-blue-600");
  }
  
  if (compactMode) {
    classes.push("text-xs");
  }
  
  return classes.join(" ");
}

/**
 * Generate time block classes
 */
export function getTimeBlockClasses(
  type: "break" | "lunch" | "time_off" | "holiday" | "blocked" | "custom",
  pattern: "solid" | "striped" | "dotted" = "striped"
): string {
  const classes = [
    "absolute",
    "left-0",
    "right-0",
    "overflow-hidden",
    "pointer-events-auto",
    "cursor-pointer",
  ];
  
  if (pattern === "striped") {
    classes.push("bg-stripes");
  } else if (pattern === "dotted") {
    classes.push("bg-dots");
  }
  
  return classes.join(" ");
}

/**
 * Generate grid cell classes
 */
export function getGridCellClasses(
  isToday: boolean = false,
  isWeekend: boolean = false,
  isCurrentHour: boolean = false
): string {
  const classes = [
    "border-b",
    "border-r",
    "border-gray-200",
    "relative",
  ];
  
  if (isToday) {
    classes.push("bg-blue-50/30");
  }
  
  if (isWeekend) {
    classes.push("bg-gray-50/50");
  }
  
  if (isCurrentHour) {
    classes.push("bg-yellow-50/30");
  }
  
  return classes.join(" ");
}

/**
 * Get responsive column width
 */
export function getColumnWidth(
  staffCount: number,
  containerWidth: number,
  view: "day" | "week" | "3-days"
): number {
  if (view === "day") {
    // In day view, divide available width among staff
    const availableWidth = containerWidth - GRID_STYLES.timeColumnWidth;
    const columnWidth = availableWidth / staffCount;
    return Math.max(columnWidth, GRID_STYLES.minColumnWidth);
  } else {
    // In week view, fixed width per day
    return GRID_STYLES.minColumnWidth;
  }
}

/**
 * Calculate appointment top position
 */
export function calculateAppointmentTop(
  startTime: string,
  startHour: number
): number {
  const [hour, min] = startTime.split(":").map(Number);
  const hourOffset = hour - startHour;
  const minuteOffset = min / 60;
  return (hourOffset + minuteOffset) * GRID_STYLES.hourHeight;
}

/**
 * Calculate appointment height
 */
export function calculateAppointmentHeight(durationMinutes: number): number {
  return (durationMinutes / 60) * GRID_STYLES.hourHeight;
}

/**
 * Check if time is within working hours
 */
export function isWithinWorkingHours(
  time: string,
  startHour: number,
  endHour: number
): boolean {
  const [hour] = time.split(":").map(Number);
  return hour >= startHour && hour < endHour;
}
