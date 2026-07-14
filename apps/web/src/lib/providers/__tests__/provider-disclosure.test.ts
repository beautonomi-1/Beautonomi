import {
  redactLocationsForTier,
  redactProviderDetailForTier,
  toContactDisclosure,
} from "@/lib/providers/provider-disclosure";
import type { PublicProviderDetail } from "@/types/beautonomi";

const baseDetail = (): PublicProviderDetail => ({
  id: "p1",
  slug: "test-salon",
  business_name: "Test Salon",
  business_type: "salon",
  rating: 4.5,
  review_count: 10,
  thumbnail_url: null,
  city: "Cape Town",
  country: "South Africa",
  is_featured: false,
  is_verified: true,
  currency: "ZAR",
  description: "Great work by me",
  gallery: [],
  categories: ["Hair"],
  supports_house_calls: false,
  supports_salon: true,
  locations: [
    {
      id: "loc1",
      name: "Main",
      is_primary: true,
      location_type: "salon",
      address_line1: "12 Gary",
      address_line2: "apt 4b",
      city: "Cape Town",
      state: "Western Cape",
      country: "South Africa",
      postal_code: "7405",
      latitude: -33.9,
      longitude: 18.4,
      phone: "+27123456789",
      working_hours: { monday: { open: "09:00", close: "17:00", is_closed: false } },
    },
  ],
  policies: { cancellation_window_hours: 24, requires_deposit: false, no_show_fee_enabled: false, currency: "ZAR" },
  website: "https://example.com",
  social_media_links: { instagram: "https://instagram.com/test" },
});

describe("provider-disclosure", () => {
  it("redacts anon tier from public detail", () => {
    const out = redactProviderDetailForTier(baseDetail(), "anon");
    expect(out.disclosure_tier).toBe("anon");
    expect(out.description).toBe("");
    expect(out.website).toBeNull();
    expect(out.social_media_links).toEqual({});
    expect(out.locations[0].address_line1).toBeUndefined();
    expect(out.locations[0].working_hours).toBeUndefined();
    expect(out.locations[0].phone).toBeUndefined();
    expect(out.locations[0].city).toBe("Cape Town");
  });

  it("preserves distance_km on provider detail after redaction", () => {
    const withDistance = { ...baseDetail(), distance_km: 4.2 };
    const out = redactProviderDetailForTier(withDistance, "anon");
    expect(out.distance_km).toBe(4.2);
    expect(out.locations[0].latitude).toBeUndefined();
  });

  it("keeps hours for authed tier but strips address", () => {
    const locs = redactLocationsForTier(baseDetail().locations, "authed");
    expect(locs[0].working_hours).toBeDefined();
    expect(locs[0].address_line1).toBeUndefined();
    expect(locs[0].latitude).toBeUndefined();
  });

  it("returns full location for booked tier", () => {
    const locs = redactLocationsForTier(baseDetail().locations, "booked");
    expect(locs[0].address_line1).toBe("12 Gary");
    expect(locs[0].phone).toBe("+27123456789");
  });

  it("maps contact disclosure payload", () => {
    const contact = toContactDisclosure(baseDetail(), "authed");
    expect(contact.disclosure_tier).toBe("authed");
    expect(contact.description).toBe("Great work by me");
    expect(contact.locations[0].address_line1).toBeUndefined();
    expect(contact.operating_hours).toBeDefined();
  });
});
