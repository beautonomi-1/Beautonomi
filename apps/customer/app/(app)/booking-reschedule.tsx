import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { getTenantLocaleTag } from "@/lib/locale";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";

type RescheduleBooking = {
  id: string;
  scheduled_at?: string;
  location_id?: string | null;
  provider?: { slug?: string; timezone?: string | null };
  services?: Array<{ offering_id?: string; staff_id?: string | null }>;
};

type AvailabilitySlot = { start: string; end?: string; is_available?: boolean };

const DAYS_AHEAD = 14;

function ymdInTimeZone(date: Date, timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function formatDayLabel(date: Date, timeZone?: string | null): string {
  return date.toLocaleDateString(getTenantLocaleTag(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(timeZone ? { timeZone } : {}),
  });
}

function formatSlotTime(value: string, timeZone?: string | null): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString(getTenantLocaleTag(), {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

export default function BookingRescheduleScreen() {
  const { t } = useTranslation();
  const br = useCallback(
    (key: string) => t(`customer.mobile.screens.bookingReschedule.${key}`) as string,
    [t],
  );
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const bookingId = String(id ?? "");
  const [booking, setBooking] = useState<RescheduleBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const timeZone = booking?.provider?.timezone ?? null;

  const days = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [];
    const now = Date.now();
    for (let i = 0; i < DAYS_AHEAD; i += 1) {
      const d = new Date(now + i * 24 * 60 * 60 * 1000);
      out.push({ key: ymdInTimeZone(d, timeZone), label: formatDayLabel(d, timeZone) });
    }
    return out;
  }, [timeZone]);

  useEffect(() => {
    if (!bookingId) return;
    void (async () => {
      try {
        const res = await api.get<RescheduleBooking | { booking?: RescheduleBooking }>(
          `/api/me/bookings/${bookingId}`,
        );
        if (res.error) {
          setLoadError(getApiErrorMessage(res.error));
          return;
        }
        const raw = res.data as RescheduleBooking & { booking?: RescheduleBooking };
        setBooking(raw?.booking ?? raw ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId]);

  useEffect(() => {
    if (!selectedDay && days.length > 0) setSelectedDay(days[0].key);
  }, [days, selectedDay]);

  useEffect(() => {
    const slug = booking?.provider?.slug;
    const services = booking?.services ?? [];
    if (!slug || !selectedDay || services.length === 0) return;
    const offeringIds = services.map((s) => s.offering_id).filter(Boolean) as string[];
    const staffId = services.find((s) => s.staff_id)?.staff_id ?? null;
    const params = new URLSearchParams({ date: selectedDay, exclude_booking_id: booking!.id });
    if (offeringIds.length > 0) {
      params.set("service_ids", offeringIds.join(","));
      params.set("service_id", offeringIds[0]);
    }
    if (staffId) params.set("staff_id", staffId);
    if (booking?.location_id) params.set("location_id", booking.location_id);

    let cancelled = false;
    setLoadingSlots(true);
    setSlotError(null);
    setSelectedSlot(null);
    void (async () => {
      try {
        const res = await api.get<{ slots?: AvailabilitySlot[] }>(
          `/api/public/providers/${encodeURIComponent(slug)}/availability?${params}`,
        );
        if (cancelled) return;
        if (res.error) {
          setSlotError(getApiErrorMessage(res.error));
          setSlots([]);
          return;
        }
        const list = (res.data as { slots?: AvailabilitySlot[] } | null)?.slots ?? [];
        setSlots(list.filter((s) => s.is_available !== false));
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booking, selectedDay]);

  const submit = useCallback(async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/api/me/bookings/${bookingId}/reschedule`, {
        new_datetime: new Date(selectedSlot).toISOString(),
        reason: "Customer request",
      });
      if (res.error) {
        Alert.alert(br("failedTitle"), getApiErrorMessage(res.error));
        return;
      }
      router.replace({ pathname: "/(app)/booking-detail", params: { id: bookingId } });
    } finally {
      setSubmitting(false);
    }
  }, [bookingId, selectedSlot, router, br]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (loadError || !booking) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <Text style={{ textAlign: "center", color: Colors.gray[600] }}>
          {loadError ?? br("failedTitle")}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", marginBottom: 8 }}>{br("title")}</Text>
        <Text style={{ color: Colors.gray[600], marginBottom: 16 }}>{br("body")}</Text>

        <Text style={{ fontWeight: "600", marginBottom: 8 }}>{br("dateLabel")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {days.map((d) => {
            const active = d.key === selectedDay;
            return (
              <TouchableOpacity
                key={d.key}
                onPress={() => setSelectedDay(d.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  marginEnd: 8,
                  borderWidth: 1,
                  borderColor: active ? Colors.primary : Colors.gray[200],
                  backgroundColor: active ? Colors.primary : Colors.white,
                }}
              >
                <Text style={{ color: active ? Colors.white : Colors.gray[800], fontWeight: "600" }}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={{ fontWeight: "600", marginBottom: 8 }}>{br("timeLabel")}</Text>
        {loadingSlots ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
        ) : slotError ? (
          <Text style={{ color: Colors.gray[600], marginBottom: 16 }}>{slotError}</Text>
        ) : slots.length === 0 ? (
          <Text style={{ color: Colors.gray[600], marginBottom: 16 }}>{br("noSlots")}</Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
            {slots.map((slot) => {
              const active = slot.start === selectedSlot;
              return (
                <TouchableOpacity
                  key={slot.start}
                  onPress={() => setSelectedSlot(slot.start)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    marginEnd: 8,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: active ? Colors.primary : Colors.gray[200],
                    backgroundColor: active ? Colors.primary : Colors.white,
                  }}
                >
                  <Text style={{ color: active ? Colors.white : Colors.gray[800], fontWeight: "600" }}>
                    {formatSlotTime(slot.start, timeZone)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          onPress={() => void submit()}
          disabled={submitting || !selectedSlot}
          style={{
            backgroundColor: Colors.primary,
            padding: 14,
            borderRadius: 12,
            opacity: submitting || !selectedSlot ? 0.5 : 1,
          }}
        >
          <Text style={{ color: Colors.white, textAlign: "center", fontWeight: "700" }}>
            {submitting ? "…" : br("submit")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
