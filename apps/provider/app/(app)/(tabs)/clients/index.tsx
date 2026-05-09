import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost } from "@/hooks/useApi";
import { getApiErrorMessage } from "@/lib/api-error";
import { useFocusedApi } from "@/hooks/useFocusedApi";
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
import { Colors } from "@/constants/colors";
import { tabScreenScrollBottomPadding } from "@/constants/layout";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { useDefaultPhoneDial } from "@/hooks/useDefaultPhoneDial";

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
  salon_membership?: {
    subscription_id: string;
    plan_id: string;
    plan_name: string | null;
    plan_is_active?: boolean;
    status: string;
    expires_at: string | null;
    started_at: string | null;
    cancelled_at: string | null;
    /** Matches booking discount rules when true. */
    is_entitled?: boolean;
  } | null;
  customer?: {
    id: string;
    full_name?: string;
    email?: string;
    phone?: string;
    avatar_url?: string | null;
    is_limited_platform_link?: boolean;
  };
  relationship_source?: string | null;
  privacy_level?: string | null;
  linked_existing_platform_user?: boolean;
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
  /**
   * §Provider-audit 2026-04: false for walk-in / placeholder clients that
   * don't have a Beautonomi auth account yet (e.g. created via the provider
   * add-client form with a generated @beautonomi.invalid email). These
   * clients can't be messaged via the in-app chat.
   */
  is_registered?: boolean;
  is_limited_platform_link?: boolean;
  salon_membership?: ApiClient["salon_membership"];
}

type ClientFilter = "all" | "vip" | "regular" | "new" | "members";

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

function validateEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clientHasBookableSalonMembership(c: Client): boolean {
  const m = c.salon_membership;
  if (!m) return false;
  if (m.is_entitled != null) return m.is_entitled;
  return m.status === "active";
}

/**
 * §Provider-audit 2026-05: when a membership has lapsed (cancelled or
 * expired) we still surface the historic relationship via this helper so
 * providers can quickly resubscribe the client. We deliberately do NOT
 * route this through `clientHasBookableSalonMembership` so the bookable
 * pricing logic stays exact (no stale benefits applied).
 */
type MembershipBadgeState =
  | { kind: "active"; label: string }
  | { kind: "expired"; label: string }
  | { kind: "cancelled"; label: string }
  | null;

