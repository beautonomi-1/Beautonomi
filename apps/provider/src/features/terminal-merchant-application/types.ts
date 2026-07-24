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

export type TerminalMerchantDocType =
  | "id_document"
  | "proof_of_address"
  | "bank_confirmation_letter"
  | "company_registration"
  | "trust_deed"
  | "resolution_letter"
  | "other";

export type TerminalMerchantApplication = {
  id: string;
  application_no: string;
  status: TerminalMerchantApplicationStatus;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  id_type?: TerminalMerchantIdType | null;
  id_number?: string | null;
  otp_phone?: string | null;
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
  account_type?: string | null;
  account_holder?: string | null;
  account_number_last4?: string | null;
  fulfillment_method?: "delivery" | "collection" | null;
  delivery_line1?: string | null;
  delivery_suburb?: string | null;
  delivery_city?: string | null;
  delivery_province?: string | null;
  delivery_postal_code?: string | null;
  delivery_country?: string | null;
  collection_location_id?: string | null;
  term_sheet_status?: string;
  info_required_sections?: string[];
  info_required_reason?: string | null;
  submitted_at?: string | null;
};

export const DOC_TYPE_LABELS: Record<
  TerminalMerchantDocType,
  { title: string; hint: string }
> = {
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

export const WIZARD_STEPS = [
  { id: "personal", title: "Personal details" },
  { id: "business", title: "Business details" },
  { id: "address", title: "Addresses" },
  { id: "banking", title: "Banking" },
  { id: "documents", title: "Verify your business" },
  { id: "fulfillment", title: "Delivery or collection" },
  { id: "review", title: "Review & submit" },
] as const;

export const LEARN_ARTICLE_SLUGS = {
  documents: "card-machines-before-you-apply",
  application: "card-machines-application-guide",
  termSheet: "card-machines-term-sheet-explained",
  next: "card-machines-what-happens-next",
} as const;
