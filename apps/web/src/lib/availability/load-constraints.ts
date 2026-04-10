/**
 * Load Availability Constraints
 * Queries database for staff shifts, time blocks, and existing bookings
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  StaffShift,
  TimeBlock,
  BookingService,
  AvailabilityConstraints,
} from './types';

/** Placeholder for synthetic rows derived from `booking_holds` (blocked window only). */
const HOLD_SYNTHETIC_OFFERING_ID = '00000000-0000-0000-0000-000000000000';
import { expandRecurringPattern } from './time-utils';
import { loadPublicCalendarParityBookings } from './public-calendar-parity-bookings';
import {
  parseSyntheticProviderStaffId,
  SYNTHETIC_PROVIDER_STAFF_PREFIX,
} from '@beautonomi/utils';

export { parseSyntheticProviderStaffId };

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const WEEKDAY_KEYS = new Set([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]);

/** When working_hours is empty or unset, Mon–Sat 09:00–18:00; Sunday closed. */
const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '18:00';

/**
 * Working hours can be stored in two formats depending on the UI that saved them:
 *
 * Format A (availability engine / mobile provider app):
 *   { monday: { is_open: true, open_time: "09:00", close_time: "18:00" } }
 *
 * Format B (web operating-hours settings page / OperatingHoursEditor component):
 *   { monday: { open: "09:00", close: "18:00", closed: false } }
 *
 * resolveWorkingHoursDay handles both so either save path produces valid shifts.
 */
type WorkingHoursDay = {
  // Format A
  is_open?: boolean;
  open_time?: string;
  close_time?: string;
  // Format B
  open?: string;
  close?: string;
  closed?: boolean;
};

/**
 * Resolve one day from working_hours JSON. Empty `{}` or null schedule → default weekday hours.
 * If the org set any day keys but omitted this weekday → closed (partial schedule).
 */
function resolveWorkingHoursDay(
  wh: Record<string, WorkingHoursDay>,
  dayKey: (typeof DAY_KEYS)[number]
): { open: boolean; openTime: string; closeTime: string } | null {
  const hasAnyKeys = Object.keys(wh).length > 0;
  const day = wh[dayKey];
  const isWeekday = WEEKDAY_KEYS.has(dayKey);

  if (!hasAnyKeys) {
    if (!isWeekday) return null;
    return { open: true, openTime: DEFAULT_OPEN, closeTime: DEFAULT_CLOSE };
  }

  if (day === undefined) {
    return null;
  }

  // Detect closed: Format A uses is_open===false, Format B uses closed===true
  const isClosed = day.is_open === false || day.closed === true;
  if (isClosed) {
    return null;
  }

  // Resolve times: prefer Format A keys, fall back to Format B keys
  const openTime = (day.open_time || day.open || DEFAULT_OPEN).trim();
  const closeTime = (day.close_time || day.close || DEFAULT_CLOSE).trim();

  return { open: true, openTime, closeTime };
}

/**
 * Primary active location hours (same ordering as public availability: primary first).
 * Uses the same `working_hours` resolution as staff JSON (empty `{}` → Mon–Fri default; partial keys apply).
 */
async function buildStaffShiftsFromPrimaryLocation(
  db: SupabaseClient,
  providerId: string,
  date: string,
  staffIdForShift: string
): Promise<StaffShift[]> {
  const { data: locs, error } = await db
    .from('provider_locations')
    .select('id, working_hours')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !locs?.length) {
    return [];
  }

  const raw = locs[0].working_hours;
  const wh: Record<string, WorkingHoursDay> =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, WorkingHoursDay>)
      : {};

  const dayKey = DAY_KEYS[new Date(`${date}T12:00:00`).getDay()];
  const resolved = resolveWorkingHoursDay(wh, dayKey);
  if (!resolved) {
    return [];
  }

  const normalize = (t: string) => {
    if (t.length >= 8) return t;
    if (t.length === 5) return `${t}:00`;
    return `${t}:00`;
  };

  return [
    {
      id: `primary-location-fallback-${locs[0].id}-${date}`,
      staff_id: staffIdForShift,
      date,
      start_time: normalize(resolved.openTime),
      end_time: normalize(resolved.closeTime),
      is_recurring: false,
    },
  ];
}

