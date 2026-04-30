/**
 * Staff member detail – profile, quick actions (permissions, locations, schedule, etc.).
 * GET /api/provider/staff/[id], PATCH for inline edit, DELETE for removal.
 */
import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { capitalizeFirst } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  role: string;
  commission_rate?: number | null;
  is_active: boolean;
  mobileReady?: boolean;
  locations?: {
    location_id: string;
    location_name: string | null;
    location_city?: string | null;
    is_primary: boolean;
  }[];
  service_ids?: string[];
}

interface ServiceItem {
  id: string;
  title: string;
}

interface Shift {
  id: string | null;
  day_of_week: string;
  start_time: string | null;
  end_time: string | null;
  is_working?: boolean;
}

interface DayOff {
  id: string;
  date: string;
  reason?: string | null;
  type?: string | null;
}

interface StaffBooking {
  id: string;
  booking_number?: string | null;
  status: string;
  scheduled_at: string;
  customer_name?: string | null;
  service_names?: string[];
  total_amount?: number;
  currency?: string;
}

interface WeeklyStat {
  day: string;
  count: number;
}

const ROLES = [
  { label: "Staff", value: "provider_staff" },
  { label: "Manager", value: "provider_manager" },
  { label: "Owner", value: "provider_owner" },
];

interface TeamAccessPayload {
  staff_id: string | null;
  is_business_owner?: boolean;
  can_manage_team: boolean;
}

const LINK_ITEMS: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  useId?: boolean;
  passStaffId?: string;
}[] = [
  {
    label: "Permissions",
    icon: "lock-open-outline",
    route: "/(app)/(tabs)/more/settings/staff-permissions",
    useId: true,
  },
  {
    label: "Notifications",
    icon: "notifications-outline",
    route: "/(app)/(tabs)/more/settings/staff-notifications",
    useId: true,
  },
  {
    label: "Schedule",
    icon: "calendar-outline",
    route: "/(app)/(tabs)/more/staff-schedule",
    passStaffId: "staffId",
  },
  {
    label: "Days off",
    icon: "sunny-outline",
    route: "/(app)/(tabs)/more/days-off",
    passStaffId: "staffId",
  },
  {
    label: "Commission",
    icon: "cash-outline",
    route: "/(app)/(tabs)/more/settings/team-commissions",
  },
  {
    label: "Locations",
    icon: "location-outline",
    route: "/(app)/(tabs)/more/locations",
  },
];

