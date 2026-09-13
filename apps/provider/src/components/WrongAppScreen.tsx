import { useEffect, useState } from "react";
import { View, Text, Linking, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { APP_URL } from "@/config/public-env";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { useTranslation } from "@beautonomi/i18n";

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

export function WrongAppScreen({ portal, onSignOut }: WrongAppScreenProps) {
  const { t } = useTranslation();
  const wa = (key: string) => t(`provider.mobile.components.wrongApp.${key}`) as string;
  const router = useRouter();
  const { heading, body, action } = (() => {
    if (portal === "customer") {
      return { heading: wa("customerHeading"), body: wa("customerBody"), action: "open_customer" as const };
    }
    if (portal === "admin") {
      return { heading: wa("adminHeading"), body: wa("adminBody"), action: "open_admin" as const };
    }
    return { heading: wa("otherHeading"), body: wa("otherBody"), action: "other" as const };
  })();
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
    pushInAppBrowser(router, `${APP_URL.replace(/\/$/, "")}/portal`, wa("customerPortal"));
  };

  const openAdminWeb = () => {
    if (!APP_URL) return;
    pushInAppBrowser(router, `${APP_URL.replace(/\/$/, "")}/admin/dashboard`, wa("admin"));
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
                  ? wa("openCustomerApp")
                  : customerStoreUrl()
                    ? wa("installCustomerApp")
                    : wa("continueOnWeb")
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
                ? wa("openCustomerApp")
                : customerStoreUrl()
                  ? wa("installCustomerApp")
                  : wa("continueOnWeb")}
            </Text>
          </Pressable>
          {APP_URL ? (
            <Pressable
              onPress={openWebCustomer}
              accessibilityRole="button"
              accessibilityLabel={wa("continueOnWeb")}
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
                {wa("continueOnWeb")}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {action === "open_admin" && APP_URL ? (
        <Pressable
          onPress={openAdminWeb}
          accessibilityRole="button"
          accessibilityLabel={wa("openAdminWebA11y")}
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
            {wa("openAdminWeb")}
          </Text>
        </Pressable>
      ) : null}

      {onSignOut && (
        <Pressable
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel={t("common.signOut")}
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
            {t("common.signOut")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
