import { DeviceEventEmitter } from "react-native";

/** Emitted after provider service catalog mutations (create / update / delete) so list UIs can refetch. */
export const PROVIDER_SERVICES_CATALOG_CHANGED = "provider-services-catalog-changed";

export function emitProviderServicesCatalogChanged(): void {
  DeviceEventEmitter.emit(PROVIDER_SERVICES_CATALOG_CHANGED);
}
