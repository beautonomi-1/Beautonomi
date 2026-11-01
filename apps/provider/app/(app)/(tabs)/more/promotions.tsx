import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
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
  usage_count: number;
  usage_limit?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
  once_per_customer?: boolean;
  min_purchase_amount?: number | null;
  max_discount_amount?: number | null;
  location_id?: string | null;
}

type LocationItem = { id: string; name: string; location_type?: string };

type RedemptionRow = {
  client_name: string;
  booking_number: string | null;
  order_number: string | null;
  discount_amount: number;
  used_at: string;
};

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultEndYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return localYmd(d);
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
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
  const [detailPromo, setDetailPromo] = useState<Promotion | null>(null);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [promoType, setPromoType] = useState<"percentage" | "fixed_amount">("percentage");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [publicOnProfile, setPublicOnProfile] = useState(true);
  const [startDate, setStartDate] = useState(() => localYmd(new Date()));
  const [endDate, setEndDate] = useState(() => defaultEndYmd());
  const [noEndDate, setNoEndDate] = useState(false);
  const [usageLimit, setUsageLimit] = useState("");
  const [oncePerCustomer, setOncePerCustomer] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [totalDiscount, setTotalDiscount] = useState(0);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);
  const [minPurchase, setMinPurchase] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [locationId, setLocationId] = useState("");
  const [savingDetail, setSavingDetail] = useState(false);
  const [promoIsActive, setPromoIsActive] = useState(true);

  const { data, loading, error, refresh } = useApi<Promotion[]>("/api/provider/promotions");
  const { data: locationsData } = useApi<LocationItem[]>("/api/provider/locations");
  const salonLocations = useMemo(
    () =>
      (Array.isArray(locationsData) ? locationsData : []).filter(
        (l) => (l.location_type || "salon") !== "base",
      ),
    [locationsData],
  );
  const { execute: createPromo, loading: creating } = useApiMutation<Promotion>("post");
  const { execute: patchPromo } = useApiMutation("patch");
  const { execute: deletePromo } = useApiMutation("delete");

  const promotions: Promotion[] = Array.isArray(data) ? data : [];

  const resetForm = () => {
    setCode("");
    setValue("");
    setDescription("");
    setPublicOnProfile(true);
    setPromoType("percentage");
    setStartDate(localYmd(new Date()));
    setEndDate(defaultEndYmd());
    setNoEndDate(false);
    setUsageLimit("");
    setOncePerCustomer(false);
    setMinPurchase("");
    setMaxDiscount("");
    setLocationId("");
    setPromoIsActive(true);
    setLimitsOpen(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const buildPayload = (forCreate = true) => {
    const payload: Record<string, unknown> = {
      description: description.trim() || undefined,
      public_on_profile: publicOnProfile,
      start_date: startDate,
      once_per_customer: oncePerCustomer,
    };
    if (noEndDate) payload.no_end_date = true;
    else payload.end_date = endDate;
    if (forCreate) {
      if (usageLimit.trim()) payload.usage_limit = parseInt(usageLimit, 10);
      if (minPurchase.trim()) {
        payload.min_purchase_amount = parseFloat(minPurchase.replace(/,/g, "."));
      }
      if (maxDiscount.trim() && promoType === "percentage") {
        payload.max_discount_amount = parseFloat(maxDiscount.replace(/,/g, "."));
      }
      if (locationId) payload.location_id = locationId;
    } else {
      payload.usage_limit = usageLimit.trim() ? parseInt(usageLimit, 10) : null;
      payload.min_purchase_amount = minPurchase.trim()
        ? parseFloat(minPurchase.replace(/,/g, "."))
        : null;
      payload.max_discount_amount =
        promoType === "percentage"
          ? maxDiscount.trim()
            ? parseFloat(maxDiscount.replace(/,/g, "."))
            : null
          : null;
      payload.location_id = locationId || null;
      payload.is_active = promoIsActive;
    }
    return payload;
  };

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
    if (!noEndDate && endDate && startDate && endDate <= startDate) {
      Alert.alert(pr("errorTitle"), pr("endAfterStart"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await createPromo("/api/provider/promotions", {
      code: trimmedCode,
      type: promoType,
      value: numValue,
      ...buildPayload(),
    });
    if (err) {
      Alert.alert(pr("errorTitle"), err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCreateOpen(false);
    resetForm();
    refresh();
  }, [code, value, description, promoType, publicOnProfile, createPromo, refresh, startDate, endDate, noEndDate, usageLimit, oncePerCustomer]);

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
    [patchPromo, refresh, togglingId],
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
              if (err) {
                Alert.alert(
                  pr("errorTitle"),
                  err.includes("used") ? pr("deleteBlocked") : err,
                );
              } else refresh();
            });
          },
        },
      ]);
    },
    [deletePromo, refresh, pr],
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
    [patchPromo, refresh, togglingId],
  );

  const openDetail = (p: Promotion) => {
    if (createOpen) return;
    setDetailPromo(p);
    setPromoType(p.type === "percentage" ? "percentage" : "fixed_amount");
    setStartDate(p.start_date ?? localYmd(new Date()));
    setEndDate(p.end_date ?? defaultEndYmd());
    setNoEndDate(!p.end_date);
    setUsageLimit(p.usage_limit != null ? String(p.usage_limit) : "");
    setMinPurchase(p.min_purchase_amount != null ? String(p.min_purchase_amount) : "");
    setMaxDiscount(p.max_discount_amount != null ? String(p.max_discount_amount) : "");
    setOncePerCustomer(Boolean(p.once_per_customer));
    setLocationId(p.location_id ?? "");
    setPromoIsActive(p.is_active);
    setLimitsOpen(true);
  };

  const saveDetail = useCallback(async () => {
    if (!detailPromo) return;
    if (!noEndDate && endDate && startDate && endDate <= startDate) {
      Alert.alert(pr("errorTitle"), pr("endAfterStart"));
      return;
    }
    setSavingDetail(true);
    try {
      const { error: err } = await patchPromo(
        `/api/provider/promotions/${detailPromo.id}`,
        buildPayload(false),
      );
      if (err) {
        Alert.alert(pr("errorTitle"), err);
        return;
      }
      Alert.alert(pr("savedOk"));
      setDetailPromo(null);
      refresh();
    } finally {
      setSavingDetail(false);
    }
  }, [
    detailPromo,
    noEndDate,
    endDate,
    startDate,
    patchPromo,
    refresh,
    pr,
    locationId,
    buildPayload,
  ]);

  useEffect(() => {
    if (!detailPromo || createOpen) {
      setRedemptions([]);
      setTotalDiscount(0);
      return;
    }
    let cancelled = false;
    setRedemptionsLoading(true);
    void (async () => {
      try {
        const res = await api.get<{
          redemptions: RedemptionRow[];
          total_discount: number;
        }>(`/api/provider/promotions/${detailPromo.id}/redemptions`);
        if (cancelled) return;
        if (res.error) {
          setRedemptions([]);
          setTotalDiscount(0);
          return;
        }
        setRedemptions(res.data?.redemptions ?? []);
        setTotalDiscount(Number(res.data?.total_discount ?? 0));
      } catch {
        if (!cancelled) {
          setRedemptions([]);
          setTotalDiscount(0);
        }
      } finally {
        if (!cancelled) setRedemptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailPromo, createOpen]);

  const statusLabel = (p: Promotion) => {
    const s = p.status ?? (p.is_active ? "active" : "off");
    const keyMap: Record<string, string> = {
      active: "statusActive",
      scheduled: "statusScheduled",
      expired: "statusExpired",
      used_up: "statusUsedUp",
      off: "statusOff",
    };
    return pr(keyMap[s] ?? "statusOff");
  };

  const endLabel = (p: Promotion) =>
    p.end_date ? pr("endsLabel", { date: p.end_date }) : pr("noEndDate");

  const usageLine = (p: Promotion) =>
    p.usage_limit != null
      ? pr("usedCountMax", { count: p.usage_count, max: p.usage_limit })
      : pr("usedCount", { count: p.usage_count });

  const createSummaryLine = useMemo(() => {
    if (!createOpen) return "";
    const num = parseFloat(value.replace(/,/g, "."));
    const discount =
      promoType === "percentage" && !Number.isNaN(num) && value.trim()
        ? pr("percentOff", { value: num })
        : !Number.isNaN(num) && value.trim()
          ? pr("amountOff", { amount: formatCurrency(num) })
          : "—";
    const end = noEndDate ? pr("noEndDate") : endDate ? pr("endsLabel", { date: endDate }) : "—";
    let line = pr("summaryLine", { discount, end });
    if (oncePerCustomer) line += ` · ${pr("oncePerCustomer")}`;
    return line;
  }, [createOpen, promoType, value, noEndDate, endDate, oncePerCustomer, pr]);

  const limitsFields = (
    <>
      <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
        {pr("usageLimit")}
      </Text>
      <TextInput
        style={{
          marginBottom: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.gray[200],
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
        placeholder={pr("usageLimitPlaceholder")}
        placeholderTextColor="#9ca3af"
        value={usageLimit}
        onChangeText={setUsageLimit}
        keyboardType="number-pad"
      />
      <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
        {pr("minPurchase")}
      </Text>
      <TextInput
        style={{
          marginBottom: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.gray[200],
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
        value={minPurchase}
        onChangeText={setMinPurchase}
        keyboardType="decimal-pad"
      />
      {promoType === "percentage" ? (
        <>
          <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
            {pr("maxDiscount")}
          </Text>
          <TextInput
            style={{
              marginBottom: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[200],
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
            value={maxDiscount}
            onChangeText={setMaxDiscount}
            keyboardType="decimal-pad"
          />
        </>
      ) : null}
      <TouchableOpacity
        onPress={() => setOncePerCustomer((v) => !v)}
        style={{ marginBottom: 16, flexDirection: "row", alignItems: "center" }}
      >
        <Ionicons
          name={oncePerCustomer ? "checkbox" : "square-outline"}
          size={20}
          color={oncePerCustomer ? "#f97316" : Colors.gray[400]}
        />
        <Text style={{ marginStart: 8, fontSize: 14, color: Colors.gray[700] }}>{pr("oncePerCustomer")}</Text>
      </TouchableOpacity>
      {salonLocations.length > 1 ? (
        <>
          <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
            {pr("branch")}
          </Text>
          <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] }}>
            <TouchableOpacity
              onPress={() => setLocationId("")}
              style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: !locationId ? "#ffedd5" : Colors.white }}
            >
              <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{pr("branchAll")}</Text>
            </TouchableOpacity>
            {salonLocations.map((loc) => (
              <TouchableOpacity
                key={loc.id}
                onPress={() => setLocationId(loc.id)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: locationId === loc.id ? "#ffedd5" : Colors.white,
                  borderTopWidth: 1,
                  borderTopColor: Colors.gray[100],
                }}
              >
                <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{loc.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
    </>
  );

  const dateFields = (
    <>
      <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
        {pr("startsOn")}
      </Text>
      <TouchableOpacity
        onPress={() => setShowStartPicker(true)}
        style={{
          marginBottom: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.gray[200],
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: Colors.gray[900] }}>{startDate}</Text>
      </TouchableOpacity>
      {showStartPicker ? (
        <DateTimePicker
          value={ymdToDate(startDate)}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, d) => {
            setShowStartPicker(Platform.OS === "ios");
            if (d) setStartDate(localYmd(d));
          }}
        />
      ) : null}
      <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
        {pr("endsOn")}
      </Text>
      <TouchableOpacity
        onPress={() => !noEndDate && setShowEndPicker(true)}
        disabled={noEndDate}
        style={{
          marginBottom: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.gray[200],
          paddingHorizontal: 16,
          paddingVertical: 12,
          opacity: noEndDate ? 0.5 : 1,
        }}
      >
        <Text style={{ color: Colors.gray[900] }}>{noEndDate ? pr("noEndDate") : endDate}</Text>
      </TouchableOpacity>
      {showEndPicker && !noEndDate ? (
        <DateTimePicker
          value={ymdToDate(endDate)}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, d) => {
            setShowEndPicker(Platform.OS === "ios");
            if (d) setEndDate(localYmd(d));
          }}
        />
      ) : null}
      <TouchableOpacity
        onPress={() => setNoEndDate((v) => !v)}
        style={{ marginBottom: 16, flexDirection: "row", alignItems: "center" }}
      >
        <Ionicons
          name={noEndDate ? "checkbox" : "square-outline"}
          size={20}
          color={noEndDate ? "#f97316" : Colors.gray[400]}
        />
        <Text style={{ marginStart: 8, fontSize: 14, color: Colors.gray[700] }}>{pr("noEndDate")}</Text>
      </TouchableOpacity>
    </>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#1e3a8a", marginBottom: 6 }}>
            {pr("yourCodesOnly")}
          </Text>
          <Text style={{ fontSize: 12, color: "#1e40af", lineHeight: 17 }}>{pr("yourCodesOnlyBody")}</Text>
        </View>
        {promotions.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 64 }}>
            <View
              style={{
                marginBottom: 16,
                height: 64,
                width: 64,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9999,
                backgroundColor: "#ffedd5",
              }}
            >
              <Ionicons name="pricetag-outline" size={32} color="#f97316" />
            </View>
            <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900] }}>
              {pr("emptyTitle")}
            </Text>
            <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              {pr("emptyDesc")}
            </Text>
            <TouchableOpacity
              onPress={() => {
                resetForm();
                setCreateOpen(true);
              }}
              style={{
                marginTop: 24,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: "#f97316",
                paddingHorizontal: 24,
                paddingVertical: 12,
              }}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={{ marginStart: 8, fontWeight: "500", color: Colors.white }}>{pr("newPromo")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => {
                resetForm();
                setCreateOpen(true);
              }}
              style={{
                marginBottom: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#fed7aa",
                backgroundColor: "#fff7ed",
                paddingVertical: 12,
              }}
            >
              <Ionicons name="add" size={18} color="#f97316" />
              <Text style={{ marginStart: 8, fontWeight: "500", color: "#c2410c" }}>{pr("newPromo")}</Text>
            </TouchableOpacity>
            {promotions.map((p) => (
              <View
                key={p.id}
                style={{
                  marginBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  backgroundColor: Colors.white,
                  padding: 16,
                }}
              >
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 }}
                  onPress={() => openDetail(p)}
                  accessibilityLabel={pr("viewDetails")}
                >
                  <View
                    style={{
                      height: 40,
                      width: 40,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 12,
                      backgroundColor: "#ffedd5",
                    }}
                  >
                    <Ionicons name="pricetag-outline" size={20} color="#f97316" />
                  </View>
                  <View style={{ marginStart: 12, flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{p.code}</Text>
                    <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }}>
                      {p.type === "percentage"
                        ? pr("percentOff", { value: p.value })
                        : pr("amountOff", { amount: formatCurrency(Number(p.value)) })}
                    </Text>
                    <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                      {endLabel(p)} · {usageLine(p)}
                    </Text>
                    <Text style={{ marginTop: 2, fontSize: 11, color: Colors.gray[500] }}>
                      {statusLabel(p)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => togglePublicOnProfile(p)}
                  style={{
                    marginStart: 8,
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
                  style={{
                    marginEnd: 8,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor: p.is_active ? "#dcfce7" : Colors.gray[100],
                  }}
                >
                  <Text
                    style={{ fontSize: 12, fontWeight: "500", color: p.is_active ? "#166534" : Colors.gray[600] }}
                  >
                    {p.is_active ? pr("on") : pr("off")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(p)}
                  style={{
                    height: 36,
                    width: 36,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    backgroundColor: "#fee2e2",
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <BottomSheet visible={createOpen && !detailPromo} onClose={() => setCreateOpen(false)} title={pr("sheetTitle")} subtitle={pr("sheetSubtitle")}>
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{pr("codeLabel")}</Text>
        <TextInput
          style={{
            marginBottom: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.gray[50],
            paddingHorizontal: 16,
            paddingVertical: 12,
            fontSize: 16,
            color: Colors.gray[900],
          }}
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
            style={{
              flex: 1,
              marginEnd: 8,
              borderRadius: 12,
              paddingVertical: 10,
              backgroundColor: promoType === "percentage" ? "#f97316" : Colors.gray[100],
            }}
          >
            <Text
              style={{
                textAlign: "center",
                fontSize: 14,
                fontWeight: "500",
                color: promoType === "percentage" ? Colors.white : Colors.gray[700],
              }}
            >
              {pr("typePercentage")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPromoType("fixed_amount")}
            style={{
              flex: 1,
              borderRadius: 12,
              paddingVertical: 10,
              backgroundColor: promoType === "fixed_amount" ? "#f97316" : Colors.gray[100],
            }}
          >
            <Text
              style={{
                textAlign: "center",
                fontSize: 14,
                fontWeight: "500",
                color: promoType === "fixed_amount" ? Colors.white : Colors.gray[700],
              }}
            >
              {pr("typeFixed")}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
          {promoType === "percentage" ? pr("valuePercent") : pr("valueCurrency", { currency: getTenantDefaultCurrency() })}
        </Text>
        <TextInput
          style={{
            marginBottom: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.gray[50],
            paddingHorizontal: 16,
            paddingVertical: 12,
            fontSize: 16,
            color: Colors.gray[900],
          }}
          placeholder={promoType === "percentage" ? "20" : "50"}
          placeholderTextColor="#9ca3af"
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
        />
        {createSummaryLine ? (
          <Text style={{ marginBottom: 12, fontSize: 13, color: Colors.gray[600] }}>{createSummaryLine}</Text>
        ) : null}
        {dateFields}
        <TouchableOpacity onPress={() => setLimitsOpen((v) => !v)} style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#c2410c" }}>
            {pr("limitsSection")} {limitsOpen ? "▾" : "▸"}
          </Text>
        </TouchableOpacity>
        {limitsOpen ? limitsFields : null}
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
          {pr("descriptionOptional")}
        </Text>
        <TextInput
          style={{
            marginBottom: 24,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.gray[50],
            paddingHorizontal: 16,
            paddingVertical: 12,
            fontSize: 16,
            color: Colors.gray[900],
          }}
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
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{pr("showOnProfile")}</Text>
          <Ionicons
            name={publicOnProfile ? "checkmark-circle" : "ellipse-outline"}
            size={22}
            color={publicOnProfile ? "#16a34a" : Colors.gray[300]}
          />
        </TouchableOpacity>
        <ActionButton label={creating ? pr("creating") : pr("createCta")} onPress={handleCreate} loading={creating} fullWidth />
      </BottomSheet>

      <BottomSheet
        visible={!!detailPromo && !createOpen}
        onClose={() => setDetailPromo(null)}
        title={detailPromo?.code ?? pr("detailTitle")}
      >
        {detailPromo ? (
          <>
            <TouchableOpacity
              onPress={async () => {
                await Clipboard.setStringAsync(detailPromo.code);
                Alert.alert(pr("copied"));
              }}
              style={{ marginBottom: 16, flexDirection: "row", alignItems: "center" }}
            >
              <Ionicons name="copy-outline" size={18} color="#f97316" />
              <Text style={{ marginStart: 8, color: "#c2410c", fontWeight: "500" }}>{pr("copyCode")}</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 14, color: Colors.gray[700], marginBottom: 8 }}>
              {detailPromo.type === "percentage"
                ? pr("percentOff", { value: detailPromo.value })
                : pr("amountOff", { amount: formatCurrency(detailPromo.value) })}
            </Text>
            <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 12 }}>{usageLine(detailPromo)}</Text>
            <TouchableOpacity
              onPress={() => setPromoIsActive((v) => !v)}
              style={{
                marginBottom: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                {promoIsActive ? pr("statusActive") : pr("statusOff")}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: promoIsActive ? "#166534" : Colors.gray[600] }}>
                {promoIsActive ? pr("on") : pr("off")}
              </Text>
            </TouchableOpacity>
            {dateFields}
            <Text style={{ marginTop: 8, marginBottom: 8, fontSize: 14, fontWeight: "600", color: "#c2410c" }}>
              {pr("limitsSection")}
            </Text>
            {limitsFields}
            <ActionButton
              label={savingDetail ? pr("creating") : pr("saveChanges")}
              onPress={() => void saveDetail()}
              loading={savingDetail}
              fullWidth
            />
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginTop: 16, marginBottom: 8 }}>
              {pr("redemptions")}
            </Text>
            {redemptionsLoading ? (
              <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 16 }}>{pr("loading")}</Text>
            ) : redemptions.length === 0 ? (
              <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 16 }}>{pr("noRedemptions")}</Text>
            ) : (
              <>
                <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 8 }}>
                  {pr("totalDiscountGiven", { amount: formatCurrency(totalDiscount) })}
                </Text>
                {redemptions.map((r, i) => (
                  <View
                    key={`${r.used_at}-${i}`}
                    style={{
                      marginBottom: 8,
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.gray[100],
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[800] }}>
                      {r.client_name}
                      {r.booking_number
                        ? ` · ${pr("redemptionBooking", { number: r.booking_number })}`
                        : r.order_number
                          ? ` · ${pr("redemptionOrder", { number: r.order_number })}`
                          : ""}
                    </Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                      {formatCurrency(r.discount_amount)} · {r.used_at.slice(0, 10)}
                    </Text>
                  </View>
                ))}
              </>
            )}
            {detailPromo.usage_count === 0 ? (
              <ActionButton
                label={pr("delete")}
                onPress={() => handleDelete(detailPromo)}
                variant="danger"
                fullWidth
              />
            ) : null}
          </>
        ) : null}
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
