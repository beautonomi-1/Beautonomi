/**
 * Visual Mapping System for Mangomint-style Calendar
 * 
 * Provides consistent color schemes, patterns, and icons
 * for appointment statuses, block types, and metadata flags.
 * 
 * @module lib/scheduling/visualMapping
 */

import { AppointmentStatus, AppointmentKind, SegmentKind, BlockKind } from "./mangomintAdapter";
import type { AppointmentIconFlags } from "./mangomintAdapter";

// ============================================================================
// CSS VARIABLES - Define these in your global CSS
// ============================================================================

/**
 * CSS Variable names for theming.
 * Add these to your globals.css or tailwind config.
 * 
 * :root {
 *   --status-unconfirmed: #FEC89A;
 *   --status-unconfirmed-text: #9D4E00;
 *   --status-confirmed: #93C5FD;
 *   --status-confirmed-text: #1E40AF;
 *   --status-waiting: #C4B5FD;
 *   --status-waiting-text: #5B21B6;
 *   --status-in-service: #F9A8D4;
 *   --status-in-service-text: #9D174D;
 *   --status-completed: #9CA3AF;
 *   --status-completed-text: #374151;
 *   --status-canceled: #D1D5DB;
 *   --status-canceled-text: #6B7280;
 *   --status-no-show: #FCA5A5;
 *   --status-no-show-text: #991B1B;
 *   
 *   --segment-service: transparent;
 *   --segment-buffer: transparent;
 *   --segment-processing: rgba(0,0,0,0.1);
 *   --segment-finishing: rgba(255,255,255,0.3);
 *   --segment-travel: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px);
 *   
 *   --block-time: #9CA3AF;
 *   --block-travel: #60A5FA;
 *   
 *   --calendar-working-bg: #FFFFFF;
 *   --calendar-non-working-bg: #F3F4F6;
 *   --calendar-now-line: #EF4444;
 * }
 * 
 * .high-contrast {
 *   --calendar-non-working-bg: #1F2937;
 *   --status-unconfirmed: #FB923C;
 *   --status-confirmed: #60A5FA;
 *   --status-waiting: #A78BFA;
 *   --status-in-service: #F472B6;
 *   --status-completed: #6B7280;
 *   --status-canceled: #4B5563;
 *   --status-no-show: #F87171;
 * }
 */

// ============================================================================
// STATUS COLORS
// ============================================================================

export interface StatusColorConfig {
  /** Background color */
  bg: string;
  /** Border/accent color */
  border: string;
  /** Text color */
  text: string;
  /** Tailwind classes for the badge */
  badgeClasses: string;
  /** Display label */
  label: string;
  /** Lighter background for hover/selected states */
  bgLight: string;
}

/**
 * Color configuration for each appointment status
 */
export const STATUS_COLORS: Record<AppointmentStatus, StatusColorConfig> = {
  [AppointmentStatus.UNCONFIRMED]: {
    bg: "#FEC89A",
    border: "#F97316",
    text: "#9D4E00",
    badgeClasses: "bg-orange-100 text-orange-800 border-orange-200",
    label: "Unconfirmed",
    bgLight: "#FFF7ED",
  },
  [AppointmentStatus.CONFIRMED]: {
    bg: "#93C5FD",
    border: "#3B82F6",
    text: "#1E40AF",
    badgeClasses: "bg-blue-100 text-blue-800 border-blue-200",
    label: "Booked", // Changed from "Confirmed" to "Booked" for clarity
    bgLight: "#EFF6FF",
  },
  [AppointmentStatus.WAITING]: {
    bg: "#C4B5FD",
    border: "#8B5CF6",
    text: "#5B21B6",
    badgeClasses: "bg-violet-100 text-violet-800 border-violet-200",
    label: "Waiting",
    bgLight: "#F5F3FF",
  },
  [AppointmentStatus.IN_SERVICE]: {
    bg: "#F9A8D4",
    border: "#EC4899",
    text: "#9D174D",
    badgeClasses: "bg-pink-100 text-pink-800 border-pink-200",
    label: "In Service",
    bgLight: "#FDF2F8",
  },
  [AppointmentStatus.COMPLETED]: {
    bg: "#9CA3AF",
    border: "#6B7280",
    text: "#374151",
    badgeClasses: "bg-gray-100 text-gray-800 border-gray-200",
    label: "Completed",
    bgLight: "#F9FAFB",
  },
  [AppointmentStatus.CANCELED]: {
    bg: "#D1D5DB",
    border: "#9CA3AF",
    text: "#6B7280",
    badgeClasses: "bg-gray-100 text-gray-600 border-gray-200 opacity-70",
    label: "Canceled",
    bgLight: "#F3F4F6",
  },
  [AppointmentStatus.NO_SHOW]: {
    bg: "#FCA5A5",
    border: "#EF4444",
    text: "#991B1B",
    badgeClasses: "bg-red-100 text-red-800 border-red-200",
    label: "No Show",
    bgLight: "#FEF2F2",
  },
};

