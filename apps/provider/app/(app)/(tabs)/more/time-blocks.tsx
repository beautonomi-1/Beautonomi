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
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";

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
  is_active: boolean;
  notes: string | null;
}

/** Content-only for use in Schedule hub (Time blocks tab). */
export function TimeBlocksContent() {
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [blockDate, setBlockDate] = useState(() => new Date());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const now = new Date();
  const dateFrom = format(startOfMonth(now), "yyyy-MM-dd");
  const dateTo = format(endOfMonth(now), "yyyy-MM-dd");
  const url = `/api/provider/time-blocks?date_from=${dateFrom}&date_to=${dateTo}`;

  const { data, loading, error, refresh } = useApi<TimeBlock[]>(url);
  const { execute: postBlock, loading: creating } = useApiMutation<TimeBlock>("post");
  const { execute: deleteBlock } = useApiMutation("delete");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const blocks: TimeBlock[] = Array.isArray(data) ? data : [];

  const openAdd = () => {
    setName("");
    setBlockDate(new Date());
    setStartTime("09:00");
    setEndTime("17:00");
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
      date: dateStr,
      start_time: startTime,
      end_time: endTime,
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
      <View className="flex-1 items-center justify-center py-12">
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View className="flex-1 justify-center px-4">
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
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
              className="mb-3 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-100 py-3"
            >
              <Ionicons name="add" size={18} color="#374151" />
              <Text className="ml-2 font-medium text-gray-700">Add time block</Text>
            </TouchableOpacity>
            {blocks.map((block) => (
            <View
              key={block.id}
              className="mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: block.blocked_time_type_color
                    ? `${block.blocked_time_type_color}20`
                    : "#f3f4f6",
                }}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={block.blocked_time_type_color || "#6b7280"}
                />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
                  {block.name}
                </Text>
                <Text className="mt-0.5 text-sm text-gray-600">
                  {block.date} · {block.start_time} – {block.end_time}
                </Text>
                {block.team_member_name && (
                  <Text className="mt-0.5 text-xs text-gray-500">
                    {block.team_member_name}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(block)}
                className="ml-2 h-9 w-9 items-center justify-center rounded-lg bg-red-50"
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
        <Text className="mb-2 text-sm font-medium text-gray-700">Name *</Text>
        <TextInput
          className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder="e.g. Lunch, Meeting"
          placeholderTextColor="#9ca3af"
          value={name}
          onChangeText={setName}
        />
        <Text className="mb-2 text-sm font-medium text-gray-700">Date</Text>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          className="mb-4 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
        >
          <Ionicons name="calendar-outline" size={20} color="#6b7280" />
          <Text className="ml-2 text-base text-gray-900">
            {format(blockDate, "EEE, d MMM yyyy")}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={blockDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, d) => {
              setShowDatePicker(Platform.OS === "ios");
              if (d) setBlockDate(d);
            }}
          />
        )}
        <Text className="mb-2 text-sm font-medium text-gray-700">Start time</Text>
        <TouchableOpacity
          onPress={() => setShowStartPicker(true)}
          className="mb-4 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
        >
          <Ionicons name="time-outline" size={20} color="#6b7280" />
          <Text className="ml-2 text-base text-gray-900">{startTime}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            value={new Date(`2000-01-01T${startTime}:00`)}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, d) => {
              setShowStartPicker(Platform.OS === "ios");
              if (d) setStartTime(format(d, "HH:mm"));
            }}
          />
        )}
        <Text className="mb-2 text-sm font-medium text-gray-700">End time</Text>
        <TouchableOpacity
          onPress={() => setShowEndPicker(true)}
          className="mb-6 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
        >
          <Ionicons name="time-outline" size={20} color="#6b7280" />
          <Text className="ml-2 text-base text-gray-900">{endTime}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker
            value={new Date(`2000-01-01T${endTime}:00`)}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, d) => {
              setShowEndPicker(Platform.OS === "ios");
              if (d) setEndTime(format(d, "HH:mm"));
            }}
          />
        )}
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
