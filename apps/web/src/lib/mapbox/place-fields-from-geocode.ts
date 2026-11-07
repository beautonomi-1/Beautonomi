import {
  mapGeocodeFeatureToAddressParts,
  type MapboxGeocodeFeatureLike,
} from "@beautonomi/utils";

export function placeFieldsFromGeocodeFeature(
  feature: MapboxGeocodeFeatureLike,
  defaultCountryName?: string,
): { neighborhood: string | null; metro: string | null } {
  const parsed = mapGeocodeFeatureToAddressParts(feature, { defaultCountryName });
  return {
    neighborhood: parsed.neighborhood?.trim() || null,
    metro: parsed.metro?.trim() || null,
  };
}
