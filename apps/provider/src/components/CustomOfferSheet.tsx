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
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { ActionButton } from "@/components/ui/ActionButton";
import { useResponsive } from "@/hooks/useResponsive";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";
import { getCachedConfigBundle, getTenantDefaultCurrency } from "@/lib/config-bundle";
import { AddressAutocomplete, type ParsedAddress } from "@/components/ui/AddressAutocomplete";
import { countryFilterIso2FromStorage } from "@beautonomi/utils";

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
  const [addressSearchValue, setAddressSearchValue] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [travelFee, setTravelFee] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const tenantCurrency = getTenantDefaultCurrency();

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
    setAddressSearchValue("");
    setAddressLine1("");
    setAddressLine2("");
    setAddressCity("");
    setAddressState("");
    setAddressPostalCode("");
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
        currency: tenantCurrency,
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
        if (addressLine2.trim()) payload.address_line2 = addressLine2.trim();
        if (addressCity.trim()) payload.address_city = addressCity.trim();
        if (addressState.trim()) payload.address_state = addressState.trim();
        if (addressPostalCode.trim()) payload.address_postal_code = addressPostalCode.trim();
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
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          Service name (optional)
        </Text>
        <TextInput
          style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={serviceName}
          onChangeText={setServiceName}
          placeholder="e.g. Haircut & Styling"
          placeholderTextColor="#9ca3af"
        />

        {globalCategories.length > 0 && (
          <View style={twStyle("mb-3")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Service category (optional)</Text>
            <ChipCombobox
              singleSelect
              value={serviceCategoryId}
              onChange={setServiceCategoryId}
              staticSuggestions={globalCategories.map((cat) => ({ value: cat.id, label: cat.name }))}
              allowFreeForm={false}
              placeholder="Select category"
              accessibilityLabel="Service category"
            />
          </View>
        )}

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          Service description <Text style={twStyle("text-red-500")}>*</Text>
        </Text>
        <TextInput
          style={twStyle("mb-3 min-h-[100px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the service (10–4000 characters)"
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />
        <Text style={twStyle("mb-1 text-xs text-gray-500")}>
          {description.trim().length} / 10–4000 characters
        </Text>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          Price ({tenantCurrency}) <Text style={twStyle("text-red-500")}>*</Text>
        </Text>
        <TextInput
          style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#9ca3af"
        />

        <View style={twStyle("mb-3 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Duration (min)</Text>
            <TextInput
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={duration}
              onChangeText={setDuration}
              keyboardType="number-pad"
              placeholder="60"
              placeholderTextColor="#9ca3af"
            />
          </View>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Expires (days)</Text>
            <TextInput
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={expirationDays}
              onChangeText={setExpirationDays}
              keyboardType="number-pad"
              placeholder="7"
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Location</Text>
        <View style={twStyle("mb-3 flex-row")}>
          {LOCATION_OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setLocationType(opt.value)}
              style={[twStyle(`flex-1 items-center rounded-xl border py-2.5 ${
                locationType === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-gray-200 bg-gray-50"
              }`), i < LOCATION_OPTIONS.length - 1 ? { marginRight: 8 } : undefined]}
            >
              <Text
                style={twStyle(`text-sm font-medium ${
                  locationType === opt.value ? "text-primary" : "text-gray-600"
                }`)}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {locationType === "at_salon" && locations.length > 0 && (
          <>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Venue (optional)</Text>
            <View style={twStyle("mb-3 flex-row flex-wrap")}>
              {locations.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => setLocationId(locationId === loc.id ? null : loc.id)}
                  style={[twStyle(`rounded-xl border px-3 py-2 ${
                    locationId === loc.id ? "border-primary bg-primary/10" : "border-gray-200 bg-gray-50"
                  }`), { marginRight: 8, marginBottom: 8 }]}
                >
                  <Text style={twStyle(`text-sm ${locationId === loc.id ? "text-primary font-medium" : "text-gray-600"}`)}>
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {staffList.length > 0 && (
          <>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Assigned staff (optional)</Text>
            <View style={twStyle("mb-3 flex-row flex-wrap")}>
              {staffList.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setStaffId(staffId === s.id ? null : s.id)}
                  style={[twStyle(`rounded-xl border px-3 py-2 ${
                    staffId === s.id ? "border-primary bg-primary/10" : "border-gray-200 bg-gray-50"
                  }`), { marginRight: 8, marginBottom: 8 }]}
                >
                  <Text style={twStyle(`text-sm ${staffId === s.id ? "text-primary font-medium" : "text-gray-600"}`)}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Appointment date & time</Text>
        <View style={twStyle("mb-3")}>
          <DateTimePicker
            value={scheduledAt}
            mode="datetime"
            minimumDate={new Date()}
            onChange={(_: any, d?: Date) => d && setScheduledAt(d)}
            display={Platform.OS === "ios" ? "spinner" : "default"}
          />
        </View>

        {locationType === "at_home" && (
          <>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Address (for at home)</Text>
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>
              Search for the client&apos;s address, then edit lines below if needed.
            </Text>
            <AddressAutocomplete
              label="Search address"
              value={addressSearchValue}
              countryCode={countryFilterIso2FromStorage(addressCountry) ?? "ZA"}
              defaultCountryName={
                addressCountry.trim() ||
                getCachedConfigBundle()?.meta?.tenant_region?.name?.trim() ||
                undefined
              }
              placeholder="Start typing street or area…"
              onSelect={(addr: ParsedAddress) => {
                setAddressSearchValue(addr.full_address);
                setAddressLine1(addr.address_line1);
                setAddressCity(addr.city);
                setAddressState(addr.state);
                setAddressPostalCode(addr.postal_code);
                setAddressCountry(addr.country);
              }}
              onBlur={(q) => {
                if (!addressLine1.trim() && q.trim()) setAddressLine1(q.trim());
              }}
            />
            <Text style={twStyle("mb-1 mt-3 text-xs font-medium text-gray-600")}>Street line</Text>
            <TextInput
              style={twStyle("mb-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="Street address"
              placeholderTextColor="#9ca3af"
            />
            <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>Unit / suite (optional)</Text>
            <TextInput
              style={twStyle("mb-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={addressLine2}
              onChangeText={setAddressLine2}
              placeholder="Apartment, estate gate, etc."
              placeholderTextColor="#9ca3af"
            />
            <View style={twStyle("mb-2 flex-row")}>
              <TextInput
                style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"), { marginRight: 8 }]}
                value={addressCity}
                onChangeText={setAddressCity}
                placeholder="City"
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                style={twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={addressCountry}
                onChangeText={setAddressCountry}
                placeholder="Country"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("mb-2 flex-row")}>
              <TextInput
                style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"), { marginRight: 8 }]}
                value={addressState}
                onChangeText={setAddressState}
                placeholder="Province / state"
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                style={twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={addressPostalCode}
                onChangeText={setAddressPostalCode}
                placeholder="Postal code"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Travel fee (optional, {tenantCurrency})</Text>
            <TextInput
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={travelFee}
              onChangeText={setTravelFee}
              keyboardType="decimal-pad"
              placeholder="e.g. 50"
              placeholderTextColor="#9ca3af"
            />
            <Text style={twStyle("mb-3 text-xs text-gray-500")}>Add a travel fee for this house call. Leave empty for no fee.</Text>
          </>
        )}

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Notes (optional)</Text>
        <TextInput
          style={twStyle("mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
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
