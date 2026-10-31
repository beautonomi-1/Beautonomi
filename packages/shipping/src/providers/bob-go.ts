import type {
  Address,
  CancelShipmentResult,
  CreateShipmentRequest,
  LabelResult,
  Parcel,
  RateQuote,
  RateQuoteRequest,
  Shipment,
  ShippingProvider,
  TrackingUpdate,
} from "../index";
import {
  BobGoLabelNotReadyError,
  BobGoRatesPendingError,
  ShippingProviderNotConfiguredError,
} from "../index";
import { shippingJsonRequest, ShippingHttpError } from "../http";
import { asArray, asRecord, mapCourierTrackingStatus, strField } from "../map-tracking";
import { toShiplogicApiLocality } from "../address-locality";

const DEFAULT_RATES_TIMEOUT_MS = 25_000;
const BOB_GO_RATES_FETCH_TIMEOUT_MS = 30_000;

export type BobGoCredentials = {
  apiKey?: string;
  baseUrl?: string;
};

export type BobGoShipmentSnapshot = {
  id: number | string | null;
  trackingReference: string;
  submissionStatus: string;
  status: string;
  failedReason: string | null;
  chargedAmount: number | null;
  chargedWeightKg: number | null;
  trackingUrl: string | null;
};

type BobGoConfig = {
  baseUrl: string;
  apiKey: string;
};

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function resolveConfig(credentials?: BobGoCredentials): BobGoConfig {
  const apiKey = credentials?.apiKey?.trim() || process.env.BOB_GO_API_KEY?.trim();
  if (!apiKey) throw new ShippingProviderNotConfiguredError("bob-go");
  const baseUrl = stripSlash(
    credentials?.baseUrl?.trim() ||
      process.env.BOB_GO_BASE_URL?.trim() ||
      "https://api.bobgo.co.za/v2",
  );
  return { baseUrl, apiKey };
}

function bearerHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function isBobGoDomesticCountry(country: string): boolean {
  const c = country.trim().toLowerCase();
  return c === "za" || c === "south africa";
}

export function assertBobGoDomesticRoute(origin: Address, destination: Address): void {
  if (!isBobGoDomesticCountry(origin.country) || !isBobGoDomesticCountry(destination.country)) {
    throw new Error("Bob Go only ships within South Africa (ZA)");
  }
}

function splitContactName(full: string): { first: string; surname: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Contact", surname: "" };
  if (parts.length === 1) return { first: parts[0]!, surname: "" };
  return { first: parts[0]!, surname: parts.slice(1).join(" ") };
}

function toBobGoAddress(address: Address, type: "business" | "residential") {
  const { city, suburb, local_area } = toShiplogicApiLocality(address);
  const region = address.region?.trim();
  const body: Record<string, unknown> = {
    type,
    company: type === "business" ? address.name : undefined,
    street_address: address.line1,
    local_area,
    suburb,
    city,
    country: "ZA",
    code: address.postalCode,
  };
  if (region) body.zone = region;
  if (address.latitude != null && address.longitude != null) {
    body.lat = address.latitude;
    body.lng = address.longitude;
  }
  return body;
}

function toBobGoParcels(parcels: Parcel[]) {
  return parcels.map((parcel) => ({
    submitted_length_cm: Math.max(1, Math.round(parcel.lengthCm)),
    submitted_width_cm: Math.max(1, Math.round(parcel.widthCm)),
    submitted_height_cm: Math.max(1, Math.round(parcel.heightCm)),
    submitted_weight_kg: Math.max(0.1, Number(parcel.weightKg.toFixed(3))),
    parcel_description: parcel.description || "Parcel",
    description: parcel.description || "Parcel",
  }));
}

