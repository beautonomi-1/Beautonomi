import { describe, it, expect } from "vitest";
import {
  normalizePhoneToE164,
  normalizeFullPhoneToE164,
  isCompleteE164,
  splitValueForPhoneInput,
  phoneSearchNeedles,
  phoneSearchNeedlesUnscoped,
  phoneMatchesQuery,
  clientContactMatches,
  bookingListMatchesQuery,
} from "../index";

describe("normalizePhoneToE164", () => {
  it("returns undefined for empty input", () => {
    expect(normalizePhoneToE164(null)).toBeUndefined();
    expect(normalizePhoneToE164(undefined)).toBeUndefined();
    expect(normalizePhoneToE164("")).toBeUndefined();
    expect(normalizePhoneToE164("   ")).toBeUndefined();
  });

  it("normalizes a valid ZA number with country code", () => {
    const result = normalizePhoneToE164("0821234567", "27");
    expect(result).toBe("+27821234567");
  });

  it("handles already-E.164 input", () => {
    expect(normalizePhoneToE164("+27821234567")).toBe("+27821234567");
  });

  it("handles US number", () => {
    expect(normalizePhoneToE164("2025551234", "1")).toBe("+12025551234");
  });

  it("strips formatting", () => {
    expect(normalizePhoneToE164("+27 82 123 4567")).toBe("+27821234567");
    expect(normalizePhoneToE164("+27-82-123-4567")).toBe("+27821234567");
  });
});

describe("normalizeFullPhoneToE164", () => {
  it("normalizes spaced input", () => {
    const result = normalizeFullPhoneToE164("+27 82 123 4567");
    expect(result).toBe("+27821234567");
  });

  it("returns undefined for empty", () => {
    expect(normalizeFullPhoneToE164("")).toBeUndefined();
  });
});

describe("isCompleteE164", () => {
  it("accepts valid E.164", () => {
    expect(isCompleteE164("+27821234567")).toBe(true);
  });

  it("rejects incomplete", () => {
    expect(isCompleteE164("+2782")).toBe(false);
  });

  it("rejects null/empty", () => {
    expect(isCompleteE164(null)).toBe(false);
    expect(isCompleteE164("")).toBe(false);
  });
});

describe("splitValueForPhoneInput", () => {
  it("splits E.164 into country code and national", () => {
    const result = splitValueForPhoneInput("+27821234567", "+27");
    expect(result.countryCode).toBe("+27");
    expect(result.national).toBe("821234567");
  });

  it("returns default for empty", () => {
    const result = splitValueForPhoneInput(undefined, "+27");
    expect(result.countryCode).toBe("+27");
    expect(result.national).toBe("");
  });
});

describe("phoneSearchNeedles", () => {
  it("returns empty for fewer than 4 digits", () => {
    expect(phoneSearchNeedles("0")).toEqual([]);
    expect(phoneSearchNeedles("08")).toEqual([]);
    expect(phoneSearchNeedles("082")).toEqual([]);
    expect(phoneSearchNeedles("+27")).toEqual([]);
  });

  it("adds trunk-stripped tail for leading 0", () => {
    const needles = phoneSearchNeedles("0821");
    expect(needles).toContain("0821");
    expect(needles).toContain("821");
  });

  it("adds last 9 digits for long national input", () => {
    const needles = phoneSearchNeedles("0821234567");
    expect(needles).toContain("821234567");
  });
});

describe("phoneSearchNeedlesUnscoped", () => {
  it("keeps full local numbers searchable", () => {
    expect(phoneSearchNeedlesUnscoped("082 123 4567")).toEqual(["0821234567", "821234567"]);
  });
  it("drops the 3-digit trunk tail", () => {
    expect(phoneSearchNeedlesUnscoped("0821")).toEqual(["0821"]);
  });
  it("returns nothing under 4 digits", () => {
    expect(phoneSearchNeedlesUnscoped("+27")).toEqual([]);
  });
});

describe("phoneMatchesQuery", () => {
  const stored = "+27821234567";

  it("matches national 0 prefix against E.164", () => {
    expect(phoneMatchesQuery(stored, "0821234567")).toBe(true);
    expect(phoneMatchesQuery(stored, "082 123 4567")).toBe(true);
  });

  it("matches E.164 and international digit forms", () => {
    expect(phoneMatchesQuery(stored, "+27821234567")).toBe(true);
    expect(phoneMatchesQuery(stored, "27821234567")).toBe(true);
    expect(phoneMatchesQuery(stored, "821234567")).toBe(true);
  });

  it("matches partial from 4 digits", () => {
    expect(phoneMatchesQuery(stored, "0821")).toBe(true);
  });

  it("rejects overly short phone-only queries", () => {
    expect(phoneMatchesQuery(stored, "0")).toBe(false);
    expect(phoneMatchesQuery(stored, "27")).toBe(false);
  });

  it("matches legacy national storage", () => {
    expect(phoneMatchesQuery("0821234567", "+27821234567")).toBe(true);
  });

  it("matches spaced stored value", () => {
    expect(phoneMatchesQuery("+27 82 123 4567", "0821234567")).toBe(true);
  });
});

describe("bookingListMatchesQuery", () => {
  it("matches empty query to everything", () => {
    expect(
      bookingListMatchesQuery("", {
        customerName: "Jane",
        bookingNumber: "BTN-1",
        serviceText: "Cut",
        email: "j@x.co",
        phones: ["+27821234567"],
      }),
    ).toBe(true);
  });

  it("matches name, booking number, service, and email", () => {
    const base = {
      customerName: "Thandi M",
      bookingNumber: "BTN-99",
      serviceText: "braids trim",
      email: "thandi@example.com",
      phones: [] as string[],
    };
    expect(bookingListMatchesQuery("thandi", base)).toBe(true);
    expect(bookingListMatchesQuery("btn-99", base)).toBe(true);
    expect(bookingListMatchesQuery("braids", base)).toBe(true);
    expect(bookingListMatchesQuery("thandi@", base)).toBe(true);
  });

  it("matches national 0 query against E.164 on list row", () => {
    expect(
      bookingListMatchesQuery("0821234567", {
        customerName: "Guest",
        bookingNumber: "BTN-1",
        serviceText: "Cut",
        email: null,
        phones: ["+27821234567"],
      }),
    ).toBe(true);
  });

  it("matches any phone in the phones array", () => {
    expect(
      bookingListMatchesQuery("0831112222", {
        customerName: "Group",
        bookingNumber: "GB-1",
        serviceText: "",
        phones: [null, "+27831112222"],
      }),
    ).toBe(true);
  });
});

describe("clientContactMatches", () => {
  it("matches email and phone independently", () => {
    expect(
      clientContactMatches("thandi@", {
        name: "Thandi",
        email: "thandi@example.com",
        phone: null,
      })
    ).toBe(true);
    expect(
      clientContactMatches("0821234567", {
        name: "Thandi",
        email: "",
        phone: "+27821234567",
      })
    ).toBe(true);
  });
});
