/**
 * Provider API Interface
 * Swappable interface for connecting to real backend later
 */

import { format as formatDate } from "date-fns";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { nextUpcomingOccurrenceYmd } from "@/lib/recurring/next-due-date";
import {
  FetchError,
  FetchTimeoutError,
  fetcher,
  isHtmlRoutingFetchError,
  isNotFoundHttpError,
  isTransientNetworkFetchError,
  PROVIDER_BOOTSTRAP_TIMEOUT_MS,
  providerPortalFetch,
} from "@/lib/http/fetcher";
import { APPOINTMENT_STATUS, DEFAULT_APPOINTMENT_STATUS } from "./constants";
import { transformBookingRowsToAppointments } from "./transform-bookings-to-calendar-appointments";
import type {
  Provider,
  Salon,
  TeamMember,
  ServiceCategory,
  ServiceItem,
  ProductItem,
  Appointment,
  Sale,
  PaymentTransaction,
  Shift,
  Campaign,
  Automation,
  DashboardMetrics,
  FilterParams,
  PaginationParams,
  PaginatedResponse,
  YocoDevice,
  YocoPayment,
  YocoIntegration,
  WaitlistEntry,
  RecurringAppointment,
  Resource,
  ResourceGroup,
  ExpressBookingLink,
  CancellationPolicy,
  AppointmentNote,
  NoteTemplate,
  NoteType,
  AppointmentHistoryEntry,
  CalendarSync,
  CalendarEvent,
  CalendarProvider,
  GroupBooking,
  GroupBookingParticipant,
  TimeBlock,
  BlockedTimeType,
  AvailabilityBlockRaw,
  AvailabilityBlockDisplay,
  WaitingRoomEntry,
  CalendarColorScheme,
  CalendarDisplayPreferences,
  CalendarLink,
  RescheduleRequest,
  RecurrenceRule,
  RecurrencePattern,
} from "./types";

