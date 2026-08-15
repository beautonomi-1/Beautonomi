import type {
  Address,
  CreateShipmentRequest,
  Parcel,
  RateQuote,
  RateQuoteRequest,
  Shipment,
  ShippingProvider,
  TrackingUpdate,
} from "../index";
import { ShippingProviderNotConfiguredError } from "../index";
import { shippingJsonRequest } from "../http";
import { asArray, asRecord, mapCourierTrackingStatus, strField } from "../map-tracking";

/**
 * Aramex Shipping API v2 JSON wrappers around the SOAP services.
 *
 * Live:
 *   https://ws.aramex.net/ShippingAPI.V2/RateCalculator/Service_1_0.svc/json/CalculateRate
 *   https://ws.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc/json/CreateShipments
 *   https://ws.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc/json/TrackShipments
 * Sandbox: https://ws.sbx.aramex.net/ShippingAPI.V2/...
 *
 * Env: ARAMEX_ACCOUNT_NUMBER, ARAMEX_ACCOUNT_PIN, ARAMEX_USERNAME, ARAMEX_PASSWORD.
 * Optional: ARAMEX_ACCOUNT_ENTITY (default JNB), ARAMEX_ACCOUNT_COUNTRY_CODE (default ZA),
 * ARAMEX_SOURCE (default 24), ARAMEX_BASE_URL.
 * Callers may pass live keys from platform_secrets instead of env.
 */
export type AramexCredentials = {
  accountNumber: string;
  accountPin: string;
  username: string;
  password: string;
  accountEntity?: string;
  accountCountryCode?: string;
  source?: number;
  baseUrl?: string;
};

function resolveAramex(credentials?: Partial<AramexCredentials>): AramexCredentials | null {
  const accountNumber = credentials?.accountNumber?.trim() || process.env.ARAMEX_ACCOUNT_NUMBER?.trim();
  const accountPin = credentials?.accountPin?.trim() || process.env.ARAMEX_ACCOUNT_PIN?.trim();
  const username = credentials?.username?.trim() || process.env.ARAMEX_USERNAME?.trim();
  const password = credentials?.password?.trim() || process.env.ARAMEX_PASSWORD?.trim();
  if (!accountNumber || !accountPin || !username || !password) return null;
  const sourceRaw = credentials?.source ?? Number(process.env.ARAMEX_SOURCE ?? 24);
  return {
    accountNumber,
    accountPin,
    username,
    password,
    accountEntity:
      credentials?.accountEntity?.trim() || process.env.ARAMEX_ACCOUNT_ENTITY?.trim() || "JNB",
    accountCountryCode:
      credentials?.accountCountryCode?.trim() ||
      process.env.ARAMEX_ACCOUNT_COUNTRY_CODE?.trim() ||
      "ZA",
    source: Number.isFinite(sourceRaw) ? sourceRaw : 24,
    baseUrl:
      credentials?.baseUrl?.trim() ||
      process.env.ARAMEX_BASE_URL?.trim() ||
      "https://ws.aramex.net/ShippingAPI.V2",
  };
}

function countryCode(address: Address): string {
  const raw = address.country.trim().toUpperCase();
  if (raw === "SOUTH AFRICA") return "ZA";
  return raw.length === 2 ? raw : "ZA";
}

function isDomestic(origin: Address, destination: Address): boolean {
  return countryCode(origin) === countryCode(destination);
}

function totalWeightKg(parcels: Parcel[]): number {
  return Math.max(
    0.5,
    parcels.reduce((sum, parcel) => sum + parcel.weightKg, 0),
  );
}

function clientInfo(creds: AramexCredentials) {
  return {
    UserName: creds.username,
    Password: creds.password,
    Version: "v1.0",
    AccountNumber: creds.accountNumber,
    AccountPin: creds.accountPin,
    AccountEntity: creds.accountEntity ?? "JNB",
    AccountCountryCode: creds.accountCountryCode ?? "ZA",
    Source: creds.source ?? 24,
  };
}

function partyAddress(address: Address) {
  return {
    Line1: address.line1,
    Line2: address.line2 ?? "",
    City: address.city,
    StateOrProvinceCode: address.region ?? "",
    PostCode: address.postalCode,
    CountryCode: countryCode(address),
  };
}

function contact(address: Address) {
  return {
    PersonName: address.name,
    CompanyName: address.name,
    PhoneNumber1: address.phone ?? "0000000000",
    CellPhone: address.phone ?? "0000000000",
    EmailAddress: address.email ?? "",
  };
}

function aramexBase(creds: AramexCredentials): string {
  return (creds.baseUrl ?? "https://ws.aramex.net/ShippingAPI.V2").replace(/\/+$/, "");
}

function notificationsMessage(payload: Record<string, unknown>): string {
  const notes = asArray(payload.Notifications ?? payload.notifications);
  const parts = notes
    .map((note) => {
      const rec = asRecord(note);
      return strField(rec.Message) ?? strField(rec.message);
    })
    .filter(Boolean);
  return parts.join("; ") || "Aramex request failed";
}

function assertNoAramexErrors(payload: unknown, action: string): Record<string, unknown> {
  const root = asRecord(payload);
  if (root.HasErrors === true || root.hasErrors === true) {
    throw new Error(`${action}: ${notificationsMessage(root)}`);
  }
  return root;
}

function amountFrom(value: unknown): { amount: number; currency: string } | null {
  const rec = asRecord(value);
  const amount = Number(rec.Value ?? rec.value ?? rec.Amount ?? rec.amount);
  const currency = strField(rec.CurrencyCode) ?? strField(rec.currencyCode) ?? "ZAR";
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency };
}

