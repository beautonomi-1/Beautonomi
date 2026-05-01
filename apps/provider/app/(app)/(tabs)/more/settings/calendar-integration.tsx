import { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatTimeAgo } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

type CalendarProvider = "google" | "apple" | "outlook";
type SyncDirection = "one_way" | "two_way";

interface CalendarSync {
  id: string;
  provider: CalendarProvider;
  calendar_id: string | null;
  is_active: boolean;
  sync_direction: SyncDirection;
  last_sync_date: string | null;
  sync_errors: string[] | null;
  created_date: string;
}

/** Map `/api/provider/calendar/sync` rows to UI types (matches provider web portal mapping). */
function normalizeCalendarSync(row: Record<string, unknown>): CalendarSync {
  const rawProvider = String(row.provider ?? "");
  const provider: CalendarProvider =
    rawProvider === "ical" ? "apple" : (rawProvider as CalendarProvider);
  const dir = String(row.sync_direction ?? "");
  const sync_direction: SyncDirection = dir === "bidirectional" ? "two_way" : "one_way";
  const err = row.sync_error;
  return {
    id: String(row.id),
    provider,
    calendar_id: (row.calendar_id as string | null) ?? (row.ical_url as string | null) ?? null,
    is_active: Boolean(row.is_active ?? true),
    sync_direction,
    last_sync_date: (row.last_sync_at as string | null) ?? null,
    sync_errors: err != null && String(err).trim() ? [String(err)] : null,
    created_date: String(row.created_at ?? ""),
  };
}

function providerConfig(provider: CalendarProvider) {
  switch (provider) {
    case "google":
      return {
        label: "Google Calendar",
        icon: "logo-google" as const,
        color: "#4285f4",
        bg: "bg-blue-50",
        description: "Sync appointments with Google Calendar",
      };
    case "apple":
      return {
        label: "Apple Calendar",
        icon: "logo-apple" as const,
        color: "#333333",
        bg: "bg-gray-100",
        description: "Sync with iCloud Calendar via iCal feed",
      };
    case "outlook":
      return {
        label: "Microsoft Outlook",
        icon: "mail-outline" as const,
        color: "#0078d4",
        bg: "bg-sky-50",
        description: "Sync with Outlook / Microsoft 365",
      };
  }
}

