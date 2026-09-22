import { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Linking,
  DeviceEventEmitter,
  InteractionManager,
  Platform,
  Share as RNShare,
  Image,
  RefreshControl,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
import { addDays, format as formatDateFns, isSameDay, parseISO, startOfDay } from "date-fns";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useBookingAvailableSlots } from "@/hooks/useBookingAvailableSlots";
import { useGroupBookingPaymentRealtime } from "@/hooks/useGroupBookingPaymentRealtime";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { BookingTimeSlotGrid } from "@/components/bookings/BookingDateTimePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import {
  buildGroupBookingCreateReadiness,
  validateGroupBookingCreateStepDetailed,
  type GroupBookingCreateValidationField,
} from "@/features/group-bookings/validateGroupBookingCreate";
import { BookingCreateReadinessStrip } from "@/components/bookings/BookingCreateReadinessStrip";
import { useCreateFormSections } from "@/hooks/useCreateFormSections";
import {
  participantsEqual,
  patchGroupMarkPaid,
  patchParticipantCheckIn,
  patchParticipantCheckOut,
  patchParticipantRefund,
} from "@/features/group-bookings/optimisticGroupPatch";
import {
  ParticipantRefundSheet,
  type ParticipantRefundTarget,
} from "@/features/group-bookings/ParticipantRefundSheet";
import { useProvider } from "@/providers/ProviderContext";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { PayCloudPaymentSheet } from "@/components/payments/PayCloudPaymentSheet";
import { PaycloudCollectSetupAffordance } from "@/components/payments/PaycloudCollectSetupAffordance";
import { usePaycloudCollectAvailability } from "@/hooks/usePaycloudCollectAvailability";
import type { PayCloudEntityType } from "@/hooks/usePayCloud";
import { formatPaycloudCollectLabel } from "@/lib/paycloud-collect-cta";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { buildZonedIsoForWallClock } from "@/lib/tz";
import { tabScreenScrollBottomPadding } from "@/constants/layout";
import { api } from "@/lib/api-client";
import { downloadPdf } from "@/lib/pdf-file";
import {
  PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
  paystackTerminalCollectionIntentPayload,
} from "@/lib/paystack-terminal-api";
import { PROVIDER_PRODUCTS_CATALOG_CHANGED } from "@/lib/provider-products-catalog-events";
import { PROVIDER_SERVICES_CATALOG_CHANGED } from "@/lib/provider-services-catalog-events";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { AddressMapPinModal, type ResolvedPinAddress } from "@/components/AddressMapPinModal";
import { StaticMapImage } from "@/components/ui/StaticMapImage";
import { reverseGeocodeCoordinates } from "@/lib/reverse-geocode-address";
import {
  computeGroupFinancialBreakdown,
  countGroupParticipantsCheckedIn,
  isGroupParticipantCheckedIn,
  isGroupParticipantCheckedOut,
  resolveGroupParticipantCount,
  shouldRejectStaleListPaymentSync,
} from "@/lib/group-booking-detail-helpers";
import { ensureForegroundLocationPermission, PERMISSION_COPY } from "@/lib/native-permissions";
import { countryFilterIso2FromStorage, manualCardCollectOptionLabel } from "@beautonomi/utils";
import { normalizeProductsList } from "@/lib/unpack-provider-api";
import {
  formatGroupPaymentStatusLabel,
  groupIsFullyPaid,
  isSingleChargeOnlineGroup,
  participantMaxRefundable,
} from "@/lib/group-booking-detail-helpers";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

// The list endpoint (GET /api/provider/group-bookings) maps participants to
// { client_name, client_email, client_phone, service_name, checked_in,
//   checked_in_time, checked_out, checked_out_time, price, ... }
// while the participant-create endpoint historically returned
// { customer_name, customer_email, customer_phone, status, paid, ... }.
// We accept both shapes here and normalise in the row renderer so mobile
// never crashes when the backend tweaks the payload.
interface Participant {
  id: string;
  booking_id?: string | null;
  // Historic / create-endpoint shape
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  // List-endpoint shape
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  participant_name?: string;
  participant_phone?: string;
  participant_email?: string;
  status?: string;
  paid?: boolean;
  // Check-in/out (list endpoint uses _time suffix, DB uses _at)
  checked_in?: boolean;
  checked_in_time?: string | null;
  checked_in_at?: string | null;
  checked_out?: boolean;
  checked_out_time?: string | null;
  checked_out_at?: string | null;
  service_name?: string | null;
  duration_minutes?: number | null;
  price?: number;
  payment_status?: string | null;
  balance_due?: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_gift_coverage?: number | null;
  tip_amount?: number | null;
  is_primary_contact?: boolean;
  addons?:
    | {
        id?: string;
        addonId?: string;
        name?: string;
        price?: number;
        duration?: number;
        duration_minutes?: number;
      }[]
    | null;
  notes?: string | null;
}

interface GroupBooking {
  id: string;
  title?: string | null;
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
  location_type?: "at_salon" | "at_home";
  address_line1?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
  address_latitude?: number | null;
  address_longitude?: number | null;
  travel_fee?: number | null;
  location_name?: string | null;
  ref_number: string | null;
  participants?: Participant[];
  created_at: string;
  updated_at?: string;
  // §Provider-audit 2026-04 (packages round 3 — mobile parity): the
  // group_bookings row already stores `package_id` (migration 520) and
  // `GET /api/provider/group-bookings` selects `*`, so we get it back from
  // the list endpoint. Keep it typed so the create / detail sheet can
  // show the attached package name + pass the id through on edits.
  package_id?: string | null;
  package_discount_amount?: number | null;
  payment_status?: string | null;
  amount_paid?: number | null;
  balance_due?: number | null;
  total_refunded?: number | null;
  tip_amount?: number | null;
  is_invoiced?: boolean | null;
  products?: GroupProductLine[];
  bookings?: GroupChildBooking[];
}

type GroupProductLine = {
  name?: string | null;
  product_name?: string | null;
  product_variant_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  unitPrice?: number | null;
  price?: number | null;
  total_price?: number | null;
  totalPrice?: number | null;
};

type GroupChildBooking = {
  id: string;
  additional_charges?: Array<{
    description?: string | null;
    name?: string | null;
    amount?: number | null;
    status?: string | null;
  }>;
};

/** Mirrors web `groupProductLineTotal` so detail totals match the receipt/invoice. */
function groupProductLineTotal(product: GroupProductLine): number {
  const qty = Math.max(1, Number(product.quantity ?? 1) || 1);
  return Math.max(
    0,
    Number(
      product.total_price ??
        product.totalPrice ??
        (Number(product.unit_price ?? product.unitPrice ?? product.price ?? 0) || 0) * qty
    ) || 0
  );
}

/** Package list item from `GET /api/provider/packages` (shape mirrors
 *  `apps/provider/app/(app)/(tabs)/more/bookings/new.tsx`). */
interface PackageItem {
  id: string;
  offering_id?: string | null;
  product_id?: string | null;
  quantity?: number;
  offering?: {
    id: string;
    title?: string | null;
    name?: string | null;
    duration_minutes?: number | null;
    price?: number | null;
  } | null;
  product?: { id: string; name?: string | null; retail_price?: number | null } | null;
}

interface PackageRow {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  discount_percentage?: number | null;
  is_active?: boolean;
  items?: PackageItem[];
}

interface GroupBookingsAggregateStats {
  completed_count: number;
  session_booked_gross: number;
  participant_booked_gross: number;
  recognized_earnings: number;
}

interface GroupBookingsResponse {
  data: GroupBooking[];
  total: number;
  page: number;
  total_pages: number;
  stats?: GroupBookingsAggregateStats;
}

interface AvailableSlotsApiRow {
  time: string;
  available: boolean;
  reason?: string;
}

interface AvailableSlotsApiResponse {
  slots: string[];
  date: string;
  slot_grid?: AvailableSlotsApiRow[];
  provider_timezone?: string | null;
}

