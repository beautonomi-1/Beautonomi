"use client";

import React, { useState, useEffect } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Pause, Play, X } from "lucide-react";
import AuthGuard from "@/components/auth/auth-guard";
import { toast } from "sonner";
import BackButton from "../components/back-button";

interface RecurringBooking {
  id: string;
  frequency: "weekly" | "biweekly" | "monthly";
  start_date: string;
  end_date: string | null;
  preferred_time: string;
  location_type: "at_home" | "at_salon";
  is_active: boolean;
  provider: {
    id: string;
    business_name: string;
    slug: string;
  };
  metadata: {
    services?: Array<{ offering_id: string; staff_id?: string }>;
    address?: any;
  };
  created_at: string;
}

export default function RecurringBookingsPage() {
  const [recurring, setRecurring] = useState<RecurringBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecurring();
  }, []);

  const loadRecurring = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: { recurring: RecurringBooking[] } }>(
        "/api/recurring-bookings",
        { cache: "no-store" }
      );
      setRecurring(response.data.recurring || []);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : "Failed to load recurring bookings");
      console.error("Error loading recurring bookings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await fetcher.patch(`/api/recurring-bookings/${id}`, {
        is_active: !isActive,
      });
      toast.success(isActive ? "Recurring booking paused" : "Recurring booking resumed");
      loadRecurring();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to update recurring booking");
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this recurring booking?")) {
      return;
    }

    try {
      await fetcher.delete(`/api/recurring-bookings/${id}`);
      toast.success("Recurring booking cancelled");
      loadRecurring();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to cancel recurring booking");
    }
  };

  const getFrequencyLabel = (freq: string) => {
    const labels: Record<string, string> = {
      weekly: "Weekly",
      biweekly: "Bi-weekly",
      monthly: "Monthly",
    };
    return labels[freq] || freq;
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading recurring bookings..." />
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="container mx-auto px-4 py-8">
        <BackButton href="/account-settings" />
        <h1 className="text-3xl font-bold mb-6">Recurring Bookings</h1>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {recurring.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-600 mb-4">No recurring bookings</p>
                <p className="text-sm text-gray-500">
                  Create a recurring booking to automatically schedule appointments
                </p>
              </CardContent>
            </Card>
          ) : (
            recurring.map((booking) => (
              <Card key={booking.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{booking.provider.business_name}</CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={booking.is_active ? "default" : "secondary"}>
                          {booking.is_active ? "Active" : "Paused"}
                        </Badge>
                        <Badge variant="outline">{getFrequencyLabel(booking.frequency)}</Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-semibold">Start Date</p>
                        <p className="text-sm text-gray-600">
                          {new Date(booking.start_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {booking.end_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-semibold">End Date</p>
                          <p className="text-sm text-gray-600">
                            {new Date(booking.end_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-semibold">Preferred Time</p>
                        <p className="text-sm text-gray-600">{booking.preferred_time}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-semibold">Location</p>
                        <p className="text-sm text-gray-600">
                          {booking.location_type === "at_home" ? "At Home" : "At Salon"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggle(booking.id, booking.is_active)}
                    >
                      {booking.is_active ? (
                        <>
                          <Pause className="w-4 h-4 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Resume
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancel(booking.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
