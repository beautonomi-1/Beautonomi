import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { formatPhone, formatTimeAgo, formatCurrency } from "@/lib/format";
import { api } from "@/lib/api-client";
import { useProvider } from "@/providers/ProviderContext";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ApiClient {
  id: string;
  customer_id: string;
  notes?: string | null;
  tags?: string[];
  is_favorite?: boolean;
  last_service_date?: string | null;
  total_bookings?: number;
  total_spent?: number;
  created_at: string;
  customer?: {
    id: string;
    full_name?: string;
    email?: string;
    phone?: string;
    avatar_url?: string | null;
  };
}

interface Client {
  id: string;
  customer_id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url?: string | null;
  created_at: string;
  total_bookings?: number;
  total_spent?: number;
  last_visit?: string | null;
  notes?: string | null;
  tags?: string[];
}

type ClientFilter = "all" | "vip" | "regular" | "new";

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

function validateEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone: string): boolean {
  if (!phone) return true;
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ClientsScreen() {
  const router = useRouter();
  useResponsive();
  const { selectedLocationId } = useProvider();
  const locQ = selectedLocationId ? `?location_id=${selectedLocationId}` : "";
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Form state - separate first/last name fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: rawClients, loading, error: clientsError, refresh } = useApi<ApiClient[]>(`/api/provider/clients${locQ}`);
  const { data: servicedClients, refresh: refreshServiced } = useApi<any[]>(`/api/provider/clients/serviced${locQ}`);
  const { data: conversationClients, refresh: refreshConversations } = useApi<any[]>(`/api/provider/clients/conversations${locQ}`);

  const clients = useMemo<Client[] | null>(() => {
    if (!rawClients) return null;
    const seen = new Set<string>();
    const result: Client[] = [];

    const addClient = (c: any) => {
      const custId = c.customer_id;
      if (seen.has(custId)) return;
      seen.add(custId);
      result.push({
        id: c.id || custId,
        customer_id: custId,
        full_name: c.customer?.full_name || "Unknown",
        email: c.customer?.email || "",
        phone: c.customer?.phone || "",
        avatar_url: c.customer?.avatar_url ?? null,
        created_at: c.created_at || "",
        total_bookings: c.total_bookings,
        total_spent: c.total_spent,
        last_visit: c.last_service_date ?? null,
        notes: c.notes ?? null,
        tags: c.tags ?? [],
      });
    };

    rawClients.forEach(addClient);
    servicedClients?.forEach(addClient);
    conversationClients?.forEach(addClient);

    return result;
  }, [rawClients, servicedClients, conversationClients]);
  const { execute: createClient, loading: creating } = useApiPost<any, Client>(
    "/api/provider/clients/create"
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshServiced(), refreshConversations()]);
    setRefreshing(false);
  }, [refresh, refreshServiced, refreshConversations]);

  // Filter chips
  const filterOptions = useMemo(
    () => [
      { label: "All", value: "all" },
      { label: "VIP", value: "vip" },
      { label: "Regular", value: "regular" },
      { label: "New", value: "new" },
    ],
    []
  );

  // Apply search + filter
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    let result = clients;

    // Filter by category
    if (clientFilter === "vip") {
      result = result.filter(
        (c) =>
          c.tags?.includes("vip") ||
          (c.total_bookings != null && c.total_bookings >= 10) ||
          (c.total_spent != null && c.total_spent >= 5000)
      );
    } else if (clientFilter === "regular") {
      result = result.filter(
        (c) =>
          !c.tags?.includes("vip") &&
          c.total_bookings != null &&
          c.total_bookings >= 2
      );
    } else if (clientFilter === "new") {
      result = result.filter(
        (c) => c.total_bookings == null || c.total_bookings <= 1
      );
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.full_name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q)
      );
    }

    return result;
  }, [clients, search, clientFilter]);

  // Filter counts
  const filterCounts = useMemo(() => {
    if (!clients) return { all: 0, vip: 0, regular: 0, new: 0 };
    return {
      all: clients.length,
      vip: clients.filter(
        (c) =>
          c.tags?.includes("vip") ||
          (c.total_bookings != null && c.total_bookings >= 10) ||
          (c.total_spent != null && c.total_spent >= 5000)
      ).length,
      regular: clients.filter(
        (c) =>
          !c.tags?.includes("vip") &&
          c.total_bookings != null &&
          c.total_bookings >= 2
      ).length,
      new: clients.filter((c) => c.total_bookings == null || c.total_bookings <= 1).length,
    };
  }, [clients]);

  // Validation
  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    if (!firstName.trim()) {
      errors.firstName = "First name is required";
    }

    if (email && !validateEmail(email)) {
      errors.email = "Please enter a valid email";
    }

    if (phone && !validatePhone(phone)) {
      errors.phone = "Please enter a valid phone number";
    }

    if (!phone.trim() && !email.trim()) {
      errors.phone = "Please provide phone or email";
      errors.email = "Please provide phone or email";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function resetForm() {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setFormErrors({});
  }

  async function handleCreateClient() {
    if (!validateForm()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const { error } = await createClient({
      full_name: fullName,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
    });

    if (error) {
      Alert.alert("Error", error);
      return;
    }

    setShowAddSheet(false);
    resetForm();
    refresh();
    Alert.alert("Success", "Client added successfully");
  }

  function handleBook(client: Client) {
    router.push(`/(app)/(tabs)/more/bookings/new?clientId=${client.customer_id}` as any);
  }

  async function handleMessage(client: Client) {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await api.post<{ id: string }>("/api/provider/conversations/create", {
        customer_id: client.customer_id,
      });
      if (result.error) {
        Alert.alert("Cannot message", result.error.message);
        return;
      }
      if (result.data?.id) {
        router.push(`/(app)/(tabs)/more/messaging/${result.data.id}` as never);
      }
    } catch {
      Alert.alert("Error", "Failed to start conversation");
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Client card                                                     */
  /* ---------------------------------------------------------------- */

  function renderClient({ item: client }: { item: Client }) {
    const isVip =
      client.tags?.includes("vip") ||
      (client.total_bookings != null && client.total_bookings >= 10) ||
      (client.total_spent != null && client.total_spent >= 5000);

    return (
      <View
        className="mb-2 rounded-xl border border-gray-100 bg-white p-4"
        style={{ elevation: 1 }}
      >
        <TouchableOpacity
          onPress={() => router.push(`/(app)/(tabs)/more/clients/${client.id}` as any)}
          accessibilityRole="button"
          accessibilityLabel={`${client.full_name}, ${client.total_bookings ?? 0} visits`}
          activeOpacity={0.7}
        >
          <View className="flex-row items-center">
            <Avatar name={client.full_name} imageUrl={client.avatar_url} size="md" />
            <View className="ml-3 flex-1">
              <View className="flex-row items-center">
                <Text className="text-base font-medium text-gray-900" numberOfLines={1}>
                  {client.full_name}
                </Text>
                {isVip && (
                  <View className="ml-2 rounded-full bg-amber-100 px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-amber-700">VIP</Text>
                  </View>
                )}
              </View>
              <Text className="mt-0.5 text-sm text-gray-500" numberOfLines={1}>
                {client.phone ? formatPhone(client.phone) : client.email || "No contact info"}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Stats row */}
        <View className="mt-3 flex-row items-center border-t border-gray-50 pt-3">
          <View className="flex-1 flex-row items-center">
            <Ionicons name="calendar-outline" size={13} color="#9ca3af" />
            <Text className="ml-1 text-xs text-gray-500">
              {client.total_bookings ?? 0} visit{(client.total_bookings ?? 0) !== 1 ? "s" : ""}
            </Text>
          </View>
          <View className="flex-1 flex-row items-center">
            <Ionicons name="wallet-outline" size={13} color="#9ca3af" />
            <Text className="ml-1 text-xs text-gray-500">
              {formatCurrency(client.total_spent ?? 0)}
            </Text>
          </View>
          {client.last_visit && (
            <View className="flex-1 items-end">
              <Text className="text-[10px] text-gray-400">
                Last: {formatTimeAgo(client.last_visit)}
              </Text>
            </View>
          )}
        </View>

        {/* Quick actions - separate buttons so no nested <button> on web */}
        <View className="mt-3 flex-row gap-2">
          <TouchableOpacity
            className="flex-1 flex-row items-center justify-center rounded-lg bg-gray-900 py-2"
            onPress={() => handleBook(client)}
            accessibilityRole="button"
            accessibilityLabel={`Book appointment for ${client.full_name}`}
          >
            <Ionicons name="calendar" size={14} color="#fff" />
            <Text className="ml-1.5 text-xs font-semibold text-white">Book</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 flex-row items-center justify-center rounded-lg border border-gray-200 bg-white py-2"
            onPress={() => handleMessage(client)}
            accessibilityRole="button"
            accessibilityLabel={`Message ${client.full_name}`}
          >
            <Ionicons name="chatbubble-outline" size={14} color="#374151" />
            <Text className="ml-1.5 text-xs font-semibold text-gray-700">Message</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  JSX                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Clients"
        subtitle={`${filteredClients.length} client${filteredClients.length !== 1 ? "s" : ""}`}
        rightAction={
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-900"
            onPress={() => {
              resetForm();
              setShowAddSheet(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add new client"
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
      {/* Filter chips */}
      <View className="mb-2">
        <FilterChipGroup
          options={filterOptions.map((f) => ({
            ...f,
            label: `${f.label} (${filterCounts[f.value as ClientFilter]})`,
          }))}
          selected={clientFilter}
          onSelect={(v) => setClientFilter(v as ClientFilter)}
        />
      </View>

      {/* Search */}
      <View className="mb-3">
        <SearchBar placeholder="Search clients..." value={search} onChangeText={setSearch} />
      </View>

      {loading && !clients ? (
        <SkeletonList rows={6} />
      ) : clientsError && !clients ? (
        <ErrorState message={clientsError} onRetry={refresh} />
      ) : filteredClients.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={search ? "No results" : "No clients yet"}
          description={
            search
              ? "Try a different search"
              : "Clients will appear here after their first booking"
          }
          actionLabel={!search ? "Add Client" : undefined}
          onAction={
            !search
              ? () => {
                  resetForm();
                  setShowAddSheet(true);
                }
              : undefined
          }
        />
      ) : (
        <FlatList
          data={filteredClients}
          keyExtractor={(c: Client) => c.id}
          renderItem={renderClient}
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={true}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}

      </View>

      {/* -------- Add Client Sheet -------- */}
      <BottomSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        title="Add Client"
      >
        <View className="gap-4">
          {/* First Name */}
          <View>
            <Text className="mb-1.5 text-sm font-medium text-gray-700">
              First Name <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              className={`rounded-xl border bg-gray-50 px-4 py-3 text-base text-gray-900 ${
                formErrors.firstName ? "border-red-400" : "border-gray-200"
              }`}
              placeholder="Enter first name"
              placeholderTextColor="#9ca3af"
              value={firstName}
              onChangeText={(t) => {
                setFirstName(t);
                if (formErrors.firstName) setFormErrors((e) => ({ ...e, firstName: "" }));
              }}
              autoCapitalize="words"
              accessibilityLabel="First name"
            />
            {formErrors.firstName ? (
              <Text className="mt-1 text-xs text-red-500">{formErrors.firstName}</Text>
            ) : null}
          </View>

          {/* Last Name */}
          <View>
            <Text className="mb-1.5 text-sm font-medium text-gray-700">Last Name</Text>
            <TextInput
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
              placeholder="Enter last name"
              placeholderTextColor="#9ca3af"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              accessibilityLabel="Last name"
            />
          </View>

          {/* Phone */}
          <View>
            <Text className="mb-1.5 text-sm font-medium text-gray-700">Phone</Text>
            <TextInput
              className={`rounded-xl border bg-gray-50 px-4 py-3 text-base text-gray-900 ${
                formErrors.phone ? "border-red-400" : "border-gray-200"
              }`}
              placeholder="+27 xxx xxx xxxx"
              placeholderTextColor="#9ca3af"
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                if (formErrors.phone) setFormErrors((e) => ({ ...e, phone: "" }));
              }}
              keyboardType="phone-pad"
              accessibilityLabel="Phone number"
            />
            {formErrors.phone ? (
              <Text className="mt-1 text-xs text-red-500">{formErrors.phone}</Text>
            ) : null}
          </View>

          {/* Email */}
          <View>
            <Text className="mb-1.5 text-sm font-medium text-gray-700">Email</Text>
            <TextInput
              className={`rounded-xl border bg-gray-50 px-4 py-3 text-base text-gray-900 ${
                formErrors.email ? "border-red-400" : "border-gray-200"
              }`}
              placeholder="email@example.com"
              placeholderTextColor="#9ca3af"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (formErrors.email) setFormErrors((e) => ({ ...e, email: "" }));
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              accessibilityLabel="Email address"
            />
            {formErrors.email ? (
              <Text className="mt-1 text-xs text-red-500">{formErrors.email}</Text>
            ) : null}
          </View>

          <ActionButton
            label="Save Client"
            onPress={handleCreateClient}
            loading={creating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
