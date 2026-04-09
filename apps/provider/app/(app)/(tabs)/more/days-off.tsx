import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  RefreshControl,
  Platform,
  Pressable,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { twStyle } from "@/lib/twStyle";

interface StaffMember {
  id: string;
  name: string;
  email?: string;
  role?: string;
  is_active?: boolean;
}

interface DayOff {
  id: string;
  staff_id: string;
  team_member_id: string;
  team_member_name: string;
  date: string;
  reason?: string | null;
}

/** Content-only for use in Schedule hub (Days off tab). */
export function DaysOffContent() {
  const [daysOff, setDaysOff] = useState<DayOff[]>([]);
  const [loadingDaysOff, setLoadingDaysOff] = useState(false);
  const [daysOffError, setDaysOffError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reason, setReason] = useState("");

  const { data: staff, loading: loadingStaff, error: staffError, refresh: refreshStaff } = useApi<StaffMember[]>("/api/provider/staff");
  const { execute: postDayOff } = useApiMutation("post");
  const { execute: deleteDayOff } = useApiMutation("delete");

  const activeStaff = (staff ?? []).filter((s) => s.is_active !== false);

  const loadDaysOff = useCallback(async () => {
    if (!activeStaff.length) {
      setDaysOff([]);
      setDaysOffError(null);
      return;
    }
    setLoadingDaysOff(true);
    setDaysOffError(null);
    try {
      const all: DayOff[] = [];
      const errors: string[] = [];
      await Promise.all(
        activeStaff.map(async (member) => {
          try {
            const res = await api.get<unknown>(`/api/provider/staff/${member.id}/days-off`);
            const raw = (res as any)?.data ?? (res as any);
            const list = Array.isArray(raw) ? raw : [];
            const mapped = list.map((d: any) => ({
              id: d.id,
              staff_id: d.staff_id ?? member.id,
              team_member_id: d.staff_id ?? member.id,
              team_member_name: member.name ?? "Staff",
              date: d.date,
              reason: d.reason ?? null,
            }));
            all.push(...mapped);
          } catch {
            errors.push(member.name ?? member.id);
          }
        })
      );
      all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setDaysOff(all);
      if (errors.length > 0) {
        setDaysOffError(`Could not load days off for: ${errors.join(", ")}. Pull to refresh.`);
      }
    } catch (e) {
      console.error("Failed to load days off:", e);
      setDaysOffError("Failed to load days off. Pull down to retry.");
      setDaysOff([]);
    } finally {
      setLoadingDaysOff(false);
    }
  }, [activeStaff]);

  useEffect(() => {
    loadDaysOff();
  }, [loadDaysOff]);

  const onRefresh = useCallback(async () => {
    await refreshStaff();
    await loadDaysOff();
  }, [refreshStaff, loadDaysOff]);

  const toggleStaff = (id: string) => {
    setSelectedStaffIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSaveDayOff = async () => {
    if (selectedStaffIds.length === 0) {
      Alert.alert("Select staff", "Please select at least one team member.");
      return;
    }
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    for (const staffId of selectedStaffIds) {
      const { error } = await postDayOff(`/api/provider/staff/${staffId}/days-off`, {
        date: dateStr,
        reason: reason.trim() || undefined,
        type: reason.trim() || undefined,
      });
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    setAddModalOpen(false);
    setSelectedStaffIds([]);
    setReason("");
    loadDaysOff();
  };

  const handleRemoveDayOff = (dayOff: DayOff) => {
    Alert.alert(
      "Remove day off",
      `Remove this day off for ${dayOff.team_member_name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const { error } = await deleteDayOff(
              `/api/provider/staff/${dayOff.team_member_id}/days-off/${dayOff.id}`
            );
            if (error) Alert.alert("Error", error);
            else loadDaysOff();
          },
        },
      ]
    );
  };

  if (loadingStaff && !staff) {
    return (
      <View style={twStyle("flex-1 items-center justify-center py-12")}>
        <LoadingState />
      </View>
    );
  }
  if (staffError && !staff) {
    return (
      <View style={twStyle("flex-1 justify-center px-4")}>
        <ErrorState message={staffError} onRetry={refreshStaff} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={loadingStaff || loadingDaysOff} onRefresh={onRefresh} tintColor="#1a1f3c" />
        }
      >
        {daysOffError && (
          <View style={twStyle("mx-4 mb-3 flex-row items-start rounded-xl border border-red-200 bg-red-50 px-4 py-3")}>
            <Ionicons name="warning-outline" size={16} color="#dc2626" style={{ marginTop: 1 }} />
            <Text style={twStyle("ml-2 flex-1 text-sm text-red-700")}>{daysOffError}</Text>
          </View>
        )}
        {activeStaff.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No team members"
            description="Add staff in Team settings to manage days off"
          />
        ) : loadingDaysOff && daysOff.length === 0 ? (
          <View style={twStyle("py-12")}>
            <LoadingState />
          </View>
        ) : daysOff.length === 0 ? (
          <View style={twStyle("flex-1 items-center justify-center py-16 px-6")}>
            <View style={twStyle("mb-4 h-16 w-16 items-center justify-center rounded-full bg-amber-50")}>
              <Ionicons name="sunny-outline" size={32} color="#f59e0b" />
            </View>
            <Text style={twStyle("text-center text-lg font-semibold text-gray-900")}>Staff time off</Text>
            <Text style={twStyle("mt-2 text-center text-sm text-gray-500")}>
              No days off scheduled. Tap &quot;Set Day Off&quot; to add one.
            </Text>
            <TouchableOpacity
              onPress={() => setAddModalOpen(true)}
              style={twStyle("mt-6 flex-row items-center justify-center rounded-xl bg-amber-500 px-6 py-3")}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={twStyle("ml-2 font-medium text-white")}>Set Day Off</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={twStyle("px-4")}>
            <TouchableOpacity
              onPress={() => {
                setSelectedStaffIds([]);
                setSelectedDate(new Date());
                setReason("");
                setAddModalOpen(true);
              }}
              style={twStyle("mb-3 flex-row items-center justify-center rounded-xl border border-amber-200 bg-amber-50 py-3")}
            >
              <Ionicons name="add" size={18} color="#f59e0b" />
              <Text style={twStyle("ml-2 font-medium text-amber-800")}>Set Day Off</Text>
            </TouchableOpacity>
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm text-gray-500")}>
                {daysOff.length} day{daysOff.length !== 1 ? "s" : ""} off
              </Text>
            </View>
            {daysOff.map((dayOff) => {
              const isPast = new Date(dayOff.date) < new Date();
              return (
                <View
                  key={dayOff.id}
                  style={twStyle("mb-3 flex-row items-center rounded-xl border border-gray-100 bg-white p-4")}
                >
                  <Avatar name={dayOff.team_member_name} size="sm" />
                  <View style={twStyle("ml-3 flex-1")}>
                    <Text style={twStyle("font-medium text-gray-900")}>{dayOff.team_member_name}</Text>
                    <Text style={twStyle("text-sm text-gray-600")}>
                      {format(new Date(dayOff.date), "EEE, MMM d, yyyy")}
                      {dayOff.reason ? ` · ${dayOff.reason}` : ""}
                    </Text>
                    {isPast && (
                      <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>Past</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveDayOff(dayOff)}
                    style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-red-50")}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add Day Off Modal */}
      <Modal visible={addModalOpen} transparent animationType="slide">
        <Pressable style={twStyle("flex-1 justify-end bg-black/40")} onPress={() => setAddModalOpen(false)}>
          <Pressable style={twStyle("max-h-[90%] rounded-t-2xl bg-white p-6")} onPress={() => {}}>
            <Text style={twStyle("mb-4 text-lg font-semibold text-gray-900")}>Set Day Off</Text>

            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Team members</Text>
            <ScrollView style={twStyle("mb-4 max-h-40 rounded-xl border border-gray-200 bg-gray-50")} nestedScrollEnabled>
              {activeStaff.map((member) => {
                const selected = selectedStaffIds.includes(member.id);
                return (
                  <TouchableOpacity
                    key={member.id}
                    onPress={() => toggleStaff(member.id)}
                    style={twStyle("flex-row items-center border-b border-gray-100 px-4 py-3 last:border-b-0")}
                  >
                    <Avatar name={member.name} size="sm" />
                    <Text style={twStyle("ml-3 flex-1 font-medium text-gray-900")}>{member.name}</Text>
                    {selected && <Ionicons name="checkmark-circle" size={22} color="#f59e0b" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Date</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={twStyle("mb-4 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
            >
              <Ionicons name="calendar-outline" size={20} color="#6366f1" />
              <Text style={twStyle("ml-2 text-base text-gray-900")}>{format(selectedDate, "PPP")}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={(_, d) => {
                  setShowDatePicker(Platform.OS !== "ios");
                  if (d) setSelectedDate(d);
                }}
              />
            )}

            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Vacation, Sick leave"
              placeholderTextColor="#9ca3af"
              style={twStyle("mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            />

            <View style={twStyle("flex-row")}>
              <TouchableOpacity
                onPress={() => setAddModalOpen(false)}
                style={[twStyle("flex-1 items-center rounded-xl border border-gray-200 py-3"), { marginRight: 12 }]}
              >
                <Text style={twStyle("font-medium text-gray-600")}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveDayOff}
                style={twStyle("flex-1 items-center rounded-xl bg-amber-500 py-3")}
              >
                <Text style={twStyle("font-medium text-white")}>Set Day Off</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function DaysOffScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Days Off" showBack />
      <DaysOffContent />
    </ScreenContainer>
  );
}
