"use client";

import React, { useState, useEffect } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, Phone, Mail, MessageSquare } from "lucide-react";
import AuthGuard from "@/components/auth/auth-guard";
import { SettingsDetailLayout, PageHeader } from "@/components/provider";

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
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "waiting" | "contacted" | "booked">("waiting");

  useEffect(() => {
    loadWaitlist();
  }, [statusFilter]);

  const loadWaitlist = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: { entries: WaitlistEntry[]; total?: number } }>(
        `/api/provider/waitlist?status=${statusFilter}`,
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

                  <div className="flex gap-2 pt-4 border-t">
                    <Button variant="outline" size="sm">
                      Contact Customer
                    </Button>
                    <Button variant="outline" size="sm">
                      Create Booking
                    </Button>
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
