"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import {
  CalendarIcon, Plus, X, User, Home, Building2, Users, Tag,
  StickyNote, MapPin, Search, Package, ShoppingBag, Loader2, ChevronDown,
  Info, Lock, Minus, QrCode, ExternalLink, Copy,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type {
  GroupBooking, GroupBookingParticipant, TeamMember,
  ServiceItem, ProductItem, Appointment,
} from "@/lib/provider-portal/types";
import type { AppointmentService, AppointmentProduct } from "@/components/appointments/types";
import { calculateBookingPricing } from "@/components/appointments/pricing";
import { effectiveTravelFee } from "@beautonomi/utils";
import { providerApi } from "@/lib/provider-portal/api";
import { FetchError, fetcher, providerPortalFetch } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { AvailabilitySlotPicker } from "@/components/appointments/AvailabilitySlotPicker";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { parseSelectedDatetimeInProviderTz } from "@/lib/bookings/parse-selected-datetime-in-provider-tz";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { LocationMapPickerDialog, type PickedMapLocation } from "@/components/mapbox/LocationMapPickerDialog";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import Link from "next/link";
import { PayCloudPaymentDialog } from "@/components/provider-portal/PayCloudPaymentDialog";
import { PAYCLOUD_SETUP_LABEL } from "@/lib/payments/paycloud-collect-cta";

// ─── Participant addon shape ────────────────────────────────────────────────
interface ParticipantAddon {
  id: string;
  addonId: string;
  name: string;
  price: number;
  duration: number;
}

interface ParticipantData {
  booking_id?: string;
  /** Linked existing provider_clients row id — fills name/phone/email on select */
  customer_id?: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  service_id: string;
  service_name: string;
  price: number;
  duration_minutes: number;
  variant_id?: string;
  variant_name?: string;
  addons: ParticipantAddon[];
  /** Preferences, allergies, add-on instructions for this guest only. */
  notes: string;
}

interface ClientSearchResult {
  id: string;
  customer_id: string;
  full_name: string;
  email?: string;
  phone?: string;
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface GroupBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking?: GroupBooking | null;
  onSuccess?: () => void;
  defaultDate?: Date;
  defaultTime?: string;
  defaultTeamMemberId?: string;
  existingAppointments?: Appointment[];
  providerId?: string;
}

