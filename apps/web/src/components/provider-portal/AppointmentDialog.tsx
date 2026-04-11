"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
import type { Appointment, TeamMember, ServiceItem, ProductItem } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CalendarIcon,
  Search,
  User,
  UserPlus,
  Plus,
  X,
  ShoppingCart,
  Clock,
  Minus,
  Check,
  ChevronDown,
  Loader2,
  Scissors,
  Package,
  Repeat,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { toast } from "sonner";
import {
  formatApiErrorMessage,
  isLikelyUuid,
  subscriptionUpgradeHint,
} from "@/lib/http/api-error";
import { FetchError } from "@/lib/http/fetcher";
import { useRouter } from "next/navigation";
import { AddClientDialog } from "@/components/provider-portal/AddClientDialog";

/* ─────────────────────────────────────────────────────────── */
/*  Types                                                      */
/* ─────────────────────────────────────────────────────────── */

interface ApiClient {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
}

interface CartItem {
  id: string;
  type: "service" | "product";
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  service_id?: string;
  product_id?: string;
  duration_minutes?: number;
}

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: Appointment | null;
  defaultDate?: Date;
  defaultTime?: string;
  defaultTeamMemberId?: string;
  onSuccess?: () => void;
  onCheckout?: (appointment: Appointment) => void;
}

/* ─────────────────────────────────────────────────────────── */
/*  Helpers                                                    */
/* ─────────────────────────────────────────────────────────── */

const isValidPhone = (phone: string): boolean => {
  if (!phone) return true;
  const cleaned = phone.replace(/\s/g, "");
  return /^\+[1-9]\d{1,14}$/.test(cleaned);
};

function generateTimeOptions(): string[] {
  const opts: string[] = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 22 && m > 0) break;
      opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return opts;
}

/* ─────────────────────────────────────────────────────────── */
/*  Main component                                             */
/* ─────────────────────────────────────────────────────────── */

