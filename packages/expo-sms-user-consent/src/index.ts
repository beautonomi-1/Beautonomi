/**
 * Android SMS User Consent API — OTP autofill without app-hash or permissions.
 *
 * On Android: starts a listener that pops the OS one-tap consent dialog when a
 * verification SMS arrives. Resolves with the full SMS body so the caller can
 * extract the numeric code. The dialog is shown by the OS and requires no
 * READ_SMS or RECEIVE_SMS permission from the app.
 *
 * On iOS / web: both functions are no-ops. iOS OTP autofill is handled natively
 * by the `textContentType="oneTimeCode"` prop on the TextInput.
 *
 * Reference: https://developers.google.com/identity/sms-retriever/user-consent/request
 */

import { Platform } from "react-native";

// Loaded lazily so non-Android builds never import expo-modules-core's
// requireNativeModule (which would throw if the module is absent).
let _mod: { startSmsListener: () => Promise<string | null>; cancel: () => void } | null = null;

function loadModule(): typeof _mod {
  if (_mod !== null) return _mod;
  if (Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require("expo-modules-core");
    _mod = requireNativeModule("SmsUserConsent") as typeof _mod;
  } catch {
    // Native module not linked (Expo Go / simulator / prebuild not run).
    _mod = null;
  }
  return _mod;
}

/**
 * Start listening for an incoming SMS containing a verification code.
 *
 * On Android: triggers `SmsRetriever.startSmsUserConsent()`. When a matching
 * SMS arrives within the 5-minute window, the OS shows a one-tap consent
 * dialog. After the user consents the function resolves with the full SMS body
 * (e.g. "Your OTP code is 123456"). Returns `null` on timeout, cancel, user
 * dismiss, or any error.
 *
 * On iOS / web: immediately resolves with `null`.
 *
 * Call this once per OTP screen mount; cancel on unmount.
 */
export async function startSmsListener(): Promise<string | null> {
  return loadModule()?.startSmsListener() ?? null;
}

/**
 * Cancel a pending SMS listener started with `startSmsListener`.
 * Safe to call even if no listener is active.
 */
export function cancelSmsListener(): void {
  loadModule()?.cancel();
}
