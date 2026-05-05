/**
 * Shared Mapbox Geocoding feature → structured address fields (web + mobile).
 * Matches Mapbox Geocoding API v5 feature shape used by /api/mapbox/geocode.
 */
export type MapboxGeocodeFeatureLike = {
  place_name: string;
  center: [number, number];
  text?: string;
  address?: string;
  properties?: {
    address?: string;
    full_address?: string;
  };
  context?: Array<{ id: string; text: string; short_code?: string }>;
};

export type ParsedAddressFromMapboxFeature = {
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number;
  longitude: number;
  place_name: string;
};

export function mapGeocodeFeatureToAddressParts(
  feature: MapboxGeocodeFeatureLike,
  options?: { defaultCountryName?: string },
): ParsedAddressFromMapboxFeature {
  const context = feature.context || [];
  const addressParts: ParsedAddressFromMapboxFeature = {
    address_line1: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
    latitude: feature.center[1],
    longitude: feature.center[0],
    place_name: feature.place_name,
  };

  // Keep a secondary "suburb/neighborhood" value as city fallback for dense urban areas
  // (common in SA where Mapbox emits neighborhood.* but omits place.*).
  let neighborhoodOrLocality = "";

  for (const item of context) {
    if (item.id.startsWith("place.") || item.id.startsWith("city.")) {
      if (!addressParts.city) {
        addressParts.city = item.text;
      }
    } else if (item.id.startsWith("locality.")) {
      // Locality is more specific than place — prefer it as city when present.
      addressParts.city = item.text;
    } else if (item.id.startsWith("neighborhood.") || item.id.startsWith("suburb.")) {
      // Record as suburb candidate; use as city only if nothing else fills it.
      if (!neighborhoodOrLocality) neighborhoodOrLocality = item.text;
    } else if (item.id.startsWith("district.") || item.id.startsWith("municipality.")) {
      if (!addressParts.city) {
        addressParts.city = item.text;
      }
    } else if (item.id.startsWith("region.") || item.id.startsWith("province.")) {
      addressParts.state = item.text;
    } else if (item.id.startsWith("postcode.") || item.id.startsWith("postalcode.")) {
      addressParts.postal_code = item.text;
    } else if (item.id.startsWith("country.")) {
      addressParts.country = item.text;
    }
  }

  // If no city was found from place/locality/district, fall back to the neighborhood.
  if (!addressParts.city && neighborhoodOrLocality) {
    addressParts.city = neighborhoodOrLocality;
  }

  const placeParts = feature.place_name.split(",").map((p) => p.trim());

  const streetNumber = feature.address?.trim() || feature.properties?.address?.trim() || "";
  const streetName = feature.text?.trim() || "";
  const exactStreetAddress = streetNumber && streetName ? `${streetNumber} ${streetName}` : "";
  const propertyFullAddress = feature.properties?.full_address?.split(",")[0]?.trim() || "";

  if (exactStreetAddress) {
    addressParts.address_line1 = exactStreetAddress;
  } else if (propertyFullAddress) {
    addressParts.address_line1 = propertyFullAddress;
  } else if (placeParts.length > 0) {
    addressParts.address_line1 = placeParts[0];

    if (!addressParts.city && placeParts.length > 1) {
      addressParts.city = placeParts[1];
    }

    if (!addressParts.state && placeParts.length > 2) {
      addressParts.state = placeParts[2];
    }

    if (!addressParts.postal_code && placeParts.length > 3) {
      const possiblePostal = placeParts[3];
      if (/^[0-9A-Z\s-]+$/.test(possiblePostal) && possiblePostal.length <= 10) {
        addressParts.postal_code = possiblePostal;
      }
    }
  }

  // Last-resort postal code extraction: scan remaining place_name parts for a numeric-ish code.
  if (!addressParts.postal_code) {
    for (const part of placeParts.slice(1)) {
      if (/^\d{4,6}$/.test(part.trim()) || /^[A-Z]{1,2}\d{1,2}[A-Z\d\s]{2,4}$/.test(part.trim())) {
        addressParts.postal_code = part.trim();
        break;
      }
    }
  }

  if (!addressParts.country && options?.defaultCountryName) {
    addressParts.country = options.defaultCountryName;
  }

  return addressParts;
}
