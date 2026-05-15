import { DeviceEventEmitter } from "react-native";

/** Emitted after provider product catalog mutations (create / update / delete) so list UIs can refetch. */
export const PROVIDER_PRODUCTS_CATALOG_CHANGED = "provider-products-catalog-changed";

export function emitProviderProductsCatalogChanged(): void {
  DeviceEventEmitter.emit(PROVIDER_PRODUCTS_CATALOG_CHANGED);
}
