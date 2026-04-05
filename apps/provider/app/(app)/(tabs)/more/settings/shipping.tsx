import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { api } from "@/lib/api-client";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

const PRIMARY = Colors.primary;

interface ShippingConfig {
  offers_delivery: boolean;
  offers_collection: boolean;
  delivery_fee: number;
  free_delivery_threshold: number | null;
  delivery_radius_km: number | null;
  estimated_delivery_days: number;
  delivery_notes: string | null;
}

export default function ShippingConfigScreen() {
  const router = useRouter();
  const tenantCurrency = getTenantDefaultCurrency();
  const { contentMaxWidth, isTablet, screenPadding } = useResponsive();
  const [config, setConfig] = useState<ShippingConfig>({
    offers_delivery: false,
    offers_collection: true,
    delivery_fee: 0,
    free_delivery_threshold: null,
    delivery_radius_km: null,
    estimated_delivery_days: 3,
    delivery_notes: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await api.get<{ config: ShippingConfig }>("/api/provider/shipping-config");
      if (res.data?.config) {
        setConfig({
          ...res.data.config,
          delivery_fee: Number(res.data.config.delivery_fee) || 0,
          free_delivery_threshold: res.data.config.free_delivery_threshold
            ? Number(res.data.config.free_delivery_threshold)
            : null,
          delivery_radius_km: res.data.config.delivery_radius_km
            ? Number(res.data.config.delivery_radius_km)
            : null,
          estimated_delivery_days: Number(res.data.config.estimated_delivery_days) || 3,
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const res = await api.put<{ config: ShippingConfig }>("/api/provider/shipping-config", {
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
    } else {
      Alert.alert("Saved", "Shipping configuration updated");
    }
  }, [config]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: screenPadding,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>
          Shipping & Collection
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: 40,
          ...((isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {}),
        }}
      >
        {/* Collection */}
        <View style={{ backgroundColor: "#fff", padding: 20, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="storefront-outline" size={22} color="#111827" />
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginLeft: 10 }}>
                In-Store Collection
              </Text>
            </View>
            <Switch
              value={config.offers_collection}
              onValueChange={(v) => setConfig((c) => ({ ...c, offers_collection: v }))}
              trackColor={{ true: PRIMARY, false: "#D1D5DB" }}
              thumbColor="#fff"
            />
          </View>
          <Text style={{ fontSize: 13, color: "#6B7280" }}>
            Allow customers to collect orders from your location(s)
          </Text>
        </View>

        {/* Delivery */}
        <View style={{ backgroundColor: "#fff", padding: 20, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="bicycle-outline" size={22} color="#111827" />
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginLeft: 10 }}>
                Delivery
              </Text>
            </View>
            <Switch
              value={config.offers_delivery}
              onValueChange={(v) => setConfig((c) => ({ ...c, offers_delivery: v }))}
              trackColor={{ true: PRIMARY, false: "#D1D5DB" }}
              thumbColor="#fff"
            />
          </View>
          <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
            Offer product delivery to customers
          </Text>

          {config.offers_delivery && (
            <>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                Delivery Fee ({tenantCurrency})
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: "#111827",
                  marginBottom: 16,
                }}
                value={String(config.delivery_fee || "")}
                onChangeText={(t) => setConfig((c) => ({ ...c, delivery_fee: parseFloat(t) || 0 }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                Free Delivery Above ({tenantCurrency})
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: "#111827",
                  marginBottom: 16,
                }}
                value={config.free_delivery_threshold ? String(config.free_delivery_threshold) : ""}
                onChangeText={(t) =>
                  setConfig((c) => ({
                    ...c,
                    free_delivery_threshold: t ? parseFloat(t) || null : null,
                  }))
                }
                keyboardType="decimal-pad"
                placeholder="Leave empty for no free delivery"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                Delivery Radius (km)
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: "#111827",
                  marginBottom: 16,
                }}
                value={config.delivery_radius_km ? String(config.delivery_radius_km) : ""}
                onChangeText={(t) =>
                  setConfig((c) => ({
                    ...c,
                    delivery_radius_km: t ? parseFloat(t) || null : null,
                  }))
                }
                keyboardType="decimal-pad"
                placeholder="Leave empty for unlimited"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                Estimated Delivery Days
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: "#111827",
                  marginBottom: 16,
                }}
                value={String(config.estimated_delivery_days)}
                onChangeText={(t) =>
                  setConfig((c) => ({
                    ...c,
                    estimated_delivery_days: parseInt(t) || 3,
                  }))
                }
                keyboardType="number-pad"
                placeholder="3"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                Delivery Notes
              </Text>
              <TextInput
                style={{
                  borderWidth: 1.5,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: "#111827",
                  minHeight: 80,
                  textAlignVertical: "top",
                }}
                value={config.delivery_notes ?? ""}
                onChangeText={(t) => setConfig((c) => ({ ...c, delivery_notes: t || null }))}
                placeholder="e.g. Delivery available Mon-Fri only"
                placeholderTextColor="#9CA3AF"
                multiline
              />
            </>
          )}
        </View>

        {/* Info card */}
        <View style={{ backgroundColor: "#EFF6FF", marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons name="information-circle-outline" size={18} color="#3B82F6" />
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E40AF", marginLeft: 8 }}>
              How Fees Work
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: "#1E3A5F", lineHeight: 20 }}>
            {"• "}Online orders: customer pays your delivery fee + a platform service fee{"\n"}
            {"• "}Walk-in sales (cash/Yoco): no platform fee or delivery fee{"\n"}
            {"• "}Collection: always free for the customer{"\n"}
            {"• "}Free delivery threshold: orders above this amount get free delivery
          </Text>
        </View>

        {/* Save button */}
        <View style={{ paddingHorizontal: screenPadding, paddingTop: 8 }}>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{
              backgroundColor: PRIMARY,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
