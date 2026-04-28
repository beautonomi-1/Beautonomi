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
} from "@/components/ui/alert-dialog";
import {
  CalendarIcon, Plus, X, User, Home, Building2, Users, Tag,
  StickyNote, MapPin, Search, Package, ShoppingBag, Loader2, ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type {
  GroupBooking, GroupBookingParticipant, TeamMember,
  ServiceItem, ProductItem, Appointment,
} from "@/lib/provider-portal/types";
import type { AppointmentService, AppointmentProduct } from "@/components/appointments/types";
import { calculateBookingPricing } from "@/components/appointments/pricing";
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
  const [isLoading, setIsLoading] = useState(false);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);

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
      })));
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
  const handleAddParticipant = () => {
    const svc = services.find(s => s.id === formData.service_id);
    setParticipants(prev => [...prev, {
      client_name: "",
      client_email: "",
      client_phone: "",
      service_id: formData.service_id,
      service_name: formData.service_name,
      price: svc?.price || 0,
      duration_minutes: svc?.duration_minutes || formData.duration_minutes,
      addons: [],
    }]);
  };

  const handleRemoveParticipant = (index: number) => {
    setParticipants(prev => prev.filter((_, i) => i !== index));
  };

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
    calculateBookingPricing(participantServices, groupProducts, formData.travel_fee, 0, 0, 0, 0),
  [participantServices, groupProducts, formData.travel_fee]);

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
        service_id: p.service_id || formData.service_id,
        service_name: p.service_name || formData.service_name,
        price: p.price + p.addons.reduce((s, a) => s + a.price, 0),
        duration_minutes: p.duration_minutes + p.addons.reduce((s, a) => s + a.duration, 0),
        addons: p.addons.map(a => ({ id: a.addonId, name: a.name, price: a.price, duration: a.duration })),
      }));

      const apiPayload: Record<string, unknown> = {
        title: formData.title || formData.service_name || "Group Session",
        scheduled_at: scheduledAt,
        service_id: formData.service_id || undefined,
        staff_id: formData.team_member_id || undefined,
        location_id: formData.location_type === "at_salon" ? (formData.location_id || undefined) : undefined,
        max_participants: formData.max_participants || participants.length + 5,
        duration_minutes: totalDuration,
        notes: formData.notes || undefined,
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
        await providerApi.createGroupBooking(apiPayload as Partial<GroupBooking>);
        toast.success("Group booking created");
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
          <form id="group-booking-form" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 box-border w-full max-w-full overflow-x-hidden min-w-0">

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
                <button type="button" onClick={() => setFormData({ ...formData, location_type: "at_salon" })}
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
                      geocodeTypes={["address"]}
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
                  <div>
                    <Label className="text-xs text-gray-500">Travel Fee</Label>
                    <Input type="number" value={formData.travel_fee} onChange={e => setFormData({ ...formData, travel_fee: parseFloat(e.target.value) || 0 })} min={0} step={10} className="mt-1 h-10" />
                  </div>
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
                The default service only pre-fills new participants and drives the availability check. Each participant line below is the billable service line used in totals.
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
                  <Label className="text-xs text-gray-500">Default service (template)</Label>
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
                      <SelectTrigger className="h-10 pl-8"><SelectValue placeholder="Select default service" /></SelectTrigger>
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
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Max Participants</Label>
                <Input
                  type="number"
                  value={formData.max_participants}
                  onChange={e => setFormData({ ...formData, max_participants: parseInt(e.target.value) || 10 })}
                  min={2} max={100}
                  className="mt-1 h-10 w-full sm:w-32"
                />
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
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddParticipant} className="h-8 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" />Add
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Add one row per person. The participant service, add-ons, and price field are what count toward the group total.
              </p>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
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

                    return (
                      <div key={index} className="p-3 bg-gray-50 rounded-xl border space-y-2.5">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-purple-700">{index + 1}</span>
                            </div>
                            <span className="text-sm font-medium text-gray-700 truncate">
                              {participant.client_name || `Participant ${index + 1}`}
                            </span>
                            {participant.variant_name && <Badge variant="outline" className="text-[9px] h-4">{participant.variant_name}</Badge>}
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveParticipant(index)} className="text-gray-400 hover:text-red-500 h-7 w-7">
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* Contact fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-gray-400 uppercase tracking-wider">Name *</Label>
                            <Input value={participant.client_name} onChange={e => handleParticipantChange(index, "client_name", e.target.value)} placeholder="Client name" required className="mt-0.5 h-9 text-sm" />
                          </div>
                          <div>
                            <PhoneInput label="Phone" inputId={`group-booking-participant-phone-${index}`} value={participant.client_phone} onChange={e164 => handleParticipantChange(index, "client_phone", e164)} className="mt-0 space-y-0.5" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-gray-400 uppercase tracking-wider">Email</Label>
                            <Input type="email" value={participant.client_email} onChange={e => handleParticipantChange(index, "client_email", e.target.value)} placeholder="email@example.com" className="mt-0.5 h-9 text-sm" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-gray-400 uppercase tracking-wider">Service</Label>
                            <Select
                              value={participant.service_id || formData.service_id}
                              onValueChange={v => handleParticipantServiceSelect(index, v)}
                            >
                              <SelectTrigger className="mt-0.5 h-9 text-sm"><SelectValue placeholder="Service" /></SelectTrigger>
                              <SelectContent>
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

                        {/* Add addon button */}
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
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400">R</span>
                            <Input type="number" value={participant.price} onChange={e => handleParticipantChange(index, "price", parseFloat(e.target.value) || 0)} min={0} step={0.01} className="h-8 w-24 text-sm text-right" />
                            {participant.addons.length > 0 && (
                              <span className="text-[10px] text-gray-400 ml-1">(+{formatMoney(participant.addons.reduce((s, a) => s + a.price, 0))})</span>
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

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t bg-white flex-shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading} className="w-full sm:w-auto h-10">
            Cancel
          </Button>
          <Button type="submit" form="group-booking-form" disabled={isLoading || isValidatingAddress || participants.length === 0}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 h-10">
            {isLoading ? "Saving..." : isValidatingAddress ? "Checking address..." : booking ? "Update Group Booking" : "Create Group Booking"}
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
