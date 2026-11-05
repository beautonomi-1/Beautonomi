import type { SupabaseClient } from "@supabase/supabase-js";
import { pickFirstStaffForNullStaffLines } from "@/lib/bookings/resolve-any-staff-for-public-booking";

export const PROVIDER_ANY_STAFF_TOKEN = "any";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedProviderStaffToken =
  | { kind: "none" }
  | { kind: "any" }
  | { kind: "uuid"; id: string }
  | { kind: "invalid" };

export function parseProviderStaffToken(raw: unknown): ParsedProviderStaffToken {
  if (raw == null) return { kind: "none" };
  const trimmed = String(raw).trim();
  if (!trimmed) return { kind: "none" };
  if (trimmed === PROVIDER_ANY_STAFF_TOKEN) return { kind: "any" };
  if (UUID_RE.test(trimmed)) return { kind: "uuid", id: trimmed };
  return { kind: "invalid" };
}

export function staffTokenFromServiceLine(service: Record<string, unknown>): unknown {
  return service.staffId ?? service.staff_id ?? null;
}

export function writeStaffTokenToServiceLine(
  service: Record<string, unknown>,
  staffId: string | null,
): void {
  if ("staffId" in service) service.staffId = staffId;
  if ("staff_id" in service) service.staff_id = staffId;
  if (!("staffId" in service) && !("staff_id" in service)) {
    service.staff_id = staffId;
  }
}

async function loadOfferingBufferMinutesById(
  supabaseAdmin: SupabaseClient,
  offeringIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (offeringIds.length === 0) return map;
  const { data } = await supabaseAdmin
    .from("offerings")
    .select("id, buffer_minutes")
    .in("id", offeringIds);
  for (const row of data ?? []) {
    const id = String((row as { id: string }).id);
    const buf = Number((row as { buffer_minutes?: number | null }).buffer_minutes);
    map.set(id, Number.isFinite(buf) && buf >= 0 ? buf : 0);
  }
  return map;
}

type ServiceLineWindow = {
  offering_id: string;
  staff_id: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
};

function buildServiceLineWindows(
  services: Record<string, unknown>[],
  scheduledAtFallback: string,
): ServiceLineWindow[] {
  let cursor = new Date(
    (services[0]?.scheduled_start_at as string | undefined) || scheduledAtFallback,
  );
  const lines: ServiceLineWindow[] = [];
  for (const service of services) {
    const offeringId = String(
      service.serviceId || service.service_id || service.offering_id || "",
    );
    const duration = Number(service.duration ?? service.duration_minutes ?? 60);
    const start =
      typeof service.scheduled_start_at === "string"
        ? new Date(service.scheduled_start_at)
        : new Date(cursor);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    cursor = new Date(end.getTime() + Number(service.buffer_minutes ?? 0) * 60 * 1000);
    const parsed = parseProviderStaffToken(staffTokenFromServiceLine(service));
    lines.push({
      offering_id: offeringId,
      staff_id: parsed.kind === "uuid" ? parsed.id : null,
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: end.toISOString(),
    });
  }
  return lines;
}

async function pickProviderStaffForLine(args: {
  supabaseAdmin: SupabaseClient;
  providerId: string;
  locationId: string | null;
  providerTimeZone: string | null;
  travelBufferMinutes: number;
  line: ServiceLineWindow;
  offeringBufferMinutesById: Map<string, number>;
}): Promise<{ ok: true; staffId: string } | { ok: false }> {
  const picked = await pickFirstStaffForNullStaffLines({
    supabaseAdmin: args.supabaseAdmin,
    providerId: args.providerId,
    locationId: args.locationId,
    bookingServicesData: [{ ...args.line, staff_id: null }],
    offeringBufferMinutesById: args.offeringBufferMinutesById,
    providerTimeZone: args.providerTimeZone,
    travelBufferMinutes: args.travelBufferMinutes,
    staffPool: "provider",
  });
  if (!picked.ok) return { ok: false };
  return { ok: true, staffId: picked.staffId };
}

export type ResolveProviderAnyStaffResult =
  | { ok: true }
  | { ok: false; code: "INVALID_STAFF" | "NO_STAFF_AVAILABLE"; message: string };

