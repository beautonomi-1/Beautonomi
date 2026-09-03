import { describe, expect, it } from "vitest";
import { ticketOwnsSupportRecord } from "../support-context";

describe("ticketOwnsSupportRecord", () => {
  it("matches the customer who owns the record", () => {
    expect(
      ticketOwnsSupportRecord({
        ticketUserId: "cust-1",
        recordCustomerId: "cust-1",
        recordProviderId: "prov-1",
      }),
    ).toBe(true);
  });

  it("matches a provider ticket to that provider's booking", () => {
    expect(
      ticketOwnsSupportRecord({
        ticketUserId: "staff-9",
        ticketProviderId: "prov-1",
        recordCustomerId: "cust-1",
        recordProviderId: "prov-1",
      }),
    ).toBe(true);
  });

  it("rejects a provider ticket for another salon", () => {
    expect(
      ticketOwnsSupportRecord({
        ticketUserId: "staff-9",
        ticketProviderId: "prov-1",
        recordCustomerId: "cust-1",
        recordProviderId: "prov-2",
      }),
    ).toBe(false);
  });
});