// Reference data item for dropdown options
export interface ReferenceDataItem {
  id: string;
  type: string;
  value: string;
  label: string;
  description?: string;
  display_order: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface ProviderApi {
  // Provider & Location (null when the user has a provider role but no providers row yet)
  getProvider(): Promise<Provider | null>;
  getSalons(): Promise<Salon[]>;
  listLocations(): Promise<Salon[]>; // Alias for getSalons for consistency
  selectLocation(locationId: string): Promise<void>;

  // Dashboard
  getDashboardMetrics(): Promise<DashboardMetrics>;

  // Appointments
  listAppointments(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<Appointment>>;
  getAppointment(id: string): Promise<Appointment>;
  createAppointment(data: Partial<Appointment>): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment>;
  deleteAppointment(id: string): Promise<void>;
  // At-home appointment status updates
  startJourney(appointmentId: string, estimatedArrival?: string): Promise<Appointment>;
  markArrived(appointmentId: string, latitude?: number, longitude?: number): Promise<{ appointment: Appointment; otp: string | null; qr_code?: any }>;
  startService(appointmentId: string): Promise<Appointment>;
  completeService(appointmentId: string): Promise<Appointment>;

  // Sales
  listSales(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<Sale>>;
  createSale(data: Partial<Sale>): Promise<Sale>;
  updateSale(
    id: string,
    data: Partial<{
      payment_status: string;
      payment_provider: string | null;
      payment_provider_id: string | null;
    }>,
  ): Promise<Sale>;

  // Payments
  listPayments(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<PaymentTransaction>>;

  // Catalogue - Services
  listServiceCategories(): Promise<ServiceCategory[]>;
  listServices(): Promise<ServiceItem[]>;
  createServiceCategory(data: Partial<ServiceCategory>): Promise<ServiceCategory>;
  updateServiceCategory(id: string, data: Partial<ServiceCategory>): Promise<ServiceCategory>;
  deleteServiceCategory(id: string): Promise<void>;
  createService(data: Partial<ServiceItem>): Promise<ServiceItem>;
  updateService(id: string, data: Partial<ServiceItem>): Promise<ServiceItem>;
  deleteService(id: string): Promise<void>;
  reorderServices(categoryId: string, serviceIds: string[]): Promise<void>;
  getServiceVariants(serviceId: string): Promise<ServiceItem[]>;
  getServiceAddons(serviceId: string): Promise<ServiceItem[]>;
  getServiceResources(serviceId: string): Promise<Array<{ resource_id: string; required: boolean }>>;
  setServiceResources(serviceId: string, resources: Array<{ resource_id: string; required: boolean }>): Promise<void>;

  // Catalogue - Products
  listProducts(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<ProductItem>>;
  createProduct(data: Partial<ProductItem>): Promise<ProductItem>;
  updateProduct(id: string, data: Partial<ProductItem>): Promise<ProductItem>;
  deleteProduct(id: string): Promise<void>;

  // Team
  listTeamMembers(locationId?: string): Promise<TeamMember[]>;
  createTeamMember(data: Partial<TeamMember>): Promise<TeamMember>;
  updateTeamMember(id: string, data: Partial<TeamMember>): Promise<TeamMember>;
  deleteTeamMember(id: string): Promise<void>;

  // Reference Data
  getReferenceData(types?: string[]): Promise<Record<string, ReferenceDataItem[]>>;

  // Shifts
  listShifts(weekStart: string): Promise<Shift[]>;
  createShift(data: Partial<Shift>): Promise<Shift>;
  updateShift(id: string, data: Partial<Shift>): Promise<Shift>;
  deleteShift(id: string): Promise<void>;

  // Marketing
  listCampaigns(): Promise<Campaign[]>;
  createCampaign(data: Partial<Campaign>): Promise<Campaign>;
  updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign>;
  deleteCampaign(id: string): Promise<void>;
  sendCampaign(id: string): Promise<any>;
  listAutomations(): Promise<Automation[]>;
  createAutomation(data: Partial<Automation>): Promise<Automation>;
  updateAutomation(id: string, data: Partial<Automation>): Promise<Automation>;

  // Yoco Integration
  getYocoIntegration(): Promise<YocoIntegration>;
  updateYocoIntegration(data: Partial<YocoIntegration>): Promise<YocoIntegration>;
  listYocoDevices(): Promise<YocoDevice[]>;
  createYocoDevice(data: Partial<YocoDevice>): Promise<YocoDevice>;
  updateYocoDevice(id: string, data: Partial<YocoDevice>): Promise<YocoDevice>;
  deleteYocoDevice(id: string): Promise<void>;
  getYocoDevice(id: string): Promise<YocoDevice>;
  listYocoPayments(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<YocoPayment>>;
  createYocoPayment(data: {
    device_id: string;
    amount: number; // Amount in Rands (API converts to cents)
    currency?: string;
    appointment_id?: string;
    sale_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<YocoPayment>;
  getYocoPayment(id: string): Promise<YocoPayment>;

  // Waitlist
  listWaitlistEntries(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<WaitlistEntry>>;
  createWaitlistEntry(data: Partial<WaitlistEntry>): Promise<WaitlistEntry>;
  updateWaitlistEntry(id: string, data: Partial<WaitlistEntry>): Promise<WaitlistEntry>;
  deleteWaitlistEntry(id: string): Promise<void>;
  notifyWaitlistEntry(id: string): Promise<void>;
  convertWaitlistToAppointment(waitlistId: string, appointmentData: Partial<Appointment>): Promise<Appointment>;

  // Recurring Appointments
  listRecurringAppointments(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<RecurringAppointment>>;
  createRecurringAppointment(data: Partial<RecurringAppointment>): Promise<RecurringAppointment>;
  updateRecurringAppointment(id: string, data: Partial<RecurringAppointment>): Promise<RecurringAppointment>;
  updateRecurringSeries(seriesId: string, data: Partial<RecurringAppointment>): Promise<RecurringAppointment>;
  deleteRecurringAppointment(id: string, deleteSeries?: boolean): Promise<void>;

  // Resources
  listResources(filters?: FilterParams): Promise<Resource[]>;
  createResource(data: Partial<Resource>): Promise<Resource>;
  updateResource(id: string, data: Partial<Resource>): Promise<Resource>;
  deleteResource(id: string): Promise<void>;
  listResourceGroups(): Promise<ResourceGroup[]>;
  createResourceGroup(data: Partial<ResourceGroup>): Promise<ResourceGroup>;
  updateResourceGroup(id: string, data: Partial<ResourceGroup>): Promise<ResourceGroup>;
  deleteResourceGroup(id: string): Promise<void>;

  // Express Booking Links
  listExpressBookingLinks(): Promise<ExpressBookingLink[]>;
  createExpressBookingLink(data: Partial<ExpressBookingLink>): Promise<ExpressBookingLink>;
  updateExpressBookingLink(id: string, data: Partial<ExpressBookingLink>): Promise<ExpressBookingLink>;
  deleteExpressBookingLink(id: string): Promise<void>;

  // Cancellation Policies
  listCancellationPolicies(): Promise<CancellationPolicy[]>;
  createCancellationPolicy(data: Partial<CancellationPolicy>): Promise<CancellationPolicy>;
  updateCancellationPolicy(id: string, data: Partial<CancellationPolicy>): Promise<CancellationPolicy>;
  deleteCancellationPolicy(id: string): Promise<void>;
  getCancellationPolicyForAppointment(appointmentId: string): Promise<CancellationPolicy | null>;

  // Appointment Notes
  listAppointmentNotes(appointmentId: string): Promise<AppointmentNote[]>;
  createAppointmentNote(data: Partial<AppointmentNote>): Promise<AppointmentNote>;
  updateAppointmentNote(id: string, data: Partial<AppointmentNote>): Promise<AppointmentNote>;
  deleteAppointmentNote(noteId: string, appointmentId: string): Promise<void>;
  listNoteTemplates(): Promise<NoteTemplate[]>;
  createNoteTemplate(data: Partial<NoteTemplate>): Promise<NoteTemplate>;
  updateNoteTemplate(id: string, data: Partial<NoteTemplate>): Promise<NoteTemplate>;
  deleteNoteTemplate(id: string): Promise<void>;

  // Appointment History
  getAppointmentHistory(appointmentId: string): Promise<AppointmentHistoryEntry[]>;

  // Calendar Integration
  listCalendarSyncs(): Promise<CalendarSync[]>;
  createCalendarSync(data: Partial<CalendarSync>): Promise<CalendarSync>;
  updateCalendarSync(id: string, data: Partial<CalendarSync>): Promise<CalendarSync>;
  deleteCalendarSync(id: string): Promise<void>;
  syncAppointmentToCalendar(appointmentId: string, calendarSyncId: string): Promise<CalendarEvent>;
  syncCalendarToAppointments(calendarSyncId: string): Promise<void>;
  getCalendarAuthUrl(provider: CalendarProvider): Promise<{ url: string }>;
  handleCalendarCallback(provider: CalendarProvider, code: string, state?: string): Promise<CalendarSync>;

  // Group Booking
  listGroupBookings(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<GroupBooking>>;
  getGroupBooking(id: string): Promise<GroupBooking>;
  createGroupBooking(data: Partial<GroupBooking>): Promise<GroupBooking>;
  updateGroupBooking(id: string, data: Partial<GroupBooking>): Promise<GroupBooking>;
  deleteGroupBooking(id: string): Promise<void>;
  addParticipantToGroupBooking(groupBookingId: string, participant: Partial<GroupBookingParticipant>): Promise<GroupBookingParticipant>;
  removeParticipantFromGroupBooking(groupBookingId: string, participantId: string): Promise<void>;
  checkInGroupParticipant(groupBookingId: string, participantId: string): Promise<void>;
  checkOutGroupParticipant(groupBookingId: string, participantId: string): Promise<void>;
  convertAppointmentsToGroupBooking(appointmentIds: string[]): Promise<GroupBooking>;

  // Time Blocks
  listTimeBlocks(filters?: FilterParams): Promise<TimeBlock[]>;
  getTimeBlock(id: string): Promise<TimeBlock>;
  createTimeBlock(data: Partial<TimeBlock>): Promise<TimeBlock>;
  updateTimeBlock(id: string, data: Partial<TimeBlock>): Promise<TimeBlock>;
  deleteTimeBlock(id: string): Promise<void>;
  listBlockedTimeTypes(): Promise<BlockedTimeType[]>;

  // Days Off
  setDayOff(staffId: string, data: { date: string; reason?: string; type?: string }): Promise<any>;
  removeDayOff(staffId: string, dayOffId: string): Promise<void>;
  listDaysOff(staffId: string, params?: { date_from?: string; date_to?: string }): Promise<any[]>;

  // Availability blocks (closed periods, breaks – date-specific non-bookable time)
  listAvailabilityBlocks(params: { from: string; to: string }): Promise<AvailabilityBlockDisplay[]>;
  /** staff_time_off + staff_days_off as calendar segments (matches public booking blockers). */
  listStaffCalendarUnavailability(params: {
    date_from: string;
    date_to: string;
  }): Promise<AvailabilityBlockDisplay[]>;
  /** B8: active booking_holds rendered as calendar ghost slots. */
  listProviderBookingHolds(params: {
    date_from: string;
    date_to: string;
  }): Promise<AvailabilityBlockDisplay[]>;
  createBlockedTimeType(data: Partial<BlockedTimeType>): Promise<BlockedTimeType>;
  updateBlockedTimeType(id: string, data: Partial<BlockedTimeType>): Promise<BlockedTimeType>;
  deleteBlockedTimeType(id: string): Promise<void>;

  // Virtual Waiting Room
  listWaitingRoomEntries(filters?: FilterParams): Promise<WaitingRoomEntry[]>;
  getWaitingRoomEntry(id: string): Promise<WaitingRoomEntry>;
  addToWaitingRoom(data: Partial<WaitingRoomEntry>): Promise<WaitingRoomEntry>;
  updateWaitingRoomEntry(id: string, data: Partial<WaitingRoomEntry>): Promise<WaitingRoomEntry>;
  removeFromWaitingRoom(id: string): Promise<void>;
  checkInToWaitingRoom(data: Partial<WaitingRoomEntry>): Promise<WaitingRoomEntry>;
  moveWaitingRoomToService(entryId: string, appointmentId?: string): Promise<Appointment>;

  // Calendar Colors & Icons
  listCalendarColorSchemes(): Promise<CalendarColorScheme[]>;
  createCalendarColorScheme(data: Partial<CalendarColorScheme>): Promise<CalendarColorScheme>;
  updateCalendarColorScheme(id: string, data: Partial<CalendarColorScheme>): Promise<CalendarColorScheme>;
  deleteCalendarColorScheme(id: string): Promise<void>;
  getCalendarDisplayPreferences(): Promise<CalendarDisplayPreferences>;
  updateCalendarDisplayPreferences(data: Partial<CalendarDisplayPreferences>): Promise<CalendarDisplayPreferences>;

  // Calendar Link Sharing
  listCalendarLinks(): Promise<CalendarLink[]>;
  createCalendarLink(data: Partial<CalendarLink>): Promise<CalendarLink>;
  updateCalendarLink(id: string, data: Partial<CalendarLink>): Promise<CalendarLink>;
  deleteCalendarLink(id: string): Promise<void>;
  getPublicCalendarFeed(linkToken: string): Promise<any>; // Returns iCal/Google Calendar format

  // Rescheduling
  requestReschedule(appointmentId: string, data: Partial<RescheduleRequest>): Promise<RescheduleRequest>;
  listRescheduleRequests(filters?: FilterParams): Promise<RescheduleRequest[]>;
  approveRescheduleRequest(requestId: string): Promise<void>;
  rejectRescheduleRequest(requestId: string, reason?: string): Promise<void>;
  rescheduleAppointment(appointmentId: string, newDate: string, newTime: string): Promise<Appointment>;

  // Print
  getAppointmentPrintData(appointmentId: string): Promise<any>;
  printReceipt(appointmentId: string): Promise<Blob>;
  sendReceiptEmail(appointmentId: string, email?: string): Promise<void>;
}

/**
 * Provider portal API client — calls `/api/provider/*` routes (no in-memory mock data).
 */

/** Convert ISO start_at/end_at to calendar date + start_time/end_time, splitting blocks that span days. */
function normalizeAvailabilityBlocksToDisplay(
  raw: AvailabilityBlockRaw[]
): AvailabilityBlockDisplay[] {
  const result: AvailabilityBlockDisplay[] = [];
  for (const block of raw) {
    const start = new Date(block.start_at);
    const end = new Date(block.end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const pad = (n: number) => n.toString().padStart(2, "0");
    let cursor = new Date(start);
    while (cursor < end) {
      const dateStr = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
      const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const segmentStart = cursor < dayStart ? dayStart : cursor;
      const segmentEnd = end < dayEnd ? end : dayEnd;
      const startTime = `${pad(segmentStart.getHours())}:${pad(segmentStart.getMinutes())}`;
      const endTime = `${pad(segmentEnd.getHours())}:${pad(segmentEnd.getMinutes())}`;
      result.push({
        id: `${block.id}-${dateStr}`,
        date: dateStr,
        start_time: startTime,
        end_time: endTime,
        team_member_id: block.staff_id,
        location_id: block.location_id ?? null,
        block_type: block.block_type,
        reason: block.reason,
        _source: "availability_block",
      });
      cursor = dayEnd;
    }
  }
  return result;
}

const DEFAULT_CALENDAR_DISPLAY_PREFERENCES: CalendarDisplayPreferences = {
  id: "default",
  week_starts_on: 1,
  start_hour: 8,
  end_hour: 20,
  time_slot_interval: 30,
  show_weekends: true,
  show_time_labels: true,
  show_duration: true,
  default_view: "week",
  appointment_height: "normal",
  color_by: "service",
  show_resource_assignments: true,
  show_waitlist_entries: false,
  show_time_blocks: true,
};

function rruleToRecurrenceRule(rr: string): RecurrenceRule {
  const upper = (rr || "").toUpperCase();
  let pattern: RecurrencePattern = "custom";
  if (upper.includes("FREQ=DAILY")) pattern = "daily";
  else if (upper.includes("FREQ=WEEKLY")) {
    pattern = upper.includes("INTERVAL=2") ? "biweekly" : "weekly";
  } else if (upper.includes("FREQ=MONTHLY")) pattern = "monthly";
  const intervalMatch = upper.match(/INTERVAL=(\d+)/);
  const interval = intervalMatch ? parseInt(intervalMatch[1]!, 10) : 1;
  const countMatch = upper.match(/COUNT=(\d+)/);
  const occurrences = countMatch ? parseInt(countMatch[1]!, 10) : undefined;
  return {
    pattern,
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1,
    ...(occurrences && occurrences > 0 ? { occurrences } : {}),
  };
}

function recurrenceRuleToRrule(rule: RecurrenceRule | string): string {
  if (typeof rule === "string") return rule;
  const i = rule.interval && rule.interval > 1 ? rule.interval : 1;
  switch (rule.pattern) {
    case "daily":
      return i > 1 ? `FREQ=DAILY;INTERVAL=${i}` : "FREQ=DAILY";
    case "biweekly":
      return "FREQ=WEEKLY;INTERVAL=2";
    case "monthly":
      return i > 1 ? `FREQ=MONTHLY;INTERVAL=${i}` : "FREQ=MONTHLY";
    case "weekly":
      return i > 1 ? `FREQ=WEEKLY;INTERVAL=${i}` : "FREQ=WEEKLY";
    default:
      return "FREQ=WEEKLY;INTERVAL=1";
  }
}

function toHhMmSs(time: string): string {
  const t = (time || "10:00:00").trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return "10:00:00";
}

function mapRecurringDbRowToAppointment(
  row: any,
  nameFallbacks?: {
    client_name?: string;
    service_name?: string;
    team_member_name?: string;
  }
): RecurringAppointment {
  const rr = rruleToRecurrenceRule(row.recurrence_rule || "");
  const t = row.start_time ? String(row.start_time).slice(0, 5) : "10:00";
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const dm =
    typeof meta.duration_minutes === "number" && Number.isFinite(meta.duration_minutes)
      ? meta.duration_minutes
      : 60;
  const price =
    typeof meta.price === "number" && Number.isFinite(meta.price)
      ? meta.price
      : typeof row.price === "number" && Number.isFinite(row.price)
        ? row.price
        : 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const startYmd = row.start_date || todayStr;
  if (typeof row.occurrences === "number" && row.occurrences > 0) {
    rr.occurrences = row.occurrences;
  }
  const next_occurrence_date = nextUpcomingOccurrenceYmd(
    {
      start_date: startYmd,
      last_booking_date: row.last_booking_date ?? null,
      frequency: row.frequency ?? null,
      recurrence_rule: row.recurrence_rule ?? null,
      end_date: row.end_date ?? null,
    },
    todayStr
  );
  return {
    id: row.id,
    series_id: row.id,
    client_id: row.customer_id || undefined,
    client_name: row.client_snapshot_name || nameFallbacks?.client_name || "Client",
    service_id: row.service_id || "",
    service_name: row.service_snapshot_title || nameFallbacks?.service_name || "",
    team_member_id: row.staff_id || "",
    team_member_name: row.staff_snapshot_name || nameFallbacks?.team_member_name || "",
    scheduled_date: startYmd,
    scheduled_time: t,
    duration_minutes: dm,
    price,
    recurrence_rule: rr,
    status: row.is_active === false ? "cancelled" : "booked",
    is_exception: false,
    created_date: row.created_at || new Date().toISOString(),
    notes: row.notes || undefined,
    location_id: row.location_id ?? null,
    metadata: Object.keys(meta).length > 0 ? meta : undefined,
    frequency: row.frequency ?? undefined,
    last_booking_date: row.last_booking_date ?? undefined,
    end_date: row.end_date ?? undefined,
    next_occurrence_date,
  };
}

function mapWaitlistPriorityField(p: unknown): "high" | "normal" | "low" {
  if (p === "high") return "high";
  if (p === "low") return "low";
  if (p === "normal") return "normal";
  if (typeof p === "number") {
    if (p > 0) return "high";
    if (p < 0) return "low";
    return "normal";
  }
  return "normal";
}

function rootBookingId(id: string): string {
  return id.includes("-svc-") ? id.split("-svc-")[0]! : id;
}

export class ProviderApiClient implements ProviderApi {
  /**
   * Log + health check. Skips logging for HTML routing failures (e.g. Turbopack dev missing /api/.../[id])
   * so the user sees one clear FetchError message without duplicate console noise.
   */
  private async logProviderApiFailure(
    endpoint: string,
    method: string,
    error: any,
    userId?: string,
    providerId?: string,
    requestData?: any,
    responseTimeMs = 0,
  ): Promise<void> {
    if (isHtmlRoutingFetchError(error)) return;

    const statusCode = typeof error?.status === "number" ? error.status : 500;
    const { errorLogger } = await import("@/lib/monitoring/error-logger");
    const { healthCheckService } = await import("@/lib/monitoring/health-check");

    await errorLogger.logApiError(
      endpoint,
      method,
      error,
      userId,
      providerId,
      requestData,
      statusCode,
    );

    await healthCheckService.recordHealthCheck({
      endpoint,
      method,
      status: "down",
      response_time_ms: responseTimeMs,
      status_code: statusCode,
      error: error?.message || String(error),
      checked_at: new Date().toISOString(),
    });
  }

  private async handleApiError(
    endpoint: string,
    method: string,
    error: any,
    userId?: string,
    providerId?: string,
    requestData?: any,
  ): Promise<never> {
    await this.logProviderApiFailure(endpoint, method, error, userId, providerId, requestData);
    throw new Error(`API call failed: ${error?.message || String(error)}`);
  }

  async getProvider(): Promise<Provider | null> {
    const retryDelaysMs = [400, 1200, 3000];
    let lastError: unknown;

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
      try {
        const response = await fetcher.get<{ data: any }>("/api/provider/profile", {
          timeoutMs: PROVIDER_BOOTSTRAP_TIMEOUT_MS,
        });
        const profile = response?.data;
        if (profile == null || typeof profile !== "object" || profile.id == null || profile.id === "") {
          return null;
        }

        return {
          id: profile.id,
          business_name: profile.business_name || "",
          owner_name: profile.owner_name || "",
          email: profile.email || "",
          phone: profile.phone || "",
          setup_completion: profile.setup_completion || 0,
          selected_location_id: profile.selected_location_id ?? null,
          business_type: profile.business_type || undefined,
          currency: profile.currency || undefined,
          locale: profile.locale || undefined,
          timezone: profile.timezone || undefined,
          locations: Array.isArray(profile.locations)
            ? profile.locations.map((loc: any) => ({
                id: loc.id,
                name: loc.name || "",
                address: loc.address_line1 || "",
                city: loc.city || "",
                is_primary: loc.is_primary ?? false,
                location_type: loc.location_type ?? "salon",
                operating_hours: loc.operating_hours ?? null,
                working_hours: loc.working_hours ?? null,
              }))
            : undefined,
        };
      } catch (error) {
        lastError = error;
        if (isNotFoundHttpError(error)) {
          return null;
        }
        if (attempt < retryDelaysMs.length && isTransientNetworkFetchError(error)) {
          await new Promise((r) => setTimeout(r, retryDelaysMs[attempt]));
          continue;
        }
        break;
      }
    }

    console.error("Failed to fetch real provider data:", lastError);
    if (lastError instanceof FetchError) {
      const hint =
        lastError.status === 403
          ? " Check that your account role is provider_owner or provider_staff and linked in providers / provider_staff."
          : "";
      throw new Error(
        `${lastError.message} (HTTP ${lastError.status}${lastError.code ? `, ${lastError.code}` : ""}).${hint}`
      );
    }
    if (
      lastError instanceof FetchTimeoutError ||
      (lastError instanceof Error && lastError.name === "FetchTimeoutError")
    ) {
      const msg = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(
        `${msg} In local dev, Next.js often needs 30–90s on the first API hit while routes compile; this client now waits up to ${PROVIDER_BOOTSTRAP_TIMEOUT_MS / 1000}s. If it still fails, pause edits to avoid Fast Refresh competing with the server.`
      );
    }
    if (lastError instanceof Error) {
      throw new Error(
        `${lastError.message} — If this persists after refresh, confirm Supabase migrations are applied (e.g. providers.tenant_id, providers.avatar_url, provider_locations.location_type).`
      );
    }
    throw new Error("Failed to load provider profile. Please refresh the page.");
  }

  async getSalons(): Promise<Salon[]> {
    try {
      const response = await fetcher.get<{ data: any[] }>("/api/provider/locations", {
        timeoutMs: PROVIDER_BOOTSTRAP_TIMEOUT_MS,
      });
      const locations = response.data || [];
      
      return locations.map((loc: any) => ({
        id: loc.id,
        name: loc.name || "",
        address: loc.address_line1 || "",
        city: loc.city || "",
        is_primary: loc.is_primary ?? false,
        location_type: loc.location_type ?? "salon",
        operating_hours: loc.operating_hours ?? null,
        working_hours: loc.working_hours ?? null,
      }));
    } catch (error) {
      if (isNotFoundHttpError(error)) {
        return [];
      }
      console.error("Failed to fetch real locations:", error);
      return [];
    }
  }

  async listLocations(): Promise<Salon[]> {
    // Alias for getSalons for consistency
    return this.getSalons();
  }

  async selectLocation(locationId: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.put("/api/provider/profile", { selected_location_id: locationId });
    } catch (error) {
      console.warn("Failed to select location:", error);
    }
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const startTime = Date.now();
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const { healthCheckService } = await import("@/lib/monitoring/health-check");
      
      const response = await fetcher.get<{ data: any }>("/api/provider/dashboard?include=insights");
      const responseTime = Date.now() - startTime;
      
      // Record health check
      await healthCheckService.recordHealthCheck({
        endpoint: "/api/provider/dashboard",
        method: "GET",
        status: responseTime > 5000 ? "degraded" : "healthy",
        response_time_ms: responseTime,
        status_code: 200,
        checked_at: new Date().toISOString(),
      });
      
      return response.data;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      await this.logProviderApiFailure(
        "/api/provider/dashboard",
        "GET",
        error,
        undefined,
        undefined,
        undefined,
        responseTime,
      );
      throw new Error(`Failed to fetch dashboard metrics: ${error?.message || String(error)}`);
    }
  }

  async listAppointments(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<Appointment>> {
    // Try to fetch from real API first
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const params = new URLSearchParams();
      
      if (filters?.date_from) {
        params.append("start_date", filters.date_from);
      }
      if (filters?.date_to) {
        params.append("end_date", filters.date_to);
      }
      if (filters?.status && filters.status !== "all") {
        params.append("status", filters.status);
      }
      if (filters?.location_id) {
        params.append("location_id", filters.location_id);
      }
      if (pagination?.page) {
        params.append("page", pagination.page.toString());
      }
      if (pagination?.limit) {
        params.append("limit", pagination.limit.toString());
      }

      const response = await fetcher.get<{ data: any[] }>(
        `/api/provider/bookings?${params.toString()}`,
        { timeoutMs: PROVIDER_BOOTSTRAP_TIMEOUT_MS, staleTimeMs: 0 }
      );
      const bookings = response.data || [];
      return transformBookingRowsToAppointments(bookings, filters, pagination);
    } catch (error: any) {
      await this.logProviderApiFailure(
        "/api/provider/bookings",
        "GET",
        error,
        undefined,
        undefined,
        { filters, pagination },
      );
      throw new Error(`Failed to fetch appointments: ${error?.message || String(error)}`);
    }
  }

  async getAppointment(id: string): Promise<Appointment> {
    try {
      // When id is composite (e.g. "uuid-svc-0" from expanded calendar), use root booking id
      const bookingId = rootBookingId(id);
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any }>(`/api/provider/bookings/${bookingId}`, {
        staleTimeMs: 0,
      });
      const booking = response.data;
      
      // Transform using same logic as listAppointments for consistency
      const services = booking.services || [];
      const firstSvc = services[0] || {};
      const apt = this.buildAppointmentFromBooking(booking, firstSvc, 0);
      (apt as any).services = services; // Include full services array for sidebar
      (apt as any).products = booking.products || [];
      (apt as any).total_paid = booking.total_paid || 0;
      (apt as any).total_refunded = booking.total_refunded || 0;
      (apt as any).tax_rate = booking.tax_rate;
      (apt as any).service_fee_amount = booking.service_fee_amount || 0;
      (apt as any).service_fee_percentage = booking.service_fee_percentage;
      (apt as any).version = booking.version;
      (apt as any).is_group_booking = booking.is_group_booking || false;
      (apt as any).group_booking_ref = booking.group_booking_ref || null;
      (apt as any).participants = booking.participants || [];
      (apt as any).recurring_series_id = booking.recurring_series_id || null;
      (apt as any).is_recurring = Boolean(booking.is_recurring || booking.recurring_series_id);
      (apt as any).recurring_series = booking.recurring_series || null;
      (apt as any).recurrence_rule = booking.recurrence_rule || null;
      (apt as any).recurrence_start_date = booking.recurrence_start_date || null;
      (apt as any).recurrence_end_date = booking.recurrence_end_date || null;
      (apt as any).recurrence_frequency = booking.recurrence_frequency || null;
      (apt as any).recurrence_last_booking_date = booking.recurrence_last_booking_date || null;
      (apt as any).recurrence_occurrences = booking.recurrence_occurrences || null;
      if (booking.provider_form_responses != null) {
        (apt as any).provider_form_responses = booking.provider_form_responses;
      }
      if (booking.custom_field_values != null) {
        (apt as any).custom_field_values = booking.custom_field_values;
      }
      return apt;
    } catch (error) {
      console.error("Failed to fetch appointment:", error);
      throw new Error("Appointment not found");
    }
  }

  /** Map API booking row to portal appointment status + optional DB status (for calendar / Mangomint adapter). */
  private mapAppointmentStatusFromBooking(booking: {
    status?: string;
    db_status?: string;
  }): { status: Appointment["status"]; db_status?: Appointment["db_status"] } {
    let status: Appointment["status"] = APPOINTMENT_STATUS.BOOKED;
    if (booking.status === "completed") status = APPOINTMENT_STATUS.COMPLETED;
    else if (booking.status === "cancelled") status = APPOINTMENT_STATUS.CANCELLED;
    else if (booking.status === "in_progress" || booking.status === "started") status = APPOINTMENT_STATUS.STARTED;
    else if (booking.status === "no_show") status = APPOINTMENT_STATUS.NO_SHOW;
    else if (booking.db_status === "pending") status = APPOINTMENT_STATUS.PENDING;
    else if (booking.status === "pending") status = APPOINTMENT_STATUS.PENDING;

    const out: { status: Appointment["status"]; db_status?: Appointment["db_status"] } = { status };
    if (
      booking.db_status === "pending" ||
      booking.db_status === "confirmed" ||
      booking.db_status === "in_progress" ||
      booking.db_status === "completed" ||
      booking.db_status === "cancelled" ||
      booking.db_status === "no_show"
    ) {
      out.db_status = booking.db_status as Appointment["db_status"];
    }
    return out;
  }

  /** Build Appointment from booking + service (shared by listAppointments and getAppointment) */
  private buildAppointmentFromBooking(booking: any, svc: any, _idx: number): Appointment {
    const scheduledAt = svc.scheduled_start_at ? new Date(svc.scheduled_start_at) : new Date(booking.scheduled_at);
    const scheduledDate = formatDate(scheduledAt, "yyyy-MM-dd");
    const scheduledTime = formatDate(scheduledAt, "HH:mm");
    const customer = booking.customers || {};
    const location = booking.locations || {};
    const address = booking.address || {};
    const { status, db_status } = this.mapAppointmentStatusFromBooking(booking);

    return {
      id: booking.id,
      ref_number: booking.booking_number || booking.id,
      client_id: booking.customer_id || customer.id || "",
      client_name: customer.full_name || "Client",
      client_email: customer.email || "",
      client_phone: customer.phone || "",
      service_id: svc.offering_id || svc.service_id || "",
      service_name: svc.offering_name || svc.service_name || "Service",
      team_member_id: svc.staff_id || "",
      team_member_name: svc.staff_name || svc.staff?.name || "",
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      duration_minutes: svc.duration_minutes || 60,
      price: booking.total_amount || booking.subtotal || svc.price || 0,
      status,
      created_by: booking.created_by || "Online Booking",
      created_date: booking.created_at || new Date().toISOString(),
      notes: booking.special_requests || "",
      cancellation_reason: booking.cancellation_reason,
      location_type: booking.location_type || "at_salon",
      location_id: booking.location_id || "",
      location_name: location.name || "",
      address_line1: address.line1 || booking.address_line1 || "",
      address_line2: address.line2 || booking.address_line2 || "",
      address_city: address.city || booking.address_city || "",
      address_state: address.state || booking.address_state || "",
      address_country: address.country || booking.address_country || "",
      address_postal_code: address.postal_code || booking.address_postal_code || "",
      address_latitude: address.latitude ?? booking.address_latitude,
      address_longitude: address.longitude ?? booking.address_longitude,
      apartment_unit: address.apartment_unit ?? booking.apartment_unit ?? null,
      building_name: address.building_name ?? booking.building_name ?? null,
      floor_number: address.floor_number ?? booking.floor_number ?? null,
      access_codes: address.access_codes ?? booking.access_codes ?? null,
      parking_instructions: address.parking_instructions ?? booking.parking_instructions ?? null,
      location_landmarks: address.location_landmarks ?? booking.location_landmarks ?? null,
      house_call_instructions: booking.house_call_instructions ?? null,
      current_stage: booking.current_stage,
      travel_fee: booking.travel_fee || 0,
      payment_status: booking.payment_status,
      tip_amount: booking.tip_amount || 0,
      original_price: svc.price || booking.subtotal || 0,
      discount_amount: booking.discount_amount || 0,
      discount_code: booking.discount_code || "",
      discount_reason: booking.discount_reason || "",
      subtotal: booking.subtotal || svc.price || 0,
      tax_amount: booking.tax_amount || 0,
      total_amount: booking.total_amount || booking.subtotal || svc.price || 0,
      service_customization: svc.customization || "",
      updated_date: booking.updated_at || "",
      updated_by: booking.updated_by || "",
      updated_by_name: booking.updated_by_name || "",
      client_since: customer.created_at || "",
      ...(booking.version !== undefined && { version: booking.version }),
      ...(booking.referral_source_id !== undefined && { referral_source_id: booking.referral_source_id }),
      ...(booking.is_group_booking && { is_group_booking: true, group_booking_ref: booking.group_booking_ref || null }),
      ...(booking.recurring_series_id || booking.is_recurring
        ? {
            recurring_series_id: booking.recurring_series_id || null,
            is_recurring: true,
            recurring_series: booking.recurring_series || null,
            recurrence_rule: booking.recurrence_rule || null,
            recurrence_start_date: booking.recurrence_start_date || null,
            recurrence_end_date: booking.recurrence_end_date || null,
            recurrence_frequency: booking.recurrence_frequency || null,
            recurrence_last_booking_date: booking.recurrence_last_booking_date || null,
            recurrence_occurrences: booking.recurrence_occurrences || null,
          }
        : {}),
      ...(db_status !== undefined ? { db_status } : {}),
      ...(booking.provider_form_responses != null &&
      typeof booking.provider_form_responses === "object" &&
      Object.keys(booking.provider_form_responses).length > 0
        ? { provider_form_responses: booking.provider_form_responses }
        : {}),
      ...(booking.custom_field_values != null &&
      typeof booking.custom_field_values === "object" &&
      Object.keys(booking.custom_field_values).length > 0
        ? { custom_field_values: booking.custom_field_values }
        : {}),
    } as Appointment;
  }

  async createAppointment(data: Partial<Appointment>): Promise<Appointment> {
    let bookingData: any = {};
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      
      // Combine date and time into scheduled_at
      const scheduledAt = new Date(`${data.scheduled_date}T${data.scheduled_time}`);
      
      // Prepare booking data
      // Support both new format (services/products arrays) and legacy format (single service_id)
      const servicesArray = (data as any).services || (data.service_id ? [{
        serviceId: data.service_id,
        serviceName: data.service_name,
        duration: data.duration_minutes,
        price: data.price,
      }] : []);
      
      const productsArray = (data as any).products || [];

      bookingData = {
        customer_id: data.client_id || null, // Will be null for walk-ins
        scheduled_at: scheduledAt.toISOString(),
        location_type: data.location_type || "at_salon",
        location_id: data.location_id || null,
        // Package id (if appointment was created from a package)
        package_id: (data as any).package_id || null,
        // Services array (new format)
        services: servicesArray.map((s: any) => ({
          serviceId: s.serviceId || s.service_id,
          serviceName: s.serviceName || s.service_name,
          duration: s.duration || s.duration_minutes,
          price: s.price,
          customization: s.customization || null,
          staffId: s.staffId || s.staff_id || data.team_member_id || null,
          // Add-ons: extract addonId from each addon line attached to this service
          add_on_ids: s.addons?.length
            ? s.addons.map((a: any) => a.addonId || a.id).filter(Boolean)
            : (s.add_on_ids || null),
        })),
        // Products array (new format) — include product_variant_id for variant-level stock/pricing
        products: productsArray.map((p: any) => ({
          productId: p.productId || p.product_id,
          productName: p.productName || p.product_name,
          quantity: p.quantity || 1,
          unitPrice: p.unitPrice || p.unit_price,
          totalPrice: p.totalPrice || p.total_price,
          productVariantId: p.productVariantId || p.product_variant_id || null,
        })),
        // Pricing breakdown
        subtotal: data.subtotal || data.price || 0,
        discount_amount: data.discount_amount || 0,
        discount_code: data.discount_code || null,
        discount_reason: data.discount_reason || null,
        tax_amount: data.tax_amount || 0,
        tax_rate: (data as any).tax_rate || 0, // Pass tax rate
        tip_amount: data.tip_amount || 0,
        total_amount: data.total_amount || data.subtotal || data.price || 0,
        currency: LAST_RESORT_CURRENCY,
        status: DEFAULT_APPOINTMENT_STATUS,
        special_requests: data.notes || null,
        travel_fee: data.travel_fee || 0,
        // Service fee fields (should be 0 for provider-created appointments)
        service_fee_percentage: (data as any).service_fee_percentage || 0,
        service_fee_amount: (data as any).service_fee_amount || 0,
        booking_source: (data as any).booking_source || 'provider',
        // For walk-in clients, pass customer info to create customer
        customer_name: data.client_name,
        customer_email: data.client_email || null,
        customer_phone: data.client_phone || null,
        team_member_id: data.team_member_id || null,
        // Address fields for at-home appointments
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        address_city: data.address_city || null,
        address_state: data.address_state || null,
        address_postal_code: data.address_postal_code || null,
        address_country: (data as any).address_country || null,
        address_latitude: (data as any).address_latitude || null,
        address_longitude: (data as any).address_longitude || null,
        referral_source_id: (data as any).referral_source_id ?? null,
        payment_method: (data as any).payment_method || null,
        send_notification: (data as any).send_notification ?? true,
        deposit_required: (data as any).deposit_required || false,
        deposit_percentage: (data as any).deposit_percentage || null,
        deposit_amount: (data as any).deposit_amount || null,
        payment_option: (data as any).payment_option || "full",
      };

      const response = await fetcher.post<{ data: any }>("/api/provider/bookings", bookingData);
      
      if (!response || !response.data) {
        throw new Error("Invalid response from API: " + JSON.stringify(response));
      }
      
      const booking = response.data;

      // Transform booking to appointment format
      const scheduledAtDate = new Date(booking.scheduled_at);
      const scheduledDate = scheduledAtDate.toISOString().split("T")[0];
      const scheduledTime = scheduledAtDate.toTimeString().slice(0, 5);

      const firstService = booking.services?.[0] || {};
      
      // Get customer info from booking (could be in customers relation or direct fields)
      const customer = booking.customers || {};
      const clientName = data.client_name || customer.full_name || booking.customer_name || "Client";
      const clientEmail = data.client_email || customer.email || booking.customer_email || "";
      const clientPhone = data.client_phone || customer.phone || booking.customer_phone || "";
      
      const newAppointment: Appointment = {
        id: booking.id,
        ref_number: booking.booking_number || booking.id,
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone,
        service_id: data.service_id || firstService.id || "",
        service_name: data.service_name || firstService.name || "",
        team_member_id: data.team_member_id || "",
        team_member_name: data.team_member_name || "",
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        duration_minutes: data.duration_minutes || firstService.duration_minutes || 60,
        price: data.price || booking.total_amount || 0,
        status: DEFAULT_APPOINTMENT_STATUS,
        created_by: "current_user",
        created_date: booking.created_at || new Date().toISOString(),
        notes: data.notes,
      };

      console.log("Transformed appointment:", newAppointment);
      return newAppointment;
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/bookings",
        "POST",
        error,
        undefined,
        undefined,
        bookingData
      );
      throw error;
    }
  }

  async updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment> {
    const bookingId = rootBookingId(id);
    const updateData: any = {};
    
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      
      // Include version for optimistic locking if available
      if ((data as any).version !== undefined) {
        updateData.version = (data as any).version;
      }
      
      // Status change
      if (data.status) {
        updateData.status = data.status;
      }

      // Client arrived (in-salon): set current_stage so WAITING state is stored and reflected
      if ((data as any).current_stage !== undefined) {
        updateData.current_stage = (data as any).current_stage;
      }
      if ((data as any).send_arrival_notification === true) {
        updateData.send_arrival_notification = true;
      }
      
      // Schedule change - always include if date or time is provided
      if (data.scheduled_date || data.scheduled_time) {
        const date = data.scheduled_date || new Date().toISOString().split('T')[0];
        const timeRaw = (data.scheduled_time || "09:00").trim();
        // Avoid "09:00:00:00" when time already includes seconds
        const m = timeRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        const hh = (m?.[1] ?? "9").padStart(2, "0");
        const mm = (m?.[2] ?? "00").padStart(2, "0");
        const ss = (m?.[3] ?? "00").padStart(2, "0");
        updateData.scheduled_at = `${date}T${hh}:${mm}:${ss}`;
      }
      
      // Notes/special requests - always send if provided (even if empty string)
      if (data.notes !== undefined) {
        updateData.special_requests = data.notes || "";
      }
      
      // Staff change
      if (data.team_member_id) {
        updateData.staff_id = data.team_member_id;
      }
      
      // Duration change
      if (data.duration_minutes !== undefined) {
        updateData.duration_minutes = data.duration_minutes;
      }
      
      // Price changes
      if (data.price !== undefined) {
        updateData.subtotal = data.price;
        updateData.total_amount = data.price + (data.travel_fee || 0);
      }
      
      // Build service_customization object safely
      let serviceCustomization: any = {};
      
      // Try to parse existing service_customization if it exists
      if (data.service_customization) {
        try {
          const parsed = typeof data.service_customization === 'string' 
            ? JSON.parse(data.service_customization) 
            : data.service_customization;
          serviceCustomization = { ...parsed };
        } catch (e) {
          // If parsing fails, start fresh
          console.warn("Failed to parse service_customization:", e);
        }
      }
      
      // Add service info if provided
      if (data.service_id || data.service_name) {
        serviceCustomization.service_id = data.service_id;
        serviceCustomization.service_name = data.service_name;
      }
      
      // Add client info if provided
      if (data.client_name || data.client_email || data.client_phone) {
        serviceCustomization.client_name = data.client_name;
        serviceCustomization.client_email = data.client_email;
        serviceCustomization.client_phone = data.client_phone;
      }
      
      // Only set service_customization if we have something to store
      if (Object.keys(serviceCustomization).length > 0) {
        updateData.service_customization = JSON.stringify(serviceCustomization);
      }
      
      // Location type, location_id, and address for at-home
      if (data.location_type) {
        updateData.location_type = data.location_type;
      }
      // Always forward location_id when it is explicitly provided (even on first-time set)
      if ((data as any).location_id !== undefined) {
        updateData.location_id = (data as any).location_id || null;
      }
      if (data.address_line1) {
        updateData.address_line1 = data.address_line1;
        updateData.address_line2 = data.address_line2 || "";
        updateData.address_city = data.address_city || "";
        updateData.address_postal_code = data.address_postal_code || "";
      }
      
      // Travel fee
      if (data.travel_fee !== undefined) {
        updateData.travel_fee = data.travel_fee;
        // Recalculate total if we have a subtotal
        if (updateData.subtotal !== undefined) {
          updateData.total_amount = updateData.subtotal + data.travel_fee;
        }
      }
      
      // Tip and discount
      if (data.tip_amount !== undefined) {
        updateData.tip_amount = data.tip_amount;
      }
      if (data.discount_amount !== undefined) {
        updateData.discount_amount = data.discount_amount;
      }
      if (data.discount_code !== undefined) {
        updateData.discount_code = data.discount_code;
      }
      if (data.discount_reason !== undefined) {
        updateData.discount_reason = data.discount_reason;
      }
      if (data.tax_amount !== undefined) {
        updateData.tax_amount = data.tax_amount;
      }
      if (data.subtotal !== undefined) {
        updateData.subtotal = data.subtotal;
      }
      if (data.total_amount !== undefined) {
        updateData.total_amount = data.total_amount;
      }
      
      // Multiple services and products
      if ((data as any).services !== undefined) {
        updateData.services = (data as any).services.map((s: any) => ({
          serviceId: s.serviceId || s.service_id,
          serviceName: s.serviceName || s.service_name,
          duration: s.duration || s.duration_minutes,
          price: s.price,
          customization: s.customization || null,
          // Per-service staff (falls back to appointment-level team_member_id)
          staffId: s.staffId || s.staff_id || null,
          // Add-ons attached to this service line
          add_on_ids: s.addons?.length
            ? s.addons.map((a: any) => a.addonId || a.id).filter(Boolean)
            : (s.add_on_ids || null),
        }));
      }
      if ((data as any).products !== undefined) {
        updateData.products = (data as any).products.map((p: any) => ({
          productId: p.productId || p.product_id,
          productName: p.productName || p.product_name,
          quantity: p.quantity || 1,
          unitPrice: p.unitPrice || p.unit_price,
          totalPrice: p.totalPrice || p.total_price,
          productVariantId: p.productVariantId || p.product_variant_id || null,
        }));
      }
      // Package id (preserve when updating a package-linked appointment)
      if ((data as any).package_id !== undefined) {
        updateData.package_id = (data as any).package_id || null;
      }
      
      // Cancellation
      if (data.cancellation_reason !== undefined) {
        updateData.cancellation_reason = data.cancellation_reason;
      }
      if (data.cancellation_fee !== undefined) {
        updateData.cancellation_fee = data.cancellation_fee;
      }
      // Referral source (where did this client come from?)
      if ((data as any).referral_source_id !== undefined) {
        updateData.referral_source_id = (data as any).referral_source_id || null;
      }
      
      // Ensure we have at least one field to update
      if (Object.keys(updateData).length === 0) {
        throw new Error("No fields provided to update");
      }
      
      const response = await fetcher.patch<{ data: { booking: any } }>(`/api/provider/bookings/${bookingId}`, updateData);
      const booking = response.data?.booking || response.data;
      
      if (!booking) {
        throw new Error("No booking data returned from API");
      }
      
      // Transform back to Appointment format
      // Safely handle scheduled_at - it might be null or invalid
      let scheduledDate = "";
      let scheduledTime = "";
      if (booking.scheduled_at) {
        try {
          const scheduledAt = new Date(booking.scheduled_at);
          if (!isNaN(scheduledAt.getTime())) {
            scheduledDate = formatDate(scheduledAt, "yyyy-MM-dd");
            scheduledTime = formatDate(scheduledAt, "HH:mm");
          }
        } catch {
          console.warn("Invalid scheduled_at date:", booking.scheduled_at);
        }
      }
      
      // Get first service or default
      const firstService = booking.services?.[0] || {};
      const { status, db_status } = this.mapAppointmentStatusFromBooking(booking);

      return {
        id: booking.id,
        ref_number: booking.booking_number || booking.id,
        client_name: booking.customers?.full_name || "Client",
        client_email: booking.customers?.email || "",
        client_phone: booking.customers?.phone || "",
        service_id: firstService.offering_id || firstService.service_id || "",
        service_name: firstService.offering_name || firstService.service_name || "Service",
        team_member_id: firstService.staff_id || data.team_member_id || "",
        team_member_name: firstService.staff_name || data.team_member_name || "",
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        duration_minutes: firstService.duration_minutes || 60,
        price: booking.total_amount || booking.subtotal || firstService.price || 0,
        status,
        created_by: "system",
        created_date: booking.created_at || new Date().toISOString(),
        notes: booking.special_requests,
        // Financial fields
        subtotal: booking.subtotal || 0,
        tax_amount: booking.tax_amount || 0,
        tax_rate: booking.tax_rate || 0,
        service_fee_percentage: booking.service_fee_percentage || 0,
        service_fee_amount: booking.service_fee_amount || 0,
        discount_amount: booking.discount_amount || 0,
        discount_code: booking.discount_code || "",
        discount_reason: booking.discount_reason || "",
        tip_amount: booking.tip_amount || 0,
        total_amount: booking.total_amount || 0,
        total_paid: booking.total_paid || 0,
        total_refunded: booking.total_refunded || 0,
        payment_status: booking.payment_status,
        current_stage: booking.current_stage,
        booking_id: booking.id,
        travel_fee: booking.travel_fee || 0,
        // Services array for detailed view
        services: booking.services || [],
        // Products array if available
        products: booking.products || [],
        ...(db_status !== undefined ? { db_status } : {}),
      } as Appointment;
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/bookings/${bookingId}`,
        "PATCH",
        error,
        undefined,
        undefined,
        { patchKeys: Object.keys(updateData) },
      );
      throw error;
    }
  }

  async deleteAppointment(id: string): Promise<void> {
    const bookingId = rootBookingId(id);
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      // Appointments are cancelled, not hard deleted
      await fetcher.patch(`/api/provider/bookings/${bookingId}`, { status: "cancelled" });
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/bookings/${bookingId}`,
        "PATCH",
        error,
        undefined,
        undefined,
        { status: "cancelled" }
      );
      throw error;
    }
  }

  async listSales(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<Sale>> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      
      // Build query parameters
      const params = new URLSearchParams();
      if (filters?.search) {
        params.append('search', filters.search);
      }
      if (filters?.date_from) {
        params.append('date_from', filters.date_from);
      }
      if (filters?.date_to) {
        params.append('date_to', filters.date_to);
      }
      if (filters?.location_id) {
        params.append('location_id', filters.location_id);
      }
      if (pagination?.page) {
        params.append('page', pagination.page.toString());
      }
      if (pagination?.limit) {
        params.append('limit', pagination.limit.toString());
      }

      const response = await fetcher.get<any>(
        `/api/provider/sales?${params.toString()}`
      );

      const payload = response.data;
      const salesArray = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      return {
        data: salesArray,
        total: payload?.total ?? salesArray.length,
        page: payload?.page ?? 1,
        limit: payload?.limit ?? 20,
        total_pages: payload?.total_pages ?? 1,
      };
    } catch (error: any) {
      await this.logProviderApiFailure(
        "/api/provider/sales",
        "GET",
        error,
        undefined,
        undefined,
        { filters, pagination },
      );
      
      throw new Error(`Failed to fetch sales: ${error?.message || String(error)}`);
    }
  }

  async createSale(data: Partial<Sale>): Promise<Sale> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      
      const response = await fetcher.post<{ data?: Sale } | Sale>(
        '/api/provider/sales',
        {
          location_id: (data as any).location_id || null,
          customer_id: (data as any).customer_id || null,
          staff_id: data.team_member_id || null,
          sale_date: data.date || new Date().toISOString(),
          items: (data.items || []).map((item) => ({
            type: item.type || 'product',
            item_id: (item as any).item_id ?? null,
            product_variant_id: (item as any).product_variant_id ?? null,
            name: item.name,
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
          })),
          subtotal: data.subtotal || 0,
          tax_rate: (data as any).tax_rate ?? 0,
          tax_amount: data.tax || 0,
          discount_amount: (data as any).discount_amount ?? 0,
          tip_amount: (data as any).tip_amount ?? 0,
          total_amount: data.total || 0,
          payment_method: data.payment_method || 'cash',
          payment_status: (data as any).payment_status || 'completed',
          payment_reference: (data as any).payment_reference ?? null,
          service_location_type: (data as any).service_location_type ?? null,
          house_call_address: (data as any).house_call_address ?? null,
          is_walk_in: (data as any).is_walk_in ?? false,
          notes: (data as any).notes || null,
        }
      );
      
      return (response as any).data ?? (response as Sale);
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/sales",
        "POST",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async updateSale(
    id: string,
    data: Partial<{
      payment_status: string;
      payment_provider: string | null;
      payment_provider_id: string | null;
    }>,
  ): Promise<Sale> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data?: Sale }>(`/api/provider/sales/${id}`, data);
      const inner = (response as { data?: Sale })?.data;
      if (!inner?.id) {
        throw new Error("Failed to update sale");
      }
      return inner;
    } catch (error: unknown) {
      await this.handleApiError("/api/provider/sales", "PATCH", error, id, undefined, data);
      throw error;
    }
  }

