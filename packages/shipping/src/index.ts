/**
 * F28 — Shipping provider abstraction.
 *
 * Any concrete courier (Aramex, Courier Guy, Bob Go) implements the
 * `ShippingProvider` interface. product-order-lifecycle.ts selects a provider
 * based on `shipping_provider_preference` on the provider row and calls the
 * abstract methods — no courier SDKs leak into app code.
 */

export type ShippingProviderId = "aramex" | "courier-guy" | "bob-go";

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface Parcel {
  /** Weight in kilograms. */
  weightKg: number;
  /** Dimensions in centimeters. */
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Total declared value in the provider's local currency. */
  declaredValue?: number;
  /** Short description for the waybill. */
  description: string;
}

export interface RateQuoteRequest {
  origin: Address;
  destination: Address;
  parcels: Parcel[];
}

export interface RateQuote {
  service: string;
  amount: number;
  currency: string;
  etaDays: number;
  /** Courier-specific fields needed to book the quoted service (not shown to buyers). */
  metadata?: Record<string, unknown>;
}

export interface CreateShipmentRequest extends RateQuoteRequest {
  orderRef: string;
  service?: string;
}

export interface Shipment {
  providerId: ShippingProviderId;
  trackingNumber: string;
  waybillUrl?: string;
  rate: RateQuote;
  metadata?: Record<string, unknown>;
}

export interface TrackingUpdate {
  status: "pending" | "in_transit" | "out_for_delivery" | "delivered" | "returned" | "exception";
  message: string;
  occurredAt: string;
}

export interface ShippingProvider {
  readonly id: ShippingProviderId;
  quoteRates(req: RateQuoteRequest): Promise<RateQuote[]>;
  createShipment(req: CreateShipmentRequest): Promise<Shipment>;
  track(trackingNumber: string): Promise<TrackingUpdate[]>;
}

export class ShippingProviderNotConfiguredError extends Error {
  constructor(public readonly providerId: ShippingProviderId) {
    super(`Shipping provider "${providerId}" is not configured (missing credentials).`);
  }
}

import { createAramexProvider, type AramexCredentials } from "./providers/aramex";
import { createCourierGuyProvider } from "./providers/courier-guy";
import { createBobGoProvider } from "./providers/bob-go";

export type BearerCourierCredentials = {
  apiKey: string;
  baseUrl?: string;
};

export type ShippingRuntimeCredentials = {
  "courier-guy"?: BearerCourierCredentials;
  "bob-go"?: BearerCourierCredentials;
  aramex?: AramexCredentials;
};

export function getShippingProvider(
  id: ShippingProviderId,
  credentials?: ShippingRuntimeCredentials,
): ShippingProvider {
  switch (id) {
    case "aramex":
      return createAramexProvider(credentials?.aramex);
    case "courier-guy":
      return createCourierGuyProvider(credentials?.["courier-guy"]);
    case "bob-go":
      return createBobGoProvider(credentials?.["bob-go"]);
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown shipping provider: ${String(_exhaustive)}`);
    }
  }
}
