import { describe, expect, it } from "vitest";
import { providerPurgeConfirmationEmails } from "./providerPurgeConfirmationEmails";

describe("providerPurgeConfirmationEmails", () => {
  it("maps email, billing_email, and owner.email", () => {
    expect(
      providerPurgeConfirmationEmails({
        email: " biz@example.com ",
        billing_email: "bill@example.com",
        owner: { email: "owner@example.com" },
      }),
    ).toEqual({
      businessEmail: "biz@example.com",
      billingEmail: "bill@example.com",
      ownerEmail: "owner@example.com",
    });
  });

  it("returns empty strings for missing fields", () => {
    expect(providerPurgeConfirmationEmails({})).toEqual({
      businessEmail: "",
      billingEmail: "",
      ownerEmail: "",
    });
  });
});
