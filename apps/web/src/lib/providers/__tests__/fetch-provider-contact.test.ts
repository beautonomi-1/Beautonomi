import { formatPublicLocationSubtitle } from "@/lib/providers/fetch-provider-contact";

describe("formatPublicLocationSubtitle", () => {
  it("shows full address when street is present", () => {
    expect(
      formatPublicLocationSubtitle({
        address_line1: "12 Gary St",
        city: "Cape Town",
        state: "Western Cape",
        country: "South Africa",
      }),
    ).toBe("12 Gary St, Cape Town, Western Cape, South Africa");
  });

  it("falls back to city area when street is redacted", () => {
    expect(
      formatPublicLocationSubtitle({
        city: "Cape Town",
        state: "Western Cape",
        country: "South Africa",
      }),
    ).toBe("Cape Town, Western Cape, South Africa");
  });

  it("returns Service area when no location fields exist", () => {
    expect(formatPublicLocationSubtitle({})).toBe("Service area");
  });
});
