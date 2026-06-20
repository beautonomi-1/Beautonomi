/**
 * Handling for providers that have become permanently unavailable
 * (deleted, suspended, deactivated, banned, or never existed).
 *
 * The public provider API (`GET /api/public/providers/[slug]`) returns
 * HTTP 404 with `code: "NOT_FOUND"` for any provider that fails
 * `isProviderPubliclyVisible` on the web side. Clients must treat that as a
 * TERMINAL state (show a tombstone + a way out) rather than a transient error
 * with a dead "Retry" button — otherwise a cached/deep-linked tap to a gone
 * provider traps the user on an un-retryable error screen.
 */
import { DeviceEventEmitter } from "react-native";
import { getApiErrorCode, getHttpErrorStatus } from "@/lib/api-error";
import { evictProviderFromApiCache } from "@/lib/api-response-cache";

/** Broadcast when a provider is detected as permanently gone. */
export const PROVIDER_UNAVAILABLE_EVENT = "beautonomi:provider:unavailable";

/** Existing app-wide event that makes every `useApi` consumer refetch stale entries. */
const NETWORK_RECOVER_EVENT = "beautonomi:network:recover";

export interface ProviderUnavailablePayload {
  providerId?: string | null;
  slug?: string | null;
}

/**
 * True when a provider fetch failed with a TERMINAL "gone" signal (HTTP 404/410
 * or a NOT_FOUND/GONE code) rather than a transient/recoverable failure
 * (offline, timeout, 5xx). Pair with `isTransientApiFailure` for the inverse.
 */
export function isProviderUnavailableError(error: unknown): boolean {
  const status = getHttpErrorStatus(error);
  if (status === 404 || status === 410) return true;
  const code = getApiErrorCode(error);
  return code === "NOT_FOUND" || code === "GONE";
}

export function emitProviderUnavailable(payload: ProviderUnavailablePayload): void {
  DeviceEventEmitter.emit(PROVIDER_UNAVAILABLE_EVENT, payload);
}

/**
 * Self-heal after a provider is found to be gone:
 *  1. Purge it (and discovery lists) from the in-memory API cache.
 *  2. Broadcast `PROVIDER_UNAVAILABLE_EVENT` so mounted lists can optimistically
 *     drop the provider for an instant visual correction.
 *  3. Nudge `useApi`-backed surfaces to refetch the now-evicted entries via the
 *     shared recover event.
 */
export function reportProviderUnavailable(payload: ProviderUnavailablePayload): void {
  evictProviderFromApiCache([payload.providerId, payload.slug]);
  emitProviderUnavailable(payload);
  DeviceEventEmitter.emit(NETWORK_RECOVER_EVENT);
}