/**
 * When staff_shifts rows are missing (common if the team only set weekly hours in UI),
 * derive a single shift from provider_staff.working_hours for that weekday.
 * Matches the spirit of /api/public/providers/[slug]/availability (working_hours JSON).
 *
 * When `working_hours` is `{}` and `providerId` is set, primary location hours are tried **before**
 * the generic Mon–Fri default (solo / salon-driven hours).
 */
async function buildStaffShiftsFromWorkingHoursFallback(
  supabase: SupabaseClient,
  db: SupabaseClient,
  staffId: string,
  date: string,
  providerId?: string
): Promise<StaffShift[]> {
  const { data: row, error } = await supabase
    .from('provider_staff')
    .select('working_hours')
    .eq('id', staffId)
    .maybeSingle();

  if (error || !row) {
    return [];
  }

  const raw = row.working_hours;
  const wh: Record<string, WorkingHoursDay> =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, WorkingHoursDay>)
      : {};

  const hasAnyKeys = Object.keys(wh).length > 0;
  const dayKey = DAY_KEYS[new Date(`${date}T12:00:00`).getDay()];

  if (!hasAnyKeys && providerId) {
    const fromLoc = await buildStaffShiftsFromPrimaryLocation(db, providerId, date, staffId);
    if (fromLoc.length > 0) {
      return fromLoc;
    }
  }

  const resolved = resolveWorkingHoursDay(wh, dayKey);
  if (!resolved) {
    return [];
  }

  const normalize = (t: string) => {
    if (t.length >= 8) return t;
    if (t.length === 5) return `${t}:00`;
    return `${t}:00`;
  };

  return [
    {
      id: `working-hours-fallback-${staffId}-${date}`,
      staff_id: staffId,
      date,
      start_time: normalize(resolved.openTime),
      end_time: normalize(resolved.closeTime),
      is_recurring: false,
    },
  ];
}

/** Weekly template from staff_schedules (portal UI). Not used when absent — then working_hours fallback applies. */
type StaffScheduleDayResult =
  | { kind: 'none' }
  | { kind: 'closed' }
  | { kind: 'open'; shifts: StaffShift[] };

async function resolveStaffScheduleForDate(
  supabase: SupabaseClient,
  staffId: string,
  date: string
): Promise<StaffScheduleDayResult> {
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
  const { data: row, error } = await supabase
    .from('staff_schedules')
    .select('start_time, end_time, is_working')
    .eq('staff_id', staffId)
    .eq('day_of_week', dayOfWeek)
    .maybeSingle();

  if (error || !row) {
    return { kind: 'none' };
  }
  if (row.is_working === false) {
    return { kind: 'closed' };
  }

  const normalize = (t: string) => {
    const s = typeof t === 'string' ? t : String(t);
    if (s.length >= 8) return s;
    if (s.length === 5) return `${s}:00`;
    return `${s}:00`;
  };

  const start = row.start_time != null ? normalize(String(row.start_time)) : '09:00:00';
  const end = row.end_time != null ? normalize(String(row.end_time)) : '18:00:00';

  return {
    kind: 'open',
    shifts: [
      {
        id: `staff-schedule-${staffId}-${date}`,
        staff_id: staffId,
        date,
        start_time: start,
        end_time: end,
        is_recurring: false,
      },
    ],
  };
}

/**
 * Check if staff member has work hours enabled
 */
export async function checkWorkHoursEnabled(
  supabase: SupabaseClient,
  staffId: string | null
): Promise<boolean> {
  if (!staffId) {
    return false;
  }

  const { data: staffData, error } = await supabase
    .from('provider_staff')
    .select('work_hours_enabled')
    .eq('id', staffId)
    .single();

  if (error || !staffData) {
    // Default to true if we can't determine (backward compatibility)
    return true;
  }

  return staffData.work_hours_enabled ?? true;
}

/**
 * Load staff shifts for a given staff member and date
 * Returns empty array if work_hours_enabled is false
 */
