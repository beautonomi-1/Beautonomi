/**
 * Scheduling Module
 * 
 * Exports all scheduling-related utilities for Mangomint-style calendar.
 */

// Adapter Layer
export {
  // Enums
  AppointmentStatus,
  AppointmentKind,
  SegmentKind,
  BlockKind,
  
  // Types
  type AppointmentSegment,
  type AppointmentIconFlags,
  type MangomintAppointment,
  type MangomintBlock,
  
  // Mapping functions
  mapStatus,
  unmapStatus,
  mapKind,
  calculateSegments,
  extractIconFlags,
  toMangomintAppointment,
  toMangomintBlock,
  
  // Travel block generation
  generateTravelBlocks,
  getAllBlocks,
  
  // Conflict detection
  overlaps,
  canPlace,
  snapToIncrement,
  getAvailableSlots,
  
  // Utilities
  timeToMinutes,
  minutesToTime,
  formatTime12h,
  isMangomintModeEnabled,
} from "./mangomintAdapter";

// Visual Mapping
export {
  // Types
  type StatusColorConfig,
  type SegmentStyleConfig,
  type BlockStyleConfig,
  type KindIndicatorConfig,
  type IconConfig,
  type CalendarBackgroundConfig,
  type AppointmentVisualStyle,
  
  // Constants
  STATUS_COLORS,
  SEGMENT_STYLES,
  BLOCK_STYLES,
  KIND_INDICATORS,
  ICON_FLAG_MAPPING,
  SERVICE_COLOR_PALETTE,
  
  // Functions
  getStatusColors,
  getSegmentStyle,
  getBlockStyle,
  getKindIndicator,
  getActiveIcons,
  getCalendarBackgrounds,
  getCanceledStyles,
  getCanceledClasses,
  getServiceColor,
  getAppointmentVisualStyle,
} from "./visualMapping";