export async function resolveProviderAnyStaffOnBookingBody(args: {
  supabaseAdmin: SupabaseClient;
  providerId: string;
  locationId: string | null;
  providerTimeZone: string | null;
  scheduledAt: string;
  locationType: "at_salon" | "at_home" | string;
  body: {
    services?: Array<Record<string, unknown>>;
    staff_id?: unknown;
    team_member_id?: unknown;
  };
}): Promise<ResolveProviderAnyStaffResult> {
  const travelBufferMinutes = args.locationType === "at_home" ? 30 : 0;

  if (Array.isArray(args.body.services) && args.body.services.length > 0) {
    for (const service of args.body.services) {
      const parsed = parseProviderStaffToken(staffTokenFromServiceLine(service));
      if (parsed.kind === "invalid") {
        return {
          ok: false,
          code: "INVALID_STAFF",
          message: "Invalid staff selection. Choose a team member or Any staff.",
        };
      }
    }

    const lines = buildServiceLineWindows(args.body.services, args.scheduledAt);
    const offeringIds = [...new Set(lines.map((l) => l.offering_id).filter(Boolean))];
    const offeringBufferMinutesById = await loadOfferingBufferMinutesById(
      args.supabaseAdmin,
      offeringIds,
    );

    for (let i = 0; i < args.body.services.length; i++) {
      const service = args.body.services[i]!;
      const parsed = parseProviderStaffToken(staffTokenFromServiceLine(service));
      if (parsed.kind !== "any") continue;

      const pick = await pickProviderStaffForLine({
        supabaseAdmin: args.supabaseAdmin,
        providerId: args.providerId,
        locationId: args.locationId,
        providerTimeZone: args.providerTimeZone,
        travelBufferMinutes,
        line: lines[i]!,
        offeringBufferMinutesById,
      });
      if (!pick.ok) {
        return {
          ok: false,
          code: "NO_STAFF_AVAILABLE",
          message: "No team member is available for this time. Choose another slot or assign someone specific.",
        };
      }
      writeStaffTokenToServiceLine(service, pick.staffId);
      lines[i]!.staff_id = pick.staffId;
    }
    return { ok: true };
  }

  const topLevel =
    args.body.team_member_id ?? args.body.staff_id ?? null;
  const parsed = parseProviderStaffToken(topLevel);
  if (parsed.kind === "invalid") {
    return {
      ok: false,
      code: "INVALID_STAFF",
      message: "Invalid staff selection. Choose a team member or Any staff.",
    };
  }
  if (parsed.kind !== "any") return { ok: true };

  const offeringId = String(
    (args.body as { offering_id?: string; service_id?: string }).offering_id ||
      (args.body as { service_id?: string }).service_id ||
      "",
  );
  if (!offeringId) {
    return {
      ok: false,
      code: "NO_STAFF_AVAILABLE",
      message: "No team member is available for this time. Choose another slot or assign someone specific.",
    };
  }
  const duration = Number(
    (args.body as { duration_minutes?: number }).duration_minutes ?? 60,
  );
  const start = new Date(args.scheduledAt);
  const end = new Date(start.getTime() + duration * 60 * 1000);
  const offeringBufferMinutesById = await loadOfferingBufferMinutesById(args.supabaseAdmin, [
    offeringId,
  ]);
  const pick = await pickProviderStaffForLine({
    supabaseAdmin: args.supabaseAdmin,
    providerId: args.providerId,
    locationId: args.locationId,
    providerTimeZone: args.providerTimeZone,
    travelBufferMinutes,
    line: {
      offering_id: offeringId,
      staff_id: null,
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: end.toISOString(),
    },
    offeringBufferMinutesById,
  });
  if (!pick.ok) {
    return {
      ok: false,
      code: "NO_STAFF_AVAILABLE",
      message: "No team member is available for this time. Choose another slot or assign someone specific.",
    };
  }
  if (args.body.team_member_id != null) args.body.team_member_id = pick.staffId;
  if (args.body.staff_id != null || args.body.team_member_id == null) {
    args.body.staff_id = pick.staffId;
  }
  return { ok: true };
}

export async function resolveProviderAnyStaffToken(args: {
  supabaseAdmin: SupabaseClient;
  providerId: string;
  locationId: string | null;
  providerTimeZone: string | null;
  scheduledAt: string;
  durationMinutes: number;
  offeringId: string | null;
  locationType: "at_salon" | "at_home" | string;
  rawStaffId: unknown;
}): Promise<
  | { ok: true; staffId: string | null }
  | { ok: false; code: "INVALID_STAFF" | "NO_STAFF_AVAILABLE"; message: string }
> {
  const parsed = parseProviderStaffToken(args.rawStaffId);
  if (parsed.kind === "invalid") {
    return {
      ok: false,
      code: "INVALID_STAFF",
      message: "Invalid staff selection. Choose a team member or Any staff.",
    };
  }
  if (parsed.kind === "none") return { ok: true, staffId: null };
  if (parsed.kind === "uuid") return { ok: true, staffId: parsed.id };
  if (!args.offeringId) {
    return {
      ok: false,
      code: "NO_STAFF_AVAILABLE",
      message: "No team member is available for this time. Choose another slot or assign someone specific.",
    };
  }
  const travelBufferMinutes = args.locationType === "at_home" ? 30 : 0;
  const start = new Date(args.scheduledAt);
  const end = new Date(start.getTime() + args.durationMinutes * 60 * 1000);
  const offeringBufferMinutesById = await loadOfferingBufferMinutesById(args.supabaseAdmin, [
    args.offeringId,
  ]);
  const pick = await pickProviderStaffForLine({
    supabaseAdmin: args.supabaseAdmin,
    providerId: args.providerId,
    locationId: args.locationId,
    providerTimeZone: args.providerTimeZone,
    travelBufferMinutes,
    line: {
      offering_id: args.offeringId,
      staff_id: null,
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: end.toISOString(),
    },
    offeringBufferMinutesById,
  });
  if (!pick.ok) {
    return {
      ok: false,
      code: "NO_STAFF_AVAILABLE",
      message: "No team member is available for this time. Choose another slot or assign someone specific.",
    };
  }
  return { ok: true, staffId: pick.staffId };
}