function useGroupBookingsI18n() {
  const { t } = useTranslation();
  return useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.groupBookings.${key}`, opts) as string,
    [t]
  );
}

const STATUS_FILTER_VALUES = [
  "all",
  "pending",
  "confirmed",
  "booked",
  "started",
  "completed",
  "cancelled",
] as const;

const STATUS_FILTER_KEYS: Record<(typeof STATUS_FILTER_VALUES)[number], string> = {
  all: "statusAll",
  pending: "statusPending",
  confirmed: "statusConfirmed",
  booked: "statusBooked",
  started: "statusInProgress",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
};

/** Human-readable label for a raw group booking status. */
function groupStatusLabel(status: string, gb: (key: string) => string): string {
  switch (status) {
    case "pending":
      return gb("statusPending");
    case "confirmed":
      return gb("statusConfirmed");
    case "booked":
      return gb("statusBooked");
    case "started":
      return gb("statusInProgress");
    case "in_progress":
      return gb("statusInProgress");
    case "completed":
      return gb("statusCompleted");
    case "cancelled":
      return gb("statusCancelled");
    case "waiting":
      return gb("statusWaiting");
    default:
      return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  }
}

const GROUP_PAGE_LIMIT = 50;

type ServiceRow = {
  id: string;
  title: string;
  duration_minutes?: number;
  price?: number;
  currency?: string;
  service_type?: string;
  variant_name?: string | null;
  parent_service_id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  global_category_id?: string | null;
  global_category_name?: string | null;
  category?: { id?: string | null; name?: string | null; title?: string | null } | null;
  global_category?: { id?: string | null; name?: string | null; title?: string | null } | null;
  provider_categories?: { id?: string | null; name?: string | null; title?: string | null } | null;
  add_ons?: AddOnRow[];
};
type TeamRow = { id: string; name?: string };
type AddOnRow = { id: string; name: string; price?: number; duration_minutes?: number };
type ParticipantFormRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  serviceId: string;
  addOnIds: string[];
  notes: string;
  /** Optional per-participant staff; defaults to group staff when empty */
  staffId?: string;
  /** Linked provider_clients row – set when an existing client is picked via search */
  customerId?: string;
};

type ParticipantClientSearchState = {
  query: string;
  results: { id: string; customer_id: string; full_name: string; email?: string; phone?: string }[];
  loading: boolean;
  open: boolean;
};
type ProductRow = {
  id: string;
  name: string;
  price: number;
  variants?: { id: string; name: string; price: number }[];
};
type SelectedGroupProduct = {
  productId: string;
  productName: string;
  productVariantId?: string;
  productVariantName?: string;
  quantity: number;
  unitPrice: number;
};
type EditingGroupContext = {
  serviceId: string | null;
  staffId: string | null;
  locationId: string | null;
  locationType: "at_salon" | "at_home";
};

function statusStyle(s: string) {
  if (s === "confirmed") return { bg: "bg-blue-50", text: "text-blue-700" };
  if (s === "booked") return { bg: "bg-indigo-50", text: "text-indigo-700" };
  if (s === "pending") return { bg: "bg-slate-50", text: "text-slate-600" };
  if (s === "started") return { bg: "bg-amber-50", text: "text-amber-700" };
  if (s === "completed") return { bg: "bg-green-50", text: "text-green-700" };
  if (s === "cancelled") return { bg: "bg-red-50", text: "text-red-700" };
  return { bg: "bg-gray-100", text: "text-gray-500" };
}

const GROUP_BOOKING_CARD_MIN_HEIGHT = 96;

const GroupBookingCard = memo(function GroupBookingCard({
  group,
  onPress,
}: {
  group: GroupBooking;
  onPress: (group: GroupBooking) => void;
}) {
  const gb = useGroupBookingsI18n();
  const ss = statusStyle(group.status);
  return (
    <TouchableOpacity
      style={[
        twStyle("rounded-xl border border-gray-100 bg-white p-4"),
        { minHeight: GROUP_BOOKING_CARD_MIN_HEIGHT },
      ]}
      onPress={() => onPress(group)}
      activeOpacity={0.7}
    >
      <View style={twStyle("flex-row items-start justify-between")}>
        <View style={twStyle("flex-1")}>
          <View style={twStyle("flex-row items-center")}>
            <Text
              style={[twStyle("text-base font-semibold text-gray-900"), { marginEnd: 8 }]}
            >
              {group.title?.trim() ||
                group.service_name ||
                group.ref_number ||
                gb("groupSessionFallback")}
            </Text>
            <View style={twStyle(`rounded-full px-2 py-0.5 ${ss.bg}`)}>
              <Text style={twStyle(`text-[10px] font-medium ${ss.text}`)}>
                {groupStatusLabel(group.status, gb)}
              </Text>
            </View>
          </View>
          <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
            {gb("cardSchedule", {
              date: formatDate(group.scheduled_date),
              time: group.scheduled_time?.substring(0, 5),
              minutes: group.duration_minutes,
            })}
          </Text>
          <View style={twStyle("mt-1.5 flex-row items-center")}>
            {group.team_member_name ? (
              <View style={[twStyle("flex-row items-center"), { marginEnd: 12 }]}>
                <Ionicons
                  name="person-outline"
                  size={12}
                  color="#6b7280"
                  style={{ marginEnd: 4 }}
                />
                <Text style={twStyle("text-xs text-gray-500")}>{group.team_member_name}</Text>
              </View>
            ) : null}
            <View style={twStyle("flex-row items-center")}>
              <Ionicons
                name="people-outline"
                size={12}
                color="#6b7280"
                style={{ marginEnd: 4 }}
              />
              <Text style={twStyle("text-xs text-gray-500")}>
                {resolveGroupParticipantCount(group)}
                {group.max_participants ? `/${group.max_participants}` : ""}{" "}
                {group.max_participants &&
                resolveGroupParticipantCount(group) >= group.max_participants
                  ? gb("fullDot")
                  : gb("participantsWord")}
              </Text>
            </View>
          </View>
        </View>
        <Text style={twStyle("text-base font-bold text-gray-900")}>
          {formatCurrency(Number(group.total_price) || 0)}
        </Text>
      </View>

      {group.ref_number ? (
        <Text style={twStyle("mt-1 text-[10px] text-gray-400")}>#{group.ref_number}</Text>
      ) : null}
    </TouchableOpacity>
  );
});

function GroupBookingsScrollHeader({
  stats,
  onCreate,
  canCreate,
}: {
  stats: {
    total: number;
    totalParticipants: number;
    recognizedEarnings: number;
    bookedGross: number;
  };
  onCreate: () => void;
  canCreate: boolean;
}) {
  const gb = useGroupBookingsI18n();
  return (
    <View style={{ paddingBottom: 4 }}>
      {canCreate ? (
      <TouchableOpacity
        onPress={onCreate}
        activeOpacity={0.86}
        style={twStyle("mb-3 overflow-hidden rounded-2xl bg-gray-900 p-4")}
        accessibilityRole="button"
        accessibilityLabel={gb("createNewA11y")}
      >
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-1 pe-3")}>
            <View style={twStyle("mb-2 flex-row items-center")}>
              <View style={twStyle("me-2 rounded-full bg-white/10 px-2 py-1")}>
                <Text
                  style={twStyle(
                    "text-[10px] font-semibold uppercase tracking-wide text-indigo-100"
                  )}
                >
                  {gb("newBadge")}
                </Text>
              </View>
              <Text style={twStyle("text-xs font-medium text-indigo-100")}>{gb("guidedSetup")}</Text>
            </View>
            <Text style={twStyle("text-lg font-bold text-white")}>{gb("createGroupBooking")}</Text>
            <Text style={twStyle("mt-1 text-xs leading-5 text-gray-300")}>
              {gb("createHeroBody")}
            </Text>
          </View>
          <View style={twStyle("h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500")}>
            <Ionicons name="add" size={24} color="#ffffff" />
          </View>
        </View>
      </TouchableOpacity>
      ) : null}

      <View style={twStyle("mb-3 flex-row gap-2")}>
        <View style={[twStyle("flex-1"), { minWidth: 0, marginEnd: 4 }]}>
          <StatCard
            title={gb("statTotal")}
            value={String(stats.total)}
            icon="people-outline"
            iconColor="#6366f1"
            iconBg="bg-indigo-50"
            compact
          />
        </View>
        <View style={[twStyle("flex-1"), { minWidth: 0, marginEnd: 4 }]}>
          <StatCard
            title={gb("statPeople")}
            value={String(stats.totalParticipants)}
            icon="person-outline"
            iconColor="#3b82f6"
            iconBg="bg-blue-50"
            compact
          />
        </View>
        <View style={[twStyle("flex-1"), { minWidth: 0 }]}>
          <StatCard
            title={gb("statEarned")}
            value={formatCurrency(stats.recognizedEarnings)}
            subtitle={gb("bookedAmount", { amount: formatCurrency(stats.bookedGross) })}
            icon="cash-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact
          />
        </View>
      </View>
    </View>
  );
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

function SelectChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        twStyle("rounded-full border px-3 py-2"),
        selected
          ? twStyle("border-indigo-600 bg-indigo-50")
          : twStyle("border-gray-200 bg-gray-50"),
        { marginEnd: 8, maxWidth: 220 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        style={twStyle(`text-xs font-medium ${selected ? "text-indigo-800" : "text-gray-700"}`)}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function serviceLabel(service: ServiceRow, variantLabel: string): string {
  if (service.variant_name?.trim()) return `${service.title} · ${service.variant_name.trim()}`;
  if (service.service_type === "variant") return `${service.title} · ${variantLabel}`;
  return service.title;
}

const UNCATEGORIZED_GROUP_SERVICE_CATEGORY = "__uncategorized__";

function getServiceCategoryInfo(service: ServiceRow, otherLabel: string): { id: string; label: string } {
  const id =
    service.category_id ||
    service.global_category_id ||
    service.category?.id ||
    service.global_category?.id ||
    service.provider_categories?.id ||
    UNCATEGORIZED_GROUP_SERVICE_CATEGORY;
  const label =
    service.category_name ||
    service.global_category_name ||
    service.category?.name ||
    service.category?.title ||
    service.global_category?.name ||
    service.global_category?.title ||
    service.provider_categories?.name ||
    service.provider_categories?.title ||
    otherLabel;
  return { id, label };
}

function createBlankParticipant(id: string, serviceId = ""): ParticipantFormRow {
  return { id, name: "", phone: "", email: "", serviceId, addOnIds: [], notes: "", staffId: "" };
}

function getParticipantLine(
  participant: Pick<ParticipantFormRow, "serviceId" | "addOnIds">,
  fallbackServiceId: string,
  services: ServiceRow[]
) {
  const serviceId = participant.serviceId || fallbackServiceId;
  const service = services.find((s) => s.id === serviceId);
  const addOns = (participant.addOnIds ?? [])
    .map((id) => service?.add_ons?.find((ao) => ao.id === id))
    .filter((ao): ao is AddOnRow => Boolean(ao));
  const basePrice = Number(service?.price ?? 0) || 0;
  const baseDuration = Number(service?.duration_minutes ?? 60) || 60;
  const addOnPrice = addOns.reduce((sum, ao) => sum + (Number(ao.price ?? 0) || 0), 0);
  const addOnDuration = addOns.reduce(
    (sum, ao) => sum + (Number(ao.duration_minutes ?? 0) || 0),
    0
  );
  return {
    serviceId,
    service,
    addOns,
    price: basePrice + addOnPrice,
    durationMinutes: baseDuration + addOnDuration,
  };
}

export default function GroupBookingsScreen() {
  const gb = useGroupBookingsI18n();
  const sl = useCallback((svc: ServiceRow) => serviceLabel(svc, gb("variant")), [gb]);
  useResponsive();
  const router = useRouter();
  const handleBack = useProviderStackBack();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{
    open_group_id?: string;
    open_edit?: string;
    open_cancel?: string;
    openCreate?: string;
    from?: string;
    default_date?: string;
    default_time?: string;
    default_staff_id?: string;
    default_location_id?: string;
  }>();
  const pendingGroupDeepLinkRef = useRef<"edit" | "cancel" | null>(null);
  const openGroupDetailRef = useRef<(group: GroupBooking) => Promise<void>>(async () => {});
  const selectedGroupRef = useRef<GroupBooking | null>(null);
  const { provider, selectedLocationId } = useProvider();
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const manualCardEnabled = useFeatureFlag("payment_manual_card");
  const paymentLinkEnabled = useFeatureFlag("payment_link");
  const {
    paycloudEnabled,
    collectEnabled: paycloudCollectEnabled,
    inFlight: paycloudInFlight,
    primaryBlocker: paycloudPrimaryBlocker,
    loading: paycloudLoading,
  } = usePaycloudCollectAvailability();
  const providerTz = provider?.timezone ?? null;
  const locations = provider?.locations ?? [];
  const { data: permissionData } = useApi<{
    isOwner?: boolean;
    permissions?: Record<string, boolean>;
  }>("/api/provider/permissions", { staleTimeMs: 60_000 });
  const isOwner = permissionData?.isOwner === true;
  const canCreateGroups = isOwner || permissionData?.permissions?.create_appointments === true;
  const canEditGroups = isOwner || permissionData?.permissions?.edit_appointments === true;
  const canCancelGroups =
    isOwner ||
    permissionData?.permissions?.cancel_appointments === true ||
    canEditGroups;
  const canProcessPayments =
    isOwner || permissionData?.permissions?.process_payments === true;

  const { data: servicesRaw, refresh: refreshServices } = useApi<ServiceRow[]>(
    "/api/provider/services?include_variants=true"
  );
  const { data: productsRaw, refresh: refreshProducts } = useApi<unknown>(
    "/api/provider/products?limit=200"
  );
  const teamUrl = selectedLocationId
    ? `/api/provider/team?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/team";
  const { data: teamRaw } = useApi<TeamRow[]>(teamUrl);
  // §Provider-audit 2026-04 (packages round 3 — mobile parity): fetch the
  // provider's catalog packages so the create sheet can attach a
  // `package_id` to a group booking (parity with `GroupBookingDialog` on
  // web). Endpoint returns `{ data: { packages: [...] } }` via the
  // `successResponse` helper, so `useApi` unwraps the outer `data` and we
  // access `.packages` here. Filtered to active packages with at least one
  // item to avoid showing broken catalog entries.
  const packagesUrl = selectedLocationId
    ? `/api/provider/packages?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/packages";
  const { data: packagesRaw } = useApi<{ packages?: PackageRow[] }>(packagesUrl);
  const services = useMemo(() => (Array.isArray(servicesRaw) ? servicesRaw : []), [servicesRaw]);
  const productsList = useMemo(
    () => normalizeProductsList(productsRaw) as ProductRow[],
    [productsRaw]
  );

  useEffect(() => {
    const subProducts = DeviceEventEmitter.addListener(PROVIDER_PRODUCTS_CATALOG_CHANGED, () => {
      void refreshProducts();
    });
    const subServices = DeviceEventEmitter.addListener(PROVIDER_SERVICES_CATALOG_CHANGED, () => {
      void refreshServices();
    });
    return () => {
      subProducts.remove();
      subServices.remove();
    };
  }, [refreshProducts, refreshServices]);

  const teamMembers = useMemo(() => (Array.isArray(teamRaw) ? teamRaw : []), [teamRaw]);
  const [selectedServiceCategory, setSelectedServiceCategory] = useState("all");
  const packagesList = useMemo<PackageRow[]>(
    () =>
      (packagesRaw?.packages ?? []).filter(
        (p) => p.is_active !== false && Array.isArray(p.items) && p.items.length > 0
      ),
    [packagesRaw]
  );
  const parentServices = useMemo(
    () => services.filter((s) => !s.parent_service_id && s.service_type !== "variant"),
    [services]
  );
  const variantServices = useMemo(
    () => services.filter((s) => s.parent_service_id || s.service_type === "variant"),
    [services]
  );
  const servicesForPicking = useMemo(
    () => [...parentServices, ...variantServices],
    [parentServices, variantServices]
  );
  const serviceCategoryOptions = useMemo(() => {
    const categories = new Map<string, { id: string; label: string; count: number }>();
    parentServices.forEach((service) => {
      const info = getServiceCategoryInfo(service, gb("otherCategory"));
      const existing = categories.get(info.id);
      if (existing) existing.count += 1;
      else categories.set(info.id, { ...info, count: 1 });
    });
    return Array.from(categories.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [parentServices, gb]);
  const visibleParentServices = useMemo(
    () =>
      selectedServiceCategory === "all"
        ? parentServices
        : parentServices.filter((s) => getServiceCategoryInfo(s, gb("otherCategory")).id === selectedServiceCategory),
    [parentServices, selectedServiceCategory, gb]
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupBooking | null>(null);
  selectedGroupRef.current = selectedGroup;
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [participantForm, setParticipantForm] = useState<ParticipantFormRow>(
    createBlankParticipant("participant-form")
  );
  const [showEdit, setShowEdit] = useState(false);
  // B9: persist the id the edit sheet is operating on so a PATCH never goes
  // out to `/api/provider/group-bookings/` with an empty id after we clear
  // `selectedGroup` (which we do so the detail sheet closes under the edit
  // sheet on iOS).
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  /** How many participants are already in the group being edited — used to enforce the lower-bound on capacity. */
  const [editingGroupCurrentCount, setEditingGroupCurrentCount] = useState(0);
  const [editForm, setEditForm] = useState({
    date: "",
    time: "",
    duration: "",
    notes: "",
    maxParticipants: "",
    // §Provider-audit 2026-04 (packages round 4 — mobile edit parity):
    // the web `GroupBookingDialog` allows attach/swap of `package_id` when
    // editing an existing group booking. Mirror that on mobile so providers
    // no longer need to switch to the web portal just to re-link / detach
    // a package. `""` = no package, any id = attached, `"__DETACH__"` is a
    // sentinel we use internally to send `package_id: null` to the server.
    packageId: "",
    // Track the original id so we only send `package_id` in the PATCH
    // payload when it actually changed. Avoids clobbering the server-side
    // row with a no-op write on edits that didn't touch the package.
    originalPackageId: "",
  });
  const [showEditPackagePicker, setShowEditPackagePicker] = useState(false);
  const [editingGroupContext, setEditingGroupContext] = useState<EditingGroupContext | null>(null);
  // Track the slot that was in effect when the edit sheet opened so we can
  // skip the availability pre-flight when only non-slot fields change.
  const [editOriginalSlot, setEditOriginalSlot] = useState<{
    date: string;
    time: string;
    duration: string;
  } | null>(null);
  const [verifyingEditSlot, setVerifyingEditSlot] = useState(false);

  // B10: create path — minimal form. Participants are added from the detail
  // sheet after the group is created, matching the existing "add participant"
  // flow.
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    date: "",
    time: "",
    duration: "60",
    maxParticipants: "10",
    notes: "",
    serviceId: "" as string,
    staffId: "" as string,
    locationId: "" as string,
    locationType: "at_salon" as "at_salon" | "at_home",
    addressSearchValue: "",
    addressLine1: "",
    addressCity: "",
    addressState: "",
    addressPostalCode: "",
    addressCountry: "South Africa",
    addressLatitude: null as number | null,
    addressLongitude: null as number | null,
    travelFee: "",
    travelPreviewDistanceKm: null as number | null,
    packageId: "" as string,
  });
  const [createParticipants, setCreateParticipants] = useState<ParticipantFormRow[]>([]);
  const [createParticipantProgress, setCreateParticipantProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  // Per-participant client search state (keyed by ParticipantFormRow.id)
  const [participantSearchMap, setParticipantSearchMap] = useState<
    Record<string, ParticipantClientSearchState>
  >({});
  const participantSearchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [createProducts, setCreateProducts] = useState<SelectedGroupProduct[]>([]);
  const [showPackagePicker, setShowPackagePicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const finishProductPicker = useCallback(() => {
    setShowProductPicker(false);
    requestAnimationFrame(() => setShowCreate(true));
  }, []);
  const [validatingCreateAddress, setValidatingCreateAddress] = useState(false);
  const [createMapPinOpen, setCreateMapPinOpen] = useState(false);
  const [createLocatingHome, setCreateLocatingHome] = useState(false);
  const pendingCreateAddressAlertRef = useRef(false);
  const createAddressValidateGenRef = useRef(0);
  const [createMapPreviewCoords, setCreateMapPreviewCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [extraGroups, setExtraGroups] = useState<GroupBooking[]>([]);
  const [loadedGroupPage, setLoadedGroupPage] = useState(1);
  const [loadingMoreGroups, setLoadingMoreGroups] = useState(false);
  const openGroupFetchRef = useRef<string | null>(null);
  const [groupDetailLoading, setGroupDetailLoading] = useState(false);

  const createDateOptions = useMemo(
    () => Array.from({ length: 21 }, (_, i) => addDays(startOfDay(new Date()), i)),
    []
  );
  const editDateOptions = useMemo(() => {
    const base =
      editForm.date && YMD_RE.test(editForm.date)
        ? parseISO(`${editForm.date}T00:00:00`)
        : new Date();
    return Array.from({ length: 21 }, (_, i) => addDays(startOfDay(base), i));
  }, [editForm.date]);

  const statusParam = filter !== "all" ? `&status=${filter}` : "";
  const {
    data: groupData,
    loading,
    error: groupError,
    refresh,
    mutate: mutateGroupList,
  } = useApi<GroupBookingsResponse>(
    `/api/provider/group-bookings?limit=${GROUP_PAGE_LIMIT}&page=1${statusParam}`
  );
  const { execute: updateGroup, loading: updatingGroup } = useApiMutation("patch");
  const { execute: createGroup, loading: creatingGroup } = useApiMutation<{
    id?: string;
    data?: { id?: string; ref_number?: string | null };
    ref_number?: string | null;
  }>("post");
  const { execute: createBooking, loading: creatingParticipantBooking } = useApiMutation<{
    id?: string;
    data?: { id?: string };
  }>("post");
  const { execute: cancelGroup } = useApiMutation("delete");
  const { execute: postGroupAction, loading: groupActionLoading } = useApiMutation("post");
  const { execute: addParticipant, loading: addingParticipant } = useApiMutation("post");
  const { execute: removeParticipant } = useApiMutation("delete");
  // Wave 4.1 (audit 2026-04 final 100/100): provider mobile check-in / out
  // parity with web. Check-in endpoint:
  //   POST /api/provider/group-bookings/:id/participants/:pid/check-in
  // Check-out endpoint:
  //   POST /api/provider/group-bookings/:id/participants/:pid/check-out
  const { execute: checkInParticipant } = useApiMutation("post");
  const { execute: checkOutParticipant } = useApiMutation("post");

  // §Group-booking-audit 2026-05 (review screen + payment): show a final
  // confirmation step before posting, with payment method selection mirroring
  // the single-booking flow. Defaults to "pay_later" so providers must
  // explicitly opt into recording money received at create time.
  const [createStep, setCreateStep] = useState<"form" | "review">("form");
  const [createReviewError, setCreateReviewError] = useState<string | null>(null);
  const [createFieldError, setCreateFieldError] =
    useState<GroupBookingCreateValidationField | null>(null);
  const [checkingCreateReview, setCheckingCreateReview] = useState(false);
  const [createReadinessExpanded, setCreateReadinessExpanded] = useState(false);
  const createFormScrollRef = useRef<ScrollView>(null);
  const { registerSection, registerParticipantRow, scrollToSection, resetSections } =
    useCreateFormSections();
  const [pendingParticipantId, setPendingParticipantId] = useState<string | null>(null);
  const [refundParticipant, setRefundParticipant] = useState<ParticipantRefundTarget | null>(null);
  const [paymentRecordedNotice, setPaymentRecordedNotice] = useState<string | null>(null);
  const previousGroupRef = useRef<GroupBooking | null>(null);
  const [createPaymentMethod, setCreatePaymentMethod] = useState<
    "pay_later" | "cash" | "card" | "yoco_pos" | "payment_link" | "paystack_terminal" | "paycloud_terminal"
  >("pay_later");
  const [createSendNotification, setCreateSendNotification] = useState(true);
  const [paystackTerminalSheet, setPaystackTerminalSheet] = useState<{
    expectedAmount: number;
    terminal: { qr_url?: string | null; payment_link?: string | null; terminal_url?: string | null; name?: string | null };
  } | null>(null);
  const [isPreparingTerminal, setIsPreparingTerminal] = useState(false);
  const [showPaycloudPayment, setShowPaycloudPayment] = useState(false);
  const [paycloudAmount, setPaycloudAmount] = useState(0);
  const [paycloudCollectTarget, setPaycloudCollectTarget] = useState<{
    entityType: PayCloudEntityType;
    entityId: string;
    bookingId?: string;
    groupBookingId?: string;
    locationId?: string | null;
  } | null>(null);

  const openPaycloudCollect = useCallback(
    (target: {
      entityType: PayCloudEntityType;
      entityId: string;
      amount: number;
      bookingId?: string;
      groupBookingId?: string;
      locationId?: string | null;
    }) => {
      setPaycloudCollectTarget({
        entityType: target.entityType,
        entityId: target.entityId,
        bookingId: target.bookingId,
        groupBookingId: target.groupBookingId,
        locationId: target.locationId,
      });
      setPaycloudAmount(target.amount);
      setShowPaycloudPayment(true);
    },
    [],
  );

  // Reset payment method to "pay_later" if the selected method is gated off.
  useEffect(() => {
    if (createPaymentMethod === "yoco_pos" && !yocoEnabled) setCreatePaymentMethod("pay_later");
    if (createPaymentMethod === "card" && !manualCardEnabled) setCreatePaymentMethod("pay_later");
    if (createPaymentMethod === "paystack_terminal" && !paystackTerminalEnabled) setCreatePaymentMethod("pay_later");
    if (createPaymentMethod === "payment_link" && !paymentLinkEnabled) setCreatePaymentMethod("pay_later");
    if (
      (!paycloudEnabled || !paycloudCollectEnabled) &&
      createPaymentMethod === "paycloud_terminal"
    ) {
      setCreatePaymentMethod("pay_later");
    }
  }, [
    yocoEnabled,
    manualCardEnabled,
    paystackTerminalEnabled,
    paymentLinkEnabled,
    paycloudEnabled,
    paycloudCollectEnabled,
    createPaymentMethod,
  ]);

  useEffect(() => {
    setExtraGroups([]);
    setLoadedGroupPage(1);
  }, [filter]);

  useEffect(() => {
    setLoadedGroupPage(groupData?.page ?? 1);
  }, [groupData?.page]);

  const groups = useMemo(() => {
    const byId = new Map<string, GroupBooking>();
    for (const group of groupData?.data ?? []) byId.set(group.id, group);
    for (const group of extraGroups) byId.set(group.id, group);
    return Array.from(byId.values());
  }, [groupData?.data, extraGroups]);

  const createSlotParams = useMemo(() => {
    const serviceIds = Array.from(
      new Set([createForm.serviceId, ...createParticipants.map((p) => p.serviceId)].filter(Boolean))
    );
    const participantDurations = createParticipants.map(
      (p) => getParticipantLine(p, createForm.serviceId, services).durationMinutes
    );
    const duration = Math.max(Number(createForm.duration) || 60, ...participantDurations, 60);
    return {
      date: createForm.date,
      duration,
      staffId: createForm.staffId || "",
      locationId: createForm.locationId || selectedLocationId || "",
      serviceIds,
    };
  }, [
    createForm.date,
    createForm.duration,
    createForm.staffId,
    createForm.locationId,
    createForm.serviceId,
    createParticipants,
    services,
    selectedLocationId,
  ]);

  const createReadiness = useMemo(
    () =>
      buildGroupBookingCreateReadiness({
        date: createForm.date,
        time: createForm.time,
        duration: createForm.duration,
        serviceId: createForm.serviceId,
        staffId: createForm.staffId,
        locationType: createForm.locationType,
        addressLine1: createForm.addressLine1,
        addressLatitude: createForm.addressLatitude,
        addressLongitude: createForm.addressLongitude,
        participants: createParticipants
          .map((p) => ({
            name: p.name.trim(),
            phone: p.phone.trim(),
            email: p.email.trim(),
            serviceId: p.serviceId || createForm.serviceId,
          }))
          .filter((p) => p.name.length > 0 || p.phone.length > 0 || p.email.length > 0),
        validatePhone: validateE164Phone,
      }),
    [
      createForm.date,
      createForm.time,
      createForm.duration,
      createForm.serviceId,
      createForm.staffId,
      createForm.locationType,
      createForm.addressLine1,
      createForm.addressLatitude,
      createForm.addressLongitude,
      createParticipants,
    ],
  );

  const createSlotQuery = useMemo(() => {
    if (!createSlotParams.date || !YMD_RE.test(createSlotParams.date)) return null;
    return {
      date: createSlotParams.date,
      duration_minutes: createSlotParams.duration,
      staff_ids: createSlotParams.staffId || undefined,
      location_id: createForm.locationType === "at_salon" && createSlotParams.locationId ? createSlotParams.locationId : undefined,
      service_ids: createSlotParams.serviceIds.length > 0 ? createSlotParams.serviceIds.join(",") : undefined,
      mode: createForm.locationType === "at_home" ? "mobile" : "salon",
      travel_buffer: createForm.locationType === "at_home" ? 30 : 0,
    };
  }, [createForm.locationType, createSlotParams]);

  const { rows: createSlotRows, loading: createSlotsLoading, slotsData: createSlotsData } =
    useBookingAvailableSlots(createSlotQuery, { enabled: !!createSlotQuery });

  const editSlotParams = useMemo(() => {
    const duration = Number(editForm.duration) || 60;
    const staffId = editingGroupContext?.staffId || "";
    const locationId = editingGroupContext?.locationId || "";
    const serviceIds = editingGroupContext?.serviceId ? [editingGroupContext.serviceId] : [];
    return { date: editForm.date, duration, staffId, locationId, serviceIds };
  }, [editForm.date, editForm.duration, editingGroupContext]);

  const editSlotQuery = useMemo(() => {
    if (!showEdit || !editSlotParams.date || !YMD_RE.test(editSlotParams.date)) return null;
    return {
      date: editSlotParams.date,
      duration_minutes: editSlotParams.duration,
      staff_ids: editSlotParams.staffId || undefined,
      location_id: editingGroupContext?.locationType !== "at_home" && editSlotParams.locationId ? editSlotParams.locationId : undefined,
      service_ids: editSlotParams.serviceIds.length > 0 ? editSlotParams.serviceIds.join(",") : undefined,
      mode: editingGroupContext?.locationType === "at_home" ? "mobile" : "salon",
      travel_buffer: editingGroupContext?.locationType === "at_home" ? 30 : 0,
      exclude_group_booking_id: editingGroupId || undefined,
    };
  }, [showEdit, editSlotParams, editingGroupContext?.locationType, editingGroupId]);

  const { rows: editSlotRows, loading: editSlotsLoading, slotsData: editSlotsData } =
    useBookingAvailableSlots(editSlotQuery, { enabled: !!editSlotQuery });

  // Keep `selectedGroup` in sync when participant payment/check-in data changes,
  // not only when `group_bookings.updated_at` bumps (mark_paid often skips that).
  // Skip while an optimistic mutation is in flight so a stale list refresh cannot
  // flash the detail sheet back to pre-action state. Also skip when the open
  // detail is ahead of the list row (common immediately after mark_paid).
  useEffect(() => {
    if (!selectedGroup) return;
    if (pendingParticipantId || groupActionLoading || previousGroupRef.current) return;
    const fresh = groups.find((g) => g.id === selectedGroup.id);
    if (!fresh) return;
    if (shouldRejectStaleListPaymentSync(selectedGroup, fresh)) return;
    const metaChanged =
      fresh.updated_at !== selectedGroup.updated_at || fresh.status !== selectedGroup.status;
    const participantsChanged = !participantsEqual(
      fresh.participants,
      selectedGroup.participants
    );
    if (metaChanged || participantsChanged) {
      setSelectedGroup({
        ...fresh,
        current_participants: resolveGroupParticipantCount(fresh),
      });
    }
  }, [groups, selectedGroup, pendingParticipantId, groupActionLoading]);

  useEffect(() => {
    setPaymentRecordedNotice(null);
  }, [selectedGroup?.id]);

  useEffect(() => {
    const openId = typeof params.open_group_id === "string" ? params.open_group_id.trim() : "";
    if (!openId) return;
    // §Group-booking-audit 2026-05: ignore obviously non-uuid ids so we never
    // hammer the API with `/api/provider/group-bookings/undefined` or shape
    // strings coming from misrouted notifications.
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidLike.test(openId)) {
      openGroupFetchRef.current = null;
      return;
    }
    const group = groups.find((g) => g.id === openId);
    if (group) {
      void openGroupDetail(group);
      openGroupFetchRef.current = null;
      router.setParams({ open_group_id: "" });
      return;
    }
    if (openGroupFetchRef.current === openId) return;
    openGroupFetchRef.current = openId;
    (async () => {
      const res = await api.get<any>(`/api/provider/group-bookings/${encodeURIComponent(openId)}`);
      const payload = res.data?.data ?? res.data?.group ?? res.data;
      const fetched = Array.isArray(payload) ? null : payload;
      if (res.error || !fetched?.id) {
        // §Group-booking-audit 2026-05: only alert once per id so a missing
        // group from a stale deep link does not pop the alert on every
        // re-render of the screen.
        Alert.alert(
          gb("notFoundTitle"),
          gb("notFoundBody")
        );
        openGroupFetchRef.current = openId; // keep set so we don't refetch
        return;
      }
      setExtraGroups((prev) =>
        prev.some((g) => g.id === fetched.id)
          ? prev.map((g) => (g.id === fetched.id ? (fetched as GroupBooking) : g))
          : [...prev, fetched as GroupBooking]
      );
      setSelectedGroup(fetched as GroupBooking);
      openGroupFetchRef.current = null;
      router.setParams({ open_group_id: "" });
    })();
  }, [groups, params.open_group_id, router]);

  async function refreshGroupDetail(group: GroupBooking): Promise<GroupBooking | null> {
    setGroupDetailLoading(true);
    try {
      const res = await api.get<any>(
        `/api/provider/group-bookings/${encodeURIComponent(group.id)}`
      );
      const payload = res.data?.data ?? res.data?.group ?? res.data;
      const fetched = Array.isArray(payload) ? null : payload;
      if (!res.error && fetched?.id) {
        const detail = fetched as GroupBooking;
        const normalized: GroupBooking = {
          ...detail,
          current_participants: resolveGroupParticipantCount(detail),
        };
        setSelectedGroup(normalized);
        setExtraGroups((prev) =>
          prev.some((g) => g.id === normalized.id)
            ? prev.map((g) => (g.id === normalized.id ? normalized : g))
            : [...prev, normalized]
        );
        if (groupData?.data) {
          mutateGroupList({
            ...groupData,
            data: groupData.data.map((g) => (g.id === normalized.id ? normalized : g)),
          });
        }
        return normalized;
      }
    } finally {
      setGroupDetailLoading(false);
    }
    return null;
  }

  async function openGroupDetail(group: GroupBooking) {
    setSelectedGroup(group);
    await refreshGroupDetail(group);
  }
  openGroupDetailRef.current = openGroupDetail;

  useFocusEffect(
    useCallback(() => {
      if (!selectedGroup?.id) return;
      void openGroupDetailRef.current(selectedGroup);
    }, [selectedGroup?.id])
  );

  useGroupBookingPaymentRealtime(
    selectedGroup?.id,
    !!selectedGroup,
    useCallback(() => {
      const current = selectedGroupRef.current;
      if (current?.id) {
        void openGroupDetailRef.current(current);
      }
    }, [])
  );

  useEffect(() => {
    if (params.open_edit === "1") pendingGroupDeepLinkRef.current = "edit";
    if (params.open_cancel === "1") pendingGroupDeepLinkRef.current = "cancel";
  }, [params.open_edit, params.open_cancel]);

  useEffect(() => {
    if (!selectedGroup?.id || !pendingGroupDeepLinkRef.current) return;
    const action = pendingGroupDeepLinkRef.current;
    pendingGroupDeepLinkRef.current = null;
    router.setParams({ open_edit: "", open_cancel: "" } as never);
    if (action === "edit") {
      openEdit(selectedGroup);
    } else if (action === "cancel") {
      void handleCancel(selectedGroup);
    }
  }, [selectedGroup?.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setExtraGroups([]);
      setLoadedGroupPage(1);
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const loadMoreGroups = useCallback(async () => {
    if (loadingMoreGroups) return;
    const totalPages = groupData?.total_pages ?? 1;
    if (loadedGroupPage >= totalPages) return;
    setLoadingMoreGroups(true);
    try {
      const nextPage = loadedGroupPage + 1;
      const res = await api.get<GroupBookingsResponse>(
        `/api/provider/group-bookings?limit=${GROUP_PAGE_LIMIT}&page=${nextPage}${statusParam}`
      );
      if (res.error) {
        Alert.alert(gb("loadMoreFailed"), res.error.message || gb("tryAgain"));
        return;
      }
      const rows = res.data?.data ?? [];
      setExtraGroups((prev) => {
        const byId = new Map(prev.map((g) => [g.id, g] as const));
        for (const group of rows) byId.set(group.id, group);
        return Array.from(byId.values());
      });
      setLoadedGroupPage(res.data?.page ?? nextPage);
    } finally {
      setLoadingMoreGroups(false);
    }
  }, [groupData?.total_pages, loadedGroupPage, loadingMoreGroups, statusParam]);

  useEffect(() => {
    if (!createForm.date || !YMD_RE.test(createForm.date)) return;
    const available = createSlotRows.filter((s) => s.available).map((s) => s.time);
    if (available.length === 0) return;
    setCreateForm((prev) => {
      if (prev.time && available.includes(prev.time)) return prev;
      return { ...prev, time: available[0] ?? prev.time };
    });
  }, [createForm.date, createSlotRows]);

  useEffect(() => {
    if (
      selectedServiceCategory !== "all" &&
      !serviceCategoryOptions.some((category) => category.id === selectedServiceCategory)
    ) {
      setSelectedServiceCategory("all");
    }
  }, [selectedServiceCategory, serviceCategoryOptions]);

  useEffect(() => {
    if (!showEdit) return;
    if (!editForm.date || !YMD_RE.test(editForm.date)) return;
    const available = editSlotRows.filter((s) => s.available).map((s) => s.time);
    if (available.length === 0) return;
    setEditForm((prev) => {
      if (prev.time && available.includes(prev.time)) return prev;
      return { ...prev, time: available[0] ?? prev.time };
    });
  }, [showEdit, editForm.date, editSlotRows]);

  async function verifyGroupSlotAvailability(args: {
    date: string;
    time: string;
    durationMinutes: number;
    staffId?: string | null;
    locationId?: string | null;
    serviceId?: string | null;
    locationType?: "at_salon" | "at_home";
  }): Promise<string | null> {
    const scheduledAt = buildZonedIsoForWallClock(args.date, args.time.substring(0, 5), providerTz);
    if (!Number.isFinite(Date.parse(scheduledAt))) {
      return gb("invalidSchedule");
    }
    const params = new URLSearchParams({
      scheduled_at: scheduledAt,
      duration_minutes: String(args.durationMinutes),
      mode: args.locationType === "at_home" ? "mobile" : "salon",
      travel_buffer: args.locationType === "at_home" ? "30" : "0",
    });
    if (args.staffId) params.set("staff_ids", args.staffId);
    if (args.locationType !== "at_home" && args.locationId)
      params.set("location_id", args.locationId);
    if (args.serviceId) params.set("offering_ids", args.serviceId);
    if (editingGroupId) params.set("exclude_group_booking_id", editingGroupId);
    const res = await api.get<{ available?: boolean; conflicts?: string[] }>(
      `/api/provider/bookings/check-availability?${params.toString()}`
    );
    if (res.error) return res.error.message || gb("couldNotVerifyAvailability");
    if (res.data?.available === false) {
      return (res.data.conflicts ?? [gb("slotNotAvailable")]).join("\n");
    }
    return null;
  }

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
    const activeStatuses = new Set(["pending", "confirmed", "booked", "started"]);
    const upcoming = groups.filter((g) => activeStatuses.has(g.status)).length;
    const totalParticipants = groups.reduce((s, g) => s + resolveGroupParticipantCount(g), 0);
    const apiStats = groupData?.stats;
    const bookedGross =
      apiStats?.participant_booked_gross ??
      groups
        .filter((g) => g.status === "completed")
        .reduce((s, g) => s + (Number(g.total_price) || 0), 0);
    const recognizedEarnings = apiStats?.recognized_earnings ?? 0;
    return {
      total: groupData?.total ?? groups.length,
      upcoming,
      totalParticipants,
      bookedGross,
      recognizedEarnings,
    };
  }, [groups, groupData]);

  async function handleCancel(group: GroupBooking) {
    if (!canCancelGroups) {
      Alert.alert(gb("permissionRequired"), gb("noPermissionCancel"));
      return;
    }
    if (!group.id) {
      Alert.alert(gb("errorTitle"), gb("noIdYet"));
      return;
    }
    Alert.alert(gb("cancelGroupTitle"), gb("cancelGroupBody"), [
      { text: gb("keep"), style: "cancel" },
      {
        text: gb("cancelBooking"),
        style: "destructive",
        onPress: async () => {
          const { error } = await cancelGroup(
            `/api/provider/group-bookings/${encodeURIComponent(group.id)}`
          );
          if (error) Alert.alert(gb("errorTitle"), error);
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
    if (!group.id) {
      Alert.alert(gb("errorTitle"), gb("noIdYet"));
      return;
    }
    if (newStatus === "cancelled") {
      if (!canCancelGroups) {
        Alert.alert(gb("permissionRequired"), gb("noPermissionCancel"));
        return;
      }
    } else if (!canEditGroups) {
      Alert.alert(gb("permissionRequired"), gb("noPermissionUpdate"));
      return;
    }
    // §Group-booking-audit 2026-05: route "cancelled" through the dedicated
    // DELETE endpoint instead of a non-existent `cancel_service` action so the
    // app never gets stuck on the API returning UNSUPPORTED_ACTION.
    if (newStatus === "cancelled") {
      await handleCancel(group);
      return;
    }
    const action =
      newStatus === "started"
        ? "start_service"
        : newStatus === "completed"
          ? "complete_service"
          : "";
    if (!action) {
      Alert.alert(gb("errorTitle"), gb("unsupportedTransition"));
      return;
    }

    // Gate on unpaid balance before completing a group session.
    if (newStatus === "completed" && !groupIsFullyPaid(group) && Number(group.balance_due ?? 0) > 0) {
      Alert.alert(
        gb("outstandingBalanceTitle"),
        gb("outstandingBalanceBody", { amount: formatCurrency(Number(group.balance_due)) }),
        [
          {
            text: gb("recordPayment"),
            // Keep the detail sheet open so the provider can use the payment buttons.
          },
          {
            text: gb("completeAnyway"),
            style: "default",
            onPress: () => {
              void (async () => {
                const { error } = await postGroupAction(
                  `/api/provider/group-bookings/${encodeURIComponent(group.id)}?action=complete_service`,
                  {},
                );
                if (error) {
                  Alert.alert(gb("errorTitle"), error);
                  return;
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setSelectedGroup(null);
                refresh();
              })();
            },
          },
          { text: gb("cancel"), style: "cancel" },
        ],
      );
      return;
    }

    const { error } = await postGroupAction(
      `/api/provider/group-bookings/${encodeURIComponent(group.id)}?action=${action}`,
      {}
    );
    if (error) {
      Alert.alert(gb("errorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedGroup(null);
    refresh();
  }

  async function handleRecordGroupPayment(
    group: GroupBooking,
    paymentMethod: "cash" | "card" | "bank_transfer" | "other" | "yoco"
  ) {
    if (!canProcessPayments) {
      Alert.alert(gb("permissionRequired"), gb("noPermissionPayments"));
      return;
    }
    if (!group.id) {
      Alert.alert(gb("errorTitle"), gb("noIdYet"));
      return;
    }
    previousGroupRef.current = group;
    const now = new Date().toISOString();
    applyGroupPatch(group.id, (current) => patchGroupMarkPaid(current, now) as GroupBooking);
    setPaymentRecordedNotice(null);

    const { error } = await postGroupAction(
      `/api/provider/group-bookings/${encodeURIComponent(group.id)}?action=mark_paid`,
      {
        payment_method: paymentMethod,
      }
    );
    if (error) {
      rollbackGroupPatch();
      const isNotInvoiced = /not.*invoiced|no.*invoice/i.test(error);
      Alert.alert(
        isNotInvoiced ? gb("participantsNotInvoiced") : gb("paymentNotRecorded"),
        error
      );
      return;
    }
    previousGroupRef.current = null;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPaymentRecordedNotice(gb("paymentRecordedNotice"));
    await openGroupDetail(group);
    await refresh();
  }

  async function handleRequestPaystackTerminal(group: GroupBooking, expectedAmount: number) {
    if (!group.id) {
      Alert.alert(gb("errorTitle"), gb("noIdYet"));
      return;
    }
    setIsPreparingTerminal(true);
    try {
      // api.post<T> returns ApiResponse<T>; T is the inner data field of successResponse
      const res = await api.post<{
        terminal?: { qr_url?: string | null; payment_link?: string | null; terminal_url?: string | null; name?: string | null };
        metadata?: unknown;
        instructions?: string;
      }>(
        PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
        paystackTerminalCollectionIntentPayload({
          entity_type: "group_booking",
          entity_id: group.id,
          expected_amount: expectedAmount,
        }),
        { timeout: 120_000 },
      );
      if (res.error) {
        const errMsg = typeof res.error === "string" ? res.error : (res.error as any)?.message || gb("terminalNotReady");
        Alert.alert(gb("terminalNotReady"), errMsg);
        return;
      }
      const terminal = res.data?.terminal;
      if (!terminal) {
        Alert.alert(gb("terminalNotReady"), gb("noActiveTerminal"));
        return;
      }
      setPaystackTerminalSheet({ expectedAmount, terminal });
    } catch (err: any) {
      const msg = err?.message || gb("couldNotPrepareTerminal");
      Alert.alert(gb("paystackTerminalTitle"), msg);
    } finally {
      setIsPreparingTerminal(false);
    }
  }

  function openEdit(group: GroupBooking) {
    const pkgId = group.package_id ?? "";
    const editDate = group.scheduled_date;
    const editTime = group.scheduled_time?.substring(0, 5) ?? "";
    const editDuration = String(group.duration_minutes);
    setEditForm({
      date: editDate,
      time: editTime,
      duration: editDuration,
      notes: group.notes ?? "",
      maxParticipants: String(group.max_participants ?? ""),
      packageId: pkgId,
      originalPackageId: pkgId,
    });
    setEditOriginalSlot({ date: editDate, time: editTime, duration: editDuration });
    setEditingGroupCurrentCount(resolveGroupParticipantCount(group));
    // B9: capture the id BEFORE clearing selectedGroup so the PATCH has a
    // real target even after the detail sheet closes.
    setEditingGroupId(group.id);
    setEditingGroupContext({
      serviceId: group.service_id ?? null,
      staffId: group.team_member_id ?? null,
      locationId: group.location_id ?? null,
      locationType: group.location_type === "at_home" ? "at_home" : "at_salon",
    });
    setSelectedGroup(null);
    setShowEdit(true);
  }

  /**
   * §Provider-audit 2026-04 (packages round 4 — mobile edit parity):
   * apply a selected package (or detach) to the edit form. Unlike the
   * create path we do NOT auto-rewrite duration / service here — editing
   * an existing group can have staff & participants already attached,
   * silently shifting duration would be surprising. Web portal does the
   * same: changing the package on an existing booking only swaps the
   * `package_id` link (reporting + discount math); timing changes are
   * explicit edits by the user.
   */
  function applyPackageToEditForm(pkg: PackageRow | null) {
    if (!pkg) {
      setEditForm((p) => ({ ...p, packageId: "" }));
      Haptics.selectionAsync().catch(() => {});
      return;
    }
    setEditForm((p) => ({ ...p, packageId: pkg.id }));
    Haptics.selectionAsync().catch(() => {});
  }

  async function handleSaveEdit() {
    // B9: refuse to fire a PATCH without an id. Previously this would hit
    // `/api/provider/group-bookings/` which 404'd the group bookings list
    // endpoint (no PATCH there), silently losing the edit.
    if (!editingGroupId) {
      Alert.alert(gb("errorTitle"), gb("noGroupSelectedEdit"));
      return;
    }

    if (editForm.date && !YMD_RE.test(editForm.date)) {
      Alert.alert(gb("invalidDateTitle"), gb("invalidDateBody"));
      return;
    }
    if (editForm.time && !HHMM_RE.test(editForm.time)) {
      Alert.alert(gb("invalidTimeTitle"), gb("invalidTimeBody"));
      return;
    }
    const durationToCheck = editForm.duration ? Number(editForm.duration) : 60;
    if (!Number.isFinite(durationToCheck) || durationToCheck <= 0) {
      Alert.alert(gb("invalidDurationTitle"), gb("invalidDurationBody"));
      return;
    }
    // Only run the pre-flight availability check when the slot actually moved.
    // For notes / maxParticipants / package-only edits the server PATCH handles
    // the movingSlot guard itself, so an extra round-trip here is wasteful.
    const slotChanged =
      !editOriginalSlot ||
      editForm.date !== editOriginalSlot.date ||
      editForm.time !== editOriginalSlot.time ||
      String(editForm.duration) !== editOriginalSlot.duration;
    if (slotChanged) {
      setVerifyingEditSlot(true);
      const availabilityError = await verifyGroupSlotAvailability({
        date: editForm.date,
        time: editForm.time,
        durationMinutes: durationToCheck,
        staffId: editingGroupContext?.staffId,
        locationId: editingGroupContext?.locationId,
        serviceId: editingGroupContext?.serviceId,
        locationType: editingGroupContext?.locationType,
      }).finally(() => setVerifyingEditSlot(false));
      if (availabilityError) {
        Alert.alert(gb("timeNotAvailable"), availabilityError);
        return;
      }
    }

    // §Provider-audit 2026-04 (packages round 4 — mobile edit parity):
    // only include `package_id` when it actually changed. `null` means
    // explicit detach — `/api/provider/group-bookings/[id]` allows
    // `package_id` in its allowlist and accepts null via `body.package_id`
    // to clear the link.
    const packageChanged = editForm.packageId !== editForm.originalPackageId;
    const packageIdPayload = packageChanged
      ? { package_id: editForm.packageId ? editForm.packageId : null }
      : {};

    const { error } = await updateGroup(
      `/api/provider/group-bookings/${encodeURIComponent(editingGroupId)}`,
      {
        scheduled_date: editForm.date || undefined,
        scheduled_time: editForm.time || undefined,
        duration_minutes: editForm.duration ? Number(editForm.duration) : undefined,
        notes: editForm.notes.trim() || undefined,
        max_participants: editForm.maxParticipants ? Number(editForm.maxParticipants) : undefined,
        ...packageIdPayload,
      }
    );
    if (error) {
      Alert.alert(gb("errorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowEdit(false);
    setEditingGroupId(null);
    setEditingGroupContext(null);
    setEditOriginalSlot(null);
    refresh();
  }

  // B10: create a new group booking from the mobile provider app. Minimal
  // required fields (date/time/duration). Service/staff/location can be
  // filled in later via the edit sheet or the web portal.
  function openCreate() {
    if (!canCreateGroups) {
      Alert.alert(gb("permissionRequired"), gb("noPermissionCreate"));
      return;
    }
    const now = new Date();
    const hh = String(Math.min(23, now.getHours() + 1)).padStart(2, "0");
    const requestedDate =
      typeof params.default_date === "string" && YMD_RE.test(params.default_date)
        ? params.default_date
        : now.toISOString().slice(0, 10);
    const requestedTime =
      typeof params.default_time === "string" && HHMM_RE.test(params.default_time)
        ? params.default_time
        : `${hh}:00`;
    const requestedStaffId =
      typeof params.default_staff_id === "string" ? params.default_staff_id : "";
    const requestedLocationId =
      typeof params.default_location_id === "string" ? params.default_location_id : "";
    const defaultLoc = selectedLocationId ?? locations[0]?.id ?? "";
    setCreateForm({
      title: "",
      date: requestedDate,
      time: requestedTime,
      duration: "60",
      maxParticipants: "10",
      notes: "",
      serviceId: "",
      staffId: requestedStaffId,
      locationId: requestedLocationId || defaultLoc,
      locationType: "at_salon",
      addressSearchValue: "",
      addressLine1: "",
      addressCity: "",
      addressState: "",
      addressPostalCode: "",
      addressCountry: "South Africa",
      addressLatitude: null,
      addressLongitude: null,
      travelFee: "",
      travelPreviewDistanceKm: null,
      packageId: "",
    });
    setCreateParticipants([createBlankParticipant(`participant-${Date.now()}`)]);
    setCreateProducts([]);
    // §Group-booking-audit 2026-05: reset two-step review state on every open
    // (parity with web `GroupBookingDialog`). Without this, a previous open
    // could leave `showCreateReview === true`, stranding a stacked modal that
    // intercepts touches on the underlying "Review & Create" button.
    setCreateStep("form");
    setCreateReviewError(null);
    setCreateFieldError(null);
    setCreateReadinessExpanded(false);
    setCreatePaymentMethod("pay_later");
    setCreateSendNotification(true);
    setValidatingCreateAddress(false);
    resetSections();
    setShowCreate(true);
  }

  const openCreateHandledRef = useRef(false);
  const openCreateRef = useRef(openCreate);
  openCreateRef.current = openCreate;
  useEffect(() => {
    const raw = params.openCreate;
    const want =
      raw === "true" || (Array.isArray(raw) && raw[0] === "true");
    if (!want || openCreateHandledRef.current) return;
    openCreateHandledRef.current = true;
    openCreateRef.current();
    router.setParams({ openCreate: "" } as never);
  }, [params.openCreate, router]);

  function buildCreateValidationInput() {
    return {
      date: createForm.date,
      time: createForm.time,
      duration: createForm.duration,
      serviceId: createForm.serviceId,
      staffId: createForm.staffId,
      locationType: createForm.locationType,
      addressLine1: createForm.addressLine1,
      addressLatitude: createForm.addressLatitude,
      addressLongitude: createForm.addressLongitude,
      participants: createParticipants
        .map((p) => ({
          name: p.name.trim(),
          phone: p.phone.trim(),
          email: p.email.trim(),
          serviceId: p.serviceId || createForm.serviceId,
        }))
        .filter((p) => p.name.length > 0 || p.phone.length > 0 || p.email.length > 0),
      validatePhone: validateE164Phone,
    };
  }

  function validationFieldSectionKey(field: GroupBookingCreateValidationField): string {
    if (field.startsWith("participant:")) return "participants";
    return field;
  }

  function scrollToCreateField(field: GroupBookingCreateValidationField) {
    const sectionKey = validationFieldSectionKey(field);
    let participantIndex: number | undefined;
    if (field.startsWith("participant:")) {
      participantIndex = Number(field.split(":")[1]);
    }
    requestAnimationFrame(() =>
      scrollToSection(createFormScrollRef, sectionKey, participantIndex),
    );
  }

  function clearCreateFieldError(field?: GroupBookingCreateValidationField) {
    if (!field || createFieldError === field) {
      setCreateFieldError(null);
    }
    setCreateReviewError(null);
  }

  function applyGroupPatch(groupId: string, patchFn: (group: GroupBooking) => GroupBooking) {
    const source =
      selectedGroup?.id === groupId ? selectedGroup : groups.find((g) => g.id === groupId);
    if (!source) return null;
    const patched = patchFn({
      ...source,
      participants: (source.participants ?? []).map((p) => ({ ...p })),
    });
    if (selectedGroup?.id === groupId) {
      setSelectedGroup(patched);
    }
    if (groupData?.data) {
      mutateGroupList({
        ...groupData,
        data: groupData.data.map((g) => (g.id === groupId ? patched : g)),
      });
    }
    setExtraGroups((prev) => prev.map((g) => (g.id === groupId ? patched : g)));
    return patched;
  }

  function rollbackGroupPatch() {
    const snap = previousGroupRef.current;
    if (!snap) return;
    applyGroupPatch(snap.id, () => snap);
    previousGroupRef.current = null;
  }

  function addCreateParticipantRow() {
    setCreateParticipants((prev) => [
      ...prev,
      createBlankParticipant(`participant-${Date.now()}-${prev.length}`, createForm.serviceId),
    ]);
  }

  function updateCreateParticipantRow(id: string, patch: Partial<ParticipantFormRow>) {
    setCreateParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeCreateParticipantRow(id: string) {
    setCreateParticipants((prev) =>
      prev.length <= 1
        ? [createBlankParticipant(`participant-${Date.now()}`, createForm.serviceId)]
        : prev.filter((p) => p.id !== id)
    );
    // Clean up search state for this participant
    setParticipantSearchMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (participantSearchTimers.current[id]) {
      clearTimeout(participantSearchTimers.current[id]);
      delete participantSearchTimers.current[id];
    }
  }

  function searchClientsForParticipant(participantId: string, query: string) {
    setParticipantSearchMap((prev) => ({
      ...prev,
      [participantId]: {
        ...(prev[participantId] || { results: [], loading: false }),
        query,
        open: query.trim().length >= 2,
      },
    }));
    if (participantSearchTimers.current[participantId]) {
      clearTimeout(participantSearchTimers.current[participantId]);
    }
    if (query.trim().length < 2) {
      setParticipantSearchMap((prev) => ({
        ...prev,
        [participantId]: { ...prev[participantId], results: [], loading: false, open: false },
      }));
      return;
    }
    setParticipantSearchMap((prev) => ({
      ...prev,
      [participantId]: { ...prev[participantId], loading: true },
    }));
    participantSearchTimers.current[participantId] = setTimeout(async () => {
      try {
        const res = await api.get<any>(
          `/api/provider/clients?search=${encodeURIComponent(query.trim())}&limit=8`
        );
        const rows = (res.data || []).map((c: any) => ({
          id: c.id,
          customer_id: c.customer_id || c.id,
          full_name: c.customer?.full_name || c.full_name || c.name || "",
          email: c.customer?.email || c.email || undefined,
          phone: c.customer?.phone || c.phone || undefined,
        }));
        setParticipantSearchMap((prev) => ({
          ...prev,
          [participantId]: { ...prev[participantId], results: rows, loading: false },
        }));
      } catch {
        setParticipantSearchMap((prev) => ({
          ...prev,
          [participantId]: { ...prev[participantId], results: [], loading: false },
        }));
      }
    }, 300);
  }

  function selectClientForParticipant(
    participantId: string,
    client: { id: string; customer_id: string; full_name: string; email?: string; phone?: string }
  ) {
    updateCreateParticipantRow(participantId, {
      name: client.full_name,
      email: client.email || "",
      phone: client.phone || "",
      customerId: client.customer_id,
    });
    setParticipantSearchMap((prev) => ({
      ...prev,
      [participantId]: { query: "", results: [], loading: false, open: false },
    }));
  }

  async function createParticipantBookingAndLink(args: {
    groupId: string;
    groupRef?: string | null;
    scheduledDate: string;
    scheduledTime: string;
    serviceId: string;
    serviceName?: string;
    addOns?: AddOnRow[];
    packageId?: string | null;
    staffId?: string | null;
    locationId?: string | null;
    locationType: "at_salon" | "at_home";
    address?: {
      address_line1: string;
      address_city?: string;
      address_state?: string;
      address_postal_code?: string;
      address_country?: string;
      address_latitude?: number | null;
      address_longitude?: number | null;
      travel_fee?: number;
    };
    products?: SelectedGroupProduct[];
    durationMinutes: number;
    unitPrice: number;
    participant: {
      name: string;
      phone?: string;
      email?: string;
      notes?: string;
      customerId?: string;
    };
    isPrimary: boolean;
    /**
     * Forwarded to the booking API so it can act on the tender at create time.
     * Only `payment_link` is passed today: cash / card / terminal are settled
     * group-wide after every participant booking exists.
     */
    paymentMethod?: "payment_link";
  }) {
    const scheduledAt = buildZonedIsoForWallClock(
      args.scheduledDate,
      args.scheduledTime.substring(0, 5),
      providerTz
    );
    if (!Number.isFinite(Date.parse(scheduledAt))) {
      return { error: gb("invalidDateTimeBooking") };
    }

    const bookingPayload: Record<string, unknown> = {
      customer_name: args.participant.name.trim(),
      customer_phone: args.participant.phone?.trim() || undefined,
      customer_email: args.participant.email?.trim() || undefined,
      // Link to existing customer record when provider searched for this client
      customer_id: args.participant.customerId || undefined,
      scheduled_at: scheduledAt,
      location_type: args.locationType,
      location_id: args.locationType === "at_salon" ? args.locationId || undefined : undefined,
      ...(args.locationType === "at_home" && args.address
        ? {
            address_line1: args.address.address_line1,
            address_city: args.address.address_city,
            address_state: args.address.address_state,
            address_postal_code: args.address.address_postal_code,
            address_country: args.address.address_country,
            address_latitude: args.address.address_latitude,
            address_longitude: args.address.address_longitude,
            travel_fee: args.address.travel_fee || 0,
          }
        : {}),
      staff_id: args.staffId || undefined,
      team_member_id: args.staffId || undefined,
      service_id: args.serviceId,
      offering_id: args.serviceId,
      // Package is stored on group_bookings; do not re-validate package entitlements on each child booking.
      // Tell the availability engine to ignore the parent group booking so
      // participant bookings at the same time slot are not falsely blocked.
      // allow_override is a safety net in case the exclude param is insufficient
      // (e.g. provider double-booking is intentionally disabled globally).
      group_booking_id: args.groupId,
      exclude_group_booking_id: args.groupId,
      allow_override: true,
      services: [
        {
          service_id: args.serviceId,
          offering_id: args.serviceId,
          serviceId: args.serviceId,
          staff_id: args.staffId || undefined,
          add_on_ids:
            args.addOns && args.addOns.length > 0 ? args.addOns.map((ao) => ao.id) : undefined,
          price: args.unitPrice,
          duration_minutes: args.durationMinutes,
          duration: args.durationMinutes,
          name: args.serviceName || gb("serviceFallback"),
        },
      ],
      products: (args.products ?? []).map((p) => ({
        productId: p.productId,
        productName: p.productName,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        totalPrice: p.unitPrice * p.quantity,
        productVariantId: p.productVariantId || null,
      })),
      subtotal: args.unitPrice,
      total_amount:
        args.unitPrice +
        (args.locationType === "at_home" ? Number(args.address?.travel_fee || 0) : 0) +
        (args.products ?? []).reduce((sum, p) => sum + p.unitPrice * p.quantity, 0),
      booking_source: "provider",
      status: "confirmed",
      ...(args.paymentMethod ? { payment_method: args.paymentMethod } : {}),
      special_requests: args.groupRef
        ? [gb("groupBookingNotes", { ref: args.groupRef }), args.participant.notes?.trim()]
            .filter(Boolean)
            .join("\n")
        : [gb("groupBookingNotes", { ref: args.groupId }), args.participant.notes?.trim()]
            .filter(Boolean)
            .join("\n"),
      send_notification: createSendNotification,
    };

    const bookingRes = await createBooking("/api/provider/bookings", bookingPayload);
    if (bookingRes.error || !bookingRes.data) {
      return { error: bookingRes.error || gb("couldNotCreateParticipantBooking") };
    }
    const createdBookingId = bookingRes.data?.id || bookingRes.data?.data?.id || null;
    if (!createdBookingId) {
      return { error: gb("bookingCreatedWithoutId") };
    }

    const linkRes = await addParticipant(
      `/api/provider/group-bookings/${encodeURIComponent(args.groupId)}/participants`,
      {
        booking_id: createdBookingId,
        participant_name: args.participant.name.trim(),
        participant_email: args.participant.email?.trim() || undefined,
        participant_phone: args.participant.phone?.trim() || undefined,
        service_id: args.serviceId,
        service_name: args.serviceName || undefined,
        price: args.unitPrice,
        duration_minutes: args.durationMinutes,
        addons: (args.addOns ?? []).map((ao) => ({
          id: ao.id,
          name: ao.name,
          price: Number(ao.price ?? 0) || 0,
          duration: Number(ao.duration_minutes ?? 0) || 0,
        })),
        notes: args.participant.notes?.trim() || undefined,
        is_primary_contact: args.isPrimary,
      }
    );
    if (linkRes.error) {
      return { error: linkRes.error };
    }
    return { error: null };
  }

  /**
   * §Provider-audit 2026-04 (packages round 3): attach a package to the
   * create form. Mirrors `GroupBookingDialog.handleAddPackage` on web but
   * is simpler — the mobile create sheet doesn't expose a per-participant
   * picker (participants are added from the detail sheet after creation),
   * so we just adopt the first service item's offering as the group's
   * default service and sum the package's service durations into the
   * group duration. Server-side `group_bookings` stores only `package_id`
   * + `service_id` + `duration_minutes`, which is exactly what we're
   * writing here.
   */
  function applyPackageToCreateForm(pkg: PackageRow | null) {
    if (!pkg) {
      setCreateForm((p) => ({ ...p, packageId: "" }));
      return;
    }
    const serviceItems = (pkg.items ?? []).filter((it) => !!it.offering_id || !!it.offering?.id);
    const firstService = serviceItems[0];
    const firstServiceId = firstService?.offering_id ?? firstService?.offering?.id ?? "";

    // Prefer a service the provider already has in their service list so
    // downstream UI (service chips) can highlight it.
    const matchedService = firstServiceId
      ? services.find((s) => s.id === firstServiceId)
      : undefined;

    // Package duration = sum of service item durations (weighted by qty),
    // falling back to whatever is currently in the form.
    const totalDuration = serviceItems.reduce((acc, it) => {
      const d = Number(it.offering?.duration_minutes ?? 0);
      const q = Number(it.quantity ?? 1);
      return acc + (Number.isFinite(d) && d > 0 ? d * (Number.isFinite(q) && q > 0 ? q : 1) : 0);
    }, 0);

    setCreateForm((p) => {
      const next = { ...p, packageId: pkg.id };
      if (firstServiceId) {
        next.serviceId = firstServiceId;
      }
      if (!p.title.trim()) {
        next.title = pkg.name;
      }
      if (totalDuration > 0) {
        next.duration = String(totalDuration);
      } else if (matchedService?.duration_minutes && matchedService.duration_minutes > 0) {
        next.duration = String(matchedService.duration_minutes);
      }
      return next;
    });
    if (firstServiceId) {
      setCreateParticipants((prev) =>
        prev.map((participant) => ({
          ...participant,
          serviceId: participant.serviceId || firstServiceId,
          addOnIds:
            participant.serviceId && participant.serviceId !== firstServiceId
              ? participant.addOnIds
              : [],
        }))
      );
    }
    Haptics.selectionAsync().catch(() => {});
  }

  // §Group-booking-audit 2026-05: run all client-side validation here so the
  // review sheet only opens when the form is committable. Same checks as
  // handleCreate, just without the actual POST.
  async function handleOpenCreateReview() {
    const fail = (message: string, field: GroupBookingCreateValidationField) => {
      setCreateReviewError(message);
      setCreateFieldError(field);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      requestAnimationFrame(() => scrollToCreateField(field));
    };
    setCreateReviewError(null);
    setCreateFieldError(null);
    const validationErr = validateGroupBookingCreateStepDetailed(buildCreateValidationInput());
    if (validationErr) {
      setCreateReadinessExpanded(true);
      fail(validationErr.message, validationErr.field);
      return;
    }
    setCheckingCreateReview(true);
    try {
      const duration = Number(createForm.duration);
      const createAvailabilityError = await verifyGroupSlotAvailability({
        date: createForm.date,
        time: createForm.time,
        durationMinutes: duration,
        staffId: createForm.staffId,
        locationId:
          createForm.locationType === "at_home"
            ? null
            : createForm.locationId || selectedLocationId || null,
        serviceId: createForm.serviceId,
        locationType: createForm.locationType,
      });
      if (createAvailabilityError) {
        fail(createAvailabilityError, "time");
        return;
      }
      setCreateStep("review");
    } finally {
      setCheckingCreateReview(false);
    }
  }

  async function handleCreate() {
    const validationErr = validateGroupBookingCreateStepDetailed(buildCreateValidationInput());
    if (validationErr) {
      setCreateStep("form");
      setCreateReadinessExpanded(true);
      setCreateReviewError(validationErr.message);
      setCreateFieldError(validationErr.field);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      requestAnimationFrame(() => scrollToCreateField(validationErr.field));
      return;
    }
    const duration = Number(createForm.duration);
    const maxParticipants = Math.max(
      Math.max(1, createParticipants.length),
      Number(createForm.maxParticipants) || 10,
    );
    const createAvailabilityError = await verifyGroupSlotAvailability({
      date: createForm.date,
      time: createForm.time,
      durationMinutes: duration,
      staffId: createForm.staffId,
      locationId:
        createForm.locationType === "at_home"
          ? null
          : createForm.locationId || selectedLocationId || null,
      serviceId: createForm.serviceId,
      locationType: createForm.locationType,
    });
    if (createAvailabilityError) {
      setCreateStep("form");
      setCreateReviewError(createAvailabilityError);
      setCreateFieldError("time");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      requestAnimationFrame(() => scrollToCreateField("time"));
      return;
    }
    const participantsToCreate = createParticipants
      .map((p) => ({
        id: p.id,
        name: p.name.trim(),
        phone: p.phone.trim(),
        email: p.email.trim(),
        serviceId: p.serviceId || createForm.serviceId,
        addOnIds: p.addOnIds,
        notes: p.notes.trim(),
        customerId: p.customerId,
        staffId: p.staffId?.trim() || createForm.staffId || "",
      }))
      .filter((p) => p.name.length > 0 || p.phone.length > 0 || p.email.length > 0);

    // Wrap all network work so progress state is always cleared even if an
    // unexpected error escapes one of the inner branches.
    try {

    const scheduledAt = buildZonedIsoForWallClock(
      createForm.date,
      createForm.time.substring(0, 5),
      providerTz
    );
    if (!Number.isFinite(Date.parse(scheduledAt))) {
      Alert.alert(gb("invalidDateTimeTitle"), gb("invalidDateTimeBody"));
      return;
    }

    const svc = createForm.serviceId
      ? services.find((s) => s.id === createForm.serviceId)
      : undefined;
    const travelFee = Math.max(0, Number(createForm.travelFee || 0) || 0);
    const productsTotal = createProducts.reduce(
      (sum, p) => sum + (Number(p.unitPrice) || 0) * Math.max(1, Number(p.quantity) || 1),
      0
    );
    const participantLines = participantsToCreate.map((p) =>
      getParticipantLine(
        { serviceId: p.serviceId, addOnIds: p.addOnIds },
        createForm.serviceId,
        services
      )
    );
    const participantTotal = participantLines.reduce((sum, line) => sum + line.price, 0);
    const totalDuration = Math.max(
      duration,
      ...participantLines.map((line) => line.durationMinutes)
    );
    const payload: Record<string, unknown> = {
      title: createForm.title.trim() || (svc ? sl(svc) : undefined) || gb("groupSessionFallback"),
      scheduled_at: scheduledAt,
      duration_minutes: totalDuration,
      max_participants: maxParticipants,
      notes: createForm.notes.trim() || undefined,
      location_type: createForm.locationType,
      travel_fee: createForm.locationType === "at_home" ? travelFee : 0,
      total_price:
        participantTotal + productsTotal + (createForm.locationType === "at_home" ? travelFee : 0),
      // §Group-booking-audit 2026-05 (notify primary): tell the API whether
      // to email/push the primary contact (default true from review sheet).
      send_notification: createSendNotification,
      products: createProducts.map((p) => ({
        product_id: p.productId,
        product_name: p.productName,
        product_variant_id: p.productVariantId || null,
        product_variant_name: p.productVariantName,
        quantity: p.quantity,
        unit_price: p.unitPrice,
        total_price: p.unitPrice * p.quantity,
      })),
    };
    if (createForm.serviceId) {
      payload.service_id = createForm.serviceId;
      payload.service_name = svc ? sl(svc) : undefined;
    }
    if (createForm.staffId) payload.staff_id = createForm.staffId;
    if (createForm.locationType === "at_salon" && createForm.locationId)
      payload.location_id = createForm.locationId;
    if (createForm.locationType === "at_home") {
      payload.address_line1 = createForm.addressLine1.trim();
      payload.address_city = createForm.addressCity.trim() || undefined;
      payload.address_state = createForm.addressState.trim() || undefined;
      payload.address_postal_code = createForm.addressPostalCode.trim() || undefined;
      payload.address_country = createForm.addressCountry.trim() || "South Africa";
      payload.address_latitude = createForm.addressLatitude;
      payload.address_longitude = createForm.addressLongitude;
      payload.address_place_name = createForm.addressSearchValue || createForm.addressLine1;
    }
    // §Provider-audit 2026-04 (packages round 3): attach the selected
    // service_package so downstream reporting + discount math apply,
    // matching the web `GroupBookingDialog` submit path.
    if (createForm.packageId) payload.package_id = createForm.packageId;

    const { data: createdGroup, error } = await createGroup(
      "/api/provider/group-bookings",
      payload
    );
    if (error) {
      Alert.alert(gb("errorTitle"), error);
      return;
    }
    const createdGroupId = createdGroup?.id || createdGroup?.data?.id || null;
    if (!createdGroupId) {
      Alert.alert(
        gb("createdGroupTitle"),
        gb("createdGroupNoId")
      );
      setShowCreate(false);
      refresh();
      return;
    }

    const groupRef = createdGroup?.ref_number || createdGroup?.data?.ref_number || null;
    // §Group-booking-audit 2026-05: track whether participant bookings + links
    // all succeeded before we attempt any follow-up actions (mark_paid, open).
    // Without this guard the previous code would catch errors and roll the
    // group back, but a stale createdGroupId could still leak to actions that
    // expected the group to exist.
    let participantsSucceeded = false;
    const participantFailures: { name: string; error: string }[] = [];
    const createdBookings: Awaited<ReturnType<typeof createParticipantBookingAndLink>>[] = [];

    for (let idx = 0; idx < participantsToCreate.length; idx++) {
      const participant = participantsToCreate[idx];
      const line = participantLines[idx];
      setCreateParticipantProgress({
        current: idx + 1,
        total: participantsToCreate.length,
        name: participant.name || gb("participantFallback", { n: idx + 1 }),
      });
      const res = await createParticipantBookingAndLink({
        groupId: createdGroupId,
        groupRef,
        scheduledDate: createForm.date,
        scheduledTime: createForm.time,
        serviceId: line.serviceId,
        serviceName: line.service ? sl(line.service) : undefined,
        addOns: line.addOns,
        packageId: createForm.packageId || null,
        staffId: participant.staffId || createForm.staffId,
        locationId: createForm.locationType === "at_home" ? null : createForm.locationId,
        locationType: createForm.locationType,
        address:
          createForm.locationType === "at_home"
            ? {
                address_line1: createForm.addressLine1.trim(),
                address_city: createForm.addressCity.trim(),
                address_state: createForm.addressState.trim(),
                address_postal_code: createForm.addressPostalCode.trim(),
                address_country: createForm.addressCountry.trim() || "South Africa",
                address_latitude: createForm.addressLatitude,
                address_longitude: createForm.addressLongitude,
                travel_fee: idx === 0 ? travelFee : 0,
              }
            : undefined,
        products: idx === 0 ? createProducts : [],
        durationMinutes: line.durationMinutes,
        unitPrice: line.price,
        participant: { ...participant, customerId: participant.customerId },
        isPrimary: idx === 0,
        paymentMethod: createPaymentMethod === "payment_link" ? "payment_link" : undefined,
      });
      if (res.error) {
        participantFailures.push({
          name: participant.name,
          error: res.error,
        });
      } else {
        createdBookings.push(res);
      }
    }

    if (createdBookings.length === 0) {
      setCreateStep("form");
      setCreateReviewError(null);
      const { error: deleteErr } = await cancelGroup(
        `/api/provider/group-bookings/${encodeURIComponent(createdGroupId)}`,
      );
      const failSummary = participantFailures.map((f) => `${f.name}: ${f.error}`).join("\n");
      if (deleteErr) {
        Alert.alert(
          gb("groupCreationFailed"),
          gb("groupCreationFailedRollback", {
            summary: failSummary || gb("couldNotAddParticipants"),
            error: deleteErr,
          }),
        );
      } else {
        Alert.alert(gb("groupCreationFailed"), failSummary || gb("couldNotAddParticipantsToGroup"));
      }
      setCreateParticipantProgress(null);
      refresh();
      return;
    }

    if (participantFailures.length > 0) {
      participantsSucceeded = true;
      setCreateParticipantProgress(null);
      setCreateStep("form");
      setCreateReviewError(null);
      setShowCreate(false);
      const failSummary = participantFailures.map((f) => `${f.name}: ${f.error}`).join("\n");
      Alert.alert(
        gb("groupPartiallyCreated"),
        gb("groupPartiallyCreatedBody", {
          created: createdBookings.length,
          total: participantsToCreate.length,
          summary: failSummary,
        }),
        [
          {
            text: gb("openGroup"),
            onPress: () => {
              router.setParams({ open_group_id: createdGroupId } as never);
            },
          },
          { text: gb("ok") },
        ],
      );
      InteractionManager.runAfterInteractions(() => {
        void refresh();
      });
      return;
    }

    participantsSucceeded = true;
    setCreateParticipantProgress(null);

    // §Group-booking-audit 2026-05 (auto mark_paid): only attempt to mark
    // paid AFTER every participant booking + link succeeded. If we hit this
    // branch but the user chose pay-later or paystack_terminal, we skip/handle separately.
    const methodToMark =
      participantsSucceeded && createPaymentMethod === "cash"
        ? "cash"
        : participantsSucceeded && createPaymentMethod === "card"
          ? "card"
          : participantsSucceeded && createPaymentMethod === "yoco_pos"
            ? "yoco"
            : null;

    if (createPaymentMethod === "paystack_terminal" && participantsSucceeded) {
      // Close create sheets first, then trigger terminal prepare-collection.
      setCreateStep("form");
      setCreateReviewError(null);
      setShowCreate(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      InteractionManager.runAfterInteractions(() => {
        void refresh();
        // Determine total price from form state (mirroring the total_price in the payload above)
        const totalAmt = participantTotal + productsTotal + (createForm.locationType === "at_home" ? travelFee : 0);
        setIsPreparingTerminal(true);
        // api.post<T>: T is the inner data object returned by successResponse
        api.post<{
          terminal?: { qr_url?: string | null; payment_link?: string | null; terminal_url?: string | null; name?: string | null };
          metadata?: unknown;
          instructions?: string;
        }>(
          PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
          paystackTerminalCollectionIntentPayload({
            entity_type: "group_booking",
            entity_id: createdGroupId,
            expected_amount: totalAmt,
          }),
          { timeout: 120_000 },
        ).then((res) => {
          const terminal = res.data?.terminal;
          if (terminal) {
            setPaystackTerminalSheet({ expectedAmount: totalAmt, terminal });
          } else {
            Alert.alert(gb("groupCreated"), gb("usePaymentInbox"));
          }
        }).catch(() => {
          Alert.alert(gb("groupCreated"), gb("usePaymentInbox"));
        }).finally(() => setIsPreparingTerminal(false));
      });
      return;
    }

    if (createPaymentMethod === "paycloud_terminal" && participantsSucceeded) {
      setCreateStep("form");
      setCreateReviewError(null);
      setShowCreate(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const totalAmt = participantTotal + productsTotal + (createForm.locationType === "at_home" ? travelFee : 0);
      InteractionManager.runAfterInteractions(() => {
        void refresh();
        openPaycloudCollect({
          entityType: "group_booking",
          entityId: createdGroupId,
          amount: totalAmt,
          groupBookingId: createdGroupId,
          locationId: createForm.locationType === "at_home" ? null : createForm.locationId,
        });
        router.setParams({ open_group_id: createdGroupId } as never);
      });
      return;
    }

    if (methodToMark) {
      const paymentResult = await postGroupAction(
        `/api/provider/group-bookings/${encodeURIComponent(createdGroupId)}?action=mark_paid`,
        { payment_method: methodToMark }
      );
      if (paymentResult.error) {
        // Group is created and visible; surface the payment problem so the
        // provider can mark-paid manually from the detail sheet.
        Alert.alert(
          gb("groupCreatedPaymentFailed"),
          gb("paymentRecordFailedBody", { method: methodToMark, error: paymentResult.error })
        );
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Close the review sheet first so the create sheet's onClose can fire
    // cleanly when we close it below.
    setCreateStep("form");
    setCreateReviewError(null);
    setShowCreate(false);
    // Show the success alert right after animations settle — do NOT await
    // refresh() before showing it; that delays feedback by up to a second.
    InteractionManager.runAfterInteractions(() => {
      const paymentNote =
        createPaymentMethod === "pay_later"
          ? gb("paymentDueFromParticipants")
          : createPaymentMethod === "payment_link"
            ? createSendNotification
              ? gb("paymentLinkSent")
              : gb("paymentLinkNotSent")
            : gb("sessionMarkedPaid");
      Alert.alert(
        gb("groupSessionCreated"),
        `${groupRef ? gb("createdRefLine", { ref: groupRef }) : ""}${gb("participantsAdded", { count: createParticipants.length })}\n\n${paymentNote}`,
        [
          {
            text: gb("viewSession"),
            onPress: () => {
              if (createdGroupId) router.setParams({ open_group_id: createdGroupId } as never);
            },
          },
          { text: gb("done") },
        ],
      );
      void refresh();
    });
    } catch (createErr) {
      console.error("[handleCreate] unexpected error:", createErr);
      Alert.alert(gb("errorTitle"), gb("createFailedUnexpected"));
    } finally {
      // Always clear progress so the confirm button never stays permanently disabled.
      setCreateParticipantProgress(null);
    }
  }

  function applyCreateAddress(parsed: {
    full_address: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    latitude: number;
    longitude: number;
  }) {
    pendingCreateAddressAlertRef.current = true;
    setCreateForm((p) => ({
      ...p,
      addressSearchValue: parsed.full_address,
      addressLine1: parsed.address_line1,
      addressCity: parsed.city,
      addressState: parsed.state,
      addressPostalCode: parsed.postal_code,
      addressCountry: parsed.country,
      addressLatitude: parsed.latitude,
      addressLongitude: parsed.longitude,
    }));
    clearCreateFieldError("address");
  }

  // Debounced travel-fee validation — avoids hammering /api/location/validate while
  // the user searches, drags the map pin, or edits address fields.
  useEffect(() => {
    if (createForm.locationType !== "at_home") {
      setCreateMapPreviewCoords(null);
      return;
    }
    if (!provider?.id) return;
    if (createForm.addressLatitude == null || createForm.addressLongitude == null) return;

    const validateGen = ++createAddressValidateGenRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        const addressString = [
          createForm.addressLine1,
          createForm.addressCity,
          createForm.addressState,
          createForm.addressPostalCode,
          createForm.addressCountry.trim() || "South Africa",
        ]
          .filter(Boolean)
          .join(", ");
        const fallbackAddress =
          createForm.addressSearchValue.trim() ||
          gb("pinnedLocationWithCountry", {
            country: createForm.addressCountry.trim() || "South Africa",
          });
        const validateAddress = addressString.trim() || fallbackAddress;
        if (!validateAddress.trim()) return;

        setValidatingCreateAddress(true);
        try {
          const res = await api.post<{
            valid?: boolean;
            travelFee?: number;
            distanceKm?: number;
            coordinates?: { latitude: number; longitude: number };
            address?: {
              line1?: string;
              city?: string;
              state?: string;
              country?: string;
              postalCode?: string;
              fullAddress?: string;
            };
            reason?: string;
            errorCode?: string;
            settingsRoute?: string;
          }>("/api/location/validate", {
            address: validateAddress,
            provider_id: provider.id,
            latitude: createForm.addressLatitude,
            longitude: createForm.addressLongitude,
          });
          if (validateGen !== createAddressValidateGenRef.current) return;
          const data = res.data ?? {};
          if (!data.valid) {
            if (pendingCreateAddressAlertRef.current) {
              pendingCreateAddressAlertRef.current = false;
              const settingsRoute = data.settingsRoute;
              const buttons = settingsRoute
                ? [
                    { text: gb("openSettings"), onPress: () => router.push(settingsRoute as never) },
                    { text: gb("cancel"), style: "cancel" as const },
                  ]
                : [{ text: gb("ok") }];
              Alert.alert(
                data.errorCode === "DISTANCE_LIMIT" ? gb("outsideServiceRadius") : gb("outsideServiceArea"),
                data.reason || gb("outsideServiceZones"),
                buttons,
              );
            }
            setCreateForm((p) => ({
              ...p,
              travelFee: "",
              travelPreviewDistanceKm:
                typeof data.distanceKm === "number" && Number.isFinite(data.distanceKm)
                  ? data.distanceKm
                  : null,
            }));
            return;
          }
          pendingCreateAddressAlertRef.current = false;
          setCreateForm((p) => ({
            ...p,
            addressSearchValue: data.address?.fullAddress || p.addressSearchValue,
            addressLine1: data.address?.line1 || p.addressLine1,
            addressCity: data.address?.city || p.addressCity,
            addressState: data.address?.state || p.addressState,
            addressPostalCode: data.address?.postalCode || p.addressPostalCode,
            addressCountry: data.address?.country || p.addressCountry || "South Africa",
            addressLatitude: data.coordinates?.latitude ?? p.addressLatitude,
            addressLongitude: data.coordinates?.longitude ?? p.addressLongitude,
            travelFee: String(Math.max(0, Number(data.travelFee || 0))),
            travelPreviewDistanceKm:
              typeof data.distanceKm === "number" && Number.isFinite(data.distanceKm)
                ? data.distanceKm
                : null,
          }));
        } catch (e) {
          if (validateGen !== createAddressValidateGenRef.current) return;
          if (pendingCreateAddressAlertRef.current) {
            pendingCreateAddressAlertRef.current = false;
            Alert.alert(
              gb("travelFeeUnavailable"),
              e instanceof Error ? e.message : gb("couldNotCalculateTravelFee"),
            );
          }
        } finally {
          if (validateGen === createAddressValidateGenRef.current) {
            setValidatingCreateAddress(false);
          }
        }
      })();
    }, 600);

    return () => {
      clearTimeout(timer);
      createAddressValidateGenRef.current += 1;
      setValidatingCreateAddress(false);
    };
  }, [
    createForm.locationType,
    provider?.id,
    createForm.addressLine1,
    createForm.addressSearchValue,
    createForm.addressCity,
    createForm.addressState,
    createForm.addressPostalCode,
    createForm.addressCountry,
    createForm.addressLatitude,
    createForm.addressLongitude,
    router,
  ]);

  useEffect(() => {
    if (createForm.addressLatitude == null || createForm.addressLongitude == null) {
      setCreateMapPreviewCoords(null);
      return;
    }
    const lat = createForm.addressLatitude;
    const lng = createForm.addressLongitude;
    const timer = setTimeout(() => {
      setCreateMapPreviewCoords({ latitude: lat, longitude: lng });
    }, 450);
    return () => clearTimeout(timer);
  }, [createForm.addressLatitude, createForm.addressLongitude]);

  function applyMapPinToCreateForm(
    lat: number,
    lng: number,
    countryFallback: string,
    resolved?: ResolvedPinAddress,
  ) {
    const fb = countryFallback.trim() || "South Africa";
    const line1 = resolved?.address_line1?.trim() || resolved?.place_name?.trim();
    if (line1) {
      const city = resolved?.city?.trim() || "";
      const placeName = resolved?.place_name?.trim();
      applyCreateAddress({
        full_address: placeName || (city ? `${line1}, ${city}` : line1),
        address_line1: line1,
        city,
        state: resolved?.state?.trim() || "",
        postal_code: resolved?.postal_code?.trim() || "",
        country: resolved?.country?.trim() || fb,
        latitude: lat,
        longitude: lng,
      });
      return;
    }
    pendingCreateAddressAlertRef.current = true;
    setCreateForm((p) => ({
      ...p,
      addressSearchValue: gb("pinnedLocation"),
      addressLine1: gb("pinnedLocation"),
      addressLatitude: lat,
      addressLongitude: lng,
    }));
    clearCreateFieldError("address");
  }

  function handleCreateDropPin(lat: number, lng: number, resolved?: ResolvedPinAddress) {
    setCreateMapPinOpen(false);
    const countryFallback = createForm.addressCountry.trim() || "South Africa";
    InteractionManager.runAfterInteractions(() => {
      applyMapPinToCreateForm(lat, lng, countryFallback, resolved);
      if (resolved?.address_line1?.trim() || resolved?.place_name?.trim()) return;
      void reverseGeocodeCoordinates(lat, lng, countryFallback).then((mapped) => {
        if (mapped) {
          applyCreateAddress({
            full_address: `${mapped.address_line1}, ${mapped.city}`,
            address_line1: mapped.address_line1,
            city: mapped.city,
            state: mapped.state,
            postal_code: mapped.postal_code,
            country: mapped.country,
            latitude: mapped.latitude,
            longitude: mapped.longitude,
          });
        }
      });
    });
  }

  async function handleCreateUseCurrentLocation() {
    if (createLocatingHome) return;
    setCreateLocatingHome(true);
    try {
      const allowed = await ensureForegroundLocationPermission(PERMISSION_COPY.locationAddressFromCurrent);
      if (!allowed) {
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const fb = createForm.addressCountry.trim() || "South Africa";
      const mapped = await reverseGeocodeCoordinates(loc.coords.latitude, loc.coords.longitude, fb);
      if (mapped) {
        applyCreateAddress({
          full_address: `${mapped.address_line1}, ${mapped.city}`,
          address_line1: mapped.address_line1,
          city: mapped.city,
          state: mapped.state,
          postal_code: mapped.postal_code,
          country: mapped.country,
          latitude: mapped.latitude,
          longitude: mapped.longitude,
        });
      } else {
        pendingCreateAddressAlertRef.current = true;
        setCreateForm((p) => ({
          ...p,
          addressSearchValue: gb("pinnedLocation"),
          addressLine1: gb("pinnedLocation"),
          addressLatitude: loc.coords.latitude,
          addressLongitude: loc.coords.longitude,
        }));
        clearCreateFieldError("address");
      }
    } catch (e) {
      Alert.alert(gb("locationError"), e instanceof Error ? e.message : gb("couldNotReadLocation"));
    } finally {
      setCreateLocatingHome(false);
    }
  }

  function openAddParticipant() {
    setParticipantForm(createBlankParticipant("participant-form", selectedGroup?.service_id ?? ""));
    setShowAddParticipant(true);
  }

  async function handleAddParticipant() {
    if (!selectedGroup || !participantForm.name.trim()) {
      Alert.alert(gb("requiredTitle"), gb("participantNameRequired"));
      return;
    }
    if (
      selectedGroup.max_participants != null &&
      resolveGroupParticipantCount(selectedGroup) >= selectedGroup.max_participants
    ) {
      Alert.alert(
        gb("sessionFullTitle"),
        gb("sessionFullAddBody", { max: selectedGroup.max_participants })
      );
      return;
    }
    const phoneErr = validateE164Phone(participantForm.phone);
    if (phoneErr) {
      Alert.alert(gb("invalidPhone"), phoneErr);
      return;
    }
    const serviceId = participantForm.serviceId || selectedGroup.service_id || "";
    if (!serviceId) {
      Alert.alert(gb("serviceMissing"), gb("selectParticipantService"));
      return;
    }

    const matchedService = services.find((s) => s.id === serviceId);
    const line = getParticipantLine(participantForm, selectedGroup.service_id ?? "", services);

    const res = await createParticipantBookingAndLink({
      groupId: selectedGroup.id,
      groupRef: selectedGroup.ref_number,
      scheduledDate: selectedGroup.scheduled_date,
      scheduledTime: selectedGroup.scheduled_time || "",
      serviceId,
      staffId: selectedGroup.team_member_id,
      locationId: selectedGroup.location_type === "at_home" ? null : selectedGroup.location_id,
      locationType: selectedGroup.location_type === "at_home" ? "at_home" : "at_salon",
      address:
        selectedGroup.location_type === "at_home"
          ? {
              address_line1: selectedGroup.address_line1 || "",
              address_city: selectedGroup.address_city || "",
              address_state: selectedGroup.address_state || "",
              address_postal_code: selectedGroup.address_postal_code || "",
              address_country: selectedGroup.address_country || "South Africa",
              address_latitude: selectedGroup.address_latitude ?? null,
              address_longitude: selectedGroup.address_longitude ?? null,
              travel_fee: 0,
            }
          : undefined,
      products: [],
      durationMinutes:
        line.durationMinutes ||
        Number(selectedGroup.duration_minutes || matchedService?.duration_minutes || 60),
      unitPrice: line.price,
      serviceName: matchedService ? sl(matchedService) : undefined,
      addOns: line.addOns,
      packageId: selectedGroup.package_id ?? null,
      participant: participantForm,
      isPrimary: resolveGroupParticipantCount(selectedGroup) === 0,
    });
    if (res.error) {
      Alert.alert(gb("participantCreationFailed"), res.error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAddParticipant(false);
    refresh();
  }

  async function handleCheckIn(participant: Participant) {
    if (!canEditGroups) {
      Alert.alert(gb("permissionRequired"), gb("noPermissionCheckIn"));
      return;
    }
    if (!selectedGroup?.id || !participant?.id) return;
    if (pendingParticipantId === participant.id) return;
    previousGroupRef.current = selectedGroup;
    const now = new Date().toISOString();
    applyGroupPatch(
      selectedGroup.id,
      (current) => patchParticipantCheckIn(current, participant.id, now) as GroupBooking
    );
    setPendingParticipantId(participant.id);

    const { error } = await checkInParticipant(
      `/api/provider/group-bookings/${encodeURIComponent(selectedGroup.id)}/participants/${encodeURIComponent(participant.id)}/check-in`,
      {}
    );
    setPendingParticipantId(null);
    if (error) {
      rollbackGroupPatch();
      Alert.alert(gb("checkInFailed"), error);
      return;
    }
    previousGroupRef.current = null;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await refresh();
  }

  async function handleCheckOut(participant: Participant) {
    if (!canEditGroups) {
      Alert.alert(gb("permissionRequired"), gb("noPermissionCheckOut"));
      return;
    }
    if (!selectedGroup?.id || !participant?.id) return;
    if (pendingParticipantId === participant.id) return;
    previousGroupRef.current = selectedGroup;
    const now = new Date().toISOString();
    applyGroupPatch(
      selectedGroup.id,
      (current) => patchParticipantCheckOut(current, participant.id, now) as GroupBooking
    );
    setPendingParticipantId(participant.id);

    const { error } = await checkOutParticipant(
      `/api/provider/group-bookings/${encodeURIComponent(selectedGroup.id)}/participants/${encodeURIComponent(participant.id)}/check-out`,
      {}
    );
    setPendingParticipantId(null);
    if (error) {
      rollbackGroupPatch();
      Alert.alert(gb("checkOutFailed"), error);
      return;
    }
    previousGroupRef.current = null;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await refresh();
  }

  async function openGroupReceipt(group: GroupBooking) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await downloadPdf({
        router,
        pdfPath: `/api/provider/group-bookings/${encodeURIComponent(group.id)}/receipt/pdf`,
        signedUrlPath: `/api/provider/group-bookings/${encodeURIComponent(group.id)}/receipt/signed-url`,
        filename: `group_booking_${group.id}.pdf`,
        title: gb("groupReceipt"),
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : gb("receiptOpenFailed");
      Alert.alert(gb("groupReceipt"), msg);
    }
  }

  function openParticipantRefund(participant: Participant) {
    const bookingId = participant.booking_id?.trim();
    if (!bookingId) {
      Alert.alert(
        gb("refundParticipantTitle"),
        gb("refundNoLinkedBooking")
      );
      return;
    }
    const displayName =
      participant.customer_name ||
      participant.client_name ||
      participant.participant_name ||
      gb("guest");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefundParticipant({
      id: participant.id,
      booking_id: bookingId,
      displayName,
      total_paid: participant.total_paid,
      total_refunded: participant.total_refunded,
      wallet_gift_coverage: participant.wallet_gift_coverage,
      price: participant.price,
      isGroupPaymentRefund: selectedGroup
        ? isSingleChargeOnlineGroup(selectedGroup.participants, participant.id)
        : false,
    });
  }

  function handleParticipantRefundSuccess(participantId: string, refundAmount: number) {
    if (!selectedGroup?.id) return;
    const now = new Date().toISOString();
    applyGroupPatch(
      selectedGroup.id,
      (current) => patchParticipantRefund(current, participantId, refundAmount, now) as GroupBooking
    );
    void refresh();
  }

  async function handleRemoveParticipant(participant: Participant) {
    if (!selectedGroup) return;
    const displayName =
      participant.customer_name ||
      participant.client_name ||
      participant.participant_name ||
      gb("thisParticipant");
    Alert.alert(gb("removeParticipantTitle"), gb("removeParticipantBody", { name: displayName }), [
      { text: gb("cancel"), style: "cancel" },
      {
        text: gb("remove"),
        style: "destructive",
        onPress: async () => {
          if (!selectedGroup?.id || !participant?.id) return;
          const { error } = await removeParticipant(
            `/api/provider/group-bookings/${encodeURIComponent(selectedGroup.id)}/participants/${encodeURIComponent(participant.id)}`
          );
          if (error) Alert.alert(gb("errorTitle"), error);
          else refresh();
        },
      },
    ]);
  }

  const insets = useSafeAreaInsets();
  const listBottomPadding = tabScreenScrollBottomPadding(insets.bottom, 16);

  // Stable wrapper around `openCreate` (a plain function recreated each render)
  // so the memoized list header / empty state aren't invalidated every render.
  const statusFilterOptions = useMemo(
    () => STATUS_FILTER_VALUES.map((value) => ({ label: gb(STATUS_FILTER_KEYS[value]), value })),
    [gb]
  );

  const handleOpenCreate = useCallback(() => openCreateRef.current(), []);

  const groupListHeader = useMemo(
    () => (
      <GroupBookingsScrollHeader
        stats={stats}
        onCreate={handleOpenCreate}
        canCreate={canCreateGroups}
      />
    ),
    [stats, handleOpenCreate, canCreateGroups]
  );

  const groupListEmpty = useMemo(
    () => (
      <EmptyState
        icon="people-outline"
        title={search.trim() ? gb("emptySearchTitle") : gb("emptyTitle")}
        description={
          search.trim()
            ? gb("emptySearchBody")
            : gb("emptyBody")
        }
        actionLabel={search.trim() || !canCreateGroups ? undefined : gb("emptyAction")}
        actionAccessibilityLabel={gb("emptyActionA11y")}
        onAction={search.trim() || !canCreateGroups ? undefined : handleOpenCreate}
      />
    ),
    [search, handleOpenCreate, canCreateGroups, gb]
  );

  const handleOpenGroup = useCallback((group: GroupBooking) => {
    void openGroupDetailRef.current(group);
  }, []);

  const renderGroupBooking = useCallback(
    ({ item }: { item: GroupBooking }) => (
      <GroupBookingCard group={item} onPress={handleOpenGroup} />
    ),
    [handleOpenGroup]
  );

  const renderGroupBookingSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={gb("title")}
        showBack
        onBack={handleBack}
        subtitle={gb("subtitle", { total: stats.total, upcoming: stats.upcoming })}
        rightAction={
          canCreateGroups ? (
            <TouchableOpacity
              onPress={openCreate}
              style={twStyle("flex-row items-center rounded-full bg-indigo-600 px-3 py-1.5")}
              hitSlop={8}
              accessibilityLabel={gb("createA11y")}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={16} color="#ffffff" style={{ marginEnd: 4 }} />
              <Text style={twStyle("text-xs font-semibold text-white")}>{gb("newBadge")}</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ marginBottom: 8 }}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={gb("searchPlaceholder")}
          />
        </View>

        <View style={{ marginBottom: 8 }}>
          <FilterChipGroup options={statusFilterOptions} selected={filter} onSelect={setFilter} />
        </View>

        {loading && !groups.length ? (
          <SkeletonList rows={4} />
        ) : groupError && !groups.length ? (
          <ErrorState message={groupError} onRetry={refresh} />
        ) : (
          <FlashList
            data={filtered}
            keyExtractor={(g: GroupBooking) => g.id}
            renderItem={renderGroupBooking}
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ paddingBottom: listBottomPadding }}
            showsVerticalScrollIndicator
            overScrollMode="always"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#7C3AED"
                colors={["#7C3AED"]}
              />
            }
            onEndReached={search.trim() ? undefined : loadMoreGroups}
            onEndReachedThreshold={0.35}
            ListHeaderComponent={groupListHeader}
            ListEmptyComponent={groupListEmpty}
            ItemSeparatorComponent={renderGroupBookingSeparator}
            ListFooterComponent={
              loadingMoreGroups ? (
                <View style={twStyle("py-4")}>
                  <ActivityIndicator color="#7C3AED" />
                </View>
              ) : null
            }
          />
        )}
      </View>

      {/* Group detail sheet */}
      <BottomSheet
        visible={!!selectedGroup && !showEdit && !showAddParticipant}
        onClose={() => {
          setSelectedGroup(null);
          router.setParams({ open_group_id: "" });
        }}
        title={
          selectedGroup?.title?.trim() ||
          selectedGroup?.service_name ||
          selectedGroup?.ref_number ||
          gb("groupSessionFallback")
        }
      >
        {selectedGroup && (
          <View>
            {groupDetailLoading ? (
              <View style={twStyle("mb-3 items-center py-4")}>
                <ActivityIndicator color="#7C3AED" />
                <Text style={twStyle("mt-2 text-xs text-gray-500")}>{gb("refreshingDetails")}</Text>
              </View>
            ) : null}
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm text-gray-500")}>
                {gb("scheduledDateTime", {
                  date: formatDate(selectedGroup.scheduled_date),
                  time: selectedGroup.scheduled_time?.substring(0, 5),
                })}
              </Text>
              <View
                style={twStyle(`rounded-full px-3 py-1 ${statusStyle(selectedGroup.status).bg}`)}
              >
                <Text
                  style={twStyle(
                    `text-xs font-medium ${statusStyle(selectedGroup.status).text}`
                  )}
                >
                  {groupStatusLabel(selectedGroup.status, gb)}
                </Text>
              </View>
            </View>

            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
              <View style={twStyle("flex-row justify-between mb-1")}>
                <Text style={twStyle("text-sm text-gray-500")}>{gb("duration")}</Text>
                <Text style={twStyle("text-sm text-gray-700")}>
                  {gb("durationMinutes", { minutes: selectedGroup.duration_minutes })}
                </Text>
              </View>
              {selectedGroup.team_member_name && (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>{gb("staff")}</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>
                    {selectedGroup.team_member_name}
                  </Text>
                </View>
              )}
              {/* §Provider-audit 2026-04 (packages round 3): show the
                  attached service package name when the row has one, so
                  providers can visually confirm the package link exists.
                  Falls back to a neutral label if the package list hasn't
                  loaded yet or was since deleted from the catalog. */}
              {selectedGroup.package_id ? (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>{gb("packageLabel")}</Text>
                  <Text style={twStyle("text-sm text-gray-700")} numberOfLines={1}>
                    {packagesList.find((p) => p.id === selectedGroup.package_id)?.name ??
                      gb("attached")}
                  </Text>
                </View>
              ) : null}
              {selectedGroup.price_per_person && (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>{gb("perPerson")}</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>
                    {formatCurrency(selectedGroup.price_per_person)}
                  </Text>
                </View>
              )}
              <View style={twStyle("flex-row justify-between mb-1")}>
                <Text style={twStyle("text-sm text-gray-500")}>{gb("participantsLabel")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={twStyle("text-sm text-gray-700")}>
                    {resolveGroupParticipantCount(selectedGroup)}
                    {selectedGroup.max_participants ? ` / ${selectedGroup.max_participants}` : ""}
                  </Text>
                  {selectedGroup.max_participants != null && resolveGroupParticipantCount(selectedGroup) >= selectedGroup.max_participants && (
                    <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, color: "#dc2626", fontWeight: "600" }}>{gb("full")}</Text>
                    </View>
                  )}
                  {selectedGroup.max_participants != null &&
                    resolveGroupParticipantCount(selectedGroup) < selectedGroup.max_participants &&
                    selectedGroup.max_participants - resolveGroupParticipantCount(selectedGroup) <= 2 && (
                    <View style={{ backgroundColor: "#fffbeb", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, color: "#d97706", fontWeight: "600" }}>
                        {gb("spotsLeft", {
                          count: selectedGroup.max_participants - resolveGroupParticipantCount(selectedGroup),
                        })}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              {resolveGroupParticipantCount(selectedGroup) > 0 ? (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>{gb("checkedIn")}</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>
                    {countGroupParticipantsCheckedIn(selectedGroup.participants)} /{" "}
                    {resolveGroupParticipantCount(selectedGroup)}
                  </Text>
                </View>
              ) : null}
            </View>

            {(() => {
              const financials = computeGroupFinancialBreakdown(selectedGroup);
              const hasParticipantBookings = (selectedGroup.participants ?? []).some((p) => p.booking_id);
              const totalLabel = hasParticipantBookings ? gb("statTotal") : gb("sessionEstimate");
              return (
                <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
                  <Text style={twStyle("mb-2 text-xs font-semibold uppercase text-gray-400")}>
                    {gb("financials")}
                  </Text>
                  {financials.participantServicesTotal > 0 ? (
                    <View style={twStyle("flex-row justify-between mb-1")}>
                      <Text style={twStyle("text-sm text-gray-600")}>{gb("participantServices")}</Text>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>
                        {formatCurrency(financials.participantServicesTotal)}
                      </Text>
                    </View>
                  ) : null}
                  {financials.productsTotal > 0 ? (
                    <View style={twStyle("flex-row justify-between mb-1")}>
                      <Text style={twStyle("text-sm text-gray-600")}>{gb("products")}</Text>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>
                        {formatCurrency(financials.productsTotal)}
                      </Text>
                    </View>
                  ) : null}
                  {financials.travelFee > 0 ? (
                    <View style={twStyle("flex-row justify-between mb-1")}>
                      <Text style={twStyle("text-sm text-gray-600")}>{gb("travelFee")}</Text>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>
                        {formatCurrency(financials.travelFee)}
                      </Text>
                    </View>
                  ) : null}
                  {financials.tipsTotal > 0 ? (
                    <View style={twStyle("flex-row justify-between mb-1")}>
                      <Text style={twStyle("text-sm text-gray-600")}>{gb("tips")}</Text>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>
                        {formatCurrency(financials.tipsTotal)}
                      </Text>
                    </View>
                  ) : null}
                  {financials.packageDiscount > 0 ? (
                    <View style={twStyle("flex-row justify-between mb-1")}>
                      <Text style={twStyle("text-sm text-gray-600")}>{gb("packageDiscount")}</Text>
                      <Text style={twStyle("text-sm font-medium text-emerald-700")}>
                        -{formatCurrency(financials.packageDiscount)}
                      </Text>
                    </View>
                  ) : null}
                  {financials.additionalChargesTotal > 0 ? (
                    <View style={twStyle("flex-row justify-between mb-1")}>
                      <Text style={twStyle("text-sm text-gray-600")}>{gb("additionalCharges")}</Text>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>
                        {formatCurrency(financials.additionalChargesTotal)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={twStyle("mt-2 border-t border-gray-200 pt-2 flex-row justify-between")}>
                    <Text style={twStyle("text-base font-bold text-gray-900")}>{totalLabel}</Text>
                    <Text style={twStyle("text-base font-bold text-gray-900")}>
                      {formatCurrency(financials.total)}
                    </Text>
                  </View>
                  {!hasParticipantBookings ? (
                    <Text style={twStyle("mt-2 text-[11px] leading-4 text-gray-500")}>
                      {gb("noLinkedBookingsHint")}
                    </Text>
                  ) : null}
                  {selectedGroup.location_type === "at_home" && financials.travelFee > 0 ? (
                    <Text style={twStyle("mt-1 text-[11px] text-gray-500")}>
                      {gb("includesTravel")}
                    </Text>
                  ) : null}
                </View>
              );
            })()}

            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white p-3")}>
              <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>{gb("payment")}</Text>
                <View
                  style={twStyle(
                    `rounded-full px-2 py-0.5 ${
                      groupIsFullyPaid(selectedGroup)
                        ? "bg-emerald-50"
                        : selectedGroup.payment_status === "partially_paid" ||
                            selectedGroup.payment_status === "partially_refunded"
                          ? "bg-amber-50"
                          : selectedGroup.is_invoiced === false ||
                              selectedGroup.payment_status === "not_invoiced"
                            ? "bg-gray-100"
                            : "bg-amber-50"
                    }`
                  )}
                >
                  <Text
                    style={twStyle(
                      `text-[10px] font-medium ${
                        groupIsFullyPaid(selectedGroup)
                          ? "text-emerald-700"
                          : selectedGroup.payment_status === "partially_paid" ||
                              selectedGroup.payment_status === "partially_refunded"
                            ? "text-amber-700"
                            : selectedGroup.is_invoiced === false ||
                                selectedGroup.payment_status === "not_invoiced"
                              ? "text-gray-600"
                              : "text-amber-700"
                      }`
                    )}
                  >
                    {formatGroupPaymentStatusLabel(selectedGroup.payment_status)}
                  </Text>
                </View>
              </View>
              <View style={twStyle("flex-row justify-between mb-1")}>
                <Text style={twStyle("text-sm text-gray-500")}>{gb("sessionTotal")}</Text>
                <Text style={twStyle("text-sm text-gray-700")}>
                  {formatCurrency(Number(selectedGroup.total_price) || 0)}
                </Text>
              </View>
              {Number(selectedGroup.amount_paid ?? 0) > 0 ? (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>{gb("amountPaid")}</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>
                    {formatCurrency(Number(selectedGroup.amount_paid ?? 0))}
                  </Text>
                </View>
              ) : null}
              {Number(selectedGroup.balance_due ?? 0) > 0 ? (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>{gb("balanceDue")}</Text>
                  <Text style={twStyle("text-sm font-medium text-amber-700")}>
                    {formatCurrency(Number(selectedGroup.balance_due ?? 0))}
                  </Text>
                </View>
              ) : null}
              {Number(selectedGroup.total_refunded ?? 0) > 0 ? (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>{gb("refunded")}</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>
                    {formatCurrency(Number(selectedGroup.total_refunded ?? 0))}
                  </Text>
                </View>
              ) : null}
              {Number(selectedGroup.tip_amount ?? 0) > 0 ? (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>{gb("tips")}</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>
                    {formatCurrency(Number(selectedGroup.tip_amount ?? 0))}
                  </Text>
                </View>
              ) : null}
            </View>

            {selectedGroup.notes && (
              <View style={twStyle("mb-3 rounded-lg bg-gray-50 p-3")}>
                <Text style={twStyle("text-xs text-gray-600")}>{selectedGroup.notes}</Text>
              </View>
            )}

            {Array.isArray(selectedGroup.products) && selectedGroup.products.length > 0 ? (
              <View style={twStyle("mb-3")}>
                <Text style={twStyle("mb-2 text-xs font-semibold uppercase text-gray-400")}>
                  {gb("products")}
                </Text>
                {selectedGroup.products.map((product, index) => {
                  const baseLabel =
                    product.name?.trim() ||
                    product.product_name?.trim() ||
                    gb("productFallback", { n: index + 1 });
                  const variant = product.product_variant_name?.trim();
                  const label = variant ? gb("productWithVariant", { label: baseLabel, variant }) : baseLabel;
                  const qty = Number(product.quantity ?? 1);
                  const lineTotal = groupProductLineTotal(product);
                  return (
                    <View
                      key={`${label}-${index}`}
                      style={twStyle("mb-1.5 flex-row items-center justify-between rounded-lg bg-gray-50 p-3")}
                    >
                      <Text style={twStyle("flex-1 text-sm text-gray-800")} numberOfLines={1}>
                        {label}
                        {qty > 1 ? gb("qtyTimes", { qty }) : ""}
                      </Text>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>
                        {formatCurrency(lineTotal)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {(() => {
              const charges = (selectedGroup.bookings ?? []).flatMap((booking) =>
                (booking.additional_charges ?? []).map((charge) => ({
                  ...charge,
                  bookingId: booking.id,
                }))
              );
              if (charges.length === 0) return null;
              return (
                <View style={twStyle("mb-3")}>
                  <Text style={twStyle("mb-2 text-xs font-semibold uppercase text-gray-400")}>
                    {gb("additionalCharges")}
                  </Text>
                  {charges.map((charge, index) => {
                    const label =
                      charge.description?.trim() ||
                      charge.name?.trim() ||
                      gb("chargeFallback", { n: index + 1 });
                    const status = String(charge.status ?? "").toLowerCase();
                    return (
                      <View
                        key={`${charge.bookingId}-${index}`}
                        style={twStyle("mb-1.5 flex-row items-center justify-between rounded-lg bg-gray-50 p-3")}
                      >
                        <View style={twStyle("flex-1 pe-2")}>
                          <Text style={twStyle("text-sm text-gray-800")} numberOfLines={1}>
                            {label}
                          </Text>
                          {status ? (
                            <Text style={twStyle("text-[10px] text-gray-500 capitalize")}>
                              {status.replace(/_/g, " ")}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={twStyle("text-sm font-medium text-gray-900")}>
                          {formatCurrency(Number(charge.amount ?? 0))}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })()}

            {/* Participants */}
            <View style={twStyle("mb-3")}>
              <View style={twStyle("flex-row items-center justify-between mb-2")}>
                <Text style={twStyle("text-xs font-semibold uppercase text-gray-400")}>
                  {gb("participantsLabel")}
                </Text>
                {selectedGroup.status !== "completed" && selectedGroup.status !== "cancelled" && (() => {
                  const atCap = selectedGroup.max_participants != null &&
                    resolveGroupParticipantCount(selectedGroup) >= selectedGroup.max_participants;
                  return (
                    <TouchableOpacity
                      style={[
                        twStyle("flex-row items-center"),
                        { marginEnd: 4, opacity: atCap ? 0.4 : 1 },
                      ]}
                      onPress={() => {
                        if (atCap) {
                          Alert.alert(
                            gb("sessionFullTitle"),
                            gb("sessionFullCapacityBody", { max: selectedGroup.max_participants })
                          );
                          return;
                        }
                        openAddParticipant();
                      }}
                    >
                      <Ionicons
                        name={atCap ? "lock-closed-outline" : "add-circle-outline"}
                        size={16}
                        color={atCap ? "#9ca3af" : "#6366f1"}
                        style={{ marginEnd: 4 }}
                      />
                      <Text style={twStyle(`text-xs font-medium ${atCap ? "text-gray-400" : "text-indigo-600"}`)}>
                        {atCap ? gb("full") : gb("add")}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>

              {(selectedGroup.participants ?? []).length === 0 ? (
                <View style={twStyle("rounded-lg bg-gray-50 p-3")}>
                  <Text style={twStyle("text-center text-xs text-gray-400")}>
                    {gb("noParticipantsYet")}
                  </Text>
                </View>
              ) : (
                (selectedGroup.participants ?? []).map((p) => {
                  const displayName =
                    p.customer_name || p.client_name || p.participant_name || gb("guest");
                  const displayPhone = p.customer_phone || p.client_phone || p.participant_phone;
                  const checkedIn = isGroupParticipantCheckedIn(p);
                  const checkedOut = isGroupParticipantCheckedOut(p);
                  const isCheckedIn = checkedIn && !checkedOut;
                  const isCheckedOut = checkedOut;
                  const canCheckInOut =
                    selectedGroup.status !== "completed" && selectedGroup.status !== "cancelled";
                  return (
                    <View key={p.id} style={twStyle("mb-1.5 rounded-lg bg-gray-50 p-3")}>
                      <View style={twStyle("flex-row items-center")}>
                        <Avatar name={displayName} size="sm" />
                        <View style={twStyle("ms-2 flex-1")}>
                          <Text style={twStyle("text-sm font-medium text-gray-900")}>
                            {displayName}
                          </Text>
                          {p.service_name ? (
                            <Text style={twStyle("text-xs text-gray-500")}>{p.service_name}</Text>
                          ) : null}
                          {Array.isArray(p.addons) && p.addons.length > 0 ? (
                            <Text style={twStyle("text-xs text-indigo-600")} numberOfLines={2}>
                              {gb("addonsPrefix", {
                                names: p.addons
                                  .map((ao) => ao.name || ao.id || ao.addonId)
                                  .filter(Boolean)
                                  .join(", "),
                              })}
                            </Text>
                          ) : null}
                          {p.notes ? (
                            <Text style={twStyle("text-xs text-gray-500")} numberOfLines={2}>
                              {gb("notePrefix", { notes: p.notes })}
                            </Text>
                          ) : null}
                          {displayPhone && (
                            <TouchableOpacity
                              onPress={() => Linking.openURL(`tel:${displayPhone}`).catch(() => {})}
                              accessibilityRole="button"
                              accessibilityLabel={gb("callA11y", { name: displayName })}
                            >
                              <Text style={twStyle("text-xs text-primary")}>{displayPhone}</Text>
                            </TouchableOpacity>
                          )}
                          {!p.booking_id ? (
                            <Text style={twStyle("mt-0.5 text-[10px] text-gray-400 italic")}>
                              {gb("notSeparatelyInvoiced")}
                            </Text>
                          ) : null}
                        </View>
                        <View style={twStyle("flex-row items-center")}>
                          <View
                            style={[
                              twStyle(
                                `rounded-full px-2 py-0.5 ${(Number((p as Participant & { price?: number }).price) || 0) > 0 ? "bg-green-50" : "bg-amber-50"}`
                              ),
                              { marginEnd: 8 },
                            ]}
                          >
                            <Text
                              style={twStyle(
                                `text-[10px] font-medium ${(Number((p as Participant & { price?: number }).price) || 0) > 0 ? "text-green-700" : "text-amber-700"}`
                              )}
                            >
                              {(Number((p as Participant & { price?: number }).price) || 0) > 0
                                ? formatCurrency(
                                    Number((p as Participant & { price?: number }).price) || 0
                                  )
                                : gb("noPrice")}
                            </Text>
                          </View>
                          <View
                            style={[
                              twStyle(
                                `rounded-full px-2 py-0.5 ${p.paid || p.payment_status === "paid" ? "bg-emerald-50" : Number(p.total_paid ?? 0) > 0 ? "bg-amber-50" : "bg-gray-100"}`
                              ),
                              { marginEnd: 8 },
                            ]}
                          >
                            <Text
                              style={twStyle(
                                `text-[10px] font-medium ${p.paid || p.payment_status === "paid" ? "text-emerald-700" : Number(p.total_paid ?? 0) > 0 ? "text-amber-700" : "text-gray-600"}`
                              )}
                            >
                              {p.paid || p.payment_status === "paid"
                                ? gb("paid")
                                : Number(p.total_paid ?? 0) > 0
                                  ? gb("amountDueValue", {
                                      amount: formatCurrency(Math.max(0, Number(p.balance_due ?? 0))),
                                    })
                                  : gb("unpaid")}
                            </Text>
                          </View>
                          {canCheckInOut && (
                            <TouchableOpacity
                              onPress={() => handleRemoveParticipant(p)}
                              hitSlop={8}
                            >
                              <Ionicons name="close-circle" size={18} color="#ef4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      {canCheckInOut && (
                        <View style={twStyle("mt-2 flex-row")}>
                          {!isCheckedIn && !isCheckedOut ? (
                            <TouchableOpacity
                              onPress={() => handleCheckIn(p)}
                              disabled={pendingParticipantId === p.id}
                              style={[
                                twStyle(
                                  "flex-1 flex-row items-center justify-center rounded-md bg-blue-50 py-2"
                                ),
                                { marginEnd: 8, opacity: pendingParticipantId === p.id ? 0.6 : 1 },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={gb("checkInA11y", { name: p.customer_name })}
                            >
                              {pendingParticipantId === p.id ? (
                                <ActivityIndicator size="small" color="#1d4ed8" style={{ marginEnd: 4 }} />
                              ) : (
                                <Ionicons
                                  name="log-in-outline"
                                  size={14}
                                  color="#1d4ed8"
                                  style={{ marginEnd: 4 }}
                                />
                              )}
                              <Text style={twStyle("text-xs font-semibold text-blue-700")}>
                                {gb("checkIn")}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {isCheckedIn ? (
                            <TouchableOpacity
                              onPress={() => handleCheckOut(p)}
                              disabled={pendingParticipantId === p.id}
                              style={[
                                twStyle(
                                  "flex-1 flex-row items-center justify-center rounded-md bg-green-50 py-2"
                                ),
                                { marginEnd: 8, opacity: pendingParticipantId === p.id ? 0.6 : 1 },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={gb("checkOutA11y", { name: p.customer_name })}
                            >
                              {pendingParticipantId === p.id ? (
                                <ActivityIndicator size="small" color="#15803d" style={{ marginEnd: 4 }} />
                              ) : (
                                <Ionicons
                                  name="log-out-outline"
                                  size={14}
                                  color="#15803d"
                                  style={{ marginEnd: 4 }}
                                />
                              )}
                              <Text style={twStyle("text-xs font-semibold text-green-700")}>
                                {gb("checkOut")}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {isCheckedOut ? (
                            <View
                              style={twStyle(
                                "flex-1 flex-row items-center justify-center rounded-md bg-gray-100 py-2"
                              )}
                            >
                              <Ionicons
                                name="checkmark-done-outline"
                                size={14}
                                color="#4b5563"
                                style={{ marginEnd: 4 }}
                              />
                              <Text style={twStyle("text-xs font-semibold text-gray-600")}>
                                {gb("completed")}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                      {p.booking_id ? (
                        <TouchableOpacity
                          onPress={() => {
                            router.push({
                              pathname: "/(app)/(tabs)/more/bookings/[id]",
                              params: { id: p.booking_id!, return_group_id: selectedGroup.id },
                            } as never);
                          }}
                          style={twStyle("mt-2 flex-row items-center")}
                          accessibilityRole="button"
                          accessibilityLabel={gb("openBookingA11y", { name: displayName })}
                        >
                          <Ionicons name="open-outline" size={14} color="#6366f1" style={{ marginEnd: 4 }} />
                          <Text style={twStyle("text-xs font-medium text-indigo-600")}>{gb("openBooking")}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {canProcessPayments &&
                      paycloudEnabled &&
                      paycloudCollectEnabled &&
                      p.booking_id &&
                      !p.paid &&
                      p.payment_status !== "paid" &&
                      (() => {
                        const due =
                          Number(p.balance_due ?? 0) > 0
                            ? Number(p.balance_due ?? 0)
                            : Math.max(0, Number(p.price ?? 0) - Number(p.total_paid ?? 0));
                        return due > 0.01;
                      })() ? (
                        <TouchableOpacity
                          onPress={() => {
                            const due =
                              Number(p.balance_due ?? 0) > 0
                                ? Number(p.balance_due ?? 0)
                                : Math.max(0, Number(p.price ?? 0) - Number(p.total_paid ?? 0));
                            openPaycloudCollect({
                              entityType: "booking",
                              entityId: p.booking_id!,
                              amount: due,
                              bookingId: p.booking_id!,
                              groupBookingId: selectedGroup.id,
                              locationId: selectedGroup.location_id ?? null,
                            });
                          }}
                          style={twStyle(
                            "mt-2 flex-row items-center justify-center rounded-md border border-slate-300 bg-slate-50 py-2"
                          )}
                          accessibilityRole="button"
                          accessibilityLabel={gb("collectCardA11y", { name: displayName })}
                        >
                          <Ionicons name="card-outline" size={14} color="#334155" style={{ marginEnd: 4 }} />
                          <Text style={twStyle("text-xs font-semibold text-slate-900")}>
                            {formatPaycloudCollectLabel({
                              context: "booking",
                              amount:
                                Number(p.balance_due ?? 0) > 0
                                  ? Number(p.balance_due ?? 0)
                                  : Math.max(0, Number(p.price ?? 0) - Number(p.total_paid ?? 0)),
                              inFlight: paycloudInFlight,
                            })}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {canProcessPayments &&
                      paycloudEnabled &&
                      !paycloudCollectEnabled &&
                      p.booking_id &&
                      !p.paid &&
                      p.payment_status !== "paid" &&
                      (() => {
                        const due =
                          Number(p.balance_due ?? 0) > 0
                            ? Number(p.balance_due ?? 0)
                            : Math.max(0, Number(p.price ?? 0) - Number(p.total_paid ?? 0));
                        return due > 0.01;
                      })() ? (
                        <View style={twStyle("mt-2")}>
                          <PaycloudCollectSetupAffordance
                            blocker={paycloudPrimaryBlocker}
                            compact
                            loading={paycloudLoading}
                          />
                        </View>
                      ) : null}
                      {p.booking_id &&
                      participantMaxRefundable({
                        total_paid: p.total_paid,
                        total_refunded: p.total_refunded,
                        wallet_gift_coverage: p.wallet_gift_coverage,
                      }) > 0 ? (
                        <TouchableOpacity
                          onPress={() => openParticipantRefund(p)}
                          style={twStyle(
                            "mt-2 flex-row items-center justify-center rounded-md bg-amber-50 py-2"
                          )}
                          accessibilityRole="button"
                          accessibilityLabel={gb("refundA11y", { name: displayName })}
                        >
                          <Ionicons
                            name="cash-outline"
                            size={14}
                            color="#b45309"
                            style={{ marginEnd: 4 }}
                          />
                          <Text style={twStyle("text-xs font-semibold text-amber-700")}>
                            {isSingleChargeOnlineGroup(selectedGroup.participants, p.id)
                              ? gb("refundGroupPayment")
                              : gb("refundParticipantCta")}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>

            {/*
              §Provider-launch (audit 2026-04): refunds happen on
              individual participant bookings (there's no group-level
              refund endpoint). The mobile list previously had no
              entrypoint at all, so providers had to switch to the web
              portal.  This routes them to the filtered bookings list
              where the existing per-booking refund action lives.
            */}
            {selectedGroup.status !== "cancelled" && (selectedGroup.participants ?? []).some(
              (participant) =>
                !!participant.booking_id &&
                participantMaxRefundable({
                  total_paid: participant.total_paid,
                  total_refunded: participant.total_refunded,
                  wallet_gift_coverage: participant.wallet_gift_coverage,
                }) > 0
            ) ? (
              <TouchableOpacity
                style={twStyle(
                  "mb-3 flex-row items-center justify-center rounded-lg bg-amber-50 py-2.5"
                )}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const refundableParticipants = (selectedGroup.participants ?? []).filter(
                    (participant) =>
                      !!participant.booking_id &&
                      participantMaxRefundable({
                        total_paid: participant.total_paid,
                        total_refunded: participant.total_refunded,
                        wallet_gift_coverage: participant.wallet_gift_coverage,
                      }) > 0
                  );
                  if (refundableParticipants.length === 1) {
                    openParticipantRefund(refundableParticipants[0]);
                    return;
                  }
                  Alert.alert(
                    gb("refundParticipantTitle"),
                    gb("refundUseRowButton")
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel={gb("refundAParticipant")}
              >
                <Ionicons name="cash-outline" size={16} color="#b45309" />
                <Text style={[twStyle("text-sm font-medium text-amber-700"), { marginStart: 6 }]}>
                  {gb("refundAParticipant")}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={twStyle(
                "mb-3 flex-row items-center justify-center rounded-lg bg-indigo-50 py-2.5"
              )}
              onPress={() => openGroupReceipt(selectedGroup)}
              accessibilityRole="button"
              accessibilityLabel={gb("downloadReceiptA11y")}
            >
              <Ionicons name="download-outline" size={16} color="#4f46e5" />
              <Text style={[twStyle("text-sm font-medium text-indigo-700"), { marginStart: 6 }]}>
                {gb("downloadReceipt")}
              </Text>
            </TouchableOpacity>

            {/* Actions */}
            {selectedGroup.status !== "completed" && selectedGroup.status !== "cancelled" && (
              <View style={[twStyle("flex-row"), { opacity: groupActionLoading ? 0.5 : 1 }]}>
                <TouchableOpacity
                  style={[
                    twStyle("flex-1 items-center rounded-lg bg-indigo-50 py-2.5"),
                    { marginEnd: 8 },
                  ]}
                  disabled={groupActionLoading}
                  onPress={() => openEdit(selectedGroup)}
                >
                  <Text style={twStyle("text-sm font-medium text-indigo-700")}>{gb("edit")}</Text>
                </TouchableOpacity>
                {(selectedGroup.status === "confirmed" || selectedGroup.status === "booked" || selectedGroup.status === "waiting") && (
                  <TouchableOpacity
                    style={[
                      twStyle("flex-1 items-center rounded-lg bg-green-50 py-2.5"),
                      { marginEnd: 8 },
                    ]}
                    disabled={groupActionLoading}
                    onPress={() => handleStatusChange(selectedGroup, "started")}
                  >
                    <Text style={twStyle("text-sm font-medium text-green-700")}>{gb("start")}</Text>
                  </TouchableOpacity>
                )}
                {(selectedGroup.status === "started" || selectedGroup.status === "in_progress") && (
                  <TouchableOpacity
                    style={[
                      twStyle("flex-1 items-center rounded-lg bg-green-50 py-2.5"),
                      { marginEnd: 8 },
                    ]}
                    disabled={groupActionLoading}
                    onPress={() => handleStatusChange(selectedGroup, "completed")}
                  >
                    <Text style={twStyle("text-sm font-medium text-green-700")}>{gb("complete")}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    twStyle("flex-1 items-center rounded-lg bg-red-50 py-2.5"),
                    { marginEnd: 8 },
                  ]}
                  disabled={groupActionLoading}
                  onPress={() => handleCancel(selectedGroup)}
                >
                  <Text style={twStyle("text-sm font-medium text-red-700")}>{gb("cancel")}</Text>
                </TouchableOpacity>
              </View>
            )}
            {paymentRecordedNotice ? (
              <View style={twStyle("mb-2 flex-row items-center rounded-lg bg-green-50 p-2")}>
                <Ionicons name="checkmark-circle-outline" size={14} color="#15803d" style={{ marginEnd: 6 }} />
                <Text style={twStyle("text-xs text-green-800 flex-1")}>{paymentRecordedNotice}</Text>
              </View>
            ) : null}
            {/* Record payment — only when there is outstanding balance */}
            {(() => {
              const isFullyPaid = groupIsFullyPaid(selectedGroup);
              return canProcessPayments && !isFullyPaid && selectedGroup.status !== "cancelled" ? (
              <View style={twStyle("mt-2")}>
                <View style={twStyle("mb-2 flex-row items-center rounded-lg bg-amber-50 p-2")}>
                  <Ionicons name="alert-circle-outline" size={14} color="#b45309" style={{ marginEnd: 6 }} />
                  <Text style={twStyle("text-xs text-amber-700 flex-1")}>{gb("paymentOutstanding")}</Text>
                </View>
                <Text style={twStyle("mb-2 text-xs font-medium text-gray-500")}>{gb("recordPaymentCta")}</Text>
                <View style={twStyle("flex-row flex-wrap")}>
                  {(["cash", "card", "yoco", "bank_transfer"] as const)
                    .filter((method) => method !== "yoco" || yocoEnabled)
                    .filter((method) => method !== "card" || manualCardEnabled)
                    .map((method) => (
                    <TouchableOpacity
                      key={method}
                      style={[
                        twStyle("mb-2 me-2 rounded-full border border-gray-200 bg-white px-3 py-1.5"),
                        { opacity: groupActionLoading ? 0.5 : 1 },
                      ]}
                      disabled={groupActionLoading}
                      onPress={() => handleRecordGroupPayment(selectedGroup, method)}
                    >
                      <Text style={twStyle("text-xs font-medium text-gray-700")}>
                        {method === "bank_transfer"
                          ? gb("bankTransfer")
                          : method === "yoco"
                            ? gb("yoco")
                            : method === "card"
                              ? manualCardCollectOptionLabel()
                              : gb("cash")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {paycloudEnabled && paycloudCollectEnabled ? (
                    <TouchableOpacity
                      style={[
                        twStyle("mb-2 me-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5"),
                        { opacity: groupActionLoading ? 0.5 : 1 },
                      ]}
                      disabled={groupActionLoading}
                      onPress={() => {
                        const outstanding =
                          Number(selectedGroup.balance_due ?? 0) > 0
                            ? Number(selectedGroup.balance_due ?? 0)
                            : selectedGroup.participants
                              ? selectedGroup.participants.reduce(
                                  (s: number, p: Participant) =>
                                    s + Math.max(0, Number(p.balance_due ?? p.price ?? 0)),
                                  0
                                )
                              : Number(selectedGroup.total_price ?? 0);
                        openPaycloudCollect({
                          entityType: "group_booking",
                          entityId: selectedGroup.id,
                          amount: outstanding,
                          groupBookingId: selectedGroup.id,
                          locationId: selectedGroup.location_id ?? null,
                        });
                      }}
                    >
                      <Text style={twStyle("text-xs font-medium text-slate-900")}>
                        {formatPaycloudCollectLabel({
                          context: "group_booking",
                          inFlight: paycloudInFlight,
                          amount:
                            Number(selectedGroup.balance_due ?? 0) > 0
                              ? Number(selectedGroup.balance_due ?? 0)
                              : selectedGroup.participants
                                ? selectedGroup.participants.reduce(
                                    (s: number, p: Participant) =>
                                      s + Math.max(0, Number(p.balance_due ?? p.price ?? 0)),
                                    0
                                  )
                                : Number(selectedGroup.total_price ?? 0),
                        })}
                      </Text>
                    </TouchableOpacity>
                  ) : paycloudEnabled ? (
                    <View style={twStyle("mb-2 me-2 w-full")}>
                      <PaycloudCollectSetupAffordance blocker={paycloudPrimaryBlocker} compact loading={paycloudLoading} />
                    </View>
                  ) : null}
                </View>
                {paystackTerminalEnabled && (
                  <View style={twStyle("mt-3 border-t border-gray-100 pt-3")}>
                    <Text style={twStyle("mb-2 text-xs text-gray-500")}>
                      {gb("collectPaystack")}
                    </Text>
                    <TouchableOpacity
                      style={[
                        twStyle("flex-row items-center self-start rounded-full border border-green-300 bg-green-50 px-3 py-2"),
                        { opacity: isPreparingTerminal ? 0.5 : 1 },
                      ]}
                      disabled={isPreparingTerminal}
                      onPress={() => {
                        const outstanding =
                          Number(selectedGroup.balance_due ?? 0) > 0
                            ? Number(selectedGroup.balance_due ?? 0)
                            : selectedGroup.participants
                              ? selectedGroup.participants.reduce(
                                  (s: number, p: Participant) =>
                                    s + Math.max(0, Number(p.balance_due ?? p.price ?? 0)),
                                  0
                                )
                              : Number(selectedGroup.total_price ?? 0);
                        handleRequestPaystackTerminal(selectedGroup, outstanding);
                      }}
                    >
                      <Ionicons name="qr-code-outline" size={16} color="#16a34a" />
                      <Text style={twStyle("ms-2 text-xs font-medium text-green-700")}>
                        {isPreparingTerminal ? gb("preparing") : gb("paystackTerminal")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              ) : null;
            })()}
          </View>
        )}
      </BottomSheet>

      {/* Edit form */}
      <BottomSheet
        visible={showEdit && !showEditPackagePicker}
        onClose={() => {
          setShowEdit(false);
          setEditingGroupId(null);
          setEditingGroupContext(null);
          setEditOriginalSlot(null);
          setVerifyingEditSlot(false);
        }}
        title={gb("editTitle")}
        subtitle={
          selectedGroup?.title?.trim() ||
          selectedGroup?.service_name ||
          selectedGroup?.ref_number ||
          gb("updateDetails")
        }
        footer={
          <ActionButton
            label={gb("saveChanges")}
            onPress={handleSaveEdit}
            loading={verifyingEditSlot || updatingGroup}
            fullWidth
          />
        }
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* §Provider-audit 2026-04 (packages round 4 — mobile edit
              parity): package attach/swap row inside the edit sheet.
              Tapping opens the dedicated picker sheet, detach writes
              `package_id: null`, swap writes the new id. All three paths
              end up in the PATCH payload on Save. */}
          {packagesList.length > 0 ? (
            <View style={twStyle("mb-3")}>
              <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>{gb("packageLabel")}</Text>
                {editForm.packageId ? (
                  <TouchableOpacity
                    onPress={() => applyPackageToEditForm(null)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={gb("detachPackageA11y")}
                  >
                    <Text style={twStyle("text-xs font-medium text-red-600")}>{gb("detach")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => setShowEditPackagePicker(true)}
                activeOpacity={0.7}
                style={twStyle(
                  `flex-row items-center justify-between rounded-xl border px-4 py-3 ${
                    editForm.packageId
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-gray-200 bg-gray-50"
                  }`
                )}
                accessibilityRole="button"
                accessibilityLabel={
                  editForm.packageId ? gb("changeAttachedPackage") : gb("attachAPackage")
                }
              >
                <View style={twStyle("flex-1 flex-row items-center")}>
                  <Ionicons
                    name="cube-outline"
                    size={16}
                    color={editForm.packageId ? "#4338ca" : "#6b7280"}
                    style={{ marginEnd: 8 }}
                  />
                  <Text
                    style={twStyle(
                      `text-sm ${editForm.packageId ? "text-indigo-800 font-medium" : "text-gray-600"}`
                    )}
                    numberOfLines={1}
                  >
                    {editForm.packageId
                      ? (packagesList.find((p) => p.id === editForm.packageId)?.name ??
                        gb("packageAttached"))
                      : gb("tapToAttachPackage")}
                  </Text>
                </View>
                <DirectionalIcon name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>
              {editForm.packageId !== editForm.originalPackageId ? (
                <Text style={twStyle("mt-1 text-[11px] text-amber-600")}>
                  {gb("packageChangeHint")}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("date")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={twStyle("mb-3")}
            contentContainerStyle={{ paddingVertical: 4 }}
          >
            {editDateOptions.map((d) => {
              const dateKey = formatDateFns(d, "yyyy-MM-dd");
              const isActive = editForm.date === dateKey;
              return (
                <TouchableOpacity
                  key={dateKey}
                  style={[
                    twStyle(
                      `items-center rounded-xl px-3 py-2.5 ${isActive ? "bg-gray-900" : "border border-gray-200 bg-white"}`
                    ),
                    { minWidth: 56, marginEnd: 8 },
                  ]}
                  onPress={() => setEditForm((p) => ({ ...p, date: dateKey }))}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                >
                  <Text
                    style={twStyle(`text-[10px] ${isActive ? "text-gray-300" : "text-gray-500"}`)}
                  >
                    {isSameDay(d, new Date()) ? gb("today") : formatDateFns(d, "EEE")}
                  </Text>
                  <Text
                    style={twStyle(
                      `text-base font-bold ${isActive ? "text-white" : "text-gray-900"}`
                    )}
                  >
                    {formatDateFns(d, "d")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>{gb("timeSlot")}</Text>
            <BookingTimeSlotGrid
              rows={editSlotRows}
              selectedTime={editForm.time}
              onSelectTime={(time) => setEditForm((p) => ({ ...p, time }))}
              loading={editSlotsLoading}
              showLegend
              showNextAvailable
            />
          </View>
          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginEnd: 12 }]}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("durationMin")}</Text>
              <TextInput
                style={twStyle(
                  "rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                )}
                value={editForm.duration}
                onChangeText={(t) => setEditForm((p) => ({ ...p, duration: t }))}
                keyboardType="number-pad"
                placeholder="60"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("flex-1")}>
              {/* Capacity label + current-count hint */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 4 }}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>{gb("capacity")}</Text>
                {editingGroupCurrentCount > 0 && (
                  <Text style={{ fontSize: 11, color: "#6b7280" }}>
                    {gb("capacityNow", { count: editingGroupCurrentCount })}
                  </Text>
                )}
              </View>
              {/* Stepper */}
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: "#f9fafb",
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const current = Number(editForm.maxParticipants) || editingGroupCurrentCount || 1;
                    const next = Math.max(Math.max(1, editingGroupCurrentCount), current - 1);
                    setEditForm((p) => ({ ...p, maxParticipants: String(next) }));
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 12 }}
                  accessibilityLabel={gb("decreaseCapacityA11y")}
                >
                  <Text style={{ fontSize: 18, color: "#374151", fontWeight: "500" }}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: "#111827", paddingVertical: 10 }}
                  value={editForm.maxParticipants}
                  onChangeText={(t) => {
                    const n = parseInt(t);
                    if (!t) { setEditForm((p) => ({ ...p, maxParticipants: "" })); return; }
                    if (Number.isFinite(n) && n >= 1) setEditForm((p) => ({ ...p, maxParticipants: String(Math.max(Math.max(1, editingGroupCurrentCount), n)) }));
                  }}
                  keyboardType="number-pad"
                  placeholder={String(Math.max(10, editingGroupCurrentCount))}
                  placeholderTextColor="#9ca3af"
                />
                <TouchableOpacity
                  onPress={() => {
                    const current = Number(editForm.maxParticipants) || editingGroupCurrentCount || 1;
                    setEditForm((p) => ({ ...p, maxParticipants: String(Math.min(200, current + 1)) }));
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 12 }}
                  accessibilityLabel={gb("increaseCapacityA11y")}
                >
                  <Text style={{ fontSize: 18, color: "#374151", fontWeight: "500" }}>+</Text>
                </TouchableOpacity>
              </View>
              {/* Lower-bound warning */}
              {editForm.maxParticipants !== "" &&
                Number(editForm.maxParticipants) < editingGroupCurrentCount && (
                <Text style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>
                  {gb("capacityBelowCurrent", { count: editingGroupCurrentCount })}
                </Text>
              )}
              <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                {gb("capacityHint")}
              </Text>
            </View>
          </View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("notes")}</Text>
          <TextInput
            style={twStyle(
              "mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            )}
            value={editForm.notes}
            onChangeText={(t) => setEditForm((p) => ({ ...p, notes: t }))}
            placeholder={gb("optionalNotesPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
          />
          <TouchableOpacity
            onPress={() => {
              const groupId = editingGroupId;
              const group =
                groups.find((g) => g.id === groupId) ??
                extraGroups.find((g) => g.id === groupId) ??
                selectedGroup;
              setShowEdit(false);
              setEditingGroupId(null);
              setEditingGroupContext(null);
              setEditOriginalSlot(null);
              if (group && group.id === groupId) {
                setSelectedGroup(group);
              } else if (groupId) {
                router.setParams({ open_group_id: groupId } as never);
              }
            }}
            style={twStyle(
              "mb-3 flex-row items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 py-3",
            )}
            accessibilityRole="button"
            accessibilityLabel={gb("manageParticipantsA11y")}
          >
            <Ionicons name="people-outline" size={18} color="#4338ca" style={{ marginEnd: 8 }} />
            <Text style={twStyle("text-sm font-semibold text-indigo-800")}>{gb("manageParticipants")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </BottomSheet>

      {/* §Provider-audit 2026-04 (packages round 4 — mobile edit parity):
          picker sheet for the edit flow. Kept separate from the create
          picker so the currently-attached package is highlighted against
          the editForm state (not createForm). */}
      <BottomSheet
        visible={showEditPackagePicker}
        onClose={() => setShowEditPackagePicker(false)}
        title={gb("changePackage")}
      >
        {packagesList.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title={gb("noPackagesYet")}
            description={gb("noPackagesHint")}
          />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 480 }}
          >
            {editForm.packageId ? (
              <TouchableOpacity
                onPress={() => {
                  applyPackageToEditForm(null);
                  setShowEditPackagePicker(false);
                }}
                activeOpacity={0.7}
                style={twStyle(
                  "mb-2 flex-row items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3"
                )}
                accessibilityRole="button"
              >
                <View style={twStyle("flex-row items-center")}>
                  <Ionicons
                    name="close-circle-outline"
                    size={16}
                    color="#dc2626"
                    style={{ marginEnd: 8 }}
                  />
                  <Text style={twStyle("text-sm font-medium text-red-700")}>
                    {gb("detachCurrentPackage")}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {packagesList.map((pkg) => {
              const isSelected = editForm.packageId === pkg.id;
              const serviceCount = (pkg.items ?? []).filter(
                (it) => !!it.offering_id || !!it.offering?.id
              ).length;
              const productCount = (pkg.items ?? []).filter(
                (it) => !!it.product_id || !!it.product?.id
              ).length;
              const priceNum = typeof pkg.price === "number" ? pkg.price : null;
              const discount =
                typeof pkg.discount_percentage === "number" && pkg.discount_percentage > 0
                  ? pkg.discount_percentage
                  : null;

              return (
                <TouchableOpacity
                  key={pkg.id}
                  onPress={() => {
                    applyPackageToEditForm(pkg);
                    setShowEditPackagePicker(false);
                  }}
                  activeOpacity={0.7}
                  style={twStyle(
                    `mb-2 rounded-xl border px-4 py-3 ${
                      isSelected ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-white"
                    }`
                  )}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={twStyle("flex-row items-start justify-between")}>
                    <View style={twStyle("flex-1")}>
                      <Text
                        style={twStyle("text-sm font-semibold text-gray-900")}
                        numberOfLines={1}
                      >
                        {pkg.name}
                      </Text>
                      {pkg.description ? (
                        <Text style={twStyle("mt-0.5 text-xs text-gray-500")} numberOfLines={2}>
                          {pkg.description}
                        </Text>
                      ) : null}
                      <View style={twStyle("mt-1.5 flex-row items-center")}>
                        {serviceCount > 0 ? (
                          <Text style={[twStyle("text-[11px] text-gray-500"), { marginEnd: 10 }]}>
                            {gb("serviceCount", { count: serviceCount })}
                          </Text>
                        ) : null}
                        {productCount > 0 ? (
                          <Text style={[twStyle("text-[11px] text-gray-500"), { marginEnd: 10 }]}>
                            {gb("productCount", { count: productCount })}
                          </Text>
                        ) : null}
                        {discount != null ? (
                          <View style={twStyle("rounded-full bg-green-50 px-1.5 py-0.5")}>
                            <Text style={twStyle("text-[10px] font-medium text-green-700")}>
                              {gb("discountPercent", { discount })}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={[twStyle("items-end"), { marginStart: 12 }]}>
                      {priceNum != null ? (
                        <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                          {formatCurrency(priceNum)}
                        </Text>
                      ) : null}
                      {isSelected ? (
                        <View style={twStyle("mt-1")}>
                          <Ionicons name="checkmark-circle" size={16} color="#4338ca" />
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </BottomSheet>

      {/* Add participant */}
      <BottomSheet
        visible={showAddParticipant}
        onClose={() => setShowAddParticipant(false)}
        title={gb("addParticipantTitle")}
        footer={
          <ActionButton
            label={gb("addParticipantTitle")}
            onPress={handleAddParticipant}
            loading={addingParticipant || creatingParticipantBooking}
            fullWidth
          />
        }
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("nameRequired")}</Text>
          <TextInput
            style={twStyle(
              "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            )}
            value={participantForm.name}
            onChangeText={(t) => setParticipantForm((p) => ({ ...p, name: t }))}
            placeholder={gb("clientNamePlaceholder")}
            placeholderTextColor="#9ca3af"
          />
          <E164PhoneField
            label={gb("phone")}
            valueE164={participantForm.phone}
            onChangeE164={(e164) => setParticipantForm((p) => ({ ...p, phone: e164 }))}
            muted
            accessibilityLabel={gb("participantPhoneA11y")}
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("email")}</Text>
          <TextInput
            style={twStyle(
              "mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            )}
            value={participantForm.email}
            onChangeText={(t) => setParticipantForm((p) => ({ ...p, email: t }))}
            placeholder={gb("optionalPlaceholder")}
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
          />
          {servicesForPicking.length > 0 ? (
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                {gb("participantServiceRequired")}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {servicesForPicking.map((svc) => (
                  <SelectChip
                    key={`add-participant-service-${svc.id}`}
                    label={svc.price != null ? gb("serviceWithPrice", { name: sl(svc), amount: formatCurrency(Number(svc.price) || 0) }) : sl(svc)}
                    selected={participantForm.serviceId === svc.id}
                    onPress={() =>
                      setParticipantForm((p) => ({ ...p, serviceId: svc.id, addOnIds: [] }))
                    }
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
          {(() => {
            const line = getParticipantLine(
              participantForm,
              selectedGroup?.service_id ?? "",
              services
            );
            const addOns = line.service?.add_ons ?? [];
            if (addOns.length === 0) return null;
            return (
              <View style={twStyle("mb-3")}>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("addOns")}</Text>
                <View style={twStyle("flex-row flex-wrap")}>
                  {addOns.map((ao) => {
                    const checked = participantForm.addOnIds.includes(ao.id);
                    return (
                      <TouchableOpacity
                        key={`add-participant-addon-${ao.id}`}
                        onPress={() =>
                          setParticipantForm((p) => ({
                            ...p,
                            addOnIds: checked
                              ? p.addOnIds.filter((id) => id !== ao.id)
                              : [...p.addOnIds, ao.id],
                          }))
                        }
                        style={[
                          twStyle(
                            `mb-2 rounded-full border px-3 py-1.5 ${checked ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"}`
                          ),
                          { marginEnd: 8 },
                        ]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                      >
                        <Text
                          style={twStyle(
                            `text-xs font-medium ${checked ? "text-indigo-700" : "text-gray-600"}`
                          )}
                        >
                          {ao.name}
                          {ao.price ? ` · ${formatCurrency(Number(ao.price) || 0)}` : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={twStyle("text-[11px] font-medium text-indigo-700")}>
                  {gb("participantTotalLine", { minutes: line.durationMinutes, amount: formatCurrency(line.price) })}
                </Text>
              </View>
            );
          })()}
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("participantNotes")}</Text>
          <TextInput
            style={twStyle(
              "mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            )}
            value={participantForm.notes}
            onChangeText={(t) => setParticipantForm((p) => ({ ...p, notes: t }))}
            placeholder={gb("notesPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
          />
        </View>
      </BottomSheet>

      {/* B10: Create new group booking */}
      <BottomSheet
        visible={showCreate && !showProductPicker && !createMapPinOpen}
        onClose={() => {
          setShowCreate(false);
          setCreateStep("form");
          setCreateReviewError(null);
          setCreateFieldError(null);
          setValidatingCreateAddress(false);
          pendingCreateAddressAlertRef.current = false;
          setCreateMapPreviewCoords(null);
        }}
        title={createStep === "form" ? gb("newGroupBooking") : gb("reviewGroupBooking")}
        subtitle={createStep === "form" ? gb("createSubtitle") : gb("reviewSubtitle")}
        footer={
          createStep === "form" ? (
            <ActionButton
              label={
                validatingCreateAddress ?
                  gb("checkingAddress")
                : createReadiness.completed < createReadiness.total ?
                  `${gb("reviewAndCreate")} · ${createReadiness.total - createReadiness.completed}`
                : gb("reviewAndCreate")
              }
              onPress={handleOpenCreateReview}
              loading={validatingCreateAddress || checkingCreateReview}
              disabled={
                !validatingCreateAddress &&
                !checkingCreateReview &&
                createReadiness.completed < createReadiness.total
              }
              fullWidth
            />
          ) : (
            <View style={{ flexDirection: "row" }}>
              <ActionButton
                label={gb("back")}
                onPress={() => {
                  setCreateStep("form");
                  setCreateReviewError(null);
                  setCreateFieldError(null);
                }}
                variant="secondary"
                style={{ flex: 1, marginEnd: 8 }}
              />
              <ActionButton
                label={
                  createParticipantProgress
                    ? gb("addingParticipantProgress", {
                        name: createParticipantProgress.name,
                        current: createParticipantProgress.current,
                        total: createParticipantProgress.total,
                      })
                    : gb("confirmAndCreate")
                }
                onPress={() => {
                  void handleCreate();
                }}
                loading={creatingGroup || creatingParticipantBooking || addingParticipant || createParticipantProgress != null || groupActionLoading}
                variant="brand"
                style={{ flex: 2 }}
              />
            </View>
          )
        }
      >
        {createStep === "form" ? (
        <ScrollView
          ref={createFormScrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {createReviewError ? (
            <View style={twStyle("mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-red-800")}>{createReviewError}</Text>
            </View>
          ) : null}
          {createStep === "form" && createReadiness.total > 0 ? (
            <BookingCreateReadinessStrip
              summary={createReadiness}
              forceExpanded={createReadinessExpanded}
              onJumpToSection={(sectionKey, participantIndex) =>
                scrollToSection(createFormScrollRef, sectionKey, participantIndex)
              }
            />
          ) : null}
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("titleLabel")}</Text>
          <TextInput
            style={twStyle(
              "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            )}
            value={createForm.title}
            onChangeText={(t) => setCreateForm((p) => ({ ...p, title: t }))}
            placeholder={gb("titlePlaceholder")}
            placeholderTextColor="#9ca3af"
          />

          <View style={twStyle("mb-3")}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
              {gb("whereHappening")}
            </Text>
            <View style={twStyle("mb-3 flex-row")}>
              <TouchableOpacity
                onPress={() => setCreateForm((p) => ({ ...p, locationType: "at_salon" }))}
                style={[
                  twStyle(
                    `flex-1 rounded-xl border px-3 py-3 ${createForm.locationType === "at_salon" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"}`
                  ),
                  { marginEnd: 8 },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: createForm.locationType === "at_salon" }}
              >
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>{gb("atSalon")}</Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{gb("useProviderLocation")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  setCreateForm((p) => ({ ...p, locationType: "at_home", locationId: "" }))
                }
                style={twStyle(
                  `flex-1 rounded-xl border px-3 py-3 ${createForm.locationType === "at_home" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"}`
                )}
                accessibilityRole="radio"
                accessibilityState={{ checked: createForm.locationType === "at_home" }}
              >
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>{gb("atHome")}</Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{gb("saveAddressMapPin")}</Text>
              </TouchableOpacity>
            </View>

            {createForm.locationType === "at_salon" && locations.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <SelectChip
                  label={gb("notSet")}
                  selected={!createForm.locationId}
                  onPress={() => setCreateForm((p) => ({ ...p, locationId: "" }))}
                />
                {locations.map((loc) => (
                  <SelectChip
                    key={loc.id}
                    label={loc.name}
                    selected={createForm.locationId === loc.id}
                    onPress={() => setCreateForm((p) => ({ ...p, locationId: loc.id }))}
                  />
                ))}
              </ScrollView>
            ) : null}

            {createForm.locationType === "at_home" ? (
              <View
                style={twStyle("rounded-2xl border border-blue-100 bg-blue-50 p-3")}
                onLayout={(e) => registerSection("address", e.nativeEvent.layout.y)}
              >
                <Text style={twStyle("mb-2 text-xs text-blue-800")}>
                  {gb("addressSearchHint")}
                </Text>
                <AddressAutocomplete
                  label={gb("searchAddress")}
                  value={createForm.addressSearchValue}
                  countryCode={countryFilterIso2FromStorage(createForm.addressCountry) ?? "ZA"}
                  defaultCountryName={createForm.addressCountry.trim() || undefined}
                  placeholder={gb("addressPlaceholder")}
                  onSelect={(parsed) => {
                    void applyCreateAddress(parsed);
                  }}
                  onBlur={(q) =>
                    setCreateForm((p) => ({
                      ...p,
                      addressSearchValue: q,
                      addressLine1: p.addressLine1 || q,
                    }))
                  }
                  proximity={
                    createForm.addressLatitude != null && createForm.addressLongitude != null
                      ? {
                          latitude: createForm.addressLatitude,
                          longitude: createForm.addressLongitude,
                        }
                      : undefined
                  }
                />
                <View style={twStyle("mt-2 flex-row flex-wrap gap-2")}>
                  <TouchableOpacity
                    onPress={() => void handleCreateUseCurrentLocation()}
                    disabled={createLocatingHome}
                    style={twStyle(
                      `rounded-full border px-3 py-1.5 flex-row items-center ${
                        createLocatingHome
                          ? "border-gray-200 bg-gray-100"
                          : "border-blue-200 bg-blue-50"
                      }`
                    )}
                    accessibilityRole="button"
                    accessibilityLabel={gb("useCurrentLocationA11y")}
                  >
                    {createLocatingHome ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Ionicons name="locate-outline" size={16} color="#2563eb" />
                    )}
                    <Text style={twStyle("ms-1.5 text-xs font-semibold text-blue-700")}>
                      {createLocatingHome ? gb("locating") : gb("currentLocation")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setCreateMapPinOpen(true)}
                    style={twStyle(
                      "rounded-full border border-gray-200 bg-white px-3 py-1.5 flex-row items-center"
                    )}
                    accessibilityRole="button"
                    accessibilityLabel={gb("dropPinOnMapA11y")}
                  >
                    <Ionicons name="map-outline" size={16} color="#374151" />
                    <Text style={twStyle("ms-1.5 text-xs font-semibold text-gray-700")}>
                      {gb("dropPinOnMap")}
                    </Text>
                  </TouchableOpacity>
                </View>
                {validatingCreateAddress ? (
                  <View style={twStyle("mt-2 flex-row items-center")}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={twStyle("ms-2 text-xs text-blue-700")}>
                      {gb("calculatingTravelFee")}
                    </Text>
                  </View>
                ) : null}
                {createMapPreviewCoords ? (
                  <View style={{ marginTop: 12, alignItems: "center" }}>
                    <StaticMapImage
                      latitude={createMapPreviewCoords.latitude}
                      longitude={createMapPreviewCoords.longitude}
                      width={Math.min(windowWidth - 48, 400)}
                      height={150}
                      zoom={15}
                    />
                    <Text style={twStyle("mt-1.5 text-xs text-gray-500")}>
                      {gb("selectedMapPin")}
                      {createForm.travelPreviewDistanceKm != null
                        ? gb("mapPinDistance", { km: createForm.travelPreviewDistanceKm.toFixed(1) })
                        : ""}
                      {Number(createForm.travelFee || 0) > 0
                        ? gb("mapPinTravelFee", { amount: formatCurrency(Number(createForm.travelFee || 0)) })
                        : ""}
                    </Text>
                  </View>
                ) : null}
                <Text style={twStyle("mb-1 mt-3 text-xs font-medium text-gray-600")}>
                  {gb("streetLine")}
                </Text>
                <TextInput
                  style={twStyle(
                    "rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                  )}
                  value={createForm.addressLine1}
                  onChangeText={(t) => setCreateForm((p) => ({ ...p, addressLine1: t }))}
                  placeholder={gb("streetPlaceholder")}
                  placeholderTextColor="#9ca3af"
                />
                <View style={[twStyle("flex-row"), { marginTop: 10 }]}>
                  <TextInput
                    style={[
                      twStyle(
                        "flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                      ),
                      { marginEnd: 8 },
                    ]}
                    value={createForm.addressCity}
                    onChangeText={(t) => setCreateForm((p) => ({ ...p, addressCity: t }))}
                    placeholder={gb("cityPlaceholder")}
                    placeholderTextColor="#9ca3af"
                  />
                  <TextInput
                    style={twStyle(
                      "flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                    )}
                    value={createForm.addressPostalCode}
                    onChangeText={(t) => setCreateForm((p) => ({ ...p, addressPostalCode: t }))}
                    placeholder={gb("postalPlaceholder")}
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <Text style={twStyle("mb-1 mt-3 text-xs font-medium text-gray-600")}>
                  {gb("travelFeeOptional")}
                </Text>
                <TextInput
                  style={twStyle(
                    "rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                  )}
                  value={createForm.travelFee}
                  onChangeText={(t) => setCreateForm((p) => ({ ...p, travelFee: t }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                />
                {createFieldError === "address" ? (
                  <Text style={twStyle("mt-2 text-xs font-medium text-red-600")}>
                    {gb("completeAddressHint")}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {packagesList.length > 0 ? (
            <View style={twStyle("mb-3")}>
              <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>{gb("packageOptional")}</Text>
                {createForm.packageId ? (
                  <TouchableOpacity
                    onPress={() => applyPackageToCreateForm(null)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={gb("detachPackageA11y")}
                  >
                    <Text style={twStyle("text-xs font-medium text-red-600")}>{gb("detach")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => setShowPackagePicker(true)}
                activeOpacity={0.7}
                style={twStyle(
                  `flex-row items-center justify-between rounded-xl border px-4 py-3 ${
                    createForm.packageId
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-gray-200 bg-gray-50"
                  }`
                )}
                accessibilityRole="button"
                accessibilityLabel={
                  createForm.packageId ? gb("changeSelectedPackage") : gb("chooseAPackage")
                }
              >
                <View style={twStyle("flex-1 flex-row items-center")}>
                  <Ionicons
                    name="cube-outline"
                    size={16}
                    color={createForm.packageId ? "#4338ca" : "#6b7280"}
                    style={{ marginEnd: 8 }}
                  />
                  <Text
                    style={twStyle(
                      `text-sm ${createForm.packageId ? "text-indigo-800 font-medium" : "text-gray-600"}`
                    )}
                    numberOfLines={1}
                  >
                    {createForm.packageId
                      ? (packagesList.find((p) => p.id === createForm.packageId)?.name ??
                        gb("packageAttached"))
                      : gb("tapToAttachPackage")}
                  </Text>
                </View>
                <DirectionalIcon name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>
              {createForm.packageId ? (
                <Text style={twStyle("mt-1 text-[11px] text-gray-500")}>
                  {gb("packageSetsDefault")}
                </Text>
              ) : null}
            </View>
          ) : null}

          {services.length > 0 ? (
            <View
              style={twStyle("mb-3")}
              onLayout={(e) => registerSection("serviceId", e.nativeEvent.layout.y)}
            >
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                {gb("defaultService")} <Text style={twStyle("text-red-600")}>*</Text>
              </Text>
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>
                {gb("defaultServiceHint")}
              </Text>
              {serviceCategoryOptions.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={twStyle("mb-2")}
                >
                  <SelectChip
                    label={gb("statusAll")}
                    selected={selectedServiceCategory === "all"}
                    onPress={() => setSelectedServiceCategory("all")}
                  />
                  {serviceCategoryOptions.map((category) => (
                    <SelectChip
                      key={category.id}
                      label={gb("categoryWithCount", { label: category.label, count: category.count })}
                      selected={selectedServiceCategory === category.id}
                      onPress={() => setSelectedServiceCategory(category.id)}
                    />
                  ))}
                </ScrollView>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <SelectChip
                  label={gb("none")}
                  selected={!createForm.serviceId}
                  onPress={() => setCreateForm((p) => ({ ...p, serviceId: "" }))}
                />
                {visibleParentServices.map((svc) => {
                  const variants = variantServices.filter((v) => v.parent_service_id === svc.id);
                  const serviceChoices = variants.length > 0 ? [svc, ...variants] : [svc];
                  return serviceChoices.map((choice) => (
                    <SelectChip
                      key={choice.id}
                      label={sl(choice)}
                      selected={createForm.serviceId === choice.id}
                      onPress={() => {
                        clearCreateFieldError("serviceId");
                        setCreateForm((p) => {
                          const next = { ...p, serviceId: choice.id };
                          if (choice.duration_minutes && choice.duration_minutes > 0) {
                            next.duration = String(choice.duration_minutes);
                          }
                          return next;
                        });
                        setCreateParticipants((prev) =>
                          prev.map((participant) =>
                            participant.serviceId
                              ? participant
                              : { ...participant, serviceId: choice.id, addOnIds: [] }
                          )
                        );
                      }}
                    />
                  ));
                })}
              </ScrollView>
              {createFieldError === "serviceId" ? (
                <Text style={twStyle("mt-2 text-xs font-medium text-red-600")}>
                  {gb("selectDefaultService")}
                </Text>
              ) : null}
            </View>
          ) : null}

          {teamMembers.length > 0 ? (
            <View
              style={twStyle("mb-3")}
              onLayout={(e) => registerSection("staffId", e.nativeEvent.layout.y)}
            >
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
                {gb("staff")} <Text style={twStyle("text-red-600")}>*</Text>
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <SelectChip
                  label={gb("none")}
                  selected={!createForm.staffId}
                  onPress={() => setCreateForm((p) => ({ ...p, staffId: "" }))}
                />
                {teamMembers.map((m) => (
                  <SelectChip
                    key={m.id}
                    label={m.name?.trim() || gb("teamMember")}
                    selected={createForm.staffId === m.id}
                    onPress={() => {
                      clearCreateFieldError("staffId");
                      setCreateForm((p) => ({ ...p, staffId: m.id }));
                    }}
                  />
                ))}
              </ScrollView>
              {createFieldError === "staffId" ? (
                <Text style={twStyle("mt-2 text-xs font-medium text-red-600")}>
                  {gb("selectTeamMember")}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={twStyle("mb-3 rounded-2xl border border-gray-100 bg-gray-50 p-3")}>
            <View style={twStyle("mb-2 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>{gb("productsOptional")}</Text>
              <TouchableOpacity
                onPress={() => setShowProductPicker(true)}
                style={twStyle("flex-row items-center rounded-full bg-white px-2.5 py-1")}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={14} color="#4f46e5" />
                <Text style={twStyle("ms-1 text-xs font-semibold text-indigo-700")}>
                  {gb("addProduct")}
                </Text>
              </TouchableOpacity>
            </View>
            {createProducts.length === 0 ? (
              <Text style={twStyle("text-xs text-gray-500")}>{gb("noProductsAdded")}</Text>
            ) : (
              createProducts.map((p, idx) => (
                <View
                  key={`${p.productId}-${p.productVariantId ?? "simple"}`}
                  style={twStyle(
                    "mb-2 flex-row items-center justify-between rounded-xl bg-white px-3 py-2"
                  )}
                >
                  <View style={twStyle("min-w-0 flex-1")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
                      {p.productName}
                      {p.productVariantName ? ` · ${p.productVariantName}` : ""}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {gb("unitTimesQty", { amount: formatCurrency(p.unitPrice), qty: p.quantity })}
                    </Text>
                  </View>
                  <View style={twStyle("flex-row items-center")}>
                    <TouchableOpacity
                      onPress={() => {
                        setCreateProducts((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item
                          )
                        );
                      }}
                      style={twStyle("rounded-full bg-gray-100 px-2 py-1")}
                    >
                      <Text style={twStyle("text-sm font-bold text-gray-700")}>-</Text>
                    </TouchableOpacity>
                    <Text style={twStyle("mx-2 text-sm text-gray-700")}>{p.quantity}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setCreateProducts((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, quantity: item.quantity + 1 } : item
                          )
                        );
                      }}
                      style={twStyle("rounded-full bg-gray-100 px-2 py-1")}
                    >
                      <Text style={twStyle("text-sm font-bold text-gray-700")}>+</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setCreateProducts((prev) => prev.filter((_, i) => i !== idx))}
                      style={twStyle("ms-2")}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          <View onLayout={(e) => registerSection("date", e.nativeEvent.layout.y)}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("dateRequired")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={twStyle("mb-3")}
            contentContainerStyle={{ paddingVertical: 4 }}
          >
            {createDateOptions.map((d) => {
              const dateKey = formatDateFns(d, "yyyy-MM-dd");
              const isActive = createForm.date === dateKey;
              return (
                <TouchableOpacity
                  key={dateKey}
                  style={[
                    twStyle(
                      `items-center rounded-xl px-3 py-2.5 ${isActive ? "bg-gray-900" : "border border-gray-200 bg-white"}`
                    ),
                    { minWidth: 56, marginEnd: 8 },
                  ]}
                  onPress={() => setCreateForm((p) => ({ ...p, date: dateKey }))}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                >
                  <Text
                    style={twStyle(`text-[10px] ${isActive ? "text-gray-300" : "text-gray-500"}`)}
                  >
                    {isSameDay(d, new Date()) ? gb("today") : formatDateFns(d, "EEE")}
                  </Text>
                  <Text
                    style={twStyle(
                      `text-base font-bold ${isActive ? "text-white" : "text-gray-900"}`
                    )}
                  >
                    {formatDateFns(d, "d")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          </View>
          <View
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3")}
            onLayout={(e) => registerSection("time", e.nativeEvent.layout.y)}
          >
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>{gb("timeSlotRequired")}</Text>
            <BookingTimeSlotGrid
              rows={createSlotRows}
              selectedTime={createForm.time}
              onSelectTime={(time) => setCreateForm((p) => ({ ...p, time }))}
              loading={createSlotsLoading}
              showLegend
              showNextAvailable
            />
          </View>
          <View
            style={twStyle("mb-3 flex-row")}
            onLayout={(e) => registerSection("duration", e.nativeEvent.layout.y)}
          >
            <View style={[twStyle("flex-1"), { marginEnd: 12 }]}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                {gb("durationMinRequired")}
              </Text>
              <TextInput
                style={twStyle(
                  "rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                )}
                value={createForm.duration}
                onChangeText={(t) => setCreateForm((p) => ({ ...p, duration: t }))}
                keyboardType="number-pad"
                placeholder="60"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("capacity")}</Text>
              {/* Stepper */}
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: "#f9fafb",
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const current = Number(createForm.maxParticipants) || 10;
                    const minAllowed = Math.max(1, createParticipants.length);
                    setCreateForm((p) => ({ ...p, maxParticipants: String(Math.max(minAllowed, current - 1)) }));
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 12 }}
                  accessibilityLabel={gb("decreaseCapacityA11y")}
                >
                  <Text style={{ fontSize: 18, color: "#374151", fontWeight: "500" }}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: "#111827", paddingVertical: 10 }}
                  value={createForm.maxParticipants}
                  onChangeText={(t) => {
                    const n = parseInt(t);
                    const minAllowed = Math.max(1, createParticipants.length);
                    if (!t) { setCreateForm((p) => ({ ...p, maxParticipants: "" })); return; }
                    if (Number.isFinite(n) && n >= 1) setCreateForm((p) => ({ ...p, maxParticipants: String(Math.max(minAllowed, n)) }));
                  }}
                  keyboardType="number-pad"
                  placeholder="10"
                  placeholderTextColor="#9ca3af"
                />
                <TouchableOpacity
                  onPress={() => {
                    const current = Number(createForm.maxParticipants) || 10;
                    setCreateForm((p) => ({ ...p, maxParticipants: String(Math.min(200, current + 1)) }));
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 12 }}
                  accessibilityLabel={gb("increaseCapacityA11y")}
                >
                  <Text style={{ fontSize: 18, color: "#374151", fontWeight: "500" }}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                {gb("maxPeopleHint")}
              </Text>
            </View>
          </View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{gb("notes")}</Text>
          <TextInput
            style={twStyle(
              "mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            )}
            value={createForm.notes}
            onChangeText={(t) => setCreateForm((p) => ({ ...p, notes: t }))}
            placeholder={gb("optionalNotesPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
          />

          <View
            style={twStyle("mb-4 rounded-2xl border border-purple-100 bg-purple-50 p-3")}
            onLayout={(e) => registerSection("participants", e.nativeEvent.layout.y)}
          >
            <View style={twStyle("mb-2 flex-row items-center justify-between")}>
              <View style={twStyle("flex-row items-center")}>
                <Ionicons
                  name="people-outline"
                  size={16}
                  color="#7c3aed"
                  style={{ marginEnd: 6 }}
                />
                <Text style={twStyle("text-sm font-semibold text-purple-900")}>
                  {gb("initialParticipants")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={addCreateParticipantRow}
                style={twStyle("flex-row items-center rounded-full bg-white px-2.5 py-1")}
                accessibilityRole="button"
                accessibilityLabel={gb("addInitialParticipantA11y")}
              >
                <Ionicons name="add" size={14} color="#7c3aed" />
                <Text style={twStyle("ms-1 text-xs font-semibold text-purple-700")}>{gb("add")}</Text>
              </TouchableOpacity>
            </View>
            <Text style={twStyle("mb-3 text-xs text-purple-700")}>
              {gb("initialParticipantsHint")}
            </Text>
            {createFieldError === "participants" ||
            (typeof createFieldError === "string" && createFieldError.startsWith("participant:")) ? (
              <Text style={twStyle("mb-3 text-xs font-medium text-red-600")}>
                {createReviewError ?? gb("completeParticipantDetails")}
              </Text>
            ) : null}

            {createParticipants.map((participant, idx) => {
              const search = participantSearchMap[participant.id] || {
                query: "",
                results: [],
                loading: false,
                open: false,
              };
              const isLast = idx === createParticipants.length - 1;
              return (
                <View
                  key={participant.id}
                  style={twStyle("mb-3 rounded-xl border border-purple-100 bg-white p-3")}
                  onLayout={(e) => registerParticipantRow(idx, e.nativeEvent.layout.y)}
                >
                  <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                    <View style={twStyle("flex-row items-center gap-2")}>
                      <Text style={twStyle("text-xs font-semibold uppercase text-gray-400")}>
                        {gb("participantN", { n: idx + 1 })}
                      </Text>
                      {participant.customerId ? (
                        <View
                          style={twStyle(
                            "rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5"
                          )}
                        >
                          <Text style={twStyle("text-[10px] font-medium text-purple-700")}>
                            {gb("existingClient")}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => removeCreateParticipantRow(participant.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={gb("removeParticipantNA11y", { n: idx + 1 })}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>

                  {/* ── Client search ── */}
                  {!participant.customerId ? (
                    <View style={twStyle("mb-2")}>
                      <View
                        style={twStyle(
                          "flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2"
                        )}
                      >
                        <Ionicons name="search-outline" size={14} color="#9ca3af" />
                        <TextInput
                          style={[
                            twStyle("ms-2 flex-1 text-sm text-gray-900"),
                            { paddingVertical: 0 },
                          ]}
                          placeholder={gb("searchExistingClient")}
                          placeholderTextColor="#9ca3af"
                          value={search.query}
                          onChangeText={(q) => searchClientsForParticipant(participant.id, q)}
                          autoCapitalize="words"
                          returnKeyType="search"
                          accessibilityLabel={gb("searchClientsA11y", { n: idx + 1 })}
                        />
                        {search.loading && <ActivityIndicator size="small" color="#7c3aed" />}
                      </View>
                      {search.open && search.results.length > 0 && (
                        <View
                          style={twStyle(
                            "mt-1 rounded-xl border border-gray-100 bg-white overflow-hidden"
                          )}
                        >
                          {search.results.map((c) => (
                            <TouchableOpacity
                              key={c.id}
                              style={twStyle(
                                "flex-row items-center border-b border-gray-50 px-3 py-2.5"
                              )}
                              onPress={() => selectClientForParticipant(participant.id, c)}
                              accessibilityLabel={gb("selectClientA11y", { name: c.full_name })}
                            >
                              <Avatar name={c.full_name} size="sm" />
                              <View style={twStyle("ms-2 flex-1")}>
                                <Text style={twStyle("text-sm font-medium text-gray-900")}>
                                  {c.full_name}
                                </Text>
                                <Text style={twStyle("text-xs text-gray-500")} numberOfLines={1}>
                                  {c.phone || c.email || "—"}
                                </Text>
                              </View>
                              <DirectionalIcon name="chevron-forward" size={14} color="#d1d5db" />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      {search.open &&
                        !search.loading &&
                        search.results.length === 0 &&
                        search.query.length >= 2 && (
                          <Text style={twStyle("mt-1 text-center text-xs text-gray-400")}>
                            {gb("noExistingClients")}
                          </Text>
                        )}
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() =>
                        updateCreateParticipantRow(participant.id, { customerId: undefined })
                      }
                      style={twStyle("mb-2")}
                      accessibilityRole="button"
                    >
                      <Text style={twStyle("text-xs text-purple-600 underline")}>
                        {gb("changeClient")}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>{gb("nameRequired")}</Text>
                  <TextInput
                    style={twStyle(
                      "mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900"
                    )}
                    value={participant.name}
                    onChangeText={(name) => updateCreateParticipantRow(participant.id, { name })}
                    placeholder={gb("clientNamePlaceholder")}
                    placeholderTextColor="#9ca3af"
                  />
                  <E164PhoneField
                    label={gb("phone")}
                    valueE164={participant.phone}
                    onChangeE164={(phone) => updateCreateParticipantRow(participant.id, { phone })}
                    muted
                    accessibilityLabel={gb("participantPhoneNA11y", { n: idx + 1 })}
                  />
                  <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>{gb("email")}</Text>
                  <TextInput
                    style={twStyle(
                      "rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900"
                    )}
                    value={participant.email}
                    onChangeText={(email) => updateCreateParticipantRow(participant.id, { email })}
                    placeholder={gb("optionalPlaceholder")}
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <View style={twStyle("mt-3")}>
                    <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>
                      {gb("whatParticipantWants")}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {servicesForPicking.map((svc) => (
                        <SelectChip
                          key={`${participant.id}-${svc.id}`}
                          label={svc.price != null ? gb("serviceWithPrice", { name: sl(svc), amount: formatCurrency(Number(svc.price) || 0) }) : sl(svc)}
                          selected={(participant.serviceId || createForm.serviceId) === svc.id}
                          onPress={() =>
                            updateCreateParticipantRow(participant.id, {
                              serviceId: svc.id,
                              addOnIds: [],
                            })
                          }
                        />
                      ))}
                    </ScrollView>
                    {(() => {
                      const line = getParticipantLine(participant, createForm.serviceId, services);
                      const addOns = line.service?.add_ons ?? [];
                      if (!line.service) {
                        return (
                          <Text style={twStyle("mt-1 text-[11px] text-red-600")}>
                            {gb("selectServiceForParticipant")}
                          </Text>
                        );
                      }
                      return (
                        <View>
                          {addOns.length > 0 ? (
                            <View style={twStyle("mt-2")}>
                              <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>
                                {gb("addOns")}
                              </Text>
                              <View style={twStyle("flex-row flex-wrap")}>
                                {addOns.map((ao) => {
                                  const checked = participant.addOnIds.includes(ao.id);
                                  return (
                                    <TouchableOpacity
                                      key={`${participant.id}-ao-${ao.id}`}
                                      onPress={() => {
                                        updateCreateParticipantRow(participant.id, {
                                          addOnIds: checked
                                            ? participant.addOnIds.filter((id) => id !== ao.id)
                                            : [...participant.addOnIds, ao.id],
                                        });
                                      }}
                                      style={[
                                        twStyle(
                                          `mb-2 rounded-full border px-3 py-1.5 ${checked ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"}`
                                        ),
                                        { marginEnd: 8 },
                                      ]}
                                      accessibilityRole="checkbox"
                                      accessibilityState={{ checked }}
                                    >
                                      <Text
                                        style={twStyle(
                                          `text-xs font-medium ${checked ? "text-indigo-700" : "text-gray-600"}`
                                        )}
                                      >
                                        {ao.name}
                                        {ao.price
                                          ? ` · ${formatCurrency(Number(ao.price) || 0)}`
                                          : ""}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          ) : null}
                          <Text style={twStyle("mt-1 text-[11px] font-medium text-purple-800")}>
                            {gb("serviceDurationPrice", {
                              name: sl(line.service),
                              minutes: line.durationMinutes,
                              amount: formatCurrency(line.price),
                            })}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                  {teamMembers.length > 0 ? (
                    <View style={twStyle("mt-3")}>
                      <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>
                        {gb("staffOptional")}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <SelectChip
                          label={gb("groupDefault")}
                          selected={!participant.staffId}
                          onPress={() => updateCreateParticipantRow(participant.id, { staffId: "" })}
                        />
                        {teamMembers.map((m) => (
                          <SelectChip
                            key={`${participant.id}-staff-${m.id}`}
                            label={m.name ?? gb("staffFallback")}
                            selected={participant.staffId === m.id}
                            onPress={() => updateCreateParticipantRow(participant.id, { staffId: m.id })}
                          />
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                  <Text style={twStyle("mb-1 mt-3 text-xs font-medium text-gray-600")}>
                    {gb("participantNotes")}
                  </Text>
                  <TextInput
                    style={twStyle(
                      "rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900"
                    )}
                    value={participant.notes}
                    onChangeText={(notes) => updateCreateParticipantRow(participant.id, { notes })}
                    placeholder={gb("participantNotesPlaceholder")}
                    placeholderTextColor="#9ca3af"
                    multiline
                  />
                  {/* Add another participant inline after the last row */}
                  {isLast && (() => {
                    const cap = Number(createForm.maxParticipants) || 200;
                    const filledRows = createParticipants.filter(
                      (p) => p.name.trim() || p.phone.trim() || p.email.trim()
                    ).length;
                    const atCap = filledRows >= cap;
                    return atCap ? (
                      <View style={twStyle("mt-3 flex-row items-center justify-center rounded-xl border border-dashed border-gray-200 py-2")}>
                        <Ionicons name="lock-closed-outline" size={13} color="#9ca3af" />
                        <Text style={twStyle("ms-1 text-xs text-gray-400")}>
                          {gb("capacityReachedHint", { cap })}
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={addCreateParticipantRow}
                        style={twStyle(
                          "mt-3 flex-row items-center justify-center rounded-xl border border-dashed border-purple-200 py-2"
                        )}
                        accessibilityRole="button"
                        accessibilityLabel={gb("addAnotherParticipantA11y")}
                      >
                        <Ionicons name="add" size={14} color="#7c3aed" />
                        <Text style={twStyle("ms-1 text-xs font-semibold text-purple-700")}>
                          {gb("addAnotherParticipant")}
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              );
            })}
          </View>
        </ScrollView>
        ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {createReviewError ? (
            <View style={twStyle("mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-red-800")}>{createReviewError}</Text>
            </View>
          ) : null}
          {(() => {
            const svc = createForm.serviceId
              ? services.find((s) => s.id === createForm.serviceId)
              : undefined;
            const staff = createForm.staffId
              ? teamMembers.find((s: any) => s.id === createForm.staffId)
              : null;
            const loc =
              createForm.locationType === "at_salon" && createForm.locationId
                ? locations.find((l) => l.id === createForm.locationId)
                : null;
            const travelFee = Math.max(0, Number(createForm.travelFee || 0) || 0);
            const productsTotal = createProducts.reduce(
              (sum, p) => sum + (Number(p.unitPrice) || 0) * Math.max(1, Number(p.quantity) || 1),
              0
            );
            const participantsList = createParticipants.filter(
              (p) => p.name.trim() || p.phone.trim() || p.email.trim()
            );
            const participantLines = participantsList.map((p) =>
              getParticipantLine(
                { serviceId: p.serviceId, addOnIds: p.addOnIds },
                createForm.serviceId,
                services
              )
            );
            const participantTotal = participantLines.reduce((sum, line) => sum + line.price, 0);
            const sessionTotal =
              participantTotal +
              productsTotal +
              (createForm.locationType === "at_home" ? travelFee : 0);
            return (
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                <Text
                  style={twStyle("mb-3 text-xs font-bold uppercase tracking-wider text-gray-500")}
                >
                  {gb("session")}
                </Text>
                <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                  <Text style={twStyle("text-sm text-gray-600")}>{gb("date")}</Text>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                    {createForm.date} · {createForm.time}
                  </Text>
                </View>
                {svc ? (
                  <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                    <Text style={twStyle("text-sm text-gray-600")}>{gb("serviceFallback")}</Text>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                      {sl(svc)}
                    </Text>
                  </View>
                ) : null}
                {staff ? (
                  <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                    <Text style={twStyle("text-sm text-gray-600")}>{gb("staff")}</Text>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                      {staff.name || gb("staffFallback")}
                    </Text>
                  </View>
                ) : null}
                <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                  <Text style={twStyle("text-sm text-gray-600")}>{gb("location")}</Text>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                    {createForm.locationType === "at_home"
                      ? createForm.addressLine1 || gb("clientAddress")
                      : loc?.name || gb("salon")}
                  </Text>
                </View>

                {/* Capacity summary row */}
                {(() => {
                  const cap = Number(createForm.maxParticipants) || 10;
                  const count = participantsList.length;
                  const remaining = cap - count;
                  return (
                    <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                      <Text style={twStyle("text-sm text-gray-600")}>{gb("capacity")}</Text>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                        {gb("capacityOf", { count, cap })}{remaining > 0 ? gb("spotsOpen", { count: remaining }) : ` ${gb("fullDot")}`}
                      </Text>
                    </View>
                  );
                })()}

                <Text
                  style={twStyle(
                    "mt-4 mb-2 text-xs font-bold uppercase tracking-wider text-gray-500"
                  )}
                >
                  {gb("participantsCountHeader", { count: participantsList.length })}
                </Text>
                {participantsList.map((p, idx) => {
                  const line = participantLines[idx];
                  return (
                    <View key={p.id} style={twStyle("mb-2 flex-row items-start justify-between")}>
                      <View style={{ flex: 1, paddingEnd: 8 }}>
                        <Text style={twStyle("text-sm font-medium text-gray-900")}>
                          {p.name || "—"}
                          {idx === 0 ? gb("primarySuffix") : ""}
                        </Text>
                        <Text style={twStyle("text-xs text-gray-500")}>
                          {line.service ? sl(line.service) : gb("serviceTbd")}
                          {line.addOns.length > 0
                            ? gb("addOnCount", { count: line.addOns.length })
                            : ""}
                        </Text>
                        {p.notes?.trim() ? (
                          <Text style={twStyle("mt-0.5 text-xs text-gray-600")} numberOfLines={2}>
                            {gb("notePrefix", { notes: p.notes.trim() })}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                        {formatCurrency(line.price)}
                      </Text>
                    </View>
                  );
                })}

                {createProducts.length > 0 ? (
                  <>
                    <Text
                      style={twStyle(
                        "mt-4 mb-2 text-xs font-bold uppercase tracking-wider text-gray-500"
                      )}
                    >
                      {gb("products")}
                    </Text>
                    {createProducts.map((p, idx) => (
                      <View
                        key={`${p.productId}-${idx}`}
                        style={twStyle("mb-1 flex-row items-center justify-between")}
                      >
                        <Text style={twStyle("flex-1 text-sm text-gray-700")} numberOfLines={1}>
                          {p.productVariantName
                            ? gb("productReviewLineVariant", {
                                name: p.productName,
                                variant: p.productVariantName,
                                qty: p.quantity,
                              })
                            : gb("productReviewLine", { name: p.productName, qty: p.quantity })}
                        </Text>
                        <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                          {formatCurrency(
                            (Number(p.unitPrice) || 0) * Math.max(1, Number(p.quantity) || 1)
                          )}
                        </Text>
                      </View>
                    ))}
                  </>
                ) : null}

                {createForm.locationType === "at_home" && travelFee > 0 ? (
                  <View style={twStyle("mt-3 flex-row items-center justify-between")}>
                    <Text style={twStyle("text-sm text-gray-600")}>{gb("travelFee")}</Text>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                      {formatCurrency(travelFee)}
                    </Text>
                  </View>
                ) : null}

                <View
                  style={twStyle(
                    "mt-4 border-t border-gray-100 pt-3 flex-row items-center justify-between"
                  )}
                >
                  <Text style={twStyle("text-base font-bold text-gray-900")}>{gb("statTotal")}</Text>
                  <Text style={twStyle("text-base font-extrabold text-gray-900")}>
                    {formatCurrency(sessionTotal)}
                  </Text>
                </View>
              </View>
            );
          })()}

          {/* Payment method selection — mirrors single-booking options. */}
          <View style={twStyle("mt-4 rounded-2xl border border-gray-100 bg-white p-4")}>
            <Text style={twStyle("mb-3 text-xs font-bold uppercase tracking-wider text-gray-500")}>
              {gb("payment")}
            </Text>
            <View style={twStyle("flex-row flex-wrap")}>
              {(
                [
                  { value: "pay_later", label: gb("payLater"), icon: "time-outline" as const },
                  { value: "cash", label: gb("cash"), icon: "cash-outline" as const },
                  ...(manualCardEnabled
                    ? [{ value: "card" as const, label: manualCardCollectOptionLabel(), icon: "card-outline" as const }]
                    : []),
                  yocoEnabled
                    ? { value: "yoco_pos", label: gb("yocoRecorded"), icon: "phone-portrait-outline" as const }
                    : null,
                  paymentLinkEnabled
                    ? { value: "payment_link", label: gb("paymentLink"), icon: "send-outline" as const }
                    : null,
                  paystackTerminalEnabled
                    ? { value: "paystack_terminal", label: gb("paystackTerminal"), icon: "qr-code-outline" as const }
                    : null,
                  canProcessPayments && paycloudEnabled && paycloudCollectEnabled
                    ? { value: "paycloud_terminal", label: gb("cardMachine"), icon: "card-outline" as const }
                    : null,
                ].filter(Boolean) as { value: "pay_later" | "cash" | "card" | "yoco_pos" | "payment_link" | "paystack_terminal" | "paycloud_terminal"; label: string; icon: string }[]
              ).map((m) => {
                const active = createPaymentMethod === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    onPress={() => setCreatePaymentMethod(m.value)}
                    style={twStyle(
                      `mb-2 me-2 flex-row items-center rounded-full border px-3 py-2 ${active ? "border-pink-500 bg-pink-50" : "border-gray-200 bg-white"}`
                    )}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={m.icon as keyof typeof Ionicons.glyphMap} size={16} color={active ? "#db2777" : "#475569"} />
                    <Text
                      style={twStyle(
                        `ms-2 text-sm font-medium ${active ? "text-pink-700" : "text-gray-700"}`
                      )}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {paycloudEnabled && !paycloudCollectEnabled && canProcessPayments ? (
              <View style={twStyle("mt-2")}>
                <PaycloudCollectSetupAffordance blocker={paycloudPrimaryBlocker} compact loading={paycloudLoading} />
              </View>
            ) : null}
            {createPaymentMethod === "payment_link" ? (
              <Text style={twStyle("mt-2 text-xs text-gray-500")}>
                {gb("paymentLinkHint")}
              </Text>
            ) : createPaymentMethod === "paystack_terminal" ? (
              <Text style={twStyle("mt-2 text-xs text-gray-500")}>
                {gb("paystackCreateHint")}
              </Text>
            ) : createPaymentMethod === "paycloud_terminal" ? (
              <Text style={twStyle("mt-2 text-xs text-gray-500")}>
                {gb("paycloudCreateHint")}
              </Text>
            ) : createPaymentMethod !== "pay_later" ? (
              <Text style={twStyle("mt-2 text-xs text-gray-500")}>
                {gb("markedPaidImmediately")}
              </Text>
            ) : null}
          </View>

          {/* Notification toggle for participants. */}
          <TouchableOpacity
            onPress={() => setCreateSendNotification((v) => !v)}
            style={twStyle(
              "mt-4 flex-row items-start rounded-2xl border border-gray-100 bg-white p-4"
            )}
            activeOpacity={0.8}
          >
            <Ionicons
              name={createSendNotification ? "checkbox" : "square-outline"}
              size={22}
              color={createSendNotification ? "#db2777" : "#94a3b8"}
            />
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                {gb("notifyParticipants")}
              </Text>
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                {gb("notifyParticipantsHint")}
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
        )}
      </BottomSheet>

      <AddressMapPinModal
        visible={createMapPinOpen}
        onClose={() => setCreateMapPinOpen(false)}
        onPickCoordinates={(lat, lng, resolved) => {
          handleCreateDropPin(lat, lng, resolved);
        }}
        initialCoordinate={
          createForm.addressLatitude != null && createForm.addressLongitude != null
            ? { latitude: createForm.addressLatitude, longitude: createForm.addressLongitude }
            : null
        }
      />

      <BottomSheet
        visible={showProductPicker}
        onClose={finishProductPicker}
        title={gb("addProduct")}
      >
        {productsList.length === 0 ? (
          <EmptyState
            icon="bag-outline"
            title={gb("noProducts")}
            description={gb("noProductsHint")}
          />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
            {productsList.map((product) => {
              if (product.variants && product.variants.length > 0) {
                return (
                  <View key={product.id}>
                    <Text
                      style={twStyle(
                        "px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
                      )}
                    >
                      {product.name}
                    </Text>
                    {product.variants.map((variant) => {
                      const alreadyAdded = createProducts.some(
                        (p) => p.productId === product.id && p.productVariantId === variant.id
                      );
                      return (
                        <TouchableOpacity
                          key={variant.id}
                          onPress={() => {
                            if (!alreadyAdded) {
                              setCreateProducts((prev) => [
                                ...prev,
                                {
                                  productId: product.id,
                                  productName: product.name,
                                  productVariantId: variant.id,
                                  productVariantName: variant.name,
                                  quantity: 1,
                                  unitPrice: variant.price,
                                },
                              ]);
                            }
                            finishProductPicker();
                          }}
                          style={twStyle(
                            `flex-row items-center justify-between border-b border-gray-100 px-4 py-3 ${alreadyAdded ? "bg-indigo-50" : ""}`
                          )}
                          accessibilityRole="button"
                        >
                          <Text style={twStyle("flex-1 text-sm text-gray-900")} numberOfLines={1}>
                            {variant.name}
                          </Text>
                          <Text style={twStyle("ms-3 text-sm font-medium text-gray-700")}>
                            {formatCurrency(variant.price)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              }
              const alreadyAdded = createProducts.some(
                (p) => p.productId === product.id && !p.productVariantId
              );
              return (
                <TouchableOpacity
                  key={product.id}
                  onPress={() => {
                    if (!alreadyAdded) {
                      setCreateProducts((prev) => [
                        ...prev,
                        {
                          productId: product.id,
                          productName: product.name,
                          quantity: 1,
                          unitPrice: product.price,
                        },
                      ]);
                    }
                    finishProductPicker();
                  }}
                  style={twStyle(
                    `flex-row items-center justify-between border-b border-gray-100 px-4 py-3 ${alreadyAdded ? "bg-indigo-50" : ""}`
                  )}
                  accessibilityRole="button"
                >
                  <Text style={twStyle("flex-1 text-sm text-gray-900")} numberOfLines={1}>
                    {product.name}
                  </Text>
                  <Text style={twStyle("ms-3 text-sm font-medium text-gray-700")}>
                    {formatCurrency(product.price)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </BottomSheet>

      {/* §Provider-audit 2026-04 (packages round 3 — mobile parity):
          dedicated picker sheet, opened from the create sheet's "Package"
          row. Closes itself on select so the provider lands back on the
          create sheet with the attached package visible. */}
      <BottomSheet
        visible={showPackagePicker}
        onClose={() => setShowPackagePicker(false)}
        title={gb("choosePackage")}
      >
        {packagesList.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title={gb("noPackagesYet")}
            description={gb("noPackagesHint")}
          />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 480 }}
          >
            {createForm.packageId ? (
              <TouchableOpacity
                onPress={() => {
                  applyPackageToCreateForm(null);
                  setShowPackagePicker(false);
                }}
                activeOpacity={0.7}
                style={twStyle(
                  "mb-2 flex-row items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3"
                )}
                accessibilityRole="button"
              >
                <View style={twStyle("flex-row items-center")}>
                  <Ionicons
                    name="close-circle-outline"
                    size={16}
                    color="#dc2626"
                    style={{ marginEnd: 8 }}
                  />
                  <Text style={twStyle("text-sm font-medium text-red-700")}>
                    {gb("detachCurrentPackage")}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {packagesList.map((pkg) => {
              const isSelected = createForm.packageId === pkg.id;
              const serviceCount = (pkg.items ?? []).filter(
                (it) => !!it.offering_id || !!it.offering?.id
              ).length;
              const productCount = (pkg.items ?? []).filter(
                (it) => !!it.product_id || !!it.product?.id
              ).length;
              const priceNum = typeof pkg.price === "number" ? pkg.price : null;
              const discount =
                typeof pkg.discount_percentage === "number" && pkg.discount_percentage > 0
                  ? pkg.discount_percentage
                  : null;

              return (
                <TouchableOpacity
                  key={pkg.id}
                  onPress={() => {
                    applyPackageToCreateForm(pkg);
                    setShowPackagePicker(false);
                  }}
                  activeOpacity={0.7}
                  style={twStyle(
                    `mb-2 rounded-xl border px-4 py-3 ${
                      isSelected ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-white"
                    }`
                  )}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={twStyle("flex-row items-start justify-between")}>
                    <View style={twStyle("flex-1")}>
                      <Text
                        style={twStyle("text-sm font-semibold text-gray-900")}
                        numberOfLines={1}
                      >
                        {pkg.name}
                      </Text>
                      {pkg.description ? (
                        <Text style={twStyle("mt-0.5 text-xs text-gray-500")} numberOfLines={2}>
                          {pkg.description}
                        </Text>
                      ) : null}
                      <View style={twStyle("mt-1.5 flex-row items-center")}>
                        {serviceCount > 0 ? (
                          <Text style={[twStyle("text-[11px] text-gray-500"), { marginEnd: 10 }]}>
                            {gb("serviceCount", { count: serviceCount })}
                          </Text>
                        ) : null}
                        {productCount > 0 ? (
                          <Text style={[twStyle("text-[11px] text-gray-500"), { marginEnd: 10 }]}>
                            {gb("productCount", { count: productCount })}
                          </Text>
                        ) : null}
                        {discount != null ? (
                          <View style={twStyle("rounded-full bg-green-50 px-1.5 py-0.5")}>
                            <Text style={twStyle("text-[10px] font-medium text-green-700")}>
                              {gb("discountPercent", { discount })}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={[twStyle("items-end"), { marginStart: 12 }]}>
                      {priceNum != null ? (
                        <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                          {formatCurrency(priceNum)}
                        </Text>
                      ) : null}
                      {isSelected ? (
                        <View style={twStyle("mt-1")}>
                          <Ionicons name="checkmark-circle" size={16} color="#4338ca" />
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </BottomSheet>

      {/* Paystack Terminal QR sheet */}
      <BottomSheet
        visible={!!paystackTerminalSheet}
        onClose={() => setPaystackTerminalSheet(null)}
        title={gb("terminalPaymentTitle")}
      >
        {paystackTerminalSheet && (
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {paystackTerminalSheet.expectedAmount > 0 && (
              <View style={twStyle("mb-4 rounded-xl bg-green-50 border border-green-200 p-4 items-center")}>
                <Text style={twStyle("text-xs text-green-700 mb-1")}>{gb("amountDueLabel")}</Text>
                <Text style={twStyle("text-2xl font-bold text-green-800")}>
                  {formatCurrency(paystackTerminalSheet.expectedAmount)}
                </Text>
              </View>
            )}
            {paystackTerminalSheet.terminal.qr_url ? (
              <View style={twStyle("items-center mb-4")}>
                <Image
                  source={{ uri: paystackTerminalSheet.terminal.qr_url }}
                  style={{ width: 200, height: 200, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb" }}
                  resizeMode="contain"
                  accessible
                  accessibilityLabel={gb("paystackQrA11y")}
                />
              </View>
            ) : null}
            <View style={twStyle("mb-4 rounded-xl bg-gray-50 p-3")}>
              <Text style={twStyle("text-xs font-medium text-gray-700 mb-1")}>{gb("instructions")}</Text>
              <Text style={twStyle("text-xs text-gray-600")}>
                {gb("paystackInstructionsBefore")}
                <Text style={twStyle("font-semibold")}>{gb("paymentInbox")}</Text>
                {gb("paystackInstructionsAfter")}
              </Text>
            </View>
            {(paystackTerminalSheet.terminal.payment_link || paystackTerminalSheet.terminal.terminal_url) && (
              <TouchableOpacity
                style={twStyle("mb-3 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white p-3")}
                onPress={async () => {
                  const link = paystackTerminalSheet.terminal.payment_link || paystackTerminalSheet.terminal.terminal_url || "";
                  try {
                    await RNShare.share({ message: gb("payViaTerminal", { link }), url: link });
                  } catch {
                    await Linking.openURL(link);
                  }
                }}
              >
                <Ionicons name="share-outline" size={18} color="#475569" />
                <Text style={twStyle("ms-2 text-sm font-medium text-gray-700")}>{gb("sharePaymentLink")}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={twStyle("flex-row items-center justify-center rounded-xl bg-green-600 p-4")}
              onPress={() => {
                setPaystackTerminalSheet(null);
                router.push("/(app)/(tabs)/more/paystack-terminal" as any);
              }}
            >
              <Ionicons name="wallet-outline" size={18} color="#ffffff" />
              <Text style={twStyle("ms-2 text-sm font-semibold text-white")}>{gb("openPaymentInbox")}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </BottomSheet>

      <ParticipantRefundSheet
        visible={!!refundParticipant}
        participant={refundParticipant}
        groupId={selectedGroup?.id ?? ""}
        onClose={() => setRefundParticipant(null)}
        onSuccess={handleParticipantRefundSuccess}
      />

      {paycloudCollectTarget ? (
        <PayCloudPaymentSheet
          visible={showPaycloudPayment}
          onClose={() => {
            setShowPaycloudPayment(false);
            setPaycloudCollectTarget(null);
          }}
          amount={paycloudAmount}
          currency={getTenantDefaultCurrency()}
          entityType={paycloudCollectTarget.entityType}
          entityId={paycloudCollectTarget.entityId}
          bookingId={paycloudCollectTarget.bookingId}
          groupBookingId={paycloudCollectTarget.groupBookingId}
          bookingLocationId={
            paycloudCollectTarget.locationId ?? selectedGroup?.location_id ?? null
          }
          tipIncludedInAmount={Number(selectedGroup?.tip_amount ?? 0) > 0.01}
          onPaymentSuccess={async () => {
            setShowPaycloudPayment(false);
            setPaycloudCollectTarget(null);
            setPaymentRecordedNotice(gb("cardMachineReceived"));
            if (selectedGroup) {
              await openGroupDetail(selectedGroup);
            }
            await refresh();
          }}
        />
      ) : null}
    </ScreenContainer>
  );
}
