"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect, useRef } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, X } from "lucide-react";
import { toast } from "sonner";
import BackButton from "../components/back-button";
import type { WaitlistEntry } from "./waitlist-types";

export default function CustomerWaitlistPage({
  initialEntries,
}: {
  initialEntries: WaitlistEntry[] | null;
}) {
  const initialSnapshot = useRef(initialEntries);
  const [entries, setEntries] = useState<WaitlistEntry[]>(() => initialEntries ?? []);
  const [isLoading, setIsLoading] = useState(() => initialEntries === null);
  const [error, setError] = useState<string | null>(null);
  const skipHydrateLoadOnce = useRef(initialEntries !== null);
  const { t } = useTranslation();

  useEffect(() => {
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      setEntries(initialSnapshot.current ?? []);
      setIsLoading(false);
      return;
    }
    void loadWaitlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial snapshot is fixed for this navigation
  }, []);

  const loadWaitlist = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: { entries: WaitlistEntry[] } }>(
        "/api/waitlist",
        { staleTimeMs: 15_000 }
      );
      setEntries(response.data.entries || []);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : t("web.accountSettings.waitlist.loadFailed"));
      console.error("Error loading waitlist:", err);
    } finally {
      setIsLoading(false);
    }
  };

   
  const handleRemove = async (_entryId: string) => {
    if (!confirm(t("web.accountSettings.waitlist.removeConfirm"))) {
      return;
    }

    try {
      // Would need DELETE endpoint
      toast.info(t("web.accountSettings.waitlist.removing"));
      // await fetcher.delete(`/api/waitlist/${entryId}`);
      // toast.success("Removed from waitlist");
      // loadWaitlist();
    } catch {
      toast.error(t("web.accountSettings.waitlist.removeFailed"));
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
        {status === "waiting" ? t("web.accountSettings.waitlist.statusWaiting") : status === "contacted" ? t("web.accountSettings.waitlist.statusContacted") : status === "booked" ? t("web.accountSettings.waitlist.statusBooked") : status === "cancelled" ? t("web.accountSettings.waitlist.statusCancelled") : status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage={t("web.accountSettings.waitlist.loading")} />
        </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
        <BackButton href="/account-settings" />
        <h1 className="text-3xl font-bold mb-6">{t("web.accountSettings.waitlist.title")}</h1>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {entries.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-600 mb-4">{t("web.accountSettings.waitlist.emptyTitle")}</p>
                <p className="text-sm text-gray-500">
{t("web.accountSettings.waitlist.emptyHint")}
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
                          {entry.preferred_time_start || t("web.accountSettings.waitlist.anyTime")} - {entry.preferred_time_end || t("web.accountSettings.waitlist.anyTime")}
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
                        <X className="w-4 h-4 me-1" />
{t("web.accountSettings.waitlist.remove")}
                      </Button>
                    </div>
                  )}

                  {entry.status === "booked" && (
                    <div className="pt-4 border-t">
                      <Button variant="default" size="sm" asChild>
                        <a href={`/account-settings/bookings`}>{t("web.accountSettings.waitlist.viewBooking")}</a>
                      </Button>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-2">
{t("web.accountSettings.waitlist.joined", { date: new Date(entry.created_at).toLocaleDateString() })}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
  );
}
