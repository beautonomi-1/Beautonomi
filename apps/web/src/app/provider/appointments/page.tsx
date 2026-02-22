"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { Appointment, FilterParams, PaginationParams, TeamMember, ServiceItem, Salon } from "@/lib/provider-portal/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppointmentStatusBadge } from "@/components/provider-portal/AppointmentStatusBadge";
import { Money } from "@/components/provider-portal/Money";
import { YocoPaymentDialog } from "@/components/provider-portal/YocoPaymentDialog";
import { Search, Filter, CreditCard, Plus } from "lucide-react";
import Pagination from "@/components/ui/pagination";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SyncIndicator } from "@/components/provider/SyncIndicator";
import type { YocoPayment } from "@/lib/provider-portal/types";
import { openViewMode } from "@/stores/appointment-sidebar-store";
import { AppointmentSidebar } from "@/components/appointments";

export default function ProviderAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("month");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [yocoDialogOpen, setYocoDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [locations, setLocations] = useState<Salon[]>([]);

  useEffect(() => {
    loadAppointments();
    loadSidebarData();
  }, [page, statusFilter, dateRange]);

  const loadSidebarData = async () => {
    try {
      const [teamMembers, services, locations] = await Promise.all([
        providerApi.listTeamMembers(),
        providerApi.listServices(),
        providerApi.getSalons(),
      ]);
      setTeamMembers(teamMembers || []);
      setServices(services || []);
      setLocations(locations || []);
    } catch (error) {
      console.error("Failed to load sidebar data:", error);
      // Set empty arrays as fallback
      setTeamMembers([]);
      setServices([]);
      setLocations([]);
    }
  };

  const loadAppointments = async (isBackground = false) => {
    try {
      if (!isBackground) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      const filters: FilterParams = {
        search: searchQuery || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      };

      if (dateRange === "month") {
        const now = new Date();
        filters.date_from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        filters.date_to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      }

      const pagination: PaginationParams = { page, limit: 20 };
      const response = await providerApi.listAppointments(filters, pagination);
      setAppointments(response.data);
      setTotalPages(response.total_pages);
      setLastSynced(new Date());
    } catch (error) {
      console.error("Failed to load appointments:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    loadAppointments();
  };

  const handleYocoPayment = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setYocoDialogOpen(true);
  };

  const handlePaymentSuccess = (_payment: YocoPayment) => {
    // Reload appointments to reflect payment status
    loadAppointments(false);
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    openViewMode(appointment);
  };

  // Check if payment button should be shown (only when payment is pending or not paid, and not cancelled)
  const shouldShowPaymentButton = (appointment: Appointment) => {
    // Don't show payment button for cancelled appointments (check multiple variations)
    const status = appointment.status?.toLowerCase().trim();
    if (status === "cancelled" || status === "canceled") {
      return false;
    }
    
    // Don't show if already paid
    const paymentStatus = appointment.payment_status?.toLowerCase().trim();
    if (paymentStatus === "paid") {
      return false;
    }
    
    // Show button for pending or unpaid bookings that are not cancelled
    return paymentStatus === "pending" || !paymentStatus;
  };

  // Auto-refresh appointments every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadAppointments(true); // Background refresh
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading appointments..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumbs */}
      <nav className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-2 py-3 text-sm">
          <a href="/provider/dashboard" className="text-gray-500 hover:text-gray-700 transition-colors">
            Dashboard
          </a>
          <span className="text-gray-400">/</span>
          <span className="text-gray-900 font-medium">Appointments</span>
        </div>
      </nav>

      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Header with Add Button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Appointments</h1>
            <p className="mt-1 text-sm text-gray-500">Manage your appointments and bookings</p>
          </div>
          <Button 
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-appointment-sidebar'));
            }}
            className="bg-[#FF0077] hover:bg-[#E6006B] text-white shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Appointment
          </Button>
        </div>

        {/* Sync Indicator */}
      <div className="mb-4 flex items-center justify-between">
        <SyncIndicator 
          isSyncing={isRefreshing} 
          lastSynced={lastSynced}
          size="sm"
        />
      </div>

        {/* Filters - Airbnb style */}
        <div className="mb-6 flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search by client, service, or ref number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10"
          />
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">Month to Date</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="started">Started</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline">
          <Filter className="w-4 h-4 mr-2" />
          Filter
        </Button>
      </div>

      {/* Table - Mobile Card View, Desktop Table View */}
      {appointments.length === 0 ? (
        <EmptyState
          title="No appointments found"
          description="Appointments will appear here when you have bookings"
        />
      ) : (
        <>
          {/* Desktop Table View - Airbnb style */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Ref #</TableHead>
                    <TableHead className="font-semibold">Client</TableHead>
                    <TableHead className="font-semibold">Service</TableHead>
                    <TableHead className="font-semibold">Date & Time</TableHead>
                    <TableHead className="font-semibold">Team Member</TableHead>
                    <TableHead className="font-semibold">Price</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((apt) => (
                    <TableRow 
                      key={apt.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleAppointmentClick(apt)}
                    >
                      <TableCell className="font-medium text-blue-600">{apt.ref_number}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{apt.client_name}</div>
                          <div className="text-xs text-gray-500">by {apt.created_by}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate" title={apt.service_name}>
                          {apt.service_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{apt.scheduled_date}</div>
                          <div className="text-xs text-gray-500">{apt.scheduled_time} ({apt.duration_minutes}min)</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={apt.team_member_name ? "font-medium" : "text-gray-400 italic"}>
                          {apt.team_member_name || "Unassigned"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Money amount={apt.price} className="font-semibold" />
                      </TableCell>
                      <TableCell>
                        <AppointmentStatusBadge status={apt.status} />
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {shouldShowPaymentButton(apt) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleYocoPayment(apt)}
                            className="gap-2"
                          >
                            <CreditCard className="w-3 h-3" />
                            Pay
                          </Button>
                        ) : (
                          <span className="text-sm text-green-600 font-medium">✓ Paid</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile Card View - Airbnb style */}
          <div className="md:hidden space-y-3">
            {appointments.map((apt) => (
              <div 
                key={apt.id} 
                className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 cursor-pointer hover:shadow-md transition-all shadow-sm"
                onClick={() => handleAppointmentClick(apt)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-lg">{apt.client_name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {apt.ref_number} • {apt.created_by}
                    </p>
                  </div>
                  <AppointmentStatusBadge status={apt.status} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm py-2 border-t border-gray-100">
                  <div>
                    <span className="text-gray-500 text-xs">Service</span>
                    <p className="font-medium truncate" title={apt.service_name}>{apt.service_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Team Member</span>
                    <p className={apt.team_member_name ? "font-medium" : "text-gray-400 italic"}>
                      {apt.team_member_name || "Unassigned"}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Date</span>
                    <p className="font-medium">{apt.scheduled_date}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Time</span>
                    <p className="font-medium">{apt.scheduled_time}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div>
                    <span className="text-xs text-gray-500">Total</span>
                    <p className="font-bold text-lg"><Money amount={apt.price} /></p>
                  </div>
                  {shouldShowPaymentButton(apt) ? (
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleYocoPayment(apt);
                      }}
                      className="min-h-[44px] gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      Pay
                    </Button>
                  ) : (
                    <span className="text-sm text-green-600 font-medium">✓ Paid</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {selectedAppointment && (
        <YocoPaymentDialog
          open={yocoDialogOpen}
          onOpenChange={setYocoDialogOpen}
          amount={selectedAppointment.price}
          appointmentId={selectedAppointment.id}
          onSuccess={handlePaymentSuccess}
        />
      )}

        {/* Appointment Sidebar - full detail view with payment collection */}
        <AppointmentSidebar
          teamMembers={teamMembers}
          services={services}
          locations={locations}
          onAppointmentCreated={() => loadAppointments()}
          onAppointmentUpdated={() => loadAppointments()}
          onAppointmentDeleted={() => loadAppointments()}
        />
      </div>
    </div>
  );
}