/**
 * Get status colors for an appointment
 */
export function getStatusColors(status: AppointmentStatus): StatusColorConfig {
  return STATUS_COLORS[status] || STATUS_COLORS[AppointmentStatus.CONFIRMED];
}

// ============================================================================
// SEGMENT VISUAL STYLES
// ============================================================================

export interface SegmentStyleConfig {
  /** CSS for the segment overlay/background */
  overlayStyle: React.CSSProperties;
  /** Tailwind classes */
  classes: string;
  /** Whether this segment should show service details */
  showDetails: boolean;
}

/**
 * Visual styles for appointment segments
 */
export const SEGMENT_STYLES: Record<SegmentKind, SegmentStyleConfig> = {
  [SegmentKind.SERVICE]: {
    overlayStyle: {},
    classes: "",
    showDetails: true,
  },
  [SegmentKind.BUFFER]: {
    overlayStyle: {
      background: "transparent",
      border: "2px dashed currentColor",
      opacity: 0.5,
    },
    classes: "border-dashed border-2 opacity-50",
    showDetails: false,
  },
  [SegmentKind.PROCESSING]: {
    overlayStyle: {
      background: "rgba(0,0,0,0.08)",
      backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.05) 4px, rgba(0,0,0,0.05) 8px)",
    },
    classes: "bg-black/5",
    showDetails: false,
  },
  [SegmentKind.FINISHING]: {
    overlayStyle: {
      background: "rgba(255,255,255,0.3)",
    },
    classes: "bg-white/30",
    showDetails: false,
  },
  [SegmentKind.TRAVEL]: {
    overlayStyle: {
      backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 6px)",
    },
    classes: "bg-gradient-to-r from-blue-100/50 to-blue-200/50",
    showDetails: false,
  },
};

/**
 * Get segment visual style
 */
export function getSegmentStyle(kind: SegmentKind): SegmentStyleConfig {
  return SEGMENT_STYLES[kind] || SEGMENT_STYLES[SegmentKind.SERVICE];
}

// ============================================================================
// BLOCK PATTERNS
// ============================================================================

export interface BlockStyleConfig {
  /** Background color */
  bg: string;
  /** Border color */
  border: string;
  /** Text color */
  text: string;
  /** CSS background pattern */
  pattern?: string;
  /** Tailwind classes */
  classes: string;
}

/**
 * Visual styles for calendar blocks
 */
export const BLOCK_STYLES: Record<BlockKind, BlockStyleConfig> = {
  [BlockKind.APPOINTMENT]: {
    bg: "transparent",
    border: "transparent",
    text: "inherit",
    classes: "",
  },
  [BlockKind.TIME_BLOCK]: {
    bg: "#E5E7EB",
    border: "#9CA3AF",
    text: "#4B5563",
    pattern: "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 6px)",
    classes: "bg-gray-200 border-l-4 border-gray-400",
  },
  [BlockKind.TRAVEL_BLOCK]: {
    bg: "#DBEAFE",
    border: "#60A5FA",
    text: "#1E40AF",
    pattern: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(59,130,246,0.1) 3px, rgba(59,130,246,0.1) 6px)",
    classes: "bg-blue-100 border-l-4 border-blue-400",
  },
};

/**
 * Get block visual style
 */
export function getBlockStyle(kind: BlockKind): BlockStyleConfig {
  return BLOCK_STYLES[kind] || BLOCK_STYLES[BlockKind.TIME_BLOCK];
}

// ============================================================================
// APPOINTMENT KIND INDICATORS
// ============================================================================

export interface KindIndicatorConfig {
  /** Icon name (Lucide icon) */
  icon: string;
  /** Label text */
  label: string;
  /** Badge color classes */
  badgeClasses: string;
}

/**
 * Visual indicators for appointment kinds
 */
export const KIND_INDICATORS: Record<AppointmentKind, KindIndicatorConfig> = {
  [AppointmentKind.IN_SALON]: {
    icon: "Building2",
    label: "In Salon",
    badgeClasses: "bg-gray-100 text-gray-700",
  },
  [AppointmentKind.WALK_IN]: {
    icon: "PersonStanding",
    label: "Walk-in",
    badgeClasses: "bg-amber-100 text-amber-800",
  },
  [AppointmentKind.AT_HOME]: {
    icon: "Home",
    label: "At Home",
    badgeClasses: "bg-blue-100 text-blue-800",
  },
};