export async function loadStaffShifts(
  supabase: SupabaseClient,
  staffId: string | null,
  date: string
): Promise<StaffShift[]> {
  if (!staffId) {
    return [];
  }

  if (staffId.startsWith(SYNTHETIC_PROVIDER_STAFF_PREFIX)) {
    return [];
  }

  // Check if work hours are enabled for this staff member
  const workHoursEnabled = await checkWorkHoursEnabled(supabase, staffId);

  // If work hours are disabled, return empty array (staff is not constrained by shifts)
  if (!workHoursEnabled) {
    return [];
  }

  // Query shifts for the specific date
  const { data: shifts, error } = await supabase
    .from('staff_shifts')
    .select('*')
    .eq('staff_id', staffId)
    .eq('date', date);

  if (error) {
    console.error('Error loading staff shifts:', error);
    return [];
  }

  if (!shifts) {
    return [];
  }

  // Also check for recurring shifts
  const { data: recurringShifts, error: recurringError } = await supabase
    .from('staff_shifts')
    .select('*')
    .eq('staff_id', staffId)
    .eq('is_recurring', true);

  if (!recurringError && recurringShifts) {
    const expandedRecurring = recurringShifts
      .filter((shift) => {
        if (!shift.recurring_pattern) return false;
        return expandRecurringPattern(
          shift.recurring_pattern as any,
          shift.date,
          date
        );
      })
      .map((shift) => ({
        ...shift,
        date, // Override date with target date
        is_recurring: false, // Mark as expanded
      }));

    return [...(shifts || []), ...expandedRecurring] as StaffShift[];
  }

  return (shifts || []) as StaffShift[];
}

/**
 * Load time blocks for a given staff member and date
 */
export async function loadTimeBlocks(
  supabase: SupabaseClient,
  staffId: string | null,
  date: string,
  providerId?: string
): Promise<TimeBlock[]> {
  // Query time blocks for the specific date.
  // Supabase query builders are immutable — each filter call returns a new object,
  // so every conditional filter must be reassigned.
  let query = supabase
    .from('time_blocks')
    .select('*')
    .eq('date', date)
    .eq('is_active', true);

  if (providerId) {
    query = query.eq('provider_id', providerId);
  }

  if (staffId) {
    query = query.or(`staff_id.eq.${staffId},staff_id.is.null`);
  } else {
    query = query.is('staff_id', null);
  }

  const { data: blocks, error } = await query;

  if (error) {
    console.error('Error loading time blocks:', error);
    return [];
  }

  // Query recurring time blocks that started before or on the target date.
  // Exclude blocks whose original date already matches (they were already captured above).
  let recurringQuery = supabase
    .from('time_blocks')
    .select('*')
    .eq('is_recurring', true)
    .eq('is_active', true)
    .lt('date', date); // only blocks whose origin date is before the target date

  if (providerId) {
    recurringQuery = recurringQuery.eq('provider_id', providerId);
  }

  if (staffId) {
    recurringQuery = recurringQuery.or(`staff_id.eq.${staffId},staff_id.is.null`);
  } else {
    recurringQuery = recurringQuery.is('staff_id', null);
  }

  const { data: recurringBlocks, error: recurringError } = await recurringQuery;

  if (!recurringError && recurringBlocks && recurringBlocks.length > 0) {
    const targetDateObj = new Date(`${date}T12:00:00`);
    const targetDayOfWeek = targetDateObj.getDay();

    const expandedRecurring = recurringBlocks
      .filter((block) => {
        const originalDate = new Date(`${block.date}T12:00:00`);
        if (targetDateObj < originalDate) return false;

        if (block.recurring_pattern) {
          // Explicit pattern stored (JSON with frequency/days/end_date)
          return expandRecurringPattern(block.recurring_pattern as any, block.date, date);
        }

        // Fallback: no explicit pattern but is_recurring=true → weekly on same weekday.
        // This handles blocks created without a recurring_pattern (e.g. via mobile app or
        // legacy UI that only set is_recurring without a structured pattern).
        return originalDate.getDay() === targetDayOfWeek;
      })
      .map((block) => ({
        ...block,
        date, // Override to target date so slot-overlap checks use the right day
        is_recurring: false, // Mark as expanded (prevents double-counting)
      }));

    return [...(blocks || []), ...expandedRecurring] as TimeBlock[];
  }

  return (blocks || []) as TimeBlock[];
}

/**
 * Load existing bookings for a given staff member and date
 * Includes buffer_minutes, processing_minutes, finishing_minutes from offerings table
 * Applies staff overrides if they exist
 */
