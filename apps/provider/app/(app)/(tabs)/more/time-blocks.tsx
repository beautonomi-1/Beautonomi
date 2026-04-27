import { useCallback, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";

interface TimeBlock {
  id: string;
  team_member_id: string | null;
  team_member_name: string | null;
  blocked_time_type_id: string | null;
  blocked_time_type_name: string | null;
  blocked_time_type_color: string | null;
  name: string;
  date: string;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  recurring_pattern: { frequency: string; days?: number[] } | null;
  is_active: boolean;
  notes: string | null;
}

interface StaffMember {
  id: string;
  name: string;
  is_active?: boolean;
}

/** Content-only for use in Schedule hub (Time blocks tab). */
export function TimeBlocksContent() {
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [blockDate, setBlockDate] = useState(() => new Date());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const now = new Date();
  const dateFrom = format(startOfMonth(now), "yyyy-MM-dd");
  const dateTo = format(endOfMonth(now), "yyyy-MM-dd");
  const url = `/api/provider/time-blocks?date_from=${dateFrom}&date_to=${dateTo}`;

  const { data, loading, error, refresh } = useApi<TimeBlock[]>(url);
  const { data: staffData } = useApi<StaffMember[]>("/api/provider/staff");
  const { execute: postBlock, loading: creating } = useApiMutation<TimeBlock>("post");
  const { execute: deleteBlock } = useApiMutation("delete");

  const rawStaff = Array.isArray(staffData)
    ? staffData
    : staffData != null &&
        typeof staffData === "object" &&
        Array.isArray((staffData as { data?: StaffMember[] }).data)
      ? (staffData as { data: StaffMember[] }).data
      : [];
  const activeStaff = rawStaff.filter(
    (s) => s.is_active !== false,
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const blocks: TimeBlock[] = Array.isArray(data) ? data : [];

  const openAdd = () => {
    setName("");
    setNotes("");
    setBlockDate(new Date());
    setStartTime("09:00");
    setEndTime("17:00");
    setIsRecurring(false);
    setSelectedStaffId(null);
    setAddOpen(true);
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Required", "Enter a name for the block (e.g. Lunch, Meeting).");
      return;
    }
    const dateStr = format(blockDate, "yyyy-MM-dd");
    if (endTime <= startTime) {
      Alert.alert("Invalid times", "End time must be after start time.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await postBlock("/api/provider/time-blocks", {
      name: trimmed,
      staff_id: selectedStaffId || null,
      date: dateStr,
      start_time: startTime,
      end_time: endTime,
      is_recurring: isRecurring,
      recurring_pattern: isRecurring
        ? { frequency: "weekly", days: [blockDate.getDay()] }
        : undefined,
      notes: notes.trim() || null,
    });
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAddOpen(false);
    refresh();
  };

  const handleDelete = (block: TimeBlock) => {
    Alert.alert(
      "Delete time block",
      `Remove "${block.name}" (${block.date} ${block.start_time}–${block.end_time})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error: err } = await deleteBlock(`/api/provider/time-blocks/${block.id}`, {});
            if (err) Alert.alert("Error", err);
            else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
            }
          },
        },
      ]
    );
  };

  if (loading && !data) {
    return (
      <View style={twStyle("flex-1 items-center justify-center py-12")}>
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={twStyle("flex-1 justify-center px-4")}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {blocks.length === 0 ? (
          <EmptyState
            icon="ban-outline"
            title="No time blocks this month"
            description="Block off slots (lunch, meetings, personal time) so clients can't book."
            actionLabel="Add time block"
            onAction={openAdd}
          />
        ) : (
          <>
            <TouchableOpacity
              onPress={openAdd}
              style={twStyle("mb-3 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-100 py-3")}
            >
              <Ionicons name="add" size={18} color="#374151" />
              <Text style={twStyle("ml-2 font-medium text-gray-700")}>Add time block</Text>
            </TouchableOpacity>
            {blocks.map((block) => (
            <View
              key={block.id}
              style={twStyle("mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4")}
            >
              <View
                style={[twStyle("h-10 w-10 items-center justify-center rounded-xl"), {
                  backgroundColor: block.blocked_time_type_color
                    ? `${block.blocked_time_type_color}20`
                    : "#f3f4f6",
                }]}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={block.blocked_time_type_color || "#6b7280"}
                />
              </View>
              <View style={twStyle("ml-3 flex-1")}>
                <View style={twStyle("flex-row items-center")}>
                  <Text style={twStyle("flex-1 text-base font-semibold text-gray-900")} numberOfLines={1}>
                    {block.name}
                  </Text>
                  {block.is_recurring && (
                    <View style={twStyle("ml-2 rounded-full bg-blue-100 px-2 py-0.5")}>
                      <Text style={twStyle("text-xs font-medium text-blue-700")}>Weekly</Text>
                    </View>
                  )}
                </View>
                <Text style={twStyle("mt-0.5 text-sm text-gray-600")}>
                  {block.is_recurring
                    ? `Every ${format(new Date(`${block.date}T12:00:00`), "EEEE")} · ${block.start_time} – ${block.end_time}`
                    : `${block.date} · ${block.start_time} – ${block.end_time}`}
                </Text>
                {block.team_member_name && (
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {block.team_member_name}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(block)}
                style={twStyle("ml-2 h-9 w-9 items-center justify-center rounded-lg bg-red-50")}
              >
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ))}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add time block"
        subtitle="Block off a slot so clients can't book"
      >
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Name *</Text>
        <TextInput
          style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          placeholder="e.g. Lunch, Meeting"
          placeholderTextColor="#9ca3af"
          value={name}
          onChangeText={setName}
        />

        {activeStaff.length > 0 && (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Applies to</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={twStyle("mb-4")}
              contentContainerStyle={{}}
            >
              <TouchableOpacity
                style={[
                  twStyle(`flex-row items-center rounded-xl px-3 py-2 ${
                    selectedStaffId === null
                      ? "bg-indigo-600"
                      : "border border-gray-200 bg-gray-50"
                  }`),
                  { marginRight: 8 },
                ]}
                onPress={() => setSelectedStaffId(null)}
              >
                <Ionicons
                  name="people-outline"
                  size={16}
                  color={selectedStaffId === null ? "#fff" : "#6b7280"}
                />
                <Text
                  style={twStyle(`ml-2 text-sm font-medium ${
                    selectedStaffId === null ? "text-white" : "text-gray-700"
                  }`)}
                >
                  All team
                </Text>
              </TouchableOpacity>
              {activeStaff.map((member) => {
                const isSelected = selectedStaffId === member.id;
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      twStyle(`flex-row items-center rounded-xl px-3 py-2 ${
                        isSelected
                          ? "bg-indigo-600"
                          : "border border-gray-200 bg-gray-50"
                      }`),
                      { marginRight: 8 },
                    ]}
                    onPress={() => setSelectedStaffId(member.id)}
                  >
                    <Ionicons
                      name="person-outline"
                      size={16}
                      color={isSelected ? "#fff" : "#6b7280"}
                    />
                    <Text
                      style={twStyle(`ml-2 text-sm font-medium ${
                        isSelected ? "text-white" : "text-gray-700"
                      }`)}
                    >
                      {member.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Date</Text>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={twStyle("mb-4 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
        >
          <Ionicons name="calendar-outline" size={20} color="#6b7280" />
          <Text style={twStyle("ml-2 text-base text-gray-900")}>
            {format(blockDate, "EEE, d MMM yyyy")}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={blockDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              setShowDatePicker(Platform.OS === "ios");
              if (d) setBlockDate(d);
            }}
          />
        )}
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Start time</Text>
        <TouchableOpacity
          onPress={() => setShowStartPicker(true)}
          style={twStyle("mb-4 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
        >
          <Ionicons name="time-outline" size={20} color="#6b7280" />
          <Text style={twStyle("ml-2 text-base text-gray-900")}>{startTime}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            value={new Date(`2000-01-01T${startTime}:00`)}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              setShowStartPicker(Platform.OS === "ios");
              if (d) setStartTime(format(d, "HH:mm"));
            }}
          />
        )}
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>End time</Text>
        <TouchableOpacity
          onPress={() => setShowEndPicker(true)}
          style={twStyle("mb-4 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
        >
          <Ionicons name="time-outline" size={20} color="#6b7280" />
          <Text style={twStyle("ml-2 text-base text-gray-900")}>{endTime}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker
            value={new Date(`2000-01-01T${endTime}:00`)}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              setShowEndPicker(Platform.OS === "ios");
              if (d) setEndTime(format(d, "HH:mm"));
            }}
          />
        )}
        {/* Repeat weekly toggle */}
        <TouchableOpacity
          onPress={() => setIsRecurring((v) => !v)}
          style={twStyle("mb-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
          activeOpacity={0.7}
        >
          <View style={twStyle("flex-row items-center")}>
            <Ionicons name="repeat-outline" size={20} color={isRecurring ? "#2563eb" : "#6b7280"} />
            <View style={twStyle("ml-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>Repeat weekly</Text>
              {isRecurring && (
                <Text style={twStyle("mt-0.5 text-xs text-blue-600")}>
                  Repeats every {format(blockDate, "EEEE")}
                </Text>
              )}
            </View>
          </View>
          <View
            style={[
              twStyle("h-6 w-11 rounded-full"),
              { backgroundColor: isRecurring ? "#2563eb" : "#d1d5db" },
            ]}
          >
            <View
              style={[
                twStyle("h-5 w-5 rounded-full bg-white"),
                {
                  marginTop: 2,
                  marginLeft: isRecurring ? 22 : 2,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.15,
                  shadowRadius: 1,
                  elevation: 2,
                },
              ]}
            />
          </View>
        </TouchableOpacity>

        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Notes (optional)</Text>
        <TextInput
          style={[
            twStyle("mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"),
            { minHeight: 60, textAlignVertical: "top" },
          ]}
          placeholder="e.g. Team meeting, training"
          placeholderTextColor="#9ca3af"
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={200}
        />
        <ActionButton
          label={creating ? "Adding…" : "Add block"}
          onPress={handleCreate}
          loading={creating}
          fullWidth
        />
      </BottomSheet>
    </>
  );
}

export default function TimeBlocksScreen() {
  const now = new Date();
  const dateFrom = format(startOfMonth(now), "yyyy-MM-dd");
  const dateTo = format(endOfMonth(now), "yyyy-MM-dd");
  const { data } = useApi<TimeBlock[]>(`/api/provider/time-blocks?date_from=${dateFrom}&date_to=${dateTo}`);
  const blocks: TimeBlock[] = Array.isArray(data) ? data : [];
  const thisMonthLabel = format(now, "MMMM yyyy");

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Time Blocks"
        showBack
        subtitle={`${thisMonthLabel} · ${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
      />
      <TimeBlocksContent />
    </ScreenContainer>
  );
}
