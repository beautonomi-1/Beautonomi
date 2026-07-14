import { DeviceEventEmitter } from "react-native";
import { invalidateApiCacheForPath } from "@/lib/api-response-cache";

const SETUP_STATUS_PATH = "/api/provider/setup-status";

/** Emitted after provider setup checklist inputs change so list UIs can refetch. */
export const PROVIDER_SETUP_STATUS_CHANGED = "provider-setup-status-changed";

export function invalidateSetupStatusCache(): void {
  invalidateApiCacheForPath(SETUP_STATUS_PATH);
  DeviceEventEmitter.emit(PROVIDER_SETUP_STATUS_CHANGED);
}
