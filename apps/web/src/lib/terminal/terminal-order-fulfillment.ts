import type { SupabaseClient } from "@supabase/supabase-js";

export type TerminalFulfillmentType =
  | "shipping"
  | "courier"
  | "collection"
  | "digital_activation";

export type DeliveryAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  contact_name?: string;
  contact_phone?: string;
};

export type CreateTerminalOrderFulfillmentInput = {
  fulfillment_type: TerminalFulfillmentType;
  delivery_address?: DeliveryAddress | null;
  collection_location_id?: string | null;
};

function hasDeliveryAddress(addr: DeliveryAddress | null | undefined): boolean {
  if (!addr) return false;
  return Boolean(
    String(addr.line1 ?? "").trim() ||
      String(addr.city ?? "").trim() ||
      String(addr.postal_code ?? "").trim(),
  );
}

export function validateTerminalOrderFulfillment(input: CreateTerminalOrderFulfillmentInput): void {
  const { fulfillment_type, delivery_address, collection_location_id } = input;

  if (fulfillment_type === "shipping" || fulfillment_type === "courier") {
    if (!hasDeliveryAddress(delivery_address)) {
      throw new Error("Delivery address is required for shipping and courier fulfillment.");
    }
  }

  if (fulfillment_type === "collection" && !collection_location_id) {
    throw new Error("Collection location is required for pickup orders.");
  }
}

export async function resolveProductFulfillmentType(
  supabase: SupabaseClient,
  productId: string,
  override?: TerminalFulfillmentType | null,
): Promise<TerminalFulfillmentType> {
  if (override) return override;

  const { data: product } = await supabase
    .from("terminal_products")
    .select("fulfillment_type")
    .eq("id", productId)
    .maybeSingle();

  const ft = (product as { fulfillment_type?: TerminalFulfillmentType | null } | null)?.fulfillment_type;
  if (!ft) {
    throw new Error("Product fulfillment type is not configured.");
  }
  return ft;
}

export async function assertValidCollectionLocation(
  supabase: SupabaseClient,
  tenantId: string | null,
  collectionLocationId: string,
): Promise<void> {
  const { data: location, error } = await supabase
    .from("terminal_collection_locations")
    .select("id, tenant_id, active")
    .eq("id", collectionLocationId)
    .maybeSingle();

  if (error || !location) {
    throw new Error("Collection location not found.");
  }

  const loc = location as { tenant_id?: string | null; active?: boolean };
  if (loc.active === false) {
    throw new Error("Collection location is not available.");
  }

  const locTenantId = loc.tenant_id ?? null;
  if (locTenantId && tenantId && locTenantId !== tenantId) {
    throw new Error("Collection location is not available for your market.");
  }
}

export async function listTerminalCollectionLocations(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<
  Array<{ id: string; name: string; address: Record<string, unknown>; display_order: number }>
> {
  let query = supabase
    .from("terminal_collection_locations")
    .select("id, name, address, display_order")
    .eq("active", true)
    .order("display_order", { ascending: true });

  if (tenantId) {
    query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  } else {
    query = query.is("tenant_id", null);
  }

  const { data } = await query;
  return (data ?? []) as Array<{
    id: string;
    name: string;
    address: Record<string, unknown>;
    display_order: number;
  }>;
}