export function createAramexProvider(credentials?: Partial<AramexCredentials>): ShippingProvider {
  function requireCreds(): AramexCredentials {
    const creds = resolveAramex(credentials);
    if (!creds) throw new ShippingProviderNotConfiguredError("aramex");
    return creds;
  }

  async function quoteRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    const creds = requireCreds();
    const domestic = isDomestic(req.origin, req.destination);
    const payload = assertNoAramexErrors(
      await shippingJsonRequest({
        url: `${aramexBase(creds)}/RateCalculator/Service_1_0.svc/json/CalculateRate`,
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: {
          ClientInfo: clientInfo(creds),
          OriginAddress: partyAddress(req.origin),
          DestinationAddress: partyAddress(req.destination),
          ShipmentDetails: {
            PaymentType: "P",
            ProductGroup: domestic ? "DOM" : "EXP",
            ProductType: domestic ? "ONP" : "EPX",
            ActualWeight: { Value: totalWeightKg(req.parcels), Unit: "KG" },
            ChargeableWeight: { Value: totalWeightKg(req.parcels), Unit: "KG" },
            NumberOfPieces: Math.max(1, req.parcels.length),
            DescriptionOfGoods: req.parcels[0]?.description ?? "Parcel",
            GoodsOriginCountry: countryCode(req.origin),
          },
          PreferredCurrencyCode: "ZAR",
        },
      }),
      "Aramex CalculateRate",
    );
    const parsed = amountFrom(payload.TotalAmount ?? payload.RateDetails);
    if (!parsed) return [];
    return [
      {
        service: domestic ? "Priority Domestic" : "Priority Express",
        amount: parsed.amount,
        currency: parsed.currency,
        etaDays: domestic ? 2 : 5,
        metadata: {
          product_group: domestic ? "DOM" : "EXP",
          product_type: domestic ? "ONP" : "EPX",
        },
      },
    ];
  }

  async function createShipment(req: CreateShipmentRequest): Promise<Shipment> {
    const creds = requireCreds();
    const quotes = await quoteRates(req);
    const selected = quotes[0];
    if (!selected) {
      throw new Error("Aramex returned no bookable rate for this route");
    }
    const domestic = isDomestic(req.origin, req.destination);
    const first = req.parcels[0];
    const payload = assertNoAramexErrors(
      await shippingJsonRequest({
        url: `${aramexBase(creds)}/Shipping/Service_1_0.svc/json/CreateShipments`,
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: {
          ClientInfo: clientInfo(creds),
          LabelInfo: { ReportID: 9201, ReportType: "URL" },
          Shipments: [
            {
              Reference1: req.orderRef,
              Shipper: {
                AccountNumber: creds.accountNumber,
                PartyAddress: partyAddress(req.origin),
                Contact: contact(req.origin),
              },
              Consignee: {
                PartyAddress: partyAddress(req.destination),
                Contact: contact(req.destination),
              },
              Details: {
                Dimensions: {
                  Length: Math.max(1, Math.round(first?.lengthCm ?? 20)),
                  Width: Math.max(1, Math.round(first?.widthCm ?? 15)),
                  Height: Math.max(1, Math.round(first?.heightCm ?? 5)),
                  Unit: "CM",
                },
                ActualWeight: { Value: totalWeightKg(req.parcels), Unit: "KG" },
                ProductGroup: domestic ? "DOM" : "EXP",
                ProductType: domestic ? "ONP" : "EPX",
                PaymentType: "P",
                DescriptionOfGoods: first?.description ?? "Parcel",
                GoodsOriginCountry: countryCode(req.origin),
                NumberOfPieces: Math.max(1, req.parcels.length),
              },
            },
          ],
        },
      }),
      "Aramex CreateShipments",
    );
    const shipments = asArray(payload.Shipments ?? payload.shipments);
    const created = asRecord(shipments[0]);
    const trackingNumber =
      strField(created.ID) ??
      strField(created.Id) ??
      strField(created.ShipmentNumber) ??
      strField(asRecord(created.Shipment).ID);
    if (!trackingNumber) {
      throw new Error("Aramex created a shipment without a tracking number");
    }
    const labelUrl =
      strField(asRecord(created.ShipmentLabel).LabelURL) ??
      strField(created.LabelURL);
    return {
      providerId: "aramex",
      trackingNumber,
      waybillUrl: labelUrl ?? undefined,
      rate: selected,
    };
  }

  async function track(trackingNumber: string): Promise<TrackingUpdate[]> {
    const creds = requireCreds();
    const payload = assertNoAramexErrors(
      await shippingJsonRequest({
        url: `${aramexBase(creds)}/Tracking/Service_1_0.svc/json/TrackShipments`,
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: {
          ClientInfo: clientInfo(creds),
          Shipments: [trackingNumber],
          GetLastTrackingUpdateOnly: false,
        },
      }),
      "Aramex TrackShipments",
    );
    const results = asArray(payload.TrackingResults ?? payload.trackingResults);
    const events: TrackingUpdate[] = [];
    for (const result of results) {
      const rec = asRecord(result);
      const values = asArray(rec.Value ?? rec.value ?? rec.TrackingResult);
      for (const item of values.length ? values : [result]) {
        const row = asRecord(item);
        const status =
          strField(row.UpdateDescription) ??
          strField(row.UpdateCode) ??
          strField(row.Comments);
        if (!status) continue;
        events.push({
          status: mapCourierTrackingStatus(status),
          message: status,
          occurredAt:
            strField(row.UpdateDateTime) ??
            strField(row.UpdateDate) ??
            new Date().toISOString(),
        });
      }
    }
    return events;
  }

  return {
    id: "aramex",
    quoteRates,
    createShipment,
    track,
  };
}