function nextQuarterHour(): string {
  const now = new Date();
  const h = now.getHours();
  const m = Math.ceil(now.getMinutes() / 15) * 15;
  return `${String(m >= 60 ? h + 1 : h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function GroupBookingDialog({
  open,
  onOpenChange,
  booking,
  onSuccess,
  defaultDate,
  defaultTime,
  defaultTeamMemberId,
  existingAppointments = [],
  providerId: externalProviderId,
}: GroupBookingDialogProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const { provider: portalProvider } = useProviderPortal();
  const paymentLinkEnabled = useFeatureFlag("payment_link");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const {
    ready: paycloudReady,
    loading: paycloudReadinessLoading,
    blockers: paycloudBlockers,
    terminals: paycloudTerminals,
  } = usePaycloudCollectReady();
  const paycloudInFlight = (paycloudTerminals?.inFlight ?? 0) > 0;
  const paycloudCollectEnabled = paycloudReady || paycloudInFlight;
  const [isLoading, setIsLoading] = useState(false);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);

  // §Group-booking-audit 2026-05 (review + payment): two-step submit.
  //   step "form" → user fills everything
  //   step "review" → final summary + payment method + notify toggle
  // Payment methods mirror the single-booking screen so providers see the
  // same set everywhere (pay_later, cash, manual card, Yoco terminal, link).
  const [createStep, setCreateStep] = useState<"form" | "review">("form");
  type GroupCreatePaymentMethod = "pay_later" | "cash" | "card" | "yoco_pos" | "payment_link" | "paystack_terminal" | "paycloud_terminal";
  const [createPaymentMethod, setCreatePaymentMethod] = useState<GroupCreatePaymentMethod>("pay_later");
  const [createSendNotification, setCreateSendNotification] = useState(true);

  useEffect(() => {
    if (
      (!paycloudEnabled || !paycloudCollectEnabled) &&
      createPaymentMethod === "paycloud_terminal"
    ) {
      setCreatePaymentMethod("pay_later");
    }
  }, [createPaymentMethod, paycloudCollectEnabled, paycloudEnabled]);
  const [postCreatePaystackData, setPostCreatePaystackData] = useState<{
    expectedAmount: number;
    terminal: { qr_url?: string | null; payment_link?: string | null; terminal_url?: string | null; name?: string | null };
  } | null>(null);
  const [postCreatePaycloudData, setPostCreatePaycloudData] = useState<{
    groupId: string;
    expectedAmount: number;
    locationId: string | null;
  } | null>(null);
  const [isPreparingTerminal, setIsPreparingTerminal] = useState(false);

  // Reset two-step state every time the dialog opens so we never strand the
  // provider on the review screen from a previous open.
  useEffect(() => {
    if (open) {
      setCreateStep("form");
      setCreatePaymentMethod("pay_later");
      setCreateSendNotification(true);
      setPostCreatePaystackData(null);
      setPostCreatePaycloudData(null);
    }
  }, [open]);

  // ─── Core data ──────────────────────────────────────────────────────────
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [providerLocations, setProviderLocations] = useState<any[]>([]);
  const [providerId, setProviderId] = useState<string | undefined>(externalProviderId);

  // ─── Packages ──────────────────────────────────────────────────────────
  const [packages, setPackages] = useState<Array<{
    id: string; name: string; description?: string; price?: number;
    discount_percentage?: number;
    items?: Array<{ id: string; title: string; type: "service" | "product"; quantity: number; offering_id?: string; offering?: any; product_id?: string; product?: any }>;
  }>>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // ─── Variant / addon state ─────────────────────────────────────────────
  const [serviceVariants, setServiceVariants] = useState<Record<string, any[]>>({});
  const [serviceAddons, setServiceAddons] = useState<Record<string, any[]>>({});
  const [loadingVariants, setLoadingVariants] = useState<Record<string, boolean>>({});
  const [loadingAddons, setLoadingAddons] = useState<Record<string, boolean>>({});
  const variantsFetchedRef = useRef<Set<string>>(new Set());
  const addonsFetchedRef = useRef<Set<string>>(new Set());
  const productsLoadedRef = useRef(false);

  // ─── Dialog sub-states ─────────────────────────────────────────────────
  const [variantPickerFor, setVariantPickerFor] = useState<{ participantIdx: number; serviceId: string } | null>(null);
  const [addonPickerFor, setAddonPickerFor] = useState<{ participantIdx: number; catalogServiceId: string } | null>(null);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  // ─── Search ────────────────────────────────────────────────────────────
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");

  // ─── Per-participant client search ─────────────────────────────────────
  // Map of participant index → { query, results, loading, open }
  const [participantClientSearch, setParticipantClientSearch] = useState<Record<number, {
    query: string; results: ClientSearchResult[]; loading: boolean; open: boolean;
  }>>({});
  const clientSearchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const participantNameRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const setParticipantClientSearchState = useCallback((idx: number, patch: Partial<{ query: string; results: ClientSearchResult[]; loading: boolean; open: boolean }>) => {
    setParticipantClientSearch(prev => ({
      ...prev,
      [idx]: { query: "", results: [], loading: false, open: false, ...prev[idx], ...patch },
    }));
  }, []);

  const searchClientsForParticipant = useCallback((idx: number, query: string) => {
    setParticipantClientSearchState(idx, { query, open: query.length >= 2 });
    if (clientSearchTimers.current[idx]) clearTimeout(clientSearchTimers.current[idx]);
    if (query.trim().length < 2) {
      setParticipantClientSearchState(idx, { results: [], loading: false });
      return;
    }
    setParticipantClientSearchState(idx, { loading: true });
    clientSearchTimers.current[idx] = setTimeout(async () => {
      try {
        const res = await providerPortalFetch(`/api/provider/clients?search=${encodeURIComponent(query.trim())}&limit=8`);
        if (!res.ok) throw new Error("search failed");
        const json = await res.json();
        const rows: ClientSearchResult[] = (json.data || []).map((c: any) => ({
          id: c.id,
          customer_id: c.customer_id || c.id,
          full_name: c.customer?.full_name || c.full_name || c.name || "",
          email: c.customer?.email || c.email || undefined,
          phone: c.customer?.phone || c.phone || undefined,
        }));
        setParticipantClientSearchState(idx, { results: rows, loading: false });
      } catch {
        setParticipantClientSearchState(idx, { results: [], loading: false });
      }
    }, 280);
  }, [setParticipantClientSearchState]);

  // ─── Group-level products ──────────────────────────────────────────────
  const [groupProducts, setGroupProducts] = useState<AppointmentProduct[]>([]);

  // ─── Participants ──────────────────────────────────────────────────────
  const [participants, setParticipants] = useState<ParticipantData[]>([]);

  // ─── Form ──────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    title: "",
    scheduled_date: "",
    scheduled_time: "",
    duration_minutes: 60,
    team_member_id: "",
    service_id: "",
    service_name: "",
    max_participants: 10,
    notes: "",
    location_type: "at_salon" as "at_salon" | "at_home",
    location_id: "",
    address_line1: "",
    address_state: "",
    address_country: "South Africa",
    address_city: "",
    address_postal_code: "",
    address_latitude: undefined as number | undefined,
    address_longitude: undefined as number | undefined,
    address_place_name: "",
    travel_fee: 0,
  });

  // ─── Availability toggle ──────────────────────────────────────────────
  /** When team is selected, real slots are primary; manual date/time is fallback. */
  const [manualScheduleOpen, setManualScheduleOpen] = useState(false);

  // ─── Data loaders ──────────────────────────────────────────────────────
  const loadServiceVariants = useCallback(async (serviceId: string) => {
    if (variantsFetchedRef.current.has(serviceId)) return;
    variantsFetchedRef.current.add(serviceId);
    try {
      setLoadingVariants(p => ({ ...p, [serviceId]: true }));
      const res = await fetcher.get<{ data: { variants: any[] } }>(`/api/provider/services/${serviceId}/variants`);
      setServiceVariants(p => ({ ...p, [serviceId]: res.data?.variants ?? [] }));
    } catch {
      variantsFetchedRef.current.delete(serviceId);
      setServiceVariants(p => ({ ...p, [serviceId]: [] }));
    } finally {
      setLoadingVariants(p => ({ ...p, [serviceId]: false }));
    }
  }, []);

  const loadServiceAddons = useCallback(async (serviceId: string) => {
    if (addonsFetchedRef.current.has(serviceId)) return;
    addonsFetchedRef.current.add(serviceId);
    try {
      setLoadingAddons(p => ({ ...p, [serviceId]: true }));
      const res = await fetcher.get<{ data: { addons: any[] } }>(`/api/provider/services/${serviceId}/addons`);
      setServiceAddons(p => ({ ...p, [serviceId]: res.data?.addons ?? [] }));
    } catch {
      addonsFetchedRef.current.delete(serviceId);
    } finally {
      setLoadingAddons(p => ({ ...p, [serviceId]: false }));
    }
  }, []);

  const loadProducts = useCallback(async (search?: string) => {
    try {
      const q = search ? `?search=${encodeURIComponent(search)}&limit=50` : "?limit=50";
      const res = await fetcher.get<{ data?: { products?: ProductItem[] } | ProductItem[]; products?: ProductItem[] }>(`/api/provider/products${q}`);
      const list = Array.isArray(res.data)
        ? res.data
        : (res.data?.products ?? (res as any).products ?? []);
      setProducts(Array.isArray(list) ? list : []);
      if (!search) productsLoadedRef.current = true;
    } catch {
      setProducts([]);
    }
  }, []);

  const loadPackages = useCallback(async () => {
    try {
      setIsLoadingPackages(true);
      const res = await fetcher.get<{ data?: { packages?: any[] }; packages?: any[] }>("/api/provider/packages");
      const list = res.data?.packages ?? (res as any).packages ?? res.data ?? [];
      setPackages(Array.isArray(list) ? list : []);
    } catch {
      setPackages([]);
    } finally {
      setIsLoadingPackages(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [categories, members] = await Promise.all([
        providerApi.listServiceCategories(),
        providerApi.listTeamMembers(),
      ]);
      setServices(categories.flatMap((cat) => cat.services));
      setTeamMembers(members);

      try {
        const locRes = await providerPortalFetch("/api/provider/locations");
        if (locRes.ok) {
          const locData = await locRes.json();
          setProviderLocations(locData.data || []);
        }
      } catch {}

      if (!externalProviderId) {
        try {
          const provRes = await providerPortalFetch("/api/provider/me");
          if (provRes.ok) {
            const provData = await provRes.json();
            setProviderId(provData.data?.id ?? provData.id);
          }
        } catch {}
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  }, [externalProviderId]);

  // ─── Init on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    variantsFetchedRef.current.clear();
    addonsFetchedRef.current.clear();
    productsLoadedRef.current = false;
    setServiceVariants({});
    setServiceAddons({});
    setGroupProducts([]);
    setSelectedPackageId(null);

    loadData();
    loadPackages();
    loadProducts();

    if (existingAppointments.length > 0 && !booking) {
      const first = existingAppointments[0];
      setFormData({
        title: first.service_name || "Group Session",
        scheduled_date: first.scheduled_date,
        scheduled_time: first.scheduled_time,
        duration_minutes: first.duration_minutes,
        team_member_id: first.team_member_id,
        service_id: first.service_id,
        service_name: first.service_name,
        max_participants: existingAppointments.length + 5,
        notes: "",
        location_type: first.location_type || "at_salon",
        location_id: first.location_id || "",
        address_line1: first.address_line1 || "",
        address_state: first.address_state || "",
        address_country: first.address_country || "South Africa",
        address_city: first.address_city || "",
        address_postal_code: first.address_postal_code || "",
        address_latitude: first.address_latitude,
        address_longitude: first.address_longitude,
        address_place_name: first.address_line1 || "",
        travel_fee: first.travel_fee || 0,
      });
      setParticipants(existingAppointments.map((apt) => ({
        booking_id: apt.booking_id || apt.id,
        client_name: apt.client_name,
        client_email: apt.client_email || "",
        client_phone: apt.client_phone || "",
        service_id: apt.service_id,
        service_name: apt.service_name,
        price: apt.price,
        duration_minutes: apt.duration_minutes,
        addons: [],
        notes: "",
      })));
    } else if (booking) {
      setFormData({
        title: (booking as any).title || booking.service_name || "",
        scheduled_date: booking.scheduled_date,
        scheduled_time: booking.scheduled_time,
        duration_minutes: booking.duration_minutes,
        team_member_id: booking.team_member_id,
        service_id: booking.service_id,
        service_name: booking.service_name,
        max_participants: (booking as any).max_participants || booking.participants.length + 5,
        notes: booking.notes || "",
        location_type: booking.location_type || "at_salon",
        location_id: booking.location_id || "",
        address_line1: booking.address_line1 || "",
        address_state: booking.address_state || "",
        address_country: booking.address_country || "South Africa",
        address_city: booking.address_city || "",
        address_postal_code: booking.address_postal_code || "",
        address_latitude: booking.address_latitude,
        address_longitude: booking.address_longitude,
        address_place_name: booking.address_line1 || "",
        travel_fee: booking.travel_fee || 0,
      });
      setParticipants(booking.participants.map((p) => ({
        booking_id: (p as any).booking_id,
        client_name: p.client_name,
        client_email: p.client_email || "",
        client_phone: p.client_phone || "",
        service_id: p.service_id,
        service_name: p.service_name,
        price: p.price,
        duration_minutes: (p as any).duration_minutes || booking.duration_minutes,
        addons: Array.isArray((p as any).addons) ? (p as any).addons : [],
        notes: p.notes ?? "",
      })));
      const existingProducts = Array.isArray((booking as any).products)
        ? ((booking as any).products as any[]).map((product, index) => {
            const quantity = Number(product?.quantity ?? 1) || 1;
            const unitPrice = Number(product?.unit_price ?? product?.unitPrice ?? 0) || 0;
            const totalPrice =
              Number(product?.total_price ?? product?.totalPrice ?? 0) || unitPrice * quantity;
            return {
              id: String(product?.id ?? `existing-product-${index}`),
              productId: String(product?.product_id ?? product?.productId ?? ""),
              productName: String(product?.product_name ?? product?.productName ?? "Product"),
              productVariantId: product?.product_variant_id ?? product?.productVariantId ?? null,
              productVariantName:
                product?.product_variant_name ?? product?.productVariantName ?? undefined,
              quantity,
              unitPrice,
              totalPrice,
            };
          })
        : [];
      setGroupProducts(existingProducts);
    } else {
      setFormData({
        title: "",
        scheduled_date: defaultDate ? format(defaultDate, "yyyy-MM-dd") : new Date().toISOString().split("T")[0],
        scheduled_time: defaultTime || nextQuarterHour(),
        duration_minutes: 60,
        team_member_id: defaultTeamMemberId || "",
        service_id: "",
        service_name: "",
        max_participants: 10,
        notes: "",
        location_type: "at_salon",
        location_id: "",
        address_line1: "",
        address_state: "",
        address_country: "South Africa",
        address_city: "",
        address_postal_code: "",
        address_latitude: undefined,
        address_longitude: undefined,
        address_place_name: "",
        travel_fee: 0,
      });
      setParticipants([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Participant helpers ───────────────────────────────────────────────
  const handleAddParticipant = useCallback(() => {
    const svc = services.find(s => s.id === formData.service_id);
    setParticipants(prev => {
      const newIdx = prev.length;
      // Auto-focus the name field of the new participant after render
      setTimeout(() => participantNameRefs.current[newIdx]?.focus(), 80);
      return [...prev, {
        client_name: "",
        client_email: "",
        client_phone: "",
        service_id: formData.service_id,
        service_name: formData.service_name,
        price: svc?.price || 0,
        duration_minutes: svc?.duration_minutes || formData.duration_minutes,
        addons: [],
        notes: "",
      }];
    });
  }, [services, formData.service_id, formData.service_name, formData.duration_minutes]);

  const handleRemoveParticipant = useCallback((index: number) => {
    setParticipants(prev => prev.filter((_, i) => i !== index));
    // Compact search state: shift indexes above removed one down
    setParticipantClientSearch(prev => {
      const next: typeof prev = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = parseInt(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
      });
      return next;
    });
  }, []);

  const handleParticipantChange = (index: number, field: string, value: any) => {
    setParticipants(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "service_id") {
        const svc = services.find(s => s.id === value);
        if (svc) {
          updated[index].service_name = svc.name;
          updated[index].price = svc.price;
          updated[index].duration_minutes = svc.duration_minutes;
          updated[index].variant_id = undefined;
          updated[index].variant_name = undefined;
          updated[index].addons = [];
        }
      }
      return updated;
    });
  };

  const setParticipantService = useCallback((
    idx: number, service: ServiceItem, variantId?: string, variantName?: string,
  ) => {
    setParticipants(prev => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        service_id: variantId || service.id,
        service_name: variantName || service.name,
        price: service.price,
        duration_minutes: service.duration_minutes,
        variant_id: variantId,
        variant_name: variantName,
        addons: [],
      };
      return updated;
    });
    loadServiceAddons(service.id);
  }, [loadServiceAddons]);

  const addAddonToParticipant = useCallback((participantIdx: number, addon: any) => {
    setParticipants(prev => {
      const updated = [...prev];
      const p = updated[participantIdx];
      if (p.addons.some(a => a.addonId === addon.id)) return prev;
      updated[participantIdx] = {
        ...p,
        addons: [...p.addons, {
          id: `addon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          addonId: addon.id,
          name: addon.title || addon.name,
          price: addon.price || 0,
          duration: addon.duration_minutes || addon.duration || 0,
        }],
      };
      return updated;
    });
  }, []);

  const removeAddonFromParticipant = useCallback((participantIdx: number, addonLineId: string) => {
    setParticipants(prev => {
      const updated = [...prev];
      updated[participantIdx] = {
        ...updated[participantIdx],
        addons: updated[participantIdx].addons.filter(a => a.id !== addonLineId),
      };
      return updated;
    });
  }, []);

  // ─── Product helpers ───────────────────────────────────────────────────
  const addProduct = useCallback((product: ProductItem, quantity = 1, variant?: any) => {
    const unitPrice = variant ? variant.retail_price : (product.retail_price ?? 0);
    const variantLabel = variant?.option_values ? Object.values(variant.option_values).join(" / ") : undefined;
    setGroupProducts(prev => [...prev, {
      id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      productId: product.id,
      productName: product.name,
      productVariantId: variant?.id ?? null,
      productVariantName: variantLabel as string | undefined,
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
    }]);
  }, []);

  const removeProduct = useCallback((lineId: string) => {
    setGroupProducts(prev => prev.filter(p => p.id !== lineId));
  }, []);

  const updateProductQuantity = useCallback((lineId: string, qty: number) => {
    if (qty < 1) { removeProduct(lineId); return; }
    setGroupProducts(prev => prev.map(p =>
      p.id === lineId ? { ...p, quantity: qty, totalPrice: p.unitPrice * qty } : p,
    ));
  }, [removeProduct]);

  const applyAtHomeAddress = useCallback(async (address: PickedMapLocation) => {
    const addressString =
      address.place_name ||
      [address.address_line1, address.city, address.state, address.postal_code, address.country]
        .filter(Boolean)
        .join(", ");

    setFormData(prev => ({
      ...prev,
      address_line1: address.address_line1,
      address_city: address.city,
      address_state: address.state || "",
      address_country: address.country || prev.address_country || "South Africa",
      address_postal_code: address.postal_code || "",
      address_latitude: address.latitude,
      address_longitude: address.longitude,
      address_place_name: address.place_name || address.address_line1,
    }));

    if (!addressString.trim() || !providerId) return;

    try {
      setIsValidatingAddress(true);
      const res = await fetcher.post<{
        data: {
          valid: boolean;
          travelFee: number;
          distanceKm?: number;
          travelTimeMinutes?: number;
          coordinates?: { latitude: number; longitude: number };
          address?: {
            line1?: string;
            city?: string;
            state?: string;
            country?: string;
            postalCode?: string;
            fullAddress?: string;
          };
          reason?: string;
        };
      }>("/api/location/validate", {
        address: addressString,
        provider_id: providerId,
      });

      if (!res.data?.valid) {
        toast.error(res.data?.reason || "This address is outside your active service zones.");
        return;
      }

      setFormData(prev => ({
        ...prev,
        address_line1: res.data.address?.line1 || address.address_line1,
        address_city: res.data.address?.city || address.city,
        address_state: res.data.address?.state || address.state || "",
        address_country: res.data.address?.country || address.country || prev.address_country || "South Africa",
        address_postal_code: res.data.address?.postalCode || address.postal_code || "",
        address_latitude: res.data.coordinates?.latitude ?? address.latitude,
        address_longitude: res.data.coordinates?.longitude ?? address.longitude,
        address_place_name: res.data.address?.fullAddress || address.place_name || address.address_line1,
        travel_fee: Math.max(0, Number(res.data.travelFee || 0)),
      }));
    } catch (error) {
      toast.error(error instanceof FetchError ? error.message : "Failed to calculate travel fee for this address.");
    } finally {
      setIsValidatingAddress(false);
    }
  }, [providerId]);

  // ─── Package handler ──────────────────────────────────────────────────
  const handleAddPackage = useCallback((pkg: typeof packages[0]) => {
    if (!pkg.items?.length) { toast.error("Package has no items"); return; }
    pkg.items.forEach((item: any) => {
      if (item.offering_id && item.offering) {
        const offering = item.offering;
        const svc = services.find(s => s.id === item.offering_id);
        if (svc) {
          participants.forEach((_, idx) => {
            setParticipantService(idx, svc);
          });
        } else {
          const pseudo: ServiceItem = {
            id: offering.id,
            name: offering.variant_name || offering.title || offering.name || "Service",
            category_id: "",
            duration_minutes: offering.duration_minutes ?? 60,
            price: offering.price ?? 0,
            is_active: true,
            order: 0,
          };
          participants.forEach((_, idx) => {
            setParticipantService(idx, pseudo);
          });
        }
      } else if (item.product_id && item.product) {
        const prod = products.find(p => p.id === item.product_id);
        if (prod) addProduct(prod, item.quantity || 1);
      }
    });
    setSelectedPackageId(pkg.id);
    toast.success(`Package "${pkg.name}" applied`);
  }, [services, products, participants, setParticipantService, addProduct]);

  // ─── Pricing ──────────────────────────────────────────────────────────
  const participantServices = useMemo((): AppointmentService[] =>
    participants.map((p, i) => ({
      id: `p-${i}`,
      serviceId: p.service_id,
      serviceName: p.service_name,
      duration: p.duration_minutes,
      price: p.price,
      addons: p.addons.map(a => ({
        id: a.id,
        addonId: a.addonId,
        addonName: a.name,
        price: a.price,
        duration: a.duration,
      })),
    })),
  [participants]);

  const pricing = useMemo(() =>
    calculateBookingPricing(
      participantServices,
      groupProducts,
      effectiveTravelFee(formData.location_type, formData.travel_fee),
      0,
      0,
      0,
      0,
    ),
  [participantServices, groupProducts, formData.travel_fee, formData.location_type]);

  const totalDuration = useMemo(() =>
    Math.max(formData.duration_minutes, ...participants.map(p =>
      p.duration_minutes + p.addons.reduce((s, a) => s + a.duration, 0)
    ), 0),
  [formData.duration_minutes, participants]);

  // ─── Filtered services/products ────────────────────────────────────────
  const filteredServices = useMemo(() => {
    return services.filter(s => {
      const typeOk = !s.service_type || s.service_type === "basic" || s.service_type === "variant" || s.service_type === "package";
      if (!typeOk) return false;
      if (!serviceSearchQuery.trim()) return true;
      const q = serviceSearchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
    });
  }, [services, serviceSearchQuery]);

  const filteredProducts = useMemo(() => {
    if (!productSearchQuery.trim()) return products;
    const q = productSearchQuery.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, productSearchQuery]);

  // ─── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // §Group-booking-audit 2026-05: two-step submit — when on the form step,
    // validate everything client-side then transition to the review step.
    // Only the second submit (from the review block) actually posts.
    if (createStep === "form" && !booking) {
      for (let i = 0; i < participants.length; i++) {
        const ph = participants[i].client_phone?.trim();
        if (ph && !isCompleteE164(ph)) {
          toast.error(`Participant ${i + 1}: enter a valid phone number or leave it blank.`);
          return;
        }
      }
      if (!formData.scheduled_date?.trim() || !formData.scheduled_time?.trim()) {
        toast.error('Choose a date and time (use available slots or open "Manual date and time").');
        return;
      }
      const parsedStart = parseSelectedDatetimeInProviderTz(
        formData.scheduled_date,
        formData.scheduled_time,
        portalProvider?.timezone,
      );
      if (Number.isNaN(parsedStart.getTime())) {
        toast.error("Invalid date or time.");
        return;
      }
      if (participants.length === 0) {
        toast.error("Add at least one participant before reviewing.");
        return;
      }
      setCreateStep("review");
      return;
    }

    if (participants.length > formData.max_participants) {
      toast.error(
        `Too many participants. You have ${participants.length} but the session capacity is ${formData.max_participants}. Increase the limit in the Session Capacity section.`
      );
      setCreateStep("form");
      return;
    }

    setIsLoading(true);

    try {
      for (let i = 0; i < participants.length; i++) {
        const ph = participants[i].client_phone?.trim();
        if (ph && !isCompleteE164(ph)) {
          toast.error(`Participant ${i + 1}: enter a valid phone number or leave it blank.`);
          setIsLoading(false);
          return;
        }
      }

      if (!formData.scheduled_date?.trim() || !formData.scheduled_time?.trim()) {
        toast.error('Choose a date and time (use available slots or open "Manual date and time").');
        setIsLoading(false);
        return;
      }
      const parsedStart = parseSelectedDatetimeInProviderTz(
        formData.scheduled_date,
        formData.scheduled_time,
        portalProvider?.timezone,
      );
      if (Number.isNaN(parsedStart.getTime())) {
        toast.error("Invalid date or time.");
        setIsLoading(false);
        return;
      }
      const scheduledAt = parsedStart.toISOString();

      const participantPayload = participants.map((p) => ({
        name: p.client_name || "",
        participant_name: p.client_name || "",
        email: p.client_email || undefined,
        participant_email: p.client_email || undefined,
        phone: p.client_phone || undefined,
        participant_phone: p.client_phone || undefined,
        booking_id: p.booking_id || undefined,
        // §Group-booking-audit 2026-05: pass customer_id when an existing
        // provider client was selected via search so the server-side booking
        // insert can link the correct customer record for invoicing/history.
        customer_id: p.customer_id || undefined,
        service_id: p.service_id || formData.service_id,
        service_name: p.service_name || formData.service_name,
        price: p.price + p.addons.reduce((s, a) => s + a.price, 0),
        duration_minutes: p.duration_minutes + p.addons.reduce((s, a) => s + a.duration, 0),
        addons: p.addons.map(a => ({ id: a.addonId, name: a.name, price: a.price, duration: a.duration })),
        notes: p.notes?.trim() || undefined,
      }));

      const apiPayload: Record<string, unknown> = {
        title: formData.title || formData.service_name || "Group Session",
        scheduled_at: scheduledAt,
        service_id: formData.service_id || undefined,
        staff_id: formData.team_member_id || undefined,
        location_id: formData.location_type === "at_salon" ? (formData.location_id || undefined) : undefined,
        max_participants: Math.max(formData.max_participants, participants.length, 1),
        duration_minutes: totalDuration,
        notes: formData.notes || undefined,
        // §Group-booking-audit 2026-05: forward the review-screen toggle so
        // the API can send a confirmation to the primary contact only.
        send_notification: booking ? undefined : createSendNotification,
        // Only payment_link is actioned server-side (a link per participant
        // booking); cash / card / yoco are settled via mark_paid below.
        payment_method:
          !booking && createPaymentMethod === "payment_link" ? "payment_link" : undefined,
        participants: participantPayload,
        scheduled_date: formData.scheduled_date,
        scheduled_time: formData.scheduled_time,
        team_member_id: formData.team_member_id,
        team_member_name: teamMembers.find(m => m.id === formData.team_member_id)?.name,
        service_name: formData.service_name,
        total_price: pricing.totalAmount,
        location_type: formData.location_type,
        address_line1: formData.location_type === "at_home" ? formData.address_line1 : undefined,
        address_city: formData.location_type === "at_home" ? formData.address_city : undefined,
        address_state: formData.location_type === "at_home" ? formData.address_state : undefined,
        address_country: formData.location_type === "at_home" ? formData.address_country : undefined,
        address_postal_code: formData.location_type === "at_home" ? formData.address_postal_code : undefined,
        address_latitude: formData.location_type === "at_home" ? formData.address_latitude : undefined,
        address_longitude: formData.location_type === "at_home" ? formData.address_longitude : undefined,
        address_place_name: formData.location_type === "at_home" ? formData.address_place_name : undefined,
        travel_fee: formData.location_type === "at_home" ? formData.travel_fee : 0,
        products: groupProducts.map((p) => ({
          product_id: p.productId,
          product_name: p.productName,
          product_variant_id: p.productVariantId,
          product_variant_name: p.productVariantName,
          quantity: p.quantity,
          unit_price: p.unitPrice,
          total_price: p.totalPrice,
        })),
        // §Provider-audit 2026-04 (packages round 2): persist the selected
        // service package on group bookings. Previously the UI expanded the
        // package contents into participants/products, but never told the
        // server which package generated those lines — so the booking row
        // lost the link to `service_packages` and package-level reporting /
        // discount math was not applied.
        ...(selectedPackageId ? { package_id: selectedPackageId } : {}),
      };

      if (booking) {
        await providerApi.updateGroupBooking(booking.id, apiPayload as Partial<GroupBooking>);
        toast.success("Group booking updated");
      } else {
        const created = await providerApi.createGroupBooking(apiPayload as Partial<GroupBooking>);
        // §Group-booking-audit 2026-05 (auto mark_paid): when the provider
        // chose cash/manual-card/yoco from the review step, immediately
        // record the payment so the receipt is "paid" right out of the gate.
        // payment_link is skipped here — the create call above already sent a
        // link to each participant's own booking.
        // paystack_terminal: show QR sheet instead of calling mark_paid.
        const methodToMark =
          createPaymentMethod === "cash"
            ? "cash"
            : createPaymentMethod === "card"
              ? "card"
              : createPaymentMethod === "yoco_pos"
                ? "yoco"
                : null;
        const createdId =
          (created as { id?: string; data?: { id?: string } } | null)?.id ??
          (created as { data?: { id?: string } } | null)?.data?.id ??
          null;
        const createWarnings =
          (created as { _warnings?: string[]; data?: { _warnings?: string[] } } | null)
            ?._warnings ??
          (created as { data?: { _warnings?: string[] } } | null)?.data?._warnings ??
          [];
        for (const warning of createWarnings) toast.warning(warning);
        if (createPaymentMethod === "paystack_terminal" && createdId) {
          toast.success("Group booking created — preparing Paystack Terminal…");
          onSuccess?.();
          onOpenChange(false);
          // Trigger prepare-collection in background and surface QR
          setIsPreparingTerminal(true);
          try {
            const { fetcher: f } = await import("@/lib/http/fetcher");
            // fetcher.post returns raw JSON: { data: { terminal, ... }, error: null }
            const terminalRes = await f.post("/api/provider/paystack/terminal-payments", {
              entity_type: "group_booking",
              entity_id: createdId,
              expected_amount: pricing.totalAmount,
            }) as { data?: { terminal?: { qr_url?: string; payment_link?: string; terminal_url?: string; name?: string } }; error?: string | null };
            const terminal = terminalRes?.data?.terminal;
            if (terminal) {
              setPostCreatePaystackData({ expectedAmount: pricing.totalAmount, terminal });
            } else {
              toast.info("Group created. Use the Payment Inbox to collect via Paystack Terminal.");
            }
          } catch {
            toast.info("Group created. Use the Payment Inbox to collect via Paystack Terminal.");
          } finally {
            setIsPreparingTerminal(false);
          }
          return;
        }
        if (createPaymentMethod === "paycloud_terminal" && createdId) {
          toast.success("Group booking created — collect payment on your card machine");
          onSuccess?.();
          onOpenChange(false);
          setPostCreatePaycloudData({
            groupId: createdId,
            expectedAmount: pricing.totalAmount,
            locationId: formData.location_type === "at_home" ? null : formData.location_id ?? null,
          });
          return;
        } else if (methodToMark && createdId) {
          try {
            const { fetcher } = await import("@/lib/http/fetcher");
            await fetcher.post(
              `/api/provider/group-bookings/${createdId}?action=mark_paid`,
              { payment_method: methodToMark },
            );
            toast.success("Group booking created and marked paid");
          } catch (markErr) {
            toast.error(
              `Group created — payment not recorded (${markErr instanceof Error ? markErr.message : "Unknown error"}). Mark it paid from the detail page.`,
            );
          }
        } else {
          toast.success("Group booking created");
        }
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save group booking:", error);
      // Surface server-side detail (e.g. SLOT_NOT_AVAILABLE / validation)
      // instead of the generic label so conflicts from the shared
      // availability engine are visible to the provider.
      const detail =
        typeof error === "object" && error !== null
          ? ((error as { message?: string; error?: string; details?: string }).message
              || (error as { error?: string }).error
              || (error as { details?: string }).details
              || null)
          : null;
      toast.error(detail || "Failed to save group booking");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────
  const selectedTeamMember = teamMembers.find(m => m.id === formData.team_member_id);
  const selectedService = services.find(s => s.id === formData.service_id);
  const isEditing = !!booking;
  const title = isEditing
    ? "Edit Group Booking"
    : existingAppointments.length > 0
      ? "Create Group from Appointments"
      : "New Group Booking";

  // ─── Service selection handler for participant ─────────────────────────
  const handleParticipantServiceSelect = (participantIdx: number, serviceId: string) => {
    const svc = services.find(s => s.id === serviceId);
    if (!svc) return;

    if (svc.service_type === "variant") {
      const parentId = (svc as any).parent_service_id;
      const parent = parentId ? services.find(s => s.id === parentId) : null;
      if (parent) {
        setParticipantService(participantIdx, parent, svc.id, (svc as any).variant_name || svc.name);
      } else {
        setParticipantService(participantIdx, svc);
      }
    } else if ((svc as any).has_variants || ((svc as any).variants?.length ?? 0) > 0) {
      setVariantPickerFor({ participantIdx, serviceId: svc.id });
      loadServiceVariants(svc.id);
    } else {
      setParticipantService(participantIdx, svc);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        suppressFallbackTitle
        className="p-0 gap-0 border-0 max-w-[100vw] sm:max-w-[min(90vw,680px)] max-h-[95vh] sm:max-h-[min(90vh,850px)] overflow-hidden rounded-t-3xl sm:rounded-2xl box-border flex flex-col"
        onPointerDownOutside={(e) => {
          // Prevent dialog dismissal when clicking the Mapbox suggestion dropdown (portal).
          const target = e.target as HTMLElement | null;
          if (target?.closest('[data-address-autocomplete-listbox="true"]') || target?.closest('[data-address-autocomplete-option="true"]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest('[data-address-autocomplete-listbox="true"]')) {
            e.preventDefault();
          }
        }}
      >
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-purple-500 to-violet-600 flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b bg-white flex-shrink-0">
          <div className="min-w-0 flex-1">
            <DialogHeader className="space-y-0">
              <DialogTitle className="text-lg font-semibold text-gray-900 truncate">{title}</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-gray-500 mt-0.5">
              {participants.length > 0
                ? `${participants.length} participant${participants.length !== 1 ? "s" : ""} · ${totalDuration} min · ${formatMoney(pricing.totalAmount)}`
                : "Schedule multiple clients together"}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <Badge variant="outline" className="text-xs border-purple-200 text-purple-700 bg-purple-50">
              <Users className="w-3 h-3 mr-1" />Group
            </Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4 text-gray-500" />
            </Button>
          </div>
        </div>

        {/* Scrollable body: flex-1 + min-h-0 so the form scrolls inside max-h dialog */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <form
            id="group-booking-form"
            onSubmit={handleSubmit}
            className={`p-4 sm:p-6 space-y-4 sm:space-y-5 box-border w-full max-w-full overflow-x-hidden min-w-0 ${createStep === "review" && !booking ? "hidden" : ""}`}
          >

            {/* Title */}
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Title / Group Name</Label>
              <Input
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Bridal Party, Team Workshop..."
                className="h-10"
              />
            </div>

            <Separator />

            {/* ─── Location ──────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <MapPin className="w-4 h-4 text-gray-400" />Location
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setFormData({ ...formData, location_type: "at_salon", travel_fee: 0 })}
                  className={cn("p-3 border-2 rounded-xl text-left transition-all", formData.location_type === "at_salon" ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300")}>
                  <div className="flex items-center gap-2">
                    <Building2 className={cn("w-4 h-4", formData.location_type === "at_salon" ? "text-primary" : "text-gray-400")} />
                    <div><div className="font-medium text-sm">At Salon</div><div className="text-[10px] text-gray-500">Your location</div></div>
                  </div>
                </button>
                <button type="button" onClick={() => setFormData({ ...formData, location_type: "at_home" })}
                  className={cn("p-3 border-2 rounded-xl text-left transition-all", formData.location_type === "at_home" ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300")}>
                  <div className="flex items-center gap-2">
                    <Home className={cn("w-4 h-4", formData.location_type === "at_home" ? "text-primary" : "text-gray-400")} />
                    <div><div className="font-medium text-sm">At Home</div><div className="text-[10px] text-gray-500">Client location</div></div>
                  </div>
                </button>
              </div>
              {formData.location_type === "at_salon" && (
                <div>
                  <Label className="text-xs text-gray-500">Salon Location</Label>
                  <Select value={formData.location_id} onValueChange={v => setFormData({ ...formData, location_id: v })}>
                    <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {providerLocations.length > 0
                        ? providerLocations.map((loc: any) => <SelectItem key={loc.id} value={loc.id}>{loc.name}{loc.address ? ` — ${loc.address}` : ""}</SelectItem>)
                        : <SelectItem value="main">Main Location</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {formData.location_type === "at_home" && (
                <div className="space-y-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <Label className="text-xs text-gray-500">Address *</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setMapPickerOpen(true)}
                      >
                        <MapPin className="mr-1 h-3 w-3" /> Drop pin
                      </Button>
                    </div>
                    <AddressAutocomplete
                      value={formData.address_place_name || formData.address_line1}
                      inputId="group-booking-address"
                      placeholder="Search street address..."
                      country="ZA"
                      defaultCountryName="South Africa"
                      onInputChange={(value) =>
                        setFormData(prev => ({ ...prev, address_place_name: value, address_line1: value }))
                      }
                      onChange={applyAtHomeAddress}
                      inputClassName="h-10 bg-white"
                      required={formData.location_type === "at_home"}
                    />
                    {isValidatingAddress && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-blue-700">
                        <Loader2 className="h-3 w-3 animate-spin" /> Calculating travel fee...
                      </p>
                    )}
                    {formData.address_latitude != null && formData.address_longitude != null && (
                      <p className="mt-1 text-[11px] text-blue-700">
                        Pin saved: {formData.address_latitude.toFixed(5)}, {formData.address_longitude.toFixed(5)}
                        {formData.travel_fee > 0 ? ` · Travel fee ${formatMoney(formData.travel_fee)}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-gray-500">City</Label>
                      <Input value={formData.address_city} onChange={e => setFormData({ ...formData, address_city: e.target.value })} placeholder="City" className="mt-1 h-10" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Postal Code</Label>
                      <Input value={formData.address_postal_code} onChange={e => setFormData({ ...formData, address_postal_code: e.target.value })} placeholder="Postal code" className="mt-1 h-10" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-gray-500">Province / State</Label>
                      <Input value={formData.address_state} onChange={e => setFormData({ ...formData, address_state: e.target.value })} placeholder="Province" className="mt-1 h-10" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Country</Label>
                      <Input value={formData.address_country} onChange={e => setFormData({ ...formData, address_country: e.target.value })} placeholder="Country" className="mt-1 h-10" />
                    </div>
                  </div>
                  {/* Travel fee is auto-derived from the validated service zone — read-only. */}
                  {formData.travel_fee > 0 && (
                    <div>
                      <Label className="text-xs text-gray-500">Travel Fee (auto-calculated)</Label>
                      <div className="mt-1 h-10 flex items-center px-3 bg-blue-50 border border-blue-100 rounded-md text-sm font-medium text-blue-900">
                        {formatMoney(formData.travel_fee)}
                      </div>
                      <p className="mt-1 text-[11px] text-blue-600">Derived from your active service zones for this address.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* ─── Team Member & Default Service ──────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Tag className="w-4 h-4 text-gray-400" />Service Details
              </div>
              <p className="text-xs text-gray-500">
                Select a team member to check real availability slots. You can also pick a service to pre-fill all participant lines below — each can still be changed individually.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">Team Member *</Label>
                  <Select value={formData.team_member_id} onValueChange={v => setFormData({ ...formData, team_member_id: v })} required>
                    <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="Select team member" /></SelectTrigger>
                    <SelectContent>
                      {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Pre-fill service for all participants</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400 z-10" />
                    <Select
                      value={formData.service_id}
                      onValueChange={v => {
                        const svc = services.find(s => s.id === v);
                        setFormData({
                          ...formData,
                          service_id: v,
                          service_name: svc?.name || "",
                          duration_minutes: svc?.duration_minutes || formData.duration_minutes,
                        });
                      }}
                    >
                      <SelectTrigger className="h-10 pl-8"><SelectValue placeholder="Select service (optional)" /></SelectTrigger>
                      <SelectContent>
                        {services.filter(s => !s.service_type || s.service_type === "basic" || s.service_type === "variant" || s.service_type === "package").map(svc => (
                          <SelectItem key={svc.id} value={svc.id}>
                            <span className="truncate">{svc.name}</span>
                            {svc.price > 0 && <span className="text-gray-400 ml-1">· {formatMoney(svc.price)}</span>}
                            {svc.service_type === "variant" && <Badge variant="outline" className="ml-1 text-[9px] h-4 px-1">Variant</Badge>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">Selecting a service pre-fills it for all participants below. Each participant can still use a different service.</p>
                </div>
              </div>
              {(selectedTeamMember || selectedService) && (
                <div className="flex flex-wrap gap-2">
                  {selectedTeamMember && <Badge variant="secondary" className="text-xs"><User className="w-3 h-3 mr-1" />{selectedTeamMember.name}</Badge>}
                  {selectedService && <Badge variant="secondary" className="text-xs">{selectedService.name}{selectedService.price > 0 && ` · ${formatMoney(selectedService.price)}`}</Badge>}
                </div>
              )}
            </div>

            <Separator />

            {/* ─── Schedule ─────────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <CalendarIcon className="w-4 h-4 text-gray-400" />Schedule
              </div>

              {!formData.team_member_id && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Select a team member to load real availability slots for this location.
                </p>
              )}

              {formData.team_member_id && (
                <div className="bg-purple-50/50 rounded-xl border border-purple-100 p-3">
                  <p className="text-xs font-medium text-purple-900 mb-2">Available slots</p>
                  <AvailabilitySlotPicker
                    staffId={formData.team_member_id}
                    locationId={formData.location_id}
                    providerId={providerId}
                    duration={totalDuration}
                    selectedDate={formData.scheduled_date}
                    selectedTime={formData.scheduled_time}
                    onDateChange={date => setFormData(prev => ({ ...prev, scheduled_date: date }))}
                    onTimeChange={time => setFormData(prev => ({ ...prev, scheduled_time: time }))}
                    mode={formData.location_type === "at_home" ? "mobile" : "salon"}
                  />
                </div>
              )}

              <div>
                <button
                  type="button"
                  className="text-xs text-gray-600 hover:text-gray-900 font-medium flex items-center gap-1"
                  onClick={() => setManualScheduleOpen(o => !o)}
                >
                  <ChevronDown className={cn("w-3 h-3 transition-transform", manualScheduleOpen && "rotate-180")} />
                  Manual date and time
                </button>
              </div>

              {manualScheduleOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-dashed border-gray-200">
                  <div>
                    <Label className="text-xs text-gray-500">Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start text-left font-normal h-10 mt-1", !formData.scheduled_date && "text-muted-foreground")}
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5 text-gray-400" />
                          {formData.scheduled_date ? format(new Date(formData.scheduled_date + "T12:00:00"), "MMM d, yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.scheduled_date ? new Date(formData.scheduled_date + "T12:00:00") : undefined}
                          onSelect={date => date && setFormData({ ...formData, scheduled_date: format(date, "yyyy-MM-dd") })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Time *</Label>
                    <Input
                      type="time"
                      value={formData.scheduled_time}
                      onChange={e => setFormData({ ...formData, scheduled_time: e.target.value })}
                      className="mt-1 h-10"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Duration (min) *</Label>
                    <Input
                      type="number"
                      value={formData.duration_minutes}
                      onChange={e => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 60 })}
                      min={15}
                      step={15}
                      className="mt-1 h-10"
                      required
                    />
                  </div>
                </div>
              )}

              {!manualScheduleOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Duration (min) *</Label>
                    <Input
                      type="number"
                      value={formData.duration_minutes}
                      onChange={e => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 60 })}
                      min={15}
                      step={15}
                      className="mt-1 h-10"
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* ─── Participants ───────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Users className="w-4 h-4 text-gray-400" />Participants
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">{participants.length}</Badge>
                  {participants.length >= formData.max_participants && (
                    <Badge variant="destructive" className="text-[10px] h-5 px-1.5">Full</Badge>
                  )}
                </div>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddParticipant}
                          disabled={participants.length >= formData.max_participants}
                          className="h-8 text-xs"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />Add
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {participants.length >= formData.max_participants && (
                      <TooltipContent side="left" className="text-xs">
                        Session is at capacity ({formData.max_participants}). Increase the limit in the Session Capacity section below.
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
              {booking ? (
                // Saving an existing group only patches the group row, so edits
                // made to these rows are discarded — don't let the form imply
                // otherwise.
                <p className="text-xs text-amber-700">
                  Saving updates the session details only. To change who is booked, or their
                  service, price or notes, open the group and edit the participant there.
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Search for an existing client or enter details manually. One row per person — service, add-ons and price flow into the group total and accounting.
                </p>
              )}

              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-0.5">
                {participants.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed rounded-xl">
                    <Users className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500 mb-1">No participants yet</p>
                    <p className="text-xs text-gray-400 mb-3">Add clients to this group booking</p>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddParticipant} className="h-8 text-xs">
                      <Plus className="w-3.5 h-3.5 mr-1" />Add Participant
                    </Button>
                  </div>
                ) : (
                  participants.map((participant, index) => {
                    const pTotal = participant.price + participant.addons.reduce((s, a) => s + a.price, 0);
                    const pDur = participant.duration_minutes + participant.addons.reduce((s, a) => s + a.duration, 0);
                    const catalogServiceId = participant.variant_id
                      ? services.find(s => s.id === participant.variant_id || (s as any).parent_service_id)?.id || participant.service_id
                      : participant.service_id;
                    const clientSearch = participantClientSearch[index] || { query: "", results: [], loading: false, open: false };
                    const isLastParticipant = index === participants.length - 1;

                    return (
                      <div key={index} className="p-3 bg-gray-50 rounded-xl border space-y-2.5">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-purple-700">{index + 1}</span>
                            </div>
                            <span className="text-sm font-medium text-gray-700 truncate max-w-[160px]">
                              {participant.client_name || `Participant ${index + 1}`}
                            </span>
                            {participant.customer_id && (
                              <Badge variant="outline" className="text-[9px] h-4 border-purple-200 text-purple-700 bg-purple-50">
                                Existing client
                              </Badge>
                            )}
                            {participant.variant_name && <Badge variant="outline" className="text-[9px] h-4">{participant.variant_name}</Badge>}
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveParticipant(index)} className="text-gray-400 hover:text-red-500 h-7 w-7">
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* ── Client search row ── */}
                        {!participant.customer_id ? (
                          <div className="relative">
                            <div className="relative">
                              <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                              <Input
                                placeholder="Search existing clients…"
                                value={clientSearch.query}
                                onChange={e => searchClientsForParticipant(index, e.target.value)}
                                onFocus={() => { if (clientSearch.query.length >= 2) setParticipantClientSearchState(index, { open: true }); }}
                                onBlur={() => setTimeout(() => setParticipantClientSearchState(index, { open: false }), 200)}
                                className="pl-7 h-8 text-xs bg-white"
                                autoComplete="off"
                              />
                              {clientSearch.loading && <Loader2 className="absolute right-2 top-2 w-3.5 h-3.5 text-gray-400 animate-spin" />}
                            </div>
                            {clientSearch.open && clientSearch.results.length > 0 && (
                              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                                {clientSearch.results.map(c => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-50 transition-colors"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => {
                                      setParticipants(prev => prev.map((p, i) => i !== index ? p : {
                                        ...p,
                                        customer_id: c.customer_id,
                                        client_name: c.full_name,
                                        client_email: c.email || p.client_email,
                                        client_phone: c.phone || p.client_phone,
                                      }));
                                      setParticipantClientSearchState(index, { query: "", results: [], open: false });
                                    }}
                                  >
                                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                                      <User className="w-3 h-3 text-purple-600" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-gray-900 truncate">{c.full_name}</p>
                                      <p className="text-[10px] text-gray-500 truncate">{c.phone || c.email || "—"}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                            {clientSearch.open && clientSearch.query.length >= 2 && !clientSearch.loading && clientSearch.results.length === 0 && (
                              <p className="mt-1 text-[10px] text-gray-400">No existing clients found — fill in details below.</p>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="text-[10px] text-purple-600 hover:text-purple-800 underline underline-offset-2"
                            onClick={() => setParticipants(prev => prev.map((p, i) => i !== index ? p : { ...p, customer_id: undefined }))}
                          >
                            Change client
                          </button>
                        )}

                        {/* Contact fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-gray-400 uppercase tracking-wider">Name *</Label>
                            <Input
                              ref={el => { participantNameRefs.current[index] = el; }}
                              value={participant.client_name}
                              onChange={e => handleParticipantChange(index, "client_name", e.target.value)}
                              placeholder="Client name"
                              required
                              className="mt-0.5 h-9 text-sm"
                            />
                          </div>
                          <div>
                            <PhoneInput label="Phone" inputId={`group-booking-participant-phone-${index}`} value={participant.client_phone} onChange={e164 => handleParticipantChange(index, "client_phone", e164)} className="mt-0 space-y-0.5" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-gray-400 uppercase tracking-wider">Email</Label>
                            <Input
                              type="email"
                              value={participant.client_email}
                              onChange={e => handleParticipantChange(index, "client_email", e.target.value)}
                              placeholder="email@example.com"
                              className="mt-0.5 h-9 text-sm"
                              onKeyDown={e => {
                                // Enter on last participant's email → add another
                                if (e.key === "Enter" && isLastParticipant) {
                                  e.preventDefault();
                                  handleAddParticipant();
                                }
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-gray-400 uppercase tracking-wider">Service</Label>
                            <Select
                              value={participant.service_id || formData.service_id}
                              onValueChange={v => handleParticipantServiceSelect(index, v)}
                            >
                              <SelectTrigger className="mt-0.5 h-9 text-sm"><SelectValue placeholder="Service" /></SelectTrigger>
                              <SelectContent className="z-[200001]">
                                {filteredServices.map(svc => (
                                  <SelectItem key={svc.id} value={svc.id}>
                                    {svc.name}
                                    {svc.service_type === "variant" && <span className="text-[10px] text-purple-500 ml-1">[Variant]</span>}
                                    {svc.price > 0 && <span className="text-gray-400 ml-1">· {formatMoney(svc.price)}</span>}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Addons */}
                        {participant.addons.length > 0 && (
                          <div className="pl-9 space-y-1 border-l-2 border-purple-200 ml-3">
                            {participant.addons.map(addon => (
                              <div key={addon.id} className="flex items-center justify-between text-xs group/addon">
                                <span className="text-gray-600">{addon.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500">{formatMoney(addon.price)}</span>
                                  <button type="button" onClick={() => removeAddonFromParticipant(index, addon.id)}
                                    className="opacity-0 group-hover/addon:opacity-100 text-red-400 hover:text-red-600 transition-opacity">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Notes for this guest only — the group note is separate */}
                        <div>
                          <Label className="text-[10px] text-gray-400 uppercase tracking-wider">
                            Participant notes
                          </Label>
                          <Input
                            value={participant.notes}
                            onChange={e => handleParticipantChange(index, "notes", e.target.value)}
                            placeholder="Preferences, allergies, add-on instructions…"
                            maxLength={2000}
                            className="mt-0.5 h-9 text-sm"
                          />
                        </div>

                        {/* Bottom row: add extra, duration, price, add-another */}
                        <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                          <div className="flex items-center gap-2">
                            <button type="button"
                              className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                              onClick={() => {
                                setAddonPickerFor({ participantIdx: index, catalogServiceId });
                                loadServiceAddons(catalogServiceId);
                              }}>
                              <Plus className="w-3 h-3" />Add extra
                            </button>
                            <span className="text-[10px] text-gray-400">{pDur} min</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-400">R</span>
                              <Input type="number" value={participant.price} onChange={e => handleParticipantChange(index, "price", parseFloat(e.target.value) || 0)} min={0} step={0.01} className="h-8 w-20 text-sm text-right" />
                              {participant.addons.length > 0 && (
                                <span className="text-[10px] text-gray-400">(+{formatMoney(participant.addons.reduce((s, a) => s + a.price, 0))})</span>
                              )}
                            </div>
                            {isLastParticipant && participants.length < formData.max_participants && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddParticipant}
                                className="h-8 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                              >
                                <Plus className="w-3 h-3 mr-1" />Add another
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <Separator />

            {/* ─── Session capacity ────────────────────────────────── */}
            {(() => {
              const currentCount = participants.length;
              const cap = formData.max_participants;
              const filledPct = cap > 0 ? Math.round((currentCount / cap) * 100) : 0;
              const atCapacity = currentCount >= cap;
              const nearCapacity = !atCapacity && currentCount >= cap - 1 && cap > 1;

              return (
                <TooltipProvider delayDuration={200}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <Lock className="w-4 h-4 text-gray-400" />
                      Session Capacity
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[240px] text-xs leading-relaxed">
                          The maximum number of participants allowed in this session.
                          Adding more participants will be blocked once this limit is reached.
                          Set higher than your initial list to leave room for walk-ins.
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Stepper */}
                      <div className="flex items-center gap-0 border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          aria-label="Decrease capacity"
                          disabled={cap <= Math.max(1, currentCount)}
                          className="h-9 w-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          onClick={() =>
                            setFormData(prev => ({
                              ...prev,
                              max_participants: Math.max(Math.max(1, currentCount), prev.max_participants - 1),
                            }))
                          }
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          aria-label="Session capacity"
                          value={formData.max_participants}
                          min={Math.max(1, currentCount)}
                          max={200}
                          onChange={e => {
                            const v = parseInt(e.target.value);
                            if (Number.isFinite(v) && v >= 1) {
                              setFormData(prev => ({
                                ...prev,
                                max_participants: Math.max(Math.max(1, currentCount), v),
                              }));
                            }
                          }}
                          className="h-9 w-14 text-center text-sm font-semibold border-x border-gray-200 focus:outline-none focus:ring-1 focus:ring-primary/50 bg-white"
                        />
                        <button
                          type="button"
                          aria-label="Increase capacity"
                          disabled={cap >= 200}
                          className="h-9 w-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          onClick={() =>
                            setFormData(prev => ({
                              ...prev,
                              max_participants: Math.min(200, prev.max_participants + 1),
                            }))
                          }
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Live status pill */}
                      {currentCount > 0 && (
                        <div className={cn(
                          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                          atCapacity
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : nearCapacity
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-green-50 text-green-700 border border-green-200",
                        )}>
                          <span>{currentCount} / {cap} spots filled</span>
                          {atCapacity && <span>· Full</span>}
                          {nearCapacity && <span>· 1 left</span>}
                          {!atCapacity && !nearCapacity && cap - currentCount > 1 && (
                            <span>· {cap - currentCount} remaining</span>
                          )}
                        </div>
                      )}

                      {currentCount === 0 && (
                        <p className="text-xs text-gray-400">
                          {cap} spot{cap !== 1 ? "s" : ""} available once you add participants.
                        </p>
                      )}
                    </div>

                    {/* Progress bar — only meaningful once there are participants */}
                    {currentCount > 0 && (
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            atCapacity ? "bg-red-500" : nearCapacity ? "bg-amber-400" : "bg-green-500",
                          )}
                          style={{ width: `${Math.min(100, filledPct)}%` }}
                        />
                      </div>
                    )}

                    {atCapacity && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                        Session is at capacity. Increase the limit above before adding more participants.
                      </p>
                    )}
                  </div>
                </TooltipProvider>
              );
            })()}

            <Separator />

            {/* ─── Products ──────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <ShoppingBag className="w-4 h-4 text-gray-400" />Products
              </div>

              {groupProducts.length > 0 && (
                <div className="space-y-1">
                  {groupProducts.map(prod => (
                    <div key={prod.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border text-sm group">
                      <div className="flex items-center gap-2 min-w-0">
                        <ShoppingBag className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{prod.productName}</span>
                        {prod.productVariantName && <Badge variant="outline" className="text-[9px] h-4">{prod.productVariantName}</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border rounded">
                          <button type="button" className="px-1.5 py-0.5 text-xs hover:bg-gray-100" onClick={() => updateProductQuantity(prod.id, prod.quantity - 1)}>-</button>
                          <span className="px-1.5 text-xs min-w-[20px] text-center">{prod.quantity}</span>
                          <button type="button" className="px-1.5 py-0.5 text-xs hover:bg-gray-100" onClick={() => updateProductQuantity(prod.id, prod.quantity + 1)}>+</button>
                        </div>
                        <span className="text-xs text-gray-600 w-16 text-right">{formatMoney(prod.totalPrice)}</span>
                        <button type="button" onClick={() => removeProduct(prod.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Product picker */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input placeholder="Search products..." value={productSearchQuery}
                    onChange={e => {
                      setProductSearchQuery(e.target.value);
                      if (e.target.value.trim().length >= 2) loadProducts(e.target.value.trim());
                      else if (!e.target.value.trim() && products.length === 0) loadProducts();
                    }}
                    onFocus={() => { if (!productsLoadedRef.current && products.length === 0) loadProducts(); }}
                    className="pl-8 h-9 text-sm" />
                </div>
                <Select value="" onValueChange={v => {
                  const [pid, vid] = v.includes("::") ? v.split("::") : [v, null];
                  const prod = filteredProducts.find(p => p.id === pid);
                  if (!prod) return;
                  const variant = vid && (prod as any).variants?.length ? (prod as any).variants.find((vr: any) => vr.id === vid) : null;
                  addProduct(prod, 1, variant ?? undefined);
                  setProductSearchQuery("");
                }}
                  onOpenChange={o => { if (o && !productsLoadedRef.current && products.length === 0) loadProducts(); }}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Add a product..." /></SelectTrigger>
                  <SelectContent className="z-[200001]">
                    {filteredProducts.flatMap(p => {
                      if (p.has_variants && p.variants?.length) {
                        return p.variants.map(v => (
                          <SelectItem key={`${p.id}::${v.id}`} value={`${p.id}::${v.id}`}>
                            {p.name} — {Object.values(v.option_values || {}).join(" / ")}
                            <span className="text-gray-400 ml-1">· {formatMoney(v.retail_price)}</span>
                          </SelectItem>
                        ));
                      }
                      return [(
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.retail_price > 0 && <span className="text-gray-400 ml-1">· {formatMoney(p.retail_price)}</span>}
                        </SelectItem>
                      )];
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* ─── Packages ──────────────────────────────────────── */}
            {packages.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Package className="w-4 h-4 text-gray-400" />Packages
                </div>
                <Select value={selectedPackageId || ""} onValueChange={v => {
                  const pkg = packages.find(p => p.id === v);
                  if (pkg) handleAddPackage(pkg);
                }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Apply a package..." /></SelectTrigger>
                  <SelectContent className="z-[200001]">
                    {isLoadingPackages && <div className="flex items-center gap-2 p-2 text-xs text-gray-500"><Loader2 className="w-3 h-3 animate-spin" />Loading...</div>}
                    {packages.map(pkg => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name}
                        {pkg.price != null && <span className="text-gray-400 ml-1">· {formatMoney(pkg.price)}</span>}
                        {pkg.items?.length ? <span className="text-gray-400 ml-1">({pkg.items.length} items)</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {packages.length > 0 && <Separator />}

            {/* ─── Notes ──────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <StickyNote className="w-4 h-4 text-gray-400" />Notes
              </div>
              <Textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} placeholder="Add any notes about this group booking..." className="resize-none text-sm" />
            </div>

            {!booking ? (
              <>
                <Separator />
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Payment</div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: "pay_later", label: "Pay later" },
                      { value: "cash", label: "Cash" },
                      { value: "card", label: "Manual card" },
                      { value: "yoco_pos", label: "Yoco terminal" },
                      ...(paymentLinkEnabled
                        ? [{ value: "payment_link", label: "Payment link" }]
                        : []),
                      ...(paystackTerminalEnabled
                        ? [{ value: "paystack_terminal", label: "Paystack Terminal" }]
                        : []),
                      ...(paycloudEnabled
                        ? [{ value: "paycloud_terminal", label: "Card machine" }]
                        : []),
                    ] as const).map((m) => {
                      const isPaycloudSetupBlocked =
                        m.value === "paycloud_terminal" &&
                        paycloudEnabled &&
                        !paycloudReadinessLoading &&
                        !paycloudCollectEnabled;
                      if (isPaycloudSetupBlocked) {
                        const setupHref =
                          paycloudBlockers[0]?.href ?? "/provider/settings/sales/card-machines";
                        const setupLabel = paycloudBlockers[0]?.title ?? PAYCLOUD_SETUP_LABEL;
                        return (
                          <Link
                            key={m.value}
                            href={setupHref}
                            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100 transition"
                          >
                            {setupLabel}
                          </Link>
                        );
                      }
                      const active = createPaymentMethod === m.value;
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setCreatePaymentMethod(m.value as GroupCreatePaymentMethod)}
                          className={`rounded-full border px-3 py-1.5 text-sm transition ${active ? "border-primary bg-primary/10 text-primary font-semibold" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  {createPaymentMethod === "payment_link" ? (
                    <p className="text-xs text-gray-500">
                      Each participant gets their own payment link as soon as the group is created.
                      Keep participant notifications on so the links can be delivered.
                    </p>
                  ) : createPaymentMethod === "paystack_terminal" ? (
                    <p className="text-xs text-gray-500">
                      After creating the group, a QR code will be shown for the customer to scan. Allocate the payment from the Paystack Payment Inbox.
                    </p>
                  ) : createPaymentMethod === "paycloud_terminal" ? (
                    <p className="text-xs text-gray-500">
                      After creating the group, collect payment on your card machine for the full session total.
                    </p>
                  ) : createPaymentMethod !== "pay_later" ? (
                    <p className="text-xs text-gray-500">
                      The group will be marked paid immediately on every participant&apos;s booking after create.
                    </p>
                  ) : null}
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createSendNotification}
                    onChange={(e) => setCreateSendNotification(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">
                    <span className="font-semibold text-gray-900">Notify participants</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      Sends email + push to each participant with a linked customer account.
                    </span>
                  </span>
                </label>
              </>
            ) : null}

            {/* ─── Total Summary ──────────────────────────────────── */}
            {(participants.length > 0 || groupProducts.length > 0) && (
              <div className="bg-gray-50 rounded-xl p-3 border space-y-1.5">
                {pricing.subtotal > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Subtotal ({participants.length} participant{participants.length !== 1 ? "s" : ""}{groupProducts.length > 0 ? ` + ${groupProducts.length} product${groupProducts.length !== 1 ? "s" : ""}` : ""})</span>
                    <span>{formatMoney(pricing.subtotal)}</span>
                  </div>
                )}
                {formData.travel_fee > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Travel fee</span>
                    <span>{formatMoney(formData.travel_fee)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                  <div className="text-xs text-gray-600 font-medium">Total</div>
                  <div className="text-lg font-semibold text-gray-900">{formatMoney(pricing.totalAmount)}</div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* §Group-booking-audit 2026-05 (review block): final confirmation
          step shown after the form passes validation. Lets the provider pick
          a payment method, opt into notifying the primary contact, and see
          the totals one last time before posting. */}
        {createStep === "review" && !booking ? (
          <div className="border-t bg-gray-50 px-4 sm:px-6 py-4 space-y-4 max-h-[55vh] overflow-y-auto">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
                Session summary
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">When</span>
                  <span className="font-semibold text-gray-900">
                    {formData.scheduled_date} · {formData.scheduled_time}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Participants</span>
                  <span className="font-semibold text-gray-900">
                    {participants.length}
                    {" "}
                    <span className="text-xs font-normal text-gray-400">
                      of {formData.max_participants} max
                    </span>
                  </span>
                </div>
                {formData.max_participants - participants.length > 0 && (
                  <p className="text-xs text-gray-400">
                    {formData.max_participants - participants.length} spot{formData.max_participants - participants.length !== 1 ? "s" : ""} still available after booking — you can add walk-ins later.
                  </p>
                )}
                <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-2">
                  <span className="text-base font-bold text-gray-900">Total</span>
                  <span className="text-base font-extrabold text-gray-900">{formatMoney(pricing.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Payment</div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-900">
                  {createPaymentMethod === "pay_later"
                    ? "Pay later"
                    : createPaymentMethod === "cash"
                      ? "Cash"
                      : createPaymentMethod === "card"
                        ? "Manual card"
                        : createPaymentMethod === "yoco_pos"
                          ? "Yoco terminal"
                          : createPaymentMethod === "paystack_terminal"
                            ? "Paystack Terminal (QR)"
                            : createPaymentMethod === "paycloud_terminal"
                              ? "Card machine"
                            : "Payment link"}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline"
                  onClick={() => setCreateStep("form")}
                >
                  Change
                </button>
              </div>
              {createSendNotification ? (
                <p className="mt-2 text-xs text-gray-500">Participants will be notified after create.</p>
              ) : (
                <p className="mt-2 text-xs text-amber-700">Participant notifications are off for this group.</p>
              )}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t bg-white flex-shrink-0">
          {createStep === "review" && !booking ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateStep("form")}
              disabled={isLoading}
              className="w-full sm:w-auto h-10"
            >
              Back
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading} className="w-full sm:w-auto h-10">
              Cancel
            </Button>
          )}
          <Button type="submit" form="group-booking-form" disabled={isLoading || isValidatingAddress || participants.length === 0}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 h-10">
            {isLoading
              ? "Saving..."
              : isValidatingAddress
                ? "Checking address..."
                : booking
                  ? "Update Group Booking"
                  : createStep === "review"
                    ? "Confirm & create"
                    : "Review & create"}
          </Button>
        </div>
      </DialogContent>

      <LocationMapPickerDialog
        open={mapPickerOpen}
        onOpenChange={setMapPickerOpen}
        initialLatitude={formData.address_latitude}
        initialLongitude={formData.address_longitude}
        defaultCountryName={formData.address_country || "South Africa"}
        onLocationPicked={applyAtHomeAddress}
      />

      {/* Post-create Paystack Terminal QR sheet */}
      <AlertDialog open={!!postCreatePaystackData} onOpenChange={(o) => { if (!o) setPostCreatePaystackData(null); }}>
        <AlertDialogContent className="z-[200002] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-green-600" />
              Paystack Terminal Payment
            </AlertDialogTitle>
            <AlertDialogDescription>
              Show the QR code or share the payment link. Once the customer pays, allocate the payment from the Payment Inbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {postCreatePaystackData && (
            <div className="space-y-4">
              {postCreatePaystackData.expectedAmount > 0 && (
                <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
                  <p className="text-xs text-green-700 mb-1">Amount due</p>
                  <p className="text-2xl font-bold text-green-800">
                    {postCreatePaystackData.expectedAmount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })}
                  </p>
                </div>
              )}
              {postCreatePaystackData.terminal.qr_url ? (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={postCreatePaystackData.terminal.qr_url}
                    alt="Paystack Terminal QR Code"
                    className="w-48 h-48 rounded-xl border border-gray-200"
                  />
                </div>
              ) : null}
              <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                Ask the customer to scan the QR or open the payment link. After Paystack confirms, the payment appears in the <strong>Payment Inbox</strong> for allocation.
              </div>
              <div className="flex flex-col gap-2">
                {(postCreatePaystackData.terminal.payment_link || postCreatePaystackData.terminal.terminal_url) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      const link = postCreatePaystackData.terminal.payment_link || postCreatePaystackData.terminal.terminal_url || "";
                      navigator.clipboard.writeText(link).then(() => toast.success("Payment link copied")).catch(() => {});
                    }}
                  >
                    <Copy className="w-4 h-4" />
                    Copy payment link
                  </Button>
                )}
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2 bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    setPostCreatePaystackData(null);
                    window.location.assign("/provider/settings/sales/paystack-terminal");
                  }}
                >
                  <ExternalLink className="w-4 h-4" />
                  Go to Payment Inbox
                </Button>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPostCreatePaystackData(null)}>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {postCreatePaycloudData ? (
        <PayCloudPaymentDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPostCreatePaycloudData(null);
          }}
          amount={postCreatePaycloudData.expectedAmount}
          entityType="group_booking"
          entityId={postCreatePaycloudData.groupId}
          groupBookingId={postCreatePaycloudData.groupId}
          bookingLocationId={postCreatePaycloudData.locationId}
          onSuccess={() => {
            setPostCreatePaycloudData(null);
            onSuccess?.();
          }}
        />
      ) : null}

      {/* ─── Variant Picker Dialog ────────────────────────────────── */}
      <AlertDialog open={variantPickerFor !== null} onOpenChange={o => !o && setVariantPickerFor(null)}>
        <AlertDialogContent className="z-[200002] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Choose a Variant</AlertDialogTitle>
            <AlertDialogDescription>Select a variant for this service.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {variantPickerFor && loadingVariants[variantPickerFor.serviceId] && (
              <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            )}
            {variantPickerFor && (serviceVariants[variantPickerFor.serviceId] || []).map((v: any) => (
              <button key={v.id} type="button"
                className="w-full text-left p-3 rounded-lg border hover:border-purple-300 hover:bg-purple-50 transition-colors"
                onClick={() => {
                  const base = services.find(s => s.id === variantPickerFor!.serviceId);
                  if (base) {
                    setParticipantService(
                      variantPickerFor!.participantIdx,
                      { ...base, price: v.price ?? base.price, duration_minutes: v.duration_minutes ?? base.duration_minutes },
                      v.id,
                      v.variant_name || v.name || v.title,
                    );
                  }
                  setVariantPickerFor(null);
                }}>
                <div className="font-medium text-sm">{v.variant_name || v.name || v.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {formatMoney(v.price ?? 0)} · {v.duration_minutes ?? 0} min
                </div>
              </button>
            ))}
            {variantPickerFor && !loadingVariants[variantPickerFor.serviceId] && (serviceVariants[variantPickerFor.serviceId] || []).length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No variants found</p>
            )}
          </div>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Addon Picker Dialog ──────────────────────────────────── */}
      <AlertDialog open={addonPickerFor !== null} onOpenChange={o => !o && setAddonPickerFor(null)}>
        <AlertDialogContent className="z-[200002] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Add Extras</AlertDialogTitle>
            <AlertDialogDescription>Select add-ons for this participant.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {addonPickerFor && loadingAddons[addonPickerFor.catalogServiceId] && (
              <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            )}
            {addonPickerFor && (serviceAddons[addonPickerFor.catalogServiceId] || []).map((addon: any) => {
              const pIdx = addonPickerFor!.participantIdx;
              const alreadyAdded = participants[pIdx]?.addons.some(a => a.addonId === addon.id);
              return (
                <button key={addon.id} type="button" disabled={alreadyAdded}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors",
                    alreadyAdded ? "opacity-50 cursor-not-allowed bg-gray-50" : "hover:border-purple-300 hover:bg-purple-50",
                  )}
                  onClick={() => {
                    if (!alreadyAdded) {
                      addAddonToParticipant(pIdx, addon);
                      setAddonPickerFor(null);
                    }
                  }}>
                  <div className="font-medium text-sm">{addon.title || addon.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatMoney(addon.price ?? 0)}
                    {(addon.duration_minutes || addon.duration) ? ` · ${addon.duration_minutes || addon.duration} min` : ""}
                  </div>
                  {alreadyAdded && <div className="text-[10px] text-purple-500 mt-1">Already added</div>}
                </button>
              );
            })}
            {addonPickerFor && !loadingAddons[addonPickerFor.catalogServiceId] && (serviceAddons[addonPickerFor.catalogServiceId] || []).length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No add-ons available for this service</p>
            )}
          </div>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
