import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert, ScrollView, Platform, Switch, ActivityIndicator } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenFrame } from "@/components/ScreenFrame";
import { BookingCardSkeleton } from "@/components/Skeleton";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";

type ProviderMembership = {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_slug: string | null;
  plan_id: string;
  plan_name: string;
  plan_description: string | null;
  discount_percent: number;
  price_monthly: number;
  currency: string;
  status: string;
  expires_at: string | null;
  started_at: string;
  auto_renew: boolean;
  next_billing_at: string | null;
  last_payment_at: string | null;
  past_due_since: string | null;
  paused_until?: string | null;
  scheduled_plan_id?: string | null;
  scheduled_plan_name?: string | null;
  scheduled_change_at?: string | null;
  renewal_payment_method_missing?: boolean;
  card: { last4: string; brand: string; exp: string } | null;
};

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function cardLabel(card: { last4: string; brand: string; exp: string } | null): string {
  if (!card) return "";
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Card";
  return `${brand} •••• ${card.last4}  exp. ${card.exp}`;
}

export default function MembershipScreen() {
  const { t } = useTranslation();
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const mem = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.membership.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancellingSalonId, setCancellingSalonId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [updatingCardId, setUpdatingCardId] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/membership");
      if (res.error) setError(getApiErrorMessage(res.error, mem("loadFailed")));
      else setData(res.data);
    } catch (e) {
      setError(getApiErrorMessage(e as Error, mem("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [mem]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const cancelMembership = () => {
    Alert.alert(mem("cancelMembershipTitle"), mem("cancelMembershipBody"), [
      { text: mem("keepMembershipCta"), style: "cancel" },
      {
        text: mem("endMembershipCta"),
        style: "destructive",
        onPress: async () => {
          setCancelling(true);
          try {
            const res = await api.post<{ cancelled?: boolean; message?: string }>(
              "/api/me/membership/cancel",
              {},
            );
            if (res.error) {
              Alert.alert(errTitle, getApiErrorMessage(res.error, mem("cancelFailed")));
            } else if (res.data?.cancelled) {
              await load();
              Alert.alert(mem("cancelSuccessTitle"), mem("cancelSuccessBody"));
            } else {
              await load();
              Alert.alert(mem("cancelNothingTitle"), mem("cancelNothingBody"));
            }
          } catch (e) {
            Alert.alert(errTitle, getApiErrorMessage(e as Error, mem("cancelFailed")));
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const cancelSalonMembership = (membership: ProviderMembership) => {
    Alert.alert(
      mem("cancelSalonTitle"),
      mem("cancelSalonBody", { planName: membership.plan_name, providerName: membership.provider_name }),
      [
        { text: mem("keepMembershipCta"), style: "cancel" },
        {
          text: mem("endMembershipCta"),
          style: "destructive",
          onPress: async () => {
            setCancellingSalonId(membership.id);
            try {
              const res = await api.post<{ cancelled?: boolean; message?: string }>(
                "/api/me/membership/cancel",
                { provider_membership_id: membership.id },
              );
              if (res.error) {
                Alert.alert(errTitle, getApiErrorMessage(res.error, mem("cancelFailed")));
              } else if (res.data?.cancelled) {
                await load();
                Alert.alert(
                  mem("cancelSalonSuccessTitle"),
                  mem("cancelSalonSuccessBody", {
                    planName: membership.plan_name,
                    providerName: membership.provider_name,
                  }),
                );
              } else {
                await load();
                Alert.alert(mem("cancelNothingTitle"), mem("cancelNothingBody"));
              }
            } catch (e) {
              Alert.alert(errTitle, getApiErrorMessage(e as Error, mem("cancelFailed")));
            } finally {
              setCancellingSalonId(null);
            }
          },
        },
      ],
    );
  };

  const toggleAutoRenew = async (membership: ProviderMembership, newValue: boolean) => {
    if (newValue && !membership.card) {
      Alert.alert(mem("noPaymentCardTitle"), mem("noPaymentCardBody"));
      return;
    }
    setTogglingId(membership.id);
    try {
      const res = await api.post<{ success?: boolean; auto_renew?: boolean; message?: string; code?: string }>(
        "/api/me/membership/auto-renew",
        { membership_id: membership.id, auto_renew: newValue },
      );
      if (res.error || !res.data?.success) {
        const msg = res.data?.message ?? getApiErrorMessage(res.error, mem("autoRenewUpdateFailed"));
        Alert.alert(errTitle, msg);
      } else {
        await load();
      }
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, mem("autoRenewUpdateFailed")));
    } finally {
      setTogglingId(null);
    }
  };

  const updateMembershipCard = async (membership: ProviderMembership) => {
    setUpdatingCardId(membership.id);
    try {
      const cardsRes = await api.get<Array<{ id: string; last4?: string; card_type?: string; expiry_label?: string; is_expired?: boolean }>>(
        "/api/me/payment-methods",
      );
      if (cardsRes.error) {
        Alert.alert(errTitle, getApiErrorMessage(cardsRes.error, mem("loadCardsFailed")));
        return;
      }
      const cards = Array.isArray(cardsRes.data) ? cardsRes.data : [];
      const usable = cards.filter((c) => !c.is_expired);
      if (usable.length === 0) {
        Alert.alert(
          mem("noSavedCardsTitle"),
          mem("noSavedCardsBody"),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: mem("paymentMethodsCta"),
              onPress: () => router.push("/(app)/account-settings/payments" as never),
            },
          ],
        );
        return;
      }
      Alert.alert(
        membership.status === "past_due" ? mem("updatePaymentCardTitle") : mem("changePaymentCardTitle"),
        mem("chooseCardBody", { providerName: membership.provider_name }),
        [
          { text: t("common.cancel"), style: "cancel" },
          ...usable.map((card) => ({
            text: `${(card.card_type ?? "Card").toUpperCase()} •••• ${card.last4 ?? "****"}${card.expiry_label ? ` (${card.expiry_label})` : ""}`,
            onPress: async () => {
              const res = await api.post<{ success?: boolean; message?: string }>(
                "/api/me/membership/payment-method",
                { membership_id: membership.id, payment_method_id: card.id },
              );
              if (res.error || !res.data?.success) {
                Alert.alert(errTitle, res.data?.message ?? getApiErrorMessage(res.error, mem("updateCardFailed")));
              } else {
                await load();
                Alert.alert(mem("doneTitle"), mem("updateCardSuccess"));
              }
            },
          })),
          {
            text: mem("addNewCardCta"),
            onPress: () => router.push("/(app)/account-settings/payments" as never),
          },
        ],
      );
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, mem("updateCardFailed")));
    } finally {
      setUpdatingCardId(null);
    }
  };

  const pauseOrResume = (membership: ProviderMembership) => {
    const paused = membership.status === "paused";
    const run = async () => {
      setPausingId(membership.id);
      try {
        const res = paused
          ? await api.post<{ resumed?: boolean; message?: string }>(
              "/api/me/membership/resume",
              { provider_membership_id: membership.id },
            )
          : await api.post<{ paused?: boolean; message?: string }>(
              "/api/me/membership/pause",
              { provider_membership_id: membership.id },
            );
        if (res.error) {
          Alert.alert(errTitle, getApiErrorMessage(res.error, mem("failedToUpdateMembership")));
        } else {
          await load();
        }
      } catch (e) {
        Alert.alert(errTitle, getApiErrorMessage(e as Error, mem("failedToUpdateMembership")));
      } finally {
        setPausingId(null);
      }
    };
    if (paused) {
      void run();
      return;
    }
    Alert.alert(
      mem("pauseMembershipTitle"),
      mem("pauseMembershipBody", { planName: membership.plan_name, providerName: membership.provider_name }),
      [
        { text: mem("keepActiveCta"), style: "cancel" },
        { text: mem("pauseCta"), onPress: () => void run() },
      ],
    );
  };

  const changePlan = async (membership: ProviderMembership) => {
    if (membership.auto_renew !== true) {
      Alert.alert(mem("changePlanTitle"), mem("changePlanAutoRenewFirst"));
      return;
    }
    if (!membership.provider_slug) {
      Alert.alert(mem("changePlanTitle"), mem("changePlanNoPublicProfile"));
      return;
    }
    try {
      const res = await api.get<{ plans?: Array<{ id: string; name: string; price_monthly?: number; price?: number; currency?: string }> }>(
        `/api/public/providers/${membership.provider_slug}/membership-plans`,
      );
      const plans = Array.isArray(res.data?.plans) ? res.data.plans : [];
      if (plans.length === 0) {
        Alert.alert(mem("changePlanTitle"), mem("changePlanNoOtherPlans"));
        return;
      }
      Alert.alert(
        mem("changePlanTitle"),
        mem("changePlanChooseBody"),
        [
          { text: t("common.cancel"), style: "cancel" },
          ...plans.map((plan) => ({
            text: `${plan.name}${plan.id === membership.plan_id ? mem("currentPlanSuffix") : ""}`,
            onPress: async () => {
              const change = await api.post<{ scheduled?: boolean; cleared?: boolean }>(
                "/api/me/membership/change-plan",
                { provider_membership_id: membership.id, plan_id: plan.id },
              );
              if (change.error) {
                Alert.alert(errTitle, getApiErrorMessage(change.error, mem("failedToSchedulePlanChange")));
              } else {
                await load();
                Alert.alert(mem("doneTitle"), change.data?.cleared ? mem("scheduledChangeCleared") : mem("planChangeScheduled"));
              }
            },
          })),
        ],
      );
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, mem("failedToLoadPlans")));
    }
  };

  const openUsage = async (membership: ProviderMembership) => {
    try {
      const res = await api.get<{
        booking_count?: number;
        discount_total?: number;
        bookings?: Array<{ booking_number?: string | null; membership_discount_amount?: number; currency?: string }>;
      }>(`/api/me/membership/usage?provider_membership_id=${encodeURIComponent(membership.id)}`);
      if (res.error) {
        Alert.alert(errTitle, getApiErrorMessage(res.error, mem("failedToLoadUsage")));
        return;
      }
      const bookings = Array.isArray(res.data?.bookings) ? res.data.bookings : [];
      const total = Number(res.data?.discount_total ?? 0);
      const count = Number(res.data?.booking_count ?? bookings.length);
      const lines = bookings.slice(0, 8).map((b) => {
        const amt = Number(b.membership_discount_amount ?? 0);
        return `${b.booking_number ?? mem("bookingFallback")} · ${membership.currency} ${amt.toFixed(2)}`;
      });
      Alert.alert(
        mem("membershipUsageTitle"),
        [
          count === 1 ? mem("usageBookingsCountOne") : mem("usageBookingsCount", { count: String(count) }),
          mem("usageSaved", { currency: membership.currency, amount: total.toFixed(2) }),
          lines.length > 0 ? `\n${lines.join("\n")}` : "",
          bookings.length > 8 ? `\n${mem("usageMore", { count: String(bookings.length - 8) })}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, mem("failedToLoadUsage")));
    }
  };

  const hasMembership = data?.has_membership && data?.membership;
  const membership = data?.membership;
  const benefits = data?.benefits ?? [];
  const savings = data?.savings ?? { this_month: 0, lifetime: 0 };
  const savingsCurrency =
    (typeof data?.savings_currency === "string" && data.savings_currency) ||
    membership?.currency ||
    getTenantDefaultCurrency();
  const providerMemberships: ProviderMembership[] = Array.isArray(data?.provider_memberships) ? data.provider_memberships : [];
  const hasSalonMemberships = providerMemberships.length > 0;

  return (
    <ScreenFrame
      loading={loading}
      error={error}
      onRetry={load}
      skeleton={
        <View>
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </View>
      }
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
        {hasMembership ? (
          <View>
            <View style={{ backgroundColor: "#FDF2F8", borderRadius: 16, padding: 16 }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>{mem("activeMembershipLabel")}</Text>
              <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], marginTop: 4 }}>{membership?.name}</Text>
              {membership?.description && (
                <Text style={{ color: Colors.gray[700], marginTop: 8 }}>{membership.description}</Text>
              )}
              <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 8 }}>
                {membership?.billing_cycle === "yearly" ? mem("billedYearly") : mem("billedMonthly")}
                {membership?.expires_at && mem("renewsSuffix", { date: formatDateSafe(membership.expires_at) })}
              </Text>
            </View>
            {benefits.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>{mem("benefitsTitle")}</Text>
                {benefits.map((b: any, i: number) => (
                  <View key={i} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 12, marginBottom: 8 }}>
                    <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{b.name}</Text>
                    {b.description && <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 2 }}>{b.description}</Text>}
                  </View>
                ))}
              </View>
            )}
            {(savings.this_month > 0 || savings.lifetime > 0) && (
              <View style={{ backgroundColor: "#F0FDF4", borderRadius: 12, padding: 16, marginTop: 16 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{mem("yourSavingsTitle")}</Text>
                <Text style={{ color: Colors.gray[700], marginTop: 4 }}>
                  {mem("thisMonthLabel", { currency: savingsCurrency, amount: (savings.this_month?.toFixed(2) ?? "0.00") })}
                </Text>
                <Text style={{ color: Colors.gray[700] }}>{mem("lifetimeLabel", { currency: savingsCurrency, amount: (savings.lifetime?.toFixed(2) ?? "0.00") })}</Text>
              </View>
            )}
            {membership?.auto_renew !== false && (
              <TouchableOpacity
                onPress={cancelMembership}
                disabled={cancelling}
                style={{ marginTop: 16, paddingVertical: 12, borderWidth: 1, borderColor: "#EF4444", borderRadius: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#DC2626", fontWeight: "500" }}>{cancelling ? mem("cancelling") : mem("cancelMembershipCta")}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : hasSalonMemberships ? (
          <View>
            <View style={{ backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16 }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>{mem("noPlatformMembership")}</Text>
              <Text style={{ color: Colors.gray[700], marginTop: 4 }}>
                {mem("noPlatformMembershipBody")}
              </Text>
            </View>
          </View>
        ) : null}

        {hasSalonMemberships && (
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>{mem("salonMembershipsTitle")}</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12 }}>
              {mem("salonMembershipsBody")}
            </Text>
            {providerMemberships.map((pm) => {
              const isPastDue = pm.status === "past_due";
              const isPaused = pm.status === "paused";
              const needsRenewalCard = pm.renewal_payment_method_missing === true && !isPastDue && !isPaused;
              const cardBorderColor = isPastDue
                ? "#EF4444"
                : needsRenewalCard
                  ? "#F59E0B"
                  : isPaused
                    ? "#94A3B8"
                    : Colors.gray[100];

              return (
                <View
                  key={pm.id}
                  style={{
                    backgroundColor: Colors.white,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: isPastDue || needsRenewalCard || isPaused ? 1.5 : 1,
                    borderColor: cardBorderColor,
                  }}
                >
                  {isPaused && (
                    <View style={{ backgroundColor: "#F8FAFC", borderRadius: 10, padding: 10, marginBottom: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <Ionicons name="pause-circle-outline" size={18} color="#475569" style={{ marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "600", color: "#334155", fontSize: 13 }}>{mem("pausedLabel")}</Text>
                        <Text style={{ color: "#475569", fontSize: 13, marginTop: 2 }}>
                          {mem("pausedBody", { until: pm.paused_until ? mem("pausedUntilSuffix", { date: formatDateSafe(pm.paused_until) }) : "" })}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Dunning banner */}
                  {isPastDue && (
                    <View style={{ backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <Ionicons name="alert-circle-outline" size={18} color="#DC2626" style={{ marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "600", color: "#DC2626", fontSize: 13 }}>{mem("dunningBannerTitle")}</Text>
                        <Text style={{ color: "#DC2626", fontSize: 13, marginTop: 2 }}>{mem("dunningBannerBody", { planName: pm.plan_name })}</Text>
                        <Text style={{ color: "#DC2626", fontSize: 12, marginTop: 2 }}>{mem("gracePeriodNote")}</Text>
                      </View>
                    </View>
                  )}

                  {/* Missing renewal card banner (membership active, no saved card) */}
                  {needsRenewalCard && (
                    <View style={{ backgroundColor: "#FFFBEB", borderRadius: 10, padding: 10, marginBottom: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <Ionicons name="card-outline" size={18} color="#B45309" style={{ marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "600", color: "#B45309", fontSize: 13 }}>{mem("addPaymentMethodTitle")}</Text>
                        <Text style={{ color: "#B45309", fontSize: 13, marginTop: 2 }}>
                          {mem("addPaymentMethodBody", {
                            planName: pm.plan_name,
                            when: pm.next_billing_at ? mem("addPaymentWhenBefore", { date: formatDateSafe(pm.next_billing_at) }) : mem("addPaymentWhenSoon"),
                          })}
                        </Text>
                      </View>
                    </View>
                  )}

                  <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>{pm.provider_name}</Text>
                  <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[800], marginTop: 4 }}>{pm.plan_name}</Text>
                  {pm.plan_description ? (
                    <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 4 }} numberOfLines={2}>{pm.plan_description}</Text>
                  ) : null}

                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 12 }}>
                    {pm.discount_percent > 0 && (
                      <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "600" }}>{mem("discountOffServices", { percent: String(pm.discount_percent) })}</Text>
                    )}
                    {pm.scheduled_plan_id ? (
                      <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
                        {mem("changesToPlan", { planName: pm.scheduled_plan_name ?? "the selected plan" })}{" "}
                        {pm.scheduled_change_at ? formatDateSafe(pm.scheduled_change_at) : mem("atPeriodEnd")}
                      </Text>
                    ) : null}
                    {pm.auto_renew && pm.next_billing_at ? (
                      <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
                        {mem("renewsLabel")} {formatDateSafe(pm.next_billing_at)}
                      </Text>
                    ) : pm.expires_at ? (
                      <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
                        {mem("expiresLabel")} {formatDateSafe(pm.expires_at)}
                      </Text>
                    ) : null}
                  </View>

                  {/* Auto-renew toggle */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.gray[100] }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[800] }}>{mem("autoRenewLabel")}</Text>
                    {togglingId === pm.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Switch
                        value={pm.auto_renew}
                        onValueChange={(v) => toggleAutoRenew(pm, v)}
                        trackColor={{ false: Colors.gray[300], true: Colors.primary }}
                        thumbColor={Colors.white}
                      />
                    )}
                  </View>

                  {/* Card info + update */}
                  {pm.card ? (
                    <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="card-outline" size={16} color={Colors.gray[500]} />
                      <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{cardLabel(pm.card)}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => updateMembershipCard(pm)}
                    disabled={updatingCardId === pm.id}
                    style={{ marginTop: 8 }}
                  >
                    <Text style={{ fontSize: 13, color: isPastDue ? "#DC2626" : Colors.primary, fontWeight: "600" }}>
                      {updatingCardId === pm.id
                        ? mem("loadingCards")
                        : isPastDue
                          ? mem("updatePaymentCardTitle")
                          : mem("changePaymentCardTitle")}
                    </Text>
                  </TouchableOpacity>

                  {/* Billing history link */}
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/(app)/account-settings/membership-billing-history",
                        params: {
                          membership_id: pm.id,
                          provider_id: pm.provider_id,
                          provider_name: pm.provider_name,
                          plan_id: pm.plan_id,
                        },
                      })
                    }
                    style={{ marginTop: 8 }}
                  >
                    <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>{mem("billingHistoryTitle")} →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void openUsage(pm)} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>{mem("usageHistoryLink")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void changePlan(pm)} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>{mem("changePlanLink")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => pauseOrResume(pm)}
                    disabled={pausingId === pm.id}
                    style={{ marginTop: 8 }}
                  >
                    <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>
                      {pausingId === pm.id ? mem("saving") : isPaused ? mem("resumeMembership") : mem("pauseMembershipCta")}
                    </Text>
                  </TouchableOpacity>

                  {pm.provider_slug && (
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: "/(app)/partner-profile", params: { slug: pm.provider_slug } })}
                      accessibilityRole="button"
                      accessibilityLabel={mem("viewProviderA11y", { name: pm.provider_name })}
                      style={{ marginTop: 4 }}
                    >
                      <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>{mem("viewProviderLink")}</Text>
                    </TouchableOpacity>
                  )}

                  {pm.status !== "cancelled" && (
                    <TouchableOpacity
                      onPress={() => cancelSalonMembership(pm)}
                      disabled={cancellingSalonId === pm.id}
                      accessibilityRole="button"
                      accessibilityLabel={mem("cancelSalonMembershipA11y", { planName: pm.plan_name, providerName: pm.provider_name })}
                      style={{
                        marginTop: 12,
                        paddingVertical: 10,
                        borderWidth: 1,
                        borderColor: "#EF4444",
                        borderRadius: 12,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#DC2626", fontWeight: "500" }}>
                        {cancellingSalonId === pm.id ? mem("cancelling") : mem("cancelSalonMembershipCta")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {!hasMembership && !hasSalonMemberships && (
          <View style={{ marginTop: 16 }}>
            <View style={{ backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16 }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>{mem("noMembershipsYet")}</Text>
              <Text style={{ color: Colors.gray[700], marginTop: 4 }}>
                {mem("noMembershipsBody")}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}
