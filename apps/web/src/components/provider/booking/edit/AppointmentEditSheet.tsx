"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, CalendarClock, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { Appointment, ServiceItem, TeamMember } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import { useAppointmentSidebar } from "@/stores/appointment-sidebar-store";
import {
  buildBookingEditPatchPayload,
  detectOptimisticLockConflict,
  mapBookingDetailToEditLines,
  type BookingEditCatalogService,
  type BookingEditProductLine,
  type BookingEditServiceLine,
} from "@beautonomi/provider-booking";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingSectionCard,
  BookingSectionLabel,
  VersionConflictDialog,
} from "../ui";
import { RescheduleSheet } from "../reschedule/RescheduleSheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EditProductsSection } from "./EditProductsSection";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGateInline } from "../scenario/PermissionGateInline";
import { BookingProductsSection } from "../view/BookingProductsSection";
import { BookingTravelSection } from "../view/BookingTravelSection";
import { BookingPaymentSummarySection } from "../view/BookingPaymentSummarySection";

import { Plus, Trash2 } from "lucide-react";

interface AppointmentEditSheetProps {
  services: ServiceItem[];
  teamMembers?: TeamMember[];
  onSuccess?: (appointment: Appointment) => void;
  onRefresh?: () => void;
  onRequestRefund?: () => void;
}

