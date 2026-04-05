import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Linking from "expo-linking";

const ACTIVE_MARKET_HOST_KEY = "active_market_host";

function readDefaultHost(): string {
  const fromProcess = process.env.EXPO_PUBLIC_WEB_API_TENANT_HOST;
  const fromExtra = (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.EXPO_PUBLIC_WEB_API_TENANT_HOST;
  return normalizeHost(fromExtra ?? fromProcess ?? "");
}

function normalizeHost(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";

  const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
  }
}

function hostFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

let activeMarketHost = readDefaultHost();
let initialized = false;

export function getActiveMarketHostSync(): string {
  return activeMarketHost;
}

export async function setActiveMarketHost(
  host: string | null | undefined,
  options?: { persist?: boolean },
): Promise<string> {
  const normalized = normalizeHost(host);
  activeMarketHost = normalized;

  if (options?.persist !== false) {
    if (normalized) {
      await AsyncStorage.setItem(ACTIVE_MARKET_HOST_KEY, normalized);
    } else {
      await AsyncStorage.removeItem(ACTIVE_MARKET_HOST_KEY);
    }
  }

  return activeMarketHost;
}

export async function initializeActiveMarketHost(): Promise<string> {
  if (initialized) return activeMarketHost;
  initialized = true;

  try {
    const stored = normalizeHost(await AsyncStorage.getItem(ACTIVE_MARKET_HOST_KEY));
    if (stored) {
      activeMarketHost = stored;
    }
  } catch {
    // Best effort: keep env default.
  }

  try {
    const initialUrl = await Linking.getInitialURL();
    const linkedHost = hostFromUrl(initialUrl);
    if (linkedHost) {
      await setActiveMarketHost(linkedHost);
    }
  } catch {
    // Best effort: deep-link parsing failure should not block app boot.
  }

  return activeMarketHost;
}

export function startActiveMarketHostLinkListener(): () => void {
  const subscription = Linking.addEventListener("url", ({ url }) => {
    const linkedHost = hostFromUrl(url);
    if (linkedHost) {
      void setActiveMarketHost(linkedHost);
    }
  });
  return () => subscription.remove();
}
