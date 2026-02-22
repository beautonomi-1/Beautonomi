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
import { useFrontDeskData } from "@/lib/front-desk/useFrontDeskData";
import { matchesQueueTab, getQueueCounts } from "@/lib/front-desk/operationalState";
import type { FrontDeskBooking } from "@/lib/front-desk/types";
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
import { AppointmentSidebar } from "@/components/appointments";
import { useAppointmentSidebar } from "@/stores/appointment-sidebar-store";

export function FrontDesk() {
  const { selectedLocationId, salons, setSelectedLocation } = useProviderPortal();
  const { selectedAppointmentId } = useAppointmentSidebar();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [loadingAppointment, setLoadingAppointment] = useState<string | null>(null);

  const { bookings, staff, locations, services, loading, error, refetch } = useFrontDeskData({
    date: selectedDate,
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

  const queueCounts = useMemo(() => getQueueCounts(bookings), [bookings]);

  const handleCardClick = async (b: FrontDeskBooking) => {
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
        <div className="container mx-auto p-8 bg-[#FDFDFD] min-h-[60vh]">
          <PageHeader
            title="Front Desk"
            subtitle="Manage today's appointments"
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
      <div className="flex flex-col min-h-0 w-full max-w-full overflow-hidden bg-[#FDFDFD] rounded-2xl transition-all duration-500">
        <PageHeader
          title="Front Desk"
          subtitle={`${format(selectedDate, "EEEE, MMM d")} • ${bookings.length} appointments`}
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Front Desk" },
          ]}
        />

        <div className="space-y-6 mb-6 p-8 pt-0">
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

          <CommandCenter
            counts={queueCounts}
            activeFilter={activeTab}
            onFilterChange={setActiveTab}
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
          <div className="flex flex-1 min-h-0 p-8 pt-0">
            <div className="flex-1 min-w-[320px] min-h-0 flex flex-col">
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
                      description="No appointments match your filters"
                    />
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        )}

        <AppointmentSidebar
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

