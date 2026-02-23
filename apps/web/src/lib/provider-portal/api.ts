/**
 * Provider API Interface
 * Swappable interface for connecting to real backend later
 */

import { format as formatDate } from "date-fns";
import { APPOINTMENT_STATUS, DEFAULT_APPOINTMENT_STATUS } from "./constants";
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
  metadata: Record<string, any>;
}

export interface ProviderApi {
  // Provider & Location
  getProvider(): Promise<Provider>;
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
  sendCampaign(id: string): Promise<unknown>;
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
    metadata?: Record<string, any>;
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
  updateRecurringSeries(seriesId: string, data: Partial<RecurringAppointment>): Promise<void>;
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
  deleteAppointmentNote(id: string): Promise<void>;
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

  // Availability blocks (closed periods, breaks – date-specific non-bookable time)
  listAvailabilityBlocks(params: { from: string; to: string }): Promise<AvailabilityBlockDisplay[]>;
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
 * Mock Provider API Implementation
 * Uses in-memory mock data
 */
import {
  mockProvider,
  mockAppointments,
} from "./mock-data";

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

export class MockProviderApi implements ProviderApi {
  private appointments: Appointment[] = [...mockAppointments];

  // Helper method to log errors and throw
  private async handleApiError(
    endpoint: string,
    method: string,
    error: any,
    userId?: string,
    providerId?: string,
    requestData?: any
  ): Promise<never> {
    const { errorLogger } = await import("@/lib/monitoring/error-logger");
    const { healthCheckService } = await import("@/lib/monitoring/health-check");
    
    // Log error
    await errorLogger.logApiError(
      endpoint,
      method,
      error,
      userId,
      providerId,
      requestData,
      error?.status || 500
    );
    
    // Record health check failure
    await healthCheckService.recordHealthCheck({
      endpoint,
      method,
      status: "down",
      response_time_ms: 0,
      status_code: error?.status || 500,
      error: error?.message || String(error),
      checked_at: new Date().toISOString(),
    });
    
    throw new Error(`API call failed: ${error?.message || String(error)}`);
  }

  async getProvider(): Promise<Provider> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any }>("/api/provider/profile", {
        timeoutMs: 10000, // 10 second timeout
      });
      const profile = response.data;
      
