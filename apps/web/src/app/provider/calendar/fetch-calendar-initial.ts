import { formatInTimeZone } from "date-fns-tz";
import { dateRangeBoundsUtc, resolveTz } from "@/lib/dates/provider-tz";
import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { transformBookingRowsToAppointments } from "@/lib/provider-portal/transform-bookings-to-calendar-appointments";
import type {
  Appointment,
  AvailabilityBlockDisplay,
  AvailabilityBlockRaw,
  TeamMember,
  TimeBlock,
} from "@/lib/provider-portal/types";
import { GET as getProviderProfile } from "@/app/api/provider/profile/route";
import { GET as getProviderStaff } from "@/app/api/provider/staff/route";
import { GET as getProviderBookings } from "@/app/api/provider/bookings/route";
import { GET as getProviderTimeBlocks } from "@/app/api/provider/time-blocks/route";
import { GET as getProviderAvailabilityBlocks } from "@/app/api/provider/availability-blocks/route";
import { GET as getProviderStaffUnavailability } from "@/app/api/provider/calendar/staff-unavailability/route";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Same as provider api `normalizeAvailabilityBlocksToDisplay` (avoid importing full api module on server). */
function normalizeAvailabilityBlocksToDisplay(raw: AvailabilityBlockRaw[]): AvailabilityBlockDisplay[] {
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

function normalizeTimeForCalendar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})/);
  if (!match) return null;
  const rawHour = Number(match[1]);
  const rawMinute = Number(match[2]);
  if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute)) return null;
  const hour = Math.max(0, Math.min(23, rawHour));
  const minute = Math.max(0, Math.min(59, rawMinute));
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function sanitizeAvailabilityBlocks(blocks: AvailabilityBlockDisplay[]): AvailabilityBlockDisplay[] {
  return blocks
    .map((block) => {
      const date = typeof block.date === "string" ? block.date.trim().slice(0, 10) : "";
      if (!YMD_PATTERN.test(date)) return null;
      const startTime = normalizeTimeForCalendar(block.start_time);
      const endTime = normalizeTimeForCalendar(block.end_time);
      if (!startTime || !endTime) return null;
      return {
        ...block,
        date,
        start_time: startTime,
        end_time: endTime,
      };
    })
    .filter((block): block is AvailabilityBlockDisplay => block !== null);
}

function mapStaffJsonToTeamMembers(staff: any[]): TeamMember[] {
  return staff.map((member: any) => ({
    id: member.id,
    name: member.name || "Staff Member",
    email: member.email || "",
    mobile: member.phone || "",
    avatar_url: member.avatar_url || null,
    role:
      member.role === "provider_owner"
        ? "owner"
        : member.role === "provider_manager"
          ? "manager"
          : "employee",
    is_active: member.is_active ?? true,
    working_hours: member.working_hours ?? null,
  }));
}

