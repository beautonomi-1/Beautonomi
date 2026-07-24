import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requiredDocTypesForEntity,
  type TerminalMerchantApplication,
  type TerminalMerchantEntityType,
} from "@/lib/terminal-merchant/types";

export type PrefillData = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  id_type?: "national_id" | "passport" | "foreign_id";
  id_number?: string;
  legal_name?: string;
  trading_name?: string;
  registration_number?: string;
  vat_number?: string;
  physical_line1?: string;
  physical_suburb?: string;
  physical_city?: string;
  physical_province?: string;
  physical_postal_code?: string;
  physical_country?: string;
  bank_code?: string;
  bank_name?: string;
  account_holder?: string;
  account_number_last4?: string;
  identity_verified?: boolean;
  otp_phone?: string;
};

function mapDiditIdType(raw: string | null | undefined): PrefillData["id_type"] {
  const v = String(raw ?? "").toUpperCase();
  if (v.includes("PASSPORT")) return "passport";
  if (v.includes("FOREIGN")) return "foreign_id";
  return "national_id";
}

export async function buildTerminalMerchantPrefill(
  supabase: SupabaseClient,
  providerId: string,
  userId: string,
): Promise<PrefillData> {
  const [{ data: provider }, { data: user }, { data: location }, { data: payout }] =
    await Promise.all([
      supabase
        .from("providers")
        .select(
          "business_name, registered_business_name, business_registration_number, vat_number, email, phone, owner_name",
        )
        .eq("id", providerId)
        .maybeSingle(),
      supabase
        .from("users")
        .select(
          "email, phone, legal_first_name, legal_last_name, legal_id_number, legal_id_document_type, identity_verified",
        )
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("provider_locations")
        .select("address_line1, address_line2, city, state, postal_code, country")
        .eq("provider_id", providerId)
        .eq("is_primary", true)
        .maybeSingle(),
      supabase
        .from("provider_payout_accounts")
        .select("bank_code, bank_name, account_name, account_number_last4")
        .eq("provider_id", providerId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const p = provider as Record<string, string | null> | null;
  const u = user as Record<string, string | boolean | null> | null;
  const loc = location as Record<string, string | null> | null;
  const pay = payout as Record<string, string | null> | null;

  const ownerName = String(p?.owner_name ?? "").trim();
  const nameParts = ownerName.split(/\s+/);
  const firstFromOwner = nameParts[0] ?? "";
  const lastFromOwner = nameParts.slice(1).join(" ") || "";

  const phone = String(u?.phone ?? p?.phone ?? "").trim();
  const email = String(u?.email ?? p?.email ?? "").trim();

  return {
    first_name: String(u?.legal_first_name ?? firstFromOwner).trim() || undefined,
    last_name: String(u?.legal_last_name ?? lastFromOwner).trim() || undefined,
    email: email || undefined,
    phone: phone || undefined,
    otp_phone: phone || undefined,
    id_type: mapDiditIdType(u?.legal_id_document_type as string | undefined),
    id_number: String(u?.legal_id_number ?? "").trim() || undefined,
    legal_name: String(p?.registered_business_name ?? p?.business_name ?? "").trim() || undefined,
    trading_name: String(p?.business_name ?? "").trim() || undefined,
    registration_number: String(p?.business_registration_number ?? "").trim() || undefined,
    vat_number: String(p?.vat_number ?? "").trim() || undefined,
    physical_line1: String(loc?.address_line1 ?? "").trim() || undefined,
    physical_suburb: String(loc?.address_line2 ?? "").trim() || undefined,
    physical_city: String(loc?.city ?? "").trim() || undefined,
    physical_province: String(loc?.state ?? "").trim() || undefined,
    physical_postal_code: String(loc?.postal_code ?? "").trim() || undefined,
    physical_country: String(loc?.country ?? "ZA").trim() || "ZA",
    bank_code: String(pay?.bank_code ?? "").trim() || undefined,
    bank_name: String(pay?.bank_name ?? "").trim() || undefined,
    account_holder: String(pay?.account_name ?? "").trim() || undefined,
    account_number_last4: String(pay?.account_number_last4 ?? "").trim() || undefined,
    identity_verified: u?.identity_verified === true,
  };
}

export type ValidationIssue = { section: string; message: string };

export function validateApplicationForSubmit(
  app: TerminalMerchantApplication,
  documents: { doc_type: string; status: string }[],
  identityVerified?: boolean,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!app.first_name?.trim()) issues.push({ section: "personal", message: "First name is required" });
  if (!app.last_name?.trim()) issues.push({ section: "personal", message: "Last name is required" });
  if (!app.email?.trim()) issues.push({ section: "personal", message: "Email is required" });
  if (!app.phone?.trim()) issues.push({ section: "personal", message: "Phone is required" });
  if (!app.id_type) issues.push({ section: "personal", message: "ID type is required" });
  if (!app.id_number?.trim()) issues.push({ section: "personal", message: "ID number is required" });
  if (!app.otp_phone?.trim()) issues.push({ section: "personal", message: "Term sheet phone is required" });

  if (!app.entity_type) issues.push({ section: "business", message: "Business type is required" });
  if (!app.legal_name?.trim()) issues.push({ section: "business", message: "Legal name is required" });
  if (!app.trading_name?.trim()) issues.push({ section: "business", message: "Trading name is required" });

  if (!app.physical_line1?.trim()) issues.push({ section: "address", message: "Physical address is required" });
  if (!app.physical_city?.trim()) issues.push({ section: "address", message: "City is required" });
  if (!app.physical_province?.trim()) issues.push({ section: "address", message: "Province is required" });
  if (!app.physical_postal_code?.trim()) issues.push({ section: "address", message: "Postal code is required" });

  if (!app.postal_same_as_physical) {
    if (!app.postal_line1?.trim()) issues.push({ section: "address", message: "Postal address is required" });
    if (!app.postal_city?.trim()) issues.push({ section: "address", message: "Postal city is required" });
  }

  if (!app.bank_code?.trim()) issues.push({ section: "banking", message: "Bank is required" });
  if (!app.account_type) issues.push({ section: "banking", message: "Account type is required" });
  if (!app.account_holder?.trim()) issues.push({ section: "banking", message: "Account holder is required" });
  if (!app.account_number_encrypted && !app.account_number_last4) {
    issues.push({ section: "banking", message: "Account number is required" });
  }

  const requiredDocs = requiredDocTypesForEntity(app.entity_type as TerminalMerchantEntityType);
  for (const docType of requiredDocs) {
    if (docType === "id_document" && identityVerified) continue;
    const doc = documents.find((d) => d.doc_type === docType);
    if (!doc) {
      issues.push({ section: "documents", message: `Missing ${docType.replace(/_/g, " ")}` });
    } else if (doc.status === "rejected") {
      issues.push({ section: "documents", message: `${docType.replace(/_/g, " ")} needs a new upload` });
    }
  }

  if (!app.fulfillment_method) {
    issues.push({ section: "fulfillment", message: "Delivery or collection preference is required" });
  } else if (app.fulfillment_method === "collection" && !app.collection_location_id) {
    issues.push({ section: "fulfillment", message: "Collection location is required" });
  } else if (app.fulfillment_method === "delivery" && !app.delivery_line1?.trim()) {
    issues.push({ section: "fulfillment", message: "Delivery address is required" });
  }

  return issues;
}

export function sanitizeApplicationForProvider(
  app: TerminalMerchantApplication,
): Omit<TerminalMerchantApplication, "account_number_encrypted"> {
  const { account_number_encrypted: _enc, ...rest } = app as TerminalMerchantApplication & {
    account_number_encrypted?: string;
  };
  return rest;
}
