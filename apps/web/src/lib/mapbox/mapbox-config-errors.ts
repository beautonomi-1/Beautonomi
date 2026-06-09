export const MAPBOX_NOT_CONFIGURED_CODE = "MAPBOX_NOT_CONFIGURED";

export const MAPBOX_NOT_CONFIGURED_MESSAGE =
  "Mapbox geocoding is not configured. Add a secret access token in Admin → Mapbox (Integrations) or set MAPBOX_ACCESS_TOKEN on the server.";

export function isMapboxNotConfiguredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("not configured") ||
    message.includes("MAPBOX_ACCESS_TOKEN") ||
    message.includes("Mapbox is disabled")
  );
}

export function mapboxNotConfiguredResponse() {
  return {
    data: null as null,
    error: {
      message: MAPBOX_NOT_CONFIGURED_MESSAGE,
      code: MAPBOX_NOT_CONFIGURED_CODE,
    },
  };
}

/** Geocode callers historically read `data: []` when unconfigured; include explicit error for new clients. */
export function mapboxNotConfiguredGeocodeResponse() {
  return {
    data: [] as [],
    error: {
      message: MAPBOX_NOT_CONFIGURED_MESSAGE,
      code: MAPBOX_NOT_CONFIGURED_CODE,
    },
  };
}
