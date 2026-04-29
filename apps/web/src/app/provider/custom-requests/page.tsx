"use client";

import React, { useEffect, useMemo, useState } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";

type RequestItem = {
  id: string;
  description: string;
  status: string;
  created_at: string;
  preferred_start_at?: string | null;
  duration_minutes?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
  location_type?: string;
  customer?: { id: string; full_name?: string | null; email?: string | null; avatar_url?: string | null };
  offers?: Array<{ id: string; status: string; price: number; currency: string; created_at: string }>;
  attachments?: Array<{ id: string; url: string }>;
};

type AvailableSlotRow = { time: string; available?: boolean };

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromDateTimeLocal(value: string): { date: string; time: string } {
  const [date, rawTime] = value.split("T");
  return { date: date || toDateKey(new Date()), time: (rawTime || "10:00").slice(0, 5) };
}

function toDateTimeLocal(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}`;
}

export default function ProviderCustomRequestsPage() {
  const { bundle } = useConfigBundle();
  const { selectedLocationId } = useProviderPortal();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [items, setItems] = useState<RequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RequestItem | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);

  const [price, setPrice] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [expirationAt, setExpirationAt] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [travelFee, setTravelFee] = useState<string>("");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlotRow[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const locQ = selectedLocationId ? `?location_id=${encodeURIComponent(selectedLocationId)}` : "";
      const res = await fetcher.get<{ data: RequestItem[] }>(`/api/provider/custom-requests${locQ}`);
      setItems(res.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load custom requests";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedLocationId]);

  const loadOfferRefs = async () => {
    const [staffRes, locationsRes] = await Promise.allSettled([
      fetcher.get<{ data: Array<{ id: string; name: string }> }>(
        selectedLocationId ? `/api/provider/team?location_id=${encodeURIComponent(selectedLocationId)}` : "/api/provider/team",
      ),
      fetcher.get<{ data: Array<{ id: string; name: string }> }>("/api/provider/locations"),
    ]);
    if (staffRes.status === "fulfilled") setStaffMembers(staffRes.value.data || []);
    if (locationsRes.status === "fulfilled") setLocations(locationsRes.value.data || []);
  };

  const openOffer = (req: RequestItem) => {
    setSelected(req);
    setOfferOpen(true);
    setPrice("");
    setDurationMinutes(Number(req.duration_minutes || 60));
    const exp = new Date();
    exp.setDate(exp.getDate() + 2);
    setExpirationAt(exp.toISOString().slice(0, 16));
    setNotes("");
    setTravelFee("");
    setStaffId(null);
    setLocationId(null);
    const preferred = req.preferred_start_at ? new Date(req.preferred_start_at) : new Date();
    if (!Number.isFinite(preferred.getTime()) || preferred.getTime() < Date.now()) preferred.setHours(preferred.getHours() + 1, 0, 0, 0);
    setScheduledAt(preferred.toISOString().slice(0, 16));
    void loadOfferRefs();
  };

  const dateOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);
  const selectedSlotParts = fromDateTimeLocal(scheduledAt || toDateTimeLocal(toDateKey(new Date()), "10:00"));

  useEffect(() => {
    if (!offerOpen || !selected) return;
    const duration = Number(durationMinutes || 60);
    if (!Number.isFinite(duration) || duration < 15) return;
    let cancelled = false;
    setLoadingSlots(true);
    const params = new URLSearchParams({
      date: selectedSlotParts.date,
      duration_minutes: String(duration),
      mode: selected.location_type === "at_home" ? "mobile" : "salon",
      travel_buffer: selected.location_type === "at_home" ? "30" : "0",
    });
    if (staffId) params.set("staff_ids", staffId);
    if (selected.location_type !== "at_home" && locationId) params.set("location_id", locationId);
    fetcher
      .get<{ data?: { slots?: string[]; slot_grid?: AvailableSlotRow[] } }>(`/api/provider/bookings/available-slots?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        const grid = res.data?.slot_grid;
        const rows = Array.isArray(grid) && grid.length > 0
          ? grid
          : (res.data?.slots ?? []).map((time) => ({ time, available: true }));
        setAvailableSlots(rows);
        const available = rows.filter((slot) => slot.available !== false).map((slot) => slot.time.slice(0, 5));
        if (available.length > 0 && !available.includes(selectedSlotParts.time)) {
          setScheduledAt(toDateTimeLocal(selectedSlotParts.date, available[0]));
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [durationMinutes, locationId, offerOpen, selected, selectedSlotParts.date, selectedSlotParts.time, staffId]);

  const sendOffer = async () => {
    if (!selected) return;
    try {
      setIsSubmitting(true);
      const payload: Record<string, unknown> = {
        price: Number(price || 0),
        currency: tenantCurrency,
        duration_minutes: Number(durationMinutes || 60),
        expiration_at: expirationAt,
        notes: notes || null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        staff_id: staffId || null,
        location_id: selected.location_type !== "at_home" ? locationId || null : null,
      };
      if (selected.location_type === "at_home" && travelFee.trim() !== "") {
        const fee = Number(travelFee);
        if (!Number.isNaN(fee) && fee >= 0) payload.travel_fee = fee;
      }
      await fetcher.post(`/api/provider/custom-requests/${selected.id}/offers`, payload);
      toast.success("Offer sent");
      setOfferOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send offer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-2">Custom Requests</h1>
          <p className="text-gray-600">Respond with tailored offers and convert them into bookings.</p>
        </div>

        {isLoading ? (
          <LoadingTimeout loadingMessage="Loading custom requests..." />
        ) : error ? (
          <EmptyState title="Failed to load" description={error} action={{ label: "Retry", onClick: load }} />
        ) : items.length === 0 ? (
          <EmptyState title="No custom requests yet" description="Customer custom requests will appear here." />
        ) : (
          <div className="space-y-4">
            {items.map((r) => (
              <div key={r.id} className="bg-white border rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-600">
                      {r.customer?.full_name || r.customer?.email || "Customer"} •{" "}
                      <span className="capitalize">{r.status}</span>
                    </div>
                    <div className="font-medium mt-1 break-words">{r.description}</div>
                    <div className="text-sm text-gray-600 mt-2">
                      {r.preferred_start_at ? `Preferred: ${new Date(r.preferred_start_at).toLocaleString()}` : "Preferred: not set"} •{" "}
                      {r.location_type || "at_salon"}
                      {r.budget_min != null || r.budget_max != null ? ` • Budget: ${tenantCurrency} ${r.budget_min ?? "0"} – ${tenantCurrency} ${r.budget_max ?? "∞"}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" onClick={() => openOffer(r)}>
                      Send Offer
                    </Button>
                  </div>
                </div>
                {r.offers && r.offers.length > 0 ? (
                  <div className="mt-3 text-sm text-gray-600">
                    Offers:{" "}
                    {r.offers.map((o) => `${o.currency} ${o.price} (${o.status})`).join(" • ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Send Custom Offer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Price ({tenantCurrency})</Label>
                <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input type="number" min={15} step={15} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Expiration</Label>
                  <Input type="datetime-local" value={expirationAt} onChange={(e) => setExpirationAt(e.target.value)} />
                </div>
              </div>
              {selected?.location_type === "at_home" && (
                <div className="space-y-2">
                  <Label>Travel fee ({tenantCurrency}, optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={travelFee}
                    onChange={(e) => setTravelFee(e.target.value)}
                    placeholder="0"
                  />
                </div>
              )}
              {selected?.location_type !== "at_home" && locations.length > 0 && (
                <div className="space-y-2">
                  <Label>Venue (optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {locations.map((loc) => {
                      const active = locationId === loc.id;
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => setLocationId(active ? null : loc.id)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            active ? "border-primary bg-primary/10 text-primary" : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          {loc.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {staffMembers.length > 0 && (
                <div className="space-y-2">
                  <Label>Staff (optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {staffMembers.map((staff) => {
                      const active = staffId === staff.id;
                      return (
                        <button
                          key={staff.id}
                          type="button"
                          onClick={() => setStaffId(active ? null : staff.id)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            active ? "border-primary bg-primary/10 text-primary" : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          {staff.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Appointment slot</Label>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-xs text-gray-500">Choose from availability-engine slots so the accepted offer can convert cleanly to a booking.</p>
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {dateOptions.map((d) => {
                      const key = toDateKey(d);
                      const active = selectedSlotParts.date === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setScheduledAt(toDateTimeLocal(key, selectedSlotParts.time))}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            active ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {loadingSlots ? (
                      <p className="text-xs text-gray-500">Loading available times...</p>
                    ) : availableSlots.length === 0 ? (
                      <p className="text-xs text-amber-700">No available slots for this date. Try another day, staff member, or duration.</p>
                    ) : (
                      availableSlots.slice(0, 32).map((slot) => {
                        const time = slot.time.slice(0, 5);
                        const available = slot.available !== false;
                        const active = selectedSlotParts.time === time;
                        return (
                          <button
                            key={slot.time}
                            type="button"
                            disabled={!available}
                            onClick={() => setScheduledAt(toDateTimeLocal(selectedSlotParts.date, time))}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                              active
                                ? "border-emerald-700 bg-emerald-600 text-white"
                                : available
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-gray-200 bg-gray-100 text-gray-400"
                            }`}
                          >
                            {time}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOfferOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={sendOffer} disabled={isSubmitting || !price}>
                  {isSubmitting ? "Sending..." : "Send Offer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}

