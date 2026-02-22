// Calendar Components
export { CalendarMobileView } from "./CalendarMobileView";
export { CalendarDesktopView } from "./CalendarDesktopView";
export { CalendarGrid } from "./CalendarGrid";
export { CalendarMobileGrid } from "./CalendarMobileGrid";
export { CalendarList } from "./CalendarList";
export { CalendarLegend } from "./CalendarLegend";
export { CalendarColorSchemeDialog } from "./CalendarColorSchemeDialog";
export { CalendarLinkDialog } from "./CalendarLinkDialog";

// Appointment Components
export { AppointmentDialog } from "./AppointmentDialog";
// Legacy components - kept as stubs for Turbopack module resolution (replaced by AppointmentSidebar)
// These return null and are never actually used, but Turbopack requires them to exist
export { default as AppointmentDetailsModal } from "./AppointmentDetailsModal";
export { default as AppointmentDialogMobile } from "./AppointmentDialogMobile";
export { AppointmentStatusBadge } from "./AppointmentStatusBadge";
export { AppointmentStatusManager, AppointmentStatusBadge as StatusBadge, QuickStatusActions } from "./AppointmentStatusManager";
export { AppointmentHistoryPanel } from "./AppointmentHistoryPanel";
export { AppointmentNotesPanel } from "./AppointmentNotesPanel";
export { CancelAppointmentDialog } from "./CancelAppointmentDialog";
export { RescheduleDialog } from "./RescheduleDialog";
export { GroupBookingDialog } from "./GroupBookingDialog";

// Quick Actions
export { QuickBookingPopover } from "./QuickBookingPopover";
export { PrintScheduleDialog } from "./PrintScheduleDialog";
export { SetDayOffDialog } from "./SetDayOffDialog";
export { EditWorkHoursDialog } from "./EditWorkHoursDialog";
export { CheckoutDialog } from "./CheckoutDialog";

// Drag & Drop
export { DragDropProvider, useDragDrop, DraggableAppointment, DroppableTimeSlot, DragIndicator } from "./DragDropCalendar";

// Time Blocks
export { TimeBlockDialog } from "./TimeBlockDialog";
export { BlockedTimeTypeDialog } from "./BlockedTimeTypeDialog";

// Client Components
export { ClientQuickView } from "./ClientQuickView";

// Waitlist & Virtual Waiting Room
export { WaitlistManager, AddToWaitlistDialog } from "./WaitlistManager";
export { VirtualWaitingRoom } from "./VirtualWaitingRoom";
export { WaitingRoomEntryDialog } from "./WaitingRoomEntryDialog";

// Dashboard Components
export { 
  GradientStatCard, 
  UpcomingAppointmentsWidget, 
  QuickActionsWidget,
  PerformanceOverviewWidget,
  TodaySummaryWidget,
  WelcomeBanner
} from "./DashboardWidgets";
export { KpiCardsRow } from "./KpiCardsRow";

// Sales & Payments
export { NewSaleDialog } from "./NewSaleDialog";
export { YocoPaymentDialog } from "./YocoPaymentDialog";
export { Money } from "./Money";

// QR Code
export { QRCodeDisplay } from "./QRCodeDisplay";
export { QRCodeScanner } from "./QRCodeScanner";

// Layout Components
export { ProviderShell } from "./ProviderShell";
export { ProviderSidebar } from "./ProviderSidebar";
export { ProviderTopbar } from "./ProviderTopbar";
export { ProviderPageHeader } from "./ProviderPageHeader";