export async function loadExistingBookings(
  supabase: SupabaseClient,
  staffId: string | null,
  date: string
): Promise<BookingService[]> {
  if (!staffId) {
    return [];
  }

  // Load staff overrides first
  const { data: staffData } = await supabase
    .from('provider_staff')
    .select('buffer_minutes_override, processing_minutes_override, finishing_minutes_override')
    .eq('id', staffId)
    .single();

  // Query booking_services for the date
  // Join with bookings to filter by status
  // Join with offerings to get buffer_minutes
  const { data: bookingServices, error } = await supabase
    .from('booking_services')
    .select(`
      id,
      booking_id,
      offering_id,
      staff_id,
      scheduled_start_at,
      scheduled_end_at,
      duration_minutes,
      bookings!inner (
        id,
        status
      ),
      offerings!inner (
        buffer_minutes,
        processing_minutes,
        finishing_minutes
      )
    `)
    .eq('staff_id', staffId)
    .gt('scheduled_end_at', `${date}T00:00:00`)
    .lt('scheduled_start_at', `${date}T23:59:59`)
    .neq('bookings.status', 'cancelled');

  if (error) {
    console.error('Error loading existing bookings:', error);
    return [];
  }

  if (!bookingServices) {
    return [];
  }

  // Transform to BookingService format, applying staff overrides
  return bookingServices
    .filter((bs: any) => {
      // Filter out cancelled bookings (should be handled by query but double-check)
      return bs.bookings?.status !== 'cancelled';
    })
    .map((bs: any) => {
      // Apply staff overrides if they exist, otherwise use service defaults
      const bufferMinutes = staffData?.buffer_minutes_override ?? bs.offerings?.buffer_minutes ?? 15;
      const processingMinutes = staffData?.processing_minutes_override ?? bs.offerings?.processing_minutes ?? 0;
      const finishingMinutes = staffData?.finishing_minutes_override ?? bs.offerings?.finishing_minutes ?? 0;

      return {
        id: bs.id,
        booking_id: bs.booking_id,
        offering_id: bs.offering_id,
        staff_id: bs.staff_id,
        scheduled_start_at: bs.scheduled_start_at,
        scheduled_end_at: bs.scheduled_end_at,
        duration_minutes: bs.duration_minutes,
        buffer_minutes: bufferMinutes,
        processing_minutes: processingMinutes,
        finishing_minutes: finishingMinutes,
      };
    }) as BookingService[];
}

/**
 * All booking_services for a provider on a calendar day (solo `provider-*` staff id — no real staff row).
 */
async function loadExistingBookingsForProviderOnDate(
  supabase: SupabaseClient,
  providerId: string,
  date: string
): Promise<BookingService[]> {
  const { data: bookingServices, error } = await supabase
    .from('booking_services')
    .select(`
      id,
      booking_id,
      offering_id,
      staff_id,
      scheduled_start_at,
      scheduled_end_at,
      duration_minutes,
      bookings!inner (
        id,
        status,
        provider_id
      ),
      offerings!inner (
        buffer_minutes,
        processing_minutes,
        finishing_minutes
      )
    `)
    .eq('bookings.provider_id', providerId)
    .gt('scheduled_end_at', `${date}T00:00:00`)
    .lt('scheduled_start_at', `${date}T23:59:59`)
    .neq('bookings.status', 'cancelled');

  if (error) {
    console.error('Error loading existing bookings for provider:', error);
    return [];
  }

  if (!bookingServices) {
    return [];
  }

  return bookingServices
    .filter((bs: any) => bs.bookings?.status !== 'cancelled')
    .map((bs: any) => {
      const bufferMinutes = bs.offerings?.buffer_minutes ?? 15;
      const processingMinutes = bs.offerings?.processing_minutes ?? 0;
      const finishingMinutes = bs.offerings?.finishing_minutes ?? 0;

      return {
        id: bs.id,
        booking_id: bs.booking_id,
        offering_id: bs.offering_id,
        staff_id: bs.staff_id,
        scheduled_start_at: bs.scheduled_start_at,
        scheduled_end_at: bs.scheduled_end_at,
        duration_minutes: bs.duration_minutes,
        buffer_minutes: bufferMinutes,
        processing_minutes: processingMinutes,
        finishing_minutes: finishingMinutes,
      };
    }) as BookingService[];
}

async function resolveProviderIdFromStaff(
  supabase: SupabaseClient,
  staffId: string
): Promise<string | undefined> {
  const { data } = await supabase
    .from('provider_staff')
    .select('provider_id')
    .eq('id', staffId)
    .maybeSingle();
  return data?.provider_id ?? undefined;
}