/**
 * Get kind indicator config
 */
export function getKindIndicator(kind: AppointmentKind): KindIndicatorConfig {
  return KIND_INDICATORS[kind] || KIND_INDICATORS[AppointmentKind.IN_SALON];
}

// ============================================================================
// ICON FLAG MAPPING
// ============================================================================

export interface IconConfig {
  /** Lucide icon name */
  icon: string;
  /** Tooltip text */
  tooltip: string;
  /** Color class */
  colorClass: string;
  /** Priority (lower = show first) */
  priority: number;
}

/**
 * Map icon flags to visual icons
 */
export const ICON_FLAG_MAPPING: Record<keyof AppointmentIconFlags, IconConfig | null> = {
  isNewClient: {
    icon: "Sparkles",
    tooltip: "New Client",
    colorClass: "text-amber-500",
    priority: 1,
  },
  hasNotes: {
    icon: "StickyNote",
    tooltip: "Has Notes",
    colorClass: "text-blue-500",
    priority: 5,
  },
  isRepeating: {
    icon: "Repeat",
    tooltip: "Repeating Appointment",
    colorClass: "text-purple-500",
    priority: 3,
  },
  hasMembership: {
    icon: "Crown",
    tooltip: "Member",
    colorClass: "text-yellow-500",
    priority: 2,
  },
  hasFormsIncomplete: {
    icon: "FileWarning",
    tooltip: "Forms Incomplete",
    colorClass: "text-red-500",
    priority: 0,
  },
  hasPhotos: {
    icon: "Camera",
    tooltip: "Has Photos",
    colorClass: "text-green-500",
    priority: 6,
  },
  hasConversation: {
    icon: "MessageCircle",
    tooltip: "Has Messages",
    colorClass: "text-blue-400",
    priority: 7,
  },
  isGroup: {
    icon: "Users",
    tooltip: "Group Booking",
    colorClass: "text-indigo-500",
    priority: 4,
  },
  requestedProvider: null, // Don't show icon, it's implied
  requestedGender: null, // Don't show icon
  hasCustomization: {
    icon: "Wrench",
    tooltip: "Service Customization",
    colorClass: "text-gray-500",
    priority: 8,
  },
  isWalkIn: {
    icon: "PersonStanding",
    tooltip: "Walk-in",
    colorClass: "text-amber-600",
    priority: 2,
  },
  isAtHome: {
    icon: "Home",
    tooltip: "At-Home Service",
    colorClass: "text-blue-600",
    priority: 2,
  },
};

/**
 * Get active icons for an appointment based on its flags
 * Returns sorted array of icons by priority
 */
export function getActiveIcons(flags: AppointmentIconFlags): IconConfig[] {
  const icons: IconConfig[] = [];
  
  for (const [key, value] of Object.entries(flags)) {
    if (value && ICON_FLAG_MAPPING[key as keyof AppointmentIconFlags]) {
      icons.push(ICON_FLAG_MAPPING[key as keyof AppointmentIconFlags]!);
    }
  }
  
  return icons.sort((a, b) => a.priority - b.priority);
}

// ============================================================================
// CALENDAR BACKGROUND COLORS
// ============================================================================

export interface CalendarBackgroundConfig {
  /** Working hours background */
  working: string;
  /** Non-working hours background */
  nonWorking: string;
  /** Current time indicator color */
  nowLine: string;
  /** Grid line color */
  gridLine: string;
}

/**
 * Get calendar background colors based on preferences
 */
export function getCalendarBackgrounds(highContrast: boolean = false): CalendarBackgroundConfig {
  if (highContrast) {
    return {
      working: "#FFFFFF",
      nonWorking: "#1F2937",
      nowLine: "#EF4444",
      gridLine: "#374151",
    };
  }
  
  return {
    working: "#FFFFFF",
    nonWorking: "#F9FAFB",
    nowLine: "#EF4444",
    gridLine: "#E5E7EB",
  };
}

// ============================================================================
// CANCELED APPOINTMENT STYLING
// ============================================================================

/**
 * Get styles for canceled appointments
 */
export function getCanceledStyles(showCanceled: boolean): React.CSSProperties {
  if (!showCanceled) {
    return { display: "none" };
  }
  
  return {
    opacity: 0.5,
    textDecoration: "line-through",
    filter: "grayscale(50%)",
  };
}

/**
 * Get Tailwind classes for canceled appointments
 */
export function getCanceledClasses(showCanceled: boolean): string {
  if (!showCanceled) {
    return "hidden";
  }
  
  return "opacity-50 grayscale-[50%]";
}

// ============================================================================
// SERVICE COLOR PALETTE
// ============================================================================

