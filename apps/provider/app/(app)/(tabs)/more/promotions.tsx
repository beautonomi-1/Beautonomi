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
import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
  const pr = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.promotions." + key, opts) as string,
    [t],
  );
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
      Alert.alert(pr("requiredTitle"), pr("enterCode"));
      return;
    }
    const numValue = parseFloat(value.replace(/,/g, "."));
    if (Number.isNaN(numValue)) {
      Alert.alert(pr("invalidTitle"), pr("invalidValue"));
      return;
    }
    if (promoType === "percentage" && (numValue < 0 || numValue > 100)) {
      Alert.alert(pr("invalidTitle"), pr("percentageRange"));
      return;
    }
    if (promoType === "fixed_amount" && numValue <= 0) {
      Alert.alert(pr("invalidTitle"), pr("fixedAmount"));
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
      Alert.alert(pr("errorTitle"), err);
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
        if (err) Alert.alert(pr("errorTitle"), err);
        else refresh();
      } finally {
        setTogglingId(null);
      }
    },
    [patchPromo, refresh, togglingId]
  );

  const handleDelete = useCallback(
    (p: Promotion) => {
      Alert.alert(pr("deleteTitle"), pr("deleteBody", { code: p.code }), [
        { text: pr("cancel"), style: "cancel" },
        {
          text: pr("delete"),
          style: "destructive",
          onPress: () => {
            deletePromo(`/api/provider/promotions/${p.id}`, {}).then(({ error: err }) => {
              if (err) Alert.alert(pr("errorTitle"), err);
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
        if (err) Alert.alert(pr("errorTitle"), err);
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
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#1e3a8a", marginBottom: 6 }}>{pr("yourCodesOnly")}</Text>
          <Text style={{ fontSize: 12, color: "#1e40af", lineHeight: 17 }}>
            {pr("yourCodesOnlyBody")}
          </Text>
        </View>
        {promotions.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 64 }}>
            <View style={{ marginBottom: 16, height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#ffedd5" }}>
              <Ionicons name="pricetag-outline" size={32} color="#f97316" />
            </View>
            <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900] }}>{pr("emptyTitle")}</Text>
            <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              {pr("emptyDesc")}
            </Text>
            <TouchableOpacity
              onPress={() => setCreateOpen(true)}
              style={{ marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#f97316", paddingHorizontal: 24, paddingVertical: 12 }}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={{ marginStart: 8, fontWeight: "500", color: Colors.white }}>{pr("newPromo")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => setCreateOpen(true)}
              style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", paddingVertical: 12 }}
            >
              <Ionicons name="add" size={18} color="#f97316" />
              <Text style={{ marginStart: 8, fontWeight: "500", color: "#c2410c" }}>{pr("newPromo")}</Text>
            </TouchableOpacity>
            {promotions.map((p) => (
            <View
              key={p.id}
              style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
            >
              <View style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#ffedd5" }}>
                <Ionicons name="pricetag-outline" size={20} color="#f97316" />
              </View>
              <View style={{ marginStart: 12, flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{p.code}</Text>
                <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }}>
                  {p.type === "percentage" ? pr("percentOff", { value: p.value }) : pr("amountOff", { amount: formatCurrency(Number(p.value)) })}
                  {p.description ? ` · ${p.description}` : ""}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                  {p.max_uses != null ? pr("usedCountMax", { count: p.uses_count, max: p.max_uses }) : pr("usedCount", { count: p.uses_count })}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: p.public_on_profile === false ? "#9a3412" : "#166534" }}>
                  {p.public_on_profile === false ? pr("hiddenOnProfile") : pr("visibleOnProfile")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => togglePublicOnProfile(p)}
                style={{
                  marginEnd: 8,
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
                  {p.public_on_profile === false ? pr("hidden") : pr("public")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => toggleActive(p)}
                style={{ marginEnd: 8, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: p.is_active ? "#dcfce7" : Colors.gray[100] }}
              >
                <Text style={{ fontSize: 12, fontWeight: "500", color: p.is_active ? "#166534" : Colors.gray[600] }}>
                  {p.is_active ? pr("on") : pr("off")}
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
        title={pr("sheetTitle")}
        subtitle={pr("sheetSubtitle")}
      >
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{pr("codeLabel")}</Text>
        <TextInput
          style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
          placeholder={pr("codePlaceholder")}
          placeholderTextColor="#9ca3af"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
        />
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{pr("type")}</Text>
        <View style={{ marginBottom: 16, flexDirection: "row" }}>
          <TouchableOpacity
            onPress={() => setPromoType("percentage")}
            style={{ flex: 1, marginEnd: 8, borderRadius: 12, paddingVertical: 10, backgroundColor: promoType === "percentage" ? "#f97316" : Colors.gray[100] }}
          >
            <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: promoType === "percentage" ? Colors.white : Colors.gray[700] }}>
              {pr("typePercentage")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPromoType("fixed_amount")}
            style={{ flex: 1, borderRadius: 12, paddingVertical: 10, backgroundColor: promoType === "fixed_amount" ? "#f97316" : Colors.gray[100] }}
          >
            <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: promoType === "fixed_amount" ? Colors.white : Colors.gray[700] }}>
              {pr("typeFixed")}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
          {promoType === "percentage" ? pr("valuePercent") : pr("valueCurrency", { currency: getTenantDefaultCurrency() })}
        </Text>
        <TextInput
          style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
          placeholder={promoType === "percentage" ? "20" : "50"}
          placeholderTextColor="#9ca3af"
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
        />
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{pr("descriptionOptional")}</Text>
        <TextInput
          style={{ marginBottom: 24, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
          placeholder={pr("descriptionPlaceholder")}
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
          accessibilityLabel={pr("showOnProfileA11y")}
        >
          <View style={{ flex: 1, paddingEnd: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{pr("showOnProfile")}</Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
              {pr("showOnProfileHint")}
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
          label={creating ? pr("creating") : pr("createCta")}
          onPress={handleCreate}
          loading={creating}
          fullWidth
        />
      </BottomSheet>
    </>
  );
}

export default function PromotionsScreen() {
  const { t } = useTranslation();
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={t("provider.mobile.screens.promotions.title") as string}
        showBack
        subtitle={t("provider.mobile.screens.promotions.subtitle") as string}
      />
      <PromotionsContent />
    </ScreenContainer>
  );
}
