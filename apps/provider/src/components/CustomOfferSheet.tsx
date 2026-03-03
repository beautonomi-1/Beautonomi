/**
 * Bottom sheet to create and send a custom offer to a customer.
 * Aligned with API: service_name, service_category_id, location_type (at_salon/at_home),
 * address for at_home, description, price, duration, expiration, location_id, staff_id, scheduled_at.
 */
import { useState, useCallback, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { useResponsive } from "@/hooks/useResponsive";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";

export interface CustomOfferSheetProps {
  visible: boolean;
  onClose: () => void;
  customerId: string;
  customerName?: string | null;
  onSuccess?: () => void;
}

const LOCATION_OPTIONS: { value: "at_salon" | "at_home"; label: string }[] = [
  { value: "at_salon", label: "At salon" },
  { value: "at_home", label: "At home" },
];

interface GlobalCategory {
  id: string;
  name: string;
  slug?: string;
}

export function CustomOfferSheet({
  visible,
  onClose,
  customerId,
  customerName,
  onSuccess,
}: CustomOfferSheetProps) {
  const { isTablet } = useResponsive();
  const { data: categoriesData } = useApi<{ global_categories?: GlobalCategory[] }>("/api/provider/categories", { enabled: visible });
  const globalCategories = categoriesData?.global_categories ?? [];
  const { data: locationsData } = useApi<{ id: string; name: string }[]>("/api/provider/locations", { enabled: visible });
  const { data: teamData } = useApi<{ id: string; name: string }[]>("/api/provider/team", { enabled: visible });
  const locations = locationsData ?? [];
  const staffList = Array.isArray(teamData) ? teamData : [];

  const [serviceName, setServiceName] = useState("");
  const [serviceCategoryId, setServiceCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [expirationDays, setExpirationDays] = useState("7");
  const [notes, setNotes] = useState("");
  const [locationType, setLocationType] = useState<"at_salon" | "at_home">("at_salon");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<Date>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  });
  const [addressLine1, setAddressLine1] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [travelFee, setTravelFee] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setServiceName("");
    setServiceCategoryId(null);
    setDescription("");
    setPrice("");
    setDuration("60");
    setExpirationDays("7");
    setNotes("");
    setLocationType("at_salon");
    setLocationId(null);
    setStaffId(null);
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    setScheduledAt(d);
    setAddressLine1("");
    setAddressCity("");
    setAddressCountry("");
    setTravelFee("");
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  // Reset form every time the sheet is opened so the modal is fresh
  useEffect(() => {
    if (visible) {
      resetForm();
    }
  }, [visible, resetForm]);

  const isValid =
    description.trim().length >= 10 &&
    description.trim().length <= 4000 &&
    price !== "" &&
    Number(price) >= 0 &&
    Number(duration) >= 15 &&
    Number(duration) <= 480 &&
    Number(expirationDays) >= 1;

  const handleSubmit = async () => {
    if (!isValid || !customerId) return;
    setSubmitting(true);
    try {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + Number(expirationDays));
      const payload: Record<string, unknown> = {
        customer_id: customerId,
        description: description.trim(),
        price: Number(price),
        currency: "ZAR",
        duration_minutes: Number(duration),
        expiration_at: expDate.toISOString(),
        notes: notes.trim() || null,
        location_type: locationType,
      };
      if (serviceName.trim()) payload.service_name = serviceName.trim();
      if (serviceCategoryId) payload.service_category_id = serviceCategoryId;
      if (locationType === "at_salon" && locationId) payload.location_id = locationId;
      if (staffId) payload.staff_id = staffId;
      payload.scheduled_at = scheduledAt.toISOString();
      if (locationType === "at_home") {
        if (addressLine1.trim()) payload.address_line1 = addressLine1.trim();
        if (addressCity.trim()) payload.address_city = addressCity.trim();
        if (addressCountry.trim()) payload.address_country = addressCountry.trim();
        const fee = Number(travelFee);
        if (!Number.isNaN(fee) && fee >= 0) payload.travel_fee = fee;
      }
      const res = await api.post("/api/provider/custom-offers/create", payload);
      if ((res as { error?: { message?: string } }).error) {
        const msg = (res as { error: { message?: string } }).error.message ?? "Failed to send custom offer";
        Alert.alert("Error", msg);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess?.();
      resetForm();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to send custom offer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      key={visible ? "open" : "closed"}
      visible={visible}
      onClose={handleClose}
      title="Send custom offer"
      subtitle={customerName ? `To ${customerName}` : "To customer"}
      snapHeight={isTablet ? "full" : "auto"}
      showHandle={true}
    >
      <View style={isTablet ? { maxWidth: 480, alignSelf: "center", width: "100%" } : undefined}>
        <Text className="mb-1 text-sm font-medium text-gray-700">
          Service name (optional)
        </Text>
        <TextInput
          className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          value={serviceName}
          onChangeText={setServiceName}
          placeholder="e.g. Haircut & Styling"
          placeholderTextColor="#9ca3af"
        />

        {globalCategories.length > 0 && (
          <>
            <Text className="mb-1 text-sm font-medium text-gray-700">Service category (optional)</Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {globalCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setServiceCategoryId(serviceCategoryId === cat.id ? null : cat.id)}
                  className={`rounded-xl border px-3 py-2 ${
                    serviceCategoryId === cat.id ? "border-primary bg-primary/10" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <Text className={`text-sm ${serviceCategoryId === cat.id ? "text-primary font-medium" : "text-gray-600"}`}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text className="mb-1 text-sm font-medium text-gray-700">
          Service description <Text className="text-red-500">*</Text>
        </Text>
        <TextInput
          className="mb-3 min-h-[100px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the service (10–4000 characters)"
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />
        <Text className="mb-1 text-xs text-gray-500">
          {description.trim().length} / 10–4000 characters
        </Text>

        <Text className="mb-1 text-sm font-medium text-gray-700">
          Price (ZAR) <Text className="text-red-500">*</Text>
        </Text>
        <TextInput
          className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#9ca3af"
        />

        <View className="mb-3 flex-row gap-3">
          <View className="flex-1">
            <Text className="mb-1 text-sm font-medium text-gray-700">Duration (min)</Text>
            <TextInput
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
              value={duration}
              onChangeText={setDuration}
              keyboardType="number-pad"
              placeholder="60"
              placeholderTextColor="#9ca3af"
            />
          </View>
          <View className="flex-1">
            <Text className="mb-1 text-sm font-medium text-gray-700">Expires (days)</Text>
            <TextInput
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
              value={expirationDays}
              onChangeText={setExpirationDays}
              keyboardType="number-pad"
              placeholder="7"
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        <Text className="mb-2 text-sm font-medium text-gray-700">Location</Text>
        <View className="mb-3 flex-row gap-2">
          {LOCATION_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setLocationType(opt.value)}
              className={`flex-1 items-center rounded-xl border py-2.5 ${
                locationType === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  locationType === opt.value ? "text-primary" : "text-gray-600"
                }`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {locationType === "at_salon" && locations.length > 0 && (
          <>
            <Text className="mb-1 text-sm font-medium text-gray-700">Venue (optional)</Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {locations.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => setLocationId(locationId === loc.id ? null : loc.id)}
                  className={`rounded-xl border px-3 py-2 ${
                    locationId === loc.id ? "border-primary bg-primary/10" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <Text className={`text-sm ${locationId === loc.id ? "text-primary font-medium" : "text-gray-600"}`}>
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {staffList.length > 0 && (
          <>
            <Text className="mb-1 text-sm font-medium text-gray-700">Assigned staff (optional)</Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {staffList.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setStaffId(staffId === s.id ? null : s.id)}
                  className={`rounded-xl border px-3 py-2 ${
                    staffId === s.id ? "border-primary bg-primary/10" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <Text className={`text-sm ${staffId === s.id ? "text-primary font-medium" : "text-gray-600"}`}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text className="mb-1 text-sm font-medium text-gray-700">Appointment date & time</Text>
        <View className="mb-3">
          <DateTimePicker
            value={scheduledAt}
            mode="datetime"
            minimumDate={new Date()}
            onChange={(_, d) => d && setScheduledAt(d)}
            display={Platform.OS === "ios" ? "spinner" : "default"}
          />
        </View>

        {locationType === "at_home" && (
          <>
            <Text className="mb-1 text-sm font-medium text-gray-700">Address (for at home)</Text>
            <TextInput
              className="mb-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="Street address"
              placeholderTextColor="#9ca3af"
            />
            <View className="mb-2 flex-row gap-2">
              <TextInput
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={addressCity}
                onChangeText={setAddressCity}
                placeholder="City"
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={addressCountry}
                onChangeText={setAddressCountry}
                placeholder="Country"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <Text className="mb-1 text-sm font-medium text-gray-700">Travel fee (optional, ZAR)</Text>
            <TextInput
              className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
              value={travelFee}
              onChangeText={setTravelFee}
              keyboardType="decimal-pad"
              placeholder="e.g. 50"
              placeholderTextColor="#9ca3af"
            />
            <Text className="mb-3 text-xs text-gray-500">Add a travel fee for this house call. Leave empty for no fee.</Text>
          </>
        )}

        <Text className="mb-1 text-sm font-medium text-gray-700">Notes (optional)</Text>
        <TextInput
          className="mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          value={notes}
          onChangeText={setNotes}
          placeholder="Additional details..."
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />

        <ActionButton
          label="Send offer"
          onPress={handleSubmit}
          loading={submitting}
          fullWidth
          disabled={!isValid}
        />
      </View>
    </BottomSheet>
  );
}
