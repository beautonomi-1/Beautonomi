import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureWalkInCustomOffering,
  isWalkInCustomServiceInput,
  walkInCustomServiceLabel,
} from "@/lib/bookings/walk-in-custom-service";

type ServiceInput = Record<string, unknown>;

export async function resolveCustomServicesInBookingBody(
  supabase: SupabaseClient,
  providerId: string,
  currency: string,
  services: ServiceInput[] | undefined,
): Promise<ServiceInput[] | undefined> {
  if (!Array.isArray(services) || services.length === 0) return services;

  const customOfferingId = await ensureWalkInCustomOffering(supabase, providerId, currency);
  let customLineIndex = 0;
  return services.map((service) => {
    if (!isWalkInCustomServiceInput(service as never)) return service;
    const label = walkInCustomServiceLabel(service as never);
    const price = Number((service as { price?: unknown }).price ?? 0);
    const duration = Number(
      (service as { duration?: unknown }).duration ??
        (service as { duration_minutes?: unknown }).duration_minutes ??
        60,
    );
    const lineKey = customLineIndex++;
    return {
      ...service,
      serviceId: customOfferingId,
      service_id: customOfferingId,
      offering_id: customOfferingId,
      price,
      duration_minutes: duration,
      duration,
      customization: JSON.stringify({
        display_name: label,
        is_walk_in_custom: true,
        custom_line_index: lineKey,
      }),
      isCustom: undefined,
      customName: undefined,
      name: undefined,
    };
  });
}
