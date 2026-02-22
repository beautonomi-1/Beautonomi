/**
 * House Call / Mobile Service Configuration
 * 
 * Centralized configuration for house call services to avoid hardcoded values
 */

export const HOUSE_CALL_CONFIG = {
  // Default travel buffer time in minutes (used when actual travel time is not available)
  DEFAULT_TRAVEL_BUFFER_MINUTES: 30,
  
  // Default country code for geocoding (Mapbox)
  DEFAULT_COUNTRY_CODE: "ZA",
  
  // Default country name
  DEFAULT_COUNTRY_NAME: "South Africa",
  
  // Default travel fee settings (used as fallback)
  DEFAULT_TRAVEL_FEE: {
    RATE_PER_KM: 8.00,
    MINIMUM_FEE: 20.00,
    MAXIMUM_FEE: null,
    CURRENCY: "ZAR",
  },
  
  // Default maximum service distance in km
  DEFAULT_MAX_SERVICE_DISTANCE_KM: 50,
  
  // Travel time estimation (minutes per km)
  DEFAULT_MINUTES_PER_KM: 2,
  
  // Base travel time in minutes
  BASE_TRAVEL_TIME_MINUTES: 15,
  
  // Address validation minimum characters
  ADDRESS_MIN_LENGTH: 3,
  
  // Saved address validation expiry (milliseconds) - 24 hours
  SAVED_ADDRESS_VALIDATION_EXPIRY_MS: 24 * 60 * 60 * 1000,
} as const;

/**
 * Get travel buffer based on mode and available travel time
 */
export function getTravelBuffer(
  mode: "salon" | "mobile" | null,
  travelTimeMinutes?: number
): number {
  if (mode !== "mobile") {
    return 0;
  }
  
  return travelTimeMinutes 
    ? Math.ceil(travelTimeMinutes) 
    : HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_BUFFER_MINUTES;
}
