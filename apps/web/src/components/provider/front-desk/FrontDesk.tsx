"use client";

/**
 * FOUND MAP (Discovery)
 * --------------------
 * Bookings: GET /api/provider/bookings?start_date=&end_date=&location_id=
 *   - Used by: src/app/provider/bookings/page.tsx
 *   - Fetcher: fetcher.get from lib/http/fetcher
 * Status updates: PATCH /api/provider/bookings/[id] (status, current_stage)
 *   - Check-in: current_stage: "client_arrived" (at-salon)
 *   - src/app/api/provider/bookings/[id]/route.ts
 * Workflow: POST /api/provider/bookings/[id]/arrive (at-home only)
 *   POST /api/provider/bookings/[id]/start-service
 *   POST /api/provider/bookings/[id]/complete-service
 *   POST /api/provider/bookings/[id]/mark-paid (requires process_payments)
 * Paystack: POST /api/provider/bookings/[id]/send-payment-link
 *   - delivery_method: email | sms | both
 * Yoco: POST /api/provider/bookings/[id]/mark-paid (payment_method: "card")
 * Permissions: requirePermission('edit_appointments'), requirePermission('process_payments')
 *   - src/lib/auth/requirePermission.ts, permissions.ts
 * Locations: fetcher.get /api/provider/locations, LocationSwitcher
 * Staff: providerApi.listTeamMembers(locationId)
 * Messaging: /provider/messaging, /api/provider/conversations
 * Waitlist: /provider/waitlist, POST /api/provider/waiting-room
 * Create booking: POST /api/provider/bookings, openCreateMode from appointment-sidebar-store
 */

import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { formatFrontDeskRangeCaption, useFrontDeskData } from "@/lib/front-desk/useFrontDeskData";
import { matchesQueueTab, getQueueCounts } from "@/lib/front-desk/operationalState";
import type { FrontDeskBooking, FrontDeskMetricRange } from "@/lib/front-desk/types";
import { openViewMode } from "@/stores/appointment-sidebar-store";
import { providerApi } from "@/lib/provider-portal/api";
import { CommandBar } from "./CommandBar";
import { CommandCenter } from "./CommandCenter";
import { BookingTile } from "./BookingTile";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/ui/empty-state";
import RoleGuard from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/provider/PageHeader";
import { format } from "date-fns";
import { BookingSheetHost } from "@/components/provider/booking";
import { useAppointmentSidebar } from "@/stores/appointment-sidebar-store";

