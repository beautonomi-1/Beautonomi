import type { SupabaseClient } from "@supabase/supabase-js";

interface PricingOption {
  id: string;
  price: number;
  duration: number;
  priceType: string;
  pricingName: string;
}

interface ExistingVariant {
  id: string;
  variant_name: string;
}

/**
 * Keeps child variant offerings in sync with a parent service's pricing_options array.
 *
 * Rules:
 *  - Only options with a non-blank pricingName are materialised as child rows.
 *  - If a child with that variant_name already exists it is updated (price/duration
 *    may have changed); otherwise a new row is inserted.
 *  - Child variants whose pricingName is no longer present in the array are
 *    soft-deleted (is_active = false) so historic booking references are preserved.
 *  - If price is 0 in the option, the parent service price is used as fallback.
 */
export async function syncVariantOfferings(
  supabase: SupabaseClient,
  parentService: Record<string, unknown>,
  pricingOptions: PricingOption[]
): Promise<void> {
  try {
    const parentId = parentService.id as string;
    if (!parentId) return;

    const namedOptions = pricingOptions.filter(
      (opt) => opt.pricingName && opt.pricingName.trim() !== ""
    );

    // Load existing child variants for this parent
    const { data: existingVariants } = await supabase
      .from("offerings")
      .select("id, variant_name")
      .eq("parent_service_id", parentId)
      .eq("service_type", "variant");

    const existingMap = new Map<string, string>(
      ((existingVariants as ExistingVariant[]) ?? []).map((v) => [
        v.variant_name,
        v.id,
      ])
    );

    const activeNames = new Set(namedOptions.map((o) => o.pricingName.trim()));

    for (const [idx, opt] of namedOptions.entries()) {
      const name = opt.pricingName.trim();
      const variantPrice =
        opt.price > 0 ? opt.price : (parentService.price as number);
      const variantDuration =
        opt.duration > 0
          ? opt.duration
          : (parentService.duration_minutes as number);

      const variantData: Record<string, unknown> = {
        provider_id: parentService.provider_id,
        parent_service_id: parentId,
        service_type: "variant",
        title: `${parentService.title} - ${name}`,
        variant_name: name,
        description: parentService.description ?? null,
        duration_minutes: variantDuration,
        buffer_minutes: parentService.buffer_minutes ?? 15,
        price: variantPrice,
        currency: parentService.currency ?? "ZAR",
        supports_at_home: parentService.supports_at_home ?? false,
        supports_at_salon: parentService.supports_at_salon ?? true,
        at_home_radius_km: parentService.at_home_radius_km ?? null,
        at_home_price_adjustment: parentService.at_home_price_adjustment ?? 0,
        thumbnail_url: parentService.thumbnail_url ?? null,
        images: parentService.images ?? [],
        is_active: parentService.is_active ?? true,
        online_booking_enabled: parentService.online_booking_enabled ?? true,
        aftercare_description: parentService.aftercare_description ?? null,
        tax_rate: parentService.tax_rate ?? 0,
        provider_category_id: parentService.provider_category_id ?? null,
        team_member_commission_enabled:
          parentService.team_member_commission_enabled ?? false,
        service_available_for: parentService.service_available_for ?? "everyone",
        team_member_ids: parentService.team_member_ids ?? [],
        variant_sort_order: idx,
        updated_at: new Date().toISOString(),
      };

      if (existingMap.has(name)) {
        await supabase
          .from("offerings")
          .update(variantData)
          .eq("id", existingMap.get(name)!);
      } else {
        await supabase.from("offerings").insert(variantData);
      }
    }

    // Soft-delete variants that are no longer in pricing_options
    const toDeactivate = (
      (existingVariants as ExistingVariant[]) ?? []
    )
      .filter((v) => !activeNames.has(v.variant_name))
      .map((v) => v.id);

    if (toDeactivate.length > 0) {
      await supabase
        .from("offerings")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", toDeactivate);
    }
  } catch (err) {
    // Variant sync failure must not break the parent service save
    console.error("[syncVariantOfferings] Failed to sync variants:", err);
  }
}
