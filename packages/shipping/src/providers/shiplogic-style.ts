/**
 * Shared ShipLogic-shaped REST client.
 *
 * The Courier Guy merchant API (`api.shiplogic.com`) and Bob Go v2
 * (`api.bobgo.co.za/v2`) use the same address + parcel + rates/shipments/tracking
 * layout. Auth is a Bearer token issued by that courier's dashboard.
 *
 * @see https://api-docs.shiplogic.com
 * @see https://api-docs.bob.co.za/bobgo
 */

import type {
  Address,
  CreateShipmentRequest,
  Parcel,
  RateQuote,
  RateQuoteRequest,
  Shipment,
  ShippingProviderId,
  TrackingUpdate,
} from "../index";
import { shippingJsonRequest } from "../http";
import { asArray, asRecord, mapCourierTrackingStatus, strField } from "../map-tracking";

export type ShiplogicStyleConfig = {
  providerId: ShippingProviderId;
  baseUrl: string;
  apiKey: string;
  /** Bob Go expects ISO country codes; ShipLogic/TCG examples use the country name. */
  countryName: (iso: string) => string;
  ratesPath: string;
  shipmentsPath: string;
  trackingUrl: (trackingNumber: string) => string;
  requireProviderSlug?: boolean;
};

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function bearerHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function toApiAddress(address: Address, countryName: (iso: string) => string) {
  const iso = address.country.trim().toUpperCase();
  const country = iso.length === 2 ? countryName(iso) : address.country;
  return {
    type: "residential",
    company: address.name,
    street_address: address.line1,
    local_area: address.line2 || address.city,
    suburb: address.city,
    city: address.city,
    zone: address.region || address.city,
    country,
    code: address.postalCode,
  };
}

function toApiParcels(parcels: Parcel[]) {
  return parcels.map((parcel) => ({
    submitted_length_cm: Math.max(1, Math.round(parcel.lengthCm)),
    submitted_width_cm: Math.max(1, Math.round(parcel.widthCm)),
    submitted_height_cm: Math.max(1, Math.round(parcel.heightCm)),
    submitted_weight_kg: Math.max(0.1, Number(parcel.weightKg.toFixed(3))),
    parcel_description: parcel.description || "Parcel",
    description: parcel.description || "Parcel",
  }));
}

function parseEtaDays(rate: Record<string, unknown>): number {
  const level = asRecord(rate.service_level ?? rate.service_level_obj);
  const description =
    strField(level.description) ??
    strField(rate.service_level_description) ??
    strField(rate.transit_time) ??
    "";
  const match = description.match(/(\d+)\s*-\s*(\d+)/) ?? description.match(/(\d+)/);
  if (match?.[2]) return Number(match[2]);
  if (match?.[1]) return Number(match[1]);
  const numeric = Number(rate.delivery_days ?? rate.eta_days ?? rate.transit_days);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 3;
}

function mapRateRow(row: unknown, parent?: Record<string, unknown>): RateQuote | null {
  const rec = asRecord(row);
  const level = asRecord(rec.service_level ?? rec.service_level_obj);
  const amount = Number(
    rec.total_price ?? rec.rate ?? rec.rate_amount ?? rec.total ?? rec.amount ?? 0,
  );
  const code =
    strField(rec.service_level_code) ??
    strField(level.code) ??
    strField(rec.service_code);
  if (!Number.isFinite(amount) || amount <= 0 || !code) return null;
  const providerName =
    strField(rec.provider_name) ??
    strField(parent?.provider_name) ??
    strField(rec.courier_name) ??
    "";
  const name =
    strField(rec.service_name) ??
    strField(level.name) ??
    code;
  const providerSlug =
    strField(rec.provider_slug) ?? strField(parent?.provider_slug) ?? null;
  return {
    service: providerName ? `${providerName} ${name}` : name,
    amount,
    currency: strField(rec.currency) ?? "ZAR",
    etaDays: parseEtaDays(rec),
    metadata: {
      service_level_code: code,
      provider_slug: providerSlug,
    },
  };
}

function extractRateRows(payload: unknown): RateQuote[] {
  if (Array.isArray(payload)) {
    return payload.map((row) => mapRateRow(row)).filter((row): row is RateQuote => row != null);
  }
  const root = asRecord(payload);
  const direct = asArray(root.rates ?? root.data ?? root.results)
    .map((row) => mapRateRow(row))
    .filter((row): row is RateQuote => row != null);
  if (direct.length > 0) return direct;

  const nested: RateQuote[] = [];
  for (const request of asArray(root.provider_rate_requests)) {
    const parent = asRecord(request);
    if (strField(parent.status) && parent.status !== "success") continue;
    for (const response of asArray(parent.responses ?? parent.rates)) {
      const mapped = mapRateRow(response, parent);
      if (mapped) nested.push(mapped);
    }
  }
  return nested;
}

