import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

/** Map DB status to app status; consider slot passed (preferred_date in the past) as expired. */
function toAppStatus(
  dbStatus: string | null,
  preferredDate: string | null
): "waiting" | "notified" | "expired" {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const slotPassed = preferredDate && preferredDate < today;
  if (slotPassed && (dbStatus === "notified" || dbStatus === "contacted" || dbStatus === "waiting")) {
    return "expired";
  }
  switch (dbStatus) {
    case "waiting":
      return "waiting";
    case "contacted":
    case "notified":
      return "notified";
    case "booked":
    case "cancelled":
    default:
      return "expired";
  }
}

/** Enriched entry shape for app (provider_name, service_name, position, slot_passed). */
export type WaitlistEntryEnriched = {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_slug: string | null;
  service_name: string;
  date_added: string;
  position: number;
  status: "waiting" | "notified" | "expired";
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  slot_passed: boolean;
};

/**
 * GET /api/me/waitlist
 * Return the current customer's waitlist entries, enriched with provider/service names and app-friendly status.
 * When the preferred slot date has passed, status is returned as "expired" and slot_passed is true.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);

    const { data: rows, error } = await supabase
      .from("waitlist_entries")
      .select(
        "id, provider_id, service_id, preferred_date, preferred_time_start, preferred_time_end, status, created_at"
      )
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const entries = rows || [];
    if (entries.length === 0) {
      return successResponse([]);
    }

    const providerIds = [...new Set(entries.map((e: { provider_id: string }) => e.provider_id))];
    const serviceIds = [...new Set(entries.map((e: { service_id: string | null }) => e.service_id).filter(Boolean))] as string[];

    const [providersRes, offeringsRes] = await Promise.all([
      providerIds.length > 0
        ? supabase
            .from("providers")
            .select("id, business_name, slug")
            .in("id", providerIds)
            .eq("tenant_id", tenantId)
        : { data: [] as { id: string; business_name: string | null; slug: string | null }[] },
      serviceIds.length > 0
        ? supabase.from("offerings").select("id, title").in("id", serviceIds)
        : { data: [] as { id: string; title: string | null }[] },
    ]);

    const providersById = new Map(
      (providersRes.data || []).map((p) => [p.id, { name: p.business_name || "Provider", slug: p.slug || null }])
    );
    const offeringsById = new Map(
      (offeringsRes.data || []).map((o) => [o.id, o.title || "Service"])
    );

    const today = new Date().toISOString().slice(0, 10);
    const tenantEntries = entries.filter((row: any) => providersById.has(row.provider_id));
    const enriched: WaitlistEntryEnriched[] = tenantEntries.map((row: any, index: number) => {
      const preferredDate = row.preferred_date ?? null;
      const slotPassed = !!preferredDate && preferredDate < today;
      const appStatus = toAppStatus(row.status, preferredDate);
      const provider = providersById.get(row.provider_id);
      const serviceName = row.service_id ? offeringsById.get(row.service_id) ?? "Service" : "Service";

      return {
        id: row.id,
        provider_id: row.provider_id,
        provider_name: provider?.name ?? "Provider",
        provider_slug: provider?.slug ?? null,
        service_name: serviceName,
        date_added: row.created_at,
        position: index + 1,
        status: appStatus,
        preferred_date: preferredDate,
        preferred_time_start: row.preferred_time_start ?? null,
        preferred_time_end: row.preferred_time_end ?? null,
        slot_passed: slotPassed,
      };
    });

    return successResponse(enriched);
  } catch (error) {
    return handleApiError(error, "Failed to load waitlist entries");
  }
}

/**
 * DELETE /api/me/waitlist
 * Remove a waitlist entry by ID.
 * Query param: ?id=<entry_id>
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);

    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get("id");

    if (!entryId) {
      return handleApiError(
        new Error("id query param is required"),
        "id query param is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify the entry belongs to this customer before deleting
    const { data: entry, error: fetchError } = await supabase
      .from("waitlist_entries")
      .select("id, customer_id, provider_id")
      .eq("id", entryId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (!entry) {
      return notFoundResponse("Waitlist entry not found");
    }
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("id", (entry as { provider_id: string }).provider_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!provider?.id) {
      return notFoundResponse("Waitlist entry not found");
    }

    const { error } = await supabase
      .from("waitlist_entries")
      .delete()
      .eq("id", entryId)
      .eq("customer_id", user.id);

    if (error) {
      throw error;
    }

    return successResponse({ removed: true, id: entryId });
  } catch (error) {
    return handleApiError(error, "Failed to remove waitlist entry");
  }
}
