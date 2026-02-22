/**
 * Unit Tests for Travel Fee Engine
 * 
 * Tests for travel fee calculation including:
 * - Flat fee strategy
 * - Zone-based strategy
 * - Distance-based strategy
 * - Tiered strategy
 * - Edge cases
 * 
 * @module lib/travel/__tests__/travelFeeEngine.test
 */

import { describe, it, expect } from "vitest";
import {
  computeTravelFee,
  computeTravelTime,
  calculateDistance,
  findZone,
  findTier,
  formatTravelFee,
  formatTravelTime,
  formatDistance,
  isAddressServiceable,
  DEFAULT_TRAVEL_FEE_RULES,
  SOUTH_AFRICA_ZONE_RULES,
  type ServiceAddress,
  type TravelFeeRules,
  type Coordinates,
} from "../travelFeeEngine";

// ============================================================================
// TEST DATA
// ============================================================================

const createMockAddress = (overrides: Partial<ServiceAddress> = {}): ServiceAddress => ({
  line1: "123 Main Street",
  city: "Cape Town",
  postalCode: "8000",
  ...overrides,
});

const createMockCoordinates = (
  latitude: number = -33.9249,
  longitude: number = 18.4241
): Coordinates => ({
  latitude,
  longitude,
});

// ============================================================================
// DISTANCE CALCULATION TESTS
// ============================================================================

describe("Distance Calculation", () => {
  describe("calculateDistance", () => {
    it("should return 0 for same location", () => {
      const coords = createMockCoordinates();
      const distance = calculateDistance(coords, coords);
      expect(distance).toBeCloseTo(0, 1);
    });

    it("should calculate correct distance between known points", () => {
      // Cape Town to Stellenbosch (~50km)
      const capeTown = createMockCoordinates(-33.9249, 18.4241);
      const stellenbosch = createMockCoordinates(-33.9321, 18.8602);
      const distance = calculateDistance(capeTown, stellenbosch);
      
      // Should be around 40-50km
      expect(distance).toBeGreaterThan(35);
      expect(distance).toBeLessThan(60);
    });

    it("should calculate correct distance for short distances", () => {
      // About 1km apart
      const point1 = createMockCoordinates(-33.9249, 18.4241);
      const point2 = createMockCoordinates(-33.9249, 18.4341);
      const distance = calculateDistance(point1, point2);
      
      expect(distance).toBeGreaterThan(0.5);
      expect(distance).toBeLessThan(2);
    });
  });
});

// ============================================================================
// ZONE FINDING TESTS
// ============================================================================

describe("Zone Finding", () => {
  describe("findZone", () => {
    it("should find zone by postal code", () => {
      const address = createMockAddress({ postalCode: "2196" });
      const zone = findZone(address, SOUTH_AFRICA_ZONE_RULES.zones!);
      
      expect(zone).not.toBeNull();
      expect(zone?.name).toBe("Northern Suburbs");
    });

    it("should find zone by city", () => {
      const address = createMockAddress({ 
        postalCode: undefined,
        city: "Sandton" 
      });
      const zone = findZone(address, SOUTH_AFRICA_ZONE_RULES.zones!);
      
      expect(zone).not.toBeNull();
      expect(zone?.name).toBe("Northern Suburbs");
    });

    it("should return null for unknown location", () => {
      const address = createMockAddress({ 
        postalCode: "99999",
        city: "Unknown City" 
      });
      const zone = findZone(address, SOUTH_AFRICA_ZONE_RULES.zones!);
      
      expect(zone).toBeNull();
    });

    it("should handle postal codes with spaces", () => {
      const address = createMockAddress({ postalCode: "2 196" });
      const zone = findZone(address, SOUTH_AFRICA_ZONE_RULES.zones!);
      
      expect(zone).not.toBeNull();
      expect(zone?.name).toBe("Northern Suburbs");
    });
  });
});

// ============================================================================
// TIER FINDING TESTS
// ============================================================================

