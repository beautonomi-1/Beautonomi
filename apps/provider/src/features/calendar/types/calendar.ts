export type CalendarViewMode = "day" | "3day" | "week" | "month";

export type CalendarV2Segment = "schedule" | "queue" | "insights";

export interface CalendarV2ChromeContext {
  providerTimezone: string | null;
  businessName: string;
  selectedDate: Date;
  weekStart: Date;
  viewMode: "day" | "3day" | "week";
  setSelectedDate: (d: Date) => void;
  setViewMode: (m: "day" | "3day" | "week") => void;
  navigateDate: (dir: number) => void;
  todayBookingCount: number;
  pendingOnSelectedDay: number;
  pendingAttentionCount: number;
  urgentPendingCount: number;
  waitingRoomCount: number;
  nextUpcomingLabel: string | null;
  scheduledValueLabel: string | null;
  paymentAttentionCount: number;
  isProviderToday: (d: Date) => boolean;
  onRefresh: () => void;
  onOpenDatePicker: () => void;
  /** Share / copy / month overview / express booking menu */
  onOpenUtilityMenu: () => void;
  onOpenPreferences: () => void;
  onOpenMonthOverview: () => void;
  onShareSchedule: () => void;
  onCopySchedule: () => void;
  offersMobileServices: boolean;
  onNewBooking: () => void;
  onWalkIn: () => void;
  onGroup: () => void;
  onBlock: () => void;
  onWaitingRoom: () => void;
  onRecurring: () => void;
  onSale: () => void;
}
