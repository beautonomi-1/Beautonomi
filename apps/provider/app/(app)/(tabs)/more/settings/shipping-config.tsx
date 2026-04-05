/**
 * Shipping & collection – configure delivery and collection options for product orders.
 * Full native implementation using provider shipping-config API.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

interface ShippingConfig {
  offers_delivery: boolean;
  offers_collection: boolean;
  delivery_fee: number;
  free_delivery_threshold: number | null;
  delivery_radius_km: number | null;
  estimated_delivery_days: number;
  delivery_notes: string | null;
}

const DEFAULTS: ShippingConfig = {
  offers_delivery: false,
  offers_collection: true,
  delivery_fee: 0,
  free_delivery_threshold: null,
  delivery_radius_km: null,
  estimated_delivery_days: 3,
  delivery_notes: null,
};

type ShippingResponse = { config?: ShippingConfig };

export default function ShippingConfigScreen() {
  const router = useRouter();
  const tenantCurrency = getTenantDefaultCurrency();
  const { data, loading, error, refresh } = useApi<ShippingResponse>("/api/provider/shipping-config");
  const [config, setConfig] = useState<ShippingConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const raw = (data as ShippingResponse)?.config;
    if (!raw) return;
    setConfig({
      offers_delivery: Boolean(raw.offers_delivery),
      offers_collection: Boolean(raw.offers_collection),
      delivery_fee: Number(raw.delivery_fee) || 0,
      free_delivery_threshold: raw.free_delivery_threshold != null ? Number(raw.free_delivery_threshold) : null,
      delivery_radius_km: raw.delivery_radius_km != null ? Number(raw.delivery_radius_km) : null,
      estimated_delivery_days: Number(raw.estimated_delivery_days) || 3,
      delivery_notes: raw.delivery_notes ?? null,
    });
  }, [data]);

  const handleSave = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    const res = await api.put<ShippingResponse>("/api/provider/shipping-config", {
      offers_delivery: config.offers_delivery,
      offers_collection: config.offers_collection,
      delivery_fee: config.delivery_fee,
      free_delivery_threshold: config.free_delivery_threshold,
      delivery_radius_km: config.delivery_radius_km,
      estimated_delivery_days: config.estimated_delivery_days,
      delivery_notes: config.delivery_notes,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Shipping configuration updated.");
  }, [config]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Shipping & collection" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Shipping & collection" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Shipping & collection" onBack={() => router.back()} />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Collection */}
        <View style={twStyle("mx-4 mb-3 rounded-2xl border border-gray-200 bg-white p-4")}>
          <View style={twStyle("flex-row items-center justify-between mb-2")}>
            <View style={twStyle("flex-row items-center")}>
              <Ionicons name="storefront-outline" size={22} color="#111827" />
              <Text style={twStyle("ml-2 text-base font-semibold text-gray-900")}>In-store collection</Text>
            </View>
            <Switch
              value={config.offers_collection}
              onValueChange={(v) => setConfig((c) => ({ ...c, offers_collection: v }))}
              trackColor={{ true: Colors.primary, false: "#d1d5db" }}
              thumbColor="#fff"
            />
          </View>
          <Text style={twStyle("text-sm text-gray-500")}>Allow customers to collect orders from your location(s).</Text>
        </View>

        {/* Delivery */}
        <View style={twStyle("mx-4 mb-3 rounded-2xl border border-gray-200 bg-white p-4")}>
          <View style={twStyle("flex-row items-center justify-between mb-2")}>
            <View style={twStyle("flex-row items-center")}>
              <Ionicons name="car-outline" size={22} color="#111827" />
              <Text style={twStyle("ml-2 text-base font-semibold text-gray-900")}>Delivery</Text>
            </View>
            <Switch
              value={config.offers_delivery}
              onValueChange={(v) => setConfig((c) => ({ ...c, offers_delivery: v }))}
              trackColor={{ true: Colors.primary, false: "#d1d5db" }}
              thumbColor="#fff"
            />
          </View>
          <Text style={twStyle("text-sm text-gray-500 mb-4")}>Offer product delivery to customers.</Text>

          {config.offers_delivery && (
            <View>
              <View style={{ marginBottom: 12 }}>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
                  Delivery fee ({tenantCurrency})
                </Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                  value={String(config.delivery_fee ?? "")}
                  onChangeText={(t) => setConfig((c) => ({ ...c, delivery_fee: parseFloat(t) || 0 }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={{ marginBottom: 12 }}>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
                  Free delivery above ({tenantCurrency})
                </Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                  value={config.free_delivery_threshold != null ? String(config.free_delivery_threshold) : ""}
                  onChangeText={(t) =>
                    setConfig((c) => ({
                      ...c,
                      free_delivery_threshold: t.trim() ? parseFloat(t) || null : null,
                    }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="Optional"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Delivery radius (km)</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                  value={config.delivery_radius_km != null ? String(config.delivery_radius_km) : ""}
                  onChangeText={(t) =>
                    setConfig((c) => ({
                      ...c,
                      delivery_radius_km: t.trim() ? parseFloat(t) || null : null,
                    }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="Optional"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Estimated delivery days</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                  value={String(config.estimated_delivery_days)}
                  onChangeText={(t) =>
                    setConfig((c) => ({ ...c, estimated_delivery_days: parseInt(t, 10) || 3 }))
                  }
                  keyboardType="number-pad"
                  placeholder="3"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Delivery notes</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 min-h-[80px]")}
                  value={config.delivery_notes ?? ""}
                  onChangeText={(t) => setConfig((c) => ({ ...c, delivery_notes: t || null }))}
                  placeholder="e.g. Mon–Fri only"
                  placeholderTextColor="#9ca3af"
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>
          )}
        </View>

        <View style={twStyle("mx-4 mb-4 rounded-2xl bg-blue-50 p-4")}>
          <View style={twStyle("flex-row items-center mb-2")}>
            <Ionicons name="information-circle-outline" size={18} color="#2563eb" />
            <Text style={twStyle("ml-2 text-sm font-semibold text-blue-800")}>How fees work</Text>
          </View>
          <Text style={twStyle("text-sm text-blue-900 leading-5")}>
            Collection is free. Delivery uses your fee and platform fee. Set a free-delivery threshold so orders above that amount get free delivery.
          </Text>
        </View>

        <View style={twStyle("px-4")}>
          <ActionButton
            label="Save changes"
            variant="primary"
            onPress={handleSave}
            loading={saving}
            fullWidth
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
