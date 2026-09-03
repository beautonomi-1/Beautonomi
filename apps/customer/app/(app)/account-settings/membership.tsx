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
      Alert.alert("No payment card", "Please add a payment card in Payment Methods before enabling auto-renew.");
      return;
    }
    setTogglingId(membership.id);
    try {
      const res = await api.post<{ success?: boolean; auto_renew?: boolean; message?: string; code?: string }>(
        "/api/me/membership/auto-renew",
        { membership_id: membership.id, auto_renew: newValue },
      );
      if (res.error || !res.data?.success) {
        const msg = res.data?.message ?? getApiErrorMessage(res.error, "Failed to update auto-renew");
        Alert.alert("Error", msg);
      } else {
        await load();
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e as Error, "Failed to update auto-renew"));
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
        Alert.alert("Error", getApiErrorMessage(cardsRes.error, "Could not load saved cards"));
        return;
      }
      const cards = Array.isArray(cardsRes.data) ? cardsRes.data : [];
      const usable = cards.filter((c) => !c.is_expired);
      if (usable.length === 0) {
        Alert.alert(
          "No saved cards",
          "Add a payment card in Payment Methods, then return here to update your membership billing.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Payment Methods",
              onPress: () => router.push("/(app)/account-settings/payments" as never),
            },
          ],
        );
        return;
      }
      Alert.alert(
        membership.status === "past_due" ? "Update payment card" : "Change payment card",
        `Choose a card for ${membership.provider_name}.`,
        [
          { text: "Cancel", style: "cancel" },
          ...usable.map((card) => ({
            text: `${(card.card_type ?? "Card").toUpperCase()} •••• ${card.last4 ?? "****"}${card.expiry_label ? ` (${card.expiry_label})` : ""}`,
            onPress: async () => {
              const res = await api.post<{ success?: boolean; message?: string }>(
                "/api/me/membership/payment-method",
                { membership_id: membership.id, payment_method_id: card.id },
              );
              if (res.error || !res.data?.success) {
                Alert.alert("Error", res.data?.message ?? getApiErrorMessage(res.error, "Failed to update card"));
              } else {
                await load();
                Alert.alert("Done", "Payment card updated.");
              }
            },
          })),
          {
            text: "Add new card",
            onPress: () => router.push("/(app)/account-settings/payments" as never),
          },
        ],
      );
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e as Error, "Failed to update card"));
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
          Alert.alert(errTitle, getApiErrorMessage(res.error, "Failed to update membership"));
        } else {
          await load();
        }
      } catch (e) {
        Alert.alert(errTitle, getApiErrorMessage(e as Error, "Failed to update membership"));
      } finally {
        setPausingId(null);
      }
    };
    if (paused) {
      void run();
      return;
    }
    Alert.alert(
      "Pause membership",
      `Pause ${membership.plan_name} with ${membership.provider_name}? Auto-renew will turn off.`,
      [
        { text: "Keep active", style: "cancel" },
        { text: "Pause", onPress: () => void run() },
      ],
    );
  };

  const changePlan = async (membership: ProviderMembership) => {
    if (membership.auto_renew !== true) {
      Alert.alert("Change plan", "Turn on auto-renew first. The new plan applies at the next renewal.");
      return;
    }
    if (!membership.provider_slug) {
      Alert.alert("Change plan", "This provider has no public profile, so other plans cannot be loaded.");
      return;
    }
    try {
      const res = await api.get<{ plans?: Array<{ id: string; name: string; price_monthly?: number; price?: number; currency?: string }> }>(
        `/api/public/providers/${membership.provider_slug}/membership-plans`,
      );
      const plans = Array.isArray(res.data?.plans) ? res.data.plans : [];
      if (plans.length === 0) {
        Alert.alert("Change plan", "No other plans available.");
        return;
      }
      Alert.alert(
        "Change plan",
        "Takes effect at period end. Choose a plan.",
        [
          { text: "Cancel", style: "cancel" },
          ...plans.map((plan) => ({
            text: `${plan.name}${plan.id === membership.plan_id ? " (current)" : ""}`,
            onPress: async () => {
              const change = await api.post<{ scheduled?: boolean; cleared?: boolean }>(
                "/api/me/membership/change-plan",
                { provider_membership_id: membership.id, plan_id: plan.id },
              );
              if (change.error) {
                Alert.alert(errTitle, getApiErrorMessage(change.error, "Failed to schedule plan change"));
              } else {
                await load();
                Alert.alert("Done", change.data?.cleared ? "Scheduled change cleared." : "Plan change scheduled for period end.");
              }
            },
          })),
        ],
      );
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, "Failed to load plans"));
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
        Alert.alert(errTitle, getApiErrorMessage(res.error, "Failed to load usage"));
        return;
      }
      const bookings = Array.isArray(res.data?.bookings) ? res.data.bookings : [];
      const total = Number(res.data?.discount_total ?? 0);
      const count = Number(res.data?.booking_count ?? bookings.length);
      const lines = bookings.slice(0, 8).map((b) => {
        const amt = Number(b.membership_discount_amount ?? 0);
        return `${b.booking_number ?? "Booking"} · ${membership.currency} ${amt.toFixed(2)}`;
      });
      Alert.alert(
        "Membership usage",
        [
          `${count} booking${count === 1 ? "" : "s"} used this membership.`,
          `Saved ${membership.currency} ${total.toFixed(2)}.`,
          lines.length > 0 ? `\n${lines.join("\n")}` : "",
          bookings.length > 8 ? `\n+${bookings.length - 8} more` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, "Failed to load usage"));
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
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Active membership</Text>
              <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], marginTop: 4 }}>{membership?.name}</Text>
              {membership?.description && (
                <Text style={{ color: Colors.gray[700], marginTop: 8 }}>{membership.description}</Text>
              )}
              <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 8 }}>
                {membership?.billing_cycle === "yearly" ? "Billed yearly" : "Billed monthly"}
                {membership?.expires_at && ` · Renews ${formatDateSafe(membership.expires_at)}`}
              </Text>
            </View>
            {benefits.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Benefits</Text>
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
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Your savings</Text>
                <Text style={{ color: Colors.gray[700], marginTop: 4 }}>
                  This month: {savingsCurrency} {savings.this_month?.toFixed(2) ?? "0.00"}
                </Text>
                <Text style={{ color: Colors.gray[700] }}>Lifetime: {savingsCurrency} {savings.lifetime?.toFixed(2) ?? "0.00"}</Text>
              </View>
            )}
            {membership?.auto_renew !== false && (
              <TouchableOpacity
                onPress={cancelMembership}
                disabled={cancelling}
                style={{ marginTop: 16, paddingVertical: 12, borderWidth: 1, borderColor: "#EF4444", borderRadius: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#DC2626", fontWeight: "500" }}>{cancelling ? "Cancelling..." : "Cancel membership"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : hasSalonMemberships ? (
          <View>
            <View style={{ backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16 }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>No platform membership</Text>
              <Text style={{ color: Colors.gray[700], marginTop: 4 }}>
                Your active salon memberships are listed below.
              </Text>
            </View>
          </View>
        ) : null}

        {hasSalonMemberships && (
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>Salon memberships</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12 }}>
              Your active memberships with providers. You get the listed discount on bookings at each salon.
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
                        <Text style={{ fontWeight: "600", color: "#334155", fontSize: 13 }}>Paused</Text>
                        <Text style={{ color: "#475569", fontSize: 13, marginTop: 2 }}>
                          Auto-renew is off
                          {pm.paused_until ? ` until ${formatDateSafe(pm.paused_until)}` : ""}.
                          Resume anytime to keep your benefits.
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
                        <Text style={{ fontWeight: "600", color: "#B45309", fontSize: 13 }}>Add a payment method</Text>
                        <Text style={{ color: "#B45309", fontSize: 13, marginTop: 2 }}>
                          Your {pm.plan_name} membership is active, but we couldn&apos;t save a card for renewals. Add one
                          {pm.next_billing_at ? ` before ${formatDateSafe(pm.next_billing_at)}` : " soon"} to keep it from lapsing.
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
                      <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "600" }}>{pm.discount_percent}% off services</Text>
                    )}
                    {pm.scheduled_plan_id ? (
                      <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
                        Changes to {pm.scheduled_plan_name ?? "the selected plan"}{" "}
                        {pm.scheduled_change_at ? formatDateSafe(pm.scheduled_change_at) : "at period end"}
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
                        ? "Loading cards…"
                        : isPastDue
                          ? "Update payment card"
                          : "Change payment card"}
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
                    <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>Usage history →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void changePlan(pm)} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>Change plan →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => pauseOrResume(pm)}
                    disabled={pausingId === pm.id}
                    style={{ marginTop: 8 }}
                  >
                    <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>
                      {pausingId === pm.id ? "Saving…" : isPaused ? "Resume membership" : "Pause membership"}
                    </Text>
                  </TouchableOpacity>

                  {pm.provider_slug && (
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: "/(app)/partner-profile", params: { slug: pm.provider_slug } })}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${pm.provider_name}`}
                      style={{ marginTop: 4 }}
                    >
                      <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>View provider →</Text>
                    </TouchableOpacity>
                  )}

                  {pm.status !== "cancelled" && (
                    <TouchableOpacity
                      onPress={() => cancelSalonMembership(pm)}
                      disabled={cancellingSalonId === pm.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel ${pm.plan_name} membership with ${pm.provider_name}`}
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
                        {cancellingSalonId === pm.id ? "Cancelling..." : "Cancel salon membership"}
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
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>No memberships yet</Text>
              <Text style={{ color: Colors.gray[700], marginTop: 4 }}>
                Browse provider profiles to see membership plans and subscribe.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}
