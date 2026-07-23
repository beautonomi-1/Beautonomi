/**
 * Terminal merchant onboarding — shared types and constants.
 */

export const TERMINAL_MERCHANT_VENDOR = "paycloud" as const;

export type TerminalMerchantApplicationStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "info_required"
  | "sent_to_acquirer"
  | "awaiting_term_sheet"
  | "approved"
  | "declined"
  | "cancelled";

export type TerminalMerchantIdType = "national_id" | "passport" | "foreign_id";

export type TerminalMerchantEntityType =
  | "sole_proprietor"
  | "private_company"
  | "close_corporation"
  | "partnership"
  | "trust"
  | "npo"
  | "other";

export type TerminalMerchantAccountType = "cheque_current" | "savings" | "transmission";

export type TerminalMerchantFulfillmentMethod = "delivery" | "collection";

export type TerminalMerchantTermSheetStatus =
  | "pending"
  | "sent"
  | "accepted"
  | "declined"
  | "expired";

export type TerminalMerchantDocType =
  | "id_document"
  | "proof_of_address"
  | "bank_confirmation_letter"
  | "company_registration"
  | "trust_deed"
  | "resolution_letter"
  | "other";

export type TerminalMerchantDocStatus = "pending" | "approved" | "rejected";

export type TerminalMerchantApplication = {
  id: string;
  application_no: string;
  tenant_id: string;
  provider_id: string;
  vendor_slug: string;
  status: TerminalMerchantApplicationStatus;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  id_type?: TerminalMerchantIdType | null;
  id_number?: string | null;
  entity_type?: TerminalMerchantEntityType | null;
  legal_name?: string | null;
  trading_name?: string | null;
  registration_number?: string | null;
  vat_number?: string | null;
  mcc?: string | null;
  physical_line1?: string | null;
  physical_suburb?: string | null;
  physical_city?: string | null;
  physical_province?: string | null;
  physical_postal_code?: string | null;
  physical_country?: string | null;
  postal_same_as_physical?: boolean;
  postal_line1?: string | null;
  postal_suburb?: string | null;
  postal_city?: string | null;
  postal_province?: string | null;
  postal_postal_code?: string | null;
  postal_country?: string | null;
  bank_code?: string | null;
  bank_name?: string | null;
  account_type?: TerminalMerchantAccountType | null;
  account_holder?: string | null;
  account_number_encrypted?: string | null;
  account_number_last4?: string | null;
  fulfillment_method?: TerminalMerchantFulfillmentMethod | null;
  delivery_line1?: string | null;
  delivery_suburb?: string | null;
  delivery_city?: string | null;
  delivery_province?: string | null;
  delivery_postal_code?: string | null;
  delivery_country?: string | null;
  collection_location_id?: string | null;
  otp_phone?: string | null;
  term_sheet_status?: TerminalMerchantTermSheetStatus;
  term_sheet_sent_at?: string | null;
  term_sheet_accepted_at?: string | null;
  section_personal_verified?: boolean;
  section_business_verified?: boolean;
  section_address_verified?: boolean;
  section_banking_verified?: boolean;
  section_documents_verified?: boolean;
  section_fulfillment_verified?: boolean;
  info_required_sections?: string[];
  info_required_reason?: string | null;
  assigned_admin_id?: string | null;
  acquirer_reference?: string | null;
  decline_reason?: string | null;
  paycloud_merchant_id?: string | null;
  support_ticket_id?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
};

export type TerminalMerchantApplicationDocument = {
  id: string;
  application_id: string;
  doc_type: TerminalMerchantDocType;
  storage_path: string;
  file_name?: string | null;
  mime_type?: string | null;
  status: TerminalMerchantDocStatus;
  rejection_reason?: string | null;
  uploaded_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const ZA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
] as const;

export const DOC_TYPE_LABELS: Record<TerminalMerchantDocType, { title: string; hint: string }> = {
  id_document: {
    title: "Your ID",
    hint: "A photo of your green ID book, smart ID card, or passport.",
  },
  proof_of_address: {
    title: "Proof of address",
    hint: "A utility bill, bank statement, or lease with your name on it, not older than 3 months.",
  },
  bank_confirmation_letter: {
    title: "Bank confirmation letter",
    hint: "A stamped account confirmation letter from your bank (you can download this from your banking app).",
  },
  company_registration: {
    title: "Company registration",
    hint: "Your CIPC registration certificate.",
  },
  trust_deed: {
    title: "Trust deed",
    hint: "The trust deed document for your trust.",
  },
  resolution_letter: {
    title: "Resolution letter",
    hint: "A board resolution authorising the card machine application.",
  },
  other: {
    title: "Other document",
    hint: "Any additional document requested by our team.",
  },
};

export function requiredDocTypesForEntity(
  entityType: TerminalMerchantEntityType | null | undefined,
): TerminalMerchantDocType[] {
  const base: TerminalMerchantDocType[] = [
    "id_document",
    "proof_of_address",
    "bank_confirmation_letter",
  ];
  if (!entityType || entityType === "sole_proprietor") return base;
  if (entityType === "trust") return [...base, "trust_deed", "resolution_letter"];
  if (entityType === "private_company" || entityType === "close_corporation") {
    return [...base, "company_registration", "resolution_letter"];
  }
  if (entityType === "partnership" || entityType === "npo") {
    return [...base, "company_registration"];
  }
  return [...base, "company_registration"];
}

export const ACTIONABLE_APPLICATION_STATUSES: TerminalMerchantApplicationStatus[] = [
  "submitted",
  "in_review",
  "sent_to_acquirer",
  "awaiting_term_sheet",
];

export const TERMINAL_MERCHANT_WIZARD_STEPS = [
  { id: "personal", title: "Personal details" },
  { id: "business", title: "Business details" },
  { id: "address", title: "Addresses" },
  { id: "banking", title: "Banking" },
  { id: "documents", title: "Verify your business" },
  { id: "fulfillment", title: "Delivery or collection" },
  { id: "review", title: "Review & submit" },
] as const;

export const TERMINAL_MERCHANT_APP_DEEP_LINK = "/(app)/(tabs)/more/terminal-merchant-application";

export function terminalMerchantApplicationSetupUrl(applicationId?: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (applicationId) {
    return `${base}/provider/settings/sales/terminal-merchant-application?id=${applicationId}`;
  }
  return `${base}/provider/settings/sales/terminal-merchant-application`;
}
