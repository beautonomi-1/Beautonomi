/**
 * Travel Fee Engine
 * 
 * Calculates travel fees and travel time for at-home service appointments.
 * Supports multiple pricing strategies:
 * - Flat fee by zone
 * - Distance-based pricing
 * - Tiered pricing by radius
 * 
 * @module lib/travel/travelFeeEngine
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Geographic coordinates
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Address for at-home service
 */
export interface ServiceAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
  coordinates?: Coordinates;
}

/**
 * Travel zone definition
 */
export interface TravelZone {
  id: string;
  name: string;
  /** Postcodes/zip codes in this zone */
  postalCodes: string[];
  /** Or cities in this zone */
  cities: string[];
  /** Fee for this zone */
  fee: number;
  /** Estimated travel time in minutes */
  travelTimeMinutes: number;
}

/**
 * Distance-based pricing tier
 */
export interface DistanceTier {
  /** Maximum distance in km for this tier */
  maxDistanceKm: number;
  /** Fee for this tier */
  fee: number;
  /** Estimated minutes per km for travel time */
  minutesPerKm: number;
}

/**
 * Travel fee rules configuration
 */
export interface TravelFeeRules {
  /** Pricing strategy */
  strategy: "flat" | "zone" | "distance" | "tiered";
  
  /** Flat fee (if strategy is "flat") */
  flatFee?: number;
  
  /** Zones (if strategy is "zone") */
  zones?: TravelZone[];
  
  /** Per-km rate (if strategy is "distance") */
  perKmRate?: number;
  
  /** Minimum fee (if strategy is "distance") */
  minimumFee?: number;
  
  /** Maximum fee cap */
  maximumFee?: number;
  
  /** Distance tiers (if strategy is "tiered") */
  tiers?: DistanceTier[];
  
  /** Maximum service radius in km */
  maxRadiusKm?: number;
  
  /** Free travel radius in km (no fee within this distance) */
  freeRadiusKm?: number;
  
  /** Base travel time in minutes (minimum time) */
  baseTravelTimeMinutes?: number;
  
  /** Minutes per km for travel time estimation */
  defaultMinutesPerKm?: number;
}

/**
 * Travel fee calculation result
 */
