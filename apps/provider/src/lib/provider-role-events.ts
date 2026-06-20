import { DeviceEventEmitter } from "react-native";

/**
 * Emitted whenever the resolved provider role changes (or clears on sign-out).
 *
 * The push-registration logic lives in `PushNotificationsProvider`, which is
 * mounted at the root layout — ABOVE the authenticated `ProviderProvider` — so
 * it cannot read role via `useProvider()` (that would throw "useProvider must
 * be used within ProviderProvider" and stall the app on the splash screen).
 * Instead, `ProviderContext` broadcasts role changes through this event so the
 * root-level push provider can still retry device registration the moment a
 * fresh signup's role upgrades to a provider role.
 */
export const PROVIDER_ROLE_CHANGED_EVENT = "beautonomi:provider:role-changed";

export interface ProviderRoleChangedPayload {
  role: string | null;
}

export function emitProviderRoleChanged(role: string | null): void {
  DeviceEventEmitter.emit(PROVIDER_ROLE_CHANGED_EVENT, { role } satisfies ProviderRoleChangedPayload);
}
