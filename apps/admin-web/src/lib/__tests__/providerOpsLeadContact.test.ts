import { describe, expect, it } from "vitest";
import {
  canWhatsAppLead,
  getLeadContactAlertLabel,
  getWhatsAppBlockedReason,
  hasLeadEmail,
  hasLeadPhone,
  normalizeContactFilterParam,
  normalizeLeadWhatsAppStatus,
} from "@/lib/providerOpsLeadContact";

describe("providerOpsLeadContact", () => {
  it("detects missing contact fields", () => {
    expect(hasLeadPhone({ phone_e164: "+27840789207" })).toBe(true);
    expect(hasLeadPhone({ phone_e164: "  " })).toBe(false);
    expect(hasLeadEmail({ email: "a@b.com" })).toBe(true);
    expect(getLeadContactAlertLabel({ email: "a@b.com" })).toBe("Missing phone");
    expect(getLeadContactAlertLabel({ phone_e164: "+1", email: "a@b.com" })).toBeNull();
  });

  it("gates WhatsApp outreach", () => {
    const lead = { phone_e164: "+27840789207", whatsapp_status: "verified" as const };
    expect(canWhatsAppLead(lead)).toBe(true);
    expect(canWhatsAppLead({ ...lead, do_not_contact: true })).toBe(false);
    expect(canWhatsAppLead({ ...lead, whatsapp_status: "not_found" })).toBe(false);
    expect(getWhatsAppBlockedReason({ ...lead, do_not_contact: true })).toBe("Do not contact");
  });

  it("normalizes contact filter URL params", () => {
    expect(normalizeContactFilterParam(null)).toBe("");
    expect(normalizeContactFilterParam("all")).toBe("");
    expect(normalizeContactFilterParam("incomplete")).toBe("incomplete");
    expect(normalizeContactFilterParam("bogus")).toBe("");
  });

  it("normalizes WhatsApp status from API strings", () => {
    expect(normalizeLeadWhatsAppStatus("verified")).toBe("verified");
    expect(normalizeLeadWhatsAppStatus("bogus")).toBeNull();
    expect(normalizeLeadWhatsAppStatus(null)).toBeNull();
  });
});
