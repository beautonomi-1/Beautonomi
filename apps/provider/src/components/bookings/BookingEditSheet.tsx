import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { useApi } from "@/hooks/useApi";
import { formatCurrency, formatDuration } from "@/lib/format";
import { normalizeProductsList } from "@/lib/unpack-provider-api";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { safeNum } from "@beautonomi/utils";
import {
  buildBookingEditPatchPayload,
  computeBookingEditLineSubtotal,
  computeBookingEditTotals,
  mapBookingDetailToEditLines,
  resolveBookingEditServiceDisplay,
  resolveBookingEditServiceLabel,
} from "@/lib/build-booking-edit-patch-payload";
import type {
  BookingEditCatalogService,
  BookingEditProductLine,
  BookingEditServiceLine,
} from "@/lib/booking-edit-types";

type StaffMember = { id: string; name: string };

type CatalogProduct = {
  id: string;
  name: string;
  price: number;
  currency: string;
  quantity?: number | null;
  track_stock_quantity?: boolean | null;
  variants?: { id: string; name: string; price: number; quantity?: number | null }[];
};

type CatalogProductVariant = NonNullable<CatalogProduct["variants"]>[number];

export type BookingEditSheetBooking = {
  scheduled_at?: string | null;
  special_requests?: string | null;
  discount_amount?: number;
  discount_reason?: string | null;
  promotion_discount_amount?: number;
  membership_discount_amount?: number;
  loyalty_discount_amount?: number;
  tax_rate?: number;
  travel_fee?: number;
  tip_amount?: number;
  service_fee_amount?: number;
  location_id?: string | null;
  version?: number;
  services?: Array<{
    offering_id?: string;
    service_id?: string;
    staff_id?: string | null;
    offering_name?: string;
    price?: number;
    duration_minutes?: number;
  }>;
  products?: Array<{
    product_id?: string;
    product_name?: string;
    product_variant_id?: string | null;
    product_variant?: { option_values?: unknown } | null;
    quantity?: number;
    unit_price?: number;
  }>;
};

type Props = {
  visible: boolean;
  booking: BookingEditSheetBooking;
  onClose: () => void;
  onSave: (payload: ReturnType<typeof buildBookingEditPatchPayload>) => Promise<{ error?: string; errorCode?: string }>;
};

