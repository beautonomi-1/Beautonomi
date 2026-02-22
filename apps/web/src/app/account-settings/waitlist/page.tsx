"use client";

import React, { useState, useEffect } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, X } from "lucide-react";
import AuthGuard from "@/components/auth/auth-guard";
import { toast } from "sonner";
import BackButton from "../components/back-button";

interface WaitlistEntry {
  id: string;
  provider_id: string;
  service_id: string | null;
  staff_id: string | null;
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  status: "waiting" | "contacted" | "booked" | "cancelled";
  created_at: string;
  provider: {
    id: string;
    business_name: string;
    slug: string;
  };
  service: {
    id: string;
    title: string;
  } | null;
  staff: {
    id: string;
    name: string;
  } | null;
}

export default function CustomerWaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWaitlist();
  }, []);

  const loadWaitlist = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: { entries: WaitlistEntry[] } }>(
        "/api/waitlist",
        { cache: "no-store" }
      );
      setEntries(response.data.entries || []);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : "Failed to load waitlist");
      console.error("Error loading waitlist:", err);
    } finally {
      setIsLoading(false);
    }
  };

   
  const handleRemove = async (_entryId: string) => {
    if (!confirm("Are you sure you want to remove yourself from the waitlist?")) {
      return;
    }

    try {
      // Would need DELETE endpoint
      toast.info("Removing from waitlist...");
      // await fetcher.delete(`/api/waitlist/${entryId}`);
      // toast.success("Removed from waitlist");
      // loadWaitlist();
    } catch {
      toast.error("Failed to remove from waitlist");
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
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading waitlist..." />
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="container mx-auto px-4 py-8">
        <BackButton href="/account-settings" />
        <h1 className="text-3xl font-bold mb-6">My Waitlist</h1>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {entries.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-600 mb-4">You&apos;re not on any waitlists</p>
                <p className="text-sm text-gray-500">
                  Join a waitlist when a service is fully booked to be notified when slots become available
                </p>
              </CardContent>
            </Card>
          ) : (
            entries.map((entry) => (
              <Card key={entry.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{entry.provider.business_name}</CardTitle>
                      {entry.service && (
                        <p className="text-sm text-gray-600 mt-1">{entry.service.title}</p>
                      )}
                    </div>
                    {getStatusBadge(entry.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {entry.preferred_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <p className="text-sm text-gray-600">
                          {new Date(entry.preferred_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {(entry.preferred_time_start || entry.preferred_time_end) && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <p className="text-sm text-gray-600">
                          {entry.preferred_time_start || "Any"} - {entry.preferred_time_end || "Any"}
                        </p>
                      </div>
                    )}
                  </div>

                  {entry.status === "waiting" && (
                    <div className="flex gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemove(entry.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  )}

                  {entry.status === "booked" && (
                    <div className="pt-4 border-t">
                      <Button variant="default" size="sm" asChild>
                        <a href={`/account-settings/bookings`}>View Booking</a>
                      </Button>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-2">
                    Joined {new Date(entry.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