describe("Tier Finding", () => {
  describe("findTier", () => {
    const tiers = DEFAULT_TRAVEL_FEE_RULES.tiers!;

    it("should find first tier for short distance", () => {
      const result = findTier(3, tiers);
      
      expect(result).not.toBeNull();
      expect(result?.tier.maxDistanceKm).toBe(5);
      expect(result?.tier.fee).toBe(0);
    });

    it("should find middle tier for medium distance", () => {
      const result = findTier(15, tiers);
      
      expect(result).not.toBeNull();
      expect(result?.tier.maxDistanceKm).toBe(20);
      expect(result?.tier.fee).toBe(100);
    });

    it("should find last tier for long distance", () => {
      const result = findTier(45, tiers);
      
      expect(result).not.toBeNull();
      expect(result?.tier.maxDistanceKm).toBe(50);
      expect(result?.tier.fee).toBe(250);
    });

    it("should return null for distance beyond all tiers", () => {
      const result = findTier(100, tiers);
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// FLAT FEE STRATEGY TESTS
// ============================================================================

describe("Flat Fee Strategy", () => {
  const flatRules: TravelFeeRules = {
    strategy: "flat",
    flatFee: 75,
    baseTravelTimeMinutes: 25,
  };

  it("should return flat fee regardless of address", () => {
    const address = createMockAddress();
    const result = computeTravelFee(null, address, flatRules);
    
    expect(result.fee).toBe(75);
    expect(result.travelTimeMinutes).toBe(25);
    expect(result.withinServiceArea).toBe(true);
  });

  it("should respect maximum fee cap", () => {
    const rules: TravelFeeRules = {
      ...flatRules,
      flatFee: 200,
      maximumFee: 100,
    };
    const result = computeTravelFee(null, createMockAddress(), rules);
    
    expect(result.fee).toBe(100);
  });
});

// ============================================================================
// ZONE-BASED STRATEGY TESTS
// ============================================================================

describe("Zone-Based Strategy", () => {
  it("should calculate fee based on zone", () => {
    const address = createMockAddress({ postalCode: "2196" }); // Sandton
    const result = computeTravelFee(null, address, SOUTH_AFRICA_ZONE_RULES);
    
    expect(result.fee).toBe(50);
    expect(result.zoneName).toBe("Northern Suburbs");
    expect(result.withinServiceArea).toBe(true);
  });

  it("should return free for inner city zone", () => {
    const address = createMockAddress({ postalCode: "2001" }); // JHB CBD
    const result = computeTravelFee(null, address, SOUTH_AFRICA_ZONE_RULES);
    
    expect(result.fee).toBe(0);
    expect(result.zoneName).toBe("Inner City");
  });

  it("should mark outside service area for unknown zone", () => {
    const address = createMockAddress({ 
      postalCode: "99999",
      city: "Unknown" 
    });
    const result = computeTravelFee(null, address, SOUTH_AFRICA_ZONE_RULES);
    
    expect(result.withinServiceArea).toBe(false);
    expect(result.outsideReason).toContain("not within any service zone");
  });
});

// ============================================================================
// TIERED STRATEGY TESTS
// ============================================================================

describe("Tiered Strategy", () => {
  it("should return free for distance within free radius", () => {
    const baseLocation = createMockCoordinates(-33.9249, 18.4241);
    const address = createMockAddress({
      coordinates: createMockCoordinates(-33.9249, 18.4300), // ~500m away
    });
    
    const result = computeTravelFee(baseLocation, address, DEFAULT_TRAVEL_FEE_RULES);
    
    expect(result.fee).toBe(0);
    expect(result.withinServiceArea).toBe(true);
  });

  it("should calculate correct tier fee", () => {
    const baseLocation = createMockCoordinates(-33.9249, 18.4241);
    // Create a point about 15km away
    const address = createMockAddress({
      coordinates: createMockCoordinates(-33.9249, 18.5800),
    });
    
    const result = computeTravelFee(baseLocation, address, DEFAULT_TRAVEL_FEE_RULES);
    
    // Should be in 10-20km tier (R100)
    expect(result.withinServiceArea).toBe(true);
    expect(result.distanceKm).toBeGreaterThan(10);
    expect(result.distanceKm).toBeLessThan(20);
    expect(result.fee).toBe(100);
  });

  it("should mark outside service area for distance beyond max tier", () => {
    const baseLocation = createMockCoordinates(-33.9249, 18.4241);
    // Create a point very far away (~200km)
    const address = createMockAddress({
      coordinates: createMockCoordinates(-32.5, 20.0),
    });
    
    const result = computeTravelFee(baseLocation, address, DEFAULT_TRAVEL_FEE_RULES);
    
    expect(result.withinServiceArea).toBe(false);
    // DEFAULT_TRAVEL_FEE_RULES has maxRadiusKm: 50, so it checks radius first
    expect(result.outsideReason).toContain("max service radius");
  });

  it("should fall back to flat fee when no coordinates", () => {
    const address = createMockAddress(); // No coordinates
    const rules: TravelFeeRules = {
      ...DEFAULT_TRAVEL_FEE_RULES,
      minimumFee: 50,
    };
    
    const result = computeTravelFee(null, address, rules);
    
    expect(result.fee).toBe(50);
    expect(result.withinServiceArea).toBe(true);
    expect(result.breakdown[0].label).toContain("no coordinates");
  });
});

// ============================================================================
// TRAVEL TIME CALCULATION TESTS
// ============================================================================

describe("Travel Time Calculation", () => {
  describe("computeTravelTime", () => {
    it("should return base time when no coordinates", () => {
      const address = createMockAddress();
      const time = computeTravelTime(null, address, { baseTravelTimeMinutes: 25 });
      
      expect(time).toBe(25);
    });

    it("should calculate time based on distance", () => {
      const baseLocation = createMockCoordinates(-33.9249, 18.4241);
      const address = createMockAddress({
        coordinates: createMockCoordinates(-33.9249, 18.5000), // ~10km away
      });
      
      const time = computeTravelTime(baseLocation, address, {
        baseTravelTimeMinutes: 15,
        defaultMinutesPerKm: 2,
      });
      
      // Should be at least base time
      expect(time).toBeGreaterThanOrEqual(15);
    });
  });
});

// ============================================================================
// FORMATTING TESTS
// ============================================================================

describe("Formatting", () => {
  describe("formatTravelFee", () => {
    it("should format free travel", () => {
      expect(formatTravelFee(0)).toBe("Free");
    });

    it("should format with currency", () => {
      expect(formatTravelFee(100)).toBe("R100");
      expect(formatTravelFee(50, "$")).toBe("$50");
    });
  });

  describe("formatTravelTime", () => {
    it("should format minutes only", () => {
      expect(formatTravelTime(45)).toBe("45 min");
    });

    it("should format hours only", () => {
      expect(formatTravelTime(60)).toBe("1h");
      expect(formatTravelTime(120)).toBe("2h");
    });

    it("should format hours and minutes", () => {
      expect(formatTravelTime(90)).toBe("1h 30m");
      expect(formatTravelTime(75)).toBe("1h 15m");
    });
  });

  describe("formatDistance", () => {
    it("should format meters for short distances", () => {
      expect(formatDistance(0.5)).toBe("500m");
      expect(formatDistance(0.1)).toBe("100m");
    });

    it("should format kilometers for longer distances", () => {
      expect(formatDistance(1)).toBe("1.0km");
      expect(formatDistance(15.5)).toBe("15.5km");
    });
  });
});

// ============================================================================
// SERVICEABILITY TESTS
// ============================================================================

describe("Serviceability", () => {
  describe("isAddressServiceable", () => {
    it("should return serviceable for valid zone", () => {
      const address = createMockAddress({ postalCode: "2196" });
      const result = isAddressServiceable(null, address, SOUTH_AFRICA_ZONE_RULES);
      
      expect(result.serviceable).toBe(true);
    });

    it("should return not serviceable for unknown zone", () => {
      const address = createMockAddress({ 
        postalCode: "99999",
        city: "Unknown" 
      });
      const result = isAddressServiceable(null, address, SOUTH_AFRICA_ZONE_RULES);
      
      expect(result.serviceable).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });
});

// ============================================================================
// BREAKDOWN TESTS
// ============================================================================

describe("Fee Breakdown", () => {
  it("should provide breakdown for flat fee", () => {
    const rules: TravelFeeRules = {
      strategy: "flat",
      flatFee: 75,
    };
    const result = computeTravelFee(null, createMockAddress(), rules);
    
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].label).toContain("Flat");
    expect(result.breakdown[0].amount).toBe(75);
  });

  it("should provide breakdown for zone fee", () => {
    const address = createMockAddress({ postalCode: "2196" });
    const result = computeTravelFee(null, address, SOUTH_AFRICA_ZONE_RULES);
    
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].label).toContain("Northern Suburbs");
    expect(result.breakdown[0].amount).toBe(50);
  });

  it("should provide breakdown for free radius", () => {
    const baseLocation = createMockCoordinates(-33.9249, 18.4241);
    const address = createMockAddress({
      coordinates: createMockCoordinates(-33.9249, 18.4260), // Very close
    });
    
    const result = computeTravelFee(baseLocation, address, DEFAULT_TRAVEL_FEE_RULES);
    
    expect(result.breakdown.some(b => b.label.includes("free"))).toBe(true);
  });
});
