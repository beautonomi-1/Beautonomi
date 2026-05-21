import { Alert, InteractionManager, Linking, Platform, type AlertButton } from "react-native";
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
    Alert.alert("Settings unavailable", "Open your device settings and allow Beautonomi Provider permissions there.");
  }
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
  options: { canAskAgain?: boolean; retry?: () => Promise<boolean> } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
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
        void openAppSettings().finally(() => resolve(false));
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
