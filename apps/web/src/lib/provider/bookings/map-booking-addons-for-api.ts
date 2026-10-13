export type BookingAddonJoinRow = {
  id: string;
  addon_id: string;
  addon_name?: string | null;
  quantity?: number;
  price?: number;
  offerings?:
    | { title?: string; duration_minutes?: number; applicable_service_ids?: string[] | null }
    | Array<{ title?: string; duration_minutes?: number; applicable_service_ids?: string[] | null }>;
};

export function mapBookingAddonsForApi(rows: BookingAddonJoinRow[] | null | undefined) {
  return (rows ?? []).map((ba) => {
    const offering = Array.isArray(ba.offerings) ? ba.offerings[0] : ba.offerings;
    return {
      id: ba.id,
      addon_id: ba.addon_id,
      addon_name: ba.addon_name || offering?.title || "Add-on",
      quantity: ba.quantity ?? 1,
      price: ba.price ?? 0,
      duration_minutes: offering?.duration_minutes ?? 0,
      applicable_service_ids: offering?.applicable_service_ids ?? null,
    };
  });
}

/** Supabase nested select fragment for booking list/detail queries. */
export const BOOKING_ADDONS_SELECT = `
  booking_addons(
    id,
    addon_id,
    addon_name,
    quantity,
    price,
    offerings:offerings!booking_addons_addon_id_fkey(id, title, duration_minutes, applicable_service_ids)
  )`;
