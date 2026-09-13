import { useEffect, useState, useMemo } from "react";
import { View, Text, Linking, Pressable, Platform } from "react-native";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";

type WrongAppScreenProps = {
  /** "provider" | "provider_onboarding" | "admin" | any string */
  portal: string;
  onSignOut?: () => void;
};

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "";

const PROVIDER_SCHEME = "provider://";
const PLAY_PROVIDER_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.beautonomi.partner";

function providerStoreUrl(): string | null {
  const explicit = process.env.EXPO_PUBLIC_PROVIDER_STORE_URL?.trim();
  if (explicit) return explicit;
  if (Platform.OS === "android") return PLAY_PROVIDER_STORE_URL;
  return null;
}

export function WrongAppScreen({ portal, onSignOut }: WrongAppScreenProps) {
  const { t } = useTranslation();
  const wa = (key: string) => t(`customer.mobile.components.wrongApp.${key}`) as string;

  const { heading, body, action } = useMemo(() => {
    if (portal === "admin") {
      return {
        heading: wa("adminHeading"),
        body: wa("adminBody"),
        action: "open_admin" as const,
      };
    }
    if (portal === "provider" || portal === "provider_owner" || portal === "provider_staff") {
      return {
        heading: wa("providerHeading"),
        body: wa("providerBody"),
        action: "open_provider" as const,
      };
    }
    if (portal === "provider_onboarding") {
      return {
        heading: wa("onboardingHeading"),
        body: wa("onboardingBody"),
        action: "open_provider" as const,
      };
    }
    return {
      heading: wa("otherHeading"),
      body: wa("otherBody"),
      action: "other" as const,
    };
  }, [portal, t]);

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

  const providerCtaLabel = canOpenProvider
    ? wa("openPartnerApp")
    : providerStoreUrl()
      ? wa("installPartnerApp")
      : wa("continueOnWeb");

  const providerCtaA11y = canOpenProvider
    ? wa("openPartnerA11y")
    : providerStoreUrl()
      ? wa("installPartnerA11y")
      : wa("continueOnWebA11y");

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
            accessibilityLabel={providerCtaA11y}
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
            <Text style={{ color: Colors.white, fontWeight: "600" }}>{providerCtaLabel}</Text>
          </Pressable>
          {APP_URL ? (
            <Pressable
              onPress={openWebCustomer}
              accessibilityRole="button"
              accessibilityLabel={wa("continueOnWebA11y")}
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
                {wa("bookOnWebInstead")}
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
          accessibilityLabel={wa("signOutA11y")}
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
            {wa("signOut")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
