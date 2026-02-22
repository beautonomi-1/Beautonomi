/**
 * Scheduler Module
 * 
 * Public API for the calendar scheduler system.
 */

// Types
export type {
  CalendarEvent,
  CalendarResource,
  CalendarTimeBlock,
  EventStyle,
  BlockStyle,
  EventMetadata,
  CalendarViewConfig,
  CalendarPreferences,
  DragDropEvent,
  ResizeEvent,
  SlotClickEvent,
  EventClickEvent,
  CalendarState,
  AppointmentUpdatePayload,
  ConflictValidation,
  CalendarDataResponse,
} from "./types";

// Adapter functions
export {
  toCalendarEvent,
  toCalendarResource,
  toCalendarTimeBlock,
  toCalendarEvents,
  toCalendarResources,
  toCalendarTimeBlocks,
  fromDragDropEvent,
  getEventStyle,
  getBlockStyle,
  calculateEndTime,
  isNewBooking,
  canEditAppointment,
  canDeleteAppointment,
  canRescheduleAppointment,
  formatDisplayTime,
  parseDisplayTime,
} from "./adapter";

// Style utilities
export {
  SERVICE_COLORS,
  STATUS_COLORS,
  GRID_STYLES,
  CARD_STYLES,
  ANIMATIONS,
  BREAKPOINTS,
  Z_INDEX,
  getServiceColorByName,
  getStatusColor,
  getAppointmentCardClasses,
  getTimeBlockClasses,
  getGridCellClasses,
  getColumnWidth,
  calculateAppointmentTop,
  calculateAppointmentHeight,
  isWithinWorkingHours,
} from "./styles";

// Utility functions
export {
  generateTimeSlots,
  getDatesForView,
  isWeekend,
  getEventsForDateAndResource,
  getTimeBlocksForDateAndResource,
  checkConflicts,
  timeRangesOverlap,
  snapToInterval,
  getCurrentTime,
  isTimePast,
  sortEventsByTime,
  groupEventsByDate,
  groupEventsByResource,
  calculateTotalDuration,
  formatDuration,
  getDateRangeLabel,
  getShortDayLabel,
  getTimeLabel,
  debounce,
  throttle,
  deepClone,
  createCacheKey,
} from "./utils";
