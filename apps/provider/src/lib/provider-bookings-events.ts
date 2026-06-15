import { DeviceEventEmitter } from "react-native";

/** Emitted when the Bookings tab is pressed or should reload its schedule. */
export const PROVIDER_BOOKINGS_REFRESH_EVENT = "beautonomi:bookings:refresh";

export function emitProviderBookingsRefresh(): void {
  DeviceEventEmitter.emit(PROVIDER_BOOKINGS_REFRESH_EVENT);
}
