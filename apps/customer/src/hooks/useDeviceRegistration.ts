/**
 * Device registration for push notifications (OneSignal).
 * Registration is handled automatically by PushNotificationsProvider when:
 * - EXPO_PUBLIC_ONESIGNAL_APP_ID is set
 * - User is authenticated
 * - App runs on iOS/Android (not web)
 *
 * Devices are registered via POST /api/me/devices with player_id (OneSignal subscription ID)
 * and platform (ios | android).
 *
 * This hook is kept for backwards compatibility; no action needed.
 */
export function useDeviceRegistration() {
  // Registration is handled by PushNotificationsProvider
}
