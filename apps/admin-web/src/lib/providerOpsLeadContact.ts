/** Shared lead contact completeness + outreach helpers for provider ops inbox. */

export type LeadWhatsAppStatus = "unknown" | "verified" | "not_found" | "check_failed";

export type LeadContactLike = {
  phone_e164?: string | null;
  email?: string | null;
  do_not_contact?: boolean;
  whatsapp_status?: LeadWhatsAppStatus | null;
};

export function normalizeLeadWhatsAppStatus(raw: unknown): LeadWhatsAppStatus | null {
  if (
    raw === "unknown" ||
    raw === "verified" ||
    raw === "not_found" ||
    raw === "check_failed"
  ) {
    return raw;
  }
  return null;
}

export function hasLeadPhone(lead: LeadContactLike): boolean {
  return Boolean(lead.phone_e164?.trim());
}

export function hasLeadEmail(lead: LeadContactLike): boolean {
  return Boolean(lead.email?.trim());
}

export function getLeadContactIssues(lead: LeadContactLike): {
  missingPhone: boolean;
  missingEmail: boolean;
} {
  return {
    missingPhone: !hasLeadPhone(lead),
    missingEmail: !hasLeadEmail(lead),
  };
}

export function getLeadContactAlertLabel(lead: LeadContactLike): string | null {
  const { missingPhone, missingEmail } = getLeadContactIssues(lead);
  if (missingPhone && missingEmail) return "Missing phone & email";
  if (missingPhone) return "Missing phone";
  if (missingEmail) return "Missing email";
  return null;
}

export function canWhatsAppLead(lead: LeadContactLike): boolean {
  return hasLeadPhone(lead) && !lead.do_not_contact && lead.whatsapp_status !== "not_found";
}

export function getWhatsAppBlockedReason(lead: LeadContactLike): string | null {
  if (!hasLeadPhone(lead)) return "No phone number";
  if (lead.do_not_contact) return "Do not contact";
  if (lead.whatsapp_status === "not_found") return "Not on WhatsApp";
  return null;
}

export const CONTACT_FILTER_OPTIONS = [
  { value: "", label: "All contacts" },
  { value: "complete", label: "Complete (email & phone)" },
  { value: "incomplete", label: "Incomplete (missing phone or email)" },
  { value: "missing_phone", label: "Missing phone" },
  { value: "missing_email", label: "Missing email" },
  { value: "has_phone", label: "Has phone" },
  { value: "has_email", label: "Has email" },
] as const;

/** Normalize URL `contact=all` to the empty select value used by the inbox UI. */
export function normalizeContactFilterParam(raw: string | null): string {
  if (!raw || raw === "all") return "";
  return CONTACT_FILTER_OPTIONS.some((o) => o.value === raw) ? raw : "";
}
