"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getDefaultMoneyLocale } from "@beautonomi/utils";
import { mergeCurrencyChoiceCodes, currencySelectLabel } from "@/lib/locale/currency";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
  const { role } = useAuth();
  const { bundle } = useConfigBundle();
  const searchParams = useSearchParams();
  const deeplinkHandledRef = useRef(false);
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
          ? t("web.accountSettings.customRequests.requestTimeout")
          : err instanceof FetchError
          ? err.message
          : t("web.accountSettings.customRequests.loadFailed");
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
      toast.error(t("web.accountSettings.customRequests.loadClientsFailed"));
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
  const [depositQuote, setDepositQuote] = useState<{
    pricing?: {
      subtotal?: number;
      travelFee?: number;
      promotionDiscountAmount?: number;
      membershipDiscountAmount?: number;
      loyaltyDiscountAmount?: number;
      taxAmount?: number;
      serviceFeeAmount?: number;
      tipAmount?: number;
      totalAmount?: number;
    };
    deposit?: { required?: boolean; percentage?: number; deposit_amount?: number; full_total?: number };
  } | null>(null);
  const [depositQuoteLoading, setDepositQuoteLoading] = useState(false);
  const [depositOfferCurrency, setDepositOfferCurrency] = useState<string | undefined>(undefined);
  const [decliningOfferId, setDecliningOfferId] = useState<string | null>(null);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [requestChangesOfferId, setRequestChangesOfferId] = useState<string | null>(null);
  const [requestChangesNote, setRequestChangesNote] = useState("");
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);

  const openDepositDialog = async (offerId: string, currency?: string) => {
    setDepositChoiceOfferId(offerId);
    setDepositOfferCurrency(currency);
    setDepositQuote(null);
    setDepositQuoteLoading(true);
    try {
      const res = await fetcher.get<{ data: typeof depositQuote }>(`/api/me/custom-offers/${offerId}/quote`);
      setDepositQuote(res.data ?? null);
    } catch {
      // Graceful fallback — dialog still works without quote data
    } finally {
      setDepositQuoteLoading(false);
    }
  };

  function formatMoney(amount: number, currency?: string): string {
    if (!currency) return amount.toFixed(2);
    try {
      return new Intl.NumberFormat(getDefaultMoneyLocale(), { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }

  // Offer detail sheet
  const [offerDetailOpen, setOfferDetailOpen] = useState(false);
  const [offerDetailLoading, setOfferDetailLoading] = useState(false);
  const [offerDetailData, setOfferDetailData] = useState<Record<string, any> | null>(null);
  const [isAcceptingDetail, setIsAcceptingDetail] = useState(false);

  const openOfferDetail = async (offerId: string) => {
    setOfferDetailOpen(true);
    setOfferDetailLoading(true);
    setOfferDetailData(null);
    try {
      const endpoint = isProvider
        ? `/api/provider/custom-offers/${offerId}`
        : `/api/me/custom-offers/${offerId}`;
      const res = await fetcher.get<{ data: Record<string, any> }>(endpoint);
      setOfferDetailData(res.data);
    } catch {
      toast.error(t("web.accountSettings.customRequests.loadOfferFailed"));
      setOfferDetailOpen(false);
    } finally {
      setOfferDetailLoading(false);
    }
  };

  const acceptAndPay = async (offerId: string, paymentOption: "full" | "deposit" = "full") => {
    try {
      const res = await fetcher.post<{ data: { paymentUrl?: string; payment_url?: string } }>(`/api/me/custom-offers/${offerId}/accept`, { payment_option: paymentOption });
      const url = res.data?.paymentUrl ?? res.data?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error(t("web.accountSettings.customRequests.noPaymentUrl"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("web.accountSettings.customRequests.startPaymentFailed"));
    }
  };

  const declineOffer = async (offerId: string) => {
    if (!window.confirm(t("web.accountSettings.customRequests.declineConfirm"))) return;
    setDecliningOfferId(offerId);
    try {
      await fetcher.post(`/api/me/custom-offers/${offerId}/decline`, {});
      toast.success(t("web.accountSettings.customRequests.offerDeclined"));
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("web.accountSettings.customRequests.declineOfferFailed"));
    } finally {
      setDecliningOfferId(null);
    }
  };

  const requestChanges = async () => {
    if (!requestChangesOfferId || !requestChangesNote.trim()) {
      toast.error(t("web.accountSettings.customRequests.describeChanges"));
      return;
    }
    setRequestingChanges(true);
    try {
      await fetcher.post(`/api/me/custom-offers/${requestChangesOfferId}/request-changes`, {
        note: requestChangesNote.trim(),
      });
      toast.success(t("web.accountSettings.customRequests.changeRequestSent"));
      setRequestChangesOfferId(null);
      setRequestChangesNote("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("web.accountSettings.customRequests.requestChangesFailed"));
    } finally {
      setRequestingChanges(false);
    }
  };

  const cancelRequest = async (requestId: string) => {
    if (!window.confirm(t("web.accountSettings.customRequests.cancelConfirm"))) return;
    setCancellingRequestId(requestId);
    try {
      await fetcher.post(`/api/me/custom-requests/${requestId}/cancel`, {});
      toast.success(t("web.accountSettings.customRequests.requestCancelled"));
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("web.accountSettings.customRequests.cancelRequestFailed"));
    } finally {
      setCancellingRequestId(null);
    }
  };

  const declineRequest = async (requestId: string) => {
    const reason = window.prompt(t("web.accountSettings.customRequests.declineRequestPrompt"));
    if (reason === null) return;
    try {
      await fetcher.post(`/api/provider/custom-requests/${requestId}/decline`, {
        reason: reason.trim() || null,
      });
      toast.success(t("web.accountSettings.customRequests.requestDeclined"));
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("web.accountSettings.customRequests.declineRequestFailed"));
    }
  };

  useEffect(() => {
    if (deeplinkHandledRef.current || isLoading) return;
    const offerId = searchParams.get("offer") ?? searchParams.get("offer_id");
    const requestId = searchParams.get("request") ?? searchParams.get("request_id");

    if (offerId) {
      const offerExists = items.some((r) => r.offers?.some((o) => o.id === offerId));
      if (!offerExists && items.length === 0) return;
      deeplinkHandledRef.current = true;
      void openDepositDialog(offerId);
      return;
    }

    if (requestId && !isProvider) {
      const requestExists = items.some((r) => r.id === requestId);
      if (!requestExists && items.length === 0) return;
      deeplinkHandledRef.current = true;
      requestAnimationFrame(() => {
        document.getElementById(`custom-request-${requestId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [isLoading, isProvider, items, searchParams]);

  const handleCreateOffer = async () => {
    if (!formData.customer_id || !formData.description || !formData.price) {
      toast.error(t("web.accountSettings.customRequests.requiredFields"));
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
      toast.success(t("web.accountSettings.customRequests.offerSent"));
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
      toast.error(e instanceof Error ? e.message : t("web.accountSettings.customRequests.createOfferFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openOfferModal = (requestId: string, editOfferId?: string) => {
    const selectedReq = items.find((r) => r.id === requestId);
    setSelectedRequestId(requestId);
    setEditingOfferId(editOfferId ?? null);
    if (editOfferId) {
      const offer = selectedReq?.offers?.find((o) => o.id === editOfferId);
      if (offer) {
        setOfferFormData({
          price: String(offer.price ?? ""),
          currency: offer.currency ?? tenantCurrency,
          duration_minutes: String(offer.duration_minutes ?? selectedReq?.duration_minutes ?? 60),
          expiration_days: "7",
          notes: offer.notes ?? "",
          staff_id: offer.staff?.id ?? "",
          location_id: offer.location?.id ?? "",
          scheduled_at: selectedReq?.preferred_start_at ? selectedReq.preferred_start_at.slice(0, 16) : "",
          travel_fee: offer.travel_fee != null ? String(offer.travel_fee) : "",
        });
        setShowOfferModal(true);
        return;
      }
    }
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
      toast.error(t("web.accountSettings.customRequests.requiredFields"));
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

      if (editingOfferId) {
        await fetcher.patch(`/api/provider/custom-offers/${editingOfferId}`, payload);
        toast.success(t("web.accountSettings.customRequests.offerUpdated"));
      } else {
        await fetcher.post(`/api/provider/custom-requests/${selectedRequestId}/offers`, payload);
        toast.success(t("web.accountSettings.customRequests.offerCreated"));
      }
      setShowOfferModal(false);
      setSelectedRequestId(null);
      setEditingOfferId(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("web.accountSettings.customRequests.createOfferFailedShort"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[950px] mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-12">
        <BackButton href="/account-settings" />
        <Breadcrumb items={[{ label: t("web.accountSettings.customRequests.breadcrumbAccount"), href: "/account-settings" }, { label: t("web.accountSettings.customRequests.breadcrumbTitle") }]} />

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{t("web.accountSettings.customRequests.title")}</h1>
          {isProvider && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 me-2" />
              {t("web.accountSettings.customRequests.createCustomOffer")}
            </Button>
          )}
        </div>

        {isProvider && (
          <p className="text-sm text-gray-600 mb-6">
            {t("web.accountSettings.customRequests.providerHint")}
          </p>
        )}

        {isLoading ? (
          <LoadingTimeout loadingMessage={t("web.accountSettings.customRequests.loading")} />
        ) : error ? (
          <EmptyState
            title={t("web.accountSettings.customRequests.loadFailedTitle")}
            description={error}
            action={{ label: t("web.accountSettings.customRequests.retry"), onClick: load }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title={t("web.accountSettings.customRequests.emptyTitle")}
            description={
              isProvider
                ? t("web.accountSettings.customRequests.emptyProviderDesc")
                : t("web.accountSettings.customRequests.emptyCustomerDesc")
            }
          />
        ) : (
          <div className="space-y-4">
            {items.map((r) => (
              <div key={r.id} id={`custom-request-${r.id}`} className="border rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600">
                      {isProvider ? (
                        <>
                          {r.customer?.full_name || r.customer?.email || t("web.accountSettings.customRequests.customerFallback")} •{" "}
                          <span className="capitalize">{r.status}</span>
                        </>
                      ) : (
                        <>
                          {r.provider?.business_name ? r.provider.business_name : t("web.accountSettings.customRequests.providerFallback")} •{" "}
                          <span className="capitalize">{r.status}</span>
                        </>
                      )}
                    </div>
                    <div className="font-medium mt-1">{r.description}</div>
                    {r.status === "declined" && r.declined_reason ? (
                      <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-2 mt-2">
                        {t("web.accountSettings.customRequests.declinedPrefix", { reason: r.declined_reason })}
                      </div>
                    ) : null}
                    <div className="text-sm text-gray-600 mt-2 space-y-0.5">
                      <span>
                        {r.preferred_start_at
                          ? t("web.accountSettings.customRequests.preferredAt", { datetime: new Date(r.preferred_start_at).toLocaleString() })
                          : t("web.accountSettings.customRequests.preferredNotSet")} •{" "}
                        {r.location_type === "at_salon"
                          ? t("web.accountSettings.customRequests.atSalon")
                          : t("web.accountSettings.customRequests.atHome")}
                        {r.budget_min != null || r.budget_max != null
                          ? ` • ${t("web.accountSettings.customRequests.budget", { min: r.budget_min ?? "", max: r.budget_max ?? "" })}`
                          : ""}
                      </span>
                      {r.location_type === "at_home" && (r.address_line1 || r.address_city || r.address_country) && (
                        <div className="text-gray-500">
                          {t("web.accountSettings.customRequests.addressLabel", { address: [r.address_line1, r.address_line2, r.address_city, r.address_state, r.address_country].filter(Boolean).join(", ") || "—" })}
                        </div>
                      )}
                    </div>
                  </div>
                  {isProvider && ["pending", "offered"].includes(r.status) && (
                    <div className="flex gap-2 shrink-0">
                      {(!r.offers || r.offers.length === 0) && (
                        <Button variant="outline" size="sm" onClick={() => openOfferModal(r.id)}>
                          {t("web.accountSettings.customRequests.createOffer")}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => void declineRequest(r.id)}
                      >
                        {t("web.accountSettings.customRequests.declineRequest")}
                      </Button>
                    </div>
                  )}
                  {!isProvider && ["pending", "offered"].includes(r.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancellingRequestId === r.id}
                      onClick={() => void cancelRequest(r.id)}
                    >
                      {cancellingRequestId === r.id ? t("web.accountSettings.customRequests.cancelling") : t("web.accountSettings.customRequests.cancelRequest")}
                    </Button>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  {r.offers && r.offers.length > 0 ? (
                    <>
                      {r.offers.map((o) => {
                        const st = String(o.status || "pending").toLowerCase();
                        const isPaid = st === "paid";
                        const isDeclined = st === "declined";
                        const isWithdrawn = st === "withdrawn";
                        const isExpired = st === "expired";
                        const isFinalizeFailed = st === "finalize_failed";
                        const isPaymentPending = st === "payment_pending";
                        const isChangesRequested = st === "changes_requested";
                        const isInactive = isPaid || isWithdrawn || isExpired || isDeclined || isFinalizeFailed;
                        const badgeClass = isPaid
                          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          : isFinalizeFailed
                            ? "bg-red-100 text-red-700 border border-red-200"
                            : isDeclined
                              ? "bg-slate-100 text-slate-600 border border-slate-200"
                              : isWithdrawn
                            ? "bg-slate-100 text-slate-500 border border-slate-200"
                            : isExpired
                              ? "bg-amber-100 text-amber-700 border border-amber-200"
                              : isPaymentPending
                                ? "bg-yellow-100 text-yellow-700 border border-yellow-200"
                                : isChangesRequested
                                  ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200";
                        const badgeLabel = isPaid
                          ? t("web.accountSettings.customRequests.badgePaid")
                          : isFinalizeFailed
                            ? t("web.accountSettings.customRequests.badgeNeedsSupport")
                            : isDeclined
                              ? t("web.accountSettings.customRequests.badgeDeclined")
                              : isWithdrawn
                                ? t("web.accountSettings.customRequests.badgeWithdrawn")
                                : isExpired
                                  ? t("web.accountSettings.customRequests.badgeExpired")
                                  : isPaymentPending
                                    ? t("web.accountSettings.customRequests.badgeProcessing")
                                    : isChangesRequested
                                      ? t("web.accountSettings.customRequests.badgeChangesRequested")
                                    : t("web.accountSettings.customRequests.badgePending");
                        return (
                          <div
                            key={o.id}
                            className={`border rounded-md p-3 flex items-start justify-between gap-4 transition-colors ${!isInactive || isPaid ? "cursor-pointer hover:bg-gray-50" : ""}`}
                            onClick={() => openOfferDetail(o.id)}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                                  {badgeLabel}
                                </span>
                                {isPaymentPending && <span className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin inline-block" />}
                              </div>
                              <div className="font-medium">
                                {t("web.accountSettings.customRequests.priceDuration", { currency: o.currency, price: o.price, minutes: o.duration_minutes })}
                              </div>
                              <div className="text-sm text-gray-500 mt-0.5">
                                {t("web.accountSettings.customRequests.expires", { date: new Date(o.expiration_at).toLocaleDateString() })}
                              </div>
                              {(o.location?.name || o.staff?.name) && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {o.location?.name && <span>{t("web.accountSettings.customRequests.venueName", { name: o.location.name })}</span>}
                                  {o.location?.name && o.staff?.name && " · "}
                                  {o.staff?.name && <span>{t("web.accountSettings.customRequests.staffName", { name: o.staff.name })}</span>}
                                </div>
                              )}
                              {o.notes ? <div className="text-xs text-gray-600 mt-1 line-clamp-2">{o.notes}</div> : null}
                              {isChangesRequested && o.change_request_note ? (
                                <div className="text-xs text-indigo-700 mt-1 bg-indigo-50 rounded px-2 py-1">
                                  {t("web.accountSettings.customRequests.requestedChanges", { note: o.change_request_note })}
                                </div>
                              ) : null}
                              <div className="text-[11px] text-gray-400 mt-1">{t("web.accountSettings.customRequests.tapForDetails")}</div>
                            </div>
                            {!isProvider && (
                              <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {isPaid ? (
                                  <Button variant="secondary" size="sm" disabled>{t("web.accountSettings.customRequests.paid")}</Button>
                                ) : isInactive ? (
                                  <Button variant="secondary" size="sm" disabled className="capitalize">{badgeLabel}</Button>
                                ) : isPaymentPending ? (
                                  <Button variant="secondary" size="sm" disabled>{t("web.accountSettings.customRequests.badgeProcessing")}</Button>
                                ) : (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setRequestChangesOfferId(o.id);
                                        setRequestChangesNote("");
                                      }}
                                    >
                                      {t("web.accountSettings.customRequests.requestChanges")}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={decliningOfferId === o.id}
                                      onClick={() => void declineOffer(o.id)}
                                    >
                                      {decliningOfferId === o.id ? t("web.accountSettings.customRequests.declining") : t("web.accountSettings.customRequests.decline")}
                                    </Button>
                                    <Button size="sm" onClick={() => openDepositDialog(o.id, o.currency)}>{t("web.accountSettings.customRequests.acceptAndPay")}</Button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* All-withdrawn/expired hint */}
                      {r.offers.length > 0 &&
                        r.offers.every((o) => ["withdrawn", "declined", "expired"].includes(String(o.status || "").toLowerCase())) &&
                        ["pending", "offered"].includes(r.status) && (
                          <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                            <span className="mt-0.5 text-blue-500 shrink-0">ℹ</span>
                            <span>
                              {isProvider
                                ? t("web.accountSettings.customRequests.allOffersInactiveProvider")
                                : t("web.accountSettings.customRequests.allOffersInactiveCustomer")}
                            </span>
                          </div>
                        )}
                    </>
                  ) : (
                    <div className="text-sm text-gray-600">
                      {isProvider ? t("web.accountSettings.customRequests.noOffersSent") : t("web.accountSettings.customRequests.noOffersYet")}
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
              <DialogTitle>{t("web.accountSettings.customRequests.createOfferTitle")}</DialogTitle>
              <DialogDescription>
                {t("web.accountSettings.customRequests.createOfferDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="customer">{t("web.accountSettings.customRequests.clientRequired")}</Label>
                <Select
                  value={formData.customer_id}
                  onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("web.accountSettings.customRequests.selectClient")} />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingClients ? (
                      <SelectItem value="loading" disabled>{t("web.accountSettings.customRequests.loadingClients")}</SelectItem>
                    ) : clients.length === 0 ? (
                      <SelectItem value="none" disabled>{t("web.accountSettings.customRequests.noClientsFound")}</SelectItem>
                    ) : (
                      clients.map((client) => (
                        <SelectItem key={client.customer_id} value={client.customer_id}>
                          {client.customer?.full_name || client.customer?.email || t("web.accountSettings.customRequests.unknownClient")}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description">{t("web.accountSettings.customRequests.serviceDescriptionRequired")}</Label>
                <Textarea
                  id="description"
                  placeholder={t("web.accountSettings.customRequests.serviceDescriptionPlaceholder")}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  maxLength={4000}
                />
                <p className="text-xs text-gray-500 mt-1">{t("web.accountSettings.customRequests.charactersCount", { count: formData.description.length })}</p>
              </div>

              {categories.length > 0 && (
                <div>
                  <Label>{t("web.accountSettings.customRequests.serviceCategory")}</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, service_category_id: "" })}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${!formData.service_category_id ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-700"}`}
                    >
                      {t("web.accountSettings.customRequests.anyCategory")}
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
                  <Label htmlFor="location_type">{t("web.accountSettings.customRequests.locationType")}</Label>
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
                      <SelectItem value="at_salon">{t("web.accountSettings.customRequests.atSalonOption")}</SelectItem>
                      <SelectItem value="at_home">{t("web.accountSettings.customRequests.atHomeOption")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="duration_minutes">{t("web.accountSettings.customRequests.durationMinutesRequired")}</Label>
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
                    <Label htmlFor="venue">{t("web.accountSettings.customRequests.venueLabel")}</Label>
                    <Select
                      value={formData.location_id || "none"}
                      onValueChange={(v) => setFormData({ ...formData, location_id: v === "none" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("web.accountSettings.customRequests.selectVenue")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("web.accountSettings.customRequests.noSpecificVenue")}</SelectItem>
                        {locationsList.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label htmlFor="staff">{t("web.accountSettings.customRequests.assignedStaff")}</Label>
                  <Select
                    value={formData.staff_id || "none"}
                    onValueChange={(v) => setFormData({ ...formData, staff_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("web.accountSettings.customRequests.selectStaff")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("web.accountSettings.customRequests.noSpecificStaff")}</SelectItem>
                      {staffList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">{t("web.accountSettings.customRequests.priceRequired")}</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder={t("web.accountSettings.customRequests.pricePlaceholder")}
                  />
                </div>

                <div>
                  <Label htmlFor="currency">{t("web.accountSettings.customRequests.currency")}</Label>
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
                  <Label htmlFor="expiration_days">{t("web.accountSettings.customRequests.offerExpiresInDays")}</Label>
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
                  <Label>{t("web.accountSettings.customRequests.appointmentSlot")}</Label>
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
                      <span className="text-xs text-gray-500">{t("web.accountSettings.customRequests.loadingSlots")}</span>
                    ) : createSlots.length === 0 ? (
                      <span className="text-xs text-amber-700">{t("web.accountSettings.customRequests.noSlotsForDate")}</span>
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
                <Label htmlFor="notes">{t("web.accountSettings.customRequests.additionalNotesOptional")}</Label>
                <Textarea
                  id="notes"
                  placeholder={t("web.accountSettings.customRequests.additionalNotesPlaceholder")}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  maxLength={4000}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  {t("web.accountSettings.customRequests.cancel")}
                </Button>
                <Button onClick={handleCreateOffer} disabled={isSubmitting}>
                  {isSubmitting ? t("web.accountSettings.customRequests.sending") : t("web.accountSettings.customRequests.sendOffer")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Offer for Existing Request Modal */}
        <Dialog open={showOfferModal} onOpenChange={setShowOfferModal}>
          <DialogContent className="max-w-[95vw] sm:max-w-xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>{t("web.accountSettings.customRequests.createOfferForRequestTitle")}</DialogTitle>
              <DialogDescription>
                {t("web.accountSettings.customRequests.createOfferForRequestDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="offer_venue">{t("web.accountSettings.customRequests.venueForSalon")}</Label>
                  <Select
                    value={offerFormData.location_id || "none"}
                    onValueChange={(v) => setOfferFormData({ ...offerFormData, location_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("web.accountSettings.customRequests.selectVenue")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("web.accountSettings.customRequests.noSpecificVenue")}</SelectItem>
                      {locationsList.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="offer_staff">{t("web.accountSettings.customRequests.assignedStaff")}</Label>
                  <Select
                    value={offerFormData.staff_id || "none"}
                    onValueChange={(v) => setOfferFormData({ ...offerFormData, staff_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("web.accountSettings.customRequests.selectStaff")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("web.accountSettings.customRequests.noSpecificStaff")}</SelectItem>
                      {staffList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t("web.accountSettings.customRequests.appointmentSlot")}</Label>
                <p className="text-xs text-gray-500 mt-1">{t("web.accountSettings.customRequests.appointmentSlotHint")}</p>
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
                    <span className="text-xs text-gray-500">{t("web.accountSettings.customRequests.loadingSlots")}</span>
                  ) : offerSlots.length === 0 ? (
                    <span className="text-xs text-amber-700">{t("web.accountSettings.customRequests.noSlotsForDate")}</span>
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
                  <Label htmlFor="offer_travel_fee">{t("web.accountSettings.customRequests.travelFeeOptional")}</Label>
                  <Input
                    id="offer_travel_fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={offerFormData.travel_fee}
                    onChange={(e) => setOfferFormData({ ...offerFormData, travel_fee: e.target.value })}
                    placeholder={t("web.accountSettings.customRequests.travelFeePlaceholder")}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="offer_price">{t("web.accountSettings.customRequests.priceRequired")}</Label>
                  <Input
                    id="offer_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={offerFormData.price}
                    onChange={(e) => setOfferFormData({ ...offerFormData, price: e.target.value })}
                    placeholder={t("web.accountSettings.customRequests.pricePlaceholder")}
                  />
                </div>

                <div>
                  <Label htmlFor="offer_currency">{t("web.accountSettings.customRequests.currency")}</Label>
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
                  <Label htmlFor="offer_duration_minutes">{t("web.accountSettings.customRequests.durationMinutesRequired")}</Label>
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
                  <Label htmlFor="offer_expiration_days">{t("web.accountSettings.customRequests.offerExpiresInDays")}</Label>
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
                <Label htmlFor="offer_notes">{t("web.accountSettings.customRequests.additionalNotesOptional")}</Label>
                <Textarea
                  id="offer_notes"
                  placeholder={t("web.accountSettings.customRequests.additionalNotesPlaceholder")}
                  value={offerFormData.notes}
                  onChange={(e) => setOfferFormData({ ...offerFormData, notes: e.target.value })}
                  rows={3}
                  maxLength={4000}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowOfferModal(false)}>
                  {t("web.accountSettings.customRequests.cancel")}
                </Button>
                <Button onClick={handleCreateOfferForRequest} disabled={isSubmitting}>
                  {isSubmitting ? t("web.accountSettings.customRequests.creating") : t("web.accountSettings.customRequests.createOffer")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      {/* Payment option dialog for custom offers */}
      <Dialog open={!!depositChoiceOfferId} onOpenChange={(open) => !open && setDepositChoiceOfferId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("web.accountSettings.customRequests.completePaymentTitle")}</DialogTitle>
            <DialogDescription>
              {t("web.accountSettings.customRequests.completePaymentDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            {depositQuoteLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Pay in Full — primary recommended action */}
                {depositQuote?.pricing ? (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">{t("web.accountSettings.customRequests.serviceSubtotal")}</span>
                      <span className="font-medium text-gray-900">{formatMoney(Number(depositQuote.pricing.subtotal ?? 0), depositOfferCurrency)}</span>
                    </div>
                    {Number(depositQuote.pricing.travelFee ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">{t("web.accountSettings.customRequests.travelFee")}</span>
                        <span className="font-medium text-gray-900">{formatMoney(Number(depositQuote.pricing.travelFee ?? 0), depositOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(depositQuote.pricing.promotionDiscountAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-700">{t("web.accountSettings.customRequests.promotionDiscount")}</span>
                        <span className="font-medium text-emerald-700">-{formatMoney(Number(depositQuote.pricing.promotionDiscountAmount ?? 0), depositOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(depositQuote.pricing.membershipDiscountAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-700">{t("web.accountSettings.customRequests.membershipDiscount")}</span>
                        <span className="font-medium text-emerald-700">-{formatMoney(Number(depositQuote.pricing.membershipDiscountAmount ?? 0), depositOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(depositQuote.pricing.loyaltyDiscountAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-700">{t("web.accountSettings.customRequests.loyaltyDiscount")}</span>
                        <span className="font-medium text-emerald-700">-{formatMoney(Number(depositQuote.pricing.loyaltyDiscountAmount ?? 0), depositOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(depositQuote.pricing.taxAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">{t("web.accountSettings.customRequests.tax")}</span>
                        <span className="font-medium text-gray-900">{formatMoney(Number(depositQuote.pricing.taxAmount ?? 0), depositOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(depositQuote.pricing.serviceFeeAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">{t("web.accountSettings.customRequests.platformFee")}</span>
                        <span className="font-medium text-gray-900">{formatMoney(Number(depositQuote.pricing.serviceFeeAmount ?? 0), depositOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(depositQuote.pricing.tipAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">{t("web.accountSettings.customRequests.tip")}</span>
                        <span className="font-medium text-gray-900">{formatMoney(Number(depositQuote.pricing.tipAmount ?? 0), depositOfferCurrency)}</span>
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="rounded-xl border-2 border-primary bg-primary/5 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-primary text-sm">{t("web.accountSettings.customRequests.payInFull")}</span>
                    <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full font-medium">{t("web.accountSettings.customRequests.recommended")}</span>
                  </div>
                  {depositQuote?.pricing?.totalAmount != null && (
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      {formatMoney(depositQuote.pricing.totalAmount, depositOfferCurrency)}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mb-3">{t("web.accountSettings.customRequests.payInFullHint")}</p>
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (depositChoiceOfferId) acceptAndPay(depositChoiceOfferId, "full");
                      setDepositChoiceOfferId(null);
                    }}
                  >
                    {t("web.accountSettings.customRequests.payInFull")}
                  </Button>
                </div>

                {/* Deposit — only shown when provider requires it */}
                {depositQuote?.deposit?.required && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400 whitespace-nowrap">{t("web.accountSettings.customRequests.orPayDeposit")}</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm text-gray-700">
                          {t("web.accountSettings.customRequests.payPercentDeposit", { percent: depositQuote.deposit.percentage })}
                        </span>
                        {depositQuote.deposit.deposit_amount != null && (
                          <span className="text-sm font-semibold text-gray-900">
                            {formatMoney(depositQuote.deposit.deposit_amount, depositOfferCurrency)}
                          </span>
                        )}
                      </div>
                      {depositQuote.deposit.full_total != null && depositQuote.deposit.deposit_amount != null && (
                        <p className="text-xs text-gray-500 mb-2">
                          {t("web.accountSettings.customRequests.remainingDue", { amount: formatMoney(depositQuote.deposit.full_total - depositQuote.deposit.deposit_amount, depositOfferCurrency) })}
                        </p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-gray-600"
                        onClick={() => {
                          if (depositChoiceOfferId) acceptAndPay(depositChoiceOfferId, "deposit");
                          setDepositChoiceOfferId(null);
                        }}
                      >
                        {t("web.accountSettings.customRequests.payDepositOnly")}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Offer Detail Sheet */}
      <Dialog open={offerDetailOpen} onOpenChange={setOfferDetailOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("web.accountSettings.customRequests.offerDetailsTitle")}</DialogTitle>
          </DialogHeader>
          {offerDetailLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : offerDetailData ? (() => {
            const d = offerDetailData;
            const req = d.request ?? d;
            const rawStatus = String(d.status ?? "pending").toLowerCase();
            const isPaid = rawStatus === "paid" || !!d.booking_id;
            const isWithdrawn = rawStatus === "withdrawn";
            const isDeclined = rawStatus === "declined";
            const isExpired = rawStatus === "expired";
            const isFinalizeFailed = rawStatus === "finalize_failed";
            const isPaymentPending = rawStatus === "payment_pending";
            const isChangesRequested = rawStatus === "changes_requested";
            const statusLabel = isPaid
              ? t("web.accountSettings.customRequests.badgePaid")
              : isFinalizeFailed
                ? t("web.accountSettings.customRequests.badgeNeedsSupport")
                : isDeclined
                  ? t("web.accountSettings.customRequests.badgeDeclined")
                  : isWithdrawn
                    ? t("web.accountSettings.customRequests.badgeWithdrawn")
                    : isExpired
                      ? t("web.accountSettings.customRequests.badgeExpired")
                      : isPaymentPending
                        ? t("web.accountSettings.customRequests.badgeProcessing")
                        : isChangesRequested
                          ? t("web.accountSettings.customRequests.badgeChangesRequested")
                        : t("web.accountSettings.customRequests.badgePending");
            const statusClass = isPaid
              ? "bg-emerald-100 text-emerald-700"
              : isFinalizeFailed
                ? "bg-red-100 text-red-700"
                : isDeclined
                  ? "bg-slate-100 text-slate-600"
                  : isWithdrawn
                    ? "bg-slate-100 text-slate-600"
                    : isExpired
                      ? "bg-amber-100 text-amber-700"
                      : isPaymentPending
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-blue-50 text-blue-700";
            return (
              <div className="space-y-4 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusClass}`}>{statusLabel}</span>
                </div>
                {(req.service_name || req.description) && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">{t("web.accountSettings.customRequests.service")}</div>
                    <div className="font-semibold text-gray-900">{req.service_name || req.description}</div>
                  </div>
                )}
                <div className="flex gap-6">
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">{t("web.accountSettings.customRequests.price")}</div>
                    <div className="font-bold text-lg text-gray-900">{d.currency} {d.price}</div>
                    {d.travel_fee ? <div className="text-xs text-gray-500">{t("web.accountSettings.customRequests.travelFeeExtra", { currency: d.currency, amount: d.travel_fee })}</div> : null}
                  </div>
                  {d.duration_minutes && (
                    <div>
                      <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">{t("web.accountSettings.customRequests.duration")}</div>
                      <div className="font-semibold text-gray-900">{t("web.accountSettings.customRequests.durationMins", { minutes: d.duration_minutes })}</div>
                    </div>
                  )}
                </div>
                {(d.scheduled_at ?? req.preferred_start_at) && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">{t("web.accountSettings.customRequests.preferredTime")}</div>
                    <div className="text-sm text-gray-800">{new Date(d.scheduled_at ?? req.preferred_start_at).toLocaleString()}</div>
                  </div>
                )}
                {(req.location_type || d.location?.name) && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">{t("web.accountSettings.customRequests.location")}</div>
                    <div className="text-sm text-gray-800 capitalize">
                      {d.location?.name || (req.location_type === "at_home" ? t("web.accountSettings.customRequests.atYourHome") : req.location_type === "at_salon" ? t("web.accountSettings.customRequests.atTheSalon") : req.location_type || "–")}
                    </div>
                    {req.location_type === "at_home" && req.address_line1 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[req.address_line1, req.address_line2, req.address_city, req.address_country].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </div>
                )}
                {d.expiration_at && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">{t("web.accountSettings.customRequests.offerExpires")}</div>
                    <div className={`text-sm ${isExpired ? "text-amber-600 font-medium" : "text-gray-800"}`}>
                      {new Date(d.expiration_at).toLocaleString()}{isExpired ? t("web.accountSettings.customRequests.expiredSuffix") : ""}
                    </div>
                  </div>
                )}
                {d.notes && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">{t("web.accountSettings.customRequests.notes")}</div>
                    <div className="text-sm text-gray-800 bg-gray-50 rounded-lg p-2.5">{d.notes}</div>
                  </div>
                )}
                {isChangesRequested && d.change_request_note && (
                  <div className="text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <span className="font-semibold">{t("web.accountSettings.customRequests.customerRequestedChanges")} </span>
                    {d.change_request_note}
                  </div>
                )}
                {isExpired && (
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    {t("web.accountSettings.customRequests.offerExpiredHint")}
                  </div>
                )}
                {isWithdrawn && (
                  <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    {t("web.accountSettings.customRequests.offerWithdrawnHint")}
                  </div>
                )}
                {isDeclined && (
                  <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    {t("web.accountSettings.customRequests.offerDeclinedHint")}
                  </div>
                )}
                {isFinalizeFailed && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                    {t("web.accountSettings.customRequests.finalizeFailed", {
                      reference: d.payment_reference
                        ? t("web.accountSettings.customRequests.finalizeFailedRef", { reference: d.payment_reference })
                        : "",
                    })}
                  </div>
                )}
                <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                  {!isProvider && !isPaid && !isWithdrawn && !isExpired && !isDeclined && !isFinalizeFailed && !isPaymentPending && d.id && (
                    <>
                      <Button
                        className="w-full"
                        disabled={isAcceptingDetail}
                        onClick={() => {
                          setOfferDetailOpen(false);
                          void openDepositDialog(d.id, d.currency);
                        }}
                      >
                        {t("web.accountSettings.customRequests.acceptAndPay")}
                      </Button>
                      {rawStatus === "pending" && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setOfferDetailOpen(false);
                            setRequestChangesOfferId(d.id);
                            setRequestChangesNote("");
                          }}
                        >
                          {t("web.accountSettings.customRequests.requestChanges")}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={decliningOfferId === d.id}
                        onClick={() => void declineOffer(d.id)}
                      >
                        {decliningOfferId === d.id ? t("web.accountSettings.customRequests.declining") : t("web.accountSettings.customRequests.declineOffer")}
                      </Button>
                    </>
                  )}
                  {!isProvider && isPaid && d.booking_id && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => { window.location.href = `/account-settings/bookings/${d.booking_id}`; }}
                    >
                      {t("web.accountSettings.customRequests.viewBooking")}
                    </Button>
                  )}
                  {isProvider && !isPaid && !isWithdrawn && !isExpired && d.id && (
                    <>
                      {(rawStatus === "pending" || isChangesRequested) && (
                        <Button
                          className="w-full"
                          onClick={() => {
                            setOfferDetailOpen(false);
                            const reqId = d.request_id ?? items.find((r) => r.offers?.some((o) => o.id === d.id))?.id;
                            if (reqId) openOfferModal(reqId, d.id);
                          }}
                        >
                          {t("web.accountSettings.customRequests.editOffer")}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={async () => {
                        if (!confirm(t("web.accountSettings.customRequests.withdrawConfirm"))) return;
                        try {
                          await fetcher.post(`/api/provider/custom-offers/${d.id}/retract`, {});
                          toast.success(t("web.accountSettings.customRequests.offerWithdrawn"));
                          setOfferDetailOpen(false);
                          const locQ = "";
                          const res = await fetcher.get<{ data: CustomRequest[] }>(isProvider ? `/api/provider/custom-requests${locQ}` : "/api/me/custom-requests");
                          setItems(res.data || []);
                        } catch {
                          toast.error(t("web.accountSettings.customRequests.withdrawFailed"));
                        }
                      }}
                    >
                      {t("web.accountSettings.customRequests.withdrawOffer")}
                    </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })() : (
            <div className="text-sm text-gray-500 py-4 text-center">{t("web.accountSettings.customRequests.loadOfferDetailsFailed")}</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!requestChangesOfferId} onOpenChange={(open) => !open && setRequestChangesOfferId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("web.accountSettings.customRequests.requestChangesTitle")}</DialogTitle>
            <DialogDescription>
              {t("web.accountSettings.customRequests.requestChangesDesc")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={requestChangesNote}
            onChange={(e) => setRequestChangesNote(e.target.value)}
            placeholder={t("web.accountSettings.customRequests.requestChangesPlaceholder")}
            rows={4}
            maxLength={4000}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setRequestChangesOfferId(null)}>{t("web.accountSettings.customRequests.cancel")}</Button>
            <Button disabled={requestingChanges || !requestChangesNote.trim()} onClick={() => void requestChanges()}>
              {requestingChanges ? t("web.accountSettings.customRequests.sendingEllipsis") : t("web.accountSettings.customRequests.sendRequest")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
  );
}

