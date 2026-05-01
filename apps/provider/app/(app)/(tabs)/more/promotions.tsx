import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatCurrency } from "@/lib/format";

interface Promotion {
  id: string;
  code: string;
  type: string;
  value: number;
  description?: string | null;
  is_active: boolean;
  public_on_profile?: boolean;
  uses_count: number;
  max_uses?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
}

/** Content-only for use in Marketing hub (Promo codes tab). */
export function PromotionsContent() {
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [promoType, setPromoType] = useState<"percentage" | "fixed_amount">("percentage");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [publicOnProfile, setPublicOnProfile] = useState(true);

  const { data, loading, error, refresh } = useApi<Promotion[]>("/api/provider/promotions");
  const { execute: createPromo, loading: creating } = useApiMutation<Promotion>("post");
  const { execute: patchPromo } = useApiMutation("patch");
  const { execute: deletePromo } = useApiMutation("delete");

  const promotions: Promotion[] = Array.isArray(data) ? data : [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      Alert.alert("Required", "Enter a promo code.");
      return;
    }
    const numValue = parseFloat(value.replace(/,/g, "."));
    if (Number.isNaN(numValue)) {
      Alert.alert("Invalid", "Enter a valid value.");
      return;
    }
    if (promoType === "percentage" && (numValue < 0 || numValue > 100)) {
      Alert.alert("Invalid", "Percentage must be between 0 and 100.");
      return;
    }
    if (promoType === "fixed_amount" && numValue <= 0) {
      Alert.alert("Invalid", "Enter a fixed amount greater than 0.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await createPromo("/api/provider/promotions", {
      code: trimmedCode,
      type: promoType,
      value: numValue,
      description: description.trim() || undefined,
      public_on_profile: publicOnProfile,
    });
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCreateOpen(false);
    setCode("");
    setValue("");
    setDescription("");
    setPublicOnProfile(true);
    setPromoType("percentage");
    refresh();
  }, [code, value, description, promoType, publicOnProfile, createPromo, refresh]);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleActive = useCallback(
    async (p: Promotion) => {
      if (togglingId) return;
      setTogglingId(p.id);
      try {
        const { error: err } = await patchPromo(`/api/provider/promotions/${p.id}`, { is_active: !p.is_active });
        if (err) Alert.alert("Error", err);
        else refresh();
      } finally {
        setTogglingId(null);
      }
    },
    [patchPromo, refresh, togglingId]
  );

  const handleDelete = useCallback(
    (p: Promotion) => {
      Alert.alert("Delete promotion", `Remove code "${p.code}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deletePromo(`/api/provider/promotions/${p.id}`, {}).then(({ error: err }) => {
              if (err) Alert.alert("Error", err);
              else refresh();
            });
          },
        },
      ]);
    },
    [deletePromo, refresh]
  );

  const togglePublicOnProfile = useCallback(
    async (p: Promotion) => {
      if (togglingId) return;
      setTogglingId(p.id);
      try {
        const { error: err } = await patchPromo(`/api/provider/promotions/${p.id}`, {
          public_on_profile: !(p.public_on_profile ?? true),
        });
        if (err) Alert.alert("Error", err);
        else refresh();
      } finally {
        setTogglingId(null);
      }
    },
    [patchPromo, refresh, togglingId]
  );

  if (loading && !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            marginBottom: 16,
            borderRadius: 14,
            padding: 14,
            backgroundColor: "#eff6ff",
            borderWidth: 1,
            borderColor: "#bfdbfe",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#1e3a8a", marginBottom: 6 }}>Your codes only</Text>
          <Text style={{ fontSize: 12, color: "#1e40af", lineHeight: 17 }}>
            Codes created here are tied to your business and apply when customers book you—they are not the same as platform-wide admin coupons.
            Discounts reduce what you collect on covered bookings; track usage in Finance and reports.
          </Text>
        </View>
        {promotions.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 64 }}>
            <View style={{ marginBottom: 16, height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#ffedd5" }}>
              <Ionicons name="pricetag-outline" size={32} color="#f97316" />
            </View>
            <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900] }}>No promo codes yet</Text>
            <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Create promo codes for percentage or fixed-amount discounts.
            </Text>
            <TouchableOpacity
              onPress={() => setCreateOpen(true)}
              style={{ marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#f97316", paddingHorizontal: 24, paddingVertical: 12 }}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={{ marginLeft: 8, fontWeight: "500", color: Colors.white }}>New promo code</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => setCreateOpen(true)}
              style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", paddingVertical: 12 }}
            >
              <Ionicons name="add" size={18} color="#f97316" />
              <Text style={{ marginLeft: 8, fontWeight: "500", color: "#c2410c" }}>New promo code</Text>
            </TouchableOpacity>
            {promotions.map((p) => (
            <View
              key={p.id}
              style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
            >
              <View style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#ffedd5" }}>
                <Ionicons name="pricetag-outline" size={20} color="#f97316" />
              </View>
              <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{p.code}</Text>
                <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }}>
                  {p.type === "percentage" ? `${p.value}% off` : `${formatCurrency(Number(p.value))} off`}
                  {p.description ? ` · ${p.description}` : ""}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                  Used {p.uses_count}
                  {p.max_uses != null ? ` / ${p.max_uses}` : ""}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: p.public_on_profile === false ? "#9a3412" : "#166534" }}>
                  {p.public_on_profile === false ? "Hidden on public profile" : "Visible on public profile"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => togglePublicOnProfile(p)}
                style={{
                  marginRight: 8,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: p.public_on_profile === false ? "#ffedd5" : "#dcfce7",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: p.public_on_profile === false ? "#9a3412" : "#166534",
                  }}
                >
                  {p.public_on_profile === false ? "Hidden" : "Public"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => toggleActive(p)}
                style={{ marginRight: 8, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: p.is_active ? "#dcfce7" : Colors.gray[100] }}
              >
                <Text style={{ fontSize: 12, fontWeight: "500", color: p.is_active ? "#166534" : Colors.gray[600] }}>
                  {p.is_active ? "On" : "Off"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(p)}
                style={{ height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#fee2e2" }}
              >
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ))}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New promo code"
        subtitle="Percentage or fixed amount"
      >
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Code *</Text>
        <TextInput
          style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
          placeholder="e.g. SAVE20"
          placeholderTextColor="#9ca3af"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
        />
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Type</Text>
        <View style={{ marginBottom: 16, flexDirection: "row" }}>
          <TouchableOpacity
            onPress={() => setPromoType("percentage")}
            style={{ flex: 1, marginRight: 8, borderRadius: 12, paddingVertical: 10, backgroundColor: promoType === "percentage" ? "#f97316" : Colors.gray[100] }}
          >
            <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: promoType === "percentage" ? Colors.white : Colors.gray[700] }}>
              Percentage
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPromoType("fixed_amount")}
            style={{ flex: 1, borderRadius: 12, paddingVertical: 10, backgroundColor: promoType === "fixed_amount" ? "#f97316" : Colors.gray[100] }}
          >
            <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: promoType === "fixed_amount" ? Colors.white : Colors.gray[700] }}>
              Fixed amount
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
          Value {promoType === "percentage" ? "(0–100)" : `(${getTenantDefaultCurrency()})`} *
        </Text>
        <TextInput
          style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
          placeholder={promoType === "percentage" ? "20" : "50"}
          placeholderTextColor="#9ca3af"
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
        />
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Description (optional)</Text>
        <TextInput
          style={{ marginBottom: 24, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
          placeholder="e.g. Summer sale"
          placeholderTextColor="#9ca3af"
          value={description}
          onChangeText={setDescription}
        />
        <TouchableOpacity
          onPress={() => setPublicOnProfile((v) => !v)}
          style={{
            marginBottom: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: publicOnProfile }}
          accessibilityLabel="Show this promo on public profile"
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>Show on public profile</Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
              Customers can still use this code at checkout even when hidden.
            </Text>
          </View>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: publicOnProfile ? "#16a34a" : Colors.gray[300],
              backgroundColor: publicOnProfile ? "#dcfce7" : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {publicOnProfile ? <Ionicons name="checkmark" size={14} color="#166534" /> : null}
          </View>
        </TouchableOpacity>
        <ActionButton
          label={creating ? "Creating…" : "Create promo code"}
          onPress={handleCreate}
          loading={creating}
          fullWidth
        />
      </BottomSheet>
    </>
  );
}

export default function PromotionsScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Promotions"
        showBack
        subtitle="Promo codes & discounts"
      />
      <PromotionsContent />
    </ScreenContainer>
  );
}
