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

export type { PermissionCopy };

/** Neutral recovery copy — no "Allow" wording (App Store 5.1.1(iv)). KEEP IN SYNC: apps/provider/src/lib/native-permissions.ts */
export const PERMISSION_COPY = {
  locationNearby: {
    title: "Location access",
    message: "Location access is used to show nearby results and travel times.",
  },
  locationUseCurrent: {
    title: "Location access",
    message: "Location access is used to use your current position.",
  },
  locationPin: {
    title: "Location access",
    message: "Location access is used to place a pin from your current position.",
  },
  locationAddressFromCurrent: {
    title: "Location access",
    message: "Location access is used to fill an address from your current position.",
  },
  locationClientAddress: {
    title: "Location access",
    message: "Location access is used to fill the client address from your current position.",
  },
  locationJourney: {
    title: "Location access",
    message:
      "Location access while using the app lets clients see journey and arrival updates. You can continue without live location.",
  },
  locationArrival: {
    title: "Location access",
    message: "Location access is used to include your arrival position.",
  },
  locationOverride: {
    title: "Location access",
    message: "Location access is used to record your position for this override.",
  },
  photosChoose: {
    title: "Photos access",
    message: "Photo library access lets you choose images.",
  },
  photosAttach: {
    title: "Photos access",
    message: "Photo library access lets you attach images.",
  },
  photosAttachVideo: {
    title: "Photos access",
    message: "Photo library access lets you attach videos.",
  },
  photosDocument: {
    title: "Photos access",
    message: "Photo library access lets you upload documents.",
  },
  photosPost: {
    title: "Photos access",
    message: "Photo library access lets you add media to your post.",
  },
  cameraPhoto: {
    title: "Camera access",
    message: "Camera access lets you take a photo.",
  },
  cameraVideo: {
    title: "Camera access",
    message: "Camera access lets you record a video.",
  },
  cameraPost: {
    title: "Camera access",
    message: "Camera access lets you capture photos or videos for your post.",
  },
  terminalPosterSave: {
    title: "Photos access",
    message: "Photo library access lets you save the terminal poster to your device.",
  },
} as const satisfies Record<string, PermissionCopy>;

/** KEEP IN SYNC: apps/provider/src/lib/native-permissions.ts */
const DEFAULT_NOT_NOW = "OK";
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
    Alert.alert("Settings unavailable", "Open your device settings to manage Beautonomi permissions.");
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