export default function TeamMemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    avatar_url: "",
    role: "provider_staff",
    commission_rate: "",
  });

  const { data: access } = useApi<TeamAccessPayload>("/api/provider/team-access");
  const canManageTeam =
    access?.is_business_owner === true || access?.can_manage_team === true;
  const isSelf = Boolean(id && access?.staff_id === id);

  const { data: member, loading, error, refresh } = useApi<StaffMember>(
    id ? `/api/provider/staff/${id}` : "",
    { enabled: !!id }
  );
  const { data: services } = useApi<ServiceItem[]>("/api/provider/services");
  const { data: shifts, refresh: refreshShifts } = useApi<Shift[]>(
    id ? `/api/provider/staff/${id}/shifts` : "",
    { enabled: !!id }
  );
  const { data: daysOff, refresh: refreshDaysOff } = useApi<DayOff[]>(
    id ? `/api/provider/staff/${id}/days-off` : "",
    { enabled: !!id }
  );
  const { data: bookings, refresh: refreshBookings } = useApi<StaffBooking[]>(
    id ? `/api/provider/staff/${id}/bookings?limit=5` : "",
    { enabled: !!id }
  );
  const { data: weeklyStats } = useApi<WeeklyStat[]>(
    id ? `/api/provider/staff/${id}/stats/weekly` : "",
    { enabled: !!id }
  );
  const { execute: updateStaff, loading: saving } = useApiMutation("patch");
  const { execute: deleteStaff, loading: deleting } = useApiMutation("delete");
  const { execute: postAction, loading: actionBusy } = useApiMutation("post");

  const visibleLinks = LINK_ITEMS.filter((item) => {
    if (item.label === "Permissions" || item.label === "Notifications") {
      return isSelf || canManageTeam;
    }
    if (item.label === "Schedule" || item.label === "Days off") {
      return canManageTeam || isSelf;
    }
    if (item.label === "Commission" || item.label === "Locations") {
      return canManageTeam;
    }
    return true;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshShifts(), refreshDaysOff(), refreshBookings()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshShifts, refreshDaysOff, refreshBookings]);

  const serviceNames = (services ?? [])
    .filter((svc) => member?.service_ids?.includes(svc.id))
    .map((svc) => svc.title);
  const upcomingDaysOff = (daysOff ?? []).filter((d) => {
    const day = new Date(`${d.date}T12:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return day >= today;
  });
  const weeklyBookings = (weeklyStats ?? []).reduce((sum, row) => sum + Number(row.count || 0), 0);

  const openEdit = useCallback(() => {
    if (!member) return;
    setEditForm({
      name: member.name,
      phone: member.phone ?? "",
      avatar_url: member.avatar_url ?? "",
      role: member.role,
      commission_rate: member.commission_rate != null ? String(member.commission_rate) : "",
    });
    setEditOpen(true);
  }, [member]);

  const handleSaveEdit = useCallback(async () => {
    if (!editForm.name.trim()) {
      Alert.alert("Validation", "Name is required.");
      return;
    }
    const phoneErr = editForm.phone ? validateE164Phone(editForm.phone) : null;
    if (phoneErr) {
      Alert.alert("Invalid phone", phoneErr);
      return;
    }
    const avatarUrl = editForm.avatar_url.trim();
    if (avatarUrl && !/^https?:\/\/.+/i.test(avatarUrl)) {
      Alert.alert("Invalid avatar URL", "Use a full image URL that starts with https:// or http://.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload: Record<string, unknown> = {
      name: editForm.name.trim(),
      phone: editForm.phone.trim() || null,
      avatar_url: avatarUrl || null,
    };
    if (canManageTeam) {
      payload.role = editForm.role;
      if (editForm.commission_rate.trim()) {
        const rate = parseFloat(editForm.commission_rate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          Alert.alert("Validation", "Commission must be between 0 and 100.");
          return;
        }
        payload.commission_rate = rate;
      } else {
        payload.commission_rate = null;
      }
    }
    const { error: err } = await updateStaff(`/api/provider/staff/${id}`, payload);
    if (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", err);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditOpen(false);
      refresh();
      // §Provider-audit 2026-04: surface an explicit confirmation after a
      // team-member save so the user sees Save landed (haptic alone wasn't
      // enough for owners managing multiple members).
      Alert.alert("Team member updated", "Changes saved successfully.");
    }
  }, [editForm, id, updateStaff, refresh, canManageTeam]);

  const handleToggleActive = useCallback(() => {
    if (!member || !canManageTeam) return;
    const newActive = !member.is_active;
    Alert.alert(
      newActive ? "Activate member" : "Deactivate member",
      newActive
        ? `Activate ${member.name}? They will appear in the team and can be assigned to bookings.`
        : `Deactivate ${member.name}? They will be hidden from the team and unavailable for new bookings.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: newActive ? "Activate" : "Deactivate",
          style: newActive ? "default" : "destructive",
          onPress: async () => {
            const { error: err } = await updateStaff(`/api/provider/staff/${id}`, { is_active: newActive });
            if (err) Alert.alert("Error", err);
            else refresh();
          },
        },
      ]
    );
  }, [member, id, updateStaff, refresh, canManageTeam]);

  const handleDelete = useCallback(() => {
    if (!member || !canManageTeam) return;
    Alert.alert(
      "Remove team member",
      `Remove ${member.name} from your team? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const { error: err } = await deleteStaff(`/api/provider/staff/${id}`, {});
            if (err) {
              Alert.alert("Error", err);
            } else {
              router.back();
            }
          },
        },
      ]
    );
  }, [member, id, deleteStaff, router, canManageTeam]);

  const handleSendInvite = useCallback(async () => {
    if (!id || !member?.email || !canManageTeam) return;
    const { error: err } = await postAction(`/api/provider/staff/${id}/invite`, {
      email: member.email,
    });
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Invite sent", `Invitation sent to ${member.email}.`);
  }, [id, member?.email, postAction, canManageTeam]);

  const handleResetPassword = useCallback(async () => {
    if (!id || !canManageTeam) return;
    const { error: err } = await postAction(`/api/provider/staff/${id}/reset-password`, {});
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Reset sent", "Password reset email has been sent.");
  }, [id, postAction, canManageTeam]);

  if (loading && !member) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team member" showBack />
        <LoadingState message="Loading..." />
      </ScreenContainer>
    );
  }

  if (error && !member) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team member" showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  if (!member) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team member" showBack />
        <View style={twStyle("flex-1 items-center justify-center p-6")}>
          <Text style={twStyle("text-gray-500")}>Member not found</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={member.name}
        showBack
        subtitle={capitalizeFirst(member.role)}
        rightAction={
          canManageTeam || isSelf ? (
            <TouchableOpacity
              onPress={openEdit}
              style={twStyle("rounded-xl bg-gray-100 px-3 py-1.5")}
              accessibilityLabel="Edit team member"
              accessibilityRole="button"
            >
              <Text style={twStyle("text-sm font-semibold text-gray-700")}>Edit</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar & status */}
        <View style={twStyle("items-center px-4 pt-4 pb-6")}>
          <Avatar name={member.name} imageUrl={member.avatar_url ?? undefined} size="xl" />
          <Text style={twStyle("mt-2 text-xl font-bold text-gray-900")}>{member.name}</Text>
          <Text style={twStyle("mt-0.5 text-sm text-gray-500")}>{capitalizeFirst(member.role)}</Text>
          <View style={twStyle("mt-2 flex-row items-center")}>
            <View
              style={twStyle(`h-2.5 w-2.5 rounded-full ${member.is_active ? "bg-green-500" : "bg-gray-400"}`)}
            />
            <Text style={twStyle("ml-2 text-sm text-gray-600")}>
              {member.is_active ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>

        {/* Contact & commission info */}
        <View style={twStyle("mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <Row label="Email" value={member.email} />
          {member.phone ? <Row label="Phone" value={member.phone} /> : null}
          {member.commission_rate != null ? (
            <Row label="Commission" value={`${member.commission_rate}%`} />
          ) : null}
          <Row label="Mobile" value={member.mobileReady ? "Ready" : "Not marked ready"} />
        </View>

        <View style={twStyle("mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>Profile readiness</Text>
          <ChecklistRow
            complete={Boolean(member.avatar_url)}
            label={member.avatar_url ? "Avatar added" : "Add an avatar so clients and staff can identify them quickly"}
          />
          <ChecklistRow
            complete={Boolean(member.phone)}
            label={member.phone ? "Phone number added" : "Add a phone number for shift and booking communication"}
          />
          <ChecklistRow
            complete={(member.locations ?? []).length > 0}
            label={(member.locations ?? []).length > 0 ? "Locations assigned" : "Assign locations before routing bookings to this staff member"}
          />
          <ChecklistRow
            complete={(member.service_ids ?? []).length > 0}
            label={(member.service_ids ?? []).length > 0 ? "Services assigned" : "Assign services they are allowed to perform"}
          />
        </View>

        <View style={twStyle("mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>Work setup</Text>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400")}>Locations</Text>
          {(member.locations ?? []).length > 0 ? (
            <View style={twStyle("mt-2 flex-row flex-wrap")}>
              {(member.locations ?? []).map((loc) => (
                <View key={loc.location_id} style={twStyle("mb-2 mr-2 rounded-full bg-gray-100 px-3 py-1.5")}>
                  <Text style={twStyle("text-xs font-medium text-gray-700")}>
                    {loc.location_name || "Location"}
                    {loc.is_primary ? " · primary" : ""}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={twStyle("mt-1 text-sm text-gray-500")}>All provider locations or not assigned yet.</Text>
          )}
          <Text style={twStyle("mt-3 text-xs font-semibold uppercase tracking-wide text-gray-400")}>Services</Text>
          {serviceNames.length > 0 ? (
            <View style={twStyle("mt-2 flex-row flex-wrap")}>
              {serviceNames.slice(0, 8).map((name) => (
                <View key={name} style={twStyle("mb-2 mr-2 rounded-full bg-indigo-50 px-3 py-1.5")}>
                  <Text style={twStyle("text-xs font-medium text-indigo-700")}>{name}</Text>
                </View>
              ))}
              {serviceNames.length > 8 ? (
                <Text style={twStyle("mt-1 text-xs text-gray-500")}>+{serviceNames.length - 8} more</Text>
              ) : null}
            </View>
          ) : (
            <Text style={twStyle("mt-1 text-sm text-gray-500")}>No specific services assigned.</Text>
          )}
        </View>

        {canManageTeam ? (
          <View style={twStyle("mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-2")}>
            <TouchableOpacity
              style={twStyle("flex-row items-center rounded-xl px-3 py-3")}
              onPress={handleSendInvite}
              disabled={actionBusy || !member.email}
              accessibilityLabel="Send team invite"
              accessibilityRole="button"
            >
              <Ionicons name="mail-outline" size={18} color="#374151" />
              <Text style={twStyle("ml-2 flex-1 text-sm font-medium text-gray-800")}>
                Send invite
              </Text>
            </TouchableOpacity>
            <View style={twStyle("mx-2 h-px bg-gray-100")} />
            <TouchableOpacity
              style={twStyle("flex-row items-center rounded-xl px-3 py-3")}
              onPress={handleResetPassword}
              disabled={actionBusy || !member.email}
              accessibilityLabel="Send password reset"
              accessibilityRole="button"
            >
              <Ionicons name="key-outline" size={18} color="#374151" />
              <Text style={twStyle("ml-2 flex-1 text-sm font-medium text-gray-800")}>
                Send password reset
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Quick actions */}
        <View style={twStyle("mx-4 mb-4")}>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 px-1")}>
            Manage
          </Text>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white overflow-hidden")}>
            {visibleLinks.map((item, i) => (
              <TouchableOpacity
                key={item.label}
                style={twStyle(
                  `flex-row items-center px-4 py-3.5 ${i < visibleLinks.length - 1 ? "border-b border-gray-50" : ""}`
                )}
                onPress={() => {
                  if (item.useId && id) {
                    router.push(`${item.route}/${id}` as never);
                  } else if (item.passStaffId && id) {
                    router.push(`${item.route}?${item.passStaffId}=${id}` as never);
                  } else {
                    router.push(item.route as never);
                  }
                }}
                accessibilityLabel={item.label}
                accessibilityRole="button"
              >
                <View style={twStyle("mr-3 h-9 w-9 items-center justify-center rounded-xl bg-gray-50")}>
                  <Ionicons name={item.icon} size={20} color="#374151" />
                </View>
                <Text style={twStyle("flex-1 text-base text-gray-900")}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={twStyle("mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-semibold text-gray-900")}>Schedule snapshot</Text>
            <Text style={twStyle("text-xs text-gray-500")}>{weeklyBookings} bookings this week</Text>
          </View>
          {(shifts ?? []).filter((s) => s.is_working !== false && s.start_time && s.end_time).slice(0, 7).map((shift) => (
            <View key={`${shift.day_of_week}-${shift.id ?? "default"}`} style={twStyle("mt-3 flex-row items-center")}>
              <Text style={twStyle("w-24 text-sm font-medium text-gray-700")}>{shift.day_of_week}</Text>
              <Text style={twStyle("text-sm text-gray-600")}>{shift.start_time} - {shift.end_time}</Text>
            </View>
          ))}
          {(shifts ?? []).filter((s) => s.is_working !== false && s.start_time && s.end_time).length === 0 ? (
            <Text style={twStyle("mt-2 text-sm text-gray-500")}>No weekly shifts set yet.</Text>
          ) : null}
          <TouchableOpacity
            onPress={() => router.push(`/(app)/(tabs)/more/staff-schedule?staffId=${id}` as never)}
            style={twStyle("mt-4 flex-row items-center justify-center rounded-xl bg-indigo-50 py-3")}
          >
            <Ionicons name="calendar-outline" size={16} color="#4f46e5" />
            <Text style={twStyle("ml-2 text-sm font-semibold text-indigo-700")}>Edit shifts</Text>
          </TouchableOpacity>
        </View>

        <View style={twStyle("mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-semibold text-gray-900")}>Time off & history</Text>
            <TouchableOpacity onPress={() => router.push(`/(app)/(tabs)/more/days-off?staffId=${id}` as never)}>
              <Text style={twStyle("text-xs font-semibold text-indigo-600")}>Manage</Text>
            </TouchableOpacity>
          </View>
          {upcomingDaysOff.slice(0, 4).map((day) => (
            <View key={day.id} style={twStyle("mt-3 flex-row items-start")}>
              <Ionicons name="sunny-outline" size={16} color="#d97706" style={{ marginTop: 1 }} />
              <View style={twStyle("ml-2 flex-1")}>
                <Text style={twStyle("text-sm font-medium text-gray-800")}>
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
                {day.reason || day.type ? (
                  <Text style={twStyle("text-xs text-gray-500")}>{day.reason || day.type}</Text>
                ) : null}
              </View>
            </View>
          ))}
          {upcomingDaysOff.length === 0 ? (
            <Text style={twStyle("mt-2 text-sm text-gray-500")}>No upcoming days off.</Text>
          ) : null}
        </View>

        <View style={twStyle("mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Recent bookings</Text>
          {(bookings ?? []).slice(0, 5).map((booking) => (
            <TouchableOpacity
              key={booking.id}
              onPress={() => router.push(`/(app)/(tabs)/more/bookings/${booking.id}` as never)}
              style={twStyle("border-t border-gray-50 py-3")}
            >
              <View style={twStyle("flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                  {booking.customer_name || "Customer"}
                </Text>
                <Text style={twStyle("text-xs text-gray-500")}>{booking.status}</Text>
              </View>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                {new Date(booking.scheduled_at).toLocaleString()} · {(booking.service_names ?? []).join(", ") || "Service"}
              </Text>
            </TouchableOpacity>
          ))}
          {(bookings ?? []).length === 0 ? (
            <Text style={twStyle("text-sm text-gray-500")}>No booking history for this staff member yet.</Text>
          ) : null}
        </View>

        {/* Active/inactive toggle */}
        {canManageTeam ? (
        <View style={twStyle("mx-4 mb-3")}>
          <TouchableOpacity
            style={twStyle(
              `flex-row items-center justify-center rounded-2xl border py-3.5 ${
                member.is_active ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"
              }`
            )}
            onPress={handleToggleActive}
            disabled={saving}
            accessibilityLabel={member.is_active ? "Deactivate member" : "Activate member"}
            accessibilityRole="button"
          >
            <Ionicons
              name={member.is_active ? "pause-circle-outline" : "play-circle-outline"}
              size={20}
              color={member.is_active ? "#d97706" : "#16a34a"}
            />
            <Text
              style={twStyle(`ml-2 font-semibold ${member.is_active ? "text-amber-700" : "text-green-700"}`)}
            >
              {member.is_active ? "Deactivate member" : "Activate member"}
            </Text>
          </TouchableOpacity>
        </View>
        ) : null}

        {/* Delete */}
        {canManageTeam ? (
        <View style={twStyle("mx-4 mb-6")}>
          <TouchableOpacity
            style={twStyle("flex-row items-center justify-center rounded-2xl border border-red-200 bg-red-50 py-3.5")}
            onPress={handleDelete}
            disabled={deleting}
            accessibilityLabel="Remove team member"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
            <Text style={twStyle("ml-2 font-semibold text-red-700")}>
              Remove from team
            </Text>
          </TouchableOpacity>
        </View>
        ) : null}
      </ScrollView>

      {/* ─── Edit Bottom Sheet ──────────────────────────────────── */}
      <BottomSheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit team member"
        snapHeight="auto"
      >
        <FormField
          label="Full Name *"
          value={editForm.name}
          onChangeText={(t) => setEditForm((p) => ({ ...p, name: t }))}
          placeholder="Full name"
        />

        <E164PhoneField
          label="Phone"
          valueE164={editForm.phone}
          onChangeE164={(e164) => setEditForm((p) => ({ ...p, phone: e164 }))}
          compact
          muted
          accessibilityLabel="Team member phone"
        />

        <FormField
          label="Avatar image URL"
          value={editForm.avatar_url}
          onChangeText={(t) => setEditForm((p) => ({ ...p, avatar_url: t }))}
          placeholder="https://..."
          keyboardType="url"
        />

        {canManageTeam ? (
          <>
            <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>Role</Text>
            <View style={twStyle("mb-3 flex-row flex-wrap")}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[
                    twStyle(
                      `rounded-full px-4 py-2 ${
                        editForm.role === r.value
                          ? "bg-gray-900"
                          : "border border-gray-200 bg-white"
                      }`
                    ),
                    { marginRight: 8, marginBottom: 8 },
                  ]}
                  onPress={() => setEditForm((p) => ({ ...p, role: r.value }))}
                  accessibilityLabel={`Select role ${r.label}`}
                >
                  <Text
                    style={twStyle(
                      `text-sm font-medium ${
                        editForm.role === r.value ? "text-white" : "text-gray-600"
                      }`
                    )}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <FormField
              label="Commission Rate (%)"
              value={editForm.commission_rate}
              onChangeText={(t) => setEditForm((p) => ({ ...p, commission_rate: t }))}
              placeholder="e.g. 30"
              keyboardType="numeric"
            />
          </>
        ) : (
          <Text style={twStyle("mt-3 text-xs text-gray-500")}>
            Role and commission can only be changed by someone with Manage team access.
          </Text>
        )}

        <ActionButton
          label="Save changes"
          onPress={handleSaveEdit}
          loading={saving}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={twStyle("flex-row py-2")}>
      <Text style={twStyle("w-24 text-sm text-gray-500")}>{label}</Text>
      <Text style={twStyle("flex-1 text-sm text-gray-900")} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ChecklistRow({ complete, label }: { complete: boolean; label: string }) {
  return (
    <View style={twStyle("mb-2 flex-row items-start")}>
      <View
        style={twStyle(
          `mt-0.5 h-5 w-5 items-center justify-center rounded-full ${
            complete ? "bg-green-100" : "bg-amber-100"
          }`,
        )}
      >
        <Ionicons
          name={complete ? "checkmark" : "alert-outline"}
          size={13}
          color={complete ? "#16a34a" : "#d97706"}
        />
      </View>
      <Text style={twStyle(`ml-2 flex-1 text-sm ${complete ? "text-gray-700" : "text-amber-700"}`)}>
        {label}
      </Text>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric" | "url";
}) {
  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label}</Text>
      <TextInput
        style={twStyle(
          "rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
        )}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        accessibilityLabel={label}
      />
    </View>
  );
}
