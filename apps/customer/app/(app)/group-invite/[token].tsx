import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors } from "@/constants/colors";
import { redirectLoginIfAuthRequired } from "@/lib/customer-auth-routing";
import * as ExpoLinking from "expo-linking";

type InvitePayload = {
  invited_name?: string | null;
  status?: string;
  currency?: string | null;
  amount_due?: number;
  amount_paid?: number;
  amount_remaining?: number;
  share_status?: string | null;
  booking?: {
    booking_number?: string | null;
    scheduled_at?: string | null;
    status?: string | null;
    provider_name?: string | null;
  } | null;
  can_pay?: boolean;
  can_cancel?: boolean;
};

function formatMoney(amount: number, currency: string | null | undefined, locale?: string): string {
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function GroupInviteScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const gi = (key: string, opts?: Record<string, unknown>) =>
    t(`web.groupInvite.${key}`, opts) as string;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<InvitePayload | null>(null);

  const returnTo = `/group-invite/${encodeURIComponent(String(token ?? ""))}`;
  const apiBase = `/api/public/group-invites/${encodeURIComponent(String(token ?? ""))}`;

  const load = useCallback(async () => {
    if (!token) return;
    const res = await api.get<{ invite?: InvitePayload }>(apiBase);
    setInvite(res.error ? null : (res.data?.invite ?? null));
    setLoading(false);
  }, [apiBase, token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh after returning from the hosted payment page.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    const res = await api.post<{ invite?: InvitePayload }>(`${apiBase}/accept`, {});
    setBusy(false);
    if (res.error) {
      if (await redirectLoginIfAuthRequired(returnTo, res.error)) return;
      Alert.alert(gi("acceptFailed"), getApiErrorMessage(res.error));
      return;
    }
    if (res.data?.invite) setInvite(res.data.invite);
  };

  const payShare = async () => {
    if (!token) return;
    setBusy(true);
    const res = await api.post<{ authorization_url?: string }>(`${apiBase}/pay`, {});
    setBusy(false);
    if (res.error) {
      if (await redirectLoginIfAuthRequired(returnTo, res.error)) return;
      Alert.alert(gi("payFailed"), getApiErrorMessage(res.error));
      return;
    }
    const url = res.data?.authorization_url;
    if (url) await ExpoLinking.openURL(url);
    else Alert.alert(gi("payFailed"));
  };

  const doCancel = async () => {
    setBusy(true);
    const res = await api.post<{ invite?: InvitePayload | null; guest_refunded?: number }>(
      `${apiBase}/cancel`,
      {},
    );
    setBusy(false);
    if (res.error) {
      if (await redirectLoginIfAuthRequired(returnTo, res.error)) return;
      Alert.alert(gi("cancelFailed"), getApiErrorMessage(res.error));
      return;
    }
    if (res.data?.invite) setInvite(res.data.invite);
    const refunded = Number(res.data?.guest_refunded ?? 0);
    Alert.alert(
      refunded > 0
        ? gi("cancelledRefunded", { amount: formatMoney(refunded, invite?.currency, i18n.language) })
        : gi("cancelled"),
    );
  };

  const cancelSpot = () => {
    Alert.alert(gi("cancelSpot"), gi("cancelConfirm"), [
      { text: t("common.cancel") as string, style: "cancel" },
      { text: gi("cancelSpot"), style: "destructive", onPress: () => void doCancel() },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (!invite) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Text style={{ textAlign: "center", fontSize: 16 }}>{gi("notFound")}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ textAlign: "center", color: Colors.primary, fontWeight: "600" }}>OK</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const amountDue = Number(invite.amount_due ?? 0);
  const remaining = Number(invite.amount_remaining ?? 0);
  const sessionStatus = String(invite.booking?.status ?? "").toLowerCase();
  const sessionCancelled = sessionStatus === "cancelled";
  const sessionClosed = sessionCancelled || sessionStatus === "completed" || sessionStatus === "no_show";
  const shareCancelled = invite.share_status === "cancelled" || invite.status === "cancelled";
  const sharePaid = amountDue > 0 && remaining <= 0;
  const when = invite.booking?.scheduled_at
    ? new Date(invite.booking.scheduled_at).toLocaleString(i18n.language, {
        dateStyle: "full",
        timeStyle: "short",
      })
    : null;

  const primaryButton = (label: string, onPress: () => void, destructive = false) => (
    <TouchableOpacity
      disabled={busy}
      onPress={onPress}
      accessibilityRole="button"
      style={{
        backgroundColor: destructive ? "#fff" : Colors.primary,
        borderWidth: destructive ? 1 : 0,
        borderColor: "#d1d5db",
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 12,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Text
        style={{
          color: destructive ? "#b91c1c" : "#fff",
          textAlign: "center",
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 8 }}>{gi("title")}</Text>
        <Text style={{ fontSize: 15, color: "#4b5563", marginBottom: 16 }}>
          {gi("body", { name: String(invite.invited_name ?? "") })}
        </Text>
        {invite.booking ? (
          <View
            style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 16, marginBottom: 8 }}
          >
            {invite.booking.provider_name ? (
              <Text style={{ fontWeight: "600", marginBottom: 4 }}>{invite.booking.provider_name}</Text>
            ) : null}
            {when ? <Text style={{ color: "#374151" }}>{when}</Text> : null}
            {amountDue > 0 ? (
              <Text style={{ color: "#374151", marginTop: 4 }}>
                {gi("yourShare", { amount: formatMoney(amountDue, invite.currency, i18n.language) })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {sessionCancelled ? (
          <Text style={{ fontWeight: "600", color: "#374151", marginTop: 8 }}>
            {Number(invite.amount_paid ?? 0) > 0 ? gi("sessionCancelledPaid") : gi("sessionCancelled")}
          </Text>
        ) : shareCancelled ? (
          <Text style={{ fontWeight: "600", color: "#374151", marginTop: 8 }}>{gi("cancelled")}</Text>
        ) : sharePaid ? (
          <Text style={{ fontWeight: "600", color: "#15803d", marginTop: 8 }}>{gi("sharePaid")}</Text>
        ) : null}

        {invite.status === "pending" && !shareCancelled && !sessionClosed ? primaryButton(gi("accept"), () => void accept()) : null}
        {invite.can_pay
          ? primaryButton(
              gi("payShareAmount", { amount: formatMoney(remaining, invite.currency, i18n.language) }),
              () => void payShare(),
            )
          : null}
        {invite.can_cancel ? primaryButton(gi("cancelSpot"), cancelSpot, true) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