/**
 * Active slot holds block the same windows as bookings for availability UI.
 * Uses the same day overlap rule as {@link loadExistingBookings} (naive local date strings).
 */
async function loadActiveBookingHoldsAsSyntheticBookings(
  db: SupabaseClient,
  args: {
    resolvedProviderId?: string;
    syntheticProviderId: string | null;
    effectiveStaffId: string | null;
    date: string;
    excludeHoldId?: string;
  }
): Promise<BookingService[]> {
  const providerId = args.syntheticProviderId ?? args.resolvedProviderId;
  if (!providerId) {
    return [];
  }

  const nowIso = new Date().toISOString();
  const dayStart = `${args.date}T00:00:00`;
  const dayEnd = `${args.date}T23:59:59`;

  let q = db
    .from('booking_holds')
    .select('id, start_at, end_at, staff_id')
    .eq('provider_id', providerId)
    .eq('hold_status', 'active')
    .gt('expires_at', nowIso)
    .gt('end_at', dayStart)
    .lt('start_at', dayEnd);

  if (args.excludeHoldId) {
    q = q.neq('id', args.excludeHoldId);
  }

  if (args.syntheticProviderId) {
    // Solo / “any staff” calendar: every active hold on this provider for the day blocks a slot.
  } else if (args.effectiveStaffId) {
    q = q.or(`staff_id.eq.${args.effectiveStaffId},staff_id.is.null`);
  } else {
    return [];
  }

  const { data, error } = await q;

  if (error) {
    console.error('Error loading booking holds for availability:', error);
    return [];
  }

  if (!data?.length) {
    return [];
  }

  return data.map((h) => ({
    id: `hold:${h.id}`,
    booking_id: `hold:${h.id}`,
    offering_id: HOLD_SYNTHETIC_OFFERING_ID,
    staff_id: h.staff_id ?? args.effectiveStaffId,
    scheduled_start_at: h.start_at as string,
    scheduled_end_at: h.end_at as string,
    duration_minutes: 0,
    buffer_minutes: 0,
    processing_minutes: 0,
    finishing_minutes: 0,
  })) as BookingService[];
}

/**
 * Load provider settings (gap avoidance, etc.)
 */
export async function loadProviderSettings(
  supabase: SupabaseClient,
  providerId: string
): Promise<{ avoidGaps: boolean; allowDoubleBookingManual: boolean }> {
  const { data: settings } = await supabase
    .from('provider_settings')
    .select('avoid_gaps, allow_double_booking_manual')
    .eq('provider_id', providerId)
    .single();

  return {
    avoidGaps: settings?.avoid_gaps ?? false,
    allowDoubleBookingManual: settings?.allow_double_booking_manual ?? false,
  };
}

export type LoadAvailabilityConstraintsOptions = {
  /**
   * Service-role client for staff_shifts / time_blocks / booking_services reads.
   * If omitted, we try getSupabaseAdmin() so public booking sees real shifts and all bookings on the staff.
   */
  constraintsClient?: SupabaseClient;
  /**
   * When set, this active hold is not treated as blocking (caller’s own hold while finishing checkout).
   */
  excludeHoldId?: string;
  /**
   * Merge availability_blocks + staff time off / day off (same rules as public slug availability).
   */
  publicCalendarParity?: {
    providerId: string;
    locationId?: string | null;
    date: string;
    slotStaffId: string | null;
    staffIdsForTimeOff: string[];
  };
};

function resolveConstraintsDb(
  userClient: SupabaseClient,
  explicit?: SupabaseClient
): SupabaseClient {
  if (explicit) return explicit;
  try {
    return getSupabaseAdmin();
  } catch {
    return userClient;
  }
}

/**
 * Load all constraints for availability calculation
 */