export function AppointmentDialog({
  open,
  onOpenChange,
  appointment,
  defaultDate,
  defaultTime,
  defaultTeamMemberId,
  onSuccess,
  onCheckout,
}: AppointmentDialogProps) {
  const router = useRouter();
  const { format: formatMoney } = useProviderMoneyFormat();
  const searchInputRef = useRef<HTMLInputElement>(null);

  /* ── Remote data ── */
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);

  /* ── Submit state ── */
  const [isSaving, setIsSaving] = useState(false);
  const [recurringUpgradeRequired, setRecurringUpgradeRequired] = useState(false);

  /* ── Client ── */
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ApiClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<ApiClient | null>(null);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [showClientSearch, setShowClientSearch] = useState(true);
  const [showAddClient, setShowAddClient] = useState(false);

  /* ── Cart ── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [variantProduct, setVariantProduct] = useState<ProductItem | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");

  /* ── Date / time / slots ── */
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[] | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  /* ── Form ── */
  const [formData, setFormData] = useState({
    client_id: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    team_member_id: defaultTeamMemberId || "",
    scheduled_date: defaultDate || new Date(),
    scheduled_time: defaultTime || "10:00",
    notes: "",
    is_recurring: false,
    recurrence_pattern: "weekly" as "daily" | "weekly" | "biweekly" | "monthly",
    recurrence_end_date: "",
    recurrence_occurrences: undefined as number | undefined,
  });

  /* ── Computed totals from cart ── */
  const totalDuration = cart.reduce(
    (s, i) => s + (i.type === "service" ? (i.duration_minutes ?? 0) : 0),
    0
  );
  const totalPrice = cart.reduce((s, i) => s + i.total, 0);

  /* ───────────────────────────────────────────────────── */
  /*  Initialise on open                                   */
  /* ───────────────────────────────────────────────────── */

  useEffect(() => {
    if (!open) return;
    setRecurringUpgradeRequired(false);
    loadCatalogue();

    if (appointment) {
      setFormData({
        client_id: "",
        client_name: appointment.client_name,
        client_email: appointment.client_email || "",
        client_phone: appointment.client_phone || "",
        team_member_id: appointment.team_member_id,
        scheduled_date: new Date(appointment.scheduled_date),
        scheduled_time: appointment.scheduled_time,
        notes: appointment.notes || "",
        is_recurring: false,
        recurrence_pattern: "weekly",
        recurrence_end_date: "",
        recurrence_occurrences: undefined,
      });
      setSelectedClient(null);
      setIsWalkIn(false);
      setShowClientSearch(false);
      buildCartFromAppointment(appointment);
    } else {
      setFormData({
        client_id: "",
        client_name: "",
        client_email: "",
        client_phone: "",
        team_member_id: defaultTeamMemberId || "",
        scheduled_date: defaultDate || new Date(),
        scheduled_time: defaultTime || "10:00",
        notes: "",
        is_recurring: false,
        recurrence_pattern: "weekly",
        recurrence_end_date: "",
        recurrence_occurrences: undefined,
      });
      setCart([]);
      setSelectedClient(null);
      setIsWalkIn(false);
      setClientQuery("");
      setShowClientSearch(true);
    }
  }, [open, appointment, defaultDate, defaultTime, defaultTeamMemberId]);

  /* ───────────────────────────────────────────────────── */
  /*  Load catalogue (team + services + products)          */
  /* ───────────────────────────────────────────────────── */

  const loadCatalogue = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [members, categories, productsResponse] = await Promise.all([
        providerApi.listTeamMembers(),
        providerApi.listServiceCategories(),
        providerApi.listProducts().catch(() => ({ data: [] })),
      ]);
      setTeamMembers(members || []);

      // Flatten: parent services + each variant as a peer with parent_service_id set
      const allServices = categories.flatMap((cat) =>
        (cat.services || []).flatMap((svc: any) => {
          const variants: any[] = svc.variants || [];
          return [
            svc,
            ...variants.map((v: any) => ({
              ...v,
              name: v.name || svc.name,
              parent_service_id: v.parent_service_id || svc.id,
              service_type: v.service_type || "variant",
              category_id: cat.id,
              provider_category_id: cat.id,
            })),
          ];
        })
      );
      setServices(allServices);
      setProducts(Array.isArray(productsResponse?.data) ? productsResponse.data : []);

      if (defaultTeamMemberId) {
        setFormData((prev) => ({ ...prev, team_member_id: defaultTeamMemberId }));
      }
    } catch {
      setTeamMembers([]);
      setServices([]);
      setProducts([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [defaultTeamMemberId]);

  /* ───────────────────────────────────────────────────── */
  /*  Build cart when editing                              */
  /* ───────────────────────────────────────────────────── */

  const buildCartFromAppointment = async (appt: Appointment) => {
    // 1. Use stored cart_items if present
    if (Array.isArray(appt.cart_items) && appt.cart_items.length > 0) {
      setCart(
        appt.cart_items.map((ci: any) => ({
          id: ci.id || `${ci.type}-${ci.service_id || ci.product_id}-${Date.now()}`,
          type: ci.type as "service" | "product",
          name: ci.name || "Item",
          quantity: ci.quantity || 1,
          unit_price: ci.unit_price || 0,
          total: ci.total || 0,
          service_id: ci.service_id,
          product_id: ci.product_id,
          duration_minutes: ci.duration_minutes,
        }))
      );
      return;
    }

    // 2. Fetch full booking from API
    try {
      const res = await fetch(`/api/provider/bookings/${appt.id}`);
      if (res.ok) {
        const data = await res.json();
        const booking = data.data || data;
        const items: CartItem[] = [];

        (booking.services ?? []).forEach((bs: any, i: number) => {
          items.push({
            id: `service-${bs.offering_id || bs.service_id || i}-${Date.now()}`,
            type: "service",
            name: bs.offering_name || bs.service_name || "Service",
            quantity: bs.quantity || 1,
            unit_price: bs.price || 0,
            total: (bs.quantity || 1) * (bs.price || 0),
            service_id: bs.offering_id || bs.service_id,
            duration_minutes: bs.duration_minutes || 30,
          });
        });

        (booking.products ?? []).forEach((bp: any, i: number) => {
          items.push({
            id: `product-${bp.product_id || i}-${Date.now()}`,
            type: "product",
            name: bp.product_name || bp.name || "Product",
            quantity: bp.quantity || 1,
            unit_price: bp.unit_price || bp.retail_price || 0,
            total: (bp.quantity || 1) * (bp.unit_price || bp.retail_price || 0),
            product_id: bp.product_id,
          });
        });

        if (items.length > 0) { setCart(items); return; }
      }
    } catch { /* fallthrough */ }

    // 3. Fallback: primary service only
    setCart([{
      id: `service-${appt.service_id}-fallback`,
      type: "service",
      name: appt.service_name || "Service",
      quantity: 1,
      unit_price: appt.price || 0,
      total: appt.price || 0,
      service_id: appt.service_id,
      duration_minutes: appt.duration_minutes || 60,
    }]);
  };

  /* ───────────────────────────────────────────────────── */
  /*  Client search (debounced)                            */
  /* ───────────────────────────────────────────────────── */

  useEffect(() => {
    if (clientQuery.length < 2) { setClientResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/provider/clients?search=${encodeURIComponent(clientQuery)}`);
        if (res.ok) {
          const d = await res.json();
          setClientResults(d.data || []);
        }
      } catch { setClientResults([]); }
    }, 280);
    return () => clearTimeout(t);
  }, [clientQuery]);

  const selectClient = (c: ApiClient) => {
    setSelectedClient(c);
    setFormData((p) => ({
      ...p,
      client_id: c.id,
      client_name: `${c.first_name} ${c.last_name}`,
      client_email: c.email || "",
      client_phone: c.phone || "",
    }));
    setClientQuery("");
    setClientResults([]);
    setShowClientSearch(false);
  };

  const clearClient = () => {
    setSelectedClient(null);
    setIsWalkIn(false);
    setShowClientSearch(true);
    setFormData((p) => ({ ...p, client_id: "", client_name: "", client_email: "", client_phone: "" }));
  };

  const activateWalkIn = () => {
    setIsWalkIn(true);
    setSelectedClient(null);
    setShowClientSearch(false);
    setFormData((p) => ({ ...p, client_id: "", client_name: "", client_email: "", client_phone: "" }));
  };

  /* ───────────────────────────────────────────────────── */
  /*  Cart mutations                                       */
  /* ───────────────────────────────────────────────────── */

  const addService = (service: ServiceItem) => {
    const displayName = service.variant_name
      ? `${service.name} (${service.variant_name})`
      : service.name;
    const idx = cart.findIndex((i) => i.type === "service" && i.service_id === service.id);
    if (idx >= 0) {
      setCart((prev) => {
        const next = [...prev];
        next[idx].quantity += 1;
        next[idx].total = next[idx].quantity * next[idx].unit_price;
        return next;
      });
    } else {
      setCart((prev) => [
        ...prev,
        {
          id: `service-${service.id}-${Date.now()}`,
          type: "service",
          name: displayName,
          quantity: 1,
          unit_price: Number(service.price),
          total: Number(service.price),
          service_id: service.id,
          duration_minutes: service.duration_minutes,
        },
      ]);
    }
    setShowServicePicker(false);
    setServiceSearch("");
  };

  const addProduct = (product: ProductItem, variant?: import("@/lib/provider-portal/types").ProductVariantItem) => {
    const variantLabel = variant ? Object.values(variant.option_values).join(" / ") : null;
    const displayName = variantLabel ? `${product.name} – ${variantLabel}` : product.name;
    const price = variant ? variant.retail_price : product.retail_price;
    const cartKey = variant ? `product-${product.id}-${variant.id}` : `product-${product.id}`;
    const idx = cart.findIndex((i) => i.type === "product" && i.id.startsWith(cartKey));
    if (idx >= 0) {
      setCart((prev) => {
        const next = [...prev];
        next[idx].quantity += 1;
        next[idx].total = next[idx].quantity * next[idx].unit_price;
        return next;
      });
    } else {
      setCart((prev) => [
        ...prev,
        {
          id: `${cartKey}-${Date.now()}`,
          type: "product",
          name: displayName,
          quantity: 1,
          unit_price: Number(price),
          total: Number(price),
          product_id: product.id,
        },
      ]);
    }
    setShowProductPicker(false);
    setVariantProduct(null);
    setSelectedVariantId("");
    setProductSearch("");
  };

  const changeQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      next[idx].quantity += delta;
      if (next[idx].quantity <= 0) return next.filter((_, i) => i !== idx);
      next[idx].total = next[idx].quantity * next[idx].unit_price;
      return next;
    });
  };

  const removeItem = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ───────────────────────────────────────────────────── */
  /*  Available slots                                      */
  /* ───────────────────────────────────────────────────── */

  useEffect(() => {
    if (!open || !formData.team_member_id) { setAvailableSlots(null); return; }
    let cancelled = false;
    setIsLoadingSlots(true);
    const params = new URLSearchParams({
      date: format(formData.scheduled_date, "yyyy-MM-dd"),
      duration_minutes: String(totalDuration || 60),
      staff_ids: formData.team_member_id,
    });
    fetch(`/api/provider/bookings/available-slots?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const slots: string[] = data?.data?.slots ?? [];
        const cur = formData.scheduled_time;
        const merged = slots.includes(cur) ? slots : [cur, ...slots].sort();
        setAvailableSlots(merged.length > 0 ? merged : null);
      })
      .catch(() => { if (!cancelled) setAvailableSlots(null); })
      .finally(() => { if (!cancelled) setIsLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [open, formData.scheduled_date, formData.team_member_id, totalDuration]);

  const timeOptions = availableSlots ?? generateTimeOptions();

  /* ───────────────────────────────────────────────────── */
  /*  Validation                                           */
  /* ───────────────────────────────────────────────────── */

  const validate = (): string | null => {
    if (!formData.team_member_id) return "Please select a team member.";
    if (cart.length === 0) return "Please add at least one service or product.";
    if (!cart.some((i) => i.type === "service")) return "At least one service is required.";
    if (!formData.client_name && !isWalkIn) return "Please select or enter a client name.";
    const phone = formData.client_phone.replace(/\s/g, "");
    if (phone && !isValidPhone(phone)) return "Phone number must be in E.164 format (e.g., +27821234567).";
    return null;
  };

  /* ───────────────────────────────────────────────────── */
  /*  Build appointment payload (cart → services/products) */
  /* ───────────────────────────────────────────────────── */

  const buildPayload = () => {
    const clientName = formData.client_name || (isWalkIn ? "Walk-in Client" : "");
    const phone = formData.client_phone.replace(/\s/g, "") || undefined;
    const cartServices = cart.filter((i) => i.type === "service");
    const cartProducts = cart.filter((i) => i.type === "product");
    const primaryService = cartServices[0];

    // Convert cart items to API-expected arrays
    const servicesArray = cartServices.map((i) => ({
      serviceId: i.service_id,
      serviceName: i.name,
      duration: i.duration_minutes,
      price: i.unit_price,
      staffId: formData.team_member_id,
    }));

    const productsArray = cartProducts.map((i) => ({
      productId: i.product_id,
      productName: i.name,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      totalPrice: i.total,
    }));

    return {
      client_id: formData.client_id || undefined,
      client_name: clientName,
      client_email: formData.client_email || undefined,
      client_phone: phone,
      team_member_id: formData.team_member_id,
      team_member_name: teamMembers.find((m) => m.id === formData.team_member_id)?.name,
      service_id: primaryService?.service_id ?? "",
      service_name: primaryService?.name ?? "",
      scheduled_date: format(formData.scheduled_date, "yyyy-MM-dd"),
      scheduled_time: formData.scheduled_time,
      duration_minutes: totalDuration || 60,
      price: totalPrice,
      notes: formData.notes || undefined,
      status: appointment?.status || "booked",
      // Proper arrays for createAppointment API
      services: servicesArray,
      products: productsArray,
      // Stored for future cart reload when editing
      cart_items: cart.map((i) => ({
        id: i.id,
        type: i.type,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total: i.total,
        service_id: i.service_id,
        product_id: i.product_id,
        duration_minutes: i.duration_minutes,
      })),
    } as any;
  };

  /* ───────────────────────────────────────────────────── */
  /*  Save                                                 */
  /* ───────────────────────────────────────────────────── */

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const err = validate();
    if (err) { toast.error(err); return; }
    setIsSaving(true);
    try {
      const payload = buildPayload();
      if (appointment) {
        await providerApi.updateAppointment(appointment.id, payload);
        toast.success("Appointment updated");
      } else if (formData.is_recurring) {
        if (!formData.client_id?.trim() || !isLikelyUuid(formData.client_id)) {
          toast.error("Repeating visits require a saved client profile. Select the client from search.");
          return;
        }
        const rule = {
          pattern: formData.recurrence_pattern,
          interval: formData.recurrence_pattern === "biweekly" ? 2 : 1,
          end_date: formData.recurrence_end_date || undefined,
          occurrences: formData.recurrence_occurrences || undefined,
        };
        try {
          await providerApi.createRecurringAppointment({ ...payload, client_id: formData.client_id, recurrence_rule: rule } as any);
          toast.success("Repeating visit series created");
        } catch (recErr) {
          if (recErr instanceof FetchError && recErr.code === "SUBSCRIPTION_REQUIRED") {
            setRecurringUpgradeRequired(true);
            toast.error(formatApiErrorMessage(recErr, "Subscription required") + subscriptionUpgradeHint(recErr));
            return;
          }
          // Fall back to single booking
          const shortReason = formatApiErrorMessage(recErr, "Unknown error").slice(0, 160);
          await providerApi.createAppointment(payload);
          toast.success(`Appointment booked once. Repeat not created: ${shortReason}`);
        }
      } else {
        await providerApi.createAppointment(payload);
        toast.success("Appointment created");
      }
      onOpenChange(false);
      setTimeout(() => onSuccess?.(), 300);
    } catch (error) {
      const msg = formatApiErrorMessage(error, "Failed to save appointment") + subscriptionUpgradeHint(error);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndCheckout = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }

    // Recurring + checkout: warn the user that recurrence is ignored for checkout flow.
    // Recurring series cannot be checked out in one step — create the series via Save instead.
    if (!appointment && formData.is_recurring) {
      toast.warning(
        'Recurring series cannot be checked out directly. The first appointment will be created and checked out. Use "Save" to create the full series.',
        { duration: 6000 }
      );
    }

    setIsSaving(true);
    try {
      const payload = buildPayload();
      const created = await providerApi.createAppointment(payload);
      onSuccess?.();
      if (onCheckout) {
        onCheckout(created);
        onOpenChange(false);
      } else {
        toast.success("Appointment created. Process payment from appointment details.");
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(formatApiErrorMessage(error, "Failed to create appointment"));
    } finally {
      setIsSaving(false);
    }
  };

  /* ───────────────────────────────────────────────────── */
  /*  Service picker internals                             */
  /* ───────────────────────────────────────────────────── */

  const renderServiceList = () => {
    const q = serviceSearch.toLowerCase();
    const filtered = services.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.variant_name ?? "").toLowerCase().includes(q)
    );
    const parents = filtered.filter((s) => !s.parent_service_id && s.service_type !== "variant");
    const byParent = new Map<string, ServiceItem[]>();
    filtered
      .filter((s) => s.service_type === "variant" || s.parent_service_id)
      .forEach((v) => {
        const key = v.parent_service_id ?? v.id;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(v);
      });

    if (filtered.length === 0) {
      return (
        <div className="py-12 text-center">
          <Scissors className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No services found</p>
        </div>
      );
    }

    const rows: React.ReactNode[] = [];
    parents.forEach((svc) => {
      const variants = byParent.get(svc.id);
      if (variants && variants.length > 0) {
        rows.push(
          <div key={svc.id} className="mb-2 overflow-hidden rounded-xl border border-gray-100">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <Scissors className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-700">{svc.name}</span>
            </div>
            {variants.map((v, vi) => (
              <button
                key={v.id}
                type="button"
                onClick={() => addService(v)}
                className={cn(
                  "w-full text-left px-4 py-3 flex items-center justify-between transition-colors hover:bg-primary/5 group",
                  vi < variants.length - 1 && "border-b border-gray-50"
                )}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-primary transition-colors">
                    {v.variant_name ?? v.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {v.duration_minutes} min · {formatMoney(Number(v.price))}
                  </p>
                </div>
                <div className="w-7 h-7 rounded-full bg-gray-100 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-all flex-shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>
        );
      } else {
        rows.push(
          <button
            key={svc.id}
            type="button"
            onClick={() => addService(svc)}
            className="w-full text-left px-4 py-3.5 border border-gray-100 rounded-xl hover:bg-primary/5 hover:border-primary/30 transition-colors mb-2 flex items-center justify-between group"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 group-hover:text-primary transition-colors">
                  {svc.name}
                </p>
                {svc.service_type === "package" && (
                  <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">PKG</span>
                )}
                {svc.service_type === "addon" && (
                  <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">ADD-ON</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {svc.duration_minutes} min · {formatMoney(Number(svc.price))}
              </p>
            </div>
            <div className="w-7 h-7 rounded-full bg-gray-100 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-all flex-shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </div>
          </button>
        );
      }
    });

    // Orphan variants (parent not in filtered list)
    byParent.forEach((vs, parentId) => {
      if (!parents.find((p) => p.id === parentId)) {
        vs.forEach((v) => {
          rows.push(
            <button
              key={v.id}
              type="button"
              onClick={() => addService(v)}
              className="w-full text-left px-4 py-3.5 border border-gray-100 rounded-xl hover:bg-primary/5 hover:border-primary/30 transition-colors mb-2 flex items-center justify-between group"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 group-hover:text-primary transition-colors">{v.name}</p>
                {v.variant_name && <p className="text-xs text-gray-400">{v.variant_name}</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  {v.duration_minutes} min · {formatMoney(Number(v.price))}
                </p>
              </div>
              <div className="w-7 h-7 rounded-full bg-gray-100 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-all flex-shrink-0">
                <Plus className="w-3.5 h-3.5" />
              </div>
            </button>
          );
        });
      }
    });

    return rows;
  };

  /* ═══════════════════════════════════════════════════════ */
  /*  RENDER                                                 */
  /* ═══════════════════════════════════════════════════════ */

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "max-w-[95vw] sm:max-w-lg max-h-[95dvh] flex flex-col overflow-hidden p-0",
            "!z-[10000]"
          )}
        >
          {/* ── Header ── */}
          <DialogHeader className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-gray-100">
            <DialogTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarIcon className="w-4 h-4 text-primary" />
              </div>
              {appointment ? "Edit Appointment" : "New Appointment"}
            </DialogTitle>
          </DialogHeader>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

            {/* ══ 1. CLIENT ══ */}
            <section>
              <SectionLabel icon={<User className="w-3.5 h-3.5" />} label="Client" required />

              {/* Selected client chip */}
              {!showClientSearch && (
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold",
                    isWalkIn ? "bg-gray-200 text-gray-600" : "bg-primary/10 text-primary"
                  )}>
                    {isWalkIn ? "W" : (formData.client_name.charAt(0) || "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {isWalkIn ? "Walk-in Client" : formData.client_name}
                    </p>
                    {!isWalkIn && (formData.client_email || formData.client_phone) && (
                      <p className="text-xs text-gray-500 truncate">
                        {formData.client_email || formData.client_phone}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={clearClient}
                    className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                  >
                    <X className="w-3 h-3 text-gray-600" />
                  </button>
                </div>
              )}

              {/* Search */}
              {showClientSearch && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <Input
                      ref={searchInputRef}
                      placeholder="Search client name, email or phone…"
                      value={clientQuery}
                      onChange={(e) => setClientQuery(e.target.value)}
                      className="pl-9 min-h-[44px]"
                    />
                  </div>

                  {/* Dropdown results */}
                  {clientResults.length > 0 && (
                    <div className="border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                      {clientResults.slice(0, 6).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectClient(c)}
                          className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors border-b last:border-b-0 border-gray-100"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary">
                              {c.first_name.charAt(0)}{c.last_name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{c.first_name} {c.last_name}</p>
                            <p className="text-xs text-gray-500">{c.email || c.phone}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quick actions */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={activateWalkIn}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <User className="w-4 h-4 text-gray-500" />
                      Walk-in
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddClient(true)}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 border border-dashed border-primary/40 rounded-xl text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      New Client
                    </button>
                  </div>
                </div>
              )}

              {/* Walk-in details */}
              {isWalkIn && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <div>
                    <Label className="text-xs font-medium text-amber-800">Name (optional)</Label>
                    <Input
                      value={formData.client_name}
                      onChange={(e) => setFormData((p) => ({ ...p, client_name: e.target.value }))}
                      placeholder="Walk-in name"
                      className="mt-1 min-h-[40px] bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-amber-800">Phone (optional)</Label>
                    <Input
                      value={formData.client_phone}
                      onChange={(e) => setFormData((p) => ({ ...p, client_phone: e.target.value }))}
                      placeholder="+27 82 123 4567"
                      className="mt-1 min-h-[40px] bg-white"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* ══ 2. SERVICES & PRODUCTS ══ */}
            <section>
              <SectionLabel icon={<Scissors className="w-3.5 h-3.5" />} label="Services & Products" required />

              {/* Add buttons */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setShowServicePicker(true)}
                  disabled={isLoadingData || services.length === 0}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-primary/30 rounded-xl text-sm font-medium text-primary hover:bg-primary/5 hover:border-primary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  {isLoadingData ? "Loading…" : "Add Service"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowProductPicker(true)}
                  disabled={isLoadingData || products.length === 0}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Package className="w-4 h-4" />
                  {isLoadingData ? "Loading…" : "Add Product"}
                </button>
              </div>

              {/* Cart items */}
              {cart.length > 0 ? (
                <div className="space-y-2">
                  {cart.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-3 bg-gray-50 border border-gray-100 rounded-xl"
                    >
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                        item.type === "service" ? "bg-primary/10" : "bg-amber-100"
                      )}>
                        {item.type === "service"
                          ? <Scissors className="w-3.5 h-3.5 text-primary" />
                          : <Package className="w-3.5 h-3.5 text-amber-600" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.type === "service" && item.duration_minutes && (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />{item.duration_minutes}m
                            </span>
                          )}
                          <span className="text-xs text-gray-500">{formatMoney(item.unit_price)}</span>
                          {item.quantity > 1 && (
                            <span className="text-xs text-gray-400">× {item.quantity} = {formatMoney(item.total)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => changeQty(idx, -1)}
                          className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                        >
                          <Minus className="w-3 h-3 text-gray-600" />
                        </button>
                        <span className="w-6 text-center text-sm font-medium text-gray-700">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => changeQty(idx, 1)}
                          className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                        >
                          <Plus className="w-3 h-3 text-gray-600" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors ml-1"
                        >
                          <X className="w-3 h-3 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Totals row */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-900 rounded-xl">
                    <div className="flex items-center gap-3 text-gray-300 text-xs">
                      {totalDuration > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {totalDuration} min
                        </span>
                      )}
                    </div>
                    <span className="text-white font-semibold text-sm">{formatMoney(totalPrice)}</span>
                  </div>
                </div>
              ) : (
                !isLoadingData && (
                  <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-xl">
                    <Sparkles className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Add a service to get started</p>
                  </div>
                )
              )}
            </section>

            {/* ══ 3. STAFF ══ */}
            <section>
              <SectionLabel icon={<User className="w-3.5 h-3.5" />} label="Team Member" required />
              {isLoadingData ? (
                <div className="h-[44px] rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
              ) : (
                <Select
                  value={formData.team_member_id}
                  onValueChange={(v) => setFormData((p) => ({ ...p, team_member_id: v }))}
                >
                  <SelectTrigger className="w-full min-h-[44px] rounded-xl">
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent className="!z-[10000]" position="popper" sideOffset={4}>
                    {teamMembers.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 text-center">No team members</div>
                    ) : (
                      teamMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="min-h-[44px]">
                          {m.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </section>

            {/* ══ 4. DATE & TIME ══ */}
            <section>
              <SectionLabel icon={<CalendarIcon className="w-3.5 h-3.5" />} label="Date & Time" required />
              <div className="grid grid-cols-2 gap-3">
                {/* Date picker */}
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal min-h-[44px] rounded-xl text-sm"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-gray-400" />
                      {format(formData.scheduled_date, "d MMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 !z-[10000]" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.scheduled_date}
                      onSelect={(d) => {
                        if (d) { setFormData((p) => ({ ...p, scheduled_date: d })); setIsDatePickerOpen(false); }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {/* Time picker */}
                <div>
                  <Select
                    value={formData.scheduled_time}
                    onValueChange={(v) => setFormData((p) => ({ ...p, scheduled_time: v }))}
                  >
                    <SelectTrigger className="w-full min-h-[44px] rounded-xl relative">
                      <SelectValue />
                      {isLoadingSlots && <Loader2 className="w-3 h-3 animate-spin absolute right-8 text-gray-400" />}
                    </SelectTrigger>
                    <SelectContent className="!z-[10000] max-h-64" position="popper" sideOffset={4}>
                      {availableSlots && (
                        <div className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border-b flex items-center gap-1.5">
                          <Check className="w-3 h-3" />
                          {availableSlots.length} available slots
                        </div>
                      )}
                      {timeOptions.map((t) => (
                        <SelectItem key={t} value={t} className="min-h-[40px]">{t}</SelectItem>
                      ))}
                      {availableSlots && (
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-xs text-gray-500 border-t text-left hover:bg-gray-50"
                          onClick={() => setAvailableSlots(null)}
                        >
                          Show all times
                        </button>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* ══ 5. NOTES ══ */}
            <section>
              <SectionLabel label="Notes" optional />
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Special requests, allergies, preferences…"
                rows={3}
                className="rounded-xl resize-none text-sm"
              />
            </section>

            {/* ══ 6. RECURRING ══ */}
            {!appointment && (
              <section>
                {recurringUpgradeRequired && (
                  <div className="mb-3 p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900">
                    <p className="font-medium">Upgrade required for repeating visits</p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2 bg-[#FF0077] hover:bg-[#D60565] text-white text-xs"
                      onClick={() => router.push("/provider/subscription")}
                    >
                      View plans
                    </Button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, is_recurring: !p.is_recurring }))}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Repeat className={cn("w-4 h-4", formData.is_recurring ? "text-primary" : "text-gray-400")} />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Repeating visit</p>
                      <p className="text-xs text-gray-500">Schedule this appointment to repeat</p>
                    </div>
                  </div>
                  <div className={cn(
                    "w-9 h-5 rounded-full flex items-center transition-colors",
                    formData.is_recurring ? "bg-primary justify-end" : "bg-gray-200 justify-start"
                  )}>
                    <div className="w-4 h-4 rounded-full bg-white mx-0.5 shadow-sm" />
                  </div>
                </button>

                {formData.is_recurring && (
                  <div className="mt-2 p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
                    <div>
                      <Label className="text-xs font-semibold text-blue-800">Repeat pattern</Label>
                      <Select
                        value={formData.recurrence_pattern}
                        onValueChange={(v) => setFormData((p) => ({ ...p, recurrence_pattern: v as any }))}
                      >
                        <SelectTrigger className="mt-1 min-h-[40px] bg-white rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="!z-[10000]" position="popper">
                          {[
                            ["daily", "Daily"],
                            ["weekly", "Weekly"],
                            ["biweekly", "Every 2 weeks"],
                            ["monthly", "Monthly"],
                          ].map(([v, l]) => (
                            <SelectItem key={v} value={v} className="min-h-[40px]">{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-semibold text-blue-800">End date (optional)</Label>
                        <Input
                          type="date"
                          value={formData.recurrence_end_date}
                          onChange={(e) => setFormData((p) => ({ ...p, recurrence_end_date: e.target.value }))}
                          className="mt-1 min-h-[40px] bg-white rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-blue-800">Max visits (optional)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={formData.recurrence_occurrences || ""}
                          onChange={(e) => setFormData((p) => ({
                            ...p,
                            recurrence_occurrences: parseInt(e.target.value) || undefined,
                          }))}
                          placeholder="e.g. 10"
                          className="mt-1 min-h-[40px] bg-white rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* ── Sticky footer ── */}
          <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 space-y-3 bg-white">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
                className="flex-1 min-h-[44px] rounded-xl border-gray-200"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="flex-1 min-h-[44px] rounded-xl bg-gray-900 hover:bg-gray-800 text-white"
              >
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                ) : appointment ? "Update" : "Save"}
              </Button>
              {!appointment && (
                <Button
                  type="button"
                  disabled={isSaving || !cart.some((i) => i.type === "service") || !formData.team_member_id}
                  onClick={handleSaveAndCheckout}
                  className="flex-1 min-h-[44px] rounded-xl bg-primary hover:bg-primary/90 text-white"
                >
                  <ShoppingCart className="w-4 h-4 mr-1.5" />
                  Checkout
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Service picker sub-dialog ── */}
      <Dialog
        open={showServicePicker}
        onOpenChange={(v) => { setShowServicePicker(v); if (!v) setServiceSearch(""); }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 !z-[10001]">
          <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <DialogTitle className="text-base font-semibold mb-3">Add a Service</DialogTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                autoFocus
                placeholder="Search services…"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {renderServiceList()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Product picker sub-dialog ── */}
      <Dialog
        open={showProductPicker}
        onOpenChange={(v) => {
          setShowProductPicker(v);
          if (!v) { setVariantProduct(null); setSelectedVariantId(""); setProductSearch(""); }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 !z-[10001]">
          <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <DialogTitle className="text-base font-semibold mb-3">
              {variantProduct ? `Select variant — ${variantProduct.name}` : "Add a Product"}
            </DialogTitle>
            {!variantProduct && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  autoFocus
                  placeholder="Search products…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {variantProduct ? (
              <div className="space-y-2">
                {(variantProduct.variants ?? []).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    className={cn(
                      "w-full text-left px-4 py-3.5 border rounded-xl transition-colors flex items-center justify-between",
                      selectedVariantId === v.id
                        ? "border-primary bg-primary/5"
                        : "border-gray-100 hover:bg-gray-50"
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {Object.values(v.option_values).join(" / ")}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatMoney(Number(v.retail_price))}
                        {v.quantity != null && ` · Stock: ${v.quantity}`}
                        {v.sku && ` · ${v.sku}`}
                      </p>
                    </div>
                    {selectedVariantId === v.id && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {products.length === 0 ? (
                  <div className="py-12 text-center">
                    <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No products available</p>
                  </div>
                ) : (
                  products
                    .filter((p) => {
                      const q = productSearch.toLowerCase();
                      return p.name.toLowerCase().includes(q)
                        || (p.brand ?? "").toLowerCase().includes(q)
                        || (p.sku ?? "").toLowerCase().includes(q);
                    })
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (p.has_variants && (p.variants ?? []).length > 0) setVariantProduct(p);
                          else addProduct(p);
                        }}
                        className="w-full text-left px-4 py-3.5 border border-gray-100 rounded-xl hover:bg-primary/5 hover:border-primary/30 transition-colors flex items-center justify-between group"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-primary transition-colors">
                              {p.name}
                            </p>
                            {p.has_variants && (
                              <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                                VARIANTS
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatMoney(Number(p.retail_price))}
                            {p.brand && ` · ${p.brand}`}
                            {!p.has_variants && p.sku && ` · ${p.sku}`}
                          </p>
                        </div>
                        {p.has_variants ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-100 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-all flex-shrink-0">
                            <Plus className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>
                    ))
                )}
              </div>
            )}
          </div>

          {variantProduct && (
            <div className="flex gap-2 p-4 border-t border-gray-100 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setVariantProduct(null); setSelectedVariantId(""); }}
                className="flex-1 rounded-xl min-h-[44px]"
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={!selectedVariantId}
                onClick={() => {
                  const v = (variantProduct.variants ?? []).find((vv) => vv.id === selectedVariantId);
                  if (v) addProduct(variantProduct, v);
                }}
                className="flex-1 rounded-xl min-h-[44px] bg-primary hover:bg-primary/90"
              >
                Add to appointment
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add Client sub-dialog ── */}
      <AddClientDialog
        open={showAddClient}
        onOpenChange={setShowAddClient}
        onSuccess={(newClient: any) => {
          if (newClient?.id) {
            selectClient({
              id: newClient.id,
              first_name: newClient.first_name || "",
              last_name: newClient.last_name || "",
              email: newClient.email,
              phone: newClient.phone,
            });
          }
          setShowAddClient(false);
        }}
      />
    </>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Small internal helpers                                     */
/* ─────────────────────────────────────────────────────────── */

function SectionLabel({
  icon,
  label,
  required,
  optional,
}: {
  icon?: React.ReactNode;
  label: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      {icon && <span className="text-gray-400">{icon}</span>}
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
      {required && <span className="text-red-400 text-xs">*</span>}
      {optional && <span className="text-gray-400 text-xs">(optional)</span>}
    </div>
  );
}
