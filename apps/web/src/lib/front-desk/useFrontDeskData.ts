/**
 * Front Desk Data Hook
 * Reuses fetcher + ProviderPortalProvider patterns.
 */

import { useState, useEffect, useCallback } from "react";
import { getMetricRangeParams } from "@beautonomi/utils";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import type { Booking } from "@/types/beautonomi";
import { getOperationalBadge } from "./operationalState";
import type { FrontDeskBooking, FrontDeskMetricRange } from "./types";

export { formatFrontDeskRangeCaption } from "@beautonomi/utils";

export interface UseFrontDeskDataInput {
  date: Date;
  metricRange?: FrontDeskMetricRange;
  locationId?: string | null;
  staffId?: string | null;
  query?: string;
}

export interface UseFrontDeskDataOutput {
  bookings: FrontDeskBooking[];
  metricBookings: FrontDeskBooking[];
  staff: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string; duration_minutes?: number; price?: number }>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function mapBookingsToFrontDeskBookings(rows: any[]): FrontDeskBooking[] {
  return rows.map((b: any) => {
    const customer = b.customers || {};
    const loc = b.locations || {};
    const firstSvc = (b.services || [])[0];
    return {
      ...b,
      customer_name: customer.full_name || "Customer",
      staff_name: firstSvc?.staff_name || firstSvc?.staff?.name || "",
      location_name: loc.name || "",
      operationalBadge: getOperationalBadge(b),
    };
  });
}

async function fetchBookingsPages(params: URLSearchParams): Promise<any[]> {
  const limit = 1000;
  const rows: any[] = [];
  for (let offset = 0; offset < 10_000; offset += limit) {
    const paged = new URLSearchParams(params);
    paged.set("limit", String(limit));
    paged.set("offset", String(offset));
    const res = await fetcher.get<{ data: Booking[] }>(`/api/provider/bookings?${paged.toString()}`, {
      timeoutMs: 8000,
      staleTimeMs: 0,
    });
    const raw = (res as any)?.data ?? res;
    const page = Array.isArray(raw) ? raw : [];
    rows.push(...page);
    if (page.length < limit) break;
  }
  return rows;
}

/** Fetch staff from provider API (locations are from ProviderPortal) */
async function fetchStaff(locationId?: string | null): Promise<Array<{ id: string; name: string }>> {
  try {
    const { providerApi } = await import("@/lib/provider-portal/api");
    const members = await providerApi.listTeamMembers(locationId || undefined);
    return (members || []).map((m) => ({ id: m.id, name: m.name }));
  } catch {
    return [];
  }
}

/** Fetch locations from provider API */
async function fetchLocations(): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await fetcher.get<{ data: Array<{ id: string; name: string }> }>(
      "/api/provider/locations"
    );
    const data = (res as any)?.data ?? res;
    const arr = Array.isArray(data) ? data : [];
    return arr.map((l: any) => ({ id: l.id, name: l.name || l.address_line1 || "Location" }));
  } catch {
    return [];
  }
}

async function fetchServices(): Promise<Array<{ id: string; name: string; duration_minutes?: number; price?: number }>> {
  try {
    const { providerApi } = await import("@/lib/provider-portal/api");
    const svcs = await providerApi.listServices();
    return (svcs || []).map((s: any) => ({
      id: s.id,
      name: s.title || s.name || "Service",
      duration_minutes: s.duration_minutes || 60,
      price: s.price || 0,
    }));
  } catch {
    return [];
  }
}

export function useFrontDeskData(input: UseFrontDeskDataInput): UseFrontDeskDataOutput {
  const { date, metricRange, locationId, query } = input;
  const [bookings, setBookings] = useState<FrontDeskBooking[]>([]);
  const [metricBookings, setMetricBookings] = useState<FrontDeskBooking[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [services, setServices] = useState<Array<{ id: string; name: string; duration_minutes?: number; price?: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      const rangeDates = getMetricRangeParams(metricRange, date);
      if (rangeDates.start) params.set("start_date", rangeDates.start);
      if (rangeDates.end) params.set("end_date", rangeDates.end);
      if (locationId) params.set("location_id", locationId);

      const [bookingsRows, staffData, locationsData, servicesData] = await Promise.all([
        fetchBookingsPages(params),
        fetchStaff(locationId),
        fetchLocations(),
        fetchServices(),
      ]);

      const enriched = mapBookingsToFrontDeskBookings(bookingsRows);

      let filtered = enriched;
      if (query && query.trim()) {
        const q = query.toLowerCase().trim();
        filtered = enriched.filter(
          (b) =>
            (b.customer_name || "").toLowerCase().includes(q) ||
            (b.booking_number || "").toLowerCase().includes(q) ||
            ((b as any).customers?.phone || "").toLowerCase().includes(q)
        );
      }

      setBookings(filtered);
      setMetricBookings(enriched);
      setStaff(staffData);
      setLocations(locationsData);
      setServices(servicesData);
    } catch (err) {
      const msg =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
            ? err.message
            : "Failed to load bookings";
      setError(msg);
      setBookings([]);
      setMetricBookings([]);
    } finally {
      setLoading(false);
    }
  }, [date, metricRange, locationId, query]);

  useEffect(() => {
    load();
  }, [load]);

  return { bookings, metricBookings, staff, locations, services, loading, error, refetch: load };
}
