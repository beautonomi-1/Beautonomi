/**
 * Reverse-geocode coordinates via POST /api/mapbox/reverse-geocode (same stack as customer AddressPicker).
 */
import { api } from "@/lib/api-client";
import { mapGeocodeFeatureToAddressParts, type MapboxGeocodeFeatureLike } from "@beautonomi/utils";

export type ReverseGeocodedAddressParts = {
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number;
  longitude: number;
};

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
  defaultCountryName: string,
): Promise<ReverseGeocodedAddressParts | null> {
  const res = await api.post<MapboxGeocodeFeatureLike | null>("/api/mapbox/reverse-geocode", {
    latitude,
    longitude,
  });
  if (res.error || !res.data) return null;
  const mapped = mapGeocodeFeatureToAddressParts(res.data, { defaultCountryName });
  return {
    address_line1: mapped.address_line1,
    city: mapped.city,
    state: mapped.state,
    postal_code: mapped.postal_code,
    country: mapped.country?.trim() || defaultCountryName,
    latitude: mapped.latitude,
    longitude: mapped.longitude,
  };
}
