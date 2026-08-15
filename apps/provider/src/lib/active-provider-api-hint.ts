/**
 * In-memory active provider id for Bearer-only API calls to `/api/provider/*`.
 * Must match server header `ACTIVE_PROVIDER_ID_HEADER` in apps/web api-helpers.
 * Persisted per-user via AsyncStorage in ProviderContext (sign-out clears storage).
 */

import { DeviceEventEmitter } from "react-native";

export const ACTIVE_PROVIDER_CHANGED_EVENT = "bn:active-provider-changed";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeActiveProviderUuid(id: string): boolean {
  return UUID_RE.test(id.trim());
}

/** AsyncStorage value is JSON `{ userId, providerId }`. */
export const ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY = "bn_provider_active_org_hint_v1";

const ACTIVE_PROVIDER_ID_HEADER = "x-provider-id";

let memoryHint: string | null = null;

export async function persistActiveProviderOrgHint(
  userId: string | null | undefined,
  providerId: string | null,
): Promise<void> {
  setActiveProviderApiHint(providerId);
  try {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    if (!userId || !providerId || !looksLikeActiveProviderUuid(providerId)) {
      await AsyncStorage.removeItem(ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(
      ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY,
      JSON.stringify({ userId, providerId }),
    );
  } catch {
    /* ignore */
  }
}

export function setActiveProviderApiHint(providerId: string | null): void {
  const prev = memoryHint;
  if (!providerId?.trim()) {
    memoryHint = null;
  } else {
    const t = providerId.trim();
    memoryHint = looksLikeActiveProviderUuid(t) ? t : null;
  }
  if (prev !== memoryHint) {
    DeviceEventEmitter.emit(ACTIVE_PROVIDER_CHANGED_EVENT, { providerId: memoryHint });
  }
}

export function getActiveProviderApiHint(): string | null {
  return memoryHint;
}

export function clearActiveProviderApiHintMemory(): void {
  memoryHint = null;
}

/** Default-headers fragment for createApiClient (only `/api/provider/*`). */
export function activeProviderIdHeadersForPath(path: string): Record<string, string> {
  if (!path.startsWith("/api/provider")) return {};
  const id = getActiveProviderApiHint();
  if (!id) return {};
  return { [ACTIVE_PROVIDER_ID_HEADER]: id };
}
