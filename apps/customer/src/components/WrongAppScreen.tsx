import { useEffect, useState } from "react";
import { View, Text, Linking, Pressable, Platform } from "react-native";
import { Colors } from "@/constants/colors";

type WrongAppScreenProps = {
  /** "provider" | "provider_onboarding" | "admin" | any string */
  portal: string;
  onSignOut?: () => void;
};

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "";

/**
 * §Dual-role launch mitigation (2026-04-17): on web a signed-in provider can
 * still browse customer routes (the Next 16 `src/proxy.ts` does not gate
 * customer routes by role), so the web UX for dual-role users is smooth.
 * On mobile the two apps are siloed bundles with separate session stores —
 * previously this screen was a cul-de-sac that just offered Sign out. Now
 * we deep-link into the correct sibling app (provider:// or customer://),
 * falling back to the store listing if the other app isn't installed, and
 * to the web equivalent as the last resort.
 *
 * Store URLs come from EXPO_PUBLIC_PROVIDER_STORE_URL / ..._CUSTOMER_STORE_URL
 * (set per-market in EAS) so the same binary works for ZA, NG, etc.
 */
const PROVIDER_SCHEME = "provider://";
const PLAY_PROVIDER_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.beautonomi.partner";

function providerStoreUrl(): string | null {
  const explicit = process.env.EXPO_PUBLIC_PROVIDER_STORE_URL?.trim();
  if (explicit) return explicit;
  if (Platform.OS === "android") return PLAY_PROVIDER_STORE_URL;
  return null;
}

function copyForPortal(portal: string): { heading: string; body: string; action: "open_provider" | "open_admin" | "other" } {
  if (portal === "admin") {
    return {
      heading: "Admin access",
      body: "This account has admin access. Open the web admin console to manage the platform — customer-app features are limited for safety.",
      action: "open_admin",
    };
  }
  if (portal === "provider" || portal === "provider_owner" || portal === "provider_staff") {
    return {
      heading: "Open the Provider app",
      body: "This account is registered as a provider. Tap below to jump into the Beautonomi Partner app, or continue on the web customer portal to book services.",
      action: "open_provider",
    };
  }
  if (portal === "provider_onboarding") {
    return {
      heading: "Finish setting up your business",
      body: "Your provider onboarding isn't complete yet. Open the Partner app to finish setup — after that you can still book services from the web.",
      action: "open_provider",
    };
  }
  return {
    heading: "Wrong app",
    body: "This account can't be used in the Customer app. Please sign in with your customer account, or open the app that matches your role.",
    action: "other",
  };
}

export function WrongAppScreen({ portal, onSignOut }: WrongAppScreenProps) {
  const { heading, body, action } = copyForPortal(portal);
  const [canOpenProvider, setCanOpenProvider] = useState(false);

  useEffect(() => {
    if (action !== "open_provider") return;
    let cancelled = false;
    Linking.canOpenURL(PROVIDER_SCHEME)
      .then((ok) => {
        if (!cancelled) setCanOpenProvider(!!ok);
      })
      .catch(() => {
        if (!cancelled) setCanOpenProvider(false);
      });
    return () => {
      cancelled = true;
    };
  }, [action]);

  const openProvider = () => {
    const storeUrl = providerStoreUrl();
    if (canOpenProvider) {
      Linking.openURL(PROVIDER_SCHEME).catch(() => {
        if (storeUrl) Linking.openURL(storeUrl).catch(() => {});
      });
      return;
    }
    if (storeUrl) {
      Linking.openURL(storeUrl).catch(() => {});
      return;
    }
    openWebCustomer();
  };

  const openWebCustomer = () => {
    if (!APP_URL) return;
    Linking.openURL(APP_URL.replace(/\/$/, "") + "/portal").catch(() => {});
  };

  const openAdminWeb = () => {
    if (!APP_URL) return;
    Linking.openURL(APP_URL.replace(/\/$/, "") + "/admin/dashboard").catch(() => {});
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.white,
        paddingHorizontal: 24,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontSize: 20,
          fontWeight: "600",
          color: Colors.gray[900],
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        {heading}
      </Text>
      <Text
        style={{
          fontSize: 16,
          color: Colors.gray[600],
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        {body}
      </Text>

      {action === "open_provider" ? (
        <>
          <Pressable
            onPress={openProvider}
            accessibilityRole="button"
            accessibilityLabel={
              canOpenProvider
                ? "Open Partner app"
                : providerStoreUrl()
                  ? "Install Partner app"
                  : "Continue on web"
            }
            style={{
              marginBottom: 10,
              minWidth: 240,
              paddingVertical: 12,
              paddingHorizontal: 16,
              backgroundColor: Colors.primary,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>
              {canOpenProvider
                ? "Open Partner app"
                : providerStoreUrl()
                  ? "Install Partner app"
                  : "Continue on web"}
            </Text>
          </Pressable>
          {APP_URL ? (
            <Pressable
              onPress={openWebCustomer}
              accessibilityRole="button"
              accessibilityLabel="Continue on web"
              style={{
                marginBottom: 10,
                minWidth: 240,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderWidth: 1,
                borderColor: Colors.gray[300],
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ color: Colors.gray[800], fontWeight: "500" }}>
                Book on web instead
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {action === "open_admin" && APP_URL ? (
        <Pressable
          onPress={openAdminWeb}
          accessibilityRole="button"
          accessibilityLabel="Open Admin on web"
          style={{
            marginBottom: 12,
            minWidth: 240,
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: Colors.primary,
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>
            Open Admin on web
          </Text>
        </Pressable>
      ) : null}

      {onSignOut && (
        <Pressable
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={{
            minWidth: 240,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderWidth: 1,
            borderColor: Colors.gray[300],
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          <Text style={{ color: Colors.gray[700], fontWeight: "500" }}>
            Sign out
          </Text>
        </Pressable>
      )}
    </View>
  );
}