export function AppointmentEditSheet({
  services,
  teamMembers = [],
  onSuccess,
  onRefresh,
  onRequestRefund,
}: AppointmentEditSheetProps) {
  const {
    isOpen,
    mode,
    selectedAppointment,
    selectedAppointmentId,
    closeSidebar,
    switchToViewMode,
    setSaving,
    isSaving,
    updateSelectedAppointment,
  } = useAppointmentSidebar();

  const { format: formatMoney } = useProviderMoneyFormat();
  const { hasPermission, isOwner } = usePermissions();
  const canEditAppointments = isOwner || hasPermission("edit_appointments");
  const open = isOpen && mode === "edit" && !!selectedAppointment;

  const [notes, setNotes] = useState("");
  const [serviceLines, setServiceLines] = useState<BookingEditServiceLine[]>([]);
  const [productLines, setProductLines] = useState<BookingEditProductLine[]>([]);
  const [manualDiscount, setManualDiscount] = useState(0);
  const [preservedDiscountTotal, setPreservedDiscountTotal] = useState(0);
  const [travelFee, setTravelFee] = useState(0);
  const [tipAmount, setTipAmount] = useState(0);
  const [serviceFeeAmount, setServiceFeeAmount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [version, setVersion] = useState<number | undefined>();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [catalogServices, setCatalogServices] = useState<BookingEditCatalogService[]>([]);
  const [addonsByServiceId, setAddonsByServiceId] = useState<
    Record<string, Array<{ id: string; name: string; price: number; duration_minutes: number }>>
  >({});

  useEffect(() => {
    setCatalogServices(
      services.map((s) => ({
        id: s.id,
        title: s.name,
        duration_minutes: s.duration_minutes,
        price: s.price,
        currency: "ZAR",
        add_ons: [],
      })),
    );
  }, [services]);

  const hydrateFromAppointment = useCallback((appt: Appointment) => {
    const raw = appt as unknown as Record<string, unknown>;
    setNotes(appt.notes ?? "");
    setVersion(typeof raw.version === "number" ? raw.version : undefined);
    setTravelFee(Number(raw.travel_fee ?? appt.travel_fee ?? 0));
    setTipAmount(Number(raw.tip_amount ?? appt.tip_amount ?? 0));
    setServiceFeeAmount(Number(raw.service_fee_amount ?? 0));
    const rawTaxRate = Number(raw.tax_rate ?? 0);
    setTaxRate(rawTaxRate > 1 ? rawTaxRate / 100 : rawTaxRate);
    setTaxInclusive(raw.tax_inclusive !== false);

    const preserved =
      Number(raw.loyalty_discount_amount ?? 0) +
      Number(raw.promotion_discount_amount ?? 0) +
      Number(raw.membership_discount_amount ?? 0);
    const discountAmount = Number(raw.discount_amount ?? appt.discount_amount ?? 0);
    setPreservedDiscountTotal(preserved);
    setManualDiscount(Math.max(0, discountAmount - preserved));

    const mapped = mapBookingDetailToEditLines({
      services: (raw.services as Parameters<typeof mapBookingDetailToEditLines>[0]["services"]) ?? [
        {
          offering_id: appt.service_id,
          staff_id: appt.team_member_id,
          offering_name: appt.service_name,
          price: appt.price,
          duration_minutes: appt.duration_minutes,
        },
      ],
      products: (raw.products as Parameters<typeof mapBookingDetailToEditLines>[0]["products"]) ??
        (raw.booking_products as Parameters<typeof mapBookingDetailToEditLines>[0]["products"]),
    });
    setServiceLines(mapped.services.length > 0 ? mapped.services : []);
    setProductLines(mapped.products);
  }, []);

  useEffect(() => {
    if (open && selectedAppointment) {
      hydrateFromAppointment(selectedAppointment);
    }
  }, [open, selectedAppointment, hydrateFromAppointment]);

  const serviceIdsKey = serviceLines.map((l) => l.serviceId).join(",");

  useEffect(() => {
    if (!open || serviceLines.length === 0) {
      setAddonsByServiceId({});
      return;
    }
    const uniqueIds = [...new Set(serviceLines.map((l) => l.serviceId).filter(Boolean))];
    let cancelled = false;
    void Promise.all(
      uniqueIds.map(async (serviceId) => {
        try {
          const addons = await providerApi.getServiceAddons(serviceId);
          return {
            serviceId,
            addons: addons.map((a) => ({
              id: a.id,
              name: a.name,
              price: a.price,
              duration_minutes: a.duration_minutes,
            })),
          };
        } catch {
          return { serviceId, addons: [] as Array<{ id: string; name: string; price: number; duration_minutes: number }> };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, Array<{ id: string; name: string; price: number; duration_minutes: number }>> = {};
      for (const { serviceId, addons } of results) {
        next[serviceId] = addons;
      }
      setAddonsByServiceId(next);
      setCatalogServices((prev) =>
        prev.map((s) => (next[s.id] ? { ...s, add_ons: next[s.id] } : s)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, serviceIdsKey, serviceLines]);

  const handleServiceChange = (index: number, serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc || !selectedAppointment) return;
    setServiceLines((lines) => {
      const next = [...lines];
      next[index] = {
        serviceId: svc.id,
        staffId: next[index]?.staffId ?? selectedAppointment.team_member_id,
        offeringName: svc.name,
        price: svc.price,
        durationMinutes: svc.duration_minutes,
        addOnIds: [],
      };
      return next;
    });
  };

  const addServiceLine = () => {
    const first = services[0];
    if (!first || !selectedAppointment) return;
    setServiceLines((lines) => [
      ...lines,
      {
        serviceId: first.id,
        staffId: selectedAppointment.team_member_id,
        offeringName: first.name,
        price: first.price,
        durationMinutes: first.duration_minutes,
        addOnIds: [],
      },
    ]);
  };

  const removeServiceLine = (index: number) => {
    setServiceLines((lines) => (lines.length <= 1 ? lines : lines.filter((_, i) => i !== index)));
  };

  const handleStaffChange = (index: number, staffId: string) => {
    setServiceLines((lines) => {
      const next = [...lines];
      const line = next[index];
      if (!line) return lines;
      next[index] = { ...line, staffId };
      return next;
    });
  };

  const editRaw = selectedAppointment
    ? (selectedAppointment as unknown as Record<string, unknown>)
    : null;
  const editOutstanding = selectedAppointment
    ? computeBookingOutstandingDisplay({
        totalAmount: Number(selectedAppointment.total_amount ?? selectedAppointment.price ?? 0),
        totalPaid: Number(editRaw?.total_paid ?? 0),
        totalRefunded: Number(editRaw?.total_refunded ?? 0),
        walletAmount: Number(editRaw?.wallet_amount ?? 0),
        giftCardAmount: Number(editRaw?.gift_card_amount ?? 0),
        unpaidAdditionalCharges: Number(editRaw?.unpaid_additional_charges ?? 0),
        paymentStatus: selectedAppointment.payment_status,
      })
    : 0;
  const editOverpaid = editOutstanding < 0 ? Math.abs(editOutstanding) : 0;

  const toggleAddOn = (lineIndex: number, addonId: string) => {
    setServiceLines((lines) => {
      const line = lines[lineIndex];
      if (!line) return lines;
      const ids = new Set(line.addOnIds ?? []);
      if (ids.has(addonId)) ids.delete(addonId);
      else ids.add(addonId);
      const next = [...lines];
      next[lineIndex] = { ...line, addOnIds: [...ids] };
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedAppointmentId || serviceLines.length === 0) return;
    setSaving(true);
    try {
      const patch = buildBookingEditPatchPayload({
        selectedServices: serviceLines,
        selectedProducts: productLines,
        catalogServices,
        notes,
        manualDiscount,
        preservedDiscountTotal,
        taxRate,
        taxInclusive,
        travelFee,
        tipAmount,
        serviceFeeAmount,
        version,
      });

      const updated = await providerApi.updateAppointment(selectedAppointmentId, patch as Partial<Appointment>);
      updateSelectedAppointment(updated);
      toast.success("Booking updated");
      onSuccess?.(updated);
      onRefresh?.();
      switchToViewMode();
    } catch (error) {
      const conflict = detectOptimisticLockConflict(error);
      if (conflict.isConflict) {
        setConflictOpen(true);
      } else {
        toast.error(formatApiErrorMessage(error, "Failed to update booking"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReload = async () => {
    if (!selectedAppointmentId) return;
    try {
      const fresh = await providerApi.getAppointment(selectedAppointmentId);
      updateSelectedAppointment(fresh);
      hydrateFromAppointment(fresh);
    } catch (error) {
      toast.error(formatApiErrorMessage(error, "Failed to reload booking"));
    }
  };

  const header = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={switchToViewMode}
        className="p-2 -ml-2 rounded-full touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Back"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h2 className="text-lg font-semibold text-gray-900 flex-1 truncate">Edit booking</h2>
      <button
        type="button"
        onClick={closeSidebar}
        className="p-2 -mr-2 rounded-full touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const footer = canEditAppointments ? (
    <div className="flex flex-col gap-2">
      <BookingActionButton
        variant="outline"
        fullWidth
        onClick={() => setRescheduleOpen(true)}
        disabled={!selectedAppointment}
      >
        <CalendarClock className="mr-2 h-4 w-4" />
        Reschedule
      </BookingActionButton>
      <BookingActionButton disabled={isSaving || serviceLines.length === 0} onClick={handleSave}>
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save changes"
        )}
      </BookingActionButton>
    </div>
  ) : undefined;

  return (
    <>
      <BookingBottomSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) switchToViewMode();
        }}
        mode="edit"
        header={header}
        footer={footer}
      >
        <div className="space-y-4 pb-4">
          {!canEditAppointments ? (
            <PermissionGateInline
              allowed={false}
              message="You do not have permission to edit appointments."
            />
          ) : null}
          {editOverpaid > 0 ? (
            <BookingSectionCard className="border-amber-200 bg-amber-50">
              <p className="text-sm text-amber-950">
                Overpaid by <span className="font-semibold">{formatMoney(editOverpaid)}</span>. Issue a
                refund after saving if the total changed.
              </p>
              {onRequestRefund ? (
                <BookingActionButton
                  className="mt-3"
                  variant="outline"
                  onClick={onRequestRefund}
                >
                  Issue refund
                </BookingActionButton>
              ) : (
                <BookingActionButton
                  className="mt-3"
                  variant="outline"
                  onClick={switchToViewMode}
                >
                  View to refund
                </BookingActionButton>
              )}
            </BookingSectionCard>
          ) : null}

          {selectedAppointment ? (
            <div className="space-y-4">
              <BookingProductsSection appointment={selectedAppointment} />
              <BookingTravelSection appointment={selectedAppointment} />
              <BookingPaymentSummarySection
                appointment={selectedAppointment}
                outstanding={Math.max(0, editOutstanding)}
              />
            </div>
          ) : null}

          <fieldset disabled={!canEditAppointments} className="space-y-4 pb-4 border-0 p-0 m-0 min-w-0">
          {serviceLines.map((line, index) => (
            <BookingSectionCard key={`${line.serviceId}-${index}`}>
              <div className="flex items-center justify-between mb-2">
                <BookingSectionLabel>
                  {serviceLines.length > 1 ? `Service ${index + 1}` : "Service"}
                </BookingSectionLabel>
                {serviceLines.length > 1 ? (
                  <button
                    type="button"
                    className="p-2 text-red-600 touch-manipulation"
                    onClick={() => removeServiceLine(index)}
                    aria-label="Remove service"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <Select
                value={line.serviceId}
                onValueChange={(serviceId) => handleServiceChange(index, serviceId)}
              >
                <SelectTrigger className="rounded-xl min-h-[44px]">
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((svc) => (
                    <SelectItem key={svc.id} value={svc.id}>
                      {svc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {teamMembers.length > 0 ? (
                <div className="mt-2">
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">Staff</label>
                  <Select
                    value={line.staffId ?? selectedAppointment?.team_member_id ?? ""}
                    onValueChange={(staffId) => handleStaffChange(index, staffId)}
                  >
                    <SelectTrigger className="rounded-xl min-h-[44px]">
                      <SelectValue placeholder="Assign staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {(addonsByServiceId[line.serviceId]?.length ?? 0) > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-gray-600">Add-ons</p>
                  {addonsByServiceId[line.serviceId]?.map((addon) => (
                    <label
                      key={addon.id}
                      className="flex items-center gap-3 min-h-[44px] touch-manipulation cursor-pointer"
                    >
                      <Checkbox
                        checked={(line.addOnIds ?? []).includes(addon.id)}
                        onCheckedChange={() => toggleAddOn(index, addon.id)}
                      />
                      <span className="text-sm text-gray-800 flex-1">
                        {addon.name}
                        {addon.price > 0 ? ` · ${addon.price.toFixed(2)}` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </BookingSectionCard>
          ))}

          <BookingActionButton variant="outline" onClick={addServiceLine}>
            <Plus className="mr-2 h-4 w-4" />
            Add service
          </BookingActionButton>

          <EditProductsSection products={productLines} onChange={setProductLines} />

          <BookingSectionCard>
            <BookingSectionLabel htmlFor="edit-discount" className="mb-2">
              Manual discount
            </BookingSectionLabel>
            <Input
              id="edit-discount"
              type="number"
              min={0}
              step="0.01"
              value={manualDiscount || ""}
              onChange={(e) => setManualDiscount(Math.max(0, Number(e.target.value) || 0))}
              className="rounded-xl min-h-[44px]"
              placeholder="0.00"
            />
            {preservedDiscountTotal > 0 ? (
              <p className="text-xs text-gray-500 mt-1">
                Promo/loyalty discounts ({preservedDiscountTotal.toFixed(2)}) are preserved automatically.
              </p>
            ) : null}
          </BookingSectionCard>

          <BookingSectionCard>
            <BookingSectionLabel htmlFor="edit-notes" className="mb-2">
              Notes
            </BookingSectionLabel>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="rounded-xl"
              placeholder="Booking notes"
            />
          </BookingSectionCard>
          </fieldset>
        </div>
      </BookingBottomSheet>

      <VersionConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        onReload={handleReload}
      />

      {selectedAppointment ? (
        <RescheduleSheet
          open={rescheduleOpen}
          onOpenChange={setRescheduleOpen}
          appointment={selectedAppointment}
          onSuccess={() => {
            onRefresh?.();
            void handleReload();
          }}
        />
      ) : null}
    </>
  );
}
