import { addMoney } from "@beautonomi/utils";
/**
 * Server-side pricing for group-booking participants (F4-04).
 *
 * Clients send `participants[].price` (service + add-ons) and `travel_fee`.
 * Those values are never trusted: each participant price is re-derived from the
 * provider's `offerings` catalogue (service / variant price + add-on prices) and
 * the at-home travel fee is recomputed from the provider's travel settings.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateTravelFeeForHold } from "@/lib/travel/calculateTravelFeeForHold";

type ParticipantLike = Record<string, unknown>;

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function addonIdOf(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return pickString(r.addon_id, r.addonId, r.id);
}

export type ResolvedParticipantPricing =
  | { ok: true; participants: ParticipantLike[]; participantTotal: number }
  | { ok: false; message: string; code: string };

export async function resolveGroupParticipantServerPrices(params: {
  supabaseAdmin: SupabaseClient;
  providerId: string;
  participants: ParticipantLike[];
  fallbackServiceId?: string | null;
}): Promise<ResolvedParticipantPricing> {
  const { supabaseAdmin, providerId, participants, fallbackServiceId } = params;
  if (participants.length === 0) return { ok: true, participants: [], participantTotal: 0 };

  const offeringIds = new Set<string>();
  for (const p of participants) {
    const sid = pickString(p.service_id, p.serviceId, fallbackServiceId);
    if (sid) offeringIds.add(sid);
    const addons = Array.isArray(p.addons) ? p.addons : [];
    for (const a of addons) {
      const aid = addonIdOf(a);
      if (aid) offeringIds.add(aid);
    }
  }

  const priceById = new Map<string, number>();
  if (offeringIds.size > 0) {
    const { data, error } = await supabaseAdmin
      .from("offerings")
      .select("id, price, provider_id")
      .in("id", [...offeringIds])
      .eq("provider_id", providerId);
    if (error) {
      return {
        ok: false,
        message: "Could not resolve service prices for this group. Please try again.",
        code: "PRICE_RESOLUTION_FAILED",
      };
    }
    for (const row of (data ?? []) as Array<{ id: string; price: unknown }>) {
      priceById.set(row.id, Math.max(0, Number(row.price) || 0));
    }
  }

  const priced: ParticipantLike[] = [];
  let participantTotal = 0;
  for (let idx = 0; idx < participants.length; idx++) {
    const p = participants[idx];
    const sid = pickString(p.service_id, p.serviceId, fallbackServiceId);
    if (!sid) {
      // No service → no child booking is created for this row; price is 0.
      priced.push({ ...p, price: 0 });
      continue;
    }
    if (!priceById.has(sid)) {
      return {
        ok: false,
        message: `Service for participant ${pickString(p.name, p.participant_name) ?? idx + 1} was not found in your catalogue.`,
        code: "INVALID_SERVICE",
      };
    }
    let price = priceById.get(sid) ?? 0;
    const rawAddons = Array.isArray(p.addons) ? p.addons : [];
    const pricedAddons: unknown[] = [];
    for (const a of rawAddons) {
      const aid = addonIdOf(a);
      if (!aid) continue;
      if (!priceById.has(aid)) {
        return {
          ok: false,
          message: `Add-on for participant ${pickString(p.name, p.participant_name) ?? idx + 1} was not found in your catalogue.`,
          code: "INVALID_ADDON",
        };
      }
      const addonPrice = priceById.get(aid) ?? 0;
      price = addMoney(price, addonPrice);
      pricedAddons.push({ ...(a as Record<string, unknown>), price: addonPrice });
    }

    const clientPrice = Number(p.price);
    if (Number.isFinite(clientPrice) && Math.abs(clientPrice - price) > 0.009) {
      console.warn(
        `[group-bookings] participant ${idx} client price ${clientPrice} differs from server price ${price}; using server price`,
      );
    }
    participantTotal = addMoney(participantTotal, price);
    priced.push({ ...p, price, addons: pricedAddons });
  }

  return { ok: true, participants: priced, participantTotal };
}

/**
 * Travel fee for an at-home group session, derived from provider travel settings.
 * Returns 0 when the address has no coordinates or the fee cannot be computed.
 */
export async function resolveGroupTravelFeeServerSide(params: {
  supabaseAdmin: SupabaseClient;
  providerId: string;
  locationType: "at_home" | "at_salon";
  address: {
    latitude?: unknown;
    longitude?: unknown;
    line1?: unknown;
    city?: unknown;
    country?: unknown;
    postal_code?: unknown;
  };
  clientTravelFee: unknown;
}): Promise<number> {
  if (params.locationType !== "at_home") return 0;
  const lat = Number(params.address.latitude);
  const lng = Number(params.address.longitude);
  let serverFee = 0;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      const result = await calculateTravelFeeForHold(params.supabaseAdmin, params.providerId, {
        latitude: lat,
        longitude: lng,
        line1: typeof params.address.line1 === "string" ? params.address.line1 : undefined,
        city: typeof params.address.city === "string" ? params.address.city : undefined,
        country: typeof params.address.country === "string" ? params.address.country : undefined,
        postal_code:
          typeof params.address.postal_code === "string" ? params.address.postal_code : undefined,
      });
      serverFee = Math.max(0, Number(result.travelFee) || 0);
    } catch (err) {
      console.warn("[group-bookings] travel fee computation failed; using 0", err);
    }
  } else {
    console.warn("[group-bookings] at-home group without coordinates; travel fee set to 0");
  }
  const clientFee = Number(params.clientTravelFee);
  if (Number.isFinite(clientFee) && Math.abs(clientFee - serverFee) > 0.009) {
    console.warn(
      `[group-bookings] client travel_fee ${clientFee} differs from server travel fee ${serverFee}; using server value`,
    );
  }
  return serverFee;
}