export function BookingEditSheet({ visible, booking, onClose, onSave }: Props) {
  const locationId = booking.location_id ?? null;
  const servicesUrl =
    "/api/provider/services?include_inactive=true&include_variants=true&include_offering_resources=false";
  const staffUrl = locationId
    ? `/api/provider/team?location_id=${encodeURIComponent(locationId)}`
    : "/api/provider/staff";
  const productsUrl = "/api/provider/products?limit=200&status=active";
  const paymentSettingsUrl = "/api/provider/settings/payments";

  const { data: servicesData, loading: servicesLoading } = useApi<BookingEditCatalogService[]>(servicesUrl, {
    enabled: visible,
  });
  const { data: staffData } = useApi<StaffMember[]>(staffUrl, { enabled: visible });
  const { data: productsData } = useApi<unknown>(productsUrl, { enabled: visible });
  const { data: paymentSettings } = useApi<{
    taxRatePercent?: number;
    taxInclusive?: boolean;
  }>(paymentSettingsUrl, { enabled: visible });

  const catalogServices = useMemo(() => {
    if (Array.isArray(servicesData)) return servicesData;
    if (servicesData && typeof servicesData === "object" && Array.isArray((servicesData as { data?: unknown }).data)) {
      return (servicesData as { data: BookingEditCatalogService[] }).data;
    }
    return [];
  }, [servicesData]);

  const staffList = useMemo(() => {
    if (Array.isArray(staffData)) return staffData;
    if (staffData && typeof staffData === "object" && Array.isArray((staffData as { data?: unknown }).data)) {
      return (staffData as { data: StaffMember[] }).data;
    }
    return [];
  }, [staffData]);

  const productsList = useMemo(() => normalizeProductsList(productsData) as CatalogProduct[], [productsData]);

  const parentCatalogServices = useMemo(
    () =>
      catalogServices.filter(
        (s) => !("parent_service_id" in s && (s as { parent_service_id?: string }).parent_service_id),
      ),
    [catalogServices],
  );

  const resolveServiceLabel = useCallback(
    (sel: BookingEditServiceLine) => resolveBookingEditServiceLabel(sel, catalogServices),
    [catalogServices],
  );

  const [selectedServices, setSelectedServices] = useState<BookingEditServiceLine[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<BookingEditProductLine[]>([]);
  const [notes, setNotes] = useState("");
  const [manualDiscount, setManualDiscount] = useState("");
  const [staffPickerServiceId, setStaffPickerServiceId] = useState<string | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const mapped = mapBookingDetailToEditLines(booking);
    setSelectedServices(mapped.services);
    setSelectedProducts(mapped.products);
    setNotes(booking.special_requests ?? "");
    setManualDiscount(
      booking.discount_amount != null && booking.discount_amount > 0
        ? String(booking.discount_amount)
        : "",
    );
    setStaffPickerServiceId(null);
    setProductPickerOpen(false);
  }, [visible, booking]);

  const preservedDiscountTotal = useMemo(() => {
    return (
      safeNum(booking.promotion_discount_amount) +
      safeNum(booking.membership_discount_amount) +
      safeNum(booking.loyalty_discount_amount)
    );
  }, [booking]);

  const taxRatePercent = safeNum(paymentSettings?.taxRatePercent ?? booking.tax_rate);
  const taxInclusive = paymentSettings?.taxInclusive ?? true;

  const { subtotal } = useMemo(
    () => computeBookingEditLineSubtotal(selectedServices, selectedProducts, catalogServices),
    [selectedServices, selectedProducts, catalogServices],
  );

  const totalsPreview = useMemo(
    () =>
      computeBookingEditTotals({
        subtotal,
        manualDiscount: safeNum(manualDiscount),
        preservedDiscountTotal,
        taxRate: taxRatePercent / 100,
        taxInclusive,
        travelFee: safeNum(booking.travel_fee),
        tipAmount: safeNum(booking.tip_amount),
        serviceFeeAmount: safeNum(booking.service_fee_amount),
      }),
    [
      subtotal,
      manualDiscount,
      preservedDiscountTotal,
      taxRatePercent,
      taxInclusive,
      booking.travel_fee,
      booking.tip_amount,
      booking.service_fee_amount,
    ],
  );

  const toggleService = useCallback((serviceId: string) => {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.serviceId === serviceId);
      if (exists) return prev.filter((s) => s.serviceId !== serviceId);
      return [...prev, { serviceId, addOnIds: [] }];
    });
  }, []);

  const addProduct = useCallback((product: CatalogProduct, variant?: CatalogProductVariant) => {
    setSelectedProducts((prev) => {
      const productId = product.id;
      const productVariantId = variant?.id;
      const existing = prev.find(
        (p) => p.productId === productId && (p.productVariantId ?? null) === (productVariantId ?? null),
      );
      if (existing) {
        return prev.map((p) =>
          p.productId === productId && (p.productVariantId ?? null) === (productVariantId ?? null)
            ? { ...p, quantity: p.quantity + 1 }
            : p,
        );
      }
      return [
        ...prev,
        {
          productId,
          productName: product.name,
          productVariantId,
          productVariantName: variant?.name,
          quantity: 1,
          unitPrice: safeNum(variant?.price ?? product.price),
        },
      ];
    });
    setProductPickerOpen(false);
  }, []);

  const updateProductQty = useCallback((index: number, delta: number) => {
    setSelectedProducts((prev) =>
      prev
        .map((p, i) => (i === index ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p))
        .filter((p) => p.quantity > 0),
    );
  }, []);

  const removeProduct = useCallback((index: number) => {
    setSelectedProducts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = async () => {
    if (selectedServices.length === 0 && selectedProducts.length === 0) {
      Alert.alert("Required", "Add at least one service or product.");
      return;
    }
    if (staffList.length > 0 && selectedServices.length > 0) {
      const missingStaff = selectedServices.some((s) => !s.staffId);
      if (missingStaff) {
        Alert.alert("Staff required", "Assign staff to each service before saving.");
        return;
      }
    }

    setSaving(true);
    const payload = buildBookingEditPatchPayload({
      selectedServices,
      selectedProducts,
      catalogServices,
      scheduledAt: booking.scheduled_at,
      notes: notes.trim(),
      manualDiscount: safeNum(manualDiscount),
      preservedDiscountTotal,
      taxRate: taxRatePercent / 100,
      taxInclusive,
      travelFee: safeNum(booking.travel_fee),
      tipAmount: safeNum(booking.tip_amount),
      serviceFeeAmount: safeNum(booking.service_fee_amount),
      discountReason: booking.discount_reason,
      version: booking.version,
    });

    const result = await onSave(payload);
    setSaving(false);

    if (result.error) {
      if (result.errorCode === "PRODUCT_EDIT_LOCKED") {
        Alert.alert(
          "Cannot edit products",
          "Products on this booking already affected stock or the booking is closed. Create a sale or refund adjustment instead.",
        );
      } else if (result.errorCode === "CONFLICT") {
        Alert.alert("Conflict", "This booking was modified elsewhere. Close, refresh, and try again.");
      } else {
        Alert.alert("Could not save", result.error);
      }
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  const currency = getTenantDefaultCurrency();

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Edit appointment" snapHeight="full">
        <ScrollView
          style={twStyle("flex-1")}
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={twStyle("mb-3 text-xs text-gray-500")}>
            Update services, staff, retail items, discount, and notes. Time changes stay under Reschedule.
          </Text>

          {preservedDiscountTotal > 0 ? (
            <View style={twStyle("mb-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2")}>
              <Text style={twStyle("text-xs text-blue-800")}>
                Membership, promo, or loyalty discounts ({formatCurrency(preservedDiscountTotal, currency)}) stay applied.
              </Text>
            </View>
          ) : null}

          <Text style={twStyle("mb-2 text-sm font-semibold text-gray-800")}>Services</Text>
          {servicesLoading ? (
            <ActivityIndicator style={twStyle("my-4")} />
          ) : catalogServices.length === 0 ? (
            <Text style={twStyle("mb-4 text-sm text-gray-500")}>No services in catalogue.</Text>
          ) : (
            <View style={twStyle("mb-4 gap-y-2")}>
              {selectedServices.length > 0 ? (
                <View style={twStyle("mb-3 gap-y-2")}>
                  <Text style={twStyle("text-xs font-medium uppercase tracking-wide text-gray-500")}>
                    On this appointment
                  </Text>
                  {selectedServices.map((sel) => {
                    const display = resolveBookingEditServiceDisplay(sel, catalogServices);
                    const staffName = staffList.find((s) => s.id === sel.staffId)?.name;
                    return (
                      <View
                        key={sel.serviceId}
                        style={twStyle("rounded-xl border border-primary/30 bg-primary/5 p-3")}
                      >
                        <View style={twStyle("flex-row items-start justify-between gap-2")}>
                          <View style={twStyle("min-w-0 flex-1")}>
                            <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                              {display.title}
                            </Text>
                            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                              {formatDuration(display.durationMinutes)} ·{" "}
                              {formatCurrency(display.price, display.currency ?? currency)}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => toggleService(sel.serviceId)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${resolveServiceLabel(sel)}`}
                          >
                            <Ionicons name="close-circle" size={22} color="#9ca3af" />
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          onPress={() => setStaffPickerServiceId(sel.serviceId)}
                          style={twStyle("mt-2 flex-row items-center self-start rounded-lg border border-gray-200 bg-white px-3 py-1.5")}
                        >
                          <Ionicons name="person-outline" size={14} color="#6b7280" />
                          <Text style={twStyle("ml-1 text-xs text-gray-600")}>{staffName ?? "Assign staff"}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              <Text style={twStyle("text-xs font-medium uppercase tracking-wide text-gray-500")}>Add services</Text>
              {parentCatalogServices.slice(0, 40).map((service) => {
                const isSelected = selectedServices.some((s) => s.serviceId === service.id);
                if (isSelected) return null;
                return (
                  <TouchableOpacity
                    key={service.id}
                    onPress={() => toggleService(service.id)}
                    style={twStyle("flex-row items-center justify-between rounded-xl border border-gray-200 bg-white p-3")}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${service.title}`}
                  >
                    <View style={twStyle("flex-1 pr-2")}>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>{service.title}</Text>
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {formatDuration(service.duration_minutes)} · {formatCurrency(service.price, service.currency)}
                      </Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={22} color="#9ca3af" />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={twStyle("mb-2 flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-semibold text-gray-800")}>Products</Text>
            <TouchableOpacity onPress={() => setProductPickerOpen(true)}>
              <Text style={twStyle("text-sm font-semibold text-primary")}>Add product</Text>
            </TouchableOpacity>
          </View>
          {selectedProducts.length === 0 ? (
            <Text style={twStyle("mb-4 text-sm text-gray-500")}>No retail items on this booking.</Text>
          ) : (
            <View style={twStyle("mb-4 gap-y-2")}>
              {selectedProducts.map((p, index) => (
                <View
                  key={`${p.productId}-${p.productVariantId ?? "base"}-${index}`}
                  style={twStyle("flex-row items-center justify-between rounded-xl border border-gray-200 bg-white p-3")}
                >
                  <View style={twStyle("flex-1 pr-2")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>
                      {p.productVariantName ? `${p.productName} · ${p.productVariantName}` : p.productName}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {formatCurrency(p.unitPrice, currency)} each
                    </Text>
                  </View>
                  <View style={twStyle("flex-row items-center")}>
                    <TouchableOpacity onPress={() => updateProductQty(index, -1)} style={twStyle("px-2 py-1")}>
                      <Ionicons name="remove-circle-outline" size={22} color="#6b7280" />
                    </TouchableOpacity>
                    <Text style={twStyle("min-w-[24px] text-center text-sm font-semibold")}>{p.quantity}</Text>
                    <TouchableOpacity onPress={() => updateProductQty(index, 1)} style={twStyle("px-2 py-1")}>
                      <Ionicons name="add-circle-outline" size={22} color="#6b7280" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeProduct(index)} style={twStyle("ml-1 px-1")}>
                      <Ionicons name="trash-outline" size={20} color="#b91c1c" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={twStyle("mb-2 text-sm font-semibold text-gray-800")}>Manual discount</Text>
          <TextInput
            value={manualDiscount}
            onChangeText={setManualDiscount}
            keyboardType="decimal-pad"
            placeholder="0"
            style={twStyle("mb-4 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900")}
          />

          <Text style={twStyle("mb-2 text-sm font-semibold text-gray-800")}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Internal or client-facing notes"
            style={twStyle("mb-4 min-h-[88px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900")}
          />

          <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-3")}>
            <Text style={twStyle("text-xs font-semibold uppercase text-gray-500")}>Updated total</Text>
            <Text style={twStyle("mt-1 text-lg font-bold text-gray-900")}>
              {formatCurrency(totalsPreview.totalAmount, currency)}
            </Text>
            <Text style={twStyle("mt-1 text-xs text-gray-600")}>
              Subtotal {formatCurrency(subtotal, currency)} · Tax {formatCurrency(totalsPreview.taxAmount, currency)}
            </Text>
          </View>

          <View style={twStyle("mt-4")}>
            <ActionButton
              label={saving ? "Saving…" : "Save changes"}
              onPress={() => void handleSave()}
              disabled={saving}
              loading={saving}
            />
          </View>
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={staffPickerServiceId != null}
        onClose={() => setStaffPickerServiceId(null)}
        title="Assign staff"
        snapHeight="half"
      >
        <ScrollView>
          {staffList.map((member) => (
            <TouchableOpacity
              key={member.id}
              onPress={() => {
                if (!staffPickerServiceId) return;
                setSelectedServices((prev) =>
                  prev.map((s) =>
                    s.serviceId === staffPickerServiceId ? { ...s, staffId: member.id } : s,
                  ),
                );
                setStaffPickerServiceId(null);
              }}
              style={twStyle("border-b border-gray-100 px-4 py-3")}
            >
              <Text style={twStyle("text-base text-gray-900")}>{member.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        title="Add product"
        snapHeight="full"
      >
        <ScrollView>
          {productsList.map((product) => (
            <View key={product.id}>
              <TouchableOpacity
                onPress={() => addProduct(product)}
                style={twStyle("border-b border-gray-100 px-4 py-3")}
              >
                <Text style={twStyle("text-base text-gray-900")}>{product.name}</Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {formatCurrency(product.price, product.currency ?? currency)}
                </Text>
              </TouchableOpacity>
              {(product.variants ?? []).map((variant) => (
                <TouchableOpacity
                  key={variant.id}
                  onPress={() => addProduct(product, variant)}
                  style={twStyle("border-b border-gray-50 px-6 py-2")}
                >
                  <Text style={twStyle("text-sm text-gray-800")}>{variant.name}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {formatCurrency(variant.price, product.currency ?? currency)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      </BottomSheet>
    </>
  );
}