  async listPayments(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<PaymentTransaction>> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");

      // Build query parameters
      const params = new URLSearchParams();
      if (filters?.search) {
        params.append('search', filters.search);
      }
      if (filters?.date_from) {
        params.append('date_from', filters.date_from);
      }
      if (filters?.date_to) {
        params.append('date_to', filters.date_to);
      }
      if (filters?.payment_method) {
        params.append('payment_method', filters.payment_method);
      }
      if (filters?.team_member_id) {
        params.append('team_member_id', filters.team_member_id);
      }
      if (pagination?.page) {
        params.append('page', pagination.page.toString());
      }
      if (pagination?.limit) {
        params.append('limit', pagination.limit.toString());
      }

      const response = await fetcher.get<PaginatedResponse<PaymentTransaction>>(
        `/api/provider/payments?${params.toString()}`,
        { staleTimeMs: 0 },
      );
      
      return {
        data: response.data ?? [],
        total: response.total ?? 0,
        page: response.page ?? 1,
        limit: response.limit ?? 20,
        total_pages: response.total_pages ?? 1,
      };
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/payments",
        "GET",
        error,
        undefined,
        undefined,
        { filters, pagination }
      );
      throw error;
    }
  }

  async listServiceCategories(): Promise<ServiceCategory[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      
      // Get only provider-specific categories (not global categories)
      const categoriesResponse = await fetcher.get<{ data: { own_categories: any[] } }>("/api/provider/categories");
      console.log("Categories API response:", categoriesResponse);
      const own_categories = categoriesResponse.data?.own_categories || [];
      console.log("Own categories count:", own_categories.length);
      
      // Get services including variants so they can be grouped under parents
      const servicesResponse = await fetcher.get<{ data: any[] }>("/api/provider/services?include_variants=true");
      console.log("Services API response:", servicesResponse);
      const services = servicesResponse.data || [];
      console.log("Services count:", services.length, services);
      
      // Helper to map service to ServiceItem format
      const mapService = (svc: any, catId: string) => ({
        id: svc.id,
        name: svc.title || svc.name,
        category_id: svc.provider_category_id || catId,
        provider_category_id: svc.provider_category_id,
        duration_minutes: svc.duration_minutes,
        price: svc.price,
        is_active: svc.is_active ?? true,
        order: svc.display_order || 0,
        service_type: svc.service_type || "basic",
        description: svc.description,
        aftercare_description: svc.aftercare_description,
        online_booking_enabled: svc.online_booking_enabled,
        service_available_for: svc.service_available_for,
        team_member_commission_enabled: svc.team_member_commission_enabled,
        extra_time_enabled: svc.extra_time_enabled,
        extra_time_duration: svc.extra_time_duration,
        reminder_to_rebook_enabled: svc.reminder_to_rebook_enabled,
        reminder_to_rebook_weeks: svc.reminder_to_rebook_weeks,
        tax_rate: svc.tax_rate,
        pricing_name: svc.pricing_name,
        price_type: svc.price_type,
        included_services: svc.included_services,
        service_cost_percentage: svc.service_cost_percentage,
        // Variant fields
        parent_service_id: svc.parent_service_id,
        variant_name: svc.variant_name,
        variant_sort_order: svc.variant_sort_order || 0,
        // Location support
        supports_at_salon: svc.supports_at_salon !== undefined ? svc.supports_at_salon : true,
        supports_at_home: svc.supports_at_home || false,
        at_home_radius_km: svc.at_home_radius_km,
        at_home_price_adjustment: svc.at_home_price_adjustment || 0,
        // Add-on fields
        addon_category: svc.addon_category,
        applicable_service_ids: svc.applicable_service_ids,
        is_recommended: svc.is_recommended || false,
        // Advanced pricing
        pricing_options: svc.pricing_options || [],
        advanced_pricing_rules: svc.advanced_pricing_rules || [],
        // Team members
        team_member_ids: svc.team_member_ids || [],
      } as ServiceItem);
      
      // If there are no categories, create a virtual one with all services
      if (own_categories.length === 0 && services.length > 0) {
        console.log("No categories found, creating virtual 'All Services' category");
        return [{
          id: "all-services",
          name: "All Services",
          order: 0,
          color: "#FF0077",
          description: "",
          services: services.map((svc: any) => mapService(svc, "all-services")),
        }];
      }
      
      // Separate services by type for grouping
      const basicServices = services.filter((svc: any) => !svc.service_type || svc.service_type === "basic");
      const variantServices = services.filter((svc: any) => svc.service_type === "variant");
      const packageServices = services.filter((svc: any) => svc.service_type === "package");
      const addonServices = services.filter((svc: any) => svc.service_type === "addon");
      
      // Group variants under their parent services
      const servicesWithVariants = basicServices.map((basic: any) => {
        const variants = variantServices
          .filter((v: any) => v.parent_service_id === basic.id)
          .sort((a: any, b: any) => (a.variant_sort_order || 0) - (b.variant_sort_order || 0));
        return {
          ...basic,
          variants: variants.length > 0 ? variants : undefined,
        };
      });
      
      // Combine all services: basic (with variants), packages, and addons
      const allServicesGrouped = [
        ...servicesWithVariants,
        ...packageServices,
        ...addonServices,
      ];
      
      // Map categories with their services (grouped with variants)
      const providerCategories = own_categories.map((cat: any) => {
        const categoryServices = allServicesGrouped.filter((svc: any) => svc.provider_category_id === cat.id);
        console.log(`Category "${cat.name}" (${cat.id}): ${categoryServices.length} services`);
        return {
          id: cat.id,
          name: cat.name,
          order: cat.display_order || 0,
          color: cat.color || "#FF0077",
          description: cat.description,
          services: categoryServices.map((svc: any) => {
            const mapped = mapService(svc, cat.id);
            // Include variants if present
            if (svc.variants && svc.variants.length > 0) {
              (mapped as any).variants = svc.variants.map((v: any) => mapService(v, cat.id));
            }
            return mapped;
          }),
        };
      });
      
      // Check if any services don't belong to a category (orphaned services)
      const categoryIds = new Set(own_categories.map((c: any) => c.id));
      const orphanedServices = allServicesGrouped.filter((svc: any) => !categoryIds.has(svc.provider_category_id));
      if (orphanedServices.length > 0) {
        console.log(`Found ${orphanedServices.length} orphaned services, adding to 'Other' category`);
        providerCategories.push({
          id: "other",
          name: "Other Services",
          order: 9999,
          color: "#6B7280",
          description: "Services not assigned to a category",
          services: orphanedServices.map((svc: any) => {
            const mapped = mapService(svc, "other");
            // Include variants if present
            if (svc.variants && svc.variants.length > 0) {
              (mapped as any).variants = svc.variants.map((v: any) => mapService(v, "other"));
            }
            return mapped;
          }),
        });
      }
      
      console.log("Final categories with services:", providerCategories.map(c => ({ name: c.name, serviceCount: c.services.length })));
      
      return providerCategories;
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/categories",
        "GET",
        error
      );
      throw error;
    }
  }

  async listServices(): Promise<ServiceItem[]> {
    try {
      // Get all categories with their services
      const categories = await this.listServiceCategories();
      
      // Flatten all services from all categories
      const allServices: ServiceItem[] = [];
      categories.forEach((category) => {
        if (category.services && category.services.length > 0) {
          allServices.push(...category.services);
        }
      });
      
      return allServices;
    } catch (error) {
      console.error("Failed to list services:", error);
      return [];
    }
  }

  async createServiceCategory(data: Partial<ServiceCategory>): Promise<ServiceCategory> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      // Generate slug from name if not provided
      const slug = (data as any).slug || (data.name ? data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '');
      const existing = await this.listServiceCategories();
      const response = await fetcher.post<{ data: any }>("/api/provider/categories", {
        name: data.name,
        slug: slug,
        color: data.color || "#FF0077",
        description: data.description,
        display_order: (data as any).order ?? existing.length,
      });
      
      const category = response.data;
      return {
        id: category.id,
        name: category.name,
        order: category.display_order || 0,
        services: [],
        color: category.color,
        description: category.description,
      };
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/categories",
        "POST",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async updateServiceCategory(id: string, data: Partial<ServiceCategory>): Promise<ServiceCategory> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.put<{ data: any }>(`/api/provider/categories/${id}`, {
        name: data.name,
        color: data.color,
        description: data.description,
        display_order: data.order,
      });
      
      const category = response.data;
      return {
        id: category.id,
        name: category.name,
        order: category.display_order || 0,
        services: category.services || [],
        color: category.color,
        description: category.description,
      };
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/categories/${id}`,
        "PUT",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async deleteServiceCategory(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/categories/${id}`);
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/categories/${id}`,
        "DELETE",
        error
      );
      throw error;
    }
  }

  async createService(data: Partial<ServiceItem>): Promise<ServiceItem> {
    let serviceData: any = {};
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      serviceData = {
        name: data.name,
        service_type: data.service_type || "basic",
        description: data.description,
        aftercare_description: data.aftercare_description,
        price: data.price,
        duration_minutes: data.duration_minutes,
        provider_category_id: data.provider_category_id || data.category_id,
        is_active: data.is_active ?? true,
        online_booking_enabled: data.online_booking_enabled ?? true,
        service_available_for: data.service_available_for || "everyone",
        team_member_ids: (data as any).team_member_ids || [],
        team_member_commission_enabled: data.team_member_commission_enabled ?? false,
        price_type: data.price_type || "fixed",
        pricing_name: data.pricing_name,
        pricing_options: (data as any).pricing_options || [],
        extra_time_enabled: data.extra_time_enabled ?? false,
        extra_time_duration: data.extra_time_duration || 0,
        reminder_to_rebook_enabled: data.reminder_to_rebook_enabled ?? false,
        reminder_to_rebook_weeks: data.reminder_to_rebook_weeks || 4,
        service_cost_percentage: data.service_cost_percentage || 0,
        tax_rate: data.tax_rate || 0,
        included_services: data.included_services || [],
        display_order: (data as any).order || 0,
        // Variant fields
        parent_service_id: (data as any).parent_service_id || null,
        variant_name: (data as any).variant_name || null,
        variant_sort_order: (data as any).variant_sort_order || 0,
        // Location support
        supports_at_salon: (data as any).supports_at_salon !== undefined ? (data as any).supports_at_salon : true,
        supports_at_home: (data as any).supports_at_home || false,
        at_home_radius_km: (data as any).at_home_radius_km || null,
        at_home_price_adjustment: (data as any).at_home_price_adjustment || 0,
        // Add-on fields
        addon_category: (data as any).addon_category || null,
        applicable_service_ids: (data as any).applicable_service_ids || null,
        is_recommended: (data as any).is_recommended || false,
        // Advanced pricing
        advanced_pricing_rules: (data as any).advanced_pricing_rules || [],
      };
      
      const response = await fetcher.post<{ data: any }>("/api/provider/services", serviceData);
      
      const service = response.data;
      return {
        id: service.id,
        name: service.title || service.name,
        category_id: service.provider_category_id || service.category_id,
        provider_category_id: service.provider_category_id,
        duration_minutes: service.duration_minutes,
        price: service.price,
        is_active: service.is_active ?? true,
        order: service.display_order || 0,
        service_type: service.service_type || "basic",
        description: service.description,
        aftercare_description: service.aftercare_description,
        online_booking_enabled: service.online_booking_enabled,
        service_available_for: service.service_available_for,
        team_member_commission_enabled: service.team_member_commission_enabled,
        extra_time_enabled: service.extra_time_enabled,
        extra_time_duration: service.extra_time_duration,
        reminder_to_rebook_enabled: service.reminder_to_rebook_enabled,
        reminder_to_rebook_weeks: service.reminder_to_rebook_weeks,
        tax_rate: service.tax_rate,
        pricing_name: service.pricing_name,
        price_type: service.price_type,
        included_services: service.included_services,
        service_cost_percentage: service.service_cost_percentage,
      } as ServiceItem;
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/services",
        "POST",
        error,
        undefined,
        undefined,
        serviceData
      );
      throw error;
    }
  }

  async updateService(id: string, data: Partial<ServiceItem>): Promise<ServiceItem> {
    let serviceData: any = {};
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      serviceData = {
        name: data.name,
        service_type: data.service_type,
        description: data.description,
        aftercare_description: data.aftercare_description,
        price: data.price,
        duration_minutes: data.duration_minutes,
        provider_category_id: data.provider_category_id || data.category_id,
        is_active: data.is_active,
        online_booking_enabled: data.online_booking_enabled,
        service_available_for: data.service_available_for,
        team_member_ids: (data as any).team_member_ids,
        team_member_commission_enabled: data.team_member_commission_enabled,
        price_type: data.price_type,
        pricing_name: data.pricing_name,
        pricing_options: (data as any).pricing_options,
        extra_time_enabled: data.extra_time_enabled,
        extra_time_duration: data.extra_time_duration,
        reminder_to_rebook_enabled: data.reminder_to_rebook_enabled,
        reminder_to_rebook_weeks: data.reminder_to_rebook_weeks,
        service_cost_percentage: data.service_cost_percentage,
        tax_rate: data.tax_rate,
        included_services: data.included_services,
        // Variant fields
        parent_service_id: (data as any).parent_service_id !== undefined ? (data as any).parent_service_id : null,
        variant_name: (data as any).variant_name !== undefined ? (data as any).variant_name : null,
        variant_sort_order: (data as any).variant_sort_order !== undefined ? (data as any).variant_sort_order : 0,
        // Location support
        supports_at_salon: (data as any).supports_at_salon !== undefined ? (data as any).supports_at_salon : true,
        supports_at_home: (data as any).supports_at_home !== undefined ? (data as any).supports_at_home : false,
        at_home_radius_km: (data as any).at_home_radius_km !== undefined ? (data as any).at_home_radius_km : null,
        at_home_price_adjustment: (data as any).at_home_price_adjustment !== undefined ? (data as any).at_home_price_adjustment : 0,
        // Add-on fields
        addon_category: (data as any).addon_category !== undefined ? (data as any).addon_category : null,
        applicable_service_ids: (data as any).applicable_service_ids !== undefined ? (data as any).applicable_service_ids : null,
        is_recommended: (data as any).is_recommended !== undefined ? (data as any).is_recommended : false,
        // Advanced pricing
        advanced_pricing_rules: (data as any).advanced_pricing_rules !== undefined ? (data as any).advanced_pricing_rules : [],
      };
      
      const response = await fetcher.patch<{ data: any }>(`/api/provider/services/${id}`, serviceData);
      
      const service = response.data;
      return {
        id: service.id,
        name: service.title || service.name,
        category_id: service.provider_category_id || service.category_id,
        provider_category_id: service.provider_category_id,
        duration_minutes: service.duration_minutes,
        price: service.price,
        is_active: service.is_active ?? true,
        order: service.display_order || 0,
        service_type: service.service_type || "basic",
        description: service.description,
        aftercare_description: service.aftercare_description,
        online_booking_enabled: service.online_booking_enabled,
        service_available_for: service.service_available_for,
        team_member_commission_enabled: service.team_member_commission_enabled,
        extra_time_enabled: service.extra_time_enabled,
        extra_time_duration: service.extra_time_duration,
        reminder_to_rebook_enabled: service.reminder_to_rebook_enabled,
        reminder_to_rebook_weeks: service.reminder_to_rebook_weeks,
        tax_rate: service.tax_rate,
        pricing_name: service.pricing_name,
        price_type: service.price_type,
        included_services: service.included_services,
        service_cost_percentage: service.service_cost_percentage,
      } as ServiceItem;
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/services/${id}`,
        "PATCH",
        error,
        undefined,
        undefined,
        serviceData
      );
      throw error;
    }
  }

  async deleteService(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/services/${id}`);
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/services/${id}`,
        "DELETE",
        error
      );
      throw error;
    }
  }

  async reorderServices(categoryId: string, serviceIds: string[]): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      // Update display_order for each service
      await Promise.all(
        serviceIds.map((serviceId, index) =>
          fetcher.patch(`/api/provider/services/${serviceId}`, {
            display_order: index,
          })
        )
      );
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/services",
        "PATCH",
        error,
        undefined,
        undefined,
        { categoryId, serviceIds }
      );
      throw error;
    }
  }

  async getServiceResources(serviceId: string): Promise<Array<{ resource_id: string; required: boolean }>> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.get<{ data?: { resources?: Array<{ resource_id: string; required: boolean }> }; resources?: Array<{ resource_id: string; required: boolean }> }>(
      `/api/provider/services/${serviceId}/resources`
    );
    const r = (response as any)?.data?.resources ?? (response as any)?.resources;
    return Array.isArray(r) ? r : [];
  }

  async setServiceResources(
    serviceId: string,
    resources: Array<{ resource_id: string; required: boolean }>
  ): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.put(`/api/provider/services/${serviceId}/resources`, { resources });
  }

  async listProducts(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<ProductItem>> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      
      // Build query parameters
      const params = new URLSearchParams();
      if (filters?.search) {
        params.append('search', filters.search);
      }
      if (pagination?.page) {
        params.append('page', pagination.page.toString());
      }
      if (pagination?.limit) {
        params.append('limit', pagination.limit.toString());
      }

      const queryString = params.toString();
      const url = `/api/provider/products${queryString ? `?${queryString}` : ''}`;
      
      const response = await fetcher.get<{
        data: {
          products?: ProductItem[];
          data?: ProductItem[];
          total: number;
          page: number;
          limit: number;
          total_pages: number;
        };
        error: null;
      }>(url);
      
      const responseData = response.data || { total: 0, page: 1, limit: 20, total_pages: 1 };
      const productsArray = Array.isArray(responseData.products)
        ? responseData.products
        : Array.isArray(responseData.data)
          ? responseData.data
          : [];
      
      return {
        data: productsArray,
        total: responseData.total || 0,
        page: responseData.page || 1,
        limit: responseData.limit || 20,
        total_pages: responseData.total_pages || 1,
      };
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/products",
        "GET",
        error,
        undefined,
        undefined,
        { filters, pagination }
      );
      throw error; // This won't be reached but satisfies TypeScript
    }
  }

  async createProduct(data: Partial<ProductItem>): Promise<ProductItem> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: any }>("/api/provider/products", {
        name: data.name,
        barcode: data.barcode,
        brand: data.brand,
        measure: data.measure,
        amount: data.amount,
        short_description: data.short_description,
        description: data.description,
        category: data.category,
        supplier: data.supplier,
        sku: data.sku,
        quantity: data.quantity,
        low_stock_level: data.low_stock_level,
        reorder_quantity: data.reorder_quantity,
        supply_price: data.supply_price,
        retail_price: data.retail_price,
        retail_sales_enabled: data.retail_sales_enabled,
        markup: data.markup,
        tax_rate: data.tax_rate,
        team_member_commission_enabled: data.team_member_commission_enabled,
        track_stock_quantity: data.track_stock_quantity,
        receive_low_stock_notifications: data.receive_low_stock_notifications,
        image_urls: data.image_urls || [],
        is_active: data.is_active ?? true,
        has_variants: (data as any).has_variants,
        variant_option_types: (data as any).variant_option_types,
        variants: (data as any).variants,
      });
      
      const product = response.data;
      return {
        id: product.id,
        name: product.name,
        category: product.category,
        quantity: product.quantity,
        retail_price: product.retail_price,
        ...product,
      } as ProductItem;
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/products",
        "POST",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async updateProduct(id: string, data: Partial<ProductItem>): Promise<ProductItem> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: any }>(`/api/provider/products/${id}`, {
        name: data.name,
        barcode: data.barcode,
        brand: data.brand,
        measure: data.measure,
        amount: data.amount,
        short_description: data.short_description,
        description: data.description,
        category: data.category,
        supplier: data.supplier,
        sku: data.sku,
        quantity: data.quantity,
        low_stock_level: data.low_stock_level,
        reorder_quantity: data.reorder_quantity,
        supply_price: data.supply_price,
        retail_price: data.retail_price,
        retail_sales_enabled: data.retail_sales_enabled,
        markup: data.markup,
        tax_rate: data.tax_rate,
        team_member_commission_enabled: data.team_member_commission_enabled,
        track_stock_quantity: data.track_stock_quantity,
        receive_low_stock_notifications: data.receive_low_stock_notifications,
        image_urls: data.image_urls || [],
        is_active: data.is_active,
        has_variants: (data as any).has_variants,
        variant_option_types: (data as any).variant_option_types,
        variants: (data as any).variants,
      });
      
      const product = response.data;
      return {
        id: product.id,
        name: product.name,
        category: product.category,
        quantity: product.quantity,
        retail_price: product.retail_price,
        ...product,
      } as ProductItem;
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/products/${id}`,
        "PATCH",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async deleteProduct(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/products/${id}`);
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/products/${id}`,
        "DELETE",
        error
      );
      throw error;
    }
  }

  async listTeamMembers(locationId?: string): Promise<TeamMember[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const url = locationId
        ? `/api/provider/staff?location_id=${encodeURIComponent(locationId)}`
        : "/api/provider/staff";

      const response = await fetcher.get<{ data?: unknown; error?: unknown }>(url, {
        timeoutMs: PROVIDER_BOOTSTRAP_TIMEOUT_MS,
      });

      let staff: any[] = [];
      if (Array.isArray(response)) {
        staff = response;
      } else if (response && typeof response === "object") {
        const d = (response as { data?: unknown }).data;
        staff = Array.isArray(d) ? d : [];
      }

      // Transform staff to team members
      // Map API role format to frontend format
      // API returns: provider_owner, provider_manager, provider_staff
      // Frontend expects: owner, manager, employee
      const teamMembers: TeamMember[] = staff.map((member: any) => ({
        id: member.id,
        name: member.name || "Staff Member",
        email: member.email || "",
        mobile: member.phone || "",
        avatar_url: member.avatar_url || null,
        role: member.role === "provider_owner" ? "owner" : member.role === "provider_manager" ? "manager" : "employee",
        is_active: member.is_active ?? true,
        working_hours: member.working_hours ?? null,
      }));

      return teamMembers;
    } catch (error: unknown) {
      if (process.env.NODE_ENV === "development") {
        const e = error as { message?: string; status?: number; code?: string };
        console.warn("[listTeamMembers]", e?.message ?? error, e?.status, e?.code);
      }
      return [];
    }
  }

  async createTeamMember(data: Partial<TeamMember>): Promise<TeamMember> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: any }>("/api/provider/staff", {
        email: data.email,
        role: data.role === "owner" ? "provider_owner" : data.role === "manager" ? "provider_manager" : "provider_staff",
        name: data.name,
        phone: data.mobile,
      });
      
      const member = response.data;
      // Map API role format to frontend format
      // API returns: provider_owner, provider_manager, provider_staff
      // Frontend expects: owner, manager, employee
      const frontendRole = member.role === "provider_owner" ? "owner"
                        : member.role === "provider_manager" ? "manager"
                        : "employee";
      
      return {
        id: member.id,
        name: member.name || data.name || "New Member",
        email: member.email || data.email || "",
        mobile: member.phone || data.mobile || "",
        role: frontendRole,
        is_active: member.is_active ?? true,
      };
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/staff",
        "POST",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async updateTeamMember(id: string, data: Partial<TeamMember>): Promise<TeamMember> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      // Map frontend role format to API format
      // Frontend uses: owner, manager, employee
      // API expects: provider_owner, provider_manager, provider_staff
      const apiRole = data.role === "owner" ? "provider_owner"
                   : data.role === "manager" ? "provider_manager"
                   : data.role ? "provider_staff" : undefined;
      
      const response = await fetcher.patch<{ data: any }>(`/api/provider/staff/${id}`, {
        name: data.name,
        email: data.email,
        phone: data.mobile,
        avatar_url: data.avatar_url,
        role: apiRole,
        is_active: data.is_active,
      });
      
      const member = response.data;
      // Map API role format to frontend format
      const frontendRole = member.role === "provider_owner" ? "owner"
                        : member.role === "provider_manager" ? "manager"
                        : "employee";
      
      return {
        id: member.id,
        name: member.name || data.name || "",
        email: member.email || data.email || "",
        mobile: member.phone || data.mobile || "",
        avatar_url: member.avatar_url || data.avatar_url,
        role: frontendRole,
        is_active: member.is_active ?? true,
      };
    } catch (error) {
      console.error("Failed to update team member via API:", error);
      // Don't fall back to mock - throw error so UI can handle it properly
      throw error;
    }
  }

  async deleteTeamMember(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/staff/${id}`);
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/staff/${id}`,
        "DELETE",
        error
      );
      throw error;
    }
  }

  // Reference Data
  async getReferenceData(types?: string[]): Promise<Record<string, ReferenceDataItem[]>> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const typesQuery = types?.length ? `?type=${types.join(",")}` : "";
    const response = await fetcher.get<{ data: Record<string, ReferenceDataItem[]> }>(
      `/api/provider/reference-data${typesQuery}`
    );
    return response.data || {};
  }

  async listShifts(weekStart: string): Promise<Shift[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any[] }>(`/api/provider/shifts?week_start=${weekStart}`);
      return (response.data || []).map((s: any) => ({
        id: s.id,
        team_member_id: s.team_member_id,
        team_member_name: s.team_member_name || "",
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        notes: s.notes,
        is_recurring: s.is_recurring,
        recurring_pattern: s.recurring_pattern,
        source: s.source || "shift",
      }));
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/shifts?week_start=${weekStart}`,
        "GET",
        error
      );
      throw error;
    }
  }

  async createShift(data: Partial<Shift>): Promise<Shift> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: any }>("/api/provider/shifts", {
        staff_id: data.team_member_id,
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        notes: data.notes,
        is_recurring: data.is_recurring,
        recurring_pattern: (data as any).recurring_pattern,
      });
      
      const s = response.data;
      return {
        id: s.id,
        team_member_id: s.team_member_id,
        team_member_name: s.team_member_name || data.team_member_name || "",
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        notes: s.notes,
        is_recurring: s.is_recurring,
        recurring_pattern: s.recurring_pattern,
      };
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/shifts",
        "POST",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async updateShift(id: string, data: Partial<Shift>): Promise<Shift> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: any }>(`/api/provider/shifts/${id}`, {
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        notes: data.notes,
        is_recurring: data.is_recurring,
        recurring_pattern: (data as any).recurring_pattern,
      });
      
      const s = response.data;
      return {
        id: s.id,
        team_member_id: s.team_member_id,
        team_member_name: s.team_member_name || data.team_member_name || "",
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        notes: s.notes,
        is_recurring: s.is_recurring,
        recurring_pattern: s.recurring_pattern,
      };
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/shifts/${id}`,
        "PATCH",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async deleteShift(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/shifts/${id}`);
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/shifts/${id}`,
        "DELETE",
        error
      );
      throw error;
    }
  }

  // Removed duplicate listCampaigns - using real API implementation below
  // Removed duplicate createCampaign - using real API implementation below

  async listAutomations(): Promise<Automation[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any[] }>("/api/provider/automations", {
        timeoutMs: 10000,
      });
      
      // Map database structure to Automation type
      return (response.data || []).map((auto: any) => {
        const isTemplate = auto.is_template === true;
        
        return {
          id: auto.id,
          name: auto.name,
          type: this.mapTriggerTypeToAutomationType(auto.trigger_type),
          trigger: this.formatTrigger(auto.trigger_type, auto.trigger_config),
          is_active: isTemplate ? false : (auto.is_active ?? true), // Templates are inactive by default
          description: auto.description || this.getDefaultDescription(auto.trigger_type),
          is_template: isTemplate,
        };
      });
    } catch (error) {
      console.error("Failed to fetch automations:", error);
      // Return empty array instead of throwing - allows page to show "no automations" state
      return [];
    }
  }

  async createAutomation(data: Partial<Automation>): Promise<Automation> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const { trigger_type, trigger_config } = this.parseTrigger(data.trigger || "");
      
      const payload = {
        name: data.name || "New Automation",
        trigger_type,
        trigger_config,
        action_type: "sms" as const, // Default to SMS, can be configured later
        action_config: {},
        delay_minutes: this.getDelayMinutes(data.trigger || ""),
        is_active: data.is_active ?? true,
      };

      const response = await fetcher.post<{ data: any }>("/api/provider/automations", payload);
      
      return {
        id: response.data.id,
        name: response.data.name,
        type: this.mapTriggerTypeToAutomationType(response.data.trigger_type),
        trigger: this.formatTrigger(response.data.trigger_type, response.data.trigger_config),
        is_active: response.data.is_active,
        description: response.data.description || this.getDefaultDescription(response.data.trigger_type),
      };
    } catch (error) {
      console.error("Failed to create automation:", error);
      throw error;
    }
  }

  async updateAutomation(id: string, data: Partial<Automation>): Promise<Automation> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const updateData: any = {};
      
      if (data.name !== undefined) updateData.name = data.name;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;
      if (data.trigger) {
        const { trigger_type, trigger_config } = this.parseTrigger(data.trigger);
        updateData.trigger_type = trigger_type;
        updateData.trigger_config = trigger_config;
        updateData.delay_minutes = this.getDelayMinutes(data.trigger);
      }

      const response = await fetcher.patch<{ data: any }>(`/api/provider/automations/${id}`, updateData);
      
      return {
        id: response.data.id,
        name: response.data.name,
        type: this.mapTriggerTypeToAutomationType(response.data.trigger_type),
        trigger: this.formatTrigger(response.data.trigger_type, response.data.trigger_config),
        is_active: response.data.is_active,
        description: response.data.description || this.getDefaultDescription(response.data.trigger_type),
      };
    } catch (error) {
      console.error("Failed to update automation:", error);
      throw error;
    }
  }

  // Helper methods for mapping between UI and API formats
  private mapTriggerTypeToAutomationType(triggerType: string): "reminder" | "update" | "booking" | "milestone" {
    if (!triggerType) return "reminder";
    
    const type = triggerType.toLowerCase();
    
    // Reminders
    if (type.includes("reminder") || type.includes("before")) return "reminder";
    
    // Updates
    if (type.includes("update") || type.includes("confirmed") || 
        type.includes("cancelled") || type.includes("rescheduled") || 
        type.includes("no_show")) return "update";
    
    // Bookings (increase bookings tab)
    if (type.includes("booking") || type.includes("completed") || 
        type.includes("inactive") || type.includes("lead") || 
        type.includes("package_expiring") || type.includes("seasonal")) return "booking";
    
    // Milestones
    if (type.includes("birthday") || type.includes("anniversary") || 
        type.includes("milestone") || type.includes("visit_milestone") ||
        type.includes("referral") || type.includes("holiday")) return "milestone";
    
    return "reminder"; // Default
  }

  private formatTrigger(triggerType: string, triggerConfig: any): string {
    if (triggerConfig?.hours_before) {
      return `${triggerConfig.hours_before}h before`;
    }
    if (triggerConfig?.minutes_before) {
      const hours = Math.floor(triggerConfig.minutes_before / 60);
      const minutes = triggerConfig.minutes_before % 60;
      if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m before`;
      if (hours > 0) return `${hours}h before`;
      return `${minutes}m before`;
    }
    return triggerType || "";
  }

  private parseTrigger(trigger: string): { trigger_type: string; trigger_config: any } {
    // Parse triggers like "24h before", "1h before", etc.
    const match = trigger.match(/(\d+)h?\s*before/);
    if (match) {
      const hours = parseInt(match[1]);
      return {
        trigger_type: "appointment_reminder",
        trigger_config: { hours_before: hours },
      };
    }
    return {
      trigger_type: "appointment_reminder",
      trigger_config: {},
    };
  }

  private getDelayMinutes(trigger: string): number {
    const match = trigger.match(/(\d+)h?\s*before/);
    if (match) {
      return parseInt(match[1]) * 60; // Convert hours to minutes
    }
    return 0;
  }

  private getDefaultDescription(triggerType: string): string {
    if (!triggerType) return "Automated message";
    
    const descriptions: Record<string, string> = {
      appointment_reminder: "Send reminder before appointment",
      appointment_confirmed: "Send confirmation when appointment is confirmed",
      appointment_cancelled: "Send notification when appointment is cancelled",
      appointment_rescheduled: "Notify when appointment is rescheduled",
      appointment_no_show: "Follow up after no-show",
      booking_completed: "Send follow-up after booking completion",
      client_birthday: "Send birthday wishes to clients",
      client_anniversary: "Celebrate client anniversary",
      client_inactive: "Re-engage inactive clients",
      new_lead: "Welcome and follow up with new leads",
      package_expiring: "Remind clients about expiring packages",
      seasonal_promotion: "Send seasonal offers",
      visit_milestone: "Celebrate visit milestones",
      referral_received: "Thank clients for referrals",
      holiday: "Send holiday greetings",
    };
    
    return descriptions[triggerType] || "Automated message";
  }

  // Yoco Integration Methods
  // Use real API implementation when available, fallback to mock
  async getYocoIntegration(): Promise<YocoIntegration> {
    try {
      const { yocoApi } = await import("./yoco-api");
      return await yocoApi.getIntegration();
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/yoco/integration",
        "GET",
        error
      );
      throw error;
    }
  }

  async updateYocoIntegration(data: Partial<YocoIntegration>): Promise<YocoIntegration> {
    try {
      const { yocoApi } = await import("./yoco-api");
      return await yocoApi.updateIntegration(data);
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/yoco/integration",
        "PATCH",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async listYocoDevices(): Promise<YocoDevice[]> {
    try {
      const { yocoApi } = await import("./yoco-api");
      return await yocoApi.listDevices();
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/yoco/devices",
        "GET",
        error
      );
      throw error;
    }
  }

  async createYocoDevice(data: Partial<YocoDevice>): Promise<YocoDevice> {
    try {
      const { yocoApi } = await import("./yoco-api");
      return await yocoApi.createDevice(data);
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/yoco/devices",
        "POST",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async updateYocoDevice(id: string, data: Partial<YocoDevice>): Promise<YocoDevice> {
    try {
      const { yocoApi } = await import("./yoco-api");
      return await yocoApi.updateDevice(id, data);
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/yoco/devices/${id}`,
        "PATCH",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async deleteYocoDevice(id: string): Promise<void> {
    try {
      const { yocoApi } = await import("./yoco-api");
      return await yocoApi.deleteDevice(id);
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/yoco/devices/${id}`,
        "DELETE",
        error
      );
      throw error;
    }
  }

  async getYocoDevice(id: string): Promise<YocoDevice> {
    try {
      const { yocoApi } = await import("./yoco-api");
      return await yocoApi.getDevice(id);
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/yoco/devices/${id}`,
        "GET",
        error
      );
      throw error;
    }
  }

  async listYocoPayments(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<YocoPayment>> {
    try {
      const { yocoApi } = await import("./yoco-api");
      const result = await yocoApi.listPayments({
        status: filters?.status,
        device_id: filters?.search, // Can be adapted
        start_date: filters?.date_from,
        end_date: filters?.date_to,
        page: pagination?.page,
        limit: pagination?.limit,
      });
      return {
        data: result.data,
        total: result.total,
        page: result.page,
        limit: result.limit,
        total_pages: Math.ceil(result.total / result.limit),
      };
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/yoco/payments",
        "GET",
        error,
        undefined,
        undefined,
        { filters, pagination }
      );
      throw error;
    }
  }

  async createYocoPayment(data: {
    device_id: string;
    amount: number; // Amount in Rands (API will convert to cents)
    currency?: string;
    appointment_id?: string;
    booking_id?: string;
    sale_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<YocoPayment> {
    try {
      const { yocoApi } = await import("./yoco-api");
      // API expects amount in Rands, will convert to cents
      return await yocoApi.createPayment({
        device_id: data.device_id,
        amount: data.amount, // In Rands
        currency: data.currency,
        appointment_id: data.appointment_id,
        booking_id: data.booking_id,
        sale_id: data.sale_id,
        metadata: data.metadata,
      });
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/yoco/payments",
        "POST",
        error,
        undefined,
        undefined,
        data
      );
      throw error;
    }
  }

  async getYocoPayment(id: string): Promise<YocoPayment> {
    try {
      const { yocoApi } = await import("./yoco-api");
      return await yocoApi.getPayment(id);
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/yoco/payments/${id}`,
        "GET",
        error
      );
      throw error;
    }
  }

  // Waitlist Methods

  async listWaitlistEntries(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<WaitlistEntry>> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.location_id) params.append("location_id", filters.location_id);
      if (pagination?.page) params.append("page", pagination.page.toString());
      if (pagination?.limit) params.append("limit", pagination.limit.toString());

      const response = await fetcher.get<{
        data: { entries: any[]; total?: number };
      }>(`/api/provider/waitlist?${params.toString()}`);

      const bundle = response.data;
      const entries = bundle?.entries ?? [];
      const total = bundle?.total ?? entries.length;
      const limit = pagination?.limit || 100;
      const page = pagination?.page || 1;
      return {
        data: entries.map((w: any) => ({
          id: w.id,
          client_name: w.customer_name,
          client_email: w.customer_email,
          client_phone: w.customer_phone,
          service_id: w.service_id,
          service_name: w.service?.title || w.service_name || "",
          team_member_id: w.staff_id,
          team_member_name: w.staff?.name || w.staff_name || "",
          preferred_date: w.preferred_date,
          preferred_time: w.preferred_time || w.preferred_time_start,
          preferred_time_start: w.preferred_time_start,
          preferred_time_end: w.preferred_time_end,
          notes: w.notes,
          priority: mapWaitlistPriorityField(w.priority),
          status: w.status === "waiting" ? "active" : w.status,
          created_date: w.created_at || w.created_date,
          location_id: w.location_id ?? null,
        })),
        total,
        page,
        limit,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      };
    } catch (error: any) {
      await this.handleApiError(
        "/api/provider/waitlist",
        "GET",
        error,
        undefined,
        undefined,
        { filters, pagination }
      );
      throw error;
    }
  }

  async createWaitlistEntry(data: Partial<WaitlistEntry>): Promise<WaitlistEntry> {
    let apiData: any = {};
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      
      // Map frontend fields to API fields
      apiData = {
        customer_name: data.client_name,
        customer_email: data.client_email,
        customer_phone: data.client_phone,
        service_id: data.service_id || null,
        staff_id: data.team_member_id || data.staff_id || null,
        location_id: data.location_id ?? null,
        preferred_date: data.preferred_date,
        notes: data.notes,
        priority: data.priority === "high" ? 1 : data.priority === "low" ? -1 : 0,
      };
      
      // Handle preferred_time - if single time provided, use as start time
      if (data.preferred_time) {
        apiData.preferred_time_start = data.preferred_time;
      } else if (data.preferred_time_start) {
        apiData.preferred_time_start = data.preferred_time_start;
      }
      
      if (data.preferred_time_end) {
        apiData.preferred_time_end = data.preferred_time_end;
      }
      
      const response = await fetcher.post<{ data: any }>("/api/provider/waitlist", apiData);
      
      const w = response.data;
      return {
        id: w.id,
        client_name: w.customer_name,
        client_email: w.customer_email,
        client_phone: w.customer_phone,
        service_id: w.service_id,
        service_name: data.service_name || "",
        team_member_id: w.staff_id,
        team_member_name: data.team_member_name || "",
        preferred_date: w.preferred_date,
        preferred_time: w.preferred_time || w.preferred_time_start,
        preferred_time_start: w.preferred_time_start,
        preferred_time_end: w.preferred_time_end,
        notes: w.notes,
        priority: mapWaitlistPriorityField(w.priority),
        status: w.status === "waiting" ? "active" : w.status,
        created_date: w.created_at || w.created_date,
        location_id: w.location_id ?? data.location_id ?? null,
      };
    } catch (error) {
      const err = error as any;
      await this.handleApiError(
        "/api/provider/waitlist",
        "POST",
        err,
        undefined,
        undefined,
        apiData
      );
      throw err;
    }
  }

  async updateWaitlistEntry(id: string, data: Partial<WaitlistEntry>): Promise<WaitlistEntry> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      
      // Map frontend fields to API fields
      const apiData: any = {};
      if (data.client_name !== undefined) apiData.customer_name = data.client_name;
      if (data.client_email !== undefined) apiData.customer_email = data.client_email;
      if (data.client_phone !== undefined) apiData.customer_phone = data.client_phone;
      if (data.service_id !== undefined) apiData.service_id = data.service_id;
      if (data.team_member_id !== undefined || data.staff_id !== undefined) {
        apiData.staff_id = data.team_member_id || data.staff_id || null;
      }
      if (data.preferred_date !== undefined) apiData.preferred_date = data.preferred_date;
      if (data.notes !== undefined) apiData.notes = data.notes;
      if (data.status !== undefined) {
        apiData.status = data.status === "active" ? "waiting" : data.status;
      }
      if (data.priority !== undefined) {
        apiData.priority = data.priority === "high" ? 1 : data.priority === "low" ? -1 : 0;
      }
      
      // Handle preferred_time - if single time provided, use as start time
      if (data.preferred_time !== undefined) {
        apiData.preferred_time_start = data.preferred_time;
      } else if (data.preferred_time_start !== undefined) {
        apiData.preferred_time_start = data.preferred_time_start;
      }
      
      if (data.preferred_time_end !== undefined) {
        apiData.preferred_time_end = data.preferred_time_end;
      }
      if (data.location_id !== undefined) {
        apiData.location_id = data.location_id;
      }

      const response = await fetcher.patch<{ data: any }>(`/api/provider/waitlist/${id}`, apiData);
      
      const w = response.data;
      return {
        id: w.id,
        client_name: w.customer_name,
        client_email: w.customer_email,
        client_phone: w.customer_phone,
        service_id: w.service_id,
        service_name: w.service_name || data.service_name || "",
        team_member_id: w.staff_id,
        team_member_name: w.staff_name || data.team_member_name || "",
        preferred_date: w.preferred_date,
        preferred_time: w.preferred_time || w.preferred_time_start,
        preferred_time_start: w.preferred_time_start,
        preferred_time_end: w.preferred_time_end,
        notes: w.notes,
        priority: mapWaitlistPriorityField(w.priority),
        status: w.status === "waiting" ? "active" : w.status,
        created_date: w.created_at || w.created_date,
        location_id: w.location_id ?? data.location_id ?? null,
      };
    } catch (error) {
      const err = error as any;
      await this.handleApiError(`/api/provider/waitlist/${id}`, "PATCH", err, undefined, undefined, data);
      throw err;
    }
  }

  async deleteWaitlistEntry(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/waitlist/${id}`);
    } catch (error) {
      const err = error as any;
      await this.handleApiError(
        `/api/provider/waitlist/${id}`,
        "DELETE",
        err
      );
      throw err;
    }
  }

  async notifyWaitlistEntry(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.post(`/api/provider/waitlist/${id}/notify`);
    } catch (error) {
      const err = error as any;
      await this.handleApiError(
        `/api/provider/waitlist/${id}/notify`,
        "POST",
        err
      );
      throw err;
    }
  }

  async convertWaitlistToAppointment(
    waitlistId: string,
    appointmentData: Partial<Appointment>
  ): Promise<Appointment> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      
      // Use the quick-book endpoint if we have date/time
      if (appointmentData.scheduled_date && appointmentData.scheduled_time) {
        const [hours, minutes] = appointmentData.scheduled_time.split(":").map(Number);
        const dateStr = appointmentData.scheduled_date;
        const timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
        
        const response = await fetcher.post<{ data: { booking: any } }>(
          `/api/provider/waitlist/${waitlistId}/quick-book`,
          {
            date: dateStr,
            time: timeStr,
            staff_id: appointmentData.team_member_id || undefined,
          }
        );
        
        const booking = response.data.booking || response.data;
        
        // Transform booking to appointment format
        return {
          id: booking.id,
          ref_number: booking.booking_number || booking.id,
          client_name: booking.guest_name || booking.customer_name || "Client",
          client_email: booking.customer_email,
          client_phone: booking.customer_phone,
          service_id: appointmentData.service_id || "",
          service_name: appointmentData.service_name || "Service",
          team_member_id: appointmentData.team_member_id || "",
          team_member_name: appointmentData.team_member_name || "",
          scheduled_date: appointmentData.scheduled_date,
          scheduled_time: appointmentData.scheduled_time,
          duration_minutes: appointmentData.duration_minutes || 60,
          price: booking.price || 0,
          status: DEFAULT_APPOINTMENT_STATUS,
          created_by: "system",
          created_date: new Date().toISOString(),
        };
      }
      
      // Fallback to creating appointment manually
      // First get waitlist entry details
      const waitlistResponse = await fetcher.get<{ data: any }>(`/api/provider/waitlist/${waitlistId}`);
      const waitlistEntry = waitlistResponse.data;
      
      const newAppointment = await this.createAppointment({
        ...appointmentData,
        client_name: waitlistEntry.customer_name || appointmentData.client_name,
        client_email: waitlistEntry.customer_email || appointmentData.client_email,
        client_phone: waitlistEntry.customer_phone || appointmentData.client_phone,
        service_id: waitlistEntry.service_id || appointmentData.service_id,
        service_name: appointmentData.service_name || "",
        team_member_id: waitlistEntry.staff_id || appointmentData.team_member_id,
        team_member_name: appointmentData.team_member_name || "",
      });

      // Update waitlist entry status
      await this.updateWaitlistEntry(waitlistId, { status: APPOINTMENT_STATUS.BOOKED });

      return newAppointment;
    } catch (error) {
      console.error("Failed to convert waitlist to appointment:", error);
      throw error;
    }
  }

  // Recurring Appointments Methods
  async listRecurringAppointments(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<RecurringAppointment>> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (filters?.location_id) params.set("location_id", filters.location_id);

    const res = (await fetcher.get(
      `/api/provider/recurring-appointments?${params.toString()}`,
      { staleTimeMs: 0 }
    )) as {
      data?: { data?: any[]; total?: number; page?: number; total_pages?: number };
    };
    const bundle = (res as any)?.data;
    let rows: any[] = Array.isArray(bundle?.data) ? bundle.data : [];
    const total = bundle?.total ?? rows.length;
    const total_pages =
      bundle?.total_pages ?? Math.max(1, Math.ceil((bundle?.total ?? rows.length) / limit));

    if (filters?.search) {
      const s = filters.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.client_snapshot_name || "").toLowerCase().includes(s) ||
          (r.service_snapshot_title || "").toLowerCase().includes(s)
      );
    }

    const mapped = rows.map((row: any) => mapRecurringDbRowToAppointment(row));
    return {
      data: mapped,
      total,
      page,
      limit,
      total_pages,
    };
  }

  async createRecurringAppointment(
    data: Partial<RecurringAppointment> & { client_id?: string }
  ): Promise<RecurringAppointment> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const customerId = data.client_id || (data as any).customer_id;
    if (!customerId) {
      throw new Error("Customer is required for recurring appointments");
    }
    const rule = data.recurrence_rule as RecurrenceRule | string | undefined;
    const ruleObj =
      typeof rule === "object" && rule != null ? (rule as RecurrenceRule) : null;
    const rrule = recurrenceRuleToRrule(
      (ruleObj ?? { pattern: "weekly", interval: 1 }) as RecurrenceRule
    );
    const simpleFreq =
      ruleObj?.pattern === "daily"
        ? "daily"
        : ruleObj?.pattern === "weekly"
        ? "weekly"
        : ruleObj?.pattern === "biweekly"
          ? "biweekly"
          : ruleObj?.pattern === "monthly"
            ? "monthly"
            : null;
    const cartItems = (data as { cart_items?: unknown }).cart_items;
    const serviceLines = Array.isArray(cartItems)
      ? cartItems
          .filter((item: any) => item?.type === "service" && item?.service_id)
          .map((item: any) => ({
            offering_id: item.service_id,
            staff_id: data.team_member_id || undefined,
          }))
      : [];
    const baseMeta =
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? { ...(data.metadata as Record<string, unknown>) }
        : {};
    const metadata: Record<string, unknown> = {
      ...baseMeta,
      duration_minutes: data.duration_minutes ?? 60,
      price: data.price ?? 0,
    };
    if (Array.isArray(cartItems)) metadata.cart_items = cartItems;
    if (serviceLines.length > 0) metadata.services = serviceLines;
    if ((data as any).location_type === "at_home") {
      metadata.address = {
        line1: (data as any).address_line1 ?? null,
        line2: (data as any).address_line2 ?? null,
        city: (data as any).address_city ?? null,
        postal_code: (data as any).address_postal_code ?? null,
        country: (data as any).address_country ?? null,
        latitude: (data as any).address_latitude ?? null,
        longitude: (data as any).address_longitude ?? null,
      };
    }

    const sched = (data.scheduled_time || "10:00").trim();
    const preferred_time =
      sched.length >= 5 ? sched.slice(0, 5) : sched.length >= 1 ? sched : "10:00";

    const body: Record<string, unknown> = {
      customer_id: customerId,
      service_id: data.service_id || undefined,
      staff_id: data.team_member_id || undefined,
      location_id: data.location_id ?? (data as any).location_id ?? undefined,
      recurrence_rule: rrule,
      start_date: data.scheduled_date || new Date().toISOString().slice(0, 10),
      end_date:
        typeof rule === "object" && rule && "end_date" in rule
          ? (rule as RecurrenceRule).end_date
          : undefined,
      start_time: toHhMmSs(data.scheduled_time || "10:00:00"),
      notes: data.notes,
      is_active: data.status !== "cancelled",
      metadata,
      occurrences: ruleObj?.occurrences && ruleObj.occurrences > 0 ? Math.floor(ruleObj.occurrences) : undefined,
      preferred_time,
      location_type: (data as any).location_type ?? undefined,
      payment_method: (data as any).payment_method === "cash" || (data as any).payment_method === "card"
        ? (data as any).payment_method
        : undefined,
    };
    if (simpleFreq) body.frequency = simpleFreq;
    // Creating up to 12 initial bookings runs in parallel on the server but still
    // needs more than the default 25-second production timeout. Use 90 s.
    const res = (await fetcher.post(`/api/provider/recurring-appointments`, body, { timeoutMs: 90_000 })) as {
      data?: any;
    };
    const row = res?.data ?? res;
    return mapRecurringDbRowToAppointment(row, {
      client_name: data.client_name,
      service_name: data.service_name,
      team_member_name: data.team_member_name,
    });
  }

  async updateRecurringAppointment(
    id: string,
    data: Partial<RecurringAppointment>
  ): Promise<RecurringAppointment> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const patch: Record<string, unknown> = {};
    if (data.scheduled_date) patch.start_date = data.scheduled_date;
    if (data.scheduled_time) patch.start_time = toHhMmSs(data.scheduled_time);
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.recurrence_rule) {
      const rule = data.recurrence_rule as RecurrenceRule;
      patch.recurrence_rule = recurrenceRuleToRrule(rule);
      if (rule.end_date !== undefined) patch.end_date = rule.end_date;
    }
    if (data.status === "cancelled") patch.is_active = false;
    if (data.status === "booked") patch.is_active = true;
    if (data.metadata !== undefined) patch.metadata = data.metadata;
    if (data.frequency !== undefined) patch.frequency = data.frequency;
    if (data.end_date !== undefined) patch.end_date = data.end_date;

    const res = (await fetcher.patch(`/api/provider/recurring-appointments/${id}`, patch)) as {
      data?: any;
    };
    const row = res?.data ?? res;
    const mapped = mapRecurringDbRowToAppointment(row, {
      client_name: data.client_name,
      service_name: data.service_name,
      team_member_name: data.team_member_name,
    });
    return { ...mapped, is_exception: true };
  }

  async updateRecurringSeries(
    seriesId: string,
    data: Partial<RecurringAppointment>
  ): Promise<RecurringAppointment> {
    return this.updateRecurringAppointment(seriesId, data);
  }

  async deleteRecurringAppointment(id: string, deleteSeries?: boolean): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(
      `/api/provider/recurring-appointments/${id}${deleteSeries ? "?series=true" : ""}`
    );
  }

  // Resources Methods

  async listResources(filters?: FilterParams): Promise<Resource[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const params = new URLSearchParams();
    if (filters?.location_id) params.set("location_id", filters.location_id);
    const q = params.toString();
    const response = await fetcher.get<{ data: any[] }>(
      `/api/provider/resources${q ? `?${q}` : ""}`
    );
    let rows = response.data || [];
    if (filters?.search) {
      const search = (filters.search ?? "").toLowerCase();
      rows = rows.filter((r) => (r.name ?? "").toLowerCase().includes(search));
    }
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.resource_type || "other",
      group_id: r.group_id,
      capacity: r.capacity,
      is_active: r.is_active,
      color: r.calendar_color,
      location_id: r.location_id ?? null,
    }));
  }

  async createResource(data: Partial<Resource>): Promise<Resource> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.post<{ data: any }>("/api/provider/resources", {
      name: data.name,
      description: data.description,
      group_id: data.group_id || null,
      location_id: data.location_id ?? null,
      capacity: data.capacity || 1,
      is_active: data.is_active ?? true,
      resource_type: data.type || "other",
      calendar_color: data.color || undefined,
    });

    const r = response.data;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.resource_type || data.type || "other",
      group_id: r.group_id,
      capacity: r.capacity,
      is_active: r.is_active,
      color: r.calendar_color,
      location_id: r.location_id ?? data.location_id ?? null,
    };
  }

  async updateResource(id: string, data: Partial<Resource>): Promise<Resource> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.patch<{ data: any }>(`/api/provider/resources/${id}`, {
      name: data.name,
      description: data.description,
      group_id: data.group_id,
      location_id: data.location_id,
      capacity: data.capacity,
      is_active: data.is_active,
      resource_type: data.type,
      calendar_color: data.color,
    });

    const r = response.data;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.resource_type || data.type || "other",
      group_id: r.group_id,
      capacity: r.capacity,
      is_active: r.is_active,
      color: r.calendar_color,
      location_id: r.location_id ?? data.location_id ?? null,
    };
  }

  async deleteResource(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/resources/${id}`);
  }

  async listResourceGroups(): Promise<ResourceGroup[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.get<{ data: any[] }>("/api/provider/resource-groups");
    return (response.data || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      color: g.color,
      is_active: g.is_active,
      resource_ids: g.resource_ids ?? [],
    }));
  }

  async createResourceGroup(data: Partial<ResourceGroup>): Promise<ResourceGroup> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.post<{ data: any }>("/api/provider/resource-groups", {
      name: data.name,
      description: data.description,
      color: data.color,
      is_active: data.is_active ?? true,
    });

    const g = response.data;
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      color: g.color,
      is_active: g.is_active,
      resource_ids: data.resource_ids || [],
    };
  }

  async updateResourceGroup(id: string, data: Partial<ResourceGroup>): Promise<ResourceGroup> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.patch<{ data: any }>(`/api/provider/resource-groups/${id}`, {
      name: data.name,
      description: data.description,
      color: data.color,
      is_active: data.is_active,
      resource_ids: data.resource_ids,
    });

    const g = response.data;
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      color: g.color,
      is_active: g.is_active,
      resource_ids: data.resource_ids ?? g.resource_ids ?? [],
    };
  }

  async deleteResourceGroup(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/resource-groups/${id}`);
  }

  // Express Booking Links Methods — call real API and map to UI type
  private mapExpressLinkFromApi(row: {
    id: string;
    name: string;
    slug: string;
    service_ids?: string[] | null;
    staff_ids?: string[] | null;
    location_id?: string | null;
    location_type?: string | null;
    is_active?: boolean;
    expires_at?: string | null;
    max_uses?: number | null;
    use_count?: number | null;
    created_at?: string;
  }): ExpressBookingLink {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return {
      id: row.id,
      name: row.name,
      short_code: row.slug,
      full_url: `${origin}/book/l/${encodeURIComponent(row.slug)}`,
      service_id: row.service_ids?.[0],
      service_ids: row.service_ids ?? undefined,
      team_member_id: row.staff_ids?.[0],
      location_id: row.location_id ?? undefined,
      location_type: (row.location_type === "at_salon" || row.location_type === "at_home" ? row.location_type : null) as "at_salon" | "at_home" | null | undefined,
      is_active: row.is_active ?? true,
      expires_at: row.expires_at ?? undefined,
      max_uses: row.max_uses ?? undefined,
      usage_count: row.use_count ?? 0,
      created_date: row.created_at ?? new Date().toISOString(),
    };
  }

  async listExpressBookingLinks(): Promise<ExpressBookingLink[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = await fetcher.get<{ data: any[] }>("/api/provider/express-booking", { staleTimeMs: 0 });
    const rows = res.data ?? [];
    return Array.isArray(rows) ? rows.map((r) => this.mapExpressLinkFromApi(r)) : [];
  }

  async createExpressBookingLink(
    data: Partial<ExpressBookingLink>
  ): Promise<ExpressBookingLink> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const slug = (data.short_code ?? Math.random().toString(36).substring(2, 8))
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "link";
    const serviceIds = (data.service_ids?.length ? data.service_ids : data.service_id ? [data.service_id] : []) as string[];
    const body = {
      name: data.name || "New Booking Link",
      slug,
      service_ids: serviceIds,
      staff_ids: data.team_member_id ? [data.team_member_id] : [],
      location_id: data.location_type === "at_home" ? null : (data.location_id ?? null),
      location_type: data.location_type ?? null,
      is_active: data.is_active ?? true,
      expires_at: data.expires_at ?? null,
      max_uses: data.max_uses ?? undefined,
    };
    const res = await fetcher.post<{ data: any }>("/api/provider/express-booking", body);
    if (!res.data) throw new Error("Failed to create link");
    return this.mapExpressLinkFromApi(res.data);
  }

  async updateExpressBookingLink(
    id: string,
    data: Partial<ExpressBookingLink>
  ): Promise<ExpressBookingLink> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.short_code !== undefined) {
      body.slug = data.short_code.toLowerCase().replace(/[^a-z0-9-]/g, "") || "link";
    }
    if (data.service_ids !== undefined) body.service_ids = data.service_ids ?? [];
    else if (data.service_id !== undefined) body.service_ids = data.service_id ? [data.service_id] : [];
    if (data.team_member_id !== undefined) body.staff_ids = data.team_member_id ? [data.team_member_id] : [];
    if (data.is_active !== undefined) body.is_active = data.is_active;
    if (data.expires_at !== undefined) body.expires_at = data.expires_at || null;
    if (data.max_uses !== undefined) body.max_uses = data.max_uses ?? null;
    if (data.location_type !== undefined) {
      body.location_type = data.location_type ?? null;
      body.location_id = data.location_type === "at_home" ? null : (data.location_id ?? null);
    } else if (data.location_id !== undefined) body.location_id = data.location_id ?? null;
    const res = await fetcher.patch<{ data: any }>(`/api/provider/express-booking/${id}`, body);
    if (!res.data) throw new Error("Failed to update link");
    return this.mapExpressLinkFromApi(res.data);
  }

  async deleteExpressBookingLink(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/express-booking/${id}`);
  }

  // Cancellation Policies Methods
  private mapCancellationPolicyFromApi(p: any): CancellationPolicy {
    return {
      id: p.id,
      name: p.name || "",
      description: p.policy_text || undefined,
      cancellation_window_hours: p.hours_before ?? p.cancellation_window_hours ?? 24,
      refund_percentage: p.refund_percentage ?? 0,
      allow_reschedule: p.allow_reschedule ?? true,
      reschedule_window_hours: p.reschedule_window_hours,
      is_default: p.is_default ?? false,
    };
  }

  async listCancellationPolicies(): Promise<CancellationPolicy[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.get(`/api/provider/cancellation-policies`)) as { data?: any[] };
    const list = Array.isArray(res?.data) ? res.data : [];
    return list.map((p) => this.mapCancellationPolicyFromApi(p));
  }

  async createCancellationPolicy(data: Partial<CancellationPolicy>): Promise<CancellationPolicy> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const body = {
      name: data.name || "Policy",
      hours_before: data.cancellation_window_hours ?? 24,
      refund_percentage: data.refund_percentage ?? 0,
      is_default: data.is_default ?? false,
    };
    const res = (await fetcher.post(`/api/provider/cancellation-policies`, body)) as { data?: any };
    const p = (res as any)?.data;
    return this.mapCancellationPolicyFromApi(p);
  }

  async updateCancellationPolicy(
    id: string,
    data: Partial<CancellationPolicy>
  ): Promise<CancellationPolicy> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.cancellation_window_hours !== undefined)
      body.hours_before = data.cancellation_window_hours;
    if (data.refund_percentage !== undefined) body.refund_percentage = data.refund_percentage;
    if (data.is_default !== undefined) body.is_default = data.is_default;
    const res = (await fetcher.patch(`/api/provider/cancellation-policies/${id}`, body)) as {
      data?: any;
    };
    const p = (res as any)?.data;
    return this.mapCancellationPolicyFromApi(p);
  }

  async deleteCancellationPolicy(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/cancellation-policies/${id}`);
  }

  async getCancellationPolicyForAppointment(
    _appointmentId: string
  ): Promise<CancellationPolicy | null> {
    const policies = await this.listCancellationPolicies();
    return policies.find((p) => p.is_default) || policies[0] || null;
  }

  // Appointment Notes Methods

  async listAppointmentNotes(appointmentId: string): Promise<AppointmentNote[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.get(
      `/api/provider/bookings/${appointmentId}/notes`
    )) as { data?: { notes?: AppointmentNote[] } };
    const inner = (res as any)?.data;
    return inner?.notes || [];
  }

  async createAppointmentNote(data: Partial<AppointmentNote>): Promise<AppointmentNote> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const aid = data.appointment_id || "";
    if (!aid) throw new Error("appointment_id required");
    const res = (await fetcher.post(`/api/provider/bookings/${aid}/notes`, {
      content: data.content || "",
      is_internal: data.type !== "client_visible",
    })) as { data?: { note?: AppointmentNote } };
    const inner = (res as any)?.data;
    if (!inner?.note) throw new Error("Failed to create note");
    return inner.note;
  }

  async updateAppointmentNote(id: string, data: Partial<AppointmentNote>): Promise<AppointmentNote> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const aid = data.appointment_id;
    if (!aid) throw new Error("appointment_id required for update");
    const res = (await fetcher.patch(`/api/provider/bookings/${aid}/notes/${id}`, {
      content: data.content,
      is_internal: data.type !== "client_visible" && data.type !== undefined ? data.type === "internal" : undefined,
    })) as { data?: { note?: AppointmentNote } };
    const inner = (res as any)?.data;
    if (!inner?.note) throw new Error("Failed to update note");
    return inner.note;
  }

  async deleteAppointmentNote(id: string, appointmentId: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/bookings/${appointmentId}/notes/${id}`);
  }

  async listNoteTemplates(): Promise<NoteTemplate[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any[] }>("/api/provider/note-templates");
      return (response.data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        content: t.content,
        type: (t.type || "internal") as NoteType,
        category: t.category || undefined,
        is_active: t.is_active ?? true,
        created_date: t.created_at || t.created_date,
      }));
    } catch (error) {
      console.error("Failed to fetch note templates:", error);
      throw error;
    }
  }

  async createNoteTemplate(data: Partial<NoteTemplate>): Promise<NoteTemplate> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: any }>("/api/provider/note-templates", {
        name: data.name,
        content: data.content,
        type: data.type || "internal",
        category: data.category,
        is_active: data.is_active ?? true,
      });
      
      const t = response.data;
      return {
        id: t.id,
        name: t.name,
        content: t.content,
        type: (t.type || "internal") as NoteType,
        category: t.category || undefined,
        is_active: t.is_active ?? true,
        created_date: t.created_at || t.created_date,
      };
    } catch (error) {
      console.error("Failed to create note template:", error);
      throw error;
    }
  }

  async updateNoteTemplate(id: string, data: Partial<NoteTemplate>): Promise<NoteTemplate> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: any }>(`/api/provider/note-templates/${id}`, {
        name: data.name,
        content: data.content,
        type: data.type,
        category: data.category,
        is_active: data.is_active,
      });
      
      const t = response.data;
      return {
        id: t.id,
        name: t.name,
        content: t.content,
        type: (t.type || "internal") as NoteType,
        category: t.category || undefined,
        is_active: t.is_active ?? true,
        created_date: t.created_at || t.created_date,
      };
    } catch (error) {
      console.error("Failed to update note template:", error);
      throw error;
    }
  }

  async deleteNoteTemplate(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/note-templates/${id}`);
    } catch (error) {
      console.error("Failed to delete note template:", error);
      throw error;
    }
  }

  async getAppointmentHistory(appointmentId: string): Promise<AppointmentHistoryEntry[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.get(
      `/api/provider/bookings/${appointmentId}/events`
    )) as { data?: { events?: any[] } };
    const events = (res as any)?.data?.events || [];
    const mapAction = (t: string): AppointmentHistoryEntry["action"] => {
      const x = (t || "").toLowerCase();
      if (x.includes("cancel")) return "cancelled";
      if (x.includes("resched")) return "rescheduled";
      if (x.includes("status")) return "status_changed";
      if (x.includes("payment")) return "payment_added";
      if (x.includes("note")) return "note_added";
      if (x.includes("create")) return "created";
      return "updated";
    };
    return events.map((ev: any) => ({
      id: ev.id,
      appointment_id: appointmentId,
      action: mapAction(ev.event_type || ""),
      description: typeof ev.event_data === "string" ? ev.event_data : JSON.stringify(ev.event_data ?? {}),
      performed_by: ev.created_by || "",
      performed_by_name: ev.created_by_name || "System",
      performed_date: ev.created_at,
      metadata: ev.event_data && typeof ev.event_data === "object" ? ev.event_data : undefined,
    }));
  }

  private mapCalendarSyncRow(row: any): CalendarSync {
    const dir = row.sync_direction || "bidirectional";
    const sync_direction: CalendarSync["sync_direction"] =
      dir === "bidirectional" ? "two_way" : "one_way";
    return {
      id: row.id,
      provider: row.provider,
      calendar_id: row.calendar_id || row.ical_url,
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      expires_at: row.expires_at,
      is_active: row.is_active ?? true,
      sync_direction,
      last_sync_date: row.last_sync_at,
      sync_errors: row.sync_error ? [row.sync_error] : undefined,
      created_date: row.created_at,
    };
  }

  async listCalendarSyncs(): Promise<CalendarSync[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.get(`/api/provider/calendar/sync`)) as { data?: any[] };
    const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];
    return rows.map((r) => this.mapCalendarSyncRow(r));
  }

  async createCalendarSync(data: Partial<CalendarSync>): Promise<CalendarSync> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const body = {
      provider: data.provider,
      calendar_id: data.calendar_id,
      calendar_name: (data as any).calendar_name,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      ical_url: (data as any).ical_url,
      sync_direction:
        data.sync_direction === "two_way"
          ? "bidirectional"
          : data.sync_direction === "one_way"
            ? "app_to_calendar"
            : "bidirectional",
      is_active: data.is_active ?? true,
    };
    const res = (await fetcher.post(`/api/provider/calendar/sync`, body)) as { data?: any };
    return this.mapCalendarSyncRow((res as any).data);
  }

  async updateCalendarSync(id: string, data: Partial<CalendarSync>): Promise<CalendarSync> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const body: Record<string, unknown> = { ...data };
    if (data.sync_direction === "two_way") body.sync_direction = "bidirectional";
    if (data.sync_direction === "one_way") body.sync_direction = "app_to_calendar";
    const res = (await fetcher.patch(`/api/provider/calendar/sync/${id}`, body)) as { data?: any };
    return this.mapCalendarSyncRow((res as any).data);
  }

  async deleteCalendarSync(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/calendar/sync/${id}`);
  }

  async syncAppointmentToCalendar(
    appointmentId: string,
    calendarSyncId: string
  ): Promise<CalendarEvent> {
    const { CalendarSyncService } = await import("./calendar-sync");
    const appointment = await this.getAppointment(appointmentId);
    const syncs = await this.listCalendarSyncs();
    const sync = syncs.find((s) => s.id === calendarSyncId);
    if (!sync) throw new Error("Calendar sync not found");
    return CalendarSyncService.syncAppointmentToCalendar(appointment, sync);
  }

  async syncCalendarToAppointments(_calendarSyncId: string): Promise<void> {
    throw new Error("Calendar import from external calendars is not available yet.");
  }

  async getCalendarAuthUrl(provider: CalendarProvider): Promise<{ url: string }> {
    const response = await providerPortalFetch(`/api/provider/calendar/auth/${provider}`, {
      credentials: "include",
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || "Failed to get calendar authorization URL");
    }
    const json = await response.json();
    const url = json.url ?? json.data?.url;
    if (!url) throw new Error("No authorization URL returned");
    return { url };
  }

  async handleCalendarCallback(
    _provider: CalendarProvider,
    _code: string,
    _state?: string
  ): Promise<CalendarSync> {
    throw new Error("OAuth completes via server redirect; refresh calendar connections after authorizing.");
  }

  // Group Booking Methods

  async listGroupBookings(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<GroupBooking>> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.date_from) params.append("date_from", filters.date_from);
    if (filters?.date_to) params.append("date_to", filters.date_to);
    if (pagination?.page) params.append("page", String(pagination.page));
    if (pagination?.limit) params.append("limit", String(pagination.limit));

    const response = (await fetcher.get(
      `/api/provider/group-bookings?${params.toString()}`
    )) as {
      data?: {
        data: GroupBooking[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
      };
    };
    const inner = (response as any)?.data;
    return {
      data: inner?.data || [],
      total: inner?.total || 0,
      page: inner?.page || pagination?.page || 1,
      limit: inner?.limit || pagination?.limit || 20,
      total_pages: inner?.total_pages || 1,
    };
  }

  async getGroupBooking(id: string): Promise<GroupBooking> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.get(`/api/provider/group-bookings/${id}`)) as { data?: GroupBooking };
    const row = (res as any)?.data;
    if (!row) throw new Error("Group booking not found");
    return row as GroupBooking;
  }

  async createGroupBooking(data: Partial<GroupBooking>): Promise<GroupBooking> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.post<{ data: GroupBooking }>("/api/provider/group-bookings", data);
    return (response as any).data;
  }

  async updateGroupBooking(id: string, data: Partial<GroupBooking>): Promise<GroupBooking> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.patch<{ data: GroupBooking }>(
      `/api/provider/group-bookings/${id}`,
      data
    );
    return (response as any).data;
  }

  async deleteGroupBooking(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/group-bookings/${id}`);
  }

  async addParticipantToGroupBooking(
    groupBookingId: string,
    participant: Partial<GroupBookingParticipant>
  ): Promise<GroupBookingParticipant> {
    const bookingId = (participant as any).booking_id;
    if (!bookingId) {
      throw new Error("booking_id is required to add a participant");
    }
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.post(
      `/api/provider/group-bookings/${groupBookingId}/participants`,
      {
        booking_id: bookingId,
        participant_name: participant.client_name,
        is_primary_contact: (participant as { is_primary_contact?: boolean }).is_primary_contact,
      }
    )) as { data?: { data?: any } };
    const row = (res as any)?.data?.data ?? (res as any)?.data;
    return {
      id: row.id,
      group_booking_id: groupBookingId,
      client_name: row.participant_name,
      client_email: row.participant_email,
      client_phone: row.participant_phone,
      service_id: participant.service_id || "",
      service_name: participant.service_name || "",
      price: participant.price || 0,
      checked_in: false,
      checked_out: false,
    };
  }

  async removeParticipantFromGroupBooking(groupBookingId: string, participantId: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(
      `/api/provider/group-bookings/${groupBookingId}/participants/${participantId}`
    );
  }

  async checkInGroupParticipant(groupBookingId: string, participantId: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.post(
      `/api/provider/group-bookings/${groupBookingId}/participants/${participantId}/check-in`
    );
  }

  async checkOutGroupParticipant(groupBookingId: string, participantId: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.post(
      `/api/provider/group-bookings/${groupBookingId}/participants/${participantId}/check-out`
    );
  }

  async convertAppointmentsToGroupBooking(appointmentIds: string[]): Promise<GroupBooking> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.post(`/api/provider/group-bookings/from-bookings`, {
      booking_ids: appointmentIds,
    })) as { data?: GroupBooking };
    const row = (res as any)?.data;
    if (!row) throw new Error("Failed to create group booking");
    return row as GroupBooking;
  }

  // Time Block Methods

  async listAvailabilityBlocks(params: { from: string; to: string }): Promise<AvailabilityBlockDisplay[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const searchParams = new URLSearchParams();
      searchParams.set("from", params.from);
      searchParams.set("to", params.to);
      const response = await fetcher.get<{ data: AvailabilityBlockRaw[] }>(
        `/api/provider/availability-blocks?${searchParams.toString()}`
      );
      const raw = response.data || [];
      return normalizeAvailabilityBlocksToDisplay(raw);
    } catch (error) {
      console.warn("Failed to fetch availability blocks:", error);
      return [];
    }
  }

  async listStaffCalendarUnavailability(params: {
    date_from: string;
    date_to: string;
  }): Promise<AvailabilityBlockDisplay[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const searchParams = new URLSearchParams();
      searchParams.set("date_from", params.date_from);
      searchParams.set("date_to", params.date_to);
      const response = await fetcher.get<{ data: AvailabilityBlockDisplay[] }>(
        `/api/provider/calendar/staff-unavailability?${searchParams.toString()}`
      );
      return response.data || [];
    } catch (error) {
      console.warn("Failed to fetch staff calendar unavailability:", error);
      return [];
    }
  }

  /**
   * B8: active booking_holds as AvailabilityBlockDisplay overlays so the
   * provider calendar renders in-flight holds as ghost slots. Soft-fails
   * to an empty list (the hold endpoint is best-effort visualization, not
   * authoritative conflict data).
   */
  async listProviderBookingHolds(params: {
    date_from: string;
    date_to: string;
  }): Promise<AvailabilityBlockDisplay[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const searchParams = new URLSearchParams();
      searchParams.set("date_from", params.date_from);
      searchParams.set("date_to", params.date_to);
      const response = await fetcher.get<{ data: AvailabilityBlockDisplay[] }>(
        `/api/provider/calendar/booking-holds?${searchParams.toString()}`,
      );
      return response.data || [];
    } catch (error) {
      console.warn("Failed to fetch booking holds:", error);
      return [];
    }
  }

  async listTimeBlocks(filters?: FilterParams): Promise<TimeBlock[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const params = new URLSearchParams();
      if (filters?.date_from) params.append("date_from", filters.date_from);
      if (filters?.date_to) params.append("date_to", filters.date_to);
      if (filters?.team_member_id) params.append("staff_id", filters.team_member_id);
      if (filters?.location_id) params.append("location_id", filters.location_id);
      
      const response = await fetcher.get<{ data: any[] }>(`/api/provider/time-blocks?${params.toString()}`);
      return (response.data || []).map((tb: any) => ({
        id: tb.id,
        name: tb.name,
        description: tb.notes,
        team_member_id: tb.team_member_id,
        team_member_name: tb.team_member_name,
        date: tb.date,
        start_time: tb.start_time,
        end_time: tb.end_time,
        is_recurring: tb.is_recurring,
        recurrence_rule: tb.recurring_pattern,
        blocked_time_type_id: tb.blocked_time_type_id,
        blocked_time_type_name: tb.blocked_time_type_name,
        is_active: tb.is_active,
        created_date: tb.created_at,
      }));
    } catch (error) {
      console.error("Failed to fetch time blocks:", error);
      throw error;
    }
  }

  async getTimeBlock(id: string): Promise<TimeBlock> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any }>(`/api/provider/time-blocks/${id}`);
      const tb = response.data;
      return {
        id: tb.id,
        name: tb.name,
        description: tb.notes,
        team_member_id: tb.team_member_id,
        team_member_name: tb.team_member_name,
        date: tb.date,
        start_time: tb.start_time,
        end_time: tb.end_time,
        is_recurring: tb.is_recurring,
        recurrence_rule: tb.recurring_pattern,
        blocked_time_type_id: tb.blocked_time_type_id,
        blocked_time_type_name: tb.blocked_time_type_name,
        is_active: tb.is_active,
        created_date: tb.created_at,
      };
    } catch (error) {
      console.error("Failed to fetch time block:", error);
      throw error;
    }
  }

  async createTimeBlock(data: Partial<TimeBlock>): Promise<TimeBlock> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: any }>("/api/provider/time-blocks", {
        staff_id: data.team_member_id || null,
        blocked_time_type_id: data.blocked_time_type_id || null,
        name: data.name,
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        is_recurring: data.is_recurring,
        recurring_pattern: data.recurrence_rule,
        is_active: data.is_active ?? true,
        notes: data.description,
      });
      
      const tb = response.data;
      return {
        id: tb.id,
        name: tb.name,
        description: tb.notes,
        team_member_id: tb.team_member_id,
        team_member_name: data.team_member_name,
        date: tb.date,
        start_time: tb.start_time,
        end_time: tb.end_time,
        is_recurring: tb.is_recurring,
        recurrence_rule: tb.recurring_pattern,
        blocked_time_type_id: tb.blocked_time_type_id,
        blocked_time_type_name: data.blocked_time_type_name,
        is_active: tb.is_active,
        created_date: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Failed to create time block:", error);
      throw error;
    }
  }

  async updateTimeBlock(id: string, data: Partial<TimeBlock>): Promise<TimeBlock> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: any }>(`/api/provider/time-blocks/${id}`, {
        staff_id: data.team_member_id === undefined ? undefined : (data.team_member_id || null),
        blocked_time_type_id: data.blocked_time_type_id,
        name: data.name,
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        is_recurring: data.is_recurring,
        recurring_pattern: data.recurrence_rule,
        is_active: data.is_active,
        notes: data.description,
      });
      
      const tb = response.data;
      return {
        id: tb.id,
        name: tb.name,
        description: tb.notes,
        team_member_id: tb.team_member_id,
        team_member_name: data.team_member_name,
        date: tb.date,
        start_time: tb.start_time,
        end_time: tb.end_time,
        is_recurring: tb.is_recurring,
        recurrence_rule: tb.recurring_pattern,
        blocked_time_type_id: tb.blocked_time_type_id,
        blocked_time_type_name: data.blocked_time_type_name,
        is_active: tb.is_active,
        created_date: tb.created_at,
      };
    } catch (error) {
      console.error("Failed to update time block:", error);
      throw error;
    }
  }

  async deleteTimeBlock(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/time-blocks/${id}`);
  }

  async setDayOff(staffId: string, data: { date: string; reason?: string; type?: string }): Promise<any> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.post<{ data: any }>(`/api/provider/staff/${staffId}/days-off`, data);
    return response.data;
  }

  async removeDayOff(staffId: string, dayOffId: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/staff/${staffId}/days-off/${dayOffId}`);
  }

  async listDaysOff(staffId: string, params?: { date_from?: string; date_to?: string }): Promise<any[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const searchParams = new URLSearchParams();
    if (params?.date_from) searchParams.set("date_from", params.date_from);
    if (params?.date_to) searchParams.set("date_to", params.date_to);
    const q = searchParams.toString();
    const response = await fetcher.get<{ data: any[] }>(`/api/provider/staff/${staffId}/days-off${q ? `?${q}` : ""}`);
    return response.data || [];
  }

  async listBlockedTimeTypes(): Promise<BlockedTimeType[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any[] }>("/api/provider/blocked-time-types");
      return (response.data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        color: t.color,
        is_active: t.is_active,
        created_date: t.created_at,
      }));
    } catch (error) {
      console.error("Failed to fetch blocked time types:", error);
      throw error;
    }
  }

  async createBlockedTimeType(data: Partial<BlockedTimeType>): Promise<BlockedTimeType> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: any }>("/api/provider/blocked-time-types", {
        name: data.name,
        description: data.description,
        color: data.color,
        is_active: data.is_active ?? true,
      });
      
      const t = response.data;
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        color: t.color,
        is_active: t.is_active,
        created_date: t.created_at,
      };
    } catch (error) {
      console.error("Failed to create blocked time type:", error);
      throw error;
    }
  }

  async updateBlockedTimeType(id: string, data: Partial<BlockedTimeType>): Promise<BlockedTimeType> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: any }>(`/api/provider/blocked-time-types/${id}`, {
        name: data.name,
        description: data.description,
        color: data.color,
        is_active: data.is_active,
      });
      
      const t = response.data;
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        color: t.color,
        is_active: t.is_active,
        created_date: t.created_at,
      };
    } catch (error) {
      console.error("Failed to update blocked time type:", error);
      throw error;
    }
  }

  async deleteBlockedTimeType(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/blocked-time-types/${id}`);
  }

  // Virtual Waiting Room Methods
  async listWaitingRoomEntries(filters?: FilterParams): Promise<WaitingRoomEntry[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.location_id) params.append("location_id", filters.location_id);
    const response = await fetcher.get<{ data: WaitingRoomEntry[] }>(
      `/api/provider/waiting-room${params.toString() ? `?${params.toString()}` : ""}`
    );
    return response.data || [];
  }

  async getWaitingRoomEntry(id: string): Promise<WaitingRoomEntry> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.get<{ data: WaitingRoomEntry }>(`/api/provider/waiting-room/${id}`);
    return response.data;
  }

  async addToWaitingRoom(data: Partial<WaitingRoomEntry>): Promise<WaitingRoomEntry> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.post<{ data: WaitingRoomEntry }>(`/api/provider/waiting-room`, {
      client_name: data.client_name,
      client_email: data.client_email,
      client_phone: data.client_phone,
      appointment_id: data.appointment_id,
      service_id: data.service_id,
      service_name: data.service_name,
      team_member_id: data.team_member_id,
      team_member_name: data.team_member_name,
      checked_in_method: data.checked_in_method || "staff",
      estimated_wait_time: data.estimated_wait_time,
      notes: data.notes,
    });
    return response.data;
  }

  async updateWaitingRoomEntry(id: string, data: Partial<WaitingRoomEntry>): Promise<WaitingRoomEntry> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.patch<{ data: WaitingRoomEntry }>(
      `/api/provider/waiting-room/${id}`,
      data
    );
    return response.data;
  }

  async removeFromWaitingRoom(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/waiting-room/${id}`);
  }

  async checkInToWaitingRoom(data: Partial<WaitingRoomEntry>): Promise<WaitingRoomEntry> {
    return this.addToWaitingRoom({ ...data, checked_in_method: "self" });
  }

  async moveWaitingRoomToService(entryId: string, appointmentId?: string): Promise<Appointment> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const patchRes = await fetcher.patch<{ data: any }>(`/api/provider/waiting-room/${entryId}`, { status: "in_service" });
    const bookingId = appointmentId || patchRes?.data?.booking_id || entryId;
    return this.getAppointment(bookingId);
  }

  private mapColorSchemeRow(row: any): CalendarColorScheme {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color || "#FF0077",
      applies_to: "custom",
      is_default: row.is_default ?? false,
      created_date: row.created_at,
    };
  }

  private mapCalendarLinkRow(row: any): CalendarLink {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const feedPath = `/api/provider/calendar/links/${row.slug}/feed`;
    return {
      id: row.id,
      name: row.name,
      link_token: row.slug,
      full_url: origin ? `${origin}${feedPath}` : feedPath,
      calendar_type: "public",
      provider: "google",
      is_active: row.is_active ?? true,
      expires_at: row.expires_at || undefined,
      access_count: 0,
      created_date: row.created_at,
      settings: {
        show_client_names: true,
        show_service_details: true,
        show_team_member_names: true,
        include_cancelled: false,
        ...(typeof row.settings === "object" && row.settings ? row.settings : {}),
      },
    };
  }

  private mapRescheduleRow(row: any): RescheduleRequest {
    const os = new Date(row.original_start);
    const ns = new Date(row.new_start);
    return {
      id: row.id,
      appointment_id: row.booking_id,
      original_date: os.toISOString().slice(0, 10),
      original_time: os.toTimeString().slice(0, 5),
      new_date: ns.toISOString().slice(0, 10),
      new_time: ns.toTimeString().slice(0, 5),
      requested_by: row.requested_by || "",
      requested_by_name: "",
      reason: row.reason,
      status: row.status,
      created_date: row.created_at,
      processed_date: row.responded_at,
    };
  }

  // Calendar Colors & Icons Methods
  async listCalendarColorSchemes(): Promise<CalendarColorScheme[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.get(`/api/provider/calendar/color-schemes`)) as { data?: { data?: any[] } };
    const rows = (res as any)?.data?.data ?? (res as any)?.data ?? [];
    return (Array.isArray(rows) ? rows : []).map((r) => this.mapColorSchemeRow(r));
  }

  async createCalendarColorScheme(data: Partial<CalendarColorScheme>): Promise<CalendarColorScheme> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.post(`/api/provider/calendar/color-schemes`, {
      name: data.name,
      color: data.color,
      description: data.description,
      is_default: data.is_default,
    })) as { data?: { data?: any } };
    const row = (res as any)?.data?.data ?? (res as any)?.data;
    return this.mapColorSchemeRow(row);
  }

  async updateCalendarColorScheme(id: string, data: Partial<CalendarColorScheme>): Promise<CalendarColorScheme> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.patch(`/api/provider/calendar/color-schemes/${id}`, {
      name: data.name,
      color: data.color,
      description: data.description,
      is_default: data.is_default,
    })) as { data?: { data?: any } };
    const row = (res as any)?.data?.data ?? (res as any)?.data;
    return this.mapColorSchemeRow(row);
  }

  async deleteCalendarColorScheme(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/calendar/color-schemes/${id}`);
  }

  async getCalendarDisplayPreferences(): Promise<CalendarDisplayPreferences> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.get<{ data: any }>("/api/provider/settings/calendar-preferences");
    const prefs = response.data ?? response;
    return { ...DEFAULT_CALENDAR_DISPLAY_PREFERENCES, ...prefs } as CalendarDisplayPreferences;
  }

  async updateCalendarDisplayPreferences(
    data: Partial<CalendarDisplayPreferences>
  ): Promise<CalendarDisplayPreferences> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.patch<{ data: any }>(
      "/api/provider/settings/calendar-preferences",
      data
    );
    const prefs = response.data ?? response;
    return { ...DEFAULT_CALENDAR_DISPLAY_PREFERENCES, ...prefs } as CalendarDisplayPreferences;
  }

  // Calendar Link Sharing Methods
  async listCalendarLinks(): Promise<CalendarLink[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.get(`/api/provider/calendar/links`)) as { data?: { data?: any[] } };
    const rows = (res as any)?.data?.data ?? (res as any)?.data ?? [];
    return (Array.isArray(rows) ? rows : []).map((r) => this.mapCalendarLinkRow(r));
  }

  async createCalendarLink(data: Partial<CalendarLink>): Promise<CalendarLink> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const res = (await fetcher.post(`/api/provider/calendar/links`, {
      name: data.name || "Calendar link",
      slug: data.link_token,
      is_active: data.is_active ?? true,
      expires_at: data.expires_at,
      settings: data.settings || {},
    })) as { data?: { data?: any } };
    const row = (res as any)?.data?.data ?? (res as any)?.data;
    return this.mapCalendarLinkRow(row);
  }

  async updateCalendarLink(id: string, data: Partial<CalendarLink>): Promise<CalendarLink> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.link_token !== undefined) body.slug = data.link_token;
    if (data.is_active !== undefined) body.is_active = data.is_active;
    if (data.expires_at !== undefined) body.expires_at = data.expires_at;
    if (data.settings !== undefined) body.settings = data.settings;
    const res = (await fetcher.patch(`/api/provider/calendar/links/${id}`, body)) as {
      data?: { data?: any };
    };
    const row = (res as any)?.data?.data ?? (res as any)?.data;
    return this.mapCalendarLinkRow(row);
  }

  async deleteCalendarLink(id: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.delete(`/api/provider/calendar/links/${id}`);
  }

  async getPublicCalendarFeed(linkToken: string): Promise<any> {
    const res = await providerPortalFetch(`/api/provider/calendar/links/${encodeURIComponent(linkToken)}/feed`);
    if (!res.ok) throw new Error("Calendar feed not available");
    const content = await res.text();
    return { format: "ical", content };
  }

  // Rescheduling Methods
  async requestReschedule(appointmentId: string, data: Partial<RescheduleRequest>): Promise<RescheduleRequest> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const appointment = await this.getAppointment(appointmentId);
    const newDate = data.new_date || appointment.scheduled_date;
    const nt = data.new_time || appointment.scheduled_time;
    const newTime = nt.length === 5 ? `${nt}:00` : nt;
    const ost = appointment.scheduled_time.length === 5 ? `${appointment.scheduled_time}:00` : appointment.scheduled_time;
    const origStart = new Date(`${appointment.scheduled_date}T${ost}`);
    const origEnd = new Date(origStart.getTime() + appointment.duration_minutes * 60_000);
    const newStart = new Date(`${newDate}T${newTime}`);
    const newEnd = new Date(newStart.getTime() + appointment.duration_minutes * 60_000);
    const res = (await fetcher.post(`/api/provider/reschedule-requests`, {
      booking_id: appointmentId,
      new_start: newStart.toISOString(),
      new_end: newEnd.toISOString(),
      reason: data.reason,
    })) as { data?: any };
    const row = (res as any)?.data?.data ?? (res as any)?.data;
    return this.mapRescheduleRow(row);
  }

  async listRescheduleRequests(filters?: FilterParams): Promise<RescheduleRequest[]> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    const res = (await fetcher.get(`/api/provider/reschedule-requests?${params.toString()}`)) as {
      data?: { data?: any[] };
    };
    const rows = (res as any)?.data?.data ?? (res as any)?.data ?? [];
    return (Array.isArray(rows) ? rows : []).map((r) => this.mapRescheduleRow(r));
  }

  async approveRescheduleRequest(requestId: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.patch(`/api/provider/reschedule-requests/${requestId}`, { status: "approved" });
  }

  async rejectRescheduleRequest(requestId: string, _reason?: string): Promise<void> {
    const { fetcher } = await import("@/lib/http/fetcher");
    await fetcher.patch(`/api/provider/reschedule-requests/${requestId}`, { status: "rejected" });
  }

  async rescheduleAppointment(appointmentId: string, newDate: string, newTime: string): Promise<Appointment> {
    return this.updateAppointment(appointmentId, { scheduled_date: newDate, scheduled_time: newTime });
  }

  // At-home appointment status updates
  async startJourney(appointmentId: string, estimatedArrival?: string): Promise<Appointment> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: { booking: any } }>(
        `/api/provider/bookings/${appointmentId}/start-journey`,
        { estimated_arrival: estimatedArrival }
      );
      // Transform booking to appointment format
      return this.transformBookingToAppointment(response.data.booking);
    } catch (error) {
      console.error("Failed to start journey:", error);
      throw error;
    }
  }

  async markArrived(appointmentId: string, latitude?: number, longitude?: number): Promise<{ appointment: Appointment; otp: string | null; qr_code: any | null }> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const bookingId = rootBookingId(appointmentId);
      const response = await fetcher.post<{ data: { booking: any; otp: string | null; qr_code: any; verification_code?: string } }>(
        `/api/provider/bookings/${bookingId}/arrive`,
        { latitude, longitude }
      );
      return {
        appointment: this.transformBookingToAppointment(response.data.booking),
        otp: response.data.otp || null,
        qr_code: response.data.qr_code || null,
      };
    } catch (error) {
      console.error("Failed to mark arrived:", error);
      throw error;
    }
  }

  async startService(appointmentId: string): Promise<Appointment> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const bookingId = rootBookingId(appointmentId);
      const response = await fetcher.post<{ data: { booking: any } }>(
        `/api/provider/bookings/${bookingId}/start-service`
      );
      return this.transformBookingToAppointment(response.data.booking);
    } catch (error) {
      console.error("Failed to start service:", error);
      throw error;
    }
  }

  async completeService(appointmentId: string): Promise<Appointment> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const bookingId = rootBookingId(appointmentId);
      const response = await fetcher.post<{ data: { booking: any } }>(
        `/api/provider/bookings/${bookingId}/complete-service`
      );
      return this.transformBookingToAppointment(response.data.booking);
    } catch (error) {
      console.error("Failed to complete service:", error);
      throw error;
    }
  }

  private transformBookingToAppointment(booking: any): Appointment {
    const { status, db_status } = this.mapAppointmentStatusFromBooking({
      status: booking.status,
      db_status: booking.db_status,
    });
    return {
      id: booking.id,
      ref_number: booking.booking_number,
      client_name: booking.customer_name || "",
      service_id: booking.service_id || "",
      service_name: booking.service_name || "",
      team_member_id: booking.staff_id || "",
      team_member_name: booking.staff_name || "",
      scheduled_date: booking.scheduled_at?.split("T")[0] || "",
      scheduled_time: booking.scheduled_at?.split("T")[1]?.substring(0, 5) || "",
      duration_minutes: booking.duration_minutes || 60,
      price: parseFloat(booking.total_amount || booking.subtotal || 0),
      status,
      created_by: booking.created_by || "",
      created_date: booking.created_at || new Date().toISOString(),
      location_type: booking.location_type,
      location_id: booking.location_id,
      location_name: booking.location_name,
      address_line1: booking.address_line1,
      address_line2: booking.address_line2,
      address_city: booking.address_city,
      address_state: booking.address_state,
      address_country: booking.address_country,
      address_postal_code: booking.address_postal_code,
      address_latitude: booking.address_latitude,
      address_longitude: booking.address_longitude,
      travel_fee: booking.travel_fee,
      current_stage: booking.current_stage,
      arrival_otp: booking.arrival_otp,
      arrival_otp_expires_at: booking.arrival_otp_expires_at,
      arrival_otp_verified: booking.arrival_otp_verified,
      qr_code_data: booking.qr_code_data,
      qr_code_verification_code: booking.qr_code_verification_code,
      qr_code_expires_at: booking.qr_code_expires_at,
      qr_code_verified: booking.qr_code_verified,
      otp_enabled: booking.otp_enabled !== false, // Default to true if not set
      ...(db_status !== undefined ? { db_status } : {}),
    } as Appointment;
  }

  // Service Variants and Addons
  async getServiceVariants(serviceId: string): Promise<ServiceItem[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: { variants: any[] } }>(`/api/provider/services/${serviceId}/variants`);
      const variants = response.data?.variants || [];
      return variants.map((v: any) => ({
        id: v.id,
        name: v.variant_name || v.title || v.name,
        category_id: "",
        provider_category_id: "",
        duration_minutes: v.duration_minutes,
        price: v.price,
        is_active: true,
        order: v.variant_sort_order || 0,
        service_type: "variant",
        description: v.description,
      }));
    } catch (error) {
      console.warn("Failed to fetch service variants, returning empty array:", error);
      return [];
    }
  }

  async getServiceAddons(serviceId: string): Promise<ServiceItem[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: { addons: any[] } }>(`/api/provider/services/${serviceId}/addons`);
      const addons = response.data?.addons || [];
      return addons.map((a: any) => ({
        id: a.id,
        name: a.title || a.name,
        category_id: "",
        provider_category_id: "",
        duration_minutes: a.duration_minutes || 0,
        price: a.price || 0,
        is_active: true,
        order: a.display_order || 0,
        service_type: "addon",
        description: a.description,
      }));
    } catch (error) {
      console.warn("Failed to fetch service addons, returning empty array:", error);
      return [];
    }
  }

  // Receipt Methods
  async sendReceiptEmail(appointmentId: string, email?: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const appointment = await this.getAppointment(appointmentId);
      const recipientEmail = email || appointment.client_email;

      if (!recipientEmail) {
        throw new Error("No email address available for receipt");
      }

      const bookingId = appointmentId.includes("-svc-") ? appointmentId.split("-svc-")[0] : appointmentId;
      const response = await fetcher.post(`/api/provider/bookings/${bookingId}/receipt/send`, {});
      if (!response || (response as any).error) {
        throw new Error((response as any)?.error?.message || "Failed to send receipt");
      }
    } catch (error) {
      console.error("Failed to send receipt email:", error);
      throw error;
    }
  }

  async printReceipt(appointmentId: string): Promise<Blob> {
    try {
      const bookingId = appointmentId.includes("-svc-")
        ? appointmentId.split("-svc-")[0]!
        : appointmentId;

      const response = await providerPortalFetch(`/api/provider/bookings/${bookingId}/receipt/pdf`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch receipt PDF: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      console.error("Failed to print receipt:", error);
      throw error;
    }
  }

  // Rebook Appointment
  async rebookAppointment(appointmentId: string, newDate: Date, newTime: string): Promise<Appointment> {
    try {
      const { fetcher: _fetcher } = await import("@/lib/http/fetcher");
      const originalAppointment = await this.getAppointment(appointmentId);
      
      const rebookedData = {
        client_id: originalAppointment.client_id,
        client_name: originalAppointment.client_name,
        client_email: originalAppointment.client_email,
        client_phone: originalAppointment.client_phone,
        team_member_id: originalAppointment.team_member_id,
        service_id: originalAppointment.service_id,
        service_name: originalAppointment.service_name,
        scheduled_date: formatDate(newDate, "yyyy-MM-dd"),
        scheduled_time: newTime,
        duration_minutes: originalAppointment.duration_minutes,
        price: originalAppointment.price,
        notes: `Rebooked from ${originalAppointment.ref_number}`,
      };

      return await this.createAppointment(rebookedData);
    } catch (error) {
      console.error("Failed to rebook appointment:", error);
      throw error;
    }
  }

  // Print Methods
  async getAppointmentPrintData(appointmentId: string): Promise<any> {
    const { fetcher } = await import("@/lib/http/fetcher");
    const bookingId = appointmentId.includes("-svc-")
      ? appointmentId.split("-svc-")[0]!
      : appointmentId;
    const appointment = await this.getAppointment(appointmentId);
    const res = (await fetcher.get<{ data: Record<string, unknown> }>(
      `/api/provider/bookings/${bookingId}/receipt`
    )) as { data?: Record<string, unknown> };
    const receipt = (res && res.data) || {};
    const providerBlock = receipt.provider as { name?: string } | undefined;
    const businessName =
      (providerBlock?.name as string) || (await this.getProvider())?.business_name || "";
    const totalAmount = receipt.total_amount as number | undefined;
    const invoiceNumber = receipt.invoice_number as string | undefined;
    return {
      appointment: {
        ...appointment,
        ref_number: invoiceNumber ?? appointment.ref_number,
        price:
          typeof totalAmount === "number" && !Number.isNaN(totalAmount)
            ? totalAmount
            : appointment.price,
      },
      receipt,
      print_date: new Date().toISOString(),
      business_name: businessName,
      format: "pdf",
    };
  }

  // Marketing Campaigns
  async listCampaigns(filters?: any): Promise<any[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.type) params.append("type", filters.type);
      
      const response = await fetcher.get<{ data: any }>(
        `/api/provider/campaigns${params.toString() ? `?${params.toString()}` : ""}`
      );
      const d = response.data;
      if (Array.isArray(d)) return d;
      if (d?.items && Array.isArray(d.items)) return d.items;
      if (d?.data && Array.isArray(d.data)) return d.data;
      return [];
    } catch (error) {
      console.error("Failed to fetch campaigns:", error);
      return [];
    }
  }

  async getCampaign(id: string): Promise<any> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any }>(`/api/provider/campaigns/${id}`);
      return response.data;
    } catch (error) {
      console.error("Failed to fetch campaign:", error);
      throw error;
    }
  }

  async createCampaign(data: Partial<any>): Promise<any> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: any }>("/api/provider/campaigns", data);
      return response.data;
    } catch (error) {
      console.error("Failed to create campaign:", error);
      throw error;
    }
  }

  async updateCampaign(id: string, data: Partial<any>): Promise<any> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: any }>(`/api/provider/campaigns/${id}`, data);
      return response.data;
    } catch (error) {
      console.error("Failed to update campaign:", error);
      throw error;
    }
  }

  async deleteCampaign(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/campaigns/${id}`);
    } catch (error) {
      console.error("Failed to delete campaign:", error);
      throw error;
    }
  }

  async sendCampaign(id: string): Promise<any> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: any }>(`/api/provider/campaigns/${id}/send`, {});
      return response.data;
    } catch (error) {
      console.error("Failed to send campaign:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const providerApi: ProviderApi = new ProviderApiClient();