export interface TravelFeeResult {
  /** Calculated travel fee */
  fee: number;
  /** Estimated travel time in minutes (one way) */
  travelTimeMinutes: number;
  /** Total travel time including return (if applicable) */
  totalTravelTimeMinutes: number;
  /** Whether the address is within service area */
  withinServiceArea: boolean;
  /** Reason if outside service area */
  outsideReason?: string;
  /** Distance in km (if calculated) */
  distanceKm?: number;
  /** Zone name (if zone-based) */
  zoneName?: string;
  /** Tier applied (if tiered) */
  tierIndex?: number;
  /** Breakdown for display */
  breakdown: {
    label: string;
    amount: number;
  }[];
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default travel fee rules
 * Can be overridden by provider settings
 */
export const DEFAULT_TRAVEL_FEE_RULES: TravelFeeRules = {
  strategy: "tiered",
  maximumFee: 500, // R500 max
  maxRadiusKm: 50,
  freeRadiusKm: 5,
  baseTravelTimeMinutes: 15,
  defaultMinutesPerKm: 2,
  tiers: [
    { maxDistanceKm: 5, fee: 0, minutesPerKm: 2 },
    { maxDistanceKm: 10, fee: 50, minutesPerKm: 2 },
    { maxDistanceKm: 20, fee: 100, minutesPerKm: 2.5 },
    { maxDistanceKm: 30, fee: 150, minutesPerKm: 3 },
    { maxDistanceKm: 50, fee: 250, minutesPerKm: 3 },
  ],
};

/**
 * Example zone-based rules for South African cities
 */
export const SOUTH_AFRICA_ZONE_RULES: TravelFeeRules = {
  strategy: "zone",
  maximumFee: 500,
  maxRadiusKm: 100,
  zones: [
    {
      id: "zone-1",
      name: "Inner City",
      postalCodes: ["2001", "2017", "2107"],
      cities: ["Johannesburg CBD", "Braamfontein", "Hillbrow"],
      fee: 0,
      travelTimeMinutes: 15,
    },
    {
      id: "zone-2",
      name: "Northern Suburbs",
      postalCodes: ["2196", "2191", "2055"],
      cities: ["Sandton", "Rosebank", "Hyde Park"],
      fee: 50,
      travelTimeMinutes: 25,
    },
    {
      id: "zone-3",
      name: "Eastern Suburbs",
      postalCodes: ["2198", "2092"],
      cities: ["Bedfordview", "Edenvale"],
      fee: 75,
      travelTimeMinutes: 30,
    },
    {
      id: "zone-4",
      name: "Western Suburbs",
      postalCodes: ["1709", "1724"],
      cities: ["Roodepoort", "Randburg"],
      fee: 75,
      travelTimeMinutes: 35,
    },
    {
      id: "zone-5",
      name: "Pretoria",
      postalCodes: ["0001", "0002", "0181"],
      cities: ["Pretoria", "Centurion"],
      fee: 150,
      travelTimeMinutes: 45,
    },
  ],
};

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export function calculateDistance(
  from: Coordinates,
  to: Coordinates
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Find zone for an address
 */
export function findZone(
  address: ServiceAddress,
  zones: TravelZone[]
): TravelZone | null {
  // Try to match by postal code first
  if (address.postalCode) {
    const normalizedPostal = address.postalCode.replace(/\s/g, "");
    for (const zone of zones) {
      if (zone.postalCodes.some(pc => pc.replace(/\s/g, "") === normalizedPostal)) {
        return zone;
      }
    }
  }
  
  // Try to match by city
  if (address.city) {
    const normalizedCity = address.city.toLowerCase().trim();
    for (const zone of zones) {
      if (zone.cities.some(c => c.toLowerCase().trim() === normalizedCity)) {
        return zone;
      }
    }
  }
  
  return null;
}

/**
 * Find tier for a distance
 */
export function findTier(
  distanceKm: number,
  tiers: DistanceTier[]
): { tier: DistanceTier; index: number } | null {
  // Sort tiers by max distance ascending
  const sortedTiers = [...tiers].sort((a, b) => a.maxDistanceKm - b.maxDistanceKm);
  
  for (let i = 0; i < sortedTiers.length; i++) {
    if (distanceKm <= sortedTiers[i].maxDistanceKm) {
      return { tier: sortedTiers[i], index: i };
    }
  }
  
  return null;
}

/**
 * Calculate travel fee based on rules
 */
export function computeTravelFee(
  baseLocation: Coordinates | null,
  clientAddress: ServiceAddress,
  rules: TravelFeeRules = DEFAULT_TRAVEL_FEE_RULES
): TravelFeeResult {
  const breakdown: { label: string; amount: number }[] = [];
  
  // Strategy: Flat fee
  if (rules.strategy === "flat") {
    const fee = rules.flatFee || 0;
    breakdown.push({ label: "Flat travel fee", amount: fee });
    
    return {
      fee: Math.min(fee, rules.maximumFee || Infinity),
      travelTimeMinutes: rules.baseTravelTimeMinutes || 30,
      totalTravelTimeMinutes: (rules.baseTravelTimeMinutes || 30) * 2,
      withinServiceArea: true,
      breakdown,
    };
  }
  
  // Strategy: Zone-based
  if (rules.strategy === "zone" && rules.zones) {
    const zone = findZone(clientAddress, rules.zones);
    
    if (!zone) {
      return {
        fee: 0,
        travelTimeMinutes: 0,
        totalTravelTimeMinutes: 0,
        withinServiceArea: false,
        outsideReason: "Address not within any service zone",
        breakdown: [],
      };
    }
    
    breakdown.push({ label: `${zone.name} zone fee`, amount: zone.fee });
    
    return {
      fee: Math.min(zone.fee, rules.maximumFee || Infinity),
      travelTimeMinutes: zone.travelTimeMinutes,
      totalTravelTimeMinutes: zone.travelTimeMinutes * 2,
      withinServiceArea: true,
      zoneName: zone.name,
      breakdown,
    };
  }
  
  // For distance-based and tiered, we need coordinates
  if (!baseLocation || !clientAddress.coordinates) {
    // Fall back to flat fee or minimum if no coordinates
    const fallbackFee = rules.minimumFee || rules.flatFee || 50;
    breakdown.push({ label: "Estimated travel fee (no coordinates)", amount: fallbackFee });
    
    return {
      fee: Math.min(fallbackFee, rules.maximumFee || Infinity),
      travelTimeMinutes: rules.baseTravelTimeMinutes || 30,
      totalTravelTimeMinutes: (rules.baseTravelTimeMinutes || 30) * 2,
      withinServiceArea: true,
      breakdown,
    };
  }
  
  // Calculate distance
  const distanceKm = calculateDistance(baseLocation, clientAddress.coordinates);
  
  // Check if within max radius
  if (rules.maxRadiusKm && distanceKm > rules.maxRadiusKm) {
    return {
      fee: 0,
      travelTimeMinutes: 0,
      totalTravelTimeMinutes: 0,
      withinServiceArea: false,
      outsideReason: `Address is ${distanceKm.toFixed(1)}km away, max service radius is ${rules.maxRadiusKm}km`,
      distanceKm,
      breakdown: [],
    };
  }
  
  // Check if within free radius
  if (rules.freeRadiusKm && distanceKm <= rules.freeRadiusKm) {
    breakdown.push({ label: `Within free ${rules.freeRadiusKm}km radius`, amount: 0 });
    
    const travelTime = Math.max(
      rules.baseTravelTimeMinutes || 15,
      distanceKm * (rules.defaultMinutesPerKm || 2)
    );
    
    return {
      fee: 0,
      travelTimeMinutes: Math.round(travelTime),
      totalTravelTimeMinutes: Math.round(travelTime * 2),
      withinServiceArea: true,
      distanceKm,
      breakdown,
    };
  }
  
  // Strategy: Distance-based
  if (rules.strategy === "distance") {
    const baseFee = rules.minimumFee || 0;
    const distanceFee = distanceKm * (rules.perKmRate || 5);
    let totalFee = baseFee + distanceFee;
    
    if (rules.freeRadiusKm) {
      // Only charge for distance beyond free radius
      const chargeableDistance = distanceKm - rules.freeRadiusKm;
      totalFee = baseFee + chargeableDistance * (rules.perKmRate || 5);
    }
    
    breakdown.push({ label: "Base fee", amount: baseFee });
    breakdown.push({ label: `Distance fee (${distanceKm.toFixed(1)}km)`, amount: distanceFee });
    
    const travelTime = Math.max(
      rules.baseTravelTimeMinutes || 15,
      distanceKm * (rules.defaultMinutesPerKm || 2)
    );
    
    return {
      fee: Math.min(Math.round(totalFee), rules.maximumFee || Infinity),
      travelTimeMinutes: Math.round(travelTime),
      totalTravelTimeMinutes: Math.round(travelTime * 2),
      withinServiceArea: true,
      distanceKm,
      breakdown,
    };
  }
  
  // Strategy: Tiered
  if (rules.strategy === "tiered" && rules.tiers) {
    const tierResult = findTier(distanceKm, rules.tiers);
    
    if (!tierResult) {
      return {
        fee: 0,
        travelTimeMinutes: 0,
        totalTravelTimeMinutes: 0,
        withinServiceArea: false,
        outsideReason: `Address is ${distanceKm.toFixed(1)}km away, beyond max service tier`,
        distanceKm,
        breakdown: [],
      };
    }
    
    const { tier, index } = tierResult;
    
    breakdown.push({ label: `Tier ${index + 1} fee (up to ${tier.maxDistanceKm}km)`, amount: tier.fee });
    
    const travelTime = Math.max(
      rules.baseTravelTimeMinutes || 15,
      distanceKm * tier.minutesPerKm
    );
    
    return {
      fee: Math.min(tier.fee, rules.maximumFee || Infinity),
      travelTimeMinutes: Math.round(travelTime),
      totalTravelTimeMinutes: Math.round(travelTime * 2),
      withinServiceArea: true,
      distanceKm,
      tierIndex: index,
      breakdown,
    };
  }
  
  // Fallback
  return {
    fee: rules.minimumFee || 0,
    travelTimeMinutes: rules.baseTravelTimeMinutes || 30,
    totalTravelTimeMinutes: (rules.baseTravelTimeMinutes || 30) * 2,
    withinServiceArea: true,
    breakdown: [{ label: "Default fee", amount: rules.minimumFee || 0 }],
  };
}

/**
 * Estimate travel time only (without fee calculation)
 */
export function computeTravelTime(
  baseLocation: Coordinates | null,
  clientAddress: ServiceAddress,
  rules: Partial<TravelFeeRules> = {}
): number {
  const baseTravelTime = rules.baseTravelTimeMinutes || 30;
  const minutesPerKm = rules.defaultMinutesPerKm || 2;
  
  if (!baseLocation || !clientAddress.coordinates) {
    return baseTravelTime;
  }
  
  const distanceKm = calculateDistance(baseLocation, clientAddress.coordinates);
  return Math.max(baseTravelTime, Math.round(distanceKm * minutesPerKm));
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format travel fee for display
 */
export function formatTravelFee(fee: number, currency: string = "R"): string {
  if (fee === 0) {
    return "Free";
  }
  return `${currency}${fee.toFixed(0)}`;
}

/**
 * Format travel time for display
 */
export function formatTravelTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

/**
 * Format distance for display
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate if an address is serviceable
 */
export function isAddressServiceable(
  baseLocation: Coordinates | null,
  clientAddress: ServiceAddress,
  rules: TravelFeeRules = DEFAULT_TRAVEL_FEE_RULES
): { serviceable: boolean; reason?: string } {
  const result = computeTravelFee(baseLocation, clientAddress, rules);
  
  return {
    serviceable: result.withinServiceArea,
    reason: result.outsideReason,
  };
}

/**
 * Get all available zones (for display in UI)
 */
export function getAvailableZones(rules: TravelFeeRules): TravelZone[] {
  return rules.zones || [];
}

/**
 * Get tier description for display
 */
export function getTierDescription(rules: TravelFeeRules): string[] {
  if (!rules.tiers) return [];
  
  return rules.tiers.map((tier, i) => {
    const prevMax = i === 0 ? 0 : rules.tiers![i - 1].maxDistanceKm;
    if (tier.fee === 0) {
      return `Free within ${tier.maxDistanceKm}km`;
    }
    return `R${tier.fee} for ${prevMax}-${tier.maxDistanceKm}km`;
  });
}