export default function CalendarIntegrationScreen() {
  const [connecting, setConnecting] = useState<CalendarProvider | null>(null);
  const [selectedSync, setSelectedSync] = useState<CalendarSync | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const { data: rawSyncRows, loading, refresh } = useApi<Record<string, unknown>[]>(
    "/api/provider/calendar/sync",
  );
  const syncs = useMemo(
    () => (rawSyncRows ?? []).map(normalizeCalendarSync),
    [rawSyncRows],
  );
  const { execute: updateSync } = useApiMutation<CalendarSync>("patch");
  const { execute: deleteSync } = useApiMutation<void>("delete");

  const connectedProviders = new Set((syncs ?? []).map((s) => s.provider));

  async function handleConnect(provider: CalendarProvider) {
    setConnecting(provider);
    try {
      const result = await api.get<{ url?: string; state?: string }>(
        `/api/provider/calendar/auth/${provider}`,
        { timeout: 45_000 },
      );
      if (result.error) {
        const e = result.error as { message?: string; code?: string };
        const msg = getApiErrorMessage(result.error, "Could not get authorization URL");
        if (e.code === "ICAL_METHOD") {
          Alert.alert(
            "Apple Calendar",
            "Apple Calendar uses an iCal subscription URL. Open Calendar integration on the provider website (beautonomi.com) to copy your feed link.",
          );
          return;
        }
        Alert.alert("Error", msg);
        return;
      }
      const payload = result.data as { url?: string } | null;
      const url = payload?.url?.trim();
      if (!url) {
        Alert.alert("Error", "Could not get authorization URL");
        return;
      }
      const sessionResult = await WebBrowser.openAuthSessionAsync(url);
      if (sessionResult.type === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refresh();
      }
    } catch (err) {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to connect calendar"));
    } finally {
      setConnecting(null);
    }
  }

  async function handleToggleSync(sync: CalendarSync) {
    const { error } = await updateSync(`/api/provider/calendar/sync/${sync.id}`, {
      is_active: !sync.is_active,
    });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    refresh();
  }

  async function handleChangeSyncDirection(sync: CalendarSync) {
    const newDirection: SyncDirection = sync.sync_direction === "one_way" ? "two_way" : "one_way";
    const apiDirection = newDirection === "two_way" ? "bidirectional" : "app_to_calendar";
    const { error } = await updateSync(`/api/provider/calendar/sync/${sync.id}`, {
      sync_direction: apiDirection,
    });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    refresh();
    if (selectedSync?.id === sync.id) {
      setSelectedSync({ ...sync, sync_direction: newDirection });
    }
  }

  async function handleManualSync(_sync: CalendarSync) {
    setSyncing(_sync.id);
    try {
      Alert.alert(
        "Calendar sync",
        "Full manual sync is not yet available in the mobile app. Appointment changes still push to Google or Outlook when you manage bookings here. For iCal or advanced options, use Calendar integration on the provider website.",
      );
    } finally {
      setSyncing(null);
    }
  }

  async function handleDisconnect(sync: CalendarSync) {
    const cfg = providerConfig(sync.provider);
    Alert.alert(
      "Disconnect Calendar",
      `Disconnect ${cfg.label}? Existing synced events won't be removed from your calendar.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            const { error } = await deleteSync(`/api/provider/calendar/sync/${sync.id}`);
            if (error) {
              Alert.alert("Error", error);
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSelectedSync(null);
            refresh();
          },
        },
      ]
    );
  }

  if (loading && !syncs) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Calendar Integration" showBack />
        <LoadingState message="Loading integrations..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Calendar Integration" showBack subtitle="Sync your appointments" />

      {/* Info banner */}
      <View style={twStyle("mb-4 flex-row rounded-xl border border-blue-100 bg-blue-50 p-3")}>
        <Ionicons name="information-circle" size={18} color="#3b82f6" style={{ marginTop: 1 }} />
        <Text style={twStyle("ml-2 flex-1 text-xs leading-4 text-blue-700")}>
          Keep your personal calendar in sync with your appointments. Changes made here will automatically reflect in your connected calendars.
        </Text>
      </View>

      {/* Available providers */}
      <SectionHeader title="Calendar Providers" />
      {(["google", "apple", "outlook"] as CalendarProvider[]).map((provider) => {
        const cfg = providerConfig(provider);
        const isConnected = connectedProviders.has(provider);
        const sync = (syncs ?? []).find((s) => s.provider === provider);

        return (
          <View
            key={provider}
            style={twStyle("mb-3 rounded-2xl border border-gray-100 bg-white p-4")}
          >
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle(`h-11 w-11 items-center justify-center rounded-xl ${cfg.bg}`)}>
                <Ionicons name={cfg.icon} size={22} color={cfg.color} />
              </View>
              <View style={twStyle("ml-3 flex-1")}>
                <Text style={twStyle("text-[15px] font-semibold text-gray-900")}>{cfg.label}</Text>
                <Text style={twStyle("text-xs text-gray-500")}>{cfg.description}</Text>
              </View>
              {isConnected ? (
                <View style={twStyle("rounded-full bg-green-50 px-2.5 py-1")}>
                  <Text style={twStyle("text-[11px] font-medium text-green-700")}>Connected</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={twStyle("rounded-xl bg-gray-900 px-4 py-2")}
                  onPress={() => handleConnect(provider)}
                  disabled={!!connecting}
                >
                  {connecting === provider ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={twStyle("text-sm font-medium text-white")}>Connect</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {sync && (
              <View style={twStyle("mt-3 border-t border-gray-50 pt-3")}>
                <View style={twStyle("flex-row items-center justify-between mb-2")}>
                  <View style={twStyle("flex-row items-center")}>
                    <View style={twStyle(`h-2 w-2 rounded-full ${sync.is_active ? "bg-green-500" : "bg-gray-300"}`)} />
                    <Text style={twStyle("ml-2 text-xs text-gray-500")}>
                      {sync.is_active ? "Active" : "Paused"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={twStyle("flex-row items-center rounded-lg bg-gray-50 px-2.5 py-1")}
                    onPress={() => handleChangeSyncDirection(sync)}
                  >
                    <Ionicons
                      name={sync.sync_direction === "two_way" ? "swap-horizontal-outline" : "arrow-forward-outline"}
                      size={12}
                      color="#6b7280"
                    />
                    <Text style={twStyle("ml-1 text-[11px] text-gray-500")}>
                      {sync.sync_direction === "two_way" ? "Two-way" : "One-way"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {sync.last_sync_date && (
                  <Text style={twStyle("mb-2 text-[11px] text-gray-400")}>
                    Last synced: {formatTimeAgo(sync.last_sync_date)}
                  </Text>
                )}

                {sync.sync_errors && sync.sync_errors.length > 0 && (
                  <View style={twStyle("mb-2 rounded-lg bg-red-50 p-2")}>
                    <Text style={twStyle("text-[11px] text-red-600")}>
                      {sync.sync_errors[sync.sync_errors.length - 1]}
                    </Text>
                  </View>
                )}

                <View style={twStyle("flex-row")}>
                  <TouchableOpacity
                    style={[twStyle(`flex-1 flex-row items-center justify-center rounded-lg py-2 ${sync.is_active ? "bg-amber-50" : "bg-green-50"}`), { marginRight: 8 }]}
                    onPress={() => handleToggleSync(sync)}
                  >
                    <Ionicons
                      name={sync.is_active ? "pause-outline" : "play-outline"}
                      size={14}
                      color={sync.is_active ? "#f59e0b" : "#22c55e"}
                    />
                    <Text style={twStyle(`ml-1 text-xs font-medium ${sync.is_active ? "text-amber-700" : "text-green-700"}`)}>
                      {sync.is_active ? "Pause" : "Resume"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={twStyle("flex-1 flex-row items-center justify-center rounded-lg bg-indigo-50 py-2")}
                    onPress={() => handleManualSync(sync)}
                    disabled={syncing === sync.id}
                  >
                    {syncing === sync.id ? (
                      <ActivityIndicator size="small" color="#6366f1" />
                    ) : (
                      <Ionicons name="refresh-outline" size={14} color="#6366f1" />
                    )}
                    <Text style={twStyle("ml-1 text-xs font-medium text-indigo-700")}>Sync Now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={twStyle("flex-row items-center justify-center rounded-lg bg-red-50 px-3 py-2")}
                    onPress={() => handleDisconnect(sync)}
                  >
                    <Ionicons name="unlink-outline" size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
