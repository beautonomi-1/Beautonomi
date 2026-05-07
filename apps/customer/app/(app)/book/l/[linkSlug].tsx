import { useEffect, useState, useCallback } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { productCartToQueryParam } from "@/lib/express-booking/prefill";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";

export type ExpressPrefill = {
  addon_ids?: string[];
  promotion_code?: string;
  gift_card_code?: string;
  product_cart?: {
    product_id: string;
    quantity: number;
    product_variant_id?: string | null;
  }[];
};

type ExpressLinkResponse = {
  provider_slug: string;
  provider_id: string;
  provider_name: string;
  link_name: string;
  service_ids: string[];
  staff_ids: string[];
  location_id?: string | null;
  location_type?: string | null;
  prefill?: ExpressPrefill;
};

/**
 * Resolves `GET /api/public/express-link/:slug` and navigates to the same book params as web `/book/l/[linkSlug]`.
 */
export default function ExpressBookLinkScreen() {
  const { t } = useTranslation();
  const { linkSlug, embed } = useLocalSearchParams<{ linkSlug: string; embed?: string }>();
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    if (!linkSlug) {
      setError(t("customer.expressBookLink.invalidLink"));
      return;
    }
    setError(null);
    try {
      const res = await api.get<ExpressLinkResponse>(
        `/api/public/express-link/${encodeURIComponent(String(linkSlug))}`,
        { timeout: 60000 }
      );
      if (res.error) {
        setError(getApiErrorMessage(res.error, t("customer.expressBookLink.loadFailed")));
        return;
      }
      const raw = res.data as ExpressLinkResponse | null | undefined;
      const data = raw && typeof raw === "object" && "provider_slug" in raw ? raw : null;
      if (!data?.provider_slug) {
        setError(t("customer.expressBookLink.notFound"));
        return;
      }

      const params: Record<string, string> = {
        slug: data.provider_slug,
      };
      if (data.service_ids?.length) {
        if (data.service_ids.length === 1) {
          params.service_id = data.service_ids[0];
        } else {
          params.services = data.service_ids.join(",");
        }
      }
      if (data.staff_ids?.[0]) params.staff_id = data.staff_ids[0];
      if (data.location_type === "at_home") {
        params.location_type = "at_home";
      } else if (data.location_type === "at_salon" || data.location_id) {
        params.location_type = "at_salon";
        if (data.location_id) params.location_id = data.location_id;
      }
      const embedVal = typeof embed === "string" ? embed : Array.isArray(embed) ? embed[0] : undefined;
      if (embedVal === "1") params.embed = "1";

      const pf = data.prefill;
      if (pf?.addon_ids?.length) params.addons = pf.addon_ids.join(",");
      if (pf?.promotion_code?.trim()) {
        const code = pf.promotion_code.trim();
        params.promo = code;
        params.promo_code = code;
      }
      if (pf?.gift_card_code?.trim()) {
        const gc = pf.gift_card_code.trim();
        params.gift_card = gc;
        params.gift_card_code = gc;
      }
      if (pf?.product_cart?.length) {
        params.products = productCartToQueryParam(pf.product_cart);
      }

      router.replace({ pathname: "/(app)/book", params });
    } catch (e) {
      setError(getApiErrorMessage(e, t("customer.expressBookLink.loadFailed")));
    }
  }, [linkSlug, embed, t]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  if (error) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            backgroundColor: "#fff",
          }}
        >
          <Text style={{ color: "#B91C1C", textAlign: "center", marginBottom: 16 }}>{error}</Text>
          <TouchableOpacity
            onPress={() => router.replace("/(app)/(tabs)/search")}
            style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary }}
            accessibilityRole="button"
            accessibilityLabel={t("customer.expressBookLink.findProviderA11y")}
          >
            <Text style={{ color: Colors.primary, fontWeight: "600" }}>{t("customer.expressBookLink.findProvider")}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    </>
  );
}
