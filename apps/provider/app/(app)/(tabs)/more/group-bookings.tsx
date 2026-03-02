import { useState, useCallback, useMemo } from "react";
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
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate } from "@/lib/format";

interface Participant {
  id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  status: string;
  paid: boolean;
}

interface GroupBooking {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  max_participants?: number;
  current_participants?: number;
  team_member_id: string | null;
  team_member_name?: string | null;
  service_id: string | null;
  service_name?: string | null;
  total_price: number;
  price_per_person?: number;
  status: string;
  notes: string | null;
  location_id: string | null;
  location_name?: string | null;
  ref_number: string | null;
  participants?: Participant[];
  created_at: string;
}

interface GroupBookingsResponse {
  data: GroupBooking[];
  total: number;
  page: number;
  total_pages: number;
}

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Upcoming", value: "confirmed" },
  { label: "In Progress", value: "started" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

function statusStyle(s: string) {
  if (s === "confirmed") return { bg: "bg-blue-50", text: "text-blue-700" };
  if (s === "started") return { bg: "bg-amber-50", text: "text-amber-700" };
  if (s === "completed") return { bg: "bg-green-50", text: "text-green-700" };
  if (s === "cancelled") return { bg: "bg-red-50", text: "text-red-700" };
  return { bg: "bg-gray-100", text: "text-gray-500" };
}

export default function GroupBookingsScreen() {
  useResponsive();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupBooking | null>(null);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [participantForm, setParticipantForm] = useState({ name: "", phone: "", email: "" });
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ date: "", time: "", duration: "", notes: "", maxParticipants: "" });

  const statusParam = filter !== "all" ? `&status=${filter}` : "";
  const { data: groupData, loading, refresh } = useApi<GroupBookingsResponse>(
    `/api/provider/group-bookings?limit=50${statusParam}`
  );
  const { execute: updateGroup, loading: updatingGroup } = useApiMutation("patch");
  const { execute: cancelGroup } = useApiMutation("delete");
  const { execute: addParticipant, loading: addingParticipant } = useApiMutation("post");
  const { execute: removeParticipant } = useApiMutation("delete");

  const groups = useMemo(() => groupData?.data ?? [], [groupData?.data]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.ref_number?.toLowerCase().includes(q) ||
        g.service_name?.toLowerCase().includes(q) ||
        g.team_member_name?.toLowerCase().includes(q) ||
        g.scheduled_date?.includes(q)
    );
  }, [groups, search]);

  const stats = useMemo(() => {
    const upcoming = groups.filter((g) => g.status === "confirmed").length;
    const totalParticipants = groups.reduce((s, g) => s + (g.current_participants ?? 0), 0);
    const revenue = groups.filter((g) => g.status === "completed").reduce((s, g) => s + g.total_price, 0);
    return { total: groupData?.total ?? groups.length, upcoming, totalParticipants, revenue };
  }, [groups, groupData]);

  async function handleCancel(group: GroupBooking) {
    Alert.alert("Cancel Group Booking", "This will cancel the entire group session.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Booking",
        style: "destructive",
        onPress: async () => {
          const { error } = await cancelGroup(`/api/provider/group-bookings/${group.id}`);
          if (error) Alert.alert("Error", error);
          else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSelectedGroup(null);
            refresh();
          }
        },
      },
    ]);
  }

  async function handleStatusChange(group: GroupBooking, newStatus: string) {
    const { error } = await updateGroup(`/api/provider/group-bookings/${group.id}`, {
      status: newStatus,
    });
    if (error) { Alert.alert("Error", error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedGroup(null);
    refresh();
  }

  function openEdit(group: GroupBooking) {
    setEditForm({
      date: group.scheduled_date,
      time: group.scheduled_time?.substring(0, 5) ?? "",
      duration: String(group.duration_minutes),
      notes: group.notes ?? "",
      maxParticipants: String(group.max_participants ?? ""),
    });
    setSelectedGroup(null);
    setShowEdit(true);
  }

  async function handleSaveEdit() {
    if (!selectedGroup && !showEdit) return;
    const groupId = selectedGroup?.id;
    if (!groupId && !editForm.date) return;

    const { error } = await updateGroup(
      `/api/provider/group-bookings/${selectedGroup?.id ?? ""}`,
      {
        scheduled_date: editForm.date || undefined,
        scheduled_time: editForm.time || undefined,
        duration_minutes: editForm.duration ? Number(editForm.duration) : undefined,
        notes: editForm.notes.trim() || undefined,
        max_participants: editForm.maxParticipants ? Number(editForm.maxParticipants) : undefined,
      }
    );
    if (error) { Alert.alert("Error", error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowEdit(false);
    refresh();
  }

  function openAddParticipant() {
    setParticipantForm({ name: "", phone: "", email: "" });
    setShowAddParticipant(true);
  }

  async function handleAddParticipant() {
    if (!selectedGroup || !participantForm.name.trim()) {
      Alert.alert("Required", "Participant name is required");
      return;
    }
    const { error } = await addParticipant(
      `/api/provider/group-bookings/${selectedGroup.id}/participants`,
      {
        customer_name: participantForm.name.trim(),
        customer_phone: participantForm.phone.trim() || undefined,
        customer_email: participantForm.email.trim() || undefined,
      }
    );
    if (error) { Alert.alert("Error", error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAddParticipant(false);
    refresh();
  }

  async function handleRemoveParticipant(participant: Participant) {
    if (!selectedGroup) return;
    Alert.alert("Remove Participant", `Remove ${participant.customer_name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const { error } = await removeParticipant(
            `/api/provider/group-bookings/${selectedGroup.id}/participants/${participant.id}`
          );
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
    ]);
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Group Bookings"
        showBack
        subtitle={`${stats.total} sessions`}
      />

      <View style={{ flex: 1, minHeight: 0 }}>
      <View className="mb-3 flex-row gap-2">
        <View className="flex-1">
          <StatCard title="Total" value={String(stats.total)} icon="people-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
        </View>
        <View className="flex-1">
          <StatCard title="Upcoming" value={String(stats.upcoming)} icon="calendar-outline" iconColor="#3b82f6" iconBg="bg-blue-50" compact />
        </View>
        <View className="flex-1">
          <StatCard title="Revenue" value={formatCurrency(stats.revenue)} icon="cash-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by ref, service, staff..." />

      <View className="my-3">
        <FilterChipGroup options={STATUS_FILTERS} selected={filter} onSelect={setFilter} />
      </View>

      {loading && !groups.length ? (
        <SkeletonList rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="people-outline" title="No group bookings" description="Group sessions will appear here" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(g: GroupBooking) => g.id}
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={true}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120, gap: 10 }}
          renderItem={({ item: group }: { item: GroupBooking }) => {
            const ss = statusStyle(group.status);
            return (
              <TouchableOpacity
                className="rounded-xl border border-gray-100 bg-white p-4"
                onPress={() => setSelectedGroup(group)}
                activeOpacity={0.7}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-base font-semibold text-gray-900">
                        {group.service_name ?? group.ref_number ?? "Group Session"}
                      </Text>
                      <View className={`rounded-full px-2 py-0.5 ${ss.bg}`}>
                        <Text className={`text-[10px] font-medium capitalize ${ss.text}`}>
                          {group.status}
                        </Text>
                      </View>
                    </View>
                    <Text className="mt-0.5 text-xs text-gray-500">
                      {formatDate(group.scheduled_date)} at {group.scheduled_time?.substring(0, 5)} · {group.duration_minutes}min
                    </Text>
                    <View className="mt-1.5 flex-row items-center gap-3">
                      {group.team_member_name && (
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="person-outline" size={12} color="#6b7280" />
                          <Text className="text-xs text-gray-500">{group.team_member_name}</Text>
                        </View>
                      )}
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="people-outline" size={12} color="#6b7280" />
                        <Text className="text-xs text-gray-500">
                          {group.current_participants ?? 0}
                          {group.max_participants ? `/${group.max_participants}` : ""} participants
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text className="text-base font-bold text-gray-900">
                    {formatCurrency(group.total_price)}
                  </Text>
                </View>

                {group.ref_number && (
                  <Text className="mt-1 text-[10px] text-gray-400">#{group.ref_number}</Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      </View>

      {/* Group detail sheet */}
      <BottomSheet
        visible={!!selectedGroup && !showEdit && !showAddParticipant}
        onClose={() => setSelectedGroup(null)}
        title={selectedGroup?.service_name ?? selectedGroup?.ref_number ?? "Group Session"}
      >
        {selectedGroup && (
          <View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm text-gray-500">
                {formatDate(selectedGroup.scheduled_date)} at {selectedGroup.scheduled_time?.substring(0, 5)}
              </Text>
              <View className={`rounded-full px-3 py-1 ${statusStyle(selectedGroup.status).bg}`}>
                <Text className={`text-xs font-medium capitalize ${statusStyle(selectedGroup.status).text}`}>
                  {selectedGroup.status}
                </Text>
              </View>
            </View>

            <View className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <View className="flex-row justify-between mb-1">
                <Text className="text-sm text-gray-500">Duration</Text>
                <Text className="text-sm text-gray-700">{selectedGroup.duration_minutes} min</Text>
              </View>
              {selectedGroup.team_member_name && (
                <View className="flex-row justify-between mb-1">
                  <Text className="text-sm text-gray-500">Staff</Text>
                  <Text className="text-sm text-gray-700">{selectedGroup.team_member_name}</Text>
                </View>
              )}
              {selectedGroup.price_per_person && (
                <View className="flex-row justify-between mb-1">
                  <Text className="text-sm text-gray-500">Per Person</Text>
                  <Text className="text-sm text-gray-700">{formatCurrency(selectedGroup.price_per_person)}</Text>
                </View>
              )}
              <View className="flex-row justify-between mb-1">
                <Text className="text-sm text-gray-500">Participants</Text>
                <Text className="text-sm text-gray-700">
                  {selectedGroup.current_participants ?? 0}
                  {selectedGroup.max_participants ? ` / ${selectedGroup.max_participants}` : ""}
                </Text>
              </View>
              <View className="mt-1 border-t border-gray-200 pt-2 flex-row justify-between">
                <Text className="text-base font-bold text-gray-900">Total</Text>
                <Text className="text-base font-bold text-gray-900">{formatCurrency(selectedGroup.total_price)}</Text>
              </View>
            </View>

            {selectedGroup.notes && (
              <View className="mb-3 rounded-lg bg-gray-50 p-3">
                <Text className="text-xs text-gray-600">{selectedGroup.notes}</Text>
              </View>
            )}

            {/* Participants */}
            <View className="mb-3">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs font-semibold uppercase text-gray-400">Participants</Text>
                {selectedGroup.status !== "completed" && selectedGroup.status !== "cancelled" && (
                  <TouchableOpacity
                    className="flex-row items-center gap-1"
                    onPress={openAddParticipant}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#6366f1" />
                    <Text className="text-xs font-medium text-indigo-600">Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              {(selectedGroup.participants ?? []).length === 0 ? (
                <View className="rounded-lg bg-gray-50 p-3">
                  <Text className="text-center text-xs text-gray-400">No participants yet</Text>
                </View>
              ) : (
                (selectedGroup.participants ?? []).map((p) => (
                  <View key={p.id} className="mb-1.5 flex-row items-center rounded-lg bg-gray-50 p-3">
                    <Avatar name={p.customer_name} size="sm" />
                    <View className="ml-2 flex-1">
                      <Text className="text-sm font-medium text-gray-900">{p.customer_name}</Text>
                      {p.customer_phone && (
                        <Text className="text-xs text-gray-400">{p.customer_phone}</Text>
                      )}
                    </View>
                    <View className="flex-row items-center gap-2">
                      <View className={`rounded-full px-2 py-0.5 ${p.paid ? "bg-green-50" : "bg-amber-50"}`}>
                        <Text className={`text-[10px] font-medium ${p.paid ? "text-green-700" : "text-amber-700"}`}>
                          {p.paid ? "Paid" : "Unpaid"}
                        </Text>
                      </View>
                      {selectedGroup.status !== "completed" && selectedGroup.status !== "cancelled" && (
                        <TouchableOpacity onPress={() => handleRemoveParticipant(p)} hitSlop={8}>
                          <Ionicons name="close-circle" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Actions */}
            {selectedGroup.status !== "completed" && selectedGroup.status !== "cancelled" && (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="flex-1 items-center rounded-lg bg-indigo-50 py-2.5"
                  onPress={() => openEdit(selectedGroup)}
                >
                  <Text className="text-sm font-medium text-indigo-700">Edit</Text>
                </TouchableOpacity>
                {selectedGroup.status === "confirmed" && (
                  <TouchableOpacity
                    className="flex-1 items-center rounded-lg bg-green-50 py-2.5"
                    onPress={() => handleStatusChange(selectedGroup, "started")}
                  >
                    <Text className="text-sm font-medium text-green-700">Start</Text>
                  </TouchableOpacity>
                )}
                {selectedGroup.status === "started" && (
                  <TouchableOpacity
                    className="flex-1 items-center rounded-lg bg-green-50 py-2.5"
                    onPress={() => handleStatusChange(selectedGroup, "completed")}
                  >
                    <Text className="text-sm font-medium text-green-700">Complete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  className="flex-1 items-center rounded-lg bg-red-50 py-2.5"
                  onPress={() => handleCancel(selectedGroup)}
                >
                  <Text className="text-sm font-medium text-red-700">Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </BottomSheet>

      {/* Edit form */}
      <BottomSheet visible={showEdit} onClose={() => setShowEdit(false)} title="Edit Group Booking">
        <View>
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Date</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={editForm.date}
                onChangeText={(t) => setEditForm((p) => ({ ...p, date: t }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Time</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={editForm.time}
                onChangeText={(t) => setEditForm((p) => ({ ...p, time: t }))}
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Duration (min)</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={editForm.duration}
                onChangeText={(t) => setEditForm((p) => ({ ...p, duration: t }))}
                keyboardType="number-pad"
                placeholder="60"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Max Participants</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={editForm.maxParticipants}
                onChangeText={(t) => setEditForm((p) => ({ ...p, maxParticipants: t }))}
                keyboardType="number-pad"
                placeholder="No limit"
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
            multiline
          />
          <ActionButton label="Save Changes" onPress={handleSaveEdit} loading={updatingGroup} fullWidth />
        </View>
      </BottomSheet>

      {/* Add participant */}
      <BottomSheet visible={showAddParticipant} onClose={() => setShowAddParticipant(false)} title="Add Participant">
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Name *</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={participantForm.name}
            onChangeText={(t) => setParticipantForm((p) => ({ ...p, name: t }))}
            placeholder="Client name"
            placeholderTextColor="#9ca3af"
          />
          <Text className="mb-1 text-sm font-medium text-gray-700">Phone</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={participantForm.phone}
            onChangeText={(t) => setParticipantForm((p) => ({ ...p, phone: t }))}
            placeholder="Optional"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
          />
          <Text className="mb-1 text-sm font-medium text-gray-700">Email</Text>
          <TextInput
            className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={participantForm.email}
            onChangeText={(t) => setParticipantForm((p) => ({ ...p, email: t }))}
            placeholder="Optional"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
          />
          <ActionButton label="Add Participant" onPress={handleAddParticipant} loading={addingParticipant} fullWidth />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
