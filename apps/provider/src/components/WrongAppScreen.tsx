import { useEffect, useState } from "react";
import { View, Text, Linking, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { APP_URL } from "@/config/public-env";
import { pushInAppBrowser } from "@/lib/in-app-web";

type WrongAppScreenProps = {
  /** "customer" | "admin" | any string */
  portal: string;
  onSignOut?: () => void;
};

/**
 * §Dual-role launch mitigation (2026-04-17): a provider who signs into the
 * Partner app as a customer (e.g. they want to book someone else's service)
 * previously hit a dead-end screen. On web they could just continue because
 * the same session is accepted by `/providers/<slug>`; on mobile the two
 * apps are siloed bundles with separate session stores. We now offer:
 *   1. Open the Customer app via `customer://` if installed.
 *   2. Fall back to the store listing if not.
 *   3. Fall back to the web customer portal as the last resort.
 */
const CUSTOMER_SCHEME = "customer://";
const PLAY_CUSTOMER_STORE_URL = "https://play.google.com/store/apps/details?id=com.beautonomi";

function customerStoreUrl(): string | null {
  const explicit = process.env.EXPO_PUBLIC_CUSTOMER_STORE_URL?.trim();
  if (explicit) return explicit;
  if (Platform.OS === "android") return PLAY_CUSTOMER_STORE_URL;
  return null;
}

function copyForPortal(portal: string): {
  heading: string;
  body: string;
  action: "open_customer" | "open_admin" | "other";
} {
  if (portal === "customer") {
    return {
      heading: "Open the Customer app",
      body: "This account is registered as a customer. Tap below to jump into the Beautonomi Customer app, or continue on the web customer portal.",
      action: "open_customer",
    };
  }
  if (portal === "admin") {
    return {
      heading: "Admin access",
      body: "This account has admin access. Open the web admin console to manage the platform — provider-app features are limited for safety.",
      action: "open_admin",
    };
  }
  return {
    heading: "Wrong app",
    body: "This account can't be used in the Provider app. Please sign in with your provider account, or open the app that matches your role.",
    action: "other",
  };
}

export function WrongAppScreen({ portal, onSignOut }: WrongAppScreenProps) {
  const router = useRouter();
  const { heading, body, action } = copyForPortal(portal);
  const [canOpenCustomer, setCanOpenCustomer] = useState(false);

  useEffect(() => {
    if (action !== "open_customer") return;
    let cancelled = false;
    Linking.canOpenURL(CUSTOMER_SCHEME)
      .then((ok) => {
        if (!cancelled) setCanOpenCustomer(!!ok);
      })
      .catch(() => {
        if (!cancelled) setCanOpenCustomer(false);
      });
    return () => {
      cancelled = true;
    };
  }, [action]);

  const openCustomer = () => {
    const storeUrl = customerStoreUrl();
    if (canOpenCustomer) {
      Linking.openURL(CUSTOMER_SCHEME).catch(() => {
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
    pushInAppBrowser(router, `${APP_URL.replace(/\/$/, "")}/portal`, "Customer portal");
  };

  const openAdminWeb = () => {
    if (!APP_URL) return;
    pushInAppBrowser(router, `${APP_URL.replace(/\/$/, "")}/admin/dashboard`, "Admin");
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

      {action === "open_customer" ? (
        <>
          <Pressable
            onPress={openCustomer}
            accessibilityRole="button"
              accessibilityLabel={
                canOpenCustomer
                  ? "Open Customer app"
                  : customerStoreUrl()
                    ? "Install Customer app"
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
              {canOpenCustomer
                ? "Open Customer app"
                : customerStoreUrl()
                  ? "Install Customer app"
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
                Continue on web
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