function membershipBadgeState(c: Client): MembershipBadgeState {
  const m = c.salon_membership;
  if (!m) return null;
  if (clientHasBookableSalonMembership(c)) return { kind: "active", label: "Member" };
  if (m.cancelled_at) return { kind: "cancelled", label: "Cancelled" };
  if (m.expires_at) {
    const t = new Date(m.expires_at).getTime();
    if (Number.isFinite(t) && t < Date.now()) {
      return { kind: "expired", label: "Expired" };
    }
  }
  if (m.status && m.status !== "active") {
    return { kind: m.status === "cancelled" ? "cancelled" : "expired", label: m.status === "cancelled" ? "Cancelled" : "Expired" };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Client card (memoized for FlashList performance)                   */
/* ------------------------------------------------------------------ */

interface ClientCardProps {
  client: Client;
  onPress: (client: Client) => void;
  onBook: (client: Client) => void;
  onMessage: (client: Client) => void;
  onManageMembership?: (client: Client) => void;
}

const ClientCard = React.memo(function ClientCard({ client, onPress, onBook, onMessage, onManageMembership }: ClientCardProps) {
  const isVip =
    client.tags?.some((t) => t.toLowerCase() === "vip") ||
    (client.total_bookings != null && client.total_bookings >= 10) ||
    (client.total_spent != null && client.total_spent >= 5000);
  const membership = membershipBadgeState(client);

  // §Provider-audit 2026-05: membership tag is now clickable so providers
  // can jump straight into managing the subscription (or starting a new
  // one when the client is expired/cancelled). Also adds explicit
  // "Cancelled"/"Expired" pills so a stale membership never reads as
  // "still a Member" on the list.
  const renderMembershipTag = () => {
    if (!membership) return null;
    const palette =
      membership.kind === "active"
        ? { bg: "#f3e8ff", fg: "#7c3aed" }
        : membership.kind === "cancelled"
          ? { bg: "#fee2e2", fg: "#b91c1c" }
          : { bg: "#fef3c7", fg: "#b45309" };
    const handlePress = () => {
      if (onManageMembership) onManageMembership(client);
    };
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={!onManageMembership}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Manage ${client.full_name}'s membership (${membership.label})`}
        style={{
          marginLeft: 8,
          borderRadius: 9999,
          backgroundColor: palette.bg,
          paddingHorizontal: 8,
          paddingVertical: 2,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: "700", color: palette.fg }}>{membership.label}</Text>
        {onManageMembership ? (
          <Ionicons
            name="chevron-forward"
            size={11}
            color={palette.fg}
            style={{ marginLeft: 2 }}
          />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16, elevation: 1 }}>
      <TouchableOpacity
        onPress={() => onPress(client)}
        accessibilityRole="button"
        accessibilityLabel={`${client.full_name}, ${client.total_bookings ?? 0} visits`}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Avatar name={client.full_name} imageUrl={client.avatar_url} size="md" />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
              <Text style={{ fontSize: 16, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                {client.full_name}
              </Text>
              {isVip && (
                <View style={{ marginLeft: 8, borderRadius: 9999, backgroundColor: "#fef3c7", paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#b45309" }}>VIP</Text>
                </View>
              )}
              {client.is_limited_platform_link && (
                <View style={{ marginLeft: 8, borderRadius: 9999, backgroundColor: "#eff6ff", paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#1d4ed8" }}>Platform</Text>
                </View>
              )}
              {renderMembershipTag()}
            </View>
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }} numberOfLines={1}>
              {client.phone ? formatPhone(client.phone) : client.email || "No contact info"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: Colors.gray[50], paddingTop: 12 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="calendar-outline" size={13} color={Colors.gray[400]} />
          <Text style={{ marginLeft: 4, fontSize: 12, color: Colors.gray[500] }}>
            {client.total_bookings ?? 0} visit{(client.total_bookings ?? 0) !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="wallet-outline" size={13} color={Colors.gray[400]} />
          <Text style={{ marginLeft: 4, fontSize: 12, color: Colors.gray[500] }}>
            {formatCurrency(client.total_spent ?? 0)}
          </Text>
        </View>
        {client.last_visit && (
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 10, color: Colors.gray[400] }}>
              Last: {formatTimeAgo(client.last_visit)}
            </Text>
          </View>
        )}
      </View>

      <View style={{ marginTop: 12, flexDirection: "row" }}>
        <TouchableOpacity
          style={{ flex: 1, marginRight: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: Colors.gray[900], paddingVertical: 8 }}
          onPress={() => onBook(client)}
          accessibilityRole="button"
          accessibilityLabel={`Book appointment for ${client.full_name}`}
        >
          <Ionicons name="calendar" size={14} color="#fff" />
          <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: Colors.white }}>Book</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
            paddingVertical: 8,
            opacity: client.is_registered === false ? 0.5 : 1,
          }}
          onPress={() => onMessage(client)}
          accessibilityRole="button"
          accessibilityLabel={
            client.is_registered === false
              ? `${client.full_name} is not on Beautonomi yet`
              : `Message ${client.full_name}`
          }
          accessibilityState={{ disabled: client.is_registered === false }}
        >
          <Ionicons name="chatbubble-outline" size={14} color={Colors.gray[700]} />
          <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: Colors.gray[700] }}>
            Message
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ClientsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listBottomPadding = tabScreenScrollBottomPadding(insets.bottom, 16);
  useResponsive();
  const defaultPhoneDial = useDefaultPhoneDial();
  const { selectedLocationId } = useProvider();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // §Provider-audit 2026-04 (round 3): debounce search input so every
  // keystroke doesn't trigger a fresh `/api/provider/clients?search=…`
  // request. 300ms feels snappy in testing.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length === 0) {
      setDebouncedSearch("");
      return;
    }
    const timer = setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // §Provider-audit 2026-04 (round 4): paginate the primary clients feed.
  // API exposes `X-Total-Count` and accepts `limit`/`offset` (see the
  // `route.ts` change from round 3). First page is 50 rows; we load
  // additional pages on scroll via `loadMore()` below. Serviced /
  // conversations feeds remain unpaginated (they're naturally capped).
  const CLIENT_PAGE_SIZE = 50;
  const locQ = useMemo(() => {
    const parts: string[] = [`limit=${CLIENT_PAGE_SIZE}`];
    if (selectedLocationId) parts.push(`location_id=${encodeURIComponent(selectedLocationId)}`);
    if (debouncedSearch.length > 0) parts.push(`search=${encodeURIComponent(debouncedSearch)}`);
    return `?${parts.join("&")}`;
  }, [selectedLocationId, debouncedSearch]);
  const secondaryLocQ = selectedLocationId ? `?location_id=${selectedLocationId}` : "";

  // Form state - separate first/last name fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [email, setEmail] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const { isFocused } = useFocusedApi();

  const { data: rawClients, loading, error: clientsError, refresh } = useApi<ApiClient[]>(
    `/api/provider/clients${locQ}`,
    { enabled: isFocused, staleTimeMs: 20_000 },
  );
  const { data: servicedClients, loading: loadingServiced, refresh: refreshServiced } = useApi<any[]>(
    `/api/provider/clients/serviced${secondaryLocQ}`,
    { enabled: isFocused, staleTimeMs: 20_000 },
  );
  const { data: conversationClients, loading: loadingConversations, refresh: refreshConversations } = useApi<any[]>(
    `/api/provider/clients/conversations${secondaryLocQ}`,
    { enabled: isFocused, staleTimeMs: 20_000 },
  );

  // §Provider-audit 2026-04 (round 4): infinite scroll state for the
  // primary feed. `extraPages` holds pages 2..N; reset whenever the
  // query (location or debounced search) changes so stale results from
  // a prior filter don't stick around.
  const [extraPages, setExtraPages] = useState<ApiClient[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    // Reset pagination state whenever the first-page query URL changes.
    setExtraPages([]);
    setHasMore(Array.isArray(rawClients) && rawClients.length >= CLIENT_PAGE_SIZE);
  }, [rawClients, selectedLocationId, debouncedSearch]);

  const loadMoreClients = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const offset = (rawClients?.length ?? 0) + extraPages.length;
    const parts: string[] = [`limit=${CLIENT_PAGE_SIZE}`, `offset=${offset}`];
    if (selectedLocationId) parts.push(`location_id=${encodeURIComponent(selectedLocationId)}`);
    if (debouncedSearch.length > 0) parts.push(`search=${encodeURIComponent(debouncedSearch)}`);
    const url = `/api/provider/clients?${parts.join("&")}`;
    setLoadingMore(true);
    try {
      const res = await api.get<ApiClient[]>(url);
      if (res.error) {
        setHasMore(false);
        Alert.alert("Could not load more clients", getApiErrorMessage(res.error, "Please try again."));
        return;
      }
      const page = Array.isArray(res.data) ? res.data : [];
      if (page.length > 0) {
        setExtraPages((prev) => [...prev, ...page]);
      }
      if (page.length < CLIENT_PAGE_SIZE) {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, rawClients, extraPages.length, selectedLocationId, debouncedSearch]);

  const clients = useMemo<Client[] | null>(() => {
    if (rawClients === null) return null;
    // Avoid an empty-state flash: main list may be [] while serviced/conversations
    // still load clients who only appear in those feeds.
    if (
      rawClients.length === 0 &&
      (loadingServiced || loadingConversations)
    ) {
      return null;
    }

    const seen = new Set<string>();
    const result: Client[] = [];

    const addClient = (c: any) => {
      const custId = c.customer_id;
      if (seen.has(custId)) return;
      seen.add(custId);
      const email: string = c.customer?.email || "";
      // Treat explicit `is_registered: false` as authoritative; otherwise fall
      // back to the placeholder-email heuristic so older server responses
      // without the flag still branch correctly.
      const isRegistered =
        typeof c.customer?.is_registered === "boolean"
          ? c.customer.is_registered
          : Boolean(email) &&
            !email.includes("beautonomi.invalid") &&
            !email.includes("beautonomi.local");
      result.push({
        id: c.id || custId,
        customer_id: custId,
        full_name: c.customer?.full_name || "Unknown",
        email,
        phone: c.customer?.phone || "",
        avatar_url: c.customer?.avatar_url ?? null,
        created_at: c.created_at || "",
        total_bookings: c.total_bookings,
        total_spent: c.total_spent,
        last_visit: c.last_service_date ?? null,
        notes: c.notes ?? null,
        tags: c.tags ?? [],
        is_registered: isRegistered,
        is_limited_platform_link: Boolean(c.customer?.is_limited_platform_link || c.privacy_level === "limited"),
        salon_membership: c.salon_membership ?? null,
      });
    };

    rawClients.forEach(addClient);
    extraPages.forEach(addClient);
    servicedClients?.forEach(addClient);
    conversationClients?.forEach(addClient);

    return result;
  }, [rawClients, extraPages, servicedClients, conversationClients, loadingServiced, loadingConversations]);
  const { execute: createClient, loading: creating } = useApiPost<any, Client>(
    "/api/provider/clients/create"
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setExtraPages([]);
      setHasMore(false);
      await Promise.all([refresh(), refreshServiced(), refreshConversations()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshServiced, refreshConversations]);

  // Filter chips
  const filterOptions = useMemo(
    () => [
      { label: "All", value: "all" },
      { label: "VIP", value: "vip" },
      { label: "Regular", value: "regular" },
      { label: "New", value: "new" },
      { label: "Members", value: "members" },
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
          c.tags?.some((t) => t.toLowerCase() === "vip") ||
          (c.total_bookings != null && c.total_bookings >= 10) ||
          (c.total_spent != null && c.total_spent >= 5000)
      );
    } else if (clientFilter === "regular") {
      result = result.filter(
        (c) =>
          !c.tags?.some((t) => t.toLowerCase() === "vip") &&
          c.total_bookings != null &&
          c.total_bookings >= 2
      );
    } else if (clientFilter === "new") {
      result = result.filter(
        (c) => c.total_bookings == null || c.total_bookings <= 1
      );
    } else if (clientFilter === "members") {
      result = result.filter((c) => clientHasBookableSalonMembership(c));
    }

    // §Provider-audit 2026-04 (round 2): normalise phone search — providers
    // type "0721234567" expecting to hit "+27721234567" (SA national vs
    // E.164). Match on the trailing significant digits rather than a raw
    // substring. Name/email keep the plain includes-check.
    if (search.trim()) {
      const q = search.toLowerCase();
      const digitsOnly = q.replace(/\D+/g, "");
      const digitsSuffix = digitsOnly.length >= 7 ? digitsOnly.slice(-9) : digitsOnly;
      result = result.filter((c) => {
        if (c.full_name?.toLowerCase().includes(q)) return true;
        if (c.email?.toLowerCase().includes(q)) return true;
        if (!c.phone) return false;
        const phoneDigits = c.phone.replace(/\D+/g, "");
        if (digitsOnly.length > 0 && phoneDigits.includes(digitsOnly)) return true;
        if (digitsSuffix.length > 0 && phoneDigits.endsWith(digitsSuffix)) return true;
        return false;
      });
    }

    return result;
  }, [clients, search, clientFilter]);

  // Filter counts
  const filterCounts = useMemo(() => {
    if (!clients) return { all: 0, vip: 0, regular: 0, new: 0, members: 0 };
    return {
      all: clients.length,
      vip: clients.filter(
        (c) =>
          c.tags?.some((t) => t.toLowerCase() === "vip") ||
          (c.total_bookings != null && c.total_bookings >= 10) ||
          (c.total_spent != null && c.total_spent >= 5000)
      ).length,
      regular: clients.filter(
        (c) =>
          !c.tags?.some((t) => t.toLowerCase() === "vip") &&
          c.total_bookings != null &&
          c.total_bookings >= 2
      ).length,
      new: clients.filter((c) => c.total_bookings == null || c.total_bookings <= 1).length,
      members: clients.filter((c) => clientHasBookableSalonMembership(c)).length,
    };
  }, [clients]);

  const filterChipOptions = useMemo(
    () =>
      filterOptions.map((f) => ({
        ...f,
        label: `${f.label} (${filterCounts[f.value as ClientFilter]})`,
      })),
    [filterOptions, filterCounts],
  );

  // Validation
  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    if (!firstName.trim()) {
      errors.firstName = "First name is required";
    }

    if (email && !validateEmail(email)) {
      errors.email = "Please enter a valid email";
    }

    if (phoneE164.trim()) {
      const pe = validateE164Phone(phoneE164);
      if (pe) errors.phone = pe;
    }

    if (!phoneE164.trim() && !email.trim()) {
      errors.phone = "Please provide phone or email";
      errors.email = "Please provide phone or email";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function resetForm() {
    setFirstName("");
    setLastName("");
    setPhoneE164("");
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
      phone: phoneE164.trim() || undefined,
      email: email.trim() || undefined,
    });

    if (error) {
      Alert.alert("Error", error);
      return;
    }

    setShowAddSheet(false);
    resetForm();
    await Promise.all([refresh(), refreshServiced(), refreshConversations()]);
    Alert.alert("Success", "Client added successfully");
  }

  const handleViewClient = useCallback((client: Client) => {
    router.push(`/(app)/(tabs)/clients/${client.id}` as never);
  }, [router]);

  const handleBook = useCallback((client: Client) => {
    router.push(`/(app)/(tabs)/bookings/new?clientId=${client.customer_id}` as never);
  }, [router]);

  // §Provider-audit 2026-05: tapping the membership badge sends the
  // provider to the membership management section of the client detail
  // page so they can renew/cancel subscriptions in one tap.
  const handleManageMembership = useCallback((client: Client) => {
    router.push(`/(app)/(tabs)/clients/${client.id}?section=membership` as never);
  }, [router]);

  const handleMessage = useCallback(async (client: Client) => {
    // §Provider-audit 2026-04: walk-in / placeholder clients don't have a
    // Beautonomi auth account, so there's no inbox to deliver a chat to.
    // Surface a clear hint instead of firing a POST that will 404.
    if (client.is_registered === false) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Invite this client first",
        `${client.full_name || "This client"} isn't on Beautonomi yet. Share your booking link or ask them to sign up, then you can chat inside the app.`,
        [{ text: "OK", style: "default" }],
      );
      return;
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await api.post<{ id: string }>("/api/provider/conversations/create", {
        customer_id: client.customer_id,
      });
      if (result.error) {
        const code = (result.error as { code?: string } | undefined)?.code;
        if (code === "CUSTOMER_UNREGISTERED") {
          Alert.alert(
            "Invite this client first",
            result.error.message ||
              "This client isn't on Beautonomi yet. Invite them to sign up before sending a chat message.",
          );
        } else {
          Alert.alert("Cannot message", result.error.message);
        }
        return;
      }
      if (result.data?.id) {
        router.push(`/(app)/(tabs)/chats/${result.data.id}` as never);
      }
    } catch {
      Alert.alert("Error", "Failed to start conversation");
    }
  }, [router]);

  /* ---------------------------------------------------------------- */
  /*  Client card                                                     */
  /* ---------------------------------------------------------------- */

  const renderClient = useCallback(({ item: client }: { item: Client }) => (
    <ClientCard
      client={client}
      onPress={handleViewClient}
      onBook={handleBook}
      onMessage={handleMessage}
      onManageMembership={handleManageMembership}
    />
  ), [handleViewClient, handleBook, handleMessage, handleManageMembership]);

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
            style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: Colors.gray[900] }}
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
      <View style={{ marginBottom: 8 }}>
        <FilterChipGroup
          options={filterChipOptions}
          selected={clientFilter}
          onSelect={(v) => setClientFilter(v as ClientFilter)}
        />
      </View>

      <View style={{ marginBottom: 12 }}>
        <SearchBar placeholder="Search clients..." value={search} onChangeText={setSearch} />
      </View>

      {(loading || loadingServiced || loadingConversations) && clients === null ? (
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
        <FlashList
          data={filteredClients}
          keyExtractor={(c: Client) => c.id}
          renderItem={renderClient}
          showsVerticalScrollIndicator={true}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={loadMoreClients}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: Colors.gray[400] }}>Loading more…</Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: listBottomPadding }}
        />
      )}

      </View>

      {/* -------- Add Client Sheet -------- */}
      <BottomSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        title="Add Client"
      >
        <View>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
              First Name <Text style={{ color: Colors.error }}>*</Text>
            </Text>
            <TextInput
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: formErrors.firstName ? "#f87171" : Colors.gray[200],
                backgroundColor: Colors.gray[50],
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontSize: 16,
                color: Colors.gray[900],
              }}
              placeholder="Enter first name"
              placeholderTextColor={Colors.gray[400]}
              value={firstName}
              onChangeText={(t) => {
                setFirstName(t);
                if (formErrors.firstName) setFormErrors((e) => ({ ...e, firstName: "" }));
              }}
              autoCapitalize="words"
              accessibilityLabel="First name"
            />
            {formErrors.firstName ? (
              <Text style={{ marginTop: 4, fontSize: 12, color: Colors.error }}>{formErrors.firstName}</Text>
            ) : null}
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Last Name</Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              placeholder="Enter last name"
              placeholderTextColor={Colors.gray[400]}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              accessibilityLabel="Last name"
            />
          </View>

          <View style={{ marginBottom: 16 }}>
            <E164PhoneField
              label="Phone"
              valueE164={phoneE164}
              onChangeE164={(e164) => {
                setPhoneE164(e164);
                if (formErrors.phone) setFormErrors((e) => ({ ...e, phone: "" }));
              }}
              defaultCountryDial={defaultPhoneDial}
              muted
              accessibilityLabel="Client phone"
            />
            {formErrors.phone ? (
              <Text style={{ marginTop: 4, fontSize: 12, color: Colors.error }}>{formErrors.phone}</Text>
            ) : null}
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Email</Text>
            <TextInput
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: formErrors.email ? "#f87171" : Colors.gray[200],
                backgroundColor: Colors.gray[50],
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontSize: 16,
                color: Colors.gray[900],
              }}
              placeholder="email@example.com"
              placeholderTextColor={Colors.gray[400]}
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
              <Text style={{ marginTop: 4, fontSize: 12, color: Colors.error }}>{formErrors.email}</Text>
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
