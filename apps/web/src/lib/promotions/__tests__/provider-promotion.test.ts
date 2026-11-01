import { describe, it, expect } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import {
  computeProviderPromotionStatus,
  mapPromotionRowToProviderDto,
  promoEndInstantFromYmd,
  promoStartInstantFromYmd,
} from "../provider-promotion";

describe("computeProviderPromotionStatus", () => {
  it("marks expired when valid_until is in the past", () => {
    expect(
      computeProviderPromotionStatus({
        is_active: true,
        valid_until: new Date(Date.now() - 86400000).toISOString(),
      }),
    ).toBe("expired");
  });

  it("marks used_up when usage_count reached limit", () => {
    expect(
      computeProviderPromotionStatus({
        is_active: true,
        usage_count: 5,
        usage_limit: 5,
      }),
    ).toBe("used_up");
  });

  it("marks scheduled when valid_from is in the future", () => {
    expect(
      computeProviderPromotionStatus({
        is_active: true,
        valid_from: new Date(Date.now() + 86400000).toISOString(),
        valid_until: null,
      }),
    ).toBe("scheduled");
  });

  it("marks off when inactive before other states except expired and used_up", () => {
    expect(
      computeProviderPromotionStatus({
        is_active: false,
        valid_from: new Date(Date.now() - 86400000).toISOString(),
        valid_until: null,
      }),
    ).toBe("off");
  });

  it("marks active when open-ended and in window", () => {
    expect(
      computeProviderPromotionStatus({
        is_active: true,
        valid_from: new Date(Date.now() - 86400000).toISOString(),
        valid_until: null,
      }),
    ).toBe("active");
  });
});

describe("promo calendar instants Africa/Johannesburg", () => {
  const tz = "Africa/Johannesburg";

  it("end of day is after start of same day", () => {
    const start = promoStartInstantFromYmd("2026-06-15", tz);
    const end = promoEndInstantFromYmd("2026-06-15", tz);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it("end instant is still the same calendar day in provider TZ", () => {
    const ymd = "2026-06-15";
    const end = promoEndInstantFromYmd(ymd, tz);
    expect(formatInTimeZone(end, tz, "yyyy-MM-dd")).toBe(ymd);
    expect(formatInTimeZone(end, tz, "HH:mm:ss")).toBe("23:59:59");
  });
});

describe("mapPromotionRowToProviderDto", () => {
  it("maps fixed DB type to fixed_amount for clients", () => {
    const dto = mapPromotionRowToProviderDto(
      {
        id: "x",
        code: "FIXED",
        type: "fixed",
        value: 25,
        is_active: true,
        usage_count: 0,
        valid_from: new Date().toISOString(),
        valid_until: null,
      },
      "Africa/Johannesburg",
    );
    expect(dto.type).toBe("fixed_amount");
    expect(dto.end_date).toBeNull();
  });
});