function mapTimeBlockRows(rows: any[]): TimeBlock[] {
  return (rows || []).map((tb: any) => ({
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
}

function apiMessage(json: unknown): string {
  if (!json || typeof json !== "object") return "Invalid response";
  const e = (json as { error?: { message?: string } | string }).error;
  if (typeof e === "object" && e?.message) return e.message;
  if (typeof e === "string") return e;
  return "Request failed";
}

export interface CalendarInitialPayload {
  /** Matches client loadData cache key for `selectedTeamMember === "all"` and no location filter. */
  cacheKey: string;
  dateFrom: string;
  dateTo: string;
  appointments: Appointment[];
  teamMembers: TeamMember[];
  timeBlocks: TimeBlock[];
  availabilityBlocks: AvailabilityBlockDisplay[];
  error: string | null;
}

/**
 * Server-side parallel load for /provider/calendar — invokes route handlers in-process
 * (no loopback HTTP; fastest TTFB). Same semantics as the underlying GET routes.
 *
 * SSR range: single calendar day in the provider timezone (optional `date` query YYYY-MM-DD),
 * matching the portal default day view. Other views refetch on the client.
 */
export async function fetchCalendarInitial(searchParams: {
  date?: string;
}): Promise<CalendarInitialPayload> {
  try {
    const profileReq = await createNextRequestFromHeaders("/api/provider/profile");
    const profileRes = await getProviderProfile(profileReq);
    let profileJson: { data?: { timezone?: string | null } } | null = null;
    try {
      profileJson = (await profileRes.json()) as { data?: { timezone?: string | null } };
    } catch {
      profileJson = null;
    }
    if (!profileRes.ok || !profileJson?.data) {
      return {
        cacheKey: "",
        dateFrom: "",
        dateTo: "",
        appointments: [],
        teamMembers: [],
        timeBlocks: [],
        availabilityBlocks: [],
        error: apiMessage(profileJson),
      };
    }

    const tz = resolveTz(profileJson.data.timezone);
    const anchorYmd =
      searchParams.date && YMD.test(searchParams.date)
        ? searchParams.date
        : formatInTimeZone(new Date(), tz, "yyyy-MM-dd");

    const dateFrom = anchorYmd;
    const dateTo = anchorYmd;
    const cacheKey = `${dateFrom}-${dateTo}-all-all`;

    const { fromIso, toIso } = dateRangeBoundsUtc(dateFrom, dateTo, tz);

    const bookingsParams = new URLSearchParams();
    bookingsParams.set("start_date", dateFrom);
    bookingsParams.set("end_date", dateTo);
    bookingsParams.set("limit", "500");

    const timeBlocksParams = new URLSearchParams();
    timeBlocksParams.set("date_from", dateFrom);
    timeBlocksParams.set("date_to", dateTo);

    const availParams = new URLSearchParams();
    availParams.set("from", fromIso);
    availParams.set("to", toIso);

    const unavailParams = new URLSearchParams();
    unavailParams.set("date_from", dateFrom);
    unavailParams.set("date_to", dateTo);

    const [staffRes, bookingsRes, blocksRes, availRes, unavailRes] = await Promise.all([
      getProviderStaff(await createNextRequestFromHeaders("/api/provider/staff")),
      getProviderBookings(
        await createNextRequestFromHeaders(`/api/provider/bookings?${bookingsParams.toString()}`),
      ),
      getProviderTimeBlocks(
        await createNextRequestFromHeaders(`/api/provider/time-blocks?${timeBlocksParams.toString()}`),
      ),
      getProviderAvailabilityBlocks(
        await createNextRequestFromHeaders(`/api/provider/availability-blocks?${availParams.toString()}`),
      ),
      getProviderStaffUnavailability(
        await createNextRequestFromHeaders(
          `/api/provider/calendar/staff-unavailability?${unavailParams.toString()}`,
        ),
      ),
    ]);

    const bookingsPayload = (await bookingsRes.json()) as { data?: any[] } | null;

    if (!bookingsRes.ok) {
      return {
        cacheKey,
        dateFrom,
        dateTo,
        appointments: [],
        teamMembers: [],
        timeBlocks: [],
        availabilityBlocks: [],
        error: apiMessage(bookingsPayload),
      };
    }

    const staffJson = (await staffRes.json()) as { data?: unknown } | unknown[];
    let staff: any[] = [];
    if (staffRes.ok && staffJson) {
      if (Array.isArray(staffJson)) staff = staffJson as any[];
      else if (
        staffJson &&
        typeof staffJson === "object" &&
        "data" in staffJson &&
        Array.isArray((staffJson as { data: unknown }).data)
      ) {
        staff = (staffJson as { data: any[] }).data;
      }
    }

    const bookings = bookingsPayload?.data || [];
    const apptsPage = transformBookingRowsToAppointments(
      bookings,
      {
        date_from: dateFrom,
        date_to: dateTo,
        expand_for_calendar: true,
      },
      { page: 1, limit: 500 },
    );

    const blocksPayload = (await blocksRes.json()) as { data?: any[] } | null;
    const availPayload = (await availRes.json()) as { data?: AvailabilityBlockRaw[] } | null;
    const unavailPayload = (await unavailRes.json()) as { data?: AvailabilityBlockDisplay[] } | null;

    const timeBlocks = blocksRes.ok ? mapTimeBlockRows(blocksPayload?.data || []) : [];
    const rawAvail = normalizeAvailabilityBlocksToDisplay(availRes.ok ? availPayload?.data || [] : []);
    const sanitizedAvail = sanitizeAvailabilityBlocks(rawAvail);
    const staffUnavail = unavailRes.ok ? unavailPayload?.data || [] : [];
    const mergedAvailOverlay = [...staffUnavail, ...sanitizedAvail];

    return {
      cacheKey,
      dateFrom,
      dateTo,
      appointments: apptsPage.data,
      teamMembers: mapStaffJsonToTeamMembers(staff),
      timeBlocks,
      availabilityBlocks: mergedAvailOverlay,
      error: null,
    };
  } catch (e) {
    return {
      cacheKey: "",
      dateFrom: "",
      dateTo: "",
      appointments: [],
      teamMembers: [],
      timeBlocks: [],
      availabilityBlocks: [],
      error: e instanceof Error ? e.message : "Failed to load calendar",
    };
  }
}