      return {
        id: profile.id,
        business_name: profile.business_name || "",
        owner_name: profile.owner_name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        setup_completion: profile.setup_completion || 0,
        selected_location_id: profile.selected_location_id || null,
        business_type: profile.business_type || undefined,
      };
    } catch (error) {
      console.error("Failed to fetch real provider data:", error);
      // Don't fall back to mock data - throw error so components can show proper loading/error states
      throw new Error("Failed to load provider profile. Please refresh the page.");
    }
  }

  async getSalons(): Promise<Salon[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any[] }>("/api/provider/locations", {
        timeoutMs: 10000, // 10 second timeout
      });
      const locations = response.data || [];
      
      return locations.map((loc: any) => ({
        id: loc.id,
        name: loc.name || "",
        address: loc.address_line1 || "",
        city: loc.city || "",
        is_primary: loc.is_primary ?? false,
      }));
    } catch (error) {
      console.error("Failed to fetch real locations:", error);
      // Return empty array instead of mock data - let components handle empty state
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
      const { errorLogger: _errorLogger } = await import("@/lib/monitoring/error-logger");
      const { healthCheckService } = await import("@/lib/monitoring/health-check");
      
      const response = await fetcher.get<{ data: any }>("/api/provider/dashboard");
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
      const { errorLogger } = await import("@/lib/monitoring/error-logger");
      const { healthCheckService } = await import("@/lib/monitoring/health-check");
      
      // Log error
      await errorLogger.logApiError(
        "/api/provider/dashboard",
        "GET",
        error,
        undefined,
        undefined,
        undefined,
        error?.status || 500
      );
      
      // Record health check failure
      await healthCheckService.recordHealthCheck({
        endpoint: "/api/provider/dashboard",
        method: "GET",
        status: "down",
        response_time_ms: responseTime,
        status_code: error?.status || 500,
        error: error?.message || String(error),
        checked_at: new Date().toISOString(),
      });
      
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
      if (pagination?.page) {
        params.append("page", pagination.page.toString());
      }
      if (pagination?.limit) {
        params.append("limit", pagination.limit.toString());
      }

      const response = await fetcher.get<{ data: any[] }>(`/api/provider/bookings?${params.toString()}`, { timeoutMs: 20000 }); // 20s timeout for calendar
      console.log("Fetched bookings:", response.data);
      const bookings = response.data || [];
      const expandForCalendar = !!filters?.expand_for_calendar;

      // Helper to create appointment from booking and service
      const createAppointment = (booking: any, svc: any, idx: number): Appointment => {
        const scheduledAt = svc.scheduled_start_at ? new Date(svc.scheduled_start_at) : new Date(booking.scheduled_at);
        const scheduledDate = formatDate(scheduledAt, "yyyy-MM-dd");
        const scheduledTime = formatDate(scheduledAt, "HH:mm");
        const serviceName = svc.offering_name || svc.name || "Service";
        const serviceId = svc.offering_id || svc.id || "";
        const durationMinutes = svc.duration_minutes || 60;
        const staffId = svc.staff_id || booking.staff_id || "";
        const staffName = svc.staff_name || svc.staff?.name || booking.staff_name || "";

        const customer = booking.customers || {};
        const clientName = customer.full_name || "Client";
        const clientEmail = customer.email || "";
        const clientPhone = customer.phone || "";

        let status: Appointment["status"] = APPOINTMENT_STATUS.BOOKED;
        if (booking.status === "completed") status = APPOINTMENT_STATUS.COMPLETED;
        else if (booking.status === "cancelled") status = APPOINTMENT_STATUS.CANCELLED;
        else if (booking.status === "in_progress") status = APPOINTMENT_STATUS.STARTED;

        const location = booking.locations || {};
        const locationName = location.name || "";
        const address = booking.address || {};

        const isExpanded = expandForCalendar && (booking.services?.length || 0) > 1;
        const aptId = isExpanded ? `${booking.id}-svc-${idx}` : booking.id;

        return {
          id: aptId,
          ...(isExpanded && { booking_id: booking.id }),
          ref_number: booking.booking_number || booking.id,
          client_id: booking.customer_id || customer.id || "",
          client_name: clientName,
          client_email: clientEmail,
          client_phone: clientPhone,
          service_id: serviceId,
          service_name: serviceName,
          team_member_id: staffId,
          team_member_name: staffName,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          duration_minutes: durationMinutes,
          price: booking.total_amount || booking.subtotal || svc.price || 0,
          status,
          created_by: booking.created_by || "Online Booking",
          created_date: booking.created_at || new Date().toISOString(),
          notes: booking.special_requests || "",
          cancellation_reason: booking.cancellation_reason,
          location_type: booking.location_type || "at_salon",
          location_id: booking.location_id || "",
          location_name: locationName,
          address_line1: address.line1 || booking.address_line1 || "",
          address_line2: address.line2 || booking.address_line2 || "",
          address_city: address.city || booking.address_city || "",
          address_state: address.state || booking.address_state || "",
          address_country: address.country || booking.address_country || "",
          address_postal_code: address.postal_code || booking.address_postal_code || "",
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
          service_customization: booking.service_customization || svc.customization || "",
          updated_date: booking.updated_at || "",
          updated_by: booking.updated_by || "",
          updated_by_name: booking.updated_by_name || "",
          client_since: customer.created_at || "",
          ...(booking.version !== undefined && { version: booking.version }),
        };
      };

      // Build appointments: one per service when expandForCalendar, else one per booking
      const appointments: Appointment[] = [];
      for (const booking of bookings) {
        const services = booking.services || [];
        if (expandForCalendar && services.length > 0) {
          services.forEach((svc: any, idx: number) => {
            appointments.push(createAppointment(booking, svc, idx));
          });
        } else {
          const firstService = services[0] || {};
          appointments.push(createAppointment(booking, firstService, 0));
        }
      }

      // Apply additional filters that weren't handled by API
      let filtered = appointments;
      if (filters?.search) {
        const search = filters.search.toLowerCase();
        filtered = filtered.filter(
          (a) =>
            a.client_name.toLowerCase().includes(search) ||
            a.service_name.toLowerCase().includes(search) ||
            a.ref_number.toLowerCase().includes(search)
        );
      }

      // Only filter by team member if a specific member is selected (not "all")
      if (filters?.team_member_id && filters.team_member_id !== "all") {
        filtered = filtered.filter((a) => a.team_member_id === filters.team_member_id);
      }
      // When team_member_id is "all" or not provided, show all appointments (including unassigned)

      const page = pagination?.page || 1;
      const limit = pagination?.limit || 20;
      const start = (page - 1) * limit;
      const end = start + limit;

      return {
        data: filtered.slice(start, end),
        total: filtered.length,
        page,
        limit,
        total_pages: Math.ceil(filtered.length / limit),
      };
    } catch (error: any) {
      const { errorLogger } = await import("@/lib/monitoring/error-logger");
      const { healthCheckService } = await import("@/lib/monitoring/health-check");
      
      // Log error
      await errorLogger.logApiError(
        "/api/provider/bookings",
        "GET",
        error,
        undefined,
        undefined,
        { filters, pagination },
        error?.status || 500
      );
      
      // Record health check failure
      await healthCheckService.recordHealthCheck({
        endpoint: "/api/provider/bookings",
        method: "GET",
        status: "down",
        response_time_ms: 0,
        status_code: error?.status || 500,
        error: error?.message || String(error),
        checked_at: new Date().toISOString(),
      });
      
      throw new Error(`Failed to fetch appointments: ${error?.message || String(error)}`);
    }
  }

  async getAppointment(id: string): Promise<Appointment> {
    try {
      // When id is composite (e.g. "uuid-svc-0" from expanded calendar), use root booking id
      const bookingId = id.includes("-svc-") ? id.split("-svc-")[0] : id;
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any }>(`/api/provider/bookings/${bookingId}`);
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
      return apt;
    } catch (error) {
      console.error("Failed to fetch appointment:", error);
      throw new Error("Appointment not found");
    }
  }

  /** Build Appointment from booking + service (shared by listAppointments and getAppointment) */
  private buildAppointmentFromBooking(booking: any, svc: any, _idx: number): Appointment {
    const scheduledAt = svc.scheduled_start_at ? new Date(svc.scheduled_start_at) : new Date(booking.scheduled_at);
    const scheduledDate = formatDate(scheduledAt, "yyyy-MM-dd");
    const scheduledTime = formatDate(scheduledAt, "HH:mm");
    const customer = booking.customers || {};
    const location = booking.locations || {};
    const address = booking.address || {};
    let status: Appointment["status"] = APPOINTMENT_STATUS.BOOKED;
    if (booking.status === "completed") status = APPOINTMENT_STATUS.COMPLETED;
    else if (booking.status === "cancelled") status = APPOINTMENT_STATUS.CANCELLED;
    else if (booking.status === "in_progress") status = APPOINTMENT_STATUS.STARTED;

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
        // Services array (new format)
        services: servicesArray.map((s: any) => ({
          serviceId: s.serviceId || s.service_id,
          serviceName: s.serviceName || s.service_name,
          duration: s.duration || s.duration_minutes,
          price: s.price,
          customization: s.customization || null,
          staffId: s.staffId || s.staff_id || data.team_member_id || null, // Pass staff_id for each service
        })),
        // Products array (new format)
        products: productsArray.map((p: any) => ({
          productId: p.productId || p.product_id,
          productName: p.productName || p.product_name,
          quantity: p.quantity || 1,
          unitPrice: p.unitPrice || p.unit_price,
          totalPrice: p.totalPrice || p.total_price,
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
        currency: "ZAR",
        status: DEFAULT_APPOINTMENT_STATUS,
        special_requests: data.notes || null,
        travel_fee: data.travel_fee || 0,
        // Service fee fields (should be 0 for provider-created appointments)
        service_fee_percentage: (data as any).service_fee_percentage || 0,
        service_fee_amount: (data as any).service_fee_amount || 0,
        booking_source: (data as any).booking_source || 'walk_in', // Mark as provider-created
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
        referral_source_id: (data as any).referral_source_id ?? null,
      };

      console.log("Creating appointment with data:", bookingData);

      const response = await fetcher.post<{ data: any }>("/api/provider/bookings", bookingData);
      console.log("API response:", response);
      
      if (!response || !response.data) {
        throw new Error("Invalid response from API: " + JSON.stringify(response));
      }
      
      const booking = response.data;
      console.log("Created booking:", booking);

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
    const bookingId = id.includes("-svc-") ? id.split("-svc-")[0] : id;
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
        // Combine date and time for scheduled_at
        const date = data.scheduled_date || new Date().toISOString().split('T')[0];
        const time = data.scheduled_time || '09:00';
        updateData.scheduled_at = `${date}T${time}:00`;
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
      
      // Location type and address for at-home
      if (data.location_type) {
        updateData.location_type = data.location_type;
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
        }));
      }
      if ((data as any).products !== undefined) {
        updateData.products = (data as any).products.map((p: any) => ({
          productId: p.productId || p.product_id,
          productName: p.productName || p.product_name,
          quantity: p.quantity || 1,
          unitPrice: p.unitPrice || p.unit_price,
          totalPrice: p.totalPrice || p.total_price,
        }));
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
        status: booking.status as Appointment["status"],
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
        travel_fee: booking.travel_fee || 0,
        // Services array for detailed view
        services: booking.services || [],
        // Products array if available
        products: booking.products || [],
      } as Appointment;
    } catch (error: any) {
      await this.handleApiError(
        `/api/provider/bookings/${bookingId}`,
        "PATCH",
        error,
        undefined,
        undefined,
        {}
      );
      throw error;
    }
  }

  async deleteAppointment(id: string): Promise<void> {
    const bookingId = id.includes("-svc-") ? id.split("-svc-")[0] : id;
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

      const response = await fetcher.get<PaginatedResponse<Sale>>(
        `/api/provider/sales?${params.toString()}`
      );
      
      return {
        data: response.data ?? [],
        total: response.total ?? 0,
        page: response.page ?? 1,
        limit: response.limit ?? 20,
        total_pages: response.total_pages ?? 1,
      };
    } catch (error: any) {
      const { errorLogger } = await import("@/lib/monitoring/error-logger");
      const { healthCheckService } = await import("@/lib/monitoring/health-check");
      
      await errorLogger.logApiError(
        "/api/provider/sales",
        "GET",
        error,
        undefined,
        undefined,
        { filters, pagination },
        error?.status || 500
      );
      
      await healthCheckService.recordHealthCheck({
        endpoint: "/api/provider/sales",
        method: "GET",
        status: "down",
        response_time_ms: 0,
        status_code: error?.status || 500,
        error: error?.message || String(error),
        checked_at: new Date().toISOString(),
      });
      
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
          items: (data.items || []).map(item => ({
            type: item.type || 'product',
            item_id: (item as any).item_id || null,
            name: item.name,
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
          })),
          subtotal: data.subtotal || 0,
          tax_rate: (data as any).tax_rate || 0,
          tax_amount: data.tax || 0,
          discount_amount: (data as any).discount_amount || 0,
          total_amount: data.total || 0,
          payment_method: data.payment_method || 'cash',
          payment_status: (data as any).payment_status || 'completed',
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
        `/api/provider/payments?${params.toString()}`
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
      
      // Get services
      const servicesResponse = await fetcher.get<{ data: any[] }>("/api/provider/services");
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
          data: ProductItem[];
          total: number;
          page: number;
          limit: number;
          total_pages: number;
        };
        error: null;
      }>(url);
      
      // Extract the nested data structure
      const responseData = response.data || { data: [], total: 0, page: 1, limit: 20, total_pages: 1 };
      
      return {
        data: Array.isArray(responseData.data) ? responseData.data : [],
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
    // Try to fetch from real API first
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const url = locationId 
        ? `/api/provider/staff?location_id=${locationId}`
        : "/api/provider/staff";
      
      console.log("Fetching team members from:", url);
      const response = await fetcher.get<{ data: any[]; error: null }>(url, { timeoutMs: 20000 }); // 20s timeout for slow connections
      console.log("Staff API response:", response);
      
      // Handle both direct array response and wrapped { data: [] } response
      let staff: any[] = [];
      if (Array.isArray(response)) {
        // Direct array response (shouldn't happen with our API, but handle it)
        staff = response;
      } else if (response?.data) {
        // Wrapped response { data: [], error: null }
        staff = Array.isArray(response.data) ? response.data : [];
      } else if (response && typeof response === 'object' && !response.error) {
        // Try to extract data if response structure is different
        staff = [];
        console.warn("Unexpected response format:", response);
      }
      
      console.log("Staff count:", staff.length);

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

      console.log("Team members loaded:", teamMembers);
      return teamMembers;
    } catch (error: any) {
      console.error("Failed to fetch real team members:", error);
      console.error("Error details:", {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        details: error?.details,
      });
      // Return empty array instead of mock data
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
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const typesQuery = types?.length ? `?type=${types.join(",")}` : "";
      const response = await fetcher.get<{ data: Record<string, ReferenceDataItem[]> }>(
        `/api/provider/reference-data${typesQuery}`
      );
      return response.data || {};
    } catch (error: any) {
      // Log error but still return fallback data (reference data is acceptable to have fallback)
      const { errorLogger } = await import("@/lib/monitoring/error-logger");
      await errorLogger.logApiError(
        "/api/provider/reference-data",
        "GET",
        error,
        undefined,
        undefined,
        { types },
        error?.status || 500
      );
      // Return fallback static data if API fails (acceptable for reference data)
      return this.getFallbackReferenceData(types);
    }
  }

  private getFallbackReferenceData(types?: string[]): Record<string, ReferenceDataItem[]> {
    const allData: Record<string, ReferenceDataItem[]> = {
      service_type: [
        { id: "1", type: "service_type", value: "basic", label: "Basic Service", display_order: 1, is_active: true, metadata: {} },
        { id: "2", type: "service_type", value: "package", label: "Package", display_order: 2, is_active: true, metadata: {} },
        { id: "3", type: "service_type", value: "addon", label: "Add-on", display_order: 3, is_active: true, metadata: {} },
        { id: "4", type: "service_type", value: "variant", label: "Variant", display_order: 4, is_active: true, metadata: {} },
      ],
      duration: [
        { id: "1", type: "duration", value: "15", label: "15 minutes", display_order: 1, is_active: true, metadata: { minutes: 15 } },
        { id: "2", type: "duration", value: "30", label: "30 minutes", display_order: 2, is_active: true, metadata: { minutes: 30 } },
        { id: "3", type: "duration", value: "45", label: "45 minutes", display_order: 3, is_active: true, metadata: { minutes: 45 } },
        { id: "4", type: "duration", value: "60", label: "1 hour", display_order: 4, is_active: true, metadata: { minutes: 60 } },
        { id: "5", type: "duration", value: "90", label: "1 hour 30 minutes", display_order: 5, is_active: true, metadata: { minutes: 90 } },
        { id: "6", type: "duration", value: "120", label: "2 hours", display_order: 6, is_active: true, metadata: { minutes: 120 } },
        { id: "7", type: "duration", value: "180", label: "3 hours", display_order: 7, is_active: true, metadata: { minutes: 180 } },
      ],
      price_type: [
        { id: "1", type: "price_type", value: "fixed", label: "Fixed price", display_order: 1, is_active: true, metadata: {} },
        { id: "2", type: "price_type", value: "from", label: "Starting from", display_order: 2, is_active: true, metadata: {} },
        { id: "3", type: "price_type", value: "free", label: "Free", display_order: 3, is_active: true, metadata: {} },
        { id: "4", type: "price_type", value: "varies", label: "Price varies", display_order: 4, is_active: true, metadata: {} },
      ],
      availability: [
        { id: "1", type: "availability", value: "everyone", label: "Everyone", display_order: 1, is_active: true, metadata: {} },
        { id: "2", type: "availability", value: "women", label: "Women only", display_order: 2, is_active: true, metadata: {} },
        { id: "3", type: "availability", value: "men", label: "Men only", display_order: 3, is_active: true, metadata: {} },
      ],
      tax_rate: [
        { id: "1", type: "tax_rate", value: "0", label: "No Tax", display_order: 1, is_active: true, metadata: { rate: 0 } },
        { id: "2", type: "tax_rate", value: "15", label: "Standard Tax (15%)", display_order: 2, is_active: true, metadata: { rate: 15 } },
      ],
      team_role: [
        { id: "1", type: "team_role", value: "staff", label: "Staff", display_order: 1, is_active: true, metadata: {} },
        { id: "2", type: "team_role", value: "manager", label: "Manager", display_order: 2, is_active: true, metadata: {} },
        { id: "3", type: "team_role", value: "owner", label: "Owner", display_order: 3, is_active: true, metadata: {} },
      ],
      reminder_unit: [
        { id: "1", type: "reminder_unit", value: "days", label: "Days after", display_order: 1, is_active: true, metadata: {} },
        { id: "2", type: "reminder_unit", value: "weeks", label: "Weeks after", display_order: 2, is_active: true, metadata: {} },
      ],
      extra_time: [
        { id: "1", type: "extra_time", value: "15", label: "15 min", display_order: 1, is_active: true, metadata: { minutes: 15 } },
        { id: "2", type: "extra_time", value: "30", label: "30 min", display_order: 2, is_active: true, metadata: { minutes: 30 } },
        { id: "3", type: "extra_time", value: "45", label: "45 min", display_order: 3, is_active: true, metadata: { minutes: 45 } },
      ],
    };

    if (!types || types.length === 0) {
      return allData;
    }

    return types.reduce((acc, type) => {
      if (allData[type]) {
        acc[type] = allData[type];
      }
      return acc;
    }, {} as Record<string, ReferenceDataItem[]>);
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
    sale_id?: string;
    metadata?: Record<string, any>;
  }): Promise<YocoPayment> {
    try {
      const { yocoApi } = await import("./yoco-api");
      // API expects amount in Rands, will convert to cents
      return await yocoApi.createPayment({
        device_id: data.device_id,
        amount: data.amount, // In Rands
        currency: data.currency,
        appointment_id: data.appointment_id,
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
  private waitlistEntries: WaitlistEntry[] = [];

  async listWaitlistEntries(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<WaitlistEntry>> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (pagination?.page) params.append("page", pagination.page.toString());
      if (pagination?.limit) params.append("limit", pagination.limit.toString());
      
      const response = await fetcher.get<{ data: { items: any[]; total: number; page: number; limit: number } }>(
        `/api/provider/waitlist?${params.toString()}`
      );
      
      const { items, total, page, limit } = response.data;
      return {
        data: items.map((w: any) => ({
          id: w.id,
          client_name: w.customer_name,
          client_email: w.customer_email,
          client_phone: w.customer_phone,
          service_id: w.service_id,
          service_name: w.service_name || "",
          team_member_id: w.staff_id,
          team_member_name: w.staff_name,
          preferred_date: w.preferred_date,
          preferred_time: w.preferred_time || w.preferred_time_start, // Use preferred_time if available, fallback to start
          preferred_time_start: w.preferred_time_start,
          preferred_time_end: w.preferred_time_end,
          notes: w.notes,
          priority: w.priority === 0 ? "normal" : w.priority > 0 ? "high" : "low",
          status: w.status === "waiting" ? "active" : w.status,
          created_date: w.created_at || w.created_date,
        })),
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
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
        priority: w.priority === 0 ? "normal" : w.priority > 0 ? "high" : "low",
        status: w.status === "waiting" ? "active" : w.status,
        created_date: w.created_at || w.created_date,
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
      
      const response = await fetcher.patch<{ data: any }>(`/api/provider/waitlist/${id}`, apiData);
      
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
        priority: w.priority === 0 ? "normal" : w.priority > 0 ? "high" : "low",
        status: w.status === "waiting" ? "active" : w.status,
        created_date: w.created_at || w.created_date,
      };
    } catch (error) {
      console.warn("Failed to update waitlist entry via API, using mock:", error);
      // Fallback to mock
      const index = this.waitlistEntries.findIndex((w) => w.id === id);
      if (index === -1) throw new Error("Waitlist entry not found");
      this.waitlistEntries[index] = { ...this.waitlistEntries[index], ...data };
      return new Promise((resolve) => setTimeout(() => resolve(this.waitlistEntries[index]), 300));
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
      console.warn("Failed to convert waitlist to appointment via API, using mock:", error);
      // Fallback to mock
      const waitlistEntry = this.waitlistEntries.find((w) => w.id === waitlistId);
      if (!waitlistEntry) throw new Error("Waitlist entry not found");

      const newAppointment = await this.createAppointment({
        ...appointmentData,
        client_name: waitlistEntry.client_name,
        client_email: waitlistEntry.client_email,
        client_phone: waitlistEntry.client_phone,
        service_id: waitlistEntry.service_id,
        service_name: waitlistEntry.service_name,
        team_member_id: waitlistEntry.team_member_id || appointmentData.team_member_id,
        team_member_name: waitlistEntry.team_member_name || appointmentData.team_member_name,
      });

      // Update waitlist entry status
      await this.updateWaitlistEntry(waitlistId, { status: APPOINTMENT_STATUS.BOOKED });

      return newAppointment;
    }
  }

  // Recurring Appointments Methods
  private recurringAppointments: RecurringAppointment[] = [];

  async listRecurringAppointments(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<RecurringAppointment>> {
    let filtered = [...this.recurringAppointments];

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.client_name.toLowerCase().includes(search) ||
          a.service_name.toLowerCase().includes(search)
      );
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const start = (page - 1) * limit;

    return new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: filtered.slice(start, start + limit),
            total: filtered.length,
            page,
            limit,
            total_pages: Math.ceil(filtered.length / limit),
          }),
        300
      )
    );
  }

  async createRecurringAppointment(
    data: Partial<RecurringAppointment>
  ): Promise<RecurringAppointment> {
    const seriesId = data.series_id || `series-${Date.now()}`;
    const newAppointment: RecurringAppointment = {
      id: `recur-${Date.now()}`,
      series_id: seriesId,
      client_name: data.client_name || "New Client",
      service_id: data.service_id || "",
      service_name: data.service_name || "",
      team_member_id: data.team_member_id || "",
      team_member_name: data.team_member_name || "",
      scheduled_date: data.scheduled_date || new Date().toISOString().split("T")[0],
      scheduled_time: data.scheduled_time || "10:00",
      duration_minutes: data.duration_minutes || 60,
      price: data.price || 0,
      recurrence_rule: data.recurrence_rule || {
        pattern: "weekly",
        interval: 1,
      },
      status: DEFAULT_APPOINTMENT_STATUS,
      is_exception: false,
      created_date: new Date().toISOString(),
      ...data,
    };

    this.recurringAppointments.push(newAppointment);
    return new Promise((resolve) => setTimeout(() => resolve(newAppointment), 300));
  }

  async updateRecurringAppointment(
    id: string,
    data: Partial<RecurringAppointment>
  ): Promise<RecurringAppointment> {
    const index = this.recurringAppointments.findIndex((a) => a.id === id);
    if (index === -1) throw new Error("Recurring appointment not found");
    this.recurringAppointments[index] = {
      ...this.recurringAppointments[index],
      ...data,
      is_exception: true, // Mark as exception if modified
    };
    return new Promise((resolve) =>
      setTimeout(() => resolve(this.recurringAppointments[index]), 300)
    );
  }

  async updateRecurringSeries(
    seriesId: string,
    data: Partial<RecurringAppointment>
  ): Promise<void> {
    this.recurringAppointments = this.recurringAppointments.map((a) =>
      a.series_id === seriesId ? { ...a, ...data } : a
    );
    return new Promise((resolve) => setTimeout(() => resolve(), 300));
  }

  async deleteRecurringAppointment(id: string, deleteSeries?: boolean): Promise<void> {
    if (deleteSeries) {
      const appointment = this.recurringAppointments.find((a) => a.id === id);
      if (appointment) {
        this.recurringAppointments = this.recurringAppointments.filter(
          (a) => a.series_id !== appointment.series_id
        );
      }
    } else {
      this.recurringAppointments = this.recurringAppointments.filter((a) => a.id !== id);
    }
    return new Promise((resolve) => setTimeout(() => resolve(), 200));
  }

  // Resources Methods
  private resources: Resource[] = [];
  private resourceGroups: ResourceGroup[] = [];

  async listResources(filters?: FilterParams): Promise<Resource[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any[] }>("/api/provider/resources");
      return (response.data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        type: r.group_name || "other",
        group_id: r.group_id,
        capacity: r.capacity,
        is_active: r.is_active,
      }));
    } catch (error) {
      console.warn("Failed to fetch resources via API, using mock:", error);
      let filtered = [...this.resources];

      if (filters?.search) {
        const search = filters.search.toLowerCase();
        filtered = filtered.filter((r) => r.name.toLowerCase().includes(search));
      }

      return new Promise((resolve) => setTimeout(() => resolve(filtered), 200));
    }
  }

  async createResource(data: Partial<Resource>): Promise<Resource> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: any }>("/api/provider/resources", {
        name: data.name,
        description: data.description,
        group_id: data.group_id || null,
        capacity: data.capacity || 1,
        is_active: data.is_active ?? true,
      });
      
      const r = response.data;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        type: data.type || "other",
        group_id: r.group_id,
        capacity: r.capacity,
        is_active: r.is_active,
      };
    } catch (error) {
      console.warn("Failed to create resource via API, using mock:", error);
      // Fallback to mock
      const newResource: Resource = {
        id: `resource-${Date.now()}`,
        name: data.name || "New Resource",
        type: data.type || "other",
        is_active: true,
        ...data,
      };

      this.resources.push(newResource);
      return new Promise((resolve) => setTimeout(() => resolve(newResource), 300));
    }
  }

  async updateResource(id: string, data: Partial<Resource>): Promise<Resource> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: any }>(`/api/provider/resources/${id}`, {
        name: data.name,
        description: data.description,
        group_id: data.group_id,
        capacity: data.capacity,
        is_active: data.is_active,
      });
      
      const r = response.data;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        type: data.type || "other",
        group_id: r.group_id,
        capacity: r.capacity,
        is_active: r.is_active,
      };
    } catch (error) {
      console.warn("Failed to update resource via API, using mock:", error);
      // Fallback to mock
      const index = this.resources.findIndex((r) => r.id === id);
      if (index === -1) throw new Error("Resource not found");
      this.resources[index] = { ...this.resources[index], ...data };
      return new Promise((resolve) => setTimeout(() => resolve(this.resources[index]), 300));
    }
  }

  async deleteResource(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/resources/${id}`);
    } catch (error) {
      console.warn("Failed to delete resource via API, using mock:", error);
      // Fallback to mock
      this.resources = this.resources.filter((r) => r.id !== id);
      return new Promise((resolve) => setTimeout(() => resolve(), 200));
    }
  }

  async listResourceGroups(): Promise<ResourceGroup[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: any[] }>("/api/provider/resource-groups");
      return (response.data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        color: g.color,
        is_active: g.is_active,
        resource_ids: [], // Resource IDs are fetched separately
      }));
    } catch (error) {
      console.warn("Failed to fetch resource groups via API, using mock:", error);
      return new Promise((resolve) => setTimeout(() => resolve(this.resourceGroups), 200));
    }
  }

  async createResourceGroup(data: Partial<ResourceGroup>): Promise<ResourceGroup> {
    try {
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
    } catch (error) {
      console.warn("Failed to create resource group via API, using mock:", error);
      // Fallback to mock
      const newGroup: ResourceGroup = {
        id: `group-${Date.now()}`,
        name: data.name || "New Group",
        resource_ids: data.resource_ids || [],
        is_active: true,
        ...data,
      };

      this.resourceGroups.push(newGroup);
      return new Promise((resolve) => setTimeout(() => resolve(newGroup), 300));
    }
  }

  async updateResourceGroup(id: string, data: Partial<ResourceGroup>): Promise<ResourceGroup> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: any }>(`/api/provider/resource-groups/${id}`, {
        name: data.name,
        description: data.description,
        color: data.color,
        is_active: data.is_active,
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
    } catch (error) {
      console.warn("Failed to update resource group via API, using mock:", error);
      // Fallback to mock
      const index = this.resourceGroups.findIndex((g) => g.id === id);
      if (index === -1) throw new Error("Resource group not found");
      this.resourceGroups[index] = { ...this.resourceGroups[index], ...data };
      return new Promise((resolve) => setTimeout(() => resolve(this.resourceGroups[index]), 300));
    }
  }

  async deleteResourceGroup(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/resource-groups/${id}`);
    } catch (error) {
      console.warn("Failed to delete resource group via API, using mock:", error);
      // Fallback to mock
      this.resourceGroups = this.resourceGroups.filter((g) => g.id !== id);
      return new Promise((resolve) => setTimeout(() => resolve(), 200));
    }
  }

  // Express Booking Links Methods
  private expressBookingLinks: ExpressBookingLink[] = [];

  async listExpressBookingLinks(): Promise<ExpressBookingLink[]> {
    return new Promise((resolve) => setTimeout(() => resolve(this.expressBookingLinks), 200));
  }

  async createExpressBookingLink(
    data: Partial<ExpressBookingLink>
  ): Promise<ExpressBookingLink> {
    const shortCode = data.short_code || Math.random().toString(36).substring(2, 8).toUpperCase();
    const newLink: ExpressBookingLink = {
      id: `link-${Date.now()}`,
      name: data.name || "New Booking Link",
      short_code: shortCode,
      full_url: `${window.location.origin}/book/${shortCode}`,
      is_active: true,
      usage_count: 0,
      created_date: new Date().toISOString(),
      ...data,
    };

    this.expressBookingLinks.push(newLink);
    return new Promise((resolve) => setTimeout(() => resolve(newLink), 300));
  }

  async updateExpressBookingLink(
    id: string,
    data: Partial<ExpressBookingLink>
  ): Promise<ExpressBookingLink> {
    const index = this.expressBookingLinks.findIndex((l) => l.id === id);
    if (index === -1) throw new Error("Express booking link not found");
    this.expressBookingLinks[index] = { ...this.expressBookingLinks[index], ...data };
    return new Promise((resolve) =>
      setTimeout(() => resolve(this.expressBookingLinks[index]), 300)
    );
  }

  async deleteExpressBookingLink(id: string): Promise<void> {
    this.expressBookingLinks = this.expressBookingLinks.filter((l) => l.id !== id);
    return new Promise((resolve) => setTimeout(() => resolve(), 200));
  }

  // Cancellation Policies Methods
  private cancellationPolicies: CancellationPolicy[] = [];

  async listCancellationPolicies(): Promise<CancellationPolicy[]> {
    return new Promise((resolve) => setTimeout(() => resolve(this.cancellationPolicies), 200));
  }

  async createCancellationPolicy(data: Partial<CancellationPolicy>): Promise<CancellationPolicy> {
    const newPolicy: CancellationPolicy = {
      id: `policy-${Date.now()}`,
      name: data.name || "New Policy",
      cancellation_window_hours: data.cancellation_window_hours || 24,
      refund_percentage: data.refund_percentage || 100,
      allow_reschedule: data.allow_reschedule ?? true,
      is_default: data.is_default ?? false,
      ...data,
    };

    this.cancellationPolicies.push(newPolicy);
    return new Promise((resolve) => setTimeout(() => resolve(newPolicy), 300));
  }

  async updateCancellationPolicy(
    id: string,
    data: Partial<CancellationPolicy>
  ): Promise<CancellationPolicy> {
    const index = this.cancellationPolicies.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Cancellation policy not found");
    this.cancellationPolicies[index] = { ...this.cancellationPolicies[index], ...data };
    return new Promise((resolve) =>
      setTimeout(() => resolve(this.cancellationPolicies[index]), 300)
    );
  }

  async deleteCancellationPolicy(id: string): Promise<void> {
    this.cancellationPolicies = this.cancellationPolicies.filter((p) => p.id !== id);
    return new Promise((resolve) => setTimeout(() => resolve(), 200));
  }

  async getCancellationPolicyForAppointment(
    _appointmentId: string
  ): Promise<CancellationPolicy | null> {
    // Find default policy or first available
    const defaultPolicy = this.cancellationPolicies.find((p) => p.is_default);
    return new Promise((resolve) =>
      setTimeout(() => resolve(defaultPolicy || null), 200)
    );
  }

  // Appointment Notes Methods
  private appointmentNotes: AppointmentNote[] = [];
  private noteTemplates: NoteTemplate[] = [];
  private appointmentHistory: AppointmentHistoryEntry[] = [];

  async listAppointmentNotes(appointmentId: string): Promise<AppointmentNote[]> {
    const notes = this.appointmentNotes.filter((n) => n.appointment_id === appointmentId);
    return new Promise((resolve) => setTimeout(() => resolve(notes), 200));
  }

  async createAppointmentNote(data: Partial<AppointmentNote>): Promise<AppointmentNote> {
    const newNote: AppointmentNote = {
      id: `note-${Date.now()}`,
      appointment_id: data.appointment_id || "",
      type: data.type || "internal",
      content: data.content || "",
      created_by: "current_user",
      created_by_name: "Current User",
      created_date: new Date().toISOString(),
      is_edited: false,
      ...data,
    };

    this.appointmentNotes.push(newNote);
    return new Promise((resolve) => setTimeout(() => resolve(newNote), 300));
  }

  async updateAppointmentNote(id: string, data: Partial<AppointmentNote>): Promise<AppointmentNote> {
    const index = this.appointmentNotes.findIndex((n) => n.id === id);
    if (index === -1) throw new Error("Note not found");
    this.appointmentNotes[index] = {
      ...this.appointmentNotes[index],
      ...data,
      is_edited: true,
      edited_date: new Date().toISOString(),
    };
    return new Promise((resolve) => setTimeout(() => resolve(this.appointmentNotes[index]), 300));
  }

  async deleteAppointmentNote(id: string): Promise<void> {
    this.appointmentNotes = this.appointmentNotes.filter((n) => n.id !== id);
    return new Promise((resolve) => setTimeout(() => resolve(), 200));
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
    const history = this.appointmentHistory.filter((h) => h.appointment_id === appointmentId);
    return new Promise((resolve) => setTimeout(() => resolve(history), 200));
  }

  // Calendar Integration Methods
  private calendarSyncs: CalendarSync[] = [];
  private calendarEvents: CalendarEvent[] = [];

  async listCalendarSyncs(): Promise<CalendarSync[]> {
    return new Promise((resolve) => setTimeout(() => resolve(this.calendarSyncs), 200));
  }

  async createCalendarSync(data: Partial<CalendarSync>): Promise<CalendarSync> {
    const newSync: CalendarSync = {
      id: `sync-${Date.now()}`,
      provider: data.provider || "google",
      sync_direction: data.sync_direction || "two_way",
      is_active: true,
      created_date: new Date().toISOString(),
      ...data,
    };

    this.calendarSyncs.push(newSync);
    return new Promise((resolve) => setTimeout(() => resolve(newSync), 300));
  }

  async updateCalendarSync(id: string, data: Partial<CalendarSync>): Promise<CalendarSync> {
    const index = this.calendarSyncs.findIndex((s) => s.id === id);
    if (index === -1) throw new Error("Calendar sync not found");
    this.calendarSyncs[index] = { ...this.calendarSyncs[index], ...data };
    return new Promise((resolve) => setTimeout(() => resolve(this.calendarSyncs[index]), 300));
  }

  async deleteCalendarSync(id: string): Promise<void> {
    this.calendarSyncs = this.calendarSyncs.filter((s) => s.id !== id);
    return new Promise((resolve) => setTimeout(() => resolve(), 200));
  }

  async syncAppointmentToCalendar(
    appointmentId: string,
    calendarSyncId: string
  ): Promise<CalendarEvent> {
    const sync = this.calendarSyncs.find((s) => s.id === calendarSyncId);
    if (!sync) throw new Error("Calendar sync not found");

    const newEvent: CalendarEvent = {
      id: `event-${Date.now()}`,
      appointment_id: appointmentId,
      calendar_provider: sync.provider,
      calendar_event_id: `ext-${Math.random().toString(36).substring(7)}`,
      sync_status: "synced",
      last_sync_date: new Date().toISOString(),
    };

    this.calendarEvents.push(newEvent);
    return new Promise((resolve) => setTimeout(() => resolve(newEvent), 500));
  }

  async syncCalendarToAppointments(_calendarSyncId: string): Promise<void> {
    // Mock implementation - would sync external calendar events to appointments
    return new Promise((resolve) => setTimeout(() => resolve(), 1000));
  }

  async getCalendarAuthUrl(provider: CalendarProvider): Promise<{ url: string }> {
    try {
      // Use real API route
      const response = await fetch(`/api/provider/calendar/auth/${provider}`);
      if (!response.ok) {
        throw new Error("Failed to get auth URL");
      }
      const data = await response.json();
      return { url: data.url };
    } catch (error) {
      // Fallback to mock for development
      console.warn("Using mock calendar auth URL:", error);
      const mockUrl = `https://accounts.google.com/o/oauth2/auth?client_id=mock&redirect_uri=${encodeURIComponent(
        `${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/provider/calendar/callback/${provider}`
      )}&scope=calendar&response_type=code`;
      return new Promise((resolve) => setTimeout(() => resolve({ url: mockUrl }), 200));
    }
  }

  async handleCalendarCallback(
    provider: CalendarProvider,
    _code: string,
    _state?: string
  ): Promise<CalendarSync> {
    // Mock OAuth callback handling
    const newSync: CalendarSync = {
      id: `sync-${Date.now()}`,
      provider,
      sync_direction: "two_way",
      is_active: true,
      created_date: new Date().toISOString(),
      last_sync_date: new Date().toISOString(),
    };

    this.calendarSyncs.push(newSync);
    return new Promise((resolve) => setTimeout(() => resolve(newSync), 500));
  }

  // Group Booking Methods
  private groupBookings: GroupBooking[] = [];

  async listGroupBookings(
    filters?: FilterParams,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<GroupBooking>> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.date_from) params.append("date_from", filters.date_from);
      if (filters?.date_to) params.append("date_to", filters.date_to);
      if (pagination?.page) params.append("page", String(pagination.page));
      if (pagination?.limit) params.append("limit", String(pagination.limit));

      const response = await fetcher.get<{ data: GroupBooking[]; total: number; page: number; limit: number; total_pages: number }>(
        `/api/provider/group-bookings?${params.toString()}`
      );
      return response;
    } catch (error) {
      console.warn("Failed to fetch group bookings via API, using mock:", error);
      // Fallback to mock
      let filtered = [...this.groupBookings];
      
      if (filters?.date_from) {
        filtered = filtered.filter((gb) => gb.scheduled_date >= filters.date_from!);
      }
      if (filters?.date_to) {
        filtered = filtered.filter((gb) => gb.scheduled_date <= filters.date_to!);
      }
      if (filters?.status) {
        filtered = filtered.filter((gb) => gb.status === filters.status);
      }

      const page = pagination?.page || 1;
      const limit = pagination?.limit || 20;
      const start = (page - 1) * limit;
      const end = start + limit;

      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              data: filtered.slice(start, end),
              total: filtered.length,
              page,
              limit,
              total_pages: Math.ceil(filtered.length / limit),
            }),
          200
        )
      );
    }
  }

  async getGroupBooking(id: string): Promise<GroupBooking> {
    const booking = this.groupBookings.find((gb) => gb.id === id);
    if (!booking) throw new Error("Group booking not found");
    return new Promise((resolve) => setTimeout(() => resolve(booking), 200));
  }

  async createGroupBooking(data: Partial<GroupBooking>): Promise<GroupBooking> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.post<{ data: GroupBooking }>(
        "/api/provider/group-bookings",
        data
      );
      return response.data;
    } catch (error) {
      console.warn("Failed to create group booking via API, using mock:", error);
      // Fallback to mock
      const newBooking: GroupBooking = {
        id: `gb-${Date.now()}`,
        ref_number: `GB-${Date.now().toString().slice(-6)}`,
        scheduled_date: data.scheduled_date || new Date().toISOString().split("T")[0],
        scheduled_time: data.scheduled_time || "10:00",
        duration_minutes: data.duration_minutes || 60,
        team_member_id: data.team_member_id || "",
        team_member_name: data.team_member_name || "",
        service_id: data.service_id || "",
        service_name: data.service_name || "",
        total_price: data.total_price || 0,
        status: DEFAULT_APPOINTMENT_STATUS,
        created_date: new Date().toISOString(),
        participants: data.participants || [],
        notes: data.notes,
        location_type: data.location_type,
        location_id: data.location_id,
        address_line1: data.address_line1,
        address_city: data.address_city,
        address_postal_code: data.address_postal_code,
        travel_fee: data.travel_fee,
      };
      this.groupBookings.push(newBooking);
      return new Promise((resolve) => setTimeout(() => resolve(newBooking), 300));
    }
  }

  async updateGroupBooking(id: string, data: Partial<GroupBooking>): Promise<GroupBooking> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: GroupBooking }>(
        `/api/provider/group-bookings/${id}`,
        data
      );
      return response.data;
    } catch (error) {
      console.warn("Failed to update group booking via API, using mock:", error);
      // Fallback to mock
      const index = this.groupBookings.findIndex((gb) => gb.id === id);
      if (index === -1) throw new Error("Group booking not found");
      this.groupBookings[index] = { ...this.groupBookings[index], ...data };
      return new Promise((resolve) => setTimeout(() => resolve(this.groupBookings[index]), 300));
    }
  }

  async deleteGroupBooking(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/group-bookings/${id}`);
    } catch (error) {
      console.warn("Failed to delete group booking via API, using mock:", error);
      // Fallback to mock
      this.groupBookings = this.groupBookings.filter((gb) => gb.id !== id);
      return new Promise((resolve) => setTimeout(() => resolve(), 200));
    }
  }

  async addParticipantToGroupBooking(
    groupBookingId: string,
    participant: Partial<GroupBookingParticipant>
  ): Promise<GroupBookingParticipant> {
    const booking = this.groupBookings.find((gb) => gb.id === groupBookingId);
    if (!booking) throw new Error("Group booking not found");
    
    const newParticipant: GroupBookingParticipant = {
      id: `part-${Date.now()}`,
      group_booking_id: groupBookingId,
      client_name: participant.client_name || "",
      client_email: participant.client_email,
      client_phone: participant.client_phone,
      service_id: participant.service_id || "",
      service_name: participant.service_name || "",
      price: participant.price || 0,
      checked_in: false,
      checked_out: false,
      ...participant,
    };
    
    booking.participants.push(newParticipant);
    booking.total_price = booking.participants.reduce((sum, p) => sum + p.price, 0);
    return new Promise((resolve) => setTimeout(() => resolve(newParticipant), 300));
  }

  async removeParticipantFromGroupBooking(groupBookingId: string, participantId: string): Promise<void> {
    const booking = this.groupBookings.find((gb) => gb.id === groupBookingId);
    if (!booking) throw new Error("Group booking not found");
    booking.participants = booking.participants.filter((p) => p.id !== participantId);
    booking.total_price = booking.participants.reduce((sum, p) => sum + p.price, 0);
    return new Promise((resolve) => setTimeout(() => resolve(), 200));
  }

  async checkInGroupParticipant(groupBookingId: string, participantId: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.post(`/api/provider/group-bookings/${groupBookingId}/participants/${participantId}/check-in`);
    } catch (error) {
      console.warn("Failed to check in participant via API, using mock:", error);
      // Fallback to mock
      const booking = this.groupBookings.find((gb) => gb.id === groupBookingId);
      if (!booking) throw new Error("Group booking not found");
      const participant = booking.participants.find((p) => p.id === participantId);
      if (!participant) throw new Error("Participant not found");
      participant.checked_in = true;
      participant.checked_in_time = new Date().toISOString();
      return new Promise((resolve) => setTimeout(() => resolve(), 200));
    }
  }

  async checkOutGroupParticipant(groupBookingId: string, participantId: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.post(`/api/provider/group-bookings/${groupBookingId}/participants/${participantId}/check-out`);
    } catch (error) {
      console.warn("Failed to check out participant via API, using mock:", error);
      // Fallback to mock
      const booking = this.groupBookings.find((gb) => gb.id === groupBookingId);
      if (!booking) throw new Error("Group booking not found");
      const participant = booking.participants.find((p) => p.id === participantId);
      if (!participant) throw new Error("Participant not found");
      participant.checked_out = true;
      participant.checked_out_time = new Date().toISOString();
      return new Promise((resolve) => setTimeout(() => resolve(), 200));
    }
  }

  async convertAppointmentsToGroupBooking(appointmentIds: string[]): Promise<GroupBooking> {
    // This would convert multiple individual appointments into a group booking
    const { data } = await this.listAppointments();
    const appointments = data.filter((a: Appointment) => appointmentIds.includes(a.id));
    if (appointments.length === 0) throw new Error("No appointments found");
    
    const firstAppt = appointments[0];
    const newBooking: GroupBooking = {
      id: `gb-${Date.now()}`,
      ref_number: `GB-${Date.now().toString().slice(-6)}`,
      scheduled_date: firstAppt.scheduled_date,
      scheduled_time: firstAppt.scheduled_time,
      duration_minutes: firstAppt.duration_minutes,
      team_member_id: firstAppt.team_member_id,
      team_member_name: firstAppt.team_member_name,
      service_id: firstAppt.service_id,
      service_name: firstAppt.service_name,
      total_price: appointments.reduce((sum, a) => sum + a.price, 0),
      status: DEFAULT_APPOINTMENT_STATUS,
      created_date: new Date().toISOString(),
      participants: appointments.map((a) => ({
        id: `part-${a.id}`,
        group_booking_id: `gb-${Date.now()}`,
        client_name: a.client_name,
        client_email: a.client_email,
        client_phone: a.client_phone,
        service_id: a.service_id,
        service_name: a.service_name,
        price: a.price,
        checked_in: false,
        checked_out: false,
      })),
    };
    
    this.groupBookings.push(newBooking);
    // Mark appointments as group bookings
    appointments.forEach((a) => {
      a.is_group_booking = true;
      a.group_booking_id = newBooking.id;
    });
    
    return new Promise((resolve) => setTimeout(() => resolve(newBooking), 300));
  }

  // Time Block Methods
  private timeBlocks: TimeBlock[] = [];
  private blockedTimeTypes: BlockedTimeType[] = [];

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

  async listTimeBlocks(filters?: FilterParams): Promise<TimeBlock[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const params = new URLSearchParams();
      if (filters?.date_from) params.append("date_from", filters.date_from);
      if (filters?.date_to) params.append("date_to", filters.date_to);
      if (filters?.team_member_id) params.append("staff_id", filters.team_member_id);
      
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
      console.warn("Failed to fetch time blocks via API, using mock:", error);
      let filtered = [...this.timeBlocks];
      if (filters?.date_from) {
        filtered = filtered.filter((tb) => tb.date >= filters.date_from!);
      }
      if (filters?.team_member_id) {
        filtered = filtered.filter((tb) => tb.team_member_id === filters.team_member_id);
      }
      return new Promise((resolve) => setTimeout(() => resolve(filtered), 200));
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
      console.warn("Failed to fetch time block via API, using mock:", error);
      const block = this.timeBlocks.find((tb) => tb.id === id);
      if (!block) throw new Error("Time block not found");
      return new Promise((resolve) => setTimeout(() => resolve(block), 200));
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
      console.warn("Failed to create time block via API, using mock:", error);
      // Fallback to mock
      const newBlock: TimeBlock = {
        id: `tb-${Date.now()}`,
        name: data.name || "Time Block",
        description: data.description,
        team_member_id: data.team_member_id,
        team_member_name: data.team_member_name,
        date: data.date || new Date().toISOString().split("T")[0],
        start_time: data.start_time || "09:00",
        end_time: data.end_time || "10:00",
        is_recurring: data.is_recurring || false,
        recurrence_rule: data.recurrence_rule,
        blocked_time_type_id: data.blocked_time_type_id,
        blocked_time_type_name: data.blocked_time_type_name,
        is_active: true,
        created_date: new Date().toISOString(),
      };
      this.timeBlocks.push(newBlock);
      return new Promise((resolve) => setTimeout(() => resolve(newBlock), 300));
    }
  }

  async updateTimeBlock(id: string, data: Partial<TimeBlock>): Promise<TimeBlock> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: any }>(`/api/provider/time-blocks/${id}`, {
        staff_id: data.team_member_id,
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
      console.warn("Failed to update time block via API, using mock:", error);
      // Fallback to mock
      const index = this.timeBlocks.findIndex((tb) => tb.id === id);
      if (index === -1) throw new Error("Time block not found");
      this.timeBlocks[index] = { ...this.timeBlocks[index], ...data };
      return new Promise((resolve) => setTimeout(() => resolve(this.timeBlocks[index]), 300));
    }
  }

  async deleteTimeBlock(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/time-blocks/${id}`);
    } catch (error) {
      console.warn("Failed to delete time block via API, using mock:", error);
      // Fallback to mock
      this.timeBlocks = this.timeBlocks.filter((tb) => tb.id !== id);
      return new Promise((resolve) => setTimeout(() => resolve(), 200));
    }
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
      console.warn("Failed to fetch blocked time types via API, using mock:", error);
      return new Promise((resolve) => setTimeout(() => resolve(this.blockedTimeTypes), 200));
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
      console.warn("Failed to create blocked time type via API, using mock:", error);
      // Fallback to mock
      const newType: BlockedTimeType = {
        id: `btt-${Date.now()}`,
        name: data.name || "Blocked Time",
        description: data.description,
        color: data.color || "#FF0077",
        icon: data.icon,
        is_active: true,
        created_date: new Date().toISOString(),
      };
      this.blockedTimeTypes.push(newType);
      return new Promise((resolve) => setTimeout(() => resolve(newType), 300));
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
      console.warn("Failed to update blocked time type via API, using mock:", error);
      // Fallback to mock
      const index = this.blockedTimeTypes.findIndex((t) => t.id === id);
      if (index === -1) throw new Error("Blocked time type not found");
      this.blockedTimeTypes[index] = { ...this.blockedTimeTypes[index], ...data };
      return new Promise((resolve) => setTimeout(() => resolve(this.blockedTimeTypes[index]), 300));
    }
  }

  async deleteBlockedTimeType(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/blocked-time-types/${id}`);
    } catch (error) {
      console.warn("Failed to delete blocked time type via API, using mock:", error);
      // Fallback to mock
      this.blockedTimeTypes = this.blockedTimeTypes.filter((t) => t.id !== id);
      return new Promise((resolve) => setTimeout(() => resolve(), 200));
    }
  }

  // Virtual Waiting Room Methods
  private waitingRoomEntries: WaitingRoomEntry[] = [];

  async listWaitingRoomEntries(filters?: FilterParams): Promise<WaitingRoomEntry[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const params = new URLSearchParams();
      if (filters?.status) {
        params.append("status", filters.status);
      }
      const response = await fetcher.get<{ data: WaitingRoomEntry[] }>(
        `/api/provider/waiting-room${params.toString() ? `?${params.toString()}` : ""}`
      );
      return response.data || [];
    } catch (error) {
      console.warn("Failed to load waiting room entries via API, using mock:", error);
      // Fallback to mock
      let filtered = [...this.waitingRoomEntries];
      if (filters?.status) {
        filtered = filtered.filter((e) => e.status === filters.status);
      }
      if (filters?.team_member_id) {
        filtered = filtered.filter((e) => e.team_member_id === filters.team_member_id);
      }
      return new Promise((resolve) => setTimeout(() => resolve(filtered), 200));
    }
  }

  async getWaitingRoomEntry(id: string): Promise<WaitingRoomEntry> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.get<{ data: WaitingRoomEntry }>(
        `/api/provider/waiting-room/${id}`
      );
      return response.data;
    } catch (error) {
      console.warn("Failed to get waiting room entry via API, using mock:", error);
      // Fallback to mock
      const entry = this.waitingRoomEntries.find((e) => e.id === id);
      if (!entry) throw new Error("Waiting room entry not found");
      return new Promise((resolve) => setTimeout(() => resolve(entry), 200));
    }
  }

  async addToWaitingRoom(data: Partial<WaitingRoomEntry>): Promise<WaitingRoomEntry> {
    const newEntry: WaitingRoomEntry = {
      id: `wr-${Date.now()}`,
      client_name: data.client_name || "",
      client_email: data.client_email,
      client_phone: data.client_phone,
      appointment_id: data.appointment_id,
      service_id: data.service_id,
      service_name: data.service_name || "",
      team_member_id: data.team_member_id,
      team_member_name: data.team_member_name,
      checked_in_time: new Date().toISOString(),
      checked_in_method: data.checked_in_method || "staff",
      estimated_wait_time: data.estimated_wait_time,
      status: "waiting",
      notes: data.notes,
      position: this.waitingRoomEntries.length + 1,
      ...data,
    };
    this.waitingRoomEntries.push(newEntry);
    return new Promise((resolve) => setTimeout(() => resolve(newEntry), 300));
  }

  async updateWaitingRoomEntry(id: string, data: Partial<WaitingRoomEntry>): Promise<WaitingRoomEntry> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const response = await fetcher.patch<{ data: WaitingRoomEntry }>(
        `/api/provider/waiting-room/${id}`,
        data
      );
      return response.data;
    } catch (error) {
      console.warn("Failed to update waiting room entry via API, using mock:", error);
      // Fallback to mock
      const index = this.waitingRoomEntries.findIndex((e) => e.id === id);
      if (index === -1) throw new Error("Waiting room entry not found");
      this.waitingRoomEntries[index] = { ...this.waitingRoomEntries[index], ...data };
      return new Promise((resolve) => setTimeout(() => resolve(this.waitingRoomEntries[index]), 300));
    }
  }

  async removeFromWaitingRoom(id: string): Promise<void> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.delete(`/api/provider/waiting-room/${id}`);
    } catch (error) {
      console.warn("Failed to remove from waiting room via API, using mock:", error);
      // Fallback to mock
      this.waitingRoomEntries = this.waitingRoomEntries.filter((e) => e.id !== id);
      return new Promise((resolve) => setTimeout(() => resolve(), 200));
    }
  }

  async checkInToWaitingRoom(data: Partial<WaitingRoomEntry>): Promise<WaitingRoomEntry> {
    return this.addToWaitingRoom({ ...data, checked_in_method: "self" });
  }

  async moveWaitingRoomToService(entryId: string, appointmentId?: string): Promise<Appointment> {
    const entry = this.waitingRoomEntries.find((e) => e.id === entryId);
    if (!entry) throw new Error("Waiting room entry not found");
    
    // Create appointment from waiting room entry
    const appointment: Appointment = {
      id: appointmentId || `apt-${Date.now()}`,
      ref_number: `APT-${Date.now().toString().slice(-6)}`,
      client_name: entry.client_name,
      client_email: entry.client_email,
      client_phone: entry.client_phone,
      service_id: entry.service_id || "",
      service_name: entry.service_name || "Service",
      team_member_id: entry.team_member_id || "",
      team_member_name: entry.team_member_name || "",
      scheduled_date: new Date().toISOString().split("T")[0],
      scheduled_time: new Date().toTimeString().slice(0, 5),
      duration_minutes: 60,
      price: 0,
      status: "started",
      created_by: "system",
      created_date: new Date().toISOString(),
    };
    
    this.appointments.push(appointment);
    entry.status = "in_service";
    entry.appointment_id = appointment.id;
    
    return new Promise((resolve) => setTimeout(() => resolve(appointment), 300));
  }

  // Calendar Colors & Icons Methods
  private calendarColorSchemes: CalendarColorScheme[] = [];
  private calendarDisplayPreferences: CalendarDisplayPreferences = {
    id: "default",
    week_starts_on: 1, // Monday
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

  async listCalendarColorSchemes(): Promise<CalendarColorScheme[]> {
    return new Promise((resolve) => setTimeout(() => resolve(this.calendarColorSchemes), 200));
  }

  async createCalendarColorScheme(data: Partial<CalendarColorScheme>): Promise<CalendarColorScheme> {
    const newScheme: CalendarColorScheme = {
      id: `ccs-${Date.now()}`,
      name: data.name || "Color Scheme",
      description: data.description,
      color: data.color || "#FF0077",
      icon: data.icon,
      applies_to: data.applies_to || "service",
      service_id: data.service_id,
      status: data.status,
      team_member_id: data.team_member_id,
      is_default: false,
      created_date: new Date().toISOString(),
    };
    this.calendarColorSchemes.push(newScheme);
    return new Promise((resolve) => setTimeout(() => resolve(newScheme), 300));
  }

  async updateCalendarColorScheme(id: string, data: Partial<CalendarColorScheme>): Promise<CalendarColorScheme> {
    const index = this.calendarColorSchemes.findIndex((s) => s.id === id);
    if (index === -1) throw new Error("Color scheme not found");
    this.calendarColorSchemes[index] = { ...this.calendarColorSchemes[index], ...data };
    return new Promise((resolve) => setTimeout(() => resolve(this.calendarColorSchemes[index]), 300));
  }

  async deleteCalendarColorScheme(id: string): Promise<void> {
    this.calendarColorSchemes = this.calendarColorSchemes.filter((s) => s.id !== id);
    return new Promise((resolve) => setTimeout(() => resolve(), 200));
  }

  async getCalendarDisplayPreferences(): Promise<CalendarDisplayPreferences> {
    return new Promise((resolve) => setTimeout(() => resolve(this.calendarDisplayPreferences), 200));
  }

  async updateCalendarDisplayPreferences(data: Partial<CalendarDisplayPreferences>): Promise<CalendarDisplayPreferences> {
    this.calendarDisplayPreferences = { ...this.calendarDisplayPreferences, ...data };
    return new Promise((resolve) => setTimeout(() => resolve(this.calendarDisplayPreferences), 300));
  }

  // Calendar Link Sharing Methods
  private calendarLinks: CalendarLink[] = [];

  async listCalendarLinks(): Promise<CalendarLink[]> {
    return new Promise((resolve) => setTimeout(() => resolve(this.calendarLinks), 200));
  }

  async createCalendarLink(data: Partial<CalendarLink>): Promise<CalendarLink> {
    const token = `cal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newLink: CalendarLink = {
      id: `cl-${Date.now()}`,
      name: data.name || "Calendar Link",
      link_token: token,
      full_url: `${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/calendar/${token}`,
      calendar_type: data.calendar_type || "public",
      provider: data.provider || "google",
      is_active: true,
      expires_at: data.expires_at,
      access_count: 0,
      created_date: new Date().toISOString(),
      settings: {
        show_client_names: true,
        show_service_details: true,
        show_team_member_names: true,
        include_cancelled: false,
        ...data.settings,
      },
    };
    this.calendarLinks.push(newLink);
    return new Promise((resolve) => setTimeout(() => resolve(newLink), 300));
  }

  async updateCalendarLink(id: string, data: Partial<CalendarLink>): Promise<CalendarLink> {
    const index = this.calendarLinks.findIndex((l) => l.id === id);
    if (index === -1) throw new Error("Calendar link not found");
    this.calendarLinks[index] = { ...this.calendarLinks[index], ...data };
    return new Promise((resolve) => setTimeout(() => resolve(this.calendarLinks[index]), 300));
  }

  async deleteCalendarLink(id: string): Promise<void> {
    this.calendarLinks = this.calendarLinks.filter((l) => l.id !== id);
    return new Promise((resolve) => setTimeout(() => resolve(), 200));
  }

  async getPublicCalendarFeed(linkToken: string): Promise<any> {
    // This would return iCal format or Google Calendar format
    const link = this.calendarLinks.find((l) => l.link_token === linkToken);
    if (!link || !link.is_active) throw new Error("Calendar link not found or inactive");
    
    // Mock iCal format
    return new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            format: "ical",
            content: `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Beautonomi//Calendar//EN\nEND:VCALENDAR`,
          }),
        200
      )
    );
  }

  // Rescheduling Methods
  private rescheduleRequests: RescheduleRequest[] = [];

  async requestReschedule(appointmentId: string, data: Partial<RescheduleRequest>): Promise<RescheduleRequest> {
    const appointment = await this.getAppointment(appointmentId);
    
    const newRequest: RescheduleRequest = {
      id: `rr-${Date.now()}`,
      appointment_id: appointmentId,
      original_date: appointment.scheduled_date,
      original_time: appointment.scheduled_time,
      new_date: data.new_date || appointment.scheduled_date,
      new_time: data.new_time || appointment.scheduled_time,
      requested_by: data.requested_by || "client",
      requested_by_name: data.requested_by_name || appointment.client_name,
      reason: data.reason,
      status: "pending",
      created_date: new Date().toISOString(),
    };
    
    this.rescheduleRequests.push(newRequest);
    return new Promise((resolve) => setTimeout(() => resolve(newRequest), 300));
  }

  async listRescheduleRequests(filters?: FilterParams): Promise<RescheduleRequest[]> {
    let filtered = [...this.rescheduleRequests];
    
    if (filters?.status) {
      filtered = filtered.filter((r) => r.status === filters.status);
    }
    
    return new Promise((resolve) => setTimeout(() => resolve(filtered), 200));
  }

  async approveRescheduleRequest(requestId: string): Promise<void> {
    const request = this.rescheduleRequests.find((r) => r.id === requestId);
    if (!request) throw new Error("Reschedule request not found");
    
    await this.rescheduleAppointment(request.appointment_id, request.new_date, request.new_time);
    request.status = "approved";
    request.processed_date = new Date().toISOString();
    
    return new Promise((resolve) => setTimeout(() => resolve(), 300));
  }

  async rejectRescheduleRequest(requestId: string, reason?: string): Promise<void> {
    const request = this.rescheduleRequests.find((r) => r.id === requestId);
    if (!request) throw new Error("Reschedule request not found");
    
    request.status = "rejected";
    request.processed_date = new Date().toISOString();
    if (reason) request.reason = reason;
    
    return new Promise((resolve) => setTimeout(() => resolve(), 300));
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
      const response = await fetcher.post<{ data: { booking: any; otp: string | null; qr_code: any; verification_code?: string } }>(
        `/api/provider/bookings/${appointmentId}/arrive`,
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
      const response = await fetcher.post<{ data: { booking: any } }>(
        `/api/provider/bookings/${appointmentId}/start-service`
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
      const response = await fetcher.post<{ data: { booking: any } }>(
        `/api/provider/bookings/${appointmentId}/complete-service`
      );
      return this.transformBookingToAppointment(response.data.booking);
    } catch (error) {
      console.error("Failed to complete service:", error);
      throw error;
    }
  }

  private transformBookingToAppointment(booking: any): Appointment {
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
      status: booking.status === "confirmed" ? APPOINTMENT_STATUS.BOOKED : booking.status === "in_progress" ? APPOINTMENT_STATUS.STARTED : booking.status === "completed" ? APPOINTMENT_STATUS.COMPLETED : booking.status === "cancelled" ? APPOINTMENT_STATUS.CANCELLED : DEFAULT_APPOINTMENT_STATUS,
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
      const printData = await this.getAppointmentPrintData(appointmentId);
      
      // Create a simple PDF-like HTML receipt
      const receiptHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt - ${printData.appointment.ref_number}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
              .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
              .section { margin-bottom: 15px; }
              .label { font-weight: bold; color: #666; font-size: 12px; }
              .value { margin-top: 5px; font-size: 14px; }
              .total { font-size: 18px; font-weight: bold; margin-top: 20px; padding-top: 10px; border-top: 2px solid #000; }
              .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 12px; color: #666; text-align: center; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${printData.business_name || "Business"}</h1>
              <p>Receipt</p>
            </div>
            <div class="section">
              <div class="label">Reference Number</div>
              <div class="value">${printData.appointment.ref_number}</div>
            </div>
            <div class="section">
              <div class="label">Date</div>
              <div class="value">${new Date(printData.appointment.scheduled_date).toLocaleDateString()} at ${printData.appointment.scheduled_time}</div>
            </div>
            <div class="section">
              <div class="label">Client</div>
              <div class="value">${printData.appointment.client_name}</div>
            </div>
            <div class="section">
              <div class="label">Service</div>
              <div class="value">${printData.appointment.service_name}</div>
            </div>
            <div class="section">
              <div class="label">Team Member</div>
              <div class="value">${printData.appointment.team_member_name}</div>
            </div>
            <div class="total">
              Total: R ${printData.appointment.price.toFixed(2)}
            </div>
            <div class="footer">
              <p>Thank you for your business!</p>
              <p>Printed on ${new Date().toLocaleString()}</p>
            </div>
          </body>
        </html>
      `;
      
      // Convert HTML to Blob
      const blob = new Blob([receiptHtml], { type: "text/html" });
      return blob;
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
    const appointment = await this.getAppointment(appointmentId);
    
    return new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            appointment,
            print_date: new Date().toISOString(),
            business_name: mockProvider.business_name,
            format: "pdf",
          }),
        200
      )
    );
  }

  // Marketing Campaigns
  async listCampaigns(filters?: any): Promise<any[]> {
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.type) params.append("type", filters.type);
      
      const response = await fetcher.get<{ data: { data: any[] } | any[] }>(
        `/api/provider/campaigns${params.toString() ? `?${params.toString()}` : ""}`
      );
      return Array.isArray(response.data) ? response.data : (response.data as any)?.data || [];
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
export const providerApi: ProviderApi = new MockProviderApi();
