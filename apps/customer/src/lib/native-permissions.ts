import { Alert, InteractionManager, Linking, Platform, type AlertButton } from "react-native";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

type PermissionLike = {
  granted?: boolean;
  canAskAgain?: boolean;
  status?: string;
  accessPrivileges?: "all" | "limited" | "none";
};

type PermissionCopy = {
  title: string;
  message: string;
  notNow?: string;
  retry?: string;
  openSettings?: string;
};

const DEFAULT_NOT_NOW = "Not now";
const DEFAULT_RETRY = "Try again";
const DEFAULT_OPEN_SETTINGS = "Open Settings";

function isGranted(permission: PermissionLike): boolean {
  return permission.granted === true || permission.status === "granted";
}

function isMediaLibraryUsable(permission: PermissionLike): boolean {
  return isGranted(permission) && permission.accessPrivileges !== "none";
}

export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    Alert.alert("Settings unavailable", "Open your device settings and allow Beautonomi permissions there.");
  }
}

/**
 * Open the OS notification settings for *this* app so the user can toggle the
 * system-level "Allow notifications" switch.
 *
 * - Android: deep-links straight to the app's notification settings via the
 *   built-in `Linking.sendIntent` (`APP_NOTIFICATION_SETTINGS`) — no extra
 *   native module required. Falls back to the app info page if the intent or
 *   package name is unavailable.
 * - iOS: opens the app's settings page (the Notifications row lives there;
 *   iOS does not allow deep-linking to the notification subpage).
 */
export async function openAppNotificationSettings(): Promise<void> {
  if (Platform.OS === "android") {
    const pkg =
      Constants.expoConfig?.android?.package ??
      (Constants as unknown as { manifest?: { android?: { package?: string } } }).manifest?.android
        ?.package;
    if (pkg) {
      try {
        await Linking.sendIntent("android.settings.APP_NOTIFICATION_SETTINGS", [
          { key: "android.provider.extra.APP_PACKAGE", value: pkg },
        ]);
        return;
      } catch {
        // Intent unavailable on this OEM/OS version — fall back below.
      }
    }
    await openAppSettings();
    return;
  }
  await openAppSettings();
}

export function runAfterNativeUiSettles<T>(fn: () => T | Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        const run = () => {
          Promise.resolve(fn()).then(resolve, reject);
        };
        if (Platform.OS === "android") {
          setTimeout(run, 320);
        } else {
          run();
        }
      });
    });
  });
}

export function showPermissionRecoveryAlert(
  copy: PermissionCopy,
  options: {
    canAskAgain?: boolean;
    retry?: () => Promise<boolean>;
    /** Override the settings deep-link (e.g. open notification settings). */
    openSettings?: () => Promise<void>;
  } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const openSettingsAction = options.openSettings ?? openAppSettings;
    const buttons: AlertButton[] = [
      {
        text: copy.notNow ?? DEFAULT_NOT_NOW,
        style: "cancel" as const,
        onPress: () => resolve(false),
      },
    ];

    if (options.canAskAgain && options.retry) {
      buttons.push({
        text: copy.retry ?? DEFAULT_RETRY,
        onPress: () => {
          void options.retry?.().then(resolve);
        },
      });
    }

    buttons.push({
      text: copy.openSettings ?? DEFAULT_OPEN_SETTINGS,
      onPress: () => {
        void openSettingsAction().finally(() => resolve(false));
      },
    });

    Alert.alert(copy.title, copy.message, buttons);
  });
}

export async function ensureMediaLibraryPermission(copy: PermissionCopy): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (isMediaLibraryUsable(current)) return true;

  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (isMediaLibraryUsable(requested)) return true;

  return showPermissionRecoveryAlert(copy, {
    canAskAgain: requested.canAskAgain,
    retry: async () => {
      const retry = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return isMediaLibraryUsable(retry);
    },
  });
}

export async function ensureCameraPermission(copy: PermissionCopy): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (isGranted(current)) return true;

  const requested = await ImagePicker.requestCameraPermissionsAsync();
  if (isGranted(requested)) return true;

  return showPermissionRecoveryAlert(copy, {
    canAskAgain: requested.canAskAgain,
    retry: async () => {
      const retry = await ImagePicker.requestCameraPermissionsAsync();
      return isGranted(retry);
    },
  });
}

export async function ensureForegroundLocationPermission(copy: PermissionCopy): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (isGranted(current)) return true;

  const requested = await Location.requestForegroundPermissionsAsync();
  if (isGranted(requested)) return true;

  return showPermissionRecoveryAlert(copy, {
    canAskAgain: requested.canAskAgain,
    retry: async () => {
      const retry = await Location.requestForegroundPermissionsAsync();
      return isGranted(retry);
    },
  });
}

export async function launchImageLibraryWithPermission(
  options: ImagePicker.ImagePickerOptions,
  copy: PermissionCopy,
  launchOptions: { defer?: boolean } = {},
): Promise<ImagePicker.ImagePickerResult | null> {
  const allowed = await ensureMediaLibraryPermission(copy);
  if (!allowed) return null;
  const launch = () => ImagePicker.launchImageLibraryAsync(options);
  return launchOptions.defer ? runAfterNativeUiSettles(launch) : launch();
}

export async function launchCameraWithPermission(
  options: ImagePicker.ImagePickerOptions,
  copy: PermissionCopy,
  launchOptions: { defer?: boolean } = {},
): Promise<ImagePicker.ImagePickerResult | null> {
  const allowed = await ensureCameraPermission(copy);
  if (!allowed) return null;
  const launch = () => ImagePicker.launchCameraAsync(options);
  return launchOptions.defer ? runAfterNativeUiSettles(launch) : launch();
}
