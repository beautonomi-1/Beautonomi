"use client";

import React, { useState, useEffect, useCallback } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, Phone, Mail, MessageSquare, Bell, CalendarPlus, Loader2 } from "lucide-react";
import AuthGuard from "@/components/auth/auth-guard";
import { SettingsDetailLayout, PageHeader } from "@/components/provider";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useWaitlistEntriesRealtime } from "@/hooks/useSupabaseRealtime";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface WaitlistEntry {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  service_id: string | null;
  staff_id: string | null;
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  notes: string | null;
  status: "waiting" | "contacted" | "booked" | "cancelled";
  priority: number;
  created_at: string;
  service: {
    id: string;
    title: string;
  } | null;
  staff: {
    id: string;
    name: string;
  } | null;
}

export default function ProviderWaitlistPage() {
  const router = useRouter();
  const { provider, selectedLocationId } = useProviderPortal();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "waiting" | "contacted" | "booked">("waiting");
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  useEffect(() => {
    loadWaitlist();
  }, [statusFilter, selectedLocationId]);

  const loadWaitlist = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loc = selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : "";
      const response = await fetcher.get<{ data: { entries: WaitlistEntry[]; total?: number } }>(
        `/api/provider/waitlist?status=${statusFilter}${loc}`,
        { timeoutMs: 30000 } // 30 second timeout
      );
      setEntries(response.data.entries || []);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : "Failed to load waitlist");
      console.error("Error loading waitlist:", err);
      setEntries([]); // Set empty array on error
    } finally {
      setIsLoading(false);
    }
  };

  const loadWaitlistRef = React.useRef(loadWaitlist);
  loadWaitlistRef.current = loadWaitlist;
  const refreshWaitlist = useCallback(() => {
    loadWaitlistRef.current?.();
  }, []);
  const supabaseClient = getSupabaseClient();
  useWaitlistEntriesRealtime(supabaseClient, provider?.id, refreshWaitlist);

  const handleContactCustomer = async (entry: WaitlistEntry) => {
    setNotifyingId(entry.id);
    try {
      await fetcher.post(`/api/provider/waitlist/${entry.id}/notify`, {});
      toast.success(`Notification sent to ${entry.customer_name}`);
      loadWaitlist();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to send notification");
    } finally {
      setNotifyingId(null);
    }
  };

  const handleCreateBooking = (entry: WaitlistEntry) => {
    const params = new URLSearchParams();
    if (entry.customer_name) params.set("client_name", entry.customer_name);
    if (entry.customer_email) params.set("client_email", entry.customer_email);
    if (entry.customer_phone) params.set("client_phone", entry.customer_phone);
    if (entry.service_id) params.set("service_id", entry.service_id);
    if (entry.staff_id) params.set("staff_id", entry.staff_id);
    if (entry.preferred_date) params.set("date", entry.preferred_date);
    if (entry.preferred_time_start) params.set("time", entry.preferred_time_start);
    params.set("waitlist_entry_id", entry.id);
    router.push(`/provider/calendar?new=1&${params.toString()}`);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      waiting: "default",
      contacted: "secondary",
      booked: "outline",
      cancelled: "destructive",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <SettingsDetailLayout
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Waitlist" },
          ]}
        >
          <LoadingTimeout loadingMessage="Loading waitlist..." />
        </SettingsDetailLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Waitlist" },
        ]}
        showCloseButton={true}
      >
        <div className="space-y-6">
          <PageHeader
            title="Waitlist"
            subtitle="Manage customer waitlist entries and convert them to bookings"
          />
          <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
            >
              All
            </Button>
            <Button
              variant={statusFilter === "waiting" ? "default" : "outline"}
              onClick={() => setStatusFilter("waiting")}
            >
              Waiting
            </Button>
            <Button
              variant={statusFilter === "contacted" ? "default" : "outline"}
              onClick={() => setStatusFilter("contacted")}
            >
              Contacted
            </Button>
            <Button
              variant={statusFilter === "booked" ? "default" : "outline"}
              onClick={() => setStatusFilter("booked")}
            >
              Booked
            </Button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-4">
          {entries.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-600">No waitlist entries found</p>
              </CardContent>
            </Card>
          ) : (
            entries.map((entry) => (
              <Card key={entry.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <User className="w-5 h-5" />
                        {entry.customer_name}
                      </CardTitle>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        {entry.customer_email && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {entry.customer_email}
                          </div>
                        )}
                        {entry.customer_phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            {entry.customer_phone}
                          </div>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(entry.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {entry.service && (
                      <div>
                        <p className="text-sm font-semibold mb-1">Service</p>
                        <p className="text-sm text-gray-600">{entry.service.title}</p>
                      </div>
                    )}
                    {entry.staff && (
                      <div>
                        <p className="text-sm font-semibold mb-1">Preferred Staff</p>
                        <p className="text-sm text-gray-600">{entry.staff.name}</p>
                      </div>
                    )}
                    {entry.preferred_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-semibold">Preferred Date</p>
                          <p className="text-sm text-gray-600">
                            {new Date(entry.preferred_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    )}
                    {(entry.preferred_time_start || entry.preferred_time_end) && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-semibold">Preferred Time</p>
                          <p className="text-sm text-gray-600">
                            {entry.preferred_time_start || "Any"} - {entry.preferred_time_end || "Any"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {entry.notes && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold mb-1">Notes</p>
                          <p className="text-sm text-gray-600">{entry.notes}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4 border-t flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleContactCustomer(entry)}
                      disabled={notifyingId === entry.id || entry.status === "contacted" || entry.status === "booked"}
                    >
                      {notifyingId === entry.id ? (
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      ) : (
                        <Bell className="w-3 h-3 mr-1.5" />
                      )}
                      {entry.status === "contacted" ? "Notified" : "Notify Customer"}
                    </Button>
                    {(entry.customer_email || entry.customer_phone) && (
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a href={entry.customer_email ? `mailto:${entry.customer_email}` : `tel:${entry.customer_phone}`}>
                          <Mail className="w-3 h-3 mr-1.5" />
                          {entry.customer_email ? "Email" : "Call"}
                        </a>
                      </Button>
                    )}
                    {entry.status !== "booked" && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleCreateBooking(entry)}
                      >
                        <CalendarPlus className="w-3 h-3 mr-1.5" />
                        Create Booking
                      </Button>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-2">
                    Added {new Date(entry.created_at).toLocaleDateString()} • Priority: {entry.priority}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
          </div>
        </div>
      </SettingsDetailLayout>
    </AuthGuard>
  );
}
