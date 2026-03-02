import { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatDate } from "@/lib/format";

interface StaffMember {
  id: string;
  name: string;
  email?: string;
  avatar_url?: string | null;
}

interface TimeCard {
  id: string;
  team_member_id: string;
  team_member_name: string;
  date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  total_hours: number | null;
  status: "clocked_in" | "clocked_out";
  notes?: string | null;
}

const TAB_OPTIONS = [
  { label: "Clock In/Out", value: "clock" },
  { label: "Time Cards", value: "cards" },
];

const CARD_FILTERS = [
  { label: "All", value: "all" },
  { label: "Active", value: "clocked_in" },
  { label: "Completed", value: "clocked_out" },
];

export default function TimeClockScreen() {
  useResponsive();
  const [tab, setTab] = useState("clock");
  const [refreshing, setRefreshing] = useState(false);
  const [cardFilter, setCardFilter] = useState("all");
  const [showPinClock, setShowPinClock] = useState(false);
  const [pin, setPin] = useState("");
  const [editingCard, setEditingCard] = useState<TimeCard | null>(null);
  const [editForm, setEditForm] = useState({ clockIn: "", clockOut: "", notes: "" });

  const { data: staff } = useApi<StaffMember[]>("/api/provider/staff");
  const { data: timeCards, loading, refresh } = useApi<TimeCard[]>("/api/provider/time-clock");
  const { execute: clockAction, loading: clocking } = useApiMutation("post");
  const { execute: updateCard, loading: updatingCard } = useApiMutation("patch");

  useEffect(() => {
    const interval = setInterval(() => { refresh(); }, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  useMemo(() => {
    if (!timeCards) return [];
    return timeCards.filter((t) => t.status === "clocked_in");
  }, [timeCards]);

  const allStaffWithStatus = useMemo(() => {
    if (!staff) return [];
    return staff.map((s) => {
      const card = timeCards?.find(
        (t) => t.team_member_id === s.id && t.status === "clocked_in"
      );
      return {
        ...s,
        name: s.name ?? "Staff",
        isClockedIn: !!card,
        currentCard: card ?? null,
        clockInTime: card?.clock_in_time ?? null,
      };
    });
  }, [staff, timeCards]);

  const filteredCards = useMemo(() => {
    if (!timeCards) return [];
    if (cardFilter === "clocked_in") return timeCards.filter((t) => t.status === "clocked_in");
    if (cardFilter === "clocked_out") return timeCards.filter((t) => t.status === "clocked_out");
    return timeCards;
  }, [timeCards, cardFilter]);

  const stats = useMemo(() => {
    if (!timeCards) return { active: 0, totalStaff: 0, today: 0, totalHours: 0 };
    const today = new Date().toISOString().split("T")[0];
    return {
      active: timeCards.filter((t) => t.status === "clocked_in").length,
      totalStaff: staff?.length ?? 0,
      today: timeCards.filter((t) => t.date === today).length,
      totalHours: timeCards.reduce((s, t) => s + (t.total_hours ?? 0), 0),
    };
  }, [timeCards, staff]);

  async function handlePinClock() {
    if (pin.length !== 4) {
      Alert.alert("Invalid PIN", "Enter your 4-digit PIN");
      return;
    }
    const { error } = await clockAction("/api/provider/time-clock", { pin });
    if (error) { Alert.alert("Error", error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowPinClock(false);
    setPin("");
    refresh();
  }

  async function handleDirectClock(staffId: string, action: "clock_in" | "clock_out") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const path = action === "clock_in"
      ? `/api/provider/staff/${staffId}/time-clock/clock-in`
      : `/api/provider/staff/${staffId}/time-clock/clock-out`;
    const { error } = await clockAction(path, {});
    if (error) { Alert.alert("Error", error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  function openEditCard(card: TimeCard) {
    setEditingCard(card);
    setEditForm({
      clockIn: card.clock_in_time ?? "",
      clockOut: card.clock_out_time ?? "",
      notes: card.notes ?? "",
    });
  }

  async function handleSaveCard() {
    if (!editingCard) return;
    const { error } = await updateCard(`/api/provider/time-clock/${editingCard.id}`, {
      clock_in_time: editForm.clockIn || undefined,
      clock_out_time: editForm.clockOut || undefined,
      notes: editForm.notes.trim() || undefined,
    });
    if (error) { Alert.alert("Error", error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditingCard(null);
    refresh();
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Time Clock"
        showBack
        subtitle={`${stats.active} of ${stats.totalStaff} clocked in`}
        rightAction={
          <TouchableOpacity
            className="flex-row items-center rounded-xl bg-gray-900 px-4 py-2"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowPinClock(true);
            }}
          >
            <Ionicons name="finger-print-outline" size={18} color="#fff" />
            <Text className="ml-1.5 text-sm font-semibold text-white">PIN Clock</Text>
          </TouchableOpacity>
        }
      />

      <View className="mb-4 flex-row gap-3">
        <View className="flex-1">
          <StatCard title="Active" value={String(stats.active)} icon="radio-button-on" iconColor="#22c55e" iconBg="bg-green-50" compact />
        </View>
        <View className="flex-1">
          <StatCard title="Total Staff" value={String(stats.totalStaff)} icon="people-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
        </View>
        <View className="flex-1">
          <StatCard title="Hours Today" value={stats.totalHours.toFixed(1)} icon="time-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
        </View>
      </View>

      <View className="mb-3">
        <FilterChipGroup options={TAB_OPTIONS} selected={tab} onSelect={setTab} />
      </View>

      {tab === "clock" ? (
        <>
          {loading && !staff ? (
            <SkeletonList rows={4} />
          ) : allStaffWithStatus.length === 0 ? (
            <EmptyState icon="people-outline" title="No staff" description="Add team members to use the time clock" />
          ) : (
            <FlatList
              data={allStaffWithStatus}
              keyExtractor={(s: StaffMember) => s.id}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
              renderItem={({ item: member }: { item: StaffMember & { isClockedIn: boolean; clockInTime: string | null; currentCard: TimeCard | null } }) => (
                <View className={`rounded-xl border bg-white p-4 ${
                  member.isClockedIn ? "border-green-200" : "border-gray-100"
                }`}>
                  <View className="flex-row items-center">
                    <View className="relative">
                      <Avatar name={member.name} size="sm" />
                      {member.isClockedIn && (
                        <View className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                      )}
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-sm font-semibold text-gray-900">{member.name}</Text>
                      {member.isClockedIn ? (
                        <Text className="text-xs text-green-600">
                          Clocked in at {member.clockInTime}
                        </Text>
                      ) : (
                        <Text className="text-xs text-gray-400">Not clocked in</Text>
                      )}
                    </View>
                    {member.isClockedIn ? (
                      <TouchableOpacity
                        className="rounded-lg bg-red-50 px-4 py-2"
                        onPress={() => handleDirectClock(member.id, "clock_out")}
                        disabled={clocking}
                      >
                        <Text className="text-sm font-medium text-red-700">Clock Out</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        className="rounded-lg bg-green-50 px-4 py-2"
                        onPress={() => handleDirectClock(member.id, "clock_in")}
                        disabled={clocking}
                      >
                        <Text className="text-sm font-medium text-green-700">Clock In</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            />
          )}
        </>
      ) : (
        <>
          <View className="mb-3">
            <FilterChipGroup options={CARD_FILTERS} selected={cardFilter} onSelect={setCardFilter} />
          </View>

          {loading && !timeCards ? (
            <SkeletonList rows={5} />
          ) : filteredCards.length === 0 ? (
            <EmptyState icon="time-outline" title="No time cards" description="Time entries will appear here" />
          ) : (
            <FlatList
              data={filteredCards}
              keyExtractor={(t: TimeCard) => t.id}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
              renderItem={({ item: card }: { item: TimeCard }) => (
                <TouchableOpacity
                  className="rounded-xl border border-gray-100 bg-white p-4"
                  onPress={() => openEditCard(card)}
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center">
                    <Avatar name={card.team_member_name} size="sm" />
                    <View className="ml-2.5 flex-1">
                      <Text className="text-sm font-semibold text-gray-900">{card.team_member_name}</Text>
                      <Text className="text-xs text-gray-500">{formatDate(card.date)}</Text>
                    </View>
                    <View className="items-end">
                      <View className="flex-row items-center gap-3">
                        {card.clock_in_time && (
                          <View className="flex-row items-center">
                            <Ionicons name="log-in-outline" size={12} color="#22c55e" />
                            <Text className="ml-0.5 text-xs text-green-600">{card.clock_in_time}</Text>
                          </View>
                        )}
                        {card.clock_out_time && (
                          <View className="flex-row items-center">
                            <Ionicons name="log-out-outline" size={12} color="#ef4444" />
                            <Text className="ml-0.5 text-xs text-red-600">{card.clock_out_time}</Text>
                          </View>
                        )}
                      </View>
                      <View className={`mt-1 rounded-full px-2 py-0.5 ${
                        card.status === "clocked_in" ? "bg-green-50" : "bg-gray-100"
                      }`}>
                        <Text className={`text-[10px] font-medium ${
                          card.status === "clocked_in" ? "text-green-700" : "text-gray-500"
                        }`}>
                          {card.status === "clocked_in"
                            ? "Active"
                            : card.total_hours
                              ? `${card.total_hours.toFixed(1)}h`
                              : "Done"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {card.notes && (
                    <Text className="mt-2 text-xs text-gray-400" numberOfLines={1}>
                      {card.notes}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}

      {/* PIN Clock modal */}
      <BottomSheet visible={showPinClock} onClose={() => setShowPinClock(false)} title="PIN Clock In/Out">
        <View className="items-center">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-indigo-50">
            <Ionicons name="finger-print" size={40} color="#6366f1" />
          </View>
          <Text className="mb-4 text-center text-sm text-gray-500">
            Enter your 4-digit PIN to clock in or out
          </Text>
          <TextInput
            className="mb-4 w-48 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-center text-2xl font-bold tracking-[12px] text-gray-900"
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            placeholder="••••"
            placeholderTextColor="#d1d5db"
          />
          <ActionButton label="Submit" onPress={handlePinClock} loading={clocking} fullWidth />
        </View>
      </BottomSheet>

      {/* Edit time card */}
      <BottomSheet
        visible={!!editingCard}
        onClose={() => setEditingCard(null)}
        title={`Edit Time Card — ${editingCard?.team_member_name ?? ""}`}
      >
        {editingCard && (
          <View>
            <Text className="mb-3 text-sm text-gray-500">{formatDate(editingCard.date)}</Text>

            <View className="mb-3 flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1 text-sm font-medium text-gray-700">Clock In</Text>
                <TextInput
                  className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                  value={editForm.clockIn}
                  onChangeText={(t) => setEditForm((p) => ({ ...p, clockIn: t }))}
                  placeholder="HH:MM"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View className="flex-1">
                <Text className="mb-1 text-sm font-medium text-gray-700">Clock Out</Text>
                <TextInput
                  className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                  value={editForm.clockOut}
                  onChangeText={(t) => setEditForm((p) => ({ ...p, clockOut: t }))}
                  placeholder="HH:MM"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            <Text className="mb-1 text-sm font-medium text-gray-700">Notes</Text>
            <TextInput
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
              value={editForm.notes}
              onChangeText={(t) => setEditForm((p) => ({ ...p, notes: t }))}
              placeholder="Optional notes..."
              placeholderTextColor="#9ca3af"
            />

            <ActionButton label="Save Changes" onPress={handleSaveCard} loading={updatingCard} fullWidth />
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
