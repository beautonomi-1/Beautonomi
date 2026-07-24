import { describe, expect, it } from "vitest";
import { requiredDocTypesForEntity } from "@/lib/terminal-merchant/types";
import { validateApplicationForSubmit } from "@/lib/terminal-merchant/prefill-and-validation";
import type { TerminalMerchantApplication } from "@/lib/terminal-merchant/types";

describe("terminal merchant onboarding", () => {
  it("requires company docs for private companies", () => {
    const docs = requiredDocTypesForEntity("private_company");
    expect(docs).toContain("company_registration");
    expect(docs).toContain("resolution_letter");
  });

  it("validates minimal submit payload", () => {
    const app = {
      id: "1",
      application_no: "TMO-000001",
      tenant_id: "t",
      provider_id: "p",
      vendor_slug: "paycloud",
      status: "draft",
      first_name: "Jane",
      last_name: "Doe",
      email: "j@example.com",
      phone: "+27123456789",
      id_type: "national_id",
      id_number: "900101",
      otp_phone: "+27123456789",
      entity_type: "sole_proprietor",
      legal_name: "Jane Doe",
      trading_name: "Jane Salon",
      physical_line1: "1 Main",
      physical_city: "JHB",
      physical_province: "Gauteng",
      physical_postal_code: "2000",
      postal_same_as_physical: true,
      bank_code: "058",
      bank_name: "FNB",
      account_type: "cheque_current",
      account_holder: "Jane Doe",
      account_number_encrypted: "MTIzNDU2Nzg=",
      fulfillment_method: "delivery",
      delivery_line1: "1 Main",
    } as TerminalMerchantApplication;

    const issues = validateApplicationForSubmit(
      app,
      [
        { doc_type: "proof_of_address", status: "pending" },
        { doc_type: "bank_confirmation_letter", status: "pending" },
      ],
      true,
    );
    expect(issues.some((i) => i.section === "documents")).toBe(false);
    expect(issues.length).toBe(0);
  });
});
