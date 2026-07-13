"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, ChevronDown, ChevronUp, Clock, MapPin, Pause, Play, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import BackButton from "../components/back-button";
import type { RecurringBookingListItem, SimpleFrequency } from "./recurring-list-types";

type RecurringBooking = RecurringBookingListItem;

function preferredTimeToInputValue(preferred: string | null | undefined): string {
  const t = (preferred || "").trim();
  if (/^\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  return "10:00";
}

function normalizeFrequency(
  f: string | null | undefined,
  recurrenceRule?: string | null
): SimpleFrequency {
  const v = (f || "").toLowerCase();
  if (v === "weekly" || v === "biweekly" || v === "monthly") return v;
  const rr = (recurrenceRule || "").toUpperCase();
  if (rr.includes("FREQ=WEEKLY") && rr.includes("INTERVAL=2")) return "biweekly";
  if (rr.includes("FREQ=WEEKLY")) return "weekly";
  if (rr.includes("FREQ=MONTHLY")) return "monthly";
  return "weekly";
}

type RecurringBookingsResponse = {
  data: { recurring: RecurringBooking[] } | null;
  error: unknown;
};

type SeriesVisit = {
  id: string;
  scheduled_at: string;
  status: string;
  payment_status: string;
  booking_number?: string | null;
};

type RecurringDetailResponse = {
  data: { series_bookings?: SeriesVisit[] } | null;
  error: unknown;
};

function pickUpcomingVisits(visits: SeriesVisit[], limit = 5): SeriesVisit[] {
  const now = Date.now();
  const upcoming = visits.filter((v) => {
    const ts = new Date(v.scheduled_at).getTime();
    return Number.isFinite(ts) && ts >= now - 24 * 60 * 60 * 1000;
  });
  const sorted = [...upcoming].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
  if (sorted.length > 0) return sorted.slice(0, limit);
  return [...visits]
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    .slice(0, limit);
}

function formatVisitDate(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RecurringBookingsPage({
  initialRecurring,
}: {
  initialRecurring: RecurringBookingListItem[] | null;
}) {
  const initialSnapshot = useRef(initialRecurring);
  const [recurring, setRecurring] = useState<RecurringBooking[]>(() => initialRecurring ?? []);
  const [isLoading, setIsLoading] = useState(() => initialRecurring === null);
  const [error, setError] = useState<string | null>(null);
  const skipHydrateLoadOnce = useRef(initialRecurring !== null);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<RecurringBooking | null>(null);
  const [editPreferredTime, setEditPreferredTime] = useState("10:00");
  const [editFrequency, setEditFrequency] = useState<SimpleFrequency>("weekly");
  const [editEndDate, setEditEndDate] = useState("");
  const [editSeriesNoEnd, setEditSeriesNoEnd] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [expandedVisitsId, setExpandedVisitsId] = useState<string | null>(null);
  const [loadingVisitsId, setLoadingVisitsId] = useState<string | null>(null);
  const [visitsBySeriesId, setVisitsBySeriesId] = useState<Record<string, SeriesVisit[]>>({});

  useEffect(() => {
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      setRecurring(initialSnapshot.current ?? []);
      setIsLoading(false);
      return;
    }
    void loadRecurring();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial snapshot is fixed for this navigation
  }, []);

  const loadRecurring = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<RecurringBookingsResponse>("/api/recurring-bookings", {
        cache: "no-store",
        staleTimeMs: 0,
      });
      setRecurring(response.data?.recurring ?? []);
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

  const getFrequencyLabel = (booking: RecurringBooking) => {
    const freq = normalizeFrequency(booking.frequency, booking.recurrence_rule);
    const labels: Record<string, string> = {
      weekly: "Weekly",
      biweekly: "Bi-weekly",
      monthly: "Monthly",
    };
    return labels[freq] || String(booking.frequency || freq);
  };

  const openScheduleEditor = useCallback((booking: RecurringBooking) => {
    setEditingBooking(booking);
    setEditPreferredTime(preferredTimeToInputValue(booking.preferred_time));
    setEditFrequency(normalizeFrequency(booking.frequency, booking.recurrence_rule));
    const end = booking.end_date?.slice(0, 10) ?? "";
    setEditEndDate(end);
    setEditSeriesNoEnd(!booking.end_date);
    setScheduleSheetOpen(true);
  }, []);

  const loadSeriesVisits = useCallback(async (seriesId: string) => {
    if (visitsBySeriesId[seriesId]) return;
    setLoadingVisitsId(seriesId);
    try {
      const response = await fetcher.get<RecurringDetailResponse>(
        `/api/recurring-bookings/${seriesId}`,
        { cache: "no-store", staleTimeMs: 0 },
      );
      const raw = Array.isArray(response.data?.series_bookings) ? response.data!.series_bookings! : [];
      setVisitsBySeriesId((prev) => ({ ...prev, [seriesId]: pickUpcomingVisits(raw) }));
    } catch {
      setVisitsBySeriesId((prev) => ({ ...prev, [seriesId]: [] }));
    } finally {
      setLoadingVisitsId((current) => (current === seriesId ? null : current));
    }
  }, [visitsBySeriesId]);

  const toggleUpcomingVisits = useCallback((seriesId: string) => {
    if (expandedVisitsId === seriesId) {
      setExpandedVisitsId(null);
      return;
    }
    setExpandedVisitsId(seriesId);
    void loadSeriesVisits(seriesId);
  }, [expandedVisitsId, loadSeriesVisits]);

  const saveSchedule = async () => {
    if (!editingBooking) return;
    if (!editSeriesNoEnd && !editEndDate.trim()) {
      toast.error("Choose an end date or turn on “No end date”.");
      return;
    }
    setSavingSchedule(true);
    try {
      const payload: Record<string, unknown> = {
        preferred_time: editPreferredTime,
        frequency: editFrequency,
      };
      if (editSeriesNoEnd) {
        payload.end_date = null;
      } else if (editEndDate.trim()) {
        payload.end_date = editEndDate.trim();
      }
      await fetcher.patch(`/api/recurring-bookings/${editingBooking.id}`, payload);
      toast.success("Schedule updated");
      setScheduleSheetOpen(false);
      setEditingBooking(null);
      await loadRecurring();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to update schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading recurring bookings..." />
        </div>
    );
  }

  return (
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
              <CardContent className="py-8 text-center space-y-4">
                <p className="text-gray-600">No recurring bookings yet</p>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Book a salon and turn on &quot;Repeat this booking&quot; at checkout (web or app, signed in), or ask your provider to set up a series for you.
                </p>
                <Button asChild variant="default">
                  <Link href="/search">Find a salon</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            recurring.map((booking) => (
              <Card key={booking.id}>
                <CardHeader>
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-lg">{booking.provider.business_name}</CardTitle>
                      {booking.provider.slug ? (
                        <Link
                          href={`/partner-profile?slug=${encodeURIComponent(booking.provider.slug)}`}
                          className="text-sm font-medium text-primary hover:underline mt-1 inline-block"
                        >
                          View salon profile
                        </Link>
                      ) : null}
                      {booking.service_name && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">{booking.service_name}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant={booking.status === "cancelled" ? "secondary" : booking.is_active ? "default" : "secondary"}>
                          {booking.status === "cancelled"
                            ? "Cancelled"
                            : booking.is_active
                              ? "Active"
                              : "Paused"}
                        </Badge>
                        <Badge variant="outline">{getFrequencyLabel(booking)}</Badge>
                        {booking.payment_method && (
                          <Badge variant="outline" className="capitalize">
                            {booking.payment_method}
                          </Badge>
                        )}
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
                    {booking.end_date ? (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-semibold">End Date</p>
                          <p className="text-sm text-gray-600">
                            {new Date(booking.end_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No fixed end date — runs until you pause or cancel.</p>
                    )}
                    {booking.next_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-semibold">Next visit</p>
                          <p className="text-sm text-gray-600">
                            {new Date(booking.next_date + "T12:00:00").toLocaleDateString(undefined, {
                              weekday: "short",
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
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

                  <div className="pt-3 border-t">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm font-semibold text-foreground touch-manipulation"
                      onClick={() => toggleUpcomingVisits(booking.id)}
                    >
                      <span>Upcoming visits</span>
                      {expandedVisitsId === booking.id ? (
                        <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    {expandedVisitsId === booking.id && (
                      <div className="pb-2">
                        {loadingVisitsId === booking.id ? (
                          <p className="text-sm text-muted-foreground py-2">Loading visits…</p>
                        ) : (visitsBySeriesId[booking.id] ?? []).length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">No scheduled visits yet.</p>
                        ) : (
                          <ul className="space-y-2">
                            {(visitsBySeriesId[booking.id] ?? []).map((visit) => (
                              <li
                                key={visit.id}
                                className="rounded-md border border-border px-3 py-2 text-sm"
                              >
                                <p className="font-medium text-foreground">{formatVisitDate(visit.scheduled_at)}</p>
                                <p className="text-muted-foreground mt-0.5">
                                  {visit.status}
                                  {visit.payment_status ? ` · ${visit.payment_status}` : ""}
                                  {visit.booking_number ? ` · #${visit.booking_number}` : ""}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  {booking.status !== "cancelled" && (
                    <div className="flex flex-wrap gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="touch-manipulation min-h-10"
                        onClick={() => openScheduleEditor(booking)}
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit schedule
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="touch-manipulation min-h-10"
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
                        className="text-red-600 hover:text-red-700 touch-manipulation min-h-10"
                        onClick={() => handleCancel(booking.id)}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Sheet open={scheduleSheetOpen} onOpenChange={setScheduleSheetOpen}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto sm:max-w-md sm:mx-auto rounded-t-xl">
            <SheetHeader>
              <SheetTitle>Edit schedule</SheetTitle>
              <SheetDescription>
                Update cadence, preferred time, and optional end date. Auto-bookings follow these settings.
              </SheetDescription>
            </SheetHeader>
            {editingBooking && (
              <div className="space-y-4 py-4">
                <p className="text-sm font-medium text-foreground">
                  {editingBooking.provider.business_name}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="edit-frequency">How often</Label>
                  <Select
                    value={editFrequency}
                    onValueChange={(v) => setEditFrequency(v as SimpleFrequency)}
                  >
                    <SelectTrigger id="edit-frequency" className="touch-manipulation min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-time">Preferred time</Label>
                  <Input
                    id="edit-time"
                    type="time"
                    value={editPreferredTime}
                    onChange={(e) => setEditPreferredTime(e.target.value)}
                    className="touch-manipulation min-h-11"
                  />
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <Checkbox
                    id="edit-no-end"
                    checked={editSeriesNoEnd}
                    onCheckedChange={(c) => {
                      const on = c === true;
                      setEditSeriesNoEnd(on);
                      if (on) setEditEndDate("");
                    }}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="edit-no-end" className="font-medium cursor-pointer">
                      No end date
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Uncheck to stop the series after a specific date.
                    </p>
                  </div>
                </div>
                {!editSeriesNoEnd && (
                  <div className="space-y-2">
                    <Label htmlFor="edit-end">End date</Label>
                    <Input
                      id="edit-end"
                      type="date"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      className="touch-manipulation min-h-11"
                    />
                  </div>
                )}
              </div>
            )}
            <SheetFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 touch-manipulation"
                onClick={() => setScheduleSheetOpen(false)}
                disabled={savingSchedule}
              >
                Close
              </Button>
              <Button
                type="button"
                className="min-h-11 touch-manipulation"
                disabled={savingSchedule || !editingBooking}
                onClick={() => void saveSchedule()}
              >
                {savingSchedule ? "Saving…" : "Save changes"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
  );
}
