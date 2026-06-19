import { describe, it, expect } from "vitest";
import {
  hashEmailForComplianceSnapshot,
  redactUserPurgeSnapshot,
} from "@/lib/account/compliance-snapshot-redaction";
import type { UserPurgeSnapshot } from "@/lib/account/compliance-purge-snapshot";

describe("compliance-snapshot-redaction", () => {
  const sample: UserPurgeSnapshot = {
    user_id: "00000000-0000-4000-8000-000000000001",
    email: "User@Example.com",
    full_name: "Jane Doe",
    phone: "+27123456789",
    role: "customer",
    created_at: "2024-01-01T00:00:00.000Z",
    counts: {
      bookings_as_customer: 2,
      product_orders_as_customer: 0,
      conversations_as_customer: 1,
      providers_owned: 0,
      provider_staff_links: 0,
      support_tickets: 0,
    },
  };

  it("hashes email deterministically and drops name/phone", () => {
    const redacted = redactUserPurgeSnapshot(sample);
    expect(redacted.schema_version).toBe(3);
    expect(redacted.email_hash).toBe(hashEmailForComplianceSnapshot("User@Example.com"));
    expect(redacted.email_hash).toHaveLength(64);
    expect("full_name" in redacted).toBe(false);
    expect("phone" in redacted).toBe(false);
    expect("email" in redacted).toBe(false);
    expect(redacted.counts.bookings_as_customer).toBe(2);
  });

  it("returns null hash for empty email", () => {
    expect(hashEmailForComplianceSnapshot(null)).toBeNull();
    expect(hashEmailForComplianceSnapshot("  ")).toBeNull();
  });
});