/**
 * Color palette for services based on keywords
 * This provides Mangomint-like service coloring
 */
export const SERVICE_COLOR_PALETTE: Record<string, { bg: string; border: string; text: string }> = {
  // Hair services
  haircut: { bg: "#7DD3D8", border: "#5FC4C9", text: "#1A3A4A" },
  cut: { bg: "#7DD3D8", border: "#5FC4C9", text: "#1A3A4A" },
  color: { bg: "#F8D59F", border: "#E8C57A", text: "#6B5520" },
  highlight: { bg: "#FFE0B2", border: "#FFCA80", text: "#6B4520" },
  balayage: { bg: "#F8BBD0", border: "#F48FB1", text: "#6A2C4A" },
  process: { bg: "#F8BBD0", border: "#F48FB1", text: "#6A2C4A" },
  blowout: { bg: "#B0BEC5", border: "#90A4AE", text: "#37474F" },
  treatment: { bg: "#CE93D8", border: "#BA68C8", text: "#4A148C" },
  conditioning: { bg: "#A5D6A7", border: "#81C784", text: "#1B5E20" },
  
  // Nail services
  manicure: { bg: "#B3E0F2", border: "#81C7E8", text: "#1A4A5A" },
  pedicure: { bg: "#B3E0F2", border: "#81C7E8", text: "#1A4A5A" },
  nail: { bg: "#B3E0F2", border: "#81C7E8", text: "#1A4A5A" },
  
  // Face services
  facial: { bg: "#E0E0E0", border: "#BDBDBD", text: "#424242" },
  brow: { bg: "#D7CCC8", border: "#BCAAA4", text: "#4E342E" },
  lash: { bg: "#D7CCC8", border: "#BCAAA4", text: "#4E342E" },
  
  // Body services
  massage: { bg: "#C8E6C9", border: "#A5D6A7", text: "#2E5A2F" },
  wax: { bg: "#FFCCBC", border: "#FFAB91", text: "#5A3020" },
  
  // Specialty
  correction: { bg: "#B3D1F2", border: "#81AEE8", text: "#1A3A5A" },
  refresh: { bg: "#80DEEA", border: "#4DD0E1", text: "#006064" },
  signature: { bg: "#FFAB91", border: "#FF8A65", text: "#BF360C" },
  
  // Default
  default: { bg: "#E8E8E8", border: "#D0D0D0", text: "#424242" },
};

/**
 * Get service color based on service name
 */
export function getServiceColor(serviceName: string): { bg: string; border: string; text: string } {
  const lowerName = serviceName.toLowerCase();
  
  for (const [keyword, colors] of Object.entries(SERVICE_COLOR_PALETTE)) {
    if (keyword !== "default" && lowerName.includes(keyword)) {
      return colors;
    }
  }
  
  return SERVICE_COLOR_PALETTE.default;
}

// ============================================================================
// COMBINED APPOINTMENT STYLING
// ============================================================================

export interface AppointmentVisualStyle {
  /** Background color (from status or service) */
  backgroundColor: string;
  /** Border/accent color */
  borderColor: string;
  /** Text color */
  textColor: string;
  /** Additional overlay style (for segments) */
  overlayStyle?: React.CSSProperties;
  /** Whether to show strikethrough (canceled) */
  strikethrough: boolean;
  /** Opacity */
  opacity: number;
  /** Tailwind classes */
  classes: string;
}

/**
 * Get combined visual style for an appointment
 */
export function getAppointmentVisualStyle(
  status: AppointmentStatus,
  serviceName: string,
  options: {
    colorBy?: "status" | "service";
    showCanceled?: boolean;
  } = {}
): AppointmentVisualStyle {
  const { colorBy = "status", showCanceled = true } = options;
  
  const isCanceled = status === AppointmentStatus.CANCELED;
  
  // Get base colors based on colorBy preference
  let colors: { bg: string; border: string; text: string };
  
  if (colorBy === "service" && !isCanceled) {
    colors = getServiceColor(serviceName);
  } else {
    const statusColors = getStatusColors(status);
    colors = {
      bg: statusColors.bg,
      border: statusColors.border,
      text: statusColors.text,
    };
  }
  
  // Apply canceled styling
  if (isCanceled && !showCanceled) {
    return {
      backgroundColor: "transparent",
      borderColor: "transparent",
      textColor: "transparent",
      strikethrough: false,
      opacity: 0,
      classes: "hidden",
    };
  }
  
  return {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    textColor: colors.text,
    strikethrough: isCanceled,
    opacity: isCanceled ? 0.5 : 1,
    classes: isCanceled ? "line-through opacity-50" : "",
  };
}