export async function loadAvailabilityConstraints(
  supabase: SupabaseClient,
  staffId: string | null,
  date: string,
  providerId?: string,
  options?: LoadAvailabilityConstraintsOptions
): Promise<AvailabilityConstraints & {
  providerSettings?: { avoidGaps: boolean; allowDoubleBookingManual: boolean };
  workHoursEnabled?: boolean;
}> {
  const db = resolveConstraintsDb(supabase, options?.constraintsClient);

  const syntheticProviderId = parseSyntheticProviderStaffId(staffId);
  if (staffId?.startsWith(SYNTHETIC_PROVIDER_STAFF_PREFIX) && !syntheticProviderId) {
    return {
      staffShifts: [],
      timeBlocks: [],
      existingBookings: [],
      providerSettings: undefined,
      workHoursEnabled: false,
    };
  }

  const effectiveStaffId = syntheticProviderId ? null : staffId;

  const workHoursEnabled = syntheticProviderId
    ? true
    : staffId
      ? await checkWorkHoursEnabled(db, staffId)
      : false;

  const resolvedProviderId =
    providerId ??
    syntheticProviderId ??
    (effectiveStaffId ? await resolveProviderIdFromStaff(db, effectiveStaffId) : undefined);

  const [shiftsRaw, timeBlocks, existingBookings, providerSettings, holdBlocks] = await Promise.all([
    loadStaffShifts(db, effectiveStaffId, date),
    loadTimeBlocks(db, effectiveStaffId, date, resolvedProviderId),
    syntheticProviderId
      ? loadExistingBookingsForProviderOnDate(db, syntheticProviderId, date)
      : loadExistingBookings(db, effectiveStaffId, date),
    resolvedProviderId ? loadProviderSettings(db, resolvedProviderId) : Promise.resolve(undefined),
    loadActiveBookingHoldsAsSyntheticBookings(db, {
      resolvedProviderId,
      syntheticProviderId,
      effectiveStaffId,
      date,
      excludeHoldId: options?.excludeHoldId,
    }),
  ]);

  let staffShifts = shiftsRaw;
  let skipWorkingHoursFallback = false;

  if (workHoursEnabled && effectiveStaffId && staffShifts.length === 0) {
    const scheduleDay = await resolveStaffScheduleForDate(db, effectiveStaffId, date);
    if (scheduleDay.kind === 'closed') {
      staffShifts = [];
      skipWorkingHoursFallback = true;
    } else if (scheduleDay.kind === 'open') {
      staffShifts = scheduleDay.shifts;
    }
  }

  if (workHoursEnabled && effectiveStaffId && staffShifts.length === 0 && !skipWorkingHoursFallback) {
    staffShifts = await buildStaffShiftsFromWorkingHoursFallback(
      db,
      db,
      effectiveStaffId,
      date,
      resolvedProviderId
    );
  }

  if (workHoursEnabled && resolvedProviderId && staffShifts.length === 0) {
    const fallbackStaffIdForShift =
      effectiveStaffId ?? staffId ?? `${SYNTHETIC_PROVIDER_STAFF_PREFIX}${resolvedProviderId}`;
    staffShifts = await buildStaffShiftsFromPrimaryLocation(
      db,
      resolvedProviderId,
      date,
      fallbackStaffIdForShift
    );
  }

  // PR 7: work_hours_enabled=false means "use location hours".
  // Resolve shifts from the primary location so the calculator uses the
  // shift-based path instead of hardcoded 09:00-18:00.
  let effectiveWorkHoursEnabled = workHoursEnabled;
  if (!workHoursEnabled && resolvedProviderId) {
    const fallbackStaffIdForShift =
      effectiveStaffId ?? staffId ?? `${SYNTHETIC_PROVIDER_STAFF_PREFIX}${resolvedProviderId}`;
    const locationShifts = await buildStaffShiftsFromPrimaryLocation(
      db,
      resolvedProviderId,
      date,
      fallbackStaffIdForShift
    );
    if (locationShifts.length > 0) {
      staffShifts = locationShifts;
      effectiveWorkHoursEnabled = true;
    }
  }

  let parityBookings: BookingService[] = [];
  if (options?.publicCalendarParity && resolvedProviderId) {
    const pc = options.publicCalendarParity;
    try {
      parityBookings = await loadPublicCalendarParityBookings(supabase, db, {
        providerId: pc.providerId,
        date: pc.date,
        locationId: pc.locationId,
        slotStaffId: pc.slotStaffId,
        staffIdsForTimeOff: pc.staffIdsForTimeOff,
      });
    } catch (e) {
      console.error('loadPublicCalendarParityBookings:', e);
    }
  }

  return {
    staffShifts,
    timeBlocks,
    existingBookings: [...existingBookings, ...holdBlocks, ...parityBookings],
    providerSettings,
    workHoursEnabled: effectiveWorkHoursEnabled,
  } as AvailabilityConstraints & {
    providerSettings?: { avoidGaps: boolean; allowDoubleBookingManual: boolean };
    workHoursEnabled?: boolean;
  };
}