export function FrontDesk() {
  const { selectedLocationId, salons, setSelectedLocation } = useProviderPortal();
  const { selectedAppointmentId } = useAppointmentSidebar();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [metricRange, setMetricRange] = useState<FrontDeskMetricRange>("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [loadingAppointment, setLoadingAppointment] = useState<string | null>(null);

  const { bookings, metricBookings, staff, locations, services, loading, error, refetch } = useFrontDeskData({
    date: selectedDate,
    metricRange,
    locationId: selectedLocationId,
    query: searchQuery,
  });

  const locationsList = useMemo(() => {
    if (salons?.length) return salons.map((s) => ({ id: s.id, name: s.name }));
    return locations;
  }, [salons, locations]);

  const filteredBookings = useMemo(() => {
    if (activeTab === "all") return bookings;
    return bookings.filter((b) => matchesQueueTab(b, activeTab));
  }, [bookings, activeTab]);

  const rangeCaption = useMemo(
    () => formatFrontDeskRangeCaption(metricRange, selectedDate),
    [metricRange, selectedDate],
  );

  const headerSubtitle = useMemo(() => {
    const n = filteredBookings.length;
    const unit = n === 1 ? "appointment" : "appointments";
    return `${rangeCaption} • ${n} ${unit}`;
  }, [filteredBookings.length, rangeCaption]);

  const emptyState = useMemo(() => {
    const q = searchQuery.trim();
    if (q) {
      return {
        description: `No matches for "${q}" in this period (${rangeCaption}). Clear search or change the metrics range (Today / Week / …) above.`,
        action: { label: "Clear search", onClick: () => setSearchQuery("") } as const,
      };
    }
    if (activeTab !== "all") {
      return {
        description: `Nothing in this queue for ${rangeCaption}. Try another queue tab or choose All.`,
        action: { label: "Show all queues", onClick: () => setActiveTab("all") } as const,
      };
    }
    return {
      description:
        locationsList.length > 1
          ? `No bookings for ${rangeCaption} at this location. Switch location or pick another date in the bar above.`
          : `No bookings for ${rangeCaption}. Pick another date in the calendar or create an appointment.`,
      action:
        format(selectedDate, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd")
          ? ({ label: "Jump to today", onClick: () => setSelectedDate(new Date()) } as const)
          : undefined,
    };
  }, [activeTab, locationsList.length, rangeCaption, searchQuery, selectedDate]);

  const dayQueueCounts = useMemo(() => getQueueCounts(bookings), [bookings]);
  const queueCounts = useMemo(() => getQueueCounts(metricBookings), [metricBookings]);

  const handleCardClick = async (b: FrontDeskBooking) => {
    if ((b as any).is_group_booking) {
      const firstService = ((b as any).services || [])[0] || {};
      openViewMode({
        id: b.id,
        booking_id: b.id,
        ref_number: (b as any).booking_number || (b as any).group_booking_ref || "",
        client_name: (b as any).customer_name || "Group booking",
        client_email: (b as any).customers?.email || "",
        client_phone: (b as any).customers?.phone || "",
        service_id: firstService.offering_id || firstService.id || "",
        service_name: firstService.service_name || firstService.offering_name || "Group booking",
        team_member_id: firstService.staff_id || "",
        team_member_name: firstService.staff_name || (b as any).staff_name || "",
        scheduled_date: format(new Date((b as any).scheduled_at), "yyyy-MM-dd"),
        scheduled_time: format(new Date((b as any).scheduled_at), "HH:mm"),
        duration_minutes: firstService.duration_minutes || 60,
        price: (b as any).total_amount || 0,
        status: (b as any).status,
        location_type: (b as any).location_type || "at_salon",
        location_id: (b as any).location_id || "",
        payment_status: (b as any).payment_status || "",
        created_by: (b as any).customer_name || "Group booking",
        total_amount: (b as any).total_amount || 0,
        is_group_booking: true,
        group_booking_ref: (b as any).group_booking_ref || null,
        services: (b as any).services || [],
        products: (b as any).products || [],
      } as any);
      return;
    }
    setLoadingAppointment(b.id);
    try {
      const appointment = await providerApi.getAppointment(b.id);
      openViewMode(appointment);
    } catch {
      toast.error("Failed to load appointment");
    } finally {
      setLoadingAppointment(null);
    }
  };

  const handleActionComplete = () => {
    refetch();
  };

  if (loading && bookings.length === 0) {
    return (
      <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
        <div className="container mx-auto px-3 py-4 sm:px-6 sm:py-8 lg:p-8 bg-[#FDFDFD] min-h-[60vh] min-w-0 max-w-full overflow-x-hidden">
          <PageHeader
            title="Front Desk"
            subtitle="Loading appointments…"
            breadcrumbs={[
              { label: "Home", href: "/" },
              { label: "Provider", href: "/provider" },
              { label: "Front Desk" },
            ]}
          />
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-10 w-48" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="flex flex-col min-h-0 w-full min-w-0 max-w-full overflow-x-hidden bg-[#FDFDFD] rounded-2xl transition-all duration-500">
        <PageHeader
          title="Front Desk"
          subtitle={headerSubtitle}
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Front Desk" },
          ]}
        />

        <div className="space-y-6 mb-6 px-3 pt-0 pb-2 sm:px-6 lg:px-8">
          <CommandBar
            date={selectedDate}
            onDateChange={setSelectedDate}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            locationId={selectedLocationId}
            locations={locationsList}
            onLocationChange={(id) => setSelectedLocation(id)}
            onRefetch={refetch}
          />

          {dayQueueCounts.needs_confirmation > 0 && (
            <div
              role="status"
              className="rounded-2xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm"
            >
              <span className="font-semibold">{dayQueueCounts.needs_confirmation}</span>
              {dayQueueCounts.needs_confirmation === 1 ? " booking needs " : " bookings need "}
              your confirmation before check-in or at-home steps. Use{" "}
              <button
                type="button"
                className="font-semibold underline underline-offset-2 hover:text-amber-900"
                onClick={() => setActiveTab("needs_confirmation")}
              >
                To confirm
              </button>{" "}
              or confirm from each card.
            </div>
          )}

          <CommandCenter
            counts={queueCounts}
            activeFilter={activeTab}
            onFilterChange={setActiveTab}
            metricRange={metricRange}
            onMetricRangeChange={setMetricRange}
          />
        </div>

        {error && (
          <EmptyState
            title="Failed to load"
            description={error}
            action={{ label: "Retry", onClick: refetch }}
          />
        )}

        {!error && (
          <div className="flex flex-1 min-h-0 px-3 pb-6 sm:px-6 lg:px-8 pt-0">
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <ScrollArea className="flex-1 pr-3">
                <div className="grid gap-5 pb-8 grid-cols-1 md:grid-cols-2 transition-all duration-500">
                  {filteredBookings.map((b) => (
                    <BookingTile
                      key={b.id}
                      booking={b}
                      isSelected={selectedAppointmentId === b.id}
                      onClick={() => handleCardClick(b)}
                      onActionComplete={handleActionComplete}
                      isLoading={loadingAppointment === b.id}
                    />
                  ))}
                </div>
                {filteredBookings.length === 0 && (
                  <div className="py-16">
                    <EmptyState
                      title="No appointments"
                      description={emptyState.description}
                      action={emptyState.action}
                    />
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        )}

        <BookingSheetHost
          teamMembers={staff as any}
          services={services as any}
          locations={locationsList as any}
          onAppointmentCreated={handleActionComplete}
          onAppointmentUpdated={handleActionComplete}
          onAppointmentDeleted={handleActionComplete}
          onRefresh={refetch}
        />
      </div>
    </RoleGuard>
  );
}