function contactFields(address: Address, prefix: "collection" | "delivery") {
  const { first, surname } = splitContactName(address.name);
  return {
    [`${prefix}_contact_name`]: first,
    [`${prefix}_contact_surname`]: surname || undefined,
    [`${prefix}_contact_full_name`]: address.name,
    [`${prefix}_contact_mobile_number`]: address.phone ?? undefined,
    [`${prefix}_contact_email`]: address.email ?? undefined,
  };
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

function mapSuccessRateRow(
  row: unknown,
  parent: Record<string, unknown>,
  rateRequestId: number | null,
): RateQuote | null {
  const rec = asRecord(row);
  if (strField(rec.status)?.toLowerCase() !== "success") return null;
  const amount = Number(rec.rate_amount ?? rec.total_price ?? rec.rate ?? 0);
  const code =
    strField(rec.service_level_code) ??
    strField(asRecord(rec.service_level ?? rec.service_level_obj).code);
  if (!Number.isFinite(amount) || amount <= 0 || !code) return null;
  const providerSlug =
    strField(rec.provider_slug) ?? strField(parent.provider_slug) ?? null;
  const providerName =
    strField(rec.provider_name) ??
    strField(parent.provider_name) ??
    strField(rec.courier_name) ??
    "";
  const name =
    strField(rec.service_name) ??
    strField(asRecord(rec.service_level).name) ??
    code;
  return {
    service: providerName ? `${providerName} ${name}` : name,
    amount,
    currency: strField(rec.currency) ?? "ZAR",
    etaDays: parseEtaDays(rec),
    metadata: {
      service_level_code: code,
      provider_slug: providerSlug,
      rate_request_id: rateRequestId,
    },
  };
}

function extractBobGoQuotes(payload: unknown): {
  quotes: RateQuote[];
  rateRequestId: number | null;
  hadOnlyPending: boolean;
} {
  const root = asRecord(payload);
  const rateRequestId =
    typeof root.id === "number"
      ? root.id
      : Number.isFinite(Number(root.id))
        ? Number(root.id)
        : null;

  const quotes: RateQuote[] = [];
  let sawPending = false;
  let sawSuccess = false;

  for (const request of asArray(root.provider_rate_requests)) {
    const parent = asRecord(request);
    const parentStatus = strField(parent.status)?.toLowerCase();
    if (parentStatus === "pending") sawPending = true;
    if (parentStatus === "success") {
      for (const response of asArray(parent.responses ?? parent.rates)) {
        const mapped = mapSuccessRateRow(response, parent, rateRequestId);
        if (mapped) {
          quotes.push(mapped);
          sawSuccess = true;
        } else if (strField(asRecord(response).status)?.toLowerCase() === "pending") {
          sawPending = true;
        }
      }
    }
  }

  quotes.sort((a, b) => a.amount - b.amount);
  return {
    quotes,
    rateRequestId,
    hadOnlyPending: sawPending && !sawSuccess && quotes.length === 0,
  };
}

async function postRates(cfg: BobGoConfig, req: RateQuoteRequest): Promise<{
  quotes: RateQuote[];
  rateRequestId: number | null;
  hadOnlyPending: boolean;
}> {
  const timeout = Math.min(25_000, Math.max(0, req.ratesTimeoutMs ?? DEFAULT_RATES_TIMEOUT_MS));
  const declaredValue = req.parcels.reduce((sum, p) => sum + (p.declaredValue ?? 0), 0) || undefined;
  const payload = await shippingJsonRequest({
    url: `${cfg.baseUrl}/rates`,
    method: "POST",
    headers: bearerHeaders(cfg.apiKey),
    body: {
      timeout,
      collection_address: toBobGoAddress(req.origin, "business"),
      delivery_address: toBobGoAddress(req.destination, "residential"),
      parcels: toBobGoParcels(req.parcels),
      declared_value: declaredValue,
      ...contactFields(req.origin, "collection"),
      ...contactFields(req.destination, "delivery"),
    },
    timeoutMs: BOB_GO_RATES_FETCH_TIMEOUT_MS,
  });
  return extractBobGoQuotes(payload);
}

function mapSubmissionToMetadata(submissionStatus: string): {
  booked: boolean;
  inFlight: boolean;
  failed: boolean;
} {
  const s = submissionStatus.toLowerCase();
  if (s === "success") return { booked: true, inFlight: false, failed: false };
  if (s === "no-rates" || s === "failed-indefinitely") {
    return { booked: false, inFlight: false, failed: true };
  }
  if (s === "pending-rates" || s === "pending-submission" || s === "failed-will-retry") {
    return { booked: false, inFlight: true, failed: false };
  }
  return { booked: false, inFlight: true, failed: false };
}

function shipmentFromBobGoPayload(payload: unknown, rate: RateQuote): Shipment {
  const root = asRecord(payload);
  const trackingNumber =
    strField(root.tracking_reference) ??
    strField(root.custom_tracking_reference) ??
    strField(root.short_tracking_reference) ??
    "";
  const submissionStatus = strField(root.submission_status) ?? "";
  const shipmentId = root.id ?? null;
  return {
    providerId: "bob-go",
    trackingNumber,
    waybillUrl: strField(root.tracking_url) ?? undefined,
    rate,
    metadata: {
      shipment_id: shipmentId,
      submission_status: submissionStatus,
      provider_slug: strField(root.provider_slug),
      service_level_code: strField(root.service_level_code),
      failed_reason: strField(root.failed_reason),
      tracking_url: strField(root.tracking_url),
      ...mapSubmissionToMetadata(submissionStatus),
    },
  };
}

async function findExistingShipmentForOrder(
  cfg: BobGoConfig,
  orderRef: string,
): Promise<Shipment | null> {
  const payload = asRecord(
    await shippingJsonRequest({
      url: `${cfg.baseUrl}/shipments?limit=100&offset=0`,
      method: "GET",
      headers: bearerHeaders(cfg.apiKey),
    }),
  );
  const rows = asArray(payload.shipments);
  for (const row of rows) {
    const rec = asRecord(row);
    const meta = asRecord(rec.meta);
    const customOrder =
      strField(meta.custom_order_number) ??
      strField(rec.custom_order_number) ??
      strField(rec.custom_tracking_reference);
    if (customOrder !== orderRef) continue;
    const tracking =
      strField(rec.tracking_reference) ??
      strField(rec.custom_tracking_reference) ??
      "";
    const submissionStatus = strField(rec.submission_status) ?? "pending-rates";
    const placeholderRate: RateQuote = {
      service: "Bob Go",
      amount: Number(rec.charged_amount ?? rec.rate ?? 0) || 0,
      currency: "ZAR",
      etaDays: 3,
      metadata: {
        service_level_code: strField(rec.service_level_code),
        provider_slug: strField(rec.provider_slug),
      },
    };
    return {
      providerId: "bob-go",
      trackingNumber: tracking,
      waybillUrl: strField(rec.tracking_url) ?? undefined,
      rate: placeholderRate,
      metadata: {
        shipment_id: rec.id ?? null,
        submission_status: submissionStatus,
        failed_reason: strField(rec.failed_reason),
        tracking_url: strField(rec.tracking_url),
        reused_existing: true,
        ...mapSubmissionToMetadata(submissionStatus),
      },
    };
  }
  return null;
}

export function parseBobGoShipmentSnapshot(payload: unknown): BobGoShipmentSnapshot | null {
  const root = asRecord(payload);
  const list = asArray(root.shipments);
  const rec = list.length ? asRecord(list[0]) : root;
  const tracking =
    strField(rec.tracking_reference) ??
    strField(rec.shipment_tracking_reference) ??
    "";
  if (!tracking && !rec.id) return null;
  const shipmentId =
    typeof rec.id === "string" || typeof rec.id === "number" ? rec.id : null;
  return {
    id: shipmentId,
    trackingReference: tracking,
    submissionStatus: strField(rec.submission_status) ?? "",
    status: strField(rec.status) ?? "",
    failedReason: strField(rec.failed_reason),
    chargedAmount: Number.isFinite(Number(rec.charged_amount)) ? Number(rec.charged_amount) : null,
    chargedWeightKg: Number.isFinite(Number(rec.charged_weight_kg))
      ? Number(rec.charged_weight_kg)
      : null,
    trackingUrl: strField(rec.tracking_url),
  };
}

export async function fetchBobGoShipment(
  credentials: BobGoCredentials | undefined,
  params: { trackingReference?: string | null; shipmentId?: string | number | null },
): Promise<BobGoShipmentSnapshot | null> {
  const cfg = resolveConfig(credentials);
  const ref = params.trackingReference?.trim();
  const id = params.shipmentId;
  let url: string;
  if (ref) {
    url = `${cfg.baseUrl}/shipments?tracking_reference=${encodeURIComponent(ref)}`;
  } else if (id != null && String(id).trim()) {
    url = `${cfg.baseUrl}/shipments?id=${encodeURIComponent(String(id))}`;
  } else {
    return null;
  }
  const payload = await shippingJsonRequest({
    url,
    method: "GET",
    headers: bearerHeaders(cfg.apiKey),
  });
  return parseBobGoShipmentSnapshot(payload);
}

export function createBobGoProvider(credentials?: BobGoCredentials): ShippingProvider {
  function cfg(): BobGoConfig {
    return resolveConfig(credentials);
  }

  async function quoteRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    assertBobGoDomesticRoute(req.origin, req.destination);
    const { quotes, hadOnlyPending } = await postRates(cfg(), req);
    if (quotes.length === 0 && hadOnlyPending) {
      throw new BobGoRatesPendingError();
    }
    return quotes;
  }

  async function createShipment(req: CreateShipmentRequest): Promise<Shipment> {
    assertBobGoDomesticRoute(req.origin, req.destination);
    const config = cfg();

    const existing = await findExistingShipmentForOrder(config, req.orderRef);
    if (existing?.trackingNumber) return existing;

    let quotes: RateQuote[];
    let hadOnlyPending = false;
    try {
      const result = await postRates(config, req);
      quotes = result.quotes;
      hadOnlyPending = result.hadOnlyPending;
    } catch (err) {
      if (err instanceof BobGoRatesPendingError) throw err;
      throw err;
    }

    if (quotes.length === 0) {
      if (hadOnlyPending) throw new BobGoRatesPendingError();
      throw new Error("Bob Go returned no bookable rates for this route");
    }

    const selected =
      quotes.find((q) => req.service && q.service.toLowerCase().includes(req.service.toLowerCase())) ??
      quotes[0]!;
    const serviceCode = strField(selected.metadata?.service_level_code);
    const providerSlug = strField(selected.metadata?.provider_slug);
    if (!serviceCode) throw new Error("Bob Go quote is missing service_level_code");
    if (!providerSlug) throw new Error("Bob Go quote is missing provider_slug");

    const rateRequestId = selected.metadata?.rate_request_id;
    const collection = splitContactName(req.origin.name);
    const delivery = splitContactName(req.destination.name);
    const declaredValue = req.parcels.reduce((sum, p) => sum + (p.declaredValue ?? 0), 0) || undefined;

    const payload = asRecord(
      await shippingJsonRequest({
        url: `${config.baseUrl}/shipments`,
        method: "POST",
        headers: bearerHeaders(config.apiKey),
        body: {
          provider_slug: providerSlug,
          service_level_code: serviceCode,
          ...(typeof rateRequestId === "number" ? { selected_rate_request_id: rateRequestId } : {}),
          custom_order_number: req.orderRef,
          custom_tracking_reference: req.orderRef,
          collection_address: toBobGoAddress(req.origin, "business"),
          delivery_address: toBobGoAddress(req.destination, "residential"),
          parcels: toBobGoParcels(req.parcels),
          declared_value: declaredValue,
          collection_contact_name: collection.first,
          collection_contact_surname: collection.surname || undefined,
          delivery_contact_name: delivery.first,
          delivery_contact_surname: delivery.surname || undefined,
          ...contactFields(req.origin, "collection"),
          ...contactFields(req.destination, "delivery"),
          instructions_delivery: req.instructionsDelivery?.trim() || undefined,
          instructions_collection: req.instructionsCollection?.trim() || undefined,
        },
      }),
    );

    return shipmentFromBobGoPayload(payload, selected);
  }

  async function track(trackingNumber: string): Promise<TrackingUpdate[]> {
    const config = cfg();
    try {
      const payload = await shippingJsonRequest({
        url: `${config.baseUrl}/tracking?tracking_reference=${encodeURIComponent(trackingNumber)}`,
        method: "GET",
        headers: bearerHeaders(config.apiKey),
      });
      const rows = Array.isArray(payload) ? payload : asArray(asRecord(payload).data);
      const root = rows.length ? asRecord(rows[0]) : asRecord(payload);
      const events = asArray(root.checkpoints ?? root.tracking_events ?? root.events);
      if (events.length === 0) {
        const status = strField(root.status_friendly) ?? strField(root.status);
        if (!status) return [];
        return [
          {
            status: mapCourierTrackingStatus(status),
            message: status,
            occurredAt:
              strField(root.last_checkpoint_time) ??
              strField(root.shipment_time_modified) ??
              new Date().toISOString(),
          },
        ];
      }
      return events.map((event) => {
        const rec = asRecord(event);
        const status =
          strField(rec.status_friendly) ??
          strField(rec.status) ??
          strField(rec.message) ??
          "pending";
        return {
          status: mapCourierTrackingStatus(status),
          message: strField(rec.message) ?? strField(rec.description) ?? status,
          occurredAt:
            strField(rec.time) ??
            strField(rec.occurred_at) ??
            strField(rec.date) ??
            new Date().toISOString(),
        };
      });
    } catch (err) {
      if (err instanceof ShippingHttpError && err.status >= 500) {
        return [];
      }
      throw err;
    }
  }

  async function cancelShipment(params: {
    shipmentId?: string | null;
    trackingNumber?: string | null;
  }): Promise<CancelShipmentResult> {
    const tracking = params.trackingNumber?.trim();
    if (!tracking) {
      return { ok: false, reason: "not_found", message: "Missing Bob Go tracking_reference" };
    }
    try {
      await shippingJsonRequest({
        url: `${cfg().baseUrl}/shipments/cancel`,
        method: "POST",
        headers: bearerHeaders(cfg().apiKey),
        body: { tracking_reference: tracking },
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: "courier_rejected",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function fetchLabel(params: {
    shipmentId?: string | null;
    trackingNumber?: string | null;
  }): Promise<LabelResult> {
    const ref = params.trackingNumber?.trim();
    if (!ref) throw new Error("Bob Go tracking reference required for waybill");
    const config = cfg();
    const query = `tracking_references=${encodeURIComponent(JSON.stringify([ref]))}`;
    const payload = asRecord(
      await shippingJsonRequest({
        url: `${config.baseUrl}/shipments/waybill?${query}`,
        method: "GET",
        headers: bearerHeaders(config.apiKey),
      }),
    );
    if (payload.waybills_ready !== true) {
      throw new BobGoLabelNotReadyError();
    }
    const url = strField(payload.download_url);
    if (!url) throw new BobGoLabelNotReadyError("Bob Go waybill response missing download_url");
    return { url, contentType: "application/pdf" };
  }

  return {
    id: "bob-go",
    quoteRates,
    createShipment,
    track,
    cancelShipment,
    fetchLabel,
  };
}
