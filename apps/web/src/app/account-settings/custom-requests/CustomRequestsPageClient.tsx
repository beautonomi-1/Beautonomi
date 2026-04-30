"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { mergeCurrencyChoiceCodes, currencySelectLabel } from "@/lib/locale/currency";

import React, { useEffect, useMemo, useRef, useState } from "react";
import BackButton from "../components/back-button";
import Breadcrumb from "../components/breadcrumb";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import type {
  CustomRequestListItem,
  CustomRequestsPageInitial,
  ProviderClientRow,
} from "./custom-requests-page-types";

type CustomRequest = CustomRequestListItem;
type Client = ProviderClientRow;

type GlobalCategory = { id: string; name: string };
type ProviderSlotRow = { time: string; available?: boolean };

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDateTimeLocal(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}`;
}

function fromDateTimeLocal(value: string): { date: string; time: string } {
  const [date, time] = value.split("T");
  return { date: date || toDateKey(new Date()), time: (time || "10:00").slice(0, 5) };
}

function normalizeCategories(raw: unknown): GlobalCategory[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw as GlobalCategory[];
  const root = raw as { data?: unknown; global_categories?: unknown };
  if (Array.isArray(root.global_categories)) return root.global_categories as GlobalCategory[];
  if (Array.isArray(root.data)) return root.data as GlobalCategory[];
  if (root.data && typeof root.data === "object" && Array.isArray((root.data as { categories?: unknown }).categories)) {
    return (root.data as { categories: GlobalCategory[] }).categories;
  }
  return [];
}

function normalizeProviderSlots(raw: unknown): ProviderSlotRow[] {
  const root = raw as { data?: { slots?: unknown; slot_grid?: unknown }; slots?: unknown; slot_grid?: unknown } | null | undefined;
  const grid = Array.isArray(root?.slot_grid)
    ? root?.slot_grid
    : Array.isArray(root?.data?.slot_grid)
      ? root.data.slot_grid
      : null;
  if (grid) return grid as ProviderSlotRow[];
  const slots = Array.isArray(root?.slots)
    ? root?.slots
    : Array.isArray(root?.data?.slots)
      ? root.data.slots
      : [];
  return (slots as string[]).map((time) => ({ time, available: true }));
}

export default function CustomRequestsPageClient({
  initial,
}: {
  initial: CustomRequestsPageInitial | null;
}) {
  const { role } = useAuth();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const isProvider =
    role === "provider_owner" ||
    role === "provider_staff" ||
    (role == null && initial?.mode === "provider");

  const [items, setItems] = useState<CustomRequest[]>(() => initial?.items ?? []);
  const [isLoading, setIsLoading] = useState(() => initial === null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>(() => initial?.clients ?? []);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string }>>(
    () => initial?.staffList ?? [],
  );
  const [locationsList, setLocationsList] = useState<Array<{ id: string; name: string }>>(
    () => initial?.locationsList ?? [],
  );
  const [categories, setCategories] = useState<GlobalCategory[]>([]);
  const [createSlots, setCreateSlots] = useState<ProviderSlotRow[]>([]);
  const [offerSlots, setOfferSlots] = useState<ProviderSlotRow[]>([]);
  const [loadingCreateSlots, setLoadingCreateSlots] = useState(false);
  const [loadingOfferSlots, setLoadingOfferSlots] = useState(false);
  const skipHydrateLoadOnce = useRef(initial !== null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state for creating new custom offer
  const [formData, setFormData] = useState({
    customer_id: "",
    description: "",
    location_type: "at_salon" as "at_home" | "at_salon",
    price: "",
    currency: tenantCurrency,
    duration_minutes: "60",
    expiration_days: "7",
    notes: "",
    preferred_start_at: "",
    service_category_id: "",
    staff_id: "",
    location_id: "",
  });

  // Form state for creating offer for existing request
  const [offerFormData, setOfferFormData] = useState({
    price: "",
    currency: tenantCurrency,
    duration_minutes: "60",
    expiration_days: "7",
    notes: "",
    staff_id: "",
    location_id: "",
    scheduled_at: "",
    travel_fee: "",
  });

  const currencySelectOptions = useMemo(
    () => mergeCurrencyChoiceCodes(tenantCurrency, formData.currency, offerFormData.currency),
    [tenantCurrency, formData.currency, offerFormData.currency]
  );
  const dateOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);
  const createSlotParts = fromDateTimeLocal(formData.preferred_start_at || toDateTimeLocal(toDateKey(new Date()), "10:00"));
  const offerSlotParts = fromDateTimeLocal(offerFormData.scheduled_at || toDateTimeLocal(toDateKey(new Date()), "10:00"));

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const endpoint = isProvider ? "/api/provider/custom-requests" : "/api/me/custom-requests";
      const res = await fetcher.get<{ data: CustomRequest[] }>(endpoint, { staleTimeMs: 15_000 });
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

  const loadClients = async () => {
    if (!isProvider) return;
    try {
      setIsLoadingClients(true);
      const res = await fetcher.get<{ data: Client[] }>("/api/provider/clients", { staleTimeMs: 15_000 });
      setClients(res.data || []);
    } catch (err) {
      console.error("Failed to load clients:", err);
      toast.error("Failed to load clients");
    } finally {
      setIsLoadingClients(false);
    }
  };

  const loadStaffAndLocations = async () => {
    if (!isProvider) return;
    try {
      const [staffRes, locRes] = await Promise.all([
        fetcher.get<{ data: Array<{ id: string; name: string }> }>("/api/provider/staff", { staleTimeMs: 15_000 }),
        fetcher.get<{ data: Array<{ id: string; name: string }> }>("/api/provider/locations", { staleTimeMs: 15_000 }),
      ]);
      setStaffList(staffRes.data?.map((s) => ({ id: s.id, name: s.name })) ?? []);
      setLocationsList(locRes.data?.map((l) => ({ id: l.id, name: l.name })) ?? []);
    } catch (err) {
      console.error("Failed to load staff/locations:", err);
    }
  };

  const loadCategories = async () => {
    if (!isProvider) return;
    try {
      const res = await fetcher.get<unknown>("/api/public/categories/global", { staleTimeMs: 60_000 });
      setCategories(normalizeCategories(res));
    } catch (err) {
      console.error("Failed to load custom offer categories:", err);
    }
  };

  useEffect(() => {
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      void Promise.resolve().then(() => setIsLoading(false));
      return;
    }
    void Promise.resolve().then(() => load());
    if (isProvider) {
      void Promise.resolve().then(() => {
        void loadClients();
        void loadStaffAndLocations();
        void loadCategories();
      });
    }
  }, [isProvider]); // eslint-disable-line react-hooks/exhaustive-deps -- load when isProvider changes

  useEffect(() => {
    if (!showCreateModal) return;
    const duration = Number(formData.duration_minutes || 60);
    if (!Number.isFinite(duration) || duration < 15) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setLoadingCreateSlots(true);
    });
    const params = new URLSearchParams({
      date: createSlotParts.date,
      duration_minutes: String(duration),
      mode: formData.location_type === "at_home" ? "mobile" : "salon",
      travel_buffer: formData.location_type === "at_home" ? "30" : "0",
    });
    if (formData.staff_id) params.set("staff_ids", formData.staff_id);
    if (formData.location_type === "at_salon" && formData.location_id) params.set("location_id", formData.location_id);
    fetcher
      .get<unknown>(`/api/provider/bookings/available-slots?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        const rows = normalizeProviderSlots(res);
        setCreateSlots(rows);
        const available = rows.filter((slot) => slot.available !== false).map((slot) => slot.time.slice(0, 5));
        if (available.length > 0 && !available.includes(createSlotParts.time)) {
          setFormData((prev) => ({ ...prev, preferred_start_at: toDateTimeLocal(createSlotParts.date, available[0]) }));
        }
      })
      .catch(() => {
        if (!cancelled) setCreateSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCreateSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [createSlotParts.date, createSlotParts.time, formData.duration_minutes, formData.location_id, formData.location_type, formData.staff_id, showCreateModal]);

  useEffect(() => {
    if (!showOfferModal || !selectedRequestId) return;
    const selectedReq = items.find((r) => r.id === selectedRequestId);
    const duration = Number(offerFormData.duration_minutes || selectedReq?.duration_minutes || 60);
    if (!Number.isFinite(duration) || duration < 15) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setLoadingOfferSlots(true);
    });
    const params = new URLSearchParams({
      date: offerSlotParts.date,
      duration_minutes: String(duration),
      mode: selectedReq?.location_type === "at_home" ? "mobile" : "salon",
      travel_buffer: selectedReq?.location_type === "at_home" ? "30" : "0",
    });
    if (offerFormData.staff_id) params.set("staff_ids", offerFormData.staff_id);
    if (selectedReq?.location_type !== "at_home" && offerFormData.location_id) params.set("location_id", offerFormData.location_id);
    fetcher
      .get<unknown>(`/api/provider/bookings/available-slots?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        const rows = normalizeProviderSlots(res);
        setOfferSlots(rows);
        const available = rows.filter((slot) => slot.available !== false).map((slot) => slot.time.slice(0, 5));
        if (available.length > 0 && !available.includes(offerSlotParts.time)) {
          setOfferFormData((prev) => ({ ...prev, scheduled_at: toDateTimeLocal(offerSlotParts.date, available[0]) }));
        }
      })
      .catch(() => {
        if (!cancelled) setOfferSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingOfferSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [items, offerFormData.duration_minutes, offerFormData.location_id, offerFormData.staff_id, offerSlotParts.date, offerSlotParts.time, selectedRequestId, showOfferModal]);

  const [depositChoiceOfferId, setDepositChoiceOfferId] = useState<string | null>(null);

  const acceptAndPay = async (offerId: string, paymentOption: "full" | "deposit" = "full") => {
    try {
      const res = await fetcher.post<{ data: { paymentUrl: string } }>(`/api/me/custom-offers/${offerId}/accept`, { payment_option: paymentOption });
      const url = res.data.paymentUrl;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error("No payment URL returned");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to start payment");
    }
  };

  const handleCreateOffer = async () => {
    if (!formData.customer_id || !formData.description || !formData.price) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsSubmitting(true);
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + parseInt(formData.expiration_days));

      const payload = {
        customer_id: formData.customer_id,
        description: formData.description,
        location_type: formData.location_type,
        price: parseFloat(formData.price),
        currency: formData.currency,
        duration_minutes: parseInt(formData.duration_minutes),
        expiration_at: expirationDate.toISOString(),
        notes: formData.notes || null,
        preferred_start_at: formData.preferred_start_at || null,
        service_category_id: formData.service_category_id || null,
        staff_id: formData.staff_id || null,
        location_id: formData.location_id || null,
      };

      await fetcher.post("/api/provider/custom-offers/create", payload);
      toast.success("Custom offer sent successfully!");
      setShowCreateModal(false);
      setFormData({
        customer_id: "",
        description: "",
        location_type: "at_salon",
        price: "",
        currency: tenantCurrency,
        duration_minutes: "60",
        expiration_days: "7",
        notes: "",
        preferred_start_at: "",
        service_category_id: "",
        staff_id: "",
        location_id: "",
      });
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create custom offer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openOfferModal = (requestId: string) => {
    const selectedReq = items.find((r) => r.id === requestId);
    setSelectedRequestId(requestId);
    setOfferFormData({
      price: "",
      currency: tenantCurrency,
      duration_minutes: String(selectedReq?.duration_minutes || 60),
      expiration_days: "7",
      notes: "",
      staff_id: "",
      location_id: "",
      scheduled_at: selectedReq?.preferred_start_at ? selectedReq.preferred_start_at.slice(0, 16) : "",
      travel_fee: "",
    });
    setShowOfferModal(true);
  };

  const handleCreateOfferForRequest = async () => {
    if (!selectedRequestId || !offerFormData.price) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsSubmitting(true);
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + parseInt(offerFormData.expiration_days));

      const payload: Record<string, unknown> = {
        price: parseFloat(offerFormData.price),
        currency: offerFormData.currency,
        duration_minutes: parseInt(offerFormData.duration_minutes),
        expiration_at: expirationDate.toISOString(),
        notes: offerFormData.notes || null,
        staff_id: offerFormData.staff_id || null,
        location_id: offerFormData.location_id || null,
        scheduled_at: offerFormData.scheduled_at ? new Date(offerFormData.scheduled_at).toISOString() : null,
      };
      const selectedReq = items.find((r) => r.id === selectedRequestId);
      if (selectedReq?.location_type === "at_home" && offerFormData.travel_fee.trim() !== "") {
        const fee = parseFloat(offerFormData.travel_fee);
        if (!Number.isNaN(fee) && fee >= 0) payload.travel_fee = fee;
      }

      await fetcher.post(`/api/provider/custom-requests/${selectedRequestId}/offers`, payload);
      toast.success("Offer created successfully!");
      setShowOfferModal(false);
      setSelectedRequestId(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create offer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[950px] mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-12">
        <BackButton href="/account-settings" />
        <Breadcrumb items={[{ label: "Account", href: "/account-settings" }, { label: "Custom Requests" }]} />

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Custom Requests</h1>
          {isProvider && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Custom Offer
            </Button>
          )}
        </div>

        {isProvider && (
          <p className="text-sm text-gray-600 mb-6">
            Set venue, staff, and appointment time when creating offers so the booking appears on the calendar and is assigned correctly once the customer pays.
          </p>
        )}

        {isLoading ? (
          <LoadingTimeout loadingMessage="Loading custom requests..." />
        ) : error ? (
          <EmptyState
            title="Failed to load"
            description={error}
            action={{ label: "Retry", onClick: load }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title={isProvider ? "No custom requests yet" : "No custom requests yet"}
            description={
              isProvider
                ? "Customer custom requests will appear here."
                : "Request a custom service from a provider to receive a tailored offer."
            }
          />
        ) : (
          <div className="space-y-4">
            {items.map((r) => (
              <div key={r.id} className="border rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600">
                      {isProvider ? (
                        <>
                          {r.customer?.full_name || r.customer?.email || "Customer"} •{" "}
                          <span className="capitalize">{r.status}</span>
                        </>
                      ) : (
                        <>
                          {r.provider?.business_name ? r.provider.business_name : "Provider"} •{" "}
                          <span className="capitalize">{r.status}</span>
                        </>
                      )}
                    </div>
                    <div className="font-medium mt-1">{r.description}</div>
                    <div className="text-sm text-gray-600 mt-2 space-y-0.5">
                      <span>
                        {r.preferred_start_at ? `Preferred: ${new Date(r.preferred_start_at).toLocaleString()}` : "Preferred: not set"} •{" "}
                        {r.location_type === "at_salon" ? "At salon" : "At home"}
                        {r.budget_min != null || r.budget_max != null
                          ? ` • Budget: ${r.budget_min ?? ""} - ${r.budget_max ?? ""}`
                          : ""}
                      </span>
                      {r.location_type === "at_home" && (r.address_line1 || r.address_city || r.address_country) && (
                        <div className="text-gray-500">
                          Address: {[r.address_line1, r.address_line2, r.address_city, r.address_state, r.address_country].filter(Boolean).join(", ") || "—"}
                        </div>
                      )}
                    </div>
                  </div>
                  {isProvider && r.status === "pending" && (!r.offers || r.offers.length === 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openOfferModal(r.id)}
                    >
                      Create Offer
                    </Button>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  {r.offers && r.offers.length > 0 ? (
                    r.offers.map((o) => (
                      <div key={o.id} className="border rounded-md p-3 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            Offer: {o.currency} {o.price} • {o.duration_minutes} mins
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            Expires: {new Date(o.expiration_at).toLocaleString()} • <span className="capitalize">{o.status}</span>
                          </div>
                          {(o.location?.name || o.staff?.name) && (
                            <div className="text-sm text-gray-600 mt-1">
                              {o.location?.name && <span>Venue: {o.location.name}</span>}
                              {o.location?.name && o.staff?.name && " • "}
                              {o.staff?.name && <span>Staff: {o.staff.name}</span>}
                            </div>
                          )}
                          {(o.scheduled_at ?? r.preferred_start_at) && (
                            <div className="text-sm text-gray-600">
                              Scheduled: {new Date(o.scheduled_at ?? r.preferred_start_at!).toLocaleString()}
                            </div>
                          )}
                          {o.notes ? <div className="text-sm mt-1">{o.notes}</div> : null}
                        </div>
                        {!isProvider && (
                          <div className="flex gap-2">
                            {o.status === "paid" ? (
                              <Button variant="secondary" disabled>
                                Paid
                              </Button>
                            ) : ["withdrawn", "declined", "expired", "accepted"].includes(
                                String(o.status || "").toLowerCase()
                              ) ? (
                              <Button variant="secondary" disabled className="capitalize">
                                {o.status === "withdrawn" ? "Withdrawn" : o.status}
                              </Button>
                            ) : (
                              <Button onClick={() => setDepositChoiceOfferId(o.id)}>Accept & Pay</Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-600">
                      {isProvider ? "No offers sent yet." : "No offers yet."}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Custom Offer Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Create Custom Offer</DialogTitle>
              <DialogDescription>
                Send a tailored service offer to a client. They can review and accept it to create a booking.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="customer">Client *</Label>
                <Select
                  value={formData.customer_id}
                  onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingClients ? (
                      <SelectItem value="loading" disabled>Loading clients...</SelectItem>
                    ) : clients.length === 0 ? (
                      <SelectItem value="none" disabled>No clients found</SelectItem>
                    ) : (
                      clients.map((client) => (
                        <SelectItem key={client.customer_id} value={client.customer_id}>
                          {client.customer?.full_name || client.customer?.email || "Unknown"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description">Service Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the custom service you're offering..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  maxLength={4000}
                />
                <p className="text-xs text-gray-500 mt-1">{formData.description.length}/4000 characters</p>
              </div>

              {categories.length > 0 && (
                <div>
                  <Label>Service category</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, service_category_id: "" })}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${!formData.service_category_id ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-700"}`}
                    >
                      Any category
                    </button>
                    {categories.map((category) => {
                      const active = formData.service_category_id === category.id;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, service_category_id: active ? "" : category.id })}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${active ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-700"}`}
                        >
                          {category.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location_type">Location Type</Label>
                  <Select
                    value={formData.location_type}
                    onValueChange={(value: "at_home" | "at_salon") =>
                      setFormData({ ...formData, location_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="at_salon">At Salon</SelectItem>
                      <SelectItem value="at_home">At Home</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="duration_minutes">Duration (minutes) *</Label>
                  <Input
                    id="duration_minutes"
                    type="number"
                    min="15"
                    max="480"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                  />
                </div>
              </div>

              <div className={`grid gap-4 ${formData.location_type === "at_salon" ? "grid-cols-2" : "grid-cols-1"}`}>
                {formData.location_type === "at_salon" && (
                  <div>
                    <Label htmlFor="venue">Venue</Label>
                    <Select
                      value={formData.location_id || "none"}
                      onValueChange={(v) => setFormData({ ...formData, location_id: v === "none" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select venue" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No specific venue</SelectItem>
                        {locationsList.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label htmlFor="staff">Assigned Staff</Label>
                  <Select
                    value={formData.staff_id || "none"}
                    onValueChange={(v) => setFormData({ ...formData, staff_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific staff</SelectItem>
                      {staffList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Price *</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencySelectOptions.map((code) => (
                        <SelectItem key={code} value={code}>
                          {currencySelectLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="expiration_days">Offer Expires In (days)</Label>
                  <Input
                    id="expiration_days"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.expiration_days}
                    onChange={(e) => setFormData({ ...formData, expiration_days: e.target.value })}
                  />
                </div>

                <div>
                  <Label>Appointment slot</Label>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {dateOptions.map((d) => {
                      const key = toDateKey(d);
                      const active = createSlotParts.date === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFormData({ ...formData, preferred_start_at: toDateTimeLocal(key, createSlotParts.time) })}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-600"}`}
                        >
                          {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {loadingCreateSlots ? (
                      <span className="text-xs text-gray-500">Loading slots...</span>
                    ) : createSlots.length === 0 ? (
                      <span className="text-xs text-amber-700">No available slots for this date.</span>
                    ) : (
                      createSlots.filter((slot) => slot.available !== false).slice(0, 24).map((slot) => {
                        const time = slot.time.slice(0, 5);
                        const active = createSlotParts.time === time;
                        return (
                          <button
                            key={time}
                            type="button"
                            onClick={() => setFormData({ ...formData, preferred_start_at: toDateTimeLocal(createSlotParts.date, time) })}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-emerald-700 bg-emerald-600 text-white" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                          >
                            {time}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Additional Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any additional information about this offer..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  maxLength={4000}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateOffer} disabled={isSubmitting}>
                  {isSubmitting ? "Sending..." : "Send Offer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Offer for Existing Request Modal */}
        <Dialog open={showOfferModal} onOpenChange={setShowOfferModal}>
          <DialogContent className="max-w-[95vw] sm:max-w-xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Create Offer</DialogTitle>
              <DialogDescription>
                Create a custom offer for this request. The customer will be notified and can accept it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="offer_venue">Venue (for at salon)</Label>
                  <Select
                    value={offerFormData.location_id || "none"}
                    onValueChange={(v) => setOfferFormData({ ...offerFormData, location_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select venue" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific venue</SelectItem>
                      {locationsList.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="offer_staff">Assigned Staff</Label>
                  <Select
                    value={offerFormData.staff_id || "none"}
                    onValueChange={(v) => setOfferFormData({ ...offerFormData, staff_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific staff</SelectItem>
                      {staffList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Appointment slot</Label>
                <p className="text-xs text-gray-500 mt-1">When the customer pays, the booking will show on the calendar at this time.</p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {dateOptions.map((d) => {
                    const key = toDateKey(d);
                    const active = offerSlotParts.date === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setOfferFormData({ ...offerFormData, scheduled_at: toDateTimeLocal(key, offerSlotParts.time) })}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-600"}`}
                      >
                        {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {loadingOfferSlots ? (
                    <span className="text-xs text-gray-500">Loading slots...</span>
                  ) : offerSlots.length === 0 ? (
                    <span className="text-xs text-amber-700">No available slots for this date.</span>
                  ) : (
                    offerSlots.filter((slot) => slot.available !== false).slice(0, 24).map((slot) => {
                      const time = slot.time.slice(0, 5);
                      const active = offerSlotParts.time === time;
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() => setOfferFormData({ ...offerFormData, scheduled_at: toDateTimeLocal(offerSlotParts.date, time) })}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-emerald-700 bg-emerald-600 text-white" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                        >
                          {time}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {selectedRequestId && items.find((r) => r.id === selectedRequestId)?.location_type === "at_home" && (
                <div>
                  <Label htmlFor="offer_travel_fee">Travel fee (optional)</Label>
                  <Input
                    id="offer_travel_fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={offerFormData.travel_fee}
                    onChange={(e) => setOfferFormData({ ...offerFormData, travel_fee: e.target.value })}
                    placeholder="0"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="offer_price">Price *</Label>
                  <Input
                    id="offer_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={offerFormData.price}
                    onChange={(e) => setOfferFormData({ ...offerFormData, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label htmlFor="offer_currency">Currency</Label>
                  <Select
                    value={offerFormData.currency}
                    onValueChange={(value) => setOfferFormData({ ...offerFormData, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencySelectOptions.map((code) => (
                        <SelectItem key={code} value={code}>
                          {currencySelectLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="offer_duration_minutes">Duration (minutes) *</Label>
                  <Input
                    id="offer_duration_minutes"
                    type="number"
                    min="15"
                    max="480"
                    value={offerFormData.duration_minutes}
                    onChange={(e) => setOfferFormData({ ...offerFormData, duration_minutes: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="offer_expiration_days">Offer Expires In (days)</Label>
                  <Input
                    id="offer_expiration_days"
                    type="number"
                    min="1"
                    max="30"
                    value={offerFormData.expiration_days}
                    onChange={(e) => setOfferFormData({ ...offerFormData, expiration_days: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="offer_notes">Additional Notes (optional)</Label>
                <Textarea
                  id="offer_notes"
                  placeholder="Add any additional information about this offer..."
                  value={offerFormData.notes}
                  onChange={(e) => setOfferFormData({ ...offerFormData, notes: e.target.value })}
                  rows={3}
                  maxLength={4000}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowOfferModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateOfferForRequest} disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Offer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      {/* Payment option dialog for custom offers */}
      <Dialog open={!!depositChoiceOfferId} onOpenChange={(open) => !open && setDepositChoiceOfferId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Choose payment option</DialogTitle>
            <DialogDescription>
              How would you like to pay for this custom offer?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <Button
              onClick={() => {
                if (depositChoiceOfferId) acceptAndPay(depositChoiceOfferId, "full");
                setDepositChoiceOfferId(null);
              }}
            >
              Pay in Full
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (depositChoiceOfferId) acceptAndPay(depositChoiceOfferId, "deposit");
                setDepositChoiceOfferId(null);
              }}
            >
              Pay Deposit Only
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
  );
}