function parseTracking(payload: unknown): TrackingUpdate[] {
  const root = asRecord(payload);
  const events = asArray(
    root.checkpoints ?? root.tracking_events ?? root.events ?? root.data,
  );
  if (events.length === 0) {
    const status = strField(root.status_friendly) ?? strField(root.status);
    if (!status) return [];
    return [
      {
        status: mapCourierTrackingStatus(status),
        message: status,
        occurredAt:
          strField(root.shipment_time_modified) ??
          strField(root.updated_at) ??
          new Date().toISOString(),
      },
    ];
  }
  return events.map((event) => {
    const rec = asRecord(event);
    const status =
      strField(rec.status_friendly) ??
      strField(rec.status) ??
      strField(rec.event_type) ??
      "pending";
    return {
      status: mapCourierTrackingStatus(status),
      message: strField(rec.message) ?? strField(rec.description) ?? status,
      occurredAt:
        strField(rec.date) ??
        strField(rec.occurred_at) ??
        strField(rec.created_at) ??
        strField(rec.timestamp) ??
        new Date().toISOString(),
    };
  });
}

function contactFields(address: Address, prefix: "collection" | "delivery") {
  return {
    [`${prefix}_contact_name`]: address.name,
    [`${prefix}_contact_full_name`]: address.name,
    [`${prefix}_contact_mobile_number`]: address.phone ?? undefined,
    [`${prefix}_contact_email`]: address.email ?? undefined,
  };
}

export async function quoteShiplogicStyleRates(
  config: ShiplogicStyleConfig,
  req: RateQuoteRequest,
): Promise<RateQuote[]> {
  const payload = await shippingJsonRequest({
    url: `${stripSlash(config.baseUrl)}${config.ratesPath}`,
    method: "POST",
    headers: bearerHeaders(config.apiKey),
    body: {
      collection_address: toApiAddress(req.origin, config.countryName),
      delivery_address: toApiAddress(req.destination, config.countryName),
      parcels: toApiParcels(req.parcels),
      ...contactFields(req.origin, "collection"),
      ...contactFields(req.destination, "delivery"),
    },
  });
  return extractRateRows(payload);
}

export async function createShiplogicStyleShipment(
  config: ShiplogicStyleConfig,
  req: CreateShipmentRequest,
): Promise<Shipment> {
  const quotes = await quoteShiplogicStyleRates(config, req);
  const selected =
    quotes.find((q) => req.service && q.service.toLowerCase().includes(req.service.toLowerCase())) ??
    quotes[0];
  if (!selected) {
    throw new Error(`${config.providerId} returned no bookable rates for this route`);
  }
  const serviceCode =
    strField(selected.metadata?.service_level_code) ??
    req.service;
  if (!serviceCode) {
    throw new Error(`${config.providerId} quote is missing a service_level_code`);
  }
  const providerSlug = strField(selected.metadata?.provider_slug);
  if (config.requireProviderSlug && !providerSlug) {
    throw new Error(`${config.providerId} quote is missing provider_slug`);
  }

  const payload = asRecord(
    await shippingJsonRequest({
      url: `${stripSlash(config.baseUrl)}${config.shipmentsPath}`,
      method: "POST",
      headers: bearerHeaders(config.apiKey),
      body: {
        collection_address: toApiAddress(req.origin, config.countryName),
        delivery_address: toApiAddress(req.destination, config.countryName),
        collection_contact: {
          name: req.origin.name,
          email: req.origin.email ?? undefined,
          mobile_number: req.origin.phone ?? undefined,
        },
        delivery_contact: {
          name: req.destination.name,
          email: req.destination.email ?? undefined,
          mobile_number: req.destination.phone ?? undefined,
        },
        ...contactFields(req.origin, "collection"),
        ...contactFields(req.destination, "delivery"),
        parcels: toApiParcels(req.parcels),
        service_level_code: serviceCode,
        ...(providerSlug ? { provider_slug: providerSlug } : {}),
        custom_tracking_reference: req.orderRef,
        custom_order_number: req.orderRef,
        declared_value: req.parcels.reduce((sum, parcel) => sum + (parcel.declaredValue ?? 0), 0) || undefined,
      },
    }),
  );

  const submissionStatus = strField(payload.submission_status)?.toLowerCase();
  if (submissionStatus && ["failed", "error", "rejected"].includes(submissionStatus)) {
    throw new Error(
      strField(payload.failed_reason) ??
        `${config.providerId} shipment submission failed (${submissionStatus})`,
    );
  }

  const trackingNumber =
    strField(payload.tracking_reference) ??
    strField(payload.custom_tracking_reference) ??
    strField(payload.short_tracking_reference) ??
    strField(payload.waybill) ??
    "";
  if (!trackingNumber) {
    throw new Error(`${config.providerId} created a shipment without a tracking number`);
  }
  return {
    providerId: config.providerId,
    trackingNumber,
    waybillUrl: strField(payload.tracking_url) ?? undefined,
    rate: selected,
    metadata: {
      service_level_code: serviceCode,
      provider_slug: providerSlug,
      shipment_id: payload.id ?? null,
    },
  };
}

export async function trackShiplogicStyle(
  config: ShiplogicStyleConfig,
  trackingNumber: string,
): Promise<TrackingUpdate[]> {
  const payload = await shippingJsonRequest({
    url: config.trackingUrl(trackingNumber),
    method: "GET",
    headers: bearerHeaders(config.apiKey),
  });
  return parseTracking(payload);
}
