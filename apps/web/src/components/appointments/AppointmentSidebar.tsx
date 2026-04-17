"use client";

/**
 * Appointment Sidebar - Mangomint-style right panel
 * 
 * Supports three modes:
 * - CREATE: New appointment with prefilled slot data
 * - VIEW: View existing appointment details
 * - EDIT: Edit existing appointment
 * 
 * Types, pricing, and invoice generation are extracted to:
 * - ./types.ts
 * - ./pricing.ts
 * - ./invoice-generator.ts
 * 
 * @module components/appointments/AppointmentSidebar
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { AppointmentSidebarProps, AppointmentService, AppointmentProduct, CreateFormData, CancelReason } from "./types";
import { calculateBookingPricing } from "./pricing";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  X,
  Edit,
  MoreVertical,
  Check,
  Clock,
  Mail,
  MapPin,
  User,
  Calendar,
  Bell,
  Trash2,
  RotateCcw,
  Send,
  Home,
  Building2,
  PersonStanding,
  StickyNote,
  Plus,
  Minus,
  ChevronDown,
  Printer,
  FileText,
  CreditCard,
  Info,
  Users,
  Package,
  Search,
  Repeat,
  Loader2,
  Timer,
  AlertCircle,
  Sparkles,
  Tag,
  Receipt,
} from "lucide-react";

import type {
  Appointment,
  ServiceItem,
  ProductItem,
  Provider as PortalProviderProfile,
} from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { fetcher } from "@/lib/http/fetcher";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import {
  formatApiErrorMessage,
  isLikelyUuid,
  subscriptionUpgradeHint,
} from "@/lib/http/api-error";
import {
  useAppointmentSidebar,
  openCreateMode,
} from "@/stores/appointment-sidebar-store";
import {
  AppointmentStatus,
  AppointmentKind,
  mapStatus,
  unmapStatus,
} from "@/lib/scheduling/mangomintAdapter";
import { ProviderClientRatingDialog } from "@/components/provider-portal/ProviderClientRatingDialog";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { PostForRewardNudge } from "@/components/provider/PostForRewardNudge";
import { getStatusColors } from "@/lib/scheduling/visualMapping";
import { DEFAULT_APPOINTMENT_STATUS } from "@/lib/provider-portal/constants";
import { computeTravelFee, DEFAULT_TRAVEL_FEE_RULES, type TravelFeeRules } from "@/lib/travel/travelFeeEngine";
import { NotificationToggle } from "@/components/calendar/NotificationToggle";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { AvailabilitySlotPicker } from "./AvailabilitySlotPicker";

// Types are now in ./types.ts

// ============================================================================
// COMPONENT
// ============================================================================

export function AppointmentSidebar({
  teamMembers = [],
  services,
  products: productsProp = [],
  locations = [],
  onAppointmentCreated,
  onAppointmentUpdated,
  onAppointmentDeleted,
  onRefresh,
}: AppointmentSidebarProps) {
  const {
    mode,
    selectedAppointment,
    draftSlot,
    isLoading: _isLoading,
    isSaving,
    sendNotification,
    isOpen,
    closeSidebar,
    switchToEditMode,
    switchToViewMode,
    setSaving,
    setLoading,
    setSendNotification,
    updateSelectedAppointment,
  } = useAppointmentSidebar();

  const { format: formatMoney } = useProviderMoneyFormat();
  const { provider: portalProviderRaw } = useProviderPortal();
  const portalProvider = portalProviderRaw as PortalProviderProfile | null;

  /** Booking id for PATCH /bookings/:id (calendar rows may use composite ids or service-line ids). */
  const activeBookingId = useMemo(() => {
    if (!selectedAppointment?.id) return "";
    if (selectedAppointment.booking_id) return selectedAppointment.booking_id;
    const id = selectedAppointment.id;
    return id.includes("-svc-") ? id.split("-svc-")[0] : id;
  }, [selectedAppointment]);

  // In-salon appointments: only list locations where clients can visit (location_type === 'salon'); base = distance-only
  const salonLocations = (locations || []).filter(
    (l) => (l.location_type ?? "salon") !== "base"
  );

  // Refund dialog state
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundAmount, setRefundAmount] = useState(0);

  // Rating dialog state
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [_hasExistingRating, _setHasExistingRating] = useState(false);
  const [showPostNudge, setShowPostNudge] = useState(false);

  // Tax rate state - loaded from API (must be declared before formData)
  const [defaultTaxRate, setDefaultTaxRate] = useState<number>(0); // Default 0% until loaded from provider settings
  
  // Service fee state - loaded from API (must be declared before formData)
  // NOTE: For provider-created appointments (walk-in), service fee is ALWAYS 0
  const [defaultServiceFeePercentage, setDefaultServiceFeePercentage] = useState<number>(0); // Provider-created = 0% service fee
  
  // Travel settings state - loaded from API
  const [_travelSettings, setTravelSettings] = useState<TravelFeeRules>(DEFAULT_TRAVEL_FEE_RULES);
  
  // Buffer time settings state - loaded from API
  const [_bufferSettings, setBufferSettings] = useState({ bufferBeforeMinutes: 0, bufferAfterMinutes: 0, cleanupTimeMinutes: 0 });

  // Tax-inclusive flag — SA VAT default is true (prices include tax); loaded from provider settings
  const [taxInclusiveMode, setTaxInclusiveMode] = useState(true);

  // Deposit settings - loaded from provider online booking settings
  const [depositSettings, setDepositSettings] = useState<{ required: boolean; percentage: number }>({ required: false, percentage: 0 });
  const [collectDeposit, setCollectDeposit] = useState(false);

  // Form state for CREATE/EDIT
  const [formData, setFormData] = useState<CreateFormData>({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    kind: AppointmentKind.IN_SALON,
    locationId: "",
    staffId: "",
    date: "",
    startTime: "",
    duration: 60,
    serviceId: "",
    serviceName: "",
    price: 0,
    services: [],
    products: [],
    notes: "",
    status: DEFAULT_APPOINTMENT_STATUS,
    subtotal: 0,
    discountAmount: 0,
    taxAmount: 0,
    taxRate: defaultTaxRate, // Will be loaded from platform settings or provider settings
    serviceFeePercentage: defaultServiceFeePercentage, // Loaded from platform settings or provider settings
    serviceFeeAmount: 0,
    tipAmount: 0,
    totalAmount: 0,
    addressLine1: "",
    addressLine2: "",
    addressCity: "",
    addressPostalCode: "",
    addressCountry: "",
    addressLatitude: null,
    addressLongitude: null,
    travelFee: 0,
    travelTimeOverride: null,
    travelFeeOverride: null,
    travelOverrideReason: "",
    hasTravelOverride: false,
    referralSourceId: "",
    clientId: "",
    isRecurring: false,
    recurrencePattern: "weekly",
    recurrenceEndDate: "",
    paymentMethod: "pay_later",
  });

  /** Live hints from GET /api/provider/bookings/check-availability */
  const [slotAvailability, setSlotAvailability] = useState<{
    loading: boolean;
    checked: boolean;
    available: boolean;
    conflicts: string[];
  }>({ loading: false, checked: false, available: true, conflicts: [] });

  useEffect(() => {
    if (mode !== "create" && mode !== "edit") {
      setSlotAvailability({ loading: false, checked: false, available: true, conflicts: [] });
      return;
    }
    if (!formData.date || !formData.startTime || formData.duration < 1) {
      setSlotAvailability({ loading: false, checked: false, available: true, conflicts: [] });
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setSlotAvailability((prev) => ({ ...prev, loading: true }));
      try {
        const timePart =
          formData.startTime.length === 5 ? `${formData.startTime}:00` : formData.startTime;
        const scheduledLocal = new Date(`${formData.date}T${timePart}`);
        if (Number.isNaN(scheduledLocal.getTime())) {
          if (!ac.signal.aborted) {
            setSlotAvailability({ loading: false, checked: false, available: true, conflicts: [] });
          }
          return;
        }

        const params = new URLSearchParams();
        params.set("scheduled_at", scheduledLocal.toISOString());
        params.set("duration_minutes", String(formData.duration));
        if (formData.staffId) params.set("staff_ids", formData.staffId);
        if (formData.kind !== AppointmentKind.AT_HOME && formData.locationId) {
          params.set("location_id", formData.locationId);
        }
        if (mode === "edit" && activeBookingId) {
          params.set("exclude_booking_id", activeBookingId);
        }

        const res = await fetch(`/api/provider/bookings/check-availability?${params.toString()}`, {
          signal: ac.signal,
        });
        const body = (await res.json().catch(() => null)) as {
          data?: { available?: boolean; conflicts?: string[] };
        } | null;
        if (ac.signal.aborted) return;
        const payload = body?.data;
        if (!res.ok || !payload) {
          setSlotAvailability({
            loading: false,
            checked: false,
            available: true,
            conflicts: [],
          });
          return;
        }
        setSlotAvailability({
          loading: false,
          checked: true,
          available: Boolean(payload.available),
          conflicts: Array.isArray(payload.conflicts) ? payload.conflicts : [],
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setSlotAvailability({
          loading: false,
          checked: false,
          available: true,
          conflicts: [],
        });
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [
    mode,
    formData.date,
    formData.startTime,
    formData.duration,
    formData.staffId,
    formData.locationId,
    formData.kind,
    activeBookingId,
  ]);

  // Referral sources (for "Where did this client come from?")
  const [referralSources, setReferralSources] = useState<Array<{ id: string; name: string; description?: string | null; is_active: boolean }>>([]);

  /** Provider form definitions (labels for `provider_form_responses` on the booking). */
  const [providerFormDefs, setProviderFormDefs] = useState<
    Array<{ id: string; title: string; form_type?: string; fields?: Array<{ id: string; name: string }> }>
  >([]);

  // Cancel dialog
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState<CancelReason>("normal");
  
  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Products state - ensure it's always an array
  const [products, setProducts] = useState<ProductItem[]>(Array.isArray(productsProp) ? productsProp : []);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const prevProductsPropRef = useRef<string>("");
  const productsLoadedRef = useRef<boolean>(false); // Track if products have been loaded
  const customTipInputRef = useRef<HTMLInputElement>(null);
  const [customTipActive, setCustomTipActive] = useState(false);
  
  // Client search state
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<Array<{
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  }>>([]);
  const [showClientSearch, setShowClientSearch] = useState(false);
  
  // Packages state
  const [packages, setPackages] = useState<Array<{
    id: string;
    name: string;
    description?: string;
    price?: number;
    discount_percentage?: number;
    items?: Array<{ id: string; title: string; type: "service" | "product"; quantity: number }>;
  }>>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  
  // Service variants and addons state
  const [serviceVariants, setServiceVariants] = useState<Record<string, any[]>>({});
  const [serviceAddons, setServiceAddons] = useState<Record<string, any[]>>({});
  const [loadingVariants, setLoadingVariants] = useState<Record<string, boolean>>({});
  const [loadingAddons, setLoadingAddons] = useState<Record<string, boolean>>({});
  const variantsFetchedRef = useRef<Set<string>>(new Set());
  const addonsFetchedRef = useRef<Set<string>>(new Set());
  const [selectedServiceForVariant, setSelectedServiceForVariant] = useState<string | null>(null);
  const [selectedServiceForAddon, setSelectedServiceForAddon] = useState<string | null>(null);
  
  // New client creation state
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);
  const [newClientData, setNewClientData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });
  
  // Service search state
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");

  // Product search state
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<ProductItem[]>([]);
  
  // Load products function - memoized to prevent recreation on every render
  // Optimized: Only load when needed, with caching
  const loadProducts = useCallback(async (search?: string) => {
    // If we already have products and no search query, don't reload
    if (products.length > 0 && !search && productsLoadedRef.current) {
      return;
    }
    
    try {
      setIsLoadingProducts(true);
      // Reduce limit for better performance - load 100 at a time
      const response = await providerApi.listProducts(
        search ? { search } : undefined, 
        { page: 1, limit: search ? 50 : 100 } // Smaller limit for search, 100 for initial load
      );
      const productsList = Array.isArray(response.data) ? response.data : [];
      // Filter to only show active products with retail sales enabled (client-side safety check)
      const activeProducts = productsList.filter(p => p.is_active && p.retail_sales_enabled);
      setProducts(activeProducts);
      setFilteredProducts(activeProducts);
      productsLoadedRef.current = true;
    } catch (error) {
      console.error("Failed to load products:", error);
      setProducts([]);
      setFilteredProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [products.length]);
  
  // Filter products based on search query
  useEffect(() => {
    if (!productSearchQuery.trim()) {
      setFilteredProducts(products);
    } else {
      const query = productSearchQuery.toLowerCase();
      const filtered = products.filter(p => 
        p.name?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.sku?.toLowerCase().includes(query)
      );
      setFilteredProducts(filtered);
    }
  }, [productSearchQuery, products]);
  
  // Load products if not provided - LAZY LOAD: Only load when product dropdown is opened
  useEffect(() => {
    // Ensure productsProp is an array
    const safeProductsProp = Array.isArray(productsProp) ? productsProp : [];
    
    // Use JSON.stringify to compare arrays (simple deep comparison)
    const currentProductsKey = JSON.stringify(safeProductsProp);
    
    // Only update if productsProp actually changed
    if (currentProductsKey !== prevProductsPropRef.current) {
      prevProductsPropRef.current = currentProductsKey;
      
      if (safeProductsProp.length > 0) {
        // Filter to only show active products with retail sales enabled
        const activeProducts = safeProductsProp.filter(p => p.is_active && p.retail_sales_enabled);
        setProducts(activeProducts);
        setFilteredProducts(activeProducts);
        productsLoadedRef.current = true;
      }
      // Don't auto-load products - wait for user to interact with product dropdown
    }
  }, [productsProp]);
  
  // Load packages
  const loadPackages = useCallback(async () => {
    try {
      setIsLoadingPackages(true);
      const response = await fetcher.get<{ data?: { packages?: any[] }; packages?: any[] }>("/api/provider/packages");
      const packagesList = response.data?.packages ?? response.packages ?? response.data ?? [];
      setPackages(Array.isArray(packagesList) ? packagesList : []);
    } catch (error) {
      console.error("Failed to load packages:", error);
      setPackages([]);
    } finally {
      setIsLoadingPackages(false);
    }
  }, []);
  
  // Load packages and preload products when sidebar opens in create mode (same as appointments flow)
  useEffect(() => {
    if (isOpen && mode === "create") {
      loadPackages();
      // Preload products so dropdown opens quickly (aligned with appointments page)
      loadProducts();
    }
  }, [isOpen, mode, loadPackages, loadProducts]);

  // Load referral sources when sidebar is open (create or edit) for "Where did this client come from?"
  useEffect(() => {
    if (!isOpen) return;
    const loadReferralSources = async () => {
      try {
        const { fetcher } = await import("@/lib/http/fetcher");
        const res = await fetcher.get<{ data?: Array<{ id: string; name: string; description?: string | null; is_active: boolean }> }>("/api/provider/referral-sources");
        const list = Array.isArray(res?.data) ? res.data : [];
        setReferralSources(list.filter((s) => s.is_active !== false));
      } catch (e) {
        console.warn("Failed to load referral sources:", e);
        setReferralSources([]);
      }
    };
    loadReferralSources();
  }, [isOpen, mode]);

  // Load provider form titles/field names when viewing a booking with client form responses
  useEffect(() => {
    if (!isOpen || mode !== "view") {
      setProviderFormDefs([]);
      return;
    }
    const apt = selectedAppointment;
    const responses = apt?.provider_form_responses;
    if (
      !apt ||
      !responses ||
      typeof responses !== "object" ||
      Object.keys(responses).length === 0
    ) {
      setProviderFormDefs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = (await fetcher.get("/api/provider/forms")) as {
          data?: Array<{ id: string; title: string; form_type?: string; fields?: Array<{ id: string; name: string }> }>;
        };
        const forms = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) setProviderFormDefs(forms);
      } catch {
        if (!cancelled) setProviderFormDefs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, selectedAppointment?.id, selectedAppointment?.provider_form_responses]);

  // Client search
  useEffect(() => {
    const searchClients = async () => {
      if (clientSearchQuery.length >= 2) {
        try {
          // Search both saved clients and serviced customers
          const [savedClientsResponse, servicedClientsResponse] = await Promise.all([
            fetch(`/api/provider/clients?search=${encodeURIComponent(clientSearchQuery)}`),
            fetch(`/api/provider/clients/serviced?search=${encodeURIComponent(clientSearchQuery)}`),
          ]);
          
          const allClients: Array<{
            id: string;
            full_name: string;
            email?: string;
            phone?: string;
          }> = [];
          
          // Add saved clients
          if (savedClientsResponse.ok) {
            const savedData = await savedClientsResponse.json();
            const savedClients = (savedData.data || []).map((client: any) => {
              const customer = client.customer || {};
              return {
                id: customer.id || client.customer_id,
                full_name: customer.full_name || "Unknown",
                email: customer.email || "",
                phone: customer.phone || "",
              };
            });
            allClients.push(...savedClients);
          }
          
          // Add serviced customers (avoid duplicates)
          if (servicedClientsResponse.ok) {
            const servicedData = await servicedClientsResponse.json();
            const existingIds = new Set(allClients.map(c => c.id));
            const servicedClients = (servicedData.data || [])
              .filter((item: any) => !existingIds.has(item.customer_id))
              .map((item: any) => {
                const customer = item.customer || {};
                return {
                  id: customer.id || item.customer_id,
                  full_name: customer.full_name || "Unknown",
                  email: customer.email || "",
                  phone: customer.phone || "",
                };
              });
            allClients.push(...servicedClients);
          }
          
          setClientSearchResults(allClients);
        } catch (error) {
          console.error("Error searching clients:", error);
          setClientSearchResults([]);
        }
      } else {
        setClientSearchResults([]);
      }
    };
    
    const debounceTimer = setTimeout(searchClients, 300);
    return () => clearTimeout(debounceTimer);
  }, [clientSearchQuery]);
  
  const handleSelectClient = async (client: { id: string; full_name: string; email?: string; phone?: string }) => {
    setFormData(prev => ({
      ...prev,
      clientName: client.full_name,
      clientEmail: client.email || "",
      clientPhone: client.phone || "",
      clientId: client.id,
    }));
    setClientSearchQuery("");
    setClientSearchResults([]);
    setShowClientSearch(false);

    // For at-home bookings, try to load the client's primary/default address
    if (formData.kind === AppointmentKind.AT_HOME) {
      try {
        let addr: Record<string, any> | null = null;

        // Try client detail endpoint first
        const res = await fetch(`/api/provider/clients/${client.id}`);
        if (res.ok) {
          const body = await res.json();
          const clientData = body?.data ?? body;
          addr = clientData?.customer?.default_address ?? clientData?.default_address ?? null;
        }

        // Fallback: try the dedicated addresses endpoint
        if (!addr) {
          const addrRes = await fetch(`/api/provider/clients/${client.id}/addresses`);
          if (addrRes.ok) {
            const addrBody = await addrRes.json();
            const addresses = addrBody?.data ?? addrBody ?? [];
            if (Array.isArray(addresses) && addresses.length > 0) {
              addr = addresses.find((a: any) => a.is_default || a.is_primary) ?? addresses[0];
            }
          }
        }

        if (addr) {
          setFormData(prev => ({
            ...prev,
            addressLine1: addr!.address_line1 || addr!.line1 || addr!.street || "",
            addressLine2: addr!.address_line2 || addr!.line2 || "",
            addressCity: addr!.city || "",
            addressPostalCode: addr!.postal_code || addr!.postalCode || "",
            addressCountry: addr!.country || "",
            addressLatitude: addr!.latitude ?? addr!.lat ?? null,
            addressLongitude: addr!.longitude ?? addr!.lng ?? null,
          }));
        }
      } catch {
        // Client may not have an address on file
      }
    }
  };
  
  const handleCreateNewClient = useCallback(async () => {
    if (!newClientData.first_name.trim() || !newClientData.last_name.trim()) {
      toast.error("First name and last name are required");
      return;
    }
    
    const phone = newClientData.phone.trim();
    if (phone && !isCompleteE164(phone)) {
      toast.error("Enter a valid phone number or leave the field blank.");
      return;
    }

    const requestBody: {
      first_name: string;
      last_name: string;
      full_name: string;
      email?: string;
      phone?: string;
    } = {
      first_name: newClientData.first_name.trim(),
      last_name: newClientData.last_name.trim(),
      full_name: `${newClientData.first_name.trim()} ${newClientData.last_name.trim()}`.trim(),
    };

    if (newClientData.email.trim()) {
      requestBody.email = newClientData.email.trim();
    }

    if (phone) {
      requestBody.phone = phone;
    }
    
    try {
      const response = await fetch("/api/provider/clients/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        let errorMessage = `Server error: ${response.status}`;
        try {
          const errorData = await response.json();
          // Handle different error response formats
          if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else if (errorData?.error?.message) {
            // Extract message from error object
            errorMessage = typeof errorData.error.message === 'string' 
              ? errorData.error.message 
              : String(errorData.error.message);
          } else if (errorData?.message) {
            errorMessage = typeof errorData.message === 'string' 
              ? errorData.message 
              : String(errorData.message);
          } else if (errorData?.error) {
            if (typeof errorData.error === 'string') {
              errorMessage = errorData.error;
            } else if (errorData.error?.message) {
              errorMessage = String(errorData.error.message);
            } else {
              errorMessage = String(errorData.error);
            }
          } else if (errorData?.data?.message) {
            errorMessage = typeof errorData.data.message === 'string'
              ? errorData.data.message
              : String(errorData.data.message);
          } else {
            // Last resort: try to stringify, but provide a fallback
            try {
              errorMessage = JSON.stringify(errorData);
            } catch {
              errorMessage = `Server error: ${response.status}`;
            }
          }
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = response.statusText || `Server error: ${response.status}`;
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      const client = data.data || data;
      const customer = client.customer || client;
      
      const newCustomerId =
        (customer.id as string | undefined) ||
        (client as { id?: string; customer_id?: string }).id ||
        (client as { customer_id?: string }).customer_id ||
        "";

      // Update form data with new client
      setFormData(prev => ({
        ...prev,
        clientName: customer.full_name || `${newClientData.first_name} ${newClientData.last_name}`.trim(),
        clientEmail: customer.email || newClientData.email || "",
        clientPhone: customer.phone || newClientData.phone || "",
        clientId: newCustomerId,
      }));
      
      // Reset and close dialog
      setNewClientData({ first_name: "", last_name: "", email: "", phone: "" });
      setShowNewClientDialog(false);
      setClientSearchQuery("");
      setClientSearchResults([]);
      
      toast.success("Client created successfully");
    } catch (error) {
      console.error("Failed to create client:", error);
      let errorMessage = "Failed to create client";
      
      try {
        if (error instanceof Error) {
          errorMessage = error.message || "Failed to create client";
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error && typeof error === 'object') {
          // Try to extract message from error object
          const err = error as any;
          if (err?.message && typeof err.message === 'string') {
            errorMessage = err.message;
          } else if (err?.error?.message && typeof err.error.message === 'string') {
            errorMessage = err.error.message;
          } else if (err?.error && typeof err.error === 'string') {
            errorMessage = err.error;
          } else {
            // Last resort: try to stringify, but provide a fallback
            try {
              const stringified = JSON.stringify(err);
              if (stringified && stringified !== '{}') {
                errorMessage = stringified;
              } else {
                errorMessage = "An unexpected error occurred. Please try again.";
              }
            } catch {
              errorMessage = "An unexpected error occurred. Please try again.";
            }
          }
        }
      } catch (parseError) {
        // If we can't parse the error, use a generic message
        console.error("Error parsing error object:", parseError);
        errorMessage = "An unexpected error occurred. Please try again.";
      }
      
      // Ensure we have a valid string message
      if (!errorMessage || errorMessage.trim() === '') {
        errorMessage = "Failed to create client. Please try again.";
      }
      
      toast.error(errorMessage);
    }
  }, [newClientData]);
  
  const handleAddPackage = (pkg: typeof packages[0]) => {
    if (!pkg.items || pkg.items.length === 0) {
      toast.error("Package has no items");
      return;
    }
    
    // API format: items have offering_id/offering (service) or product_id/product (product)
    pkg.items.forEach((item: any) => {
      if (item.offering_id && item.offering) {
        // Service/offering from package
        const offering = item.offering;
        const service = services.find(s => s.id === item.offering_id);
        const isVariant = offering?.service_type === "variant";
        const parentService = offering?.parent_service_id
          ? services.find(s => s.id === offering.parent_service_id)
          : null;
        
        if (service) {
          addService(service);
        } else if (isVariant && parentService) {
          addService(parentService, offering.id, offering.variant_name || offering.title || offering.name);
        } else if (offering?.id != null) {
          // Create minimal ServiceItem from offering (works for variants and base services)
          const pseudoService: ServiceItem = {
            id: offering.id,
            name: offering.variant_name || offering.title || offering.name || "Service",
            category_id: "",
            duration_minutes: offering.duration_minutes ?? 60,
            price: offering.price ?? 0,
            is_active: true,
            order: 0,
          };
          addService(pseudoService);
        }
      } else if (item.product_id && item.product) {
        const product = products.find(p => p.id === item.product_id);
        const prod = item.product;
        if (product) {
          addProduct(product, item.quantity || 1);
        } else if (prod?.id != null && prod?.retail_price != null) {
          const pseudoProduct: ProductItem = {
            id: prod.id,
            name: prod.name || "Product",
            category: "General",
            quantity: 0,
            retail_price: prod.retail_price,
          };
          addProduct(pseudoProduct, item.quantity || 1);
        }
      }
    });
    
    setSelectedPackageId(pkg.id);
    toast.success(`Package "${pkg.name}" added`);
  };

  // Load default tax rate, service fee, travel settings, and buffer time on mount (same as appointments)
  // Preload so correct values are ready when sidebar opens
  useEffect(() => {
    const loadSettings = async () => {
        try {
          // Load tax rate
          const taxResponse = await fetch("/api/provider/tax-rate");
          if (taxResponse.ok) {
            const taxResponseData = await taxResponse.json();
            const taxRate = (taxResponseData?.data?.taxRate ?? 0) / 100; // Convert percentage to decimal (0% for non-VAT)
            setDefaultTaxRate(taxRate);
            
            // Update formData with loaded tax rate in create mode
            if (mode === "create") {
              setFormData(prev => {
                const pricing = calculatePricing(prev.services, prev.products, prev.travelFee, prev.discountAmount, taxRate, 0, prev.tipAmount);
                return {
                  ...prev,
                  taxRate: taxRate,
                  serviceFeePercentage: 0, // Provider-created appointments have no service fee
                  serviceFeeAmount: 0,
                  taxAmount: pricing.taxAmount,
                  totalAmount: pricing.totalAmount,
                };
              });
            } else if (mode === "edit") {
              // In edit mode, update tax rate if it's not already set from the appointment
              setFormData(prev => {
                // Only update if tax rate is 0 or not set
                if (!prev.taxRate || prev.taxRate === 0) {
                  const pricing = calculatePricing(prev.services, prev.products, prev.travelFee, prev.discountAmount, taxRate, 0, prev.tipAmount);
                  return {
                    ...prev,
                    taxRate: taxRate,
                    taxAmount: pricing.taxAmount,
                    totalAmount: pricing.totalAmount,
                  };
                }
                return prev;
              });
            }
          }
          
          // Load service fee (for reference, but provider-created appointments use 0)
          const serviceFeeResponse = await fetch("/api/provider/service-fee");
          if (serviceFeeResponse.ok) {
            const serviceFeeData = await serviceFeeResponse.json();
            const serviceFeePercentage = (serviceFeeData.data?.serviceFeePercentage || 10) / 100; // Convert percentage to decimal
            setDefaultServiceFeePercentage(serviceFeePercentage);
          }
          
          // Load travel settings
          const travelResponse = await fetch("/api/provider/settings/travel");
          if (travelResponse.ok) {
            const travelData = await travelResponse.json();
            setTravelSettings(travelData.data?.settings || DEFAULT_TRAVEL_FEE_RULES);
          }
          
          // Load buffer time settings
          const bufferResponse = await fetch("/api/provider/buffer-time");
          if (bufferResponse.ok) {
            const bufferData = await bufferResponse.json();
            setBufferSettings({
              bufferBeforeMinutes: bufferData.data?.bufferBeforeMinutes || 0,
              bufferAfterMinutes: bufferData.data?.bufferAfterMinutes || 0,
              cleanupTimeMinutes: bufferData.data?.cleanupTimeMinutes || 0,
            });
          }

          // Load deposit + tax-inclusive settings from provider payment settings
          const depositResponse = await fetch("/api/provider/settings/payments");
          if (depositResponse.ok) {
            const depositData = await depositResponse.json();
            const d = depositData?.data;
            if (d?.deposit_required || d?.depositRequired || d?.requiresDeposit) {
              setDepositSettings({
                required: true,
                percentage: Number(d.deposit_percent ?? d.depositPercent ?? d.deposit_percentage ?? d.depositPercentage ?? 30),
              });
            }
            // Tax-inclusive mode — provider.tax_inclusive (defaults to true for SA VAT)
            if (d?.taxInclusive !== undefined) {
              setTaxInclusiveMode(d.taxInclusive);
            }
          }
        } catch (error) {
          console.warn("Failed to load settings, using defaults:", error);
        }
      };
    loadSettings();
  }, []); // Run once on mount so tax/travel/settings are ready when sidebar opens

  // Keyboard shortcuts: Escape to close, Ctrl+Enter to submit
  const handleCreateRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSidebar();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && mode === "create" && handleCreateRef.current) {
        e.preventDefault();
        handleCreateRef.current();
      }
    };
    
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, closeSidebar, mode]);

  // Draft auto-save: persist create-mode form data to localStorage
  const DRAFT_KEY = "beautonomi_booking_draft";
  useEffect(() => {
    if (mode !== "create" || !isOpen) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
      } catch { /* quota exceeded or private mode */ }
    }, 1000);
    return () => clearTimeout(timer);
  }, [formData, mode, isOpen]);

  // Clear draft on successful create or sidebar close
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }, []);

  // Fetch full booking data when opening in view mode (calendar passes expanded/incomplete data)
  useEffect(() => {
    if (mode !== "view" || !selectedAppointment?.id || !updateSelectedAppointment) return;
    const existingServices = (selectedAppointment as any).services;
    if (Array.isArray(existingServices) && existingServices.length > 0) {
      return; // Already have full data (e.g. from /provider/bookings)
    }
    const fetchFullAppointment = async () => {
      try {
        setLoading(true);
        const fullAppointment = await providerApi.getAppointment(activeBookingId || selectedAppointment.id);
        updateSelectedAppointment(fullAppointment);
      } catch (err) {
        console.warn("Could not fetch full appointment data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchFullAppointment();
  }, [mode, selectedAppointment?.id, activeBookingId]);

  // Listen for custom event to open sidebar in CREATE mode (from /provider/bookings)
  useEffect(() => {
    const handleOpenSidebar = () => {
      const now = new Date();
      openCreateMode({
        staffId: "",
        staffName: undefined,
        date: format(now, "yyyy-MM-dd"),
        startTime: format(now, "HH:mm"),
        locationId: undefined,
        locationName: undefined,
      });
    };
    window.addEventListener('open-appointment-sidebar', handleOpenSidebar);
    return () => window.removeEventListener('open-appointment-sidebar', handleOpenSidebar);
  }, []);

  // Helper function to calculate pricing — passes tax-inclusive mode from provider settings
  const calculatePricing = useCallback(
    (servicesList: AppointmentService[], productsList: AppointmentProduct[], travelFee: number, discountAmount: number, taxRate: number, serviceFeePercentage: number, tipAmount: number) =>
      calculateBookingPricing(servicesList, productsList, travelFee, discountAmount, taxRate, serviceFeePercentage, tipAmount, { taxInclusive: taxInclusiveMode }),
    [taxInclusiveMode],
  );

  // Load service variants
  const loadServiceVariants = useCallback(async (serviceId: string) => {
    if (variantsFetchedRef.current.has(serviceId)) return;
    variantsFetchedRef.current.add(serviceId);
    
    try {
      setLoadingVariants(prev => ({ ...prev, [serviceId]: true }));
      const response = await fetcher.get<{ data: { variants: any[] } }>(
        `/api/provider/services/${serviceId}/variants`
      );
      const variants = response.data?.variants ?? [];
      setServiceVariants(prev => ({
        ...prev,
        [serviceId]: variants,
      }));
    } catch (error) {
      console.error("Error loading variants:", error);
      setServiceVariants(prev => ({ ...prev, [serviceId]: [] }));
      variantsFetchedRef.current.delete(serviceId);
    } finally {
      setLoadingVariants(prev => ({ ...prev, [serviceId]: false }));
    }
  }, []);
  
  // Load service addons
  const loadServiceAddons = useCallback(async (serviceId: string) => {
    if (addonsFetchedRef.current.has(serviceId)) return;
    addonsFetchedRef.current.add(serviceId);
    
    try {
      setLoadingAddons(prev => ({ ...prev, [serviceId]: true }));
      const response = await fetcher.get<{ data: { addons: any[] } }>(
        `/api/provider/services/${serviceId}/addons`
      );
      const addons = response.data?.addons ?? [];
      setServiceAddons(prev => ({
        ...prev,
        [serviceId]: addons,
      }));
    } catch (error) {
      console.error("Error loading addons:", error);
      addonsFetchedRef.current.delete(serviceId);
    } finally {
      setLoadingAddons(prev => ({ ...prev, [serviceId]: false }));
    }
  }, []);

  // Helper functions to manage services
  const addService = useCallback((service: ServiceItem, variantId?: string, variantName?: string) => {
    // Always create a new line item with unique ID, even for the same service
    const newService: AppointmentService = {
      id: `service-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // More unique ID
      serviceId: variantId || service.id,
      serviceName: variantName || service.name,
      duration: service.duration_minutes,
      price: service.price,
      customization: "",
      variantId: variantId,
      variantName: variantName,
      addons: [],
    };
    
    // Load addons for this service
    loadServiceAddons(service.id);
    
    setFormData(prev => {
      const newServices = [...prev.services, newService];
      // Provider-created appointments always have 0 service fee
      const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
      
      const tipToUse = prev.tipAmount;
      
      const pricing = calculatePricing(newServices, prev.products, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, tipToUse);
      return {
        ...prev,
        services: newServices,
        // Update main service fields for backward compatibility
        serviceId: newServices[0]?.serviceId || "",
        serviceName: newServices[0]?.serviceName || "",
        price: newServices[0]?.price || 0,
        duration: newServices.reduce((sum, s) => sum + s.duration + (s.addons?.reduce((a, ad) => a + ad.duration, 0) || 0), 0),
        subtotal: pricing.subtotal,
        serviceFeePercentage: mode === "create" ? 0 : prev.serviceFeePercentage, // Ensure it's set correctly
        serviceFeeAmount: pricing.serviceFeeAmount,
        taxAmount: pricing.taxAmount,
        tipAmount: tipToUse,
        totalAmount: pricing.totalAmount,
      };
    });
  }, [calculatePricing, loadServiceAddons, mode]);

  const removeService = useCallback((serviceId: string) => {
    setFormData(prev => {
      const newServices = prev.services.filter(s => s.id !== serviceId);
      // Provider-created appointments always have 0 service fee
      const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
      const pricing = calculatePricing(newServices, prev.products, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
      return {
        ...prev,
        services: newServices,
        // Update main service fields for backward compatibility
        serviceId: newServices[0]?.serviceId || "",
        serviceName: newServices[0]?.serviceName || "",
        price: newServices[0]?.price || 0,
        // Include addon durations, consistent with addAddonToService / removeAddonFromService
        duration: newServices.reduce((sum, s) => sum + s.duration + (s.addons?.reduce((a, ad) => a + ad.duration, 0) || 0), 0),
        subtotal: pricing.subtotal,
        taxAmount: pricing.taxAmount,
        totalAmount: pricing.totalAmount,
      };
    });
  }, [calculatePricing]);

  const addAddonToService = useCallback((serviceId: string, addon: { id: string; title?: string; name?: string; price: number; duration?: number }) => {
    setFormData(prev => {
      const newServices = prev.services.map(s => {
        if (s.id !== serviceId) return s;
        const newAddon = {
          id: `addon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          addonId: addon.id,
          addonName: addon.title || addon.name || "Addon",
          price: addon.price,
          duration: addon.duration ?? 0,
        };
        const addons = [...(s.addons || []), newAddon];
        return { ...s, addons };
      });
      const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
      const pricing = calculatePricing(newServices, prev.products, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
      return {
        ...prev,
        services: newServices,
        serviceId: newServices[0]?.serviceId || "",
        serviceName: newServices[0]?.serviceName || "",
        price: newServices[0]?.price || 0,
        duration: newServices.reduce((sum, s) => sum + s.duration + (s.addons?.reduce((a, ad) => a + ad.duration, 0) || 0), 0),
        subtotal: pricing.subtotal,
        taxAmount: pricing.taxAmount,
        totalAmount: pricing.totalAmount,
      };
    });
  }, [calculatePricing, mode]);

  const removeAddonFromService = useCallback((serviceId: string, addonId: string) => {
    setFormData(prev => {
      const newServices = prev.services.map(s => {
        if (s.id !== serviceId) return s;
        const addons = (s.addons || []).filter(a => a.id !== addonId);
        return { ...s, addons };
      });
      const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
      const pricing = calculatePricing(newServices, prev.products, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
      return {
        ...prev,
        services: newServices,
        serviceId: newServices[0]?.serviceId || "",
        serviceName: newServices[0]?.serviceName || "",
        price: newServices[0]?.price || 0,
        duration: newServices.reduce((sum, s) => sum + s.duration + (s.addons?.reduce((a, ad) => a + ad.duration, 0) || 0), 0),
        subtotal: pricing.subtotal,
        taxAmount: pricing.taxAmount,
        totalAmount: pricing.totalAmount,
      };
    });
  }, [calculatePricing, mode]);

  // Helper functions to manage products
  // variant: when product has variants, pass the selected variant for price and id
  const addProduct = useCallback((product: ProductItem, quantity: number = 1, variant?: { id: string; retail_price: number; option_values?: Record<string, string> }) => {
    const unitPrice = variant ? variant.retail_price : (product.retail_price ?? 0);
    const variantLabel = variant && variant.option_values ? Object.values(variant.option_values).join(" / ") : undefined;
    const newProduct: AppointmentProduct = {
      id: `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      productId: product.id,
      productName: product.name,
      productVariantId: variant?.id ?? null,
      productVariantName: variantLabel,
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
    };
    setFormData(prev => {
      const newProducts = [...prev.products, newProduct];
      // Provider-created appointments always have 0 service fee
      const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
      const pricing = calculatePricing(prev.services, newProducts, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
      return {
        ...prev,
        products: newProducts,
        subtotal: pricing.subtotal,
        taxAmount: pricing.taxAmount,
        totalAmount: pricing.totalAmount,
      };
    });
  }, [calculatePricing, mode]);

  const removeProduct = useCallback((productId: string) => {
    setFormData(prev => {
      const newProducts = prev.products.filter(p => p.id !== productId);
      // Provider-created appointments always have 0 service fee
      const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
      const pricing = calculatePricing(prev.services, newProducts, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
      return {
        ...prev,
        products: newProducts,
        subtotal: pricing.subtotal,
        taxAmount: pricing.taxAmount,
        totalAmount: pricing.totalAmount,
      };
    });
  }, [calculatePricing]);

  const updateProductQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeProduct(productId);
      return;
    }
    setFormData(prev => {
      const newProducts = prev.products.map(p => 
        p.id === productId 
          ? { ...p, quantity, totalPrice: p.unitPrice * quantity }
          : p
      );
      // Provider-created appointments always have 0 service fee
      const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
      const pricing = calculatePricing(prev.services, newProducts, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
      return {
        ...prev,
        products: newProducts,
        subtotal: pricing.subtotal,
        taxAmount: pricing.taxAmount,
        totalAmount: pricing.totalAmount,
      };
    });
  }, [removeProduct, calculatePricing]);

  // Invoice handlers
  const handlePrintInvoice = useCallback(async () => {
    if (!selectedAppointment) return;
    
    try {
      const bookingId = activeBookingId;
      
      if (!bookingId) {
        throw new Error("Appointment ID is missing");
      }
      
      const response = await fetch(`/api/provider/bookings/${bookingId}/receipt/pdf`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        let errorMessage = "Failed to generate invoice";
        try {
          const result = await response.json();
          if (result.error) {
            errorMessage = typeof result.error === "string" ? result.error : result.error.message || errorMessage;
          }
        } catch {
          errorMessage = `Failed to generate invoice (${response.status})`;
        }
        throw new Error(errorMessage);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const pdfWindow = window.open(url, "_blank");
      if (!pdfWindow) {
        const link = document.createElement("a");
        link.href = url;
        link.download = `invoice-${selectedAppointment.ref_number || bookingId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error("Failed to generate invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate invoice");
    }
  }, [selectedAppointment, activeBookingId]);

  const handleEmailInvoice = useCallback(async () => {
    if (!selectedAppointment) return;
    
    try {
      const bookingId = activeBookingId;
      
      if (!bookingId) {
        throw new Error("Appointment ID is missing");
      }
      
      // Use booking receipt send API (sends to booking's customer email)
      const response = await fetch(`/api/provider/bookings/${bookingId}/receipt/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        // Handle different error response formats
        let errorMessage = "Failed to send invoice";
        
        if (result.error) {
          if (typeof result.error === 'string') {
            errorMessage = result.error;
          } else if (result.error.message) {
            errorMessage = result.error.message;
          } else if (result.error.code) {
            errorMessage = `Error: ${result.error.code}`;
          }
        } else if (result.message) {
          errorMessage = result.message;
        }
        
        console.error("Send invoice API error:", { 
          bookingId, 
          status: response.status,
          statusText: response.statusText,
          result: result,
          error: result.error 
        });
        throw new Error(errorMessage);
      }
      
      toast.success("Receipt sent to customer");
    } catch (error) {
      console.error("Failed to send invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send invoice");
    }
  }, [selectedAppointment, activeBookingId]);



  // Initialize form when mode changes
  useEffect(() => {
    if (mode === "create" && draftSlot) {
      // Don't auto-select any service - let user choose
      const initialServices: AppointmentService[] = [];
      // Provider-created appointments should have 0 service fee
      // Use the loaded tax rate (defaultTaxRate should be loaded from provider settings)
      const pricing = calculatePricing(initialServices, [], 0, 0, defaultTaxRate, 0, 0);
      
      // Ensure staffId from draftSlot is always used (preserve it even if formData already has a value)
      const staffIdToUse = draftSlot.staffId || formData.staffId;
      
      // Resolve appointment kind from draft (Walk-in button passes "walk_in")
      const draftKind = draftSlot.appointmentKind;
      const initialKind = draftKind === "walk_in"
        ? AppointmentKind.WALK_IN
        : draftKind === "at_home"
          ? AppointmentKind.AT_HOME
          : AppointmentKind.IN_SALON;

      setFormData(_prev => ({
        clientName: draftSlot.prefillClientName || "",
        clientEmail: draftSlot.prefillClientEmail || "",
        clientPhone: draftSlot.prefillClientPhone || "",
        kind: initialKind,
        locationId: draftSlot.locationId || (locations[0]?.id ?? ""),
        staffId: staffIdToUse,
        date: draftSlot.date,
        startTime: draftSlot.startTime,
        duration: 60,
        serviceId: "",
        serviceName: "",
        price: 0,
        services: initialServices,
        products: [],
        notes: "",
        status: DEFAULT_APPOINTMENT_STATUS,
        subtotal: pricing.subtotal,
        discountAmount: 0,
        serviceFeePercentage: 0,
        serviceFeeAmount: 0,
        taxAmount: pricing.taxAmount,
        taxRate: defaultTaxRate,
        tipAmount: 0,
        totalAmount: pricing.totalAmount,
        addressLine1: "",
        addressLine2: "",
        addressCity: "",
        addressPostalCode: "",
        addressCountry: "",
        addressLatitude: null,
        addressLongitude: null,
        travelFee: 0,
        travelTimeOverride: null,
        travelFeeOverride: null,
        travelOverrideReason: "",
        hasTravelOverride: false,
        referralSourceId: "",
        clientId: draftSlot.prefillCustomerId || "",
        isRecurring: false,
        recurrencePattern: "weekly",
        recurrenceEndDate: "",
        paymentMethod: "pay_later",
      }));

      // Restore draft from localStorage if no explicit prefills
      if (!draftSlot.prefillCustomerId && !draftSlot.prefillClientName && !draftSlot.prefillServiceId) {
        try {
          const saved = localStorage.getItem(DRAFT_KEY);
          if (saved) {
            const draft = JSON.parse(saved) as Partial<CreateFormData>;
            if (draft.clientName || draft.services?.length || draft.notes) {
              setFormData(prev => ({
                ...prev,
                clientName: draft.clientName || prev.clientName,
                clientEmail: draft.clientEmail || prev.clientEmail,
                clientPhone: draft.clientPhone || prev.clientPhone,
                clientId: draft.clientId || prev.clientId,
                notes: draft.notes || prev.notes,
                services: draft.services?.length ? draft.services : prev.services,
                products: draft.products?.length ? draft.products : prev.products,
              }));
            }
          }
        } catch { /* ignore parse errors */ }
      }

      // If a customerId was prefilled, trigger client search to resolve the name
      if (draftSlot.prefillCustomerId) {
        fetcher.get<{ data: Array<{ id: string; full_name: string; email?: string; phone?: string }> }>(
          `/api/provider/clients?customer_id=${encodeURIComponent(draftSlot.prefillCustomerId)}`
        ).then((res) => {
          const client = res?.data?.[0];
          if (client) {
            setFormData(prev => ({
              ...prev,
              clientName: client.full_name || prev.clientName,
              clientEmail: client.email || prev.clientEmail,
              clientPhone: client.phone || prev.clientPhone,
              clientId: draftSlot.prefillCustomerId || prev.clientId,
            }));
          }
        }).catch(() => {});
      }
    } else if ((mode === "view" || mode === "edit") && selectedAppointment) {
      const bookingSource = (selectedAppointment as any).booking_source;
      const kind = selectedAppointment.location_type === "at_home"
        ? AppointmentKind.AT_HOME
        : bookingSource === "walk_in"
        ? AppointmentKind.WALK_IN
        : AppointmentKind.IN_SALON;
      
      // Extract travel override from metadata if present
      const metadata = (selectedAppointment as any).metadata;
      const travelOverride = metadata?.travelOverride;
      
      // Extract services from booking_services if available
      const bookingServices = (selectedAppointment as any).services || [];
      const appointmentServices: AppointmentService[] = bookingServices.length > 0
        ? bookingServices.map((bs: any, idx: number) => {
            // booking_services.price is the service price (not total_amount)
            // Use bs.price from booking_services, not selectedAppointment.price (which might be total_amount)
            const servicePrice = bs.price ?? selectedAppointment.price;
            
            return {
              id: `service-${idx}`,
              serviceId: bs.service_id || bs.offering_id || selectedAppointment.service_id,
              serviceName: bs.service_name || bs.services?.name || bs.services?.title || bs.offerings?.name || selectedAppointment.service_name,
              duration: bs.duration_minutes || selectedAppointment.duration_minutes,
              price: servicePrice,
              customization: bs.customization || "",
            };
          })
        : [{
            id: `service-0`,
            serviceId: selectedAppointment.service_id,
            serviceName: selectedAppointment.service_name,
            duration: selectedAppointment.duration_minutes,
            // Fallback: if no booking_services, use subtotal instead of price (price might be total_amount)
            // If subtotal is not available, calculate from total - tax - service_fee - tip - travel
            price: (selectedAppointment as any).subtotal || 
                   ((selectedAppointment.total_amount && (selectedAppointment as any).tax_amount)
                     ? selectedAppointment.total_amount 
                       - ((selectedAppointment as any).tax_amount || 0) 
                       - ((selectedAppointment as any).service_fee_amount || 0) 
                       - (selectedAppointment.tip_amount || 0)
                       - ((selectedAppointment as any).travel_fee || 0)
                     : (selectedAppointment as any).subtotal || selectedAppointment.price),
          }];
      
      // Extract products from booking_products if available on the appointment object
      const bookingProducts = (selectedAppointment as any).products || (selectedAppointment as any).booking_products || [];
      const appointmentProducts: AppointmentProduct[] = bookingProducts.map((bp: any, idx: number) => {
        const variantLabel = bp.product_variant?.option_values && typeof bp.product_variant.option_values === "object"
          ? Object.values(bp.product_variant.option_values).join(" / ")
          : undefined;
        return {
          id: `product-${idx}`,
          productId: bp.product_id || bp.id,
          productName: bp.product_name || bp.product?.name || bp.name || "Product",
          productVariantId: bp.product_variant_id ?? null,
          productVariantName: variantLabel,
          quantity: bp.quantity || 1,
          unitPrice: bp.unit_price || bp.price || bp.product?.price || 0,
          totalPrice: bp.total_price || (bp.quantity || 1) * (bp.unit_price || bp.price || bp.product?.price || 0),
        };
      });
      
      const travelFee = selectedAppointment.travel_fee || 0;
      const discountAmount = selectedAppointment.discount_amount || 0;
      
      // In VIEW mode, use stored values from database; in EDIT mode, recalculate
      const useStoredValues = mode === "view";
      const storedSubtotal = (selectedAppointment as any).subtotal;
      // Try multiple property names for tax_amount (in case of different API response formats)
      // Also check if it's a string that needs parsing
      let storedTaxAmount = 0;
      const taxAmountRaw = (selectedAppointment as any).tax_amount || 
                          (selectedAppointment as any).taxAmount || 
                          selectedAppointment.tax_amount;
      if (taxAmountRaw !== undefined && taxAmountRaw !== null) {
        storedTaxAmount = typeof taxAmountRaw === 'string' ? parseFloat(taxAmountRaw) : taxAmountRaw;
      }
      
      const storedTotalAmount = selectedAppointment.total_amount || 0;
      const tipAmount = selectedAppointment.tip_amount || 0;
      
      // Calculate tax_rate from tax_amount if stored tax_rate is 0 or missing
      let storedTaxRate = (selectedAppointment as any).tax_rate;
      if (!storedTaxRate || storedTaxRate === 0) {
        // Calculate tax rate from tax_amount and subtotal
        // Round to 2 decimal places to avoid long decimals like 14.994934143870314%
        if (storedSubtotal > 0 && storedTaxAmount > 0) {
          storedTaxRate = Math.round((storedTaxAmount / storedSubtotal) * 10000) / 10000; // Round to 4 decimal places (0.0001 precision)
        } else {
          // Fallback: Use component default (which is loaded from provider settings)
          // If defaultTaxRate is still 0.15 (default), it will be updated when settings load
          storedTaxRate = defaultTaxRate;
        }
      } else {
        storedTaxRate = typeof storedTaxRate === 'string' 
          ? parseFloat(storedTaxRate) / 100 
          : storedTaxRate / 100; // Convert percentage to decimal
      }
      
      // If tax rate is still 0 or default, use provider settings (will be updated when settings load)
      if (storedTaxRate === 0 || storedTaxRate === 0.15) {
        storedTaxRate = defaultTaxRate;
      }
      
      // Calculate service_fee_amount if missing (backward compatibility)
      let storedServiceFeeAmount = (selectedAppointment as any).service_fee_amount || 0;
      let storedServiceFeePercentage = (selectedAppointment as any).service_fee_percentage;
      if (!storedServiceFeePercentage || storedServiceFeePercentage === 0) {
        // Fallback: Use component default (which is loaded from API on mount)
        storedServiceFeePercentage = defaultServiceFeePercentage;
      } else {
        storedServiceFeePercentage = storedServiceFeePercentage / 100; // Convert percentage to decimal
      }
      
      // If service_fee_amount is 0 but total includes it, calculate it
      // Priority: Calculate from total first (to match stored total), then use percentage if needed
      if (storedServiceFeeAmount === 0 && storedSubtotal && storedTotalAmount) {
        const afterDiscount = storedSubtotal - discountAmount;
        
        // First priority: Calculate from total if we have tax amount
        // This ensures we match the actual stored total_amount exactly
        if (storedTaxAmount > 0) {
          // service_fee = total - subtotal - tax - tip - travel
          const calculatedServiceFee = storedTotalAmount - storedSubtotal - storedTaxAmount - tipAmount - travelFee;
          if (calculatedServiceFee > 0) {
            storedServiceFeeAmount = calculatedServiceFee;
          }
        }
        
        // Second priority: If we couldn't calculate from total, use percentage method
        if (storedServiceFeeAmount === 0 && storedServiceFeePercentage > 0 && afterDiscount > 0) {
          storedServiceFeeAmount = afterDiscount * storedServiceFeePercentage;
        }
        
        // Last resort: Calculate from total without tax (if tax is missing)
        if (storedServiceFeeAmount === 0 && storedTaxAmount === 0) {
          const calculatedServiceFee = storedTotalAmount - storedSubtotal - tipAmount - travelFee;
          if (calculatedServiceFee > 0) {
            storedServiceFeeAmount = calculatedServiceFee;
          }
        }
      }
      
      const storedBookingSource = (selectedAppointment as any).booking_source;
      const isWalkIn = !storedBookingSource || storedBookingSource === 'walk_in';
      
      // Use 0 service fee for walk-in appointments, otherwise use stored values
      const effectiveServiceFeePercentage = isWalkIn ? 0 : storedServiceFeePercentage;
      const effectiveServiceFeeAmount = isWalkIn ? 0 : storedServiceFeeAmount;
      
      // Calculate pricing only if we need to (EDIT mode or missing stored values)
      const pricing = useStoredValues && storedSubtotal !== undefined
        ? {
            subtotal: storedSubtotal,
            taxAmount: storedTaxAmount,
            serviceFeeAmount: effectiveServiceFeeAmount,
            totalAmount: storedTotalAmount,
          }
        : calculatePricing(appointmentServices, appointmentProducts, travelFee, discountAmount, storedTaxRate, effectiveServiceFeePercentage, tipAmount);
      
      setFormData({
        clientName: selectedAppointment.client_name,
        clientEmail: selectedAppointment.client_email || "",
        clientPhone: selectedAppointment.client_phone || "",
        kind,
        locationId: selectedAppointment.location_id || "",
        staffId: selectedAppointment.team_member_id || "",
        date: selectedAppointment.scheduled_date,
        startTime: selectedAppointment.scheduled_time,
        duration: selectedAppointment.duration_minutes,
        serviceId: selectedAppointment.service_id,
        serviceName: selectedAppointment.service_name,
        price: selectedAppointment.price,
        services: appointmentServices,
        products: appointmentProducts,
        notes: selectedAppointment.notes || "",
        status: selectedAppointment.status || DEFAULT_APPOINTMENT_STATUS,
        subtotal: pricing.subtotal,
        discountAmount,
        discountCode: (selectedAppointment as any).discount_code,
        discountReason: (selectedAppointment as any).discount_reason,
        serviceFeePercentage: effectiveServiceFeePercentage,
        serviceFeeAmount: pricing.serviceFeeAmount,
        taxAmount: pricing.taxAmount,
        taxRate: storedTaxRate,
        tipAmount,
        totalAmount: pricing.totalAmount,
        addressLine1: selectedAppointment.address_line1 || "",
        addressLine2: selectedAppointment.address_line2 || "",
        addressCity: selectedAppointment.address_city || "",
        addressPostalCode: selectedAppointment.address_postal_code || "",
        addressCountry: (selectedAppointment as any).address_country || "",
        addressLatitude: (selectedAppointment as any).address_latitude ?? null,
        addressLongitude: (selectedAppointment as any).address_longitude ?? null,
        travelFee,
        travelTimeOverride: travelOverride?.overrideTravelMinutes ?? null,
        travelFeeOverride: travelOverride?.overrideTravelFee ?? null,
        travelOverrideReason: travelOverride?.reason || "",
        hasTravelOverride: !!travelOverride,
        referralSourceId: (selectedAppointment as any).referral_source_id ?? "",
        clientId: selectedAppointment.client_id || "",
        isRecurring: false,
        recurrencePattern: "weekly",
        recurrenceEndDate: "",
        paymentMethod: (selectedAppointment as any).payment_method || "pay_later",
      });

      // Hydrate package_id from existing booking when editing
      if ((selectedAppointment as any).package_id) {
        setSelectedPackageId((selectedAppointment as any).package_id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- services deliberately excluded to prevent form reset when catalog loads
  }, [mode, draftSlot, selectedAppointment, locations, calculatePricing, defaultTaxRate]);

  // Ensure staffId from draftSlot is always set when in create mode
  // This is a separate effect to ensure it's set even if services haven't loaded yet
  useEffect(() => {
    if (mode === "create" && draftSlot?.staffId) {
      setFormData(prev => {
        // Only update if staffId is different to avoid unnecessary re-renders
        if (prev.staffId !== draftSlot.staffId) {
          return {
            ...prev,
            staffId: draftSlot.staffId,
          };
        }
        return prev;
      });
    }
  }, [mode, draftSlot?.staffId]);

  // Update service when selected
  const _handleServiceChange = useCallback((serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    if (service) {
      setFormData(prev => ({
        ...prev,
        serviceId: service.id,
        serviceName: service.name,
        price: service.price,
        duration: service.duration_minutes,
      }));
    }
  }, [services]);

  // Compute travel fee when address or geocoded coordinates change
  useEffect(() => {
    if (formData.kind !== AppointmentKind.AT_HOME) return;
    if (!formData.addressPostalCode && !formData.addressLatitude) return;

    // Resolve salon/location coordinates for distance-based fee
    const selectedLocation = (locations || []).find((l) => l.id === formData.locationId);
    const baseCoords =
      selectedLocation?.latitude != null && selectedLocation?.longitude != null
        ? { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }
        : null;

    const clientAddr = {
      line1: formData.addressLine1,
      line2: formData.addressLine2,
      city: formData.addressCity,
      postalCode: formData.addressPostalCode,
      ...(formData.addressLatitude != null && formData.addressLongitude != null
        ? { coordinates: { latitude: formData.addressLatitude, longitude: formData.addressLongitude } }
        : {}),
    };

    const result = computeTravelFee(baseCoords, clientAddr);
    if (result.fee >= 0) {
      setFormData(prev => {
        const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
        const pricing = calculatePricing(prev.services, prev.products, result.fee, prev.discountAmount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
        return {
          ...prev,
          travelFee: result.fee,
          totalAmount: pricing.totalAmount,
        };
      });
    }
  }, [formData.kind, formData.addressPostalCode, formData.addressLine1, formData.addressLine2, formData.addressCity, formData.addressLatitude, formData.addressLongitude, formData.locationId, locations, calculatePricing, mode]);

  // Handle create appointment
  const handleCreate = async () => {
    if (!formData.clientName || (formData.services.length === 0 && !formData.serviceId)) {
      toast.error("Please fill in all required fields and add at least one service");
      return;
    }
    if (!formData.staffId) {
      toast.error("Please select a staff member for this appointment");
      return;
    }

    if (formData.isRecurring) {
      if (!formData.clientId?.trim()) {
        toast.error(
          "Repeating visits must use a saved client. Select the client from search results or create a new client."
        );
        return;
      }
      if (!isLikelyUuid(formData.clientId)) {
        toast.error(
          "Repeating visits need a customer profile with a valid ID. Select the client from search or create a new client."
        );
        return;
      }
    }

    setSaving(true);
    try {
      const appointmentData: Partial<Appointment> = {
        client_name: formData.clientName,
        client_email: formData.clientEmail || undefined,
        client_phone: formData.clientPhone || undefined,
        client_id: formData.clientId?.trim() || undefined,
        service_id: formData.serviceId, // Keep for backward compatibility
        service_name: formData.serviceName, // Keep for backward compatibility
        team_member_id: formData.staffId,
        team_member_name: (teamMembers || []).find(m => m.id === formData.staffId)?.name || "",
        scheduled_date: formData.date,
        scheduled_time: formData.startTime,
        duration_minutes: formData.duration,
        price: formData.price, // Keep for backward compatibility
        status: DEFAULT_APPOINTMENT_STATUS,
        notes: formData.notes || undefined,
        location_type: formData.kind === AppointmentKind.AT_HOME ? "at_home" : "at_salon",
        location_id: formData.locationId || undefined,
        location_name: (salonLocations || []).find(l => l.id === formData.locationId)?.name,
        // Pricing breakdown
        subtotal: formData.subtotal,
        discount_amount: formData.discountAmount,
        discount_code: formData.discountCode,
        discount_reason: formData.discountReason,
        tax_amount: formData.taxAmount,
        tip_amount: formData.tipAmount,
        total_amount: formData.totalAmount,
      } as any;

      // Add non-standard fields and arrays
      (appointmentData as any).tax_rate = formData.taxRate;
      // Service fees should only apply to client portal bookings, not provider-created appointments
      // Provider-created appointments (walk-in, in-salon) should have 0 service fee
      (appointmentData as any).service_fee_percentage = 0;
      (appointmentData as any).service_fee_amount = 0;
      (appointmentData as any).service_fee_paid_by = 'customer';
      (appointmentData as any).services = formData.services;
      (appointmentData as any).products = formData.products;
      (appointmentData as any).booking_source = formData.kind === AppointmentKind.WALK_IN ? 'walk_in' : 'provider';
      (appointmentData as any).referral_source_id = formData.referralSourceId || null;
      (appointmentData as any).payment_method = formData.paymentMethod || 'pay_later';
      (appointmentData as any).send_notification = sendNotification;
      // Package id — set when appointment was built from a package
      (appointmentData as any).package_id = selectedPackageId || null;

      // Deposit fields — when provider chooses to collect deposit only
      if (collectDeposit && depositSettings.required && formData.totalAmount > 0) {
        const depositAmount = Math.ceil((formData.totalAmount * depositSettings.percentage) / 100);
        (appointmentData as any).deposit_required = true;
        (appointmentData as any).deposit_percentage = depositSettings.percentage;
        (appointmentData as any).deposit_amount = depositAmount;
        (appointmentData as any).payment_option = "deposit";
      }

      // Add at-home fields if applicable
      if (formData.kind === AppointmentKind.AT_HOME) {
        appointmentData.address_line1 = formData.addressLine1;
        appointmentData.address_line2 = formData.addressLine2 || undefined;
        appointmentData.address_city = formData.addressCity;
        appointmentData.address_postal_code = formData.addressPostalCode;
        (appointmentData as any).address_country = formData.addressCountry || undefined;
        (appointmentData as any).address_latitude = formData.addressLatitude;
        (appointmentData as any).address_longitude = formData.addressLongitude;
        appointmentData.travel_fee = formData.travelFee;
      }

      if (formData.isRecurring && formData.clientId?.trim()) {
        const addonPriceSum = (addons?: AppointmentService["addons"]) =>
          addons?.reduce((sum, a) => sum + a.price, 0) || 0;
        const addonDurationSum = (addons?: AppointmentService["addons"]) =>
          addons?.reduce((sum, a) => sum + a.duration, 0) || 0;
        const cart_items = [
          ...formData.services.map((s) => ({
            id: s.id,
            type: "service" as const,
            name: s.serviceName,
            quantity: 1,
            unit_price: s.price,
            total: s.price + addonPriceSum(s.addons),
            service_id: s.serviceId,
            duration_minutes: s.duration + addonDurationSum(s.addons),
          })),
          ...formData.products.map((p) => ({
            id: p.id,
            type: "product" as const,
            name: p.productName,
            quantity: p.quantity,
            unit_price: p.unitPrice,
            total: p.totalPrice,
            product_id: p.productId,
          })),
        ];
        (appointmentData as any).cart_items = cart_items;

        const recurrenceRule = {
          pattern: formData.recurrencePattern,
          interval: formData.recurrencePattern === "biweekly" ? 2 : 1,
          end_date: formData.recurrenceEndDate || undefined,
        };

        try {
          await providerApi.createRecurringAppointment({
            ...appointmentData,
            client_id: formData.clientId.trim(),
            recurrence_rule: recurrenceRule,
          } as any);
          toast.success("Repeating visit series created");
        } catch (recErr) {
          console.error("Failed to create recurring series, falling back to single booking:", recErr);
          const recurringReason = formatApiErrorMessage(recErr, "Unknown error");
          const shortReason =
            recurringReason.length > 160 ? `${recurringReason.slice(0, 157)}…` : recurringReason;
          try {
            await providerApi.createAppointment(appointmentData as any);
            toast.success(
              `Appointment booked once. Repeating schedule was not created: ${shortReason}`
            );
          } catch (singleErr) {
            throw singleErr;
          }
        }
      } else {
        const created = await providerApi.createAppointment(appointmentData as any);
        onAppointmentCreated?.(created);
        // Surface resource allocation warnings if present
        const warnings = (created as any)?._warnings as string[] | undefined;
        if (warnings?.length) {
          toast.warning(warnings.join(" "), { duration: 8000 });
        } else {
          toast.success("Appointment created successfully");
        }
      }

      clearDraft();
      onRefresh?.();
      closeSidebar();
    } catch (error) {
      console.error("Failed to create appointment:", error);
      toast.error(
        formatApiErrorMessage(error, "Failed to create appointment") +
          subscriptionUpgradeHint(error)
      );
    } finally {
      setSaving(false);
    }
  };
  handleCreateRef.current = handleCreate;

  // Handle update appointment
  const handleUpdate = async () => {
    if (!selectedAppointment) return;

    setSaving(true);
    try {
      const updates: Partial<Appointment> = {
        client_name: formData.clientName,
        client_email: formData.clientEmail || undefined,
        client_phone: formData.clientPhone || undefined,
        service_id: formData.serviceId, // Keep for backward compatibility
        service_name: formData.serviceName, // Keep for backward compatibility
        team_member_id: formData.staffId,
        team_member_name: (teamMembers || []).find(m => m.id === formData.staffId)?.name || "",
        scheduled_date: formData.date,
        scheduled_time: formData.startTime,
        duration_minutes: formData.duration,
        price: formData.price, // Keep for backward compatibility
        notes: formData.notes || undefined,
        location_type: formData.kind === AppointmentKind.AT_HOME ? "at_home" : "at_salon",
        // Pricing breakdown
        subtotal: formData.subtotal,
        discount_amount: formData.discountAmount,
        discount_code: formData.discountCode,
        discount_reason: formData.discountReason,
        tax_amount: formData.taxAmount,
        tip_amount: formData.tipAmount,
        total_amount: formData.totalAmount,
      } as any;
      
      // Add non-standard fields and arrays
      (updates as any).tax_rate = formData.taxRate;
      // Service fees should only apply to client portal bookings, not provider-created appointments
      // If updating an existing appointment that was created via provider, keep service fee at 0
      // Only preserve service fee if it was originally from client portal (check if it exists and > 0)
      const existingServiceFee = (selectedAppointment as any).service_fee_amount || 0;
      const editBookingSource = (selectedAppointment as any).booking_source;
      if (existingServiceFee > 0 && editBookingSource === 'online') {
        // Preserve existing service fee if it was from client portal booking
        (updates as any).service_fee_percentage = formData.serviceFeePercentage;
        (updates as any).service_fee_amount = formData.serviceFeeAmount;
      } else {
        // Walk-in appointments should have 0 service fee
        (updates as any).service_fee_percentage = 0;
        (updates as any).service_fee_amount = 0;
      }
      (updates as any).service_fee_paid_by = 'customer';
      (updates as any).services = formData.services;
      (updates as any).products = formData.products;
      // Package id — carry forward if it was set from a package or changed
      if (selectedPackageId !== null) {
        (updates as any).package_id = selectedPackageId;
      }

      // Include version for optimistic locking if available
      if ((selectedAppointment as any).version !== undefined) {
        (updates as any).version = (selectedAppointment as any).version;
      }

      // Always send location_id so it is preserved / updated correctly on PATCH
      (updates as any).location_id = formData.locationId || null;

      // Add status if changed
      if (formData.status && formData.status !== selectedAppointment.status) {
        updates.status = formData.status as Appointment["status"];
      }

      // Add at-home fields
      if (formData.kind === AppointmentKind.AT_HOME) {
        updates.address_line1 = formData.addressLine1;
        updates.address_line2 = formData.addressLine2 || undefined;
        updates.address_city = formData.addressCity;
        updates.address_postal_code = formData.addressPostalCode;
        (updates as any).address_country = formData.addressCountry || undefined;
        (updates as any).address_latitude = formData.addressLatitude;
        (updates as any).address_longitude = formData.addressLongitude;
        updates.travel_fee = formData.travelFee;
      }
      (updates as any).referral_source_id = formData.referralSourceId || null;

      // Check if time/date changed for notification
      const timeChanged = 
        selectedAppointment.scheduled_date !== formData.date ||
        selectedAppointment.scheduled_time !== formData.startTime;

      await providerApi.updateAppointment(activeBookingId, updates);
      
      // Send reschedule notification if enabled and time changed (API route to avoid server-only imports)
      if (sendNotification && timeChanged) {
        try {
          const res = await fetch(`/api/provider/bookings/${activeBookingId}/notify-reschedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              old_date: selectedAppointment.scheduled_date,
              old_time: selectedAppointment.scheduled_time,
              new_date: formData.date,
              new_time: formData.startTime,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || "Failed to send notification");
          }
        } catch (e) {
          console.error("Failed to send notification:", e);
        }
      }

      toast.success("Appointment updated successfully");
      // Merge updates with selectedAppointment, ensuring team_member fields are included
      const updatedAppointment = { 
        ...selectedAppointment, 
        ...updates,
        team_member_id: formData.staffId,
        team_member_name: (teamMembers || []).find(m => m.id === formData.staffId)?.name || "",
      } as Appointment;
      // Update selectedAppointment locally first so view mode has the correct data
      updateSelectedAppointment?.(updatedAppointment);
      onAppointmentUpdated?.(updatedAppointment);
      onRefresh?.();
      // Use setTimeout to ensure state update has propagated before switching to view mode
      setTimeout(() => {
        switchToViewMode();
      }, 0);
    } catch (error: unknown) {
      console.error("Failed to update appointment:", error);
      toast.error(formatApiErrorMessage(error, "Failed to update appointment"));
    } finally {
      setSaving(false);
    }
  };

  // Handle status change
  const handleStatusChange = async (newStatus: AppointmentStatus) => {
    if (!selectedAppointment) return;

    setSaving(true);
    const previousAppointment = { ...selectedAppointment };
    try {
      const dbStatus = unmapStatus(newStatus);

      if (newStatus === AppointmentStatus.IN_SERVICE) {
        const result = await providerApi.startService(activeBookingId);
        updateSelectedAppointment({ ...selectedAppointment, ...result, status: "in_progress" });
        onAppointmentUpdated?.({ ...selectedAppointment, ...result, status: "in_progress" });
        onRefresh?.();
        toast.success("Service started");
        setSaving(false);
        return;
      }

      if (newStatus === AppointmentStatus.COMPLETED) {
        const result = await providerApi.completeService(activeBookingId);
        updateSelectedAppointment({ ...selectedAppointment, ...result, status: "completed" });
        onAppointmentUpdated?.({ ...selectedAppointment, ...result, status: "completed" });
        onRefresh?.();
        toast.success("Appointment completed");
        if (selectedAppointment?.id && selectedAppointment?.client_id) {
          try {
            const ratingCheck = await fetch(`/api/provider/ratings?booking_id=${activeBookingId}`);
            if (ratingCheck.ok) {
              const ratingData = await ratingCheck.json();
              if (!ratingData.data?.has_rating) {
                setShowRatingDialog(true);
              }
            } else {
              setShowRatingDialog(true);
            }
          } catch {
            setShowRatingDialog(true);
          }
        }
        setSaving(false);
        return;
      }

      const updatePayload: Record<string, any> = { status: dbStatus };

      // Client Arrived: set current_stage so the UI and calendar reflect WAITING state
      if (newStatus === AppointmentStatus.WAITING) {
        updatePayload.current_stage = "client_arrived";
      }

      const updated = { ...selectedAppointment, status: dbStatus, ...updatePayload };
      // Optimistic update so the UI feels instant.
      updateSelectedAppointment(updated);
      onAppointmentUpdated?.(updated);

      await providerApi.updateAppointment(activeBookingId, {
        ...updatePayload,
        ...(newStatus === AppointmentStatus.WAITING && sendNotification && { send_arrival_notification: true }),
      } as any);

      onRefresh?.();
      
      // Show user-friendly success messages
      let successMessage = "";
      switch (newStatus) {
        case AppointmentStatus.WAITING:
          successMessage = "Client marked as arrived";
          break;
        case AppointmentStatus.CONFIRMED:
          successMessage = "Appointment confirmed";
          break;
        case AppointmentStatus.UNCONFIRMED:
          successMessage = "Appointment unconfirmed";
          break;
        case AppointmentStatus.CANCELED:
          successMessage = "Appointment cancelled";
          break;
        case AppointmentStatus.NO_SHOW:
          successMessage = "Marked as no-show";
          break;
        default:
          successMessage = `Status changed to ${statusColors?.label || newStatus}`;
      }
      toast.success(successMessage);
    } catch (error) {
      console.error("Failed to update status:", error);
      // Revert optimistic state when request fails.
      updateSelectedAppointment(previousAppointment);
      onAppointmentUpdated?.(previousAppointment);
      toast.error("Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = async () => {
    if (!selectedAppointment) return;

    setSaving(true);
    try {
      await providerApi.updateAppointment(activeBookingId, {
        status: "cancelled",
        cancellation_reason: cancelReason,
      });

      if (sendNotification) {
        try {
          const res = await fetch(`/api/provider/bookings/${activeBookingId}/notify-cancellation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cancellation_type: cancelReason }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || "Failed to send notification");
          }
        } catch (e) {
          console.error("Failed to send cancellation notification:", e);
        }
      }

      toast.success("Appointment cancelled");
      onAppointmentUpdated?.({ ...selectedAppointment, status: "cancelled" });
      onRefresh?.();
      closeSidebar();
    } catch (error) {
      console.error("Failed to cancel appointment:", error);
      toast.error("Failed to cancel appointment");
    } finally {
      setSaving(false);
      setShowCancelDialog(false);
    }
  };

  // Handle un-cancel
  const handleUncancel = async () => {
    if (!selectedAppointment) return;

    setSaving(true);
    try {
      await providerApi.updateAppointment(activeBookingId, {
        status: "pending",
        cancellation_reason: undefined,
      });

      toast.success("Appointment restored");
      onAppointmentUpdated?.({ ...selectedAppointment, status: "pending" });
      onRefresh?.();
    } catch (error) {
      console.error("Failed to restore appointment:", error);
      toast.error("Failed to restore appointment");
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedAppointment) return;

    setSaving(true);
    try {
      await providerApi.deleteAppointment(activeBookingId);
      toast.success("Appointment deleted");
      onAppointmentDeleted?.(activeBookingId);
      onRefresh?.();
      closeSidebar();
    } catch (error) {
      console.error("Failed to delete appointment:", error);
      toast.error("Failed to delete appointment");
    } finally {
      setSaving(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle resend notification
  const handleResendNotification = async (type: "confirmation" | "reminder") => {
    if (!selectedAppointment) {
      toast.error("No appointment selected");
      return;
    }

    try {
      const res = await fetch(`/api/provider/bookings/${activeBookingId}/notify-resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json().catch(() => ({}));
      const result = res.ok && json?.data
        ? { success: json.data.success, sent: json.data.sent, error: json.data.error }
        : { success: false, sent: false, error: json?.error?.message || "Failed to send" };
      if (result.success) {
        const message = type === "confirmation" 
          ? "Confirmation notification sent successfully" 
          : "Reminder notification sent successfully";
        toast.success(message);
      } else {
        const errorMessage = result.error || "Failed to send notification";
        toast.error(errorMessage);
        console.error("Notification error:", errorMessage);
      }
    } catch (error) {
      console.error("Failed to send notification:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to send notification";
      toast.error(errorMessage);
    }
  };

  const mangomintStatus = selectedAppointment ? mapStatus(selectedAppointment) : null;
  const statusColors = mangomintStatus ? getStatusColors(mangomintStatus) : null;
  const isCanceled = selectedAppointment?.status === "cancelled";

  return (
    <>
      {/* Overlay - Full screen for all devices */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}
      
      {/* Centered modal */}
      <div className={cn(
        "fixed z-[101] bg-white shadow-2xl overflow-hidden box-border",
        "transition-all duration-300 ease-out",
        "flex flex-col",
        // Mobile: bottom sheet
        "w-[100vw] max-w-[100vw] h-[95vh] max-h-[95vh]",
        "bottom-0 left-0 right-0 rounded-t-3xl",
        // Desktop: centered modal with safe padding from viewport edges
        "sm:w-[min(90vw,600px)] sm:max-w-[600px] sm:h-[min(90vh,800px)] sm:max-h-[800px]",
        "sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
        "sm:bottom-auto sm:right-auto sm:rounded-2xl",
        isOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none",
        isOpen && "animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:fade-in-0 sm:zoom-in-95 duration-300"
      )}>
        {/* Header */}
        <div className="flex flex-col flex-shrink-0 z-10">
          <div className={cn(
            "h-1 w-full",
            mode === "create" ? "bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600" : mode === "edit" ? "bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" : "bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600",
          )} />
          <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {mode === "create" ? "New Appointment" : formData.clientName || "Appointment"}
              </h2>
              {mode === "create" && formData.services.length > 0 && (
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {formData.services.length} service{formData.services.length !== 1 ? "s" : ""} · {formData.services.reduce((sum, s) => sum + s.duration + (s.addons?.reduce((a, ad) => a + ad.duration, 0) || 0), 0)} min · {formatMoney(formData.totalAmount)}
                </p>
              )}
            </div>
            {mode === "view" && selectedAppointment && mangomintStatus && statusColors && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "text-xs px-2 py-1 rounded-md border transition-colors",
                      "hover:opacity-80 cursor-pointer",
                      statusColors.badgeClasses
                    )}
                  >
                    {statusColors.label}
                    <ChevronDown className="w-3 h-3 inline-block ml-1" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 z-[110]">
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(AppointmentStatus.CONFIRMED);
                    }}
                    className={mangomintStatus === AppointmentStatus.CONFIRMED ? "bg-gray-50" : ""}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2" />
                    Confirmed
                    {mangomintStatus === AppointmentStatus.CONFIRMED && (
                      <Check className="w-4 h-4 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(AppointmentStatus.UNCONFIRMED);
                    }}
                    className={mangomintStatus === AppointmentStatus.UNCONFIRMED ? "bg-gray-50" : ""}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2" />
                    Pending
                    {mangomintStatus === AppointmentStatus.UNCONFIRMED && (
                      <Check className="w-4 h-4 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(AppointmentStatus.WAITING);
                    }}
                    className={mangomintStatus === AppointmentStatus.WAITING ? "bg-gray-50" : ""}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-500 mr-2" />
                    Waiting
                    {mangomintStatus === AppointmentStatus.WAITING && (
                      <Check className="w-4 h-4 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(AppointmentStatus.IN_SERVICE);
                    }}
                    className={mangomintStatus === AppointmentStatus.IN_SERVICE ? "bg-gray-50" : ""}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-pink-500 mr-2" />
                    In Service
                    {mangomintStatus === AppointmentStatus.IN_SERVICE && (
                      <Check className="w-4 h-4 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(AppointmentStatus.COMPLETED);
                    }}
                    className={mangomintStatus === AppointmentStatus.COMPLETED ? "bg-gray-50" : ""}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-2" />
                    Completed
                    {mangomintStatus === AppointmentStatus.COMPLETED && (
                      <Check className="w-4 h-4 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(AppointmentStatus.CANCELED);
                    }}
                    className={mangomintStatus === AppointmentStatus.CANCELED ? "bg-gray-50" : ""}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-400 mr-2" />
                    Cancelled
                    {mangomintStatus === AppointmentStatus.CANCELED && (
                      <Check className="w-4 h-4 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(AppointmentStatus.NO_SHOW);
                    }}
                    className={mangomintStatus === AppointmentStatus.NO_SHOW ? "bg-gray-50" : ""}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2" />
                    No Show
                    {mangomintStatus === AppointmentStatus.NO_SHOW && (
                      <Check className="w-4 h-4 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {mode === "view" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={switchToEditMode}
              >
                <Edit className="w-4 h-4 text-gray-500" />
              </Button>
            )}
            {(mode === "view" || mode === "edit") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="w-4 h-4 text-gray-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 z-[110]">
                  {!isCanceled ? (
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => setShowCancelDialog(true)}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel Appointment
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={handleUncancel}>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Un-cancel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleResendNotification("confirmation")}>
                    <Send className="w-4 h-4 mr-2" />
                    Resend Confirmation
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleResendNotification("reminder")}>
                    <Bell className="w-4 h-4 mr-2" />
                    Send Reminder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handlePrintInvoice}>
                    <Printer className="w-4 h-4 mr-2" />
                    Print Receipt
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleEmailInvoice}>
                    <Mail className="w-4 h-4 mr-2" />
                    Email Receipt
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeSidebar}>
              <X className="w-4 h-4 text-gray-500" />
            </Button>
          </div>
        </div>
        </div>

        {/* Content - Scrollable Area */}
        <div className="flex-1 min-h-0 overflow-hidden box-border relative min-w-0">
          <ScrollArea className="absolute inset-0 w-full h-full box-border">
            <div className="p-3 sm:p-4 pb-6 sm:pb-5 space-y-3 sm:space-y-4 box-border w-full max-w-full overflow-x-hidden min-w-0">
            {/* Status Actions — Workflow Progression (VIEW mode only) */}
            {mode === "view" && selectedAppointment && !isCanceled && (
              <div className="space-y-3 min-w-0">
                {/* Workflow Progress Steps */}
                {(() => {
                  const isAtHome = selectedAppointment.location_type === "at_home";
                  const steps = isAtHome
                    ? [
                        { key: "confirmed", label: "Confirmed", done: [AppointmentStatus.CONFIRMED, AppointmentStatus.WAITING, AppointmentStatus.IN_SERVICE, AppointmentStatus.COMPLETED].includes(mangomintStatus!) },
                        { key: "in_service", label: "In Service", done: [AppointmentStatus.IN_SERVICE, AppointmentStatus.COMPLETED].includes(mangomintStatus!) },
                        { key: "completed", label: "Completed", done: mangomintStatus === AppointmentStatus.COMPLETED },
                      ]
                    : [
                        { key: "confirmed", label: "Confirmed", done: [AppointmentStatus.CONFIRMED, AppointmentStatus.WAITING, AppointmentStatus.IN_SERVICE, AppointmentStatus.COMPLETED].includes(mangomintStatus!) },
                        { key: "arrived", label: "Arrived", done: [AppointmentStatus.WAITING, AppointmentStatus.IN_SERVICE, AppointmentStatus.COMPLETED].includes(mangomintStatus!) },
                        { key: "in_service", label: "In Service", done: [AppointmentStatus.IN_SERVICE, AppointmentStatus.COMPLETED].includes(mangomintStatus!) },
                        { key: "completed", label: "Completed", done: mangomintStatus === AppointmentStatus.COMPLETED },
                      ];
                  return (
                    <div className="flex items-center gap-1 px-1">
                      {steps.map((step, i) => (
                        <div key={step.key} className="flex items-center gap-1 flex-1">
                          <div className={cn(
                            "flex-1 h-1.5 rounded-full transition-all",
                            step.done ? "bg-emerald-500" : "bg-gray-200",
                          )} />
                          {i < steps.length - 1 && <div className="w-0.5" />}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Next Action Button */}
                {(() => {
                  const isAtHome = selectedAppointment.location_type === "at_home";
                  if (mangomintStatus === AppointmentStatus.COMPLETED) return null;
                  
                  const nextAction = !isAtHome && mangomintStatus === AppointmentStatus.CONFIRMED
                    ? { status: AppointmentStatus.WAITING, label: "Client Arrived", icon: User, color: "purple" as const }
                    : mangomintStatus === AppointmentStatus.WAITING || (isAtHome && mangomintStatus === AppointmentStatus.CONFIRMED)
                    ? { status: AppointmentStatus.IN_SERVICE, label: "Start Service", icon: Clock, color: "pink" as const }
                    : mangomintStatus === AppointmentStatus.IN_SERVICE
                    ? { status: AppointmentStatus.COMPLETED, label: "Complete", icon: Check, color: "emerald" as const }
                    : null;
                    
                  if (!nextAction) return null;
                  const colorMap = {
                    purple: "bg-purple-600 hover:bg-purple-700 shadow-purple-600/25 text-white",
                    pink: "bg-pink-600 hover:bg-pink-700 shadow-pink-600/25 text-white",
                    emerald: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25 text-white",
                  };
                  return (
                    <Button
                      className={cn("w-full h-10 rounded-xl text-sm font-semibold shadow-lg transition-all", colorMap[nextAction.color])}
                      onClick={() => handleStatusChange(nextAction.status)}
                      disabled={isSaving}
                    >
                      <nextAction.icon className="w-4 h-4 mr-2" />
                      {nextAction.label}
                    </Button>
                  );
                })()}
              </div>
            )}

            {/* Client Section */}
            <div className="space-y-2 sm:space-y-2.5 md:space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                  <User className="w-3.5 h-3.5" />
                  Client
                </Label>
                {mode !== "view" && (
                  <button
                    type="button"
                    onClick={() => setShowNewClientDialog(true)}
                    className="flex items-center gap-1.5 text-xs text-pink-600 hover:text-pink-700 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New client
                  </button>
                )}
              </div>
              {mode === "view" ? (
                <div className="rounded-xl border border-gray-200 p-3 overflow-hidden">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-10 h-10 flex-shrink-0 ring-2 ring-pink-100">
                      <AvatarFallback className="bg-gradient-to-br from-pink-500 to-rose-500 text-white font-semibold text-sm">
                        {formData.clientName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="font-semibold text-sm text-gray-900 truncate">{formData.clientName}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {formData.clientPhone && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                            {formData.clientPhone}
                          </span>
                        )}
                        {formData.clientEmail && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                            <Mail className="w-3 h-3" />
                            {formData.clientEmail}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 overflow-hidden">
                  {/* Selected client card */}
                  {formData.clientId && formData.clientName && (
                    <div className="flex items-center gap-3 rounded-xl border border-pink-200 bg-pink-50/50 p-3">
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-pink-500 to-rose-500 text-white font-semibold text-xs">
                          {formData.clientName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{formData.clientName}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {formData.clientPhone || formData.clientEmail || "Saved client"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setClientSearchQuery("");
                          setFormData(prev => ({ ...prev, clientName: "", clientId: "", clientPhone: "", clientEmail: "", isRecurring: false }));
                          setClientSearchResults([]);
                        }}
                        className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {/* Search input - shown when no client selected or editing */}
                  {!formData.clientId && (
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="Search or enter client name *"
                          value={clientSearchQuery || formData.clientName}
                          onChange={(e) => {
                            const value = e.target.value;
                            setClientSearchQuery(value);
                            setFormData(prev => ({
                              ...prev,
                              clientName: value,
                              clientId: "",
                              ...(prev.isRecurring ? { isRecurring: false } : {}),
                            }));
                            setShowClientSearch(value.length >= 2);
                          }}
                          onFocus={() => {
                            if (clientSearchQuery.length >= 2) {
                              setShowClientSearch(true);
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => setShowClientSearch(false), 200);
                          }}
                          className="w-full max-w-full box-border pl-10 pr-8 rounded-xl"
                        />
                        {clientSearchQuery.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setClientSearchQuery("");
                              setFormData(prev => ({
                                ...prev,
                                clientName: "",
                                clientId: "",
                                isRecurring: false,
                              }));
                              setClientSearchResults([]);
                              setShowClientSearch(false);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {showClientSearch && (
                        <div className="absolute z-50 w-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                          {clientSearchResults.length > 0 ? (
                            <>
                              {clientSearchResults.map((client) => (
                                <button
                                  key={client.id}
                                  type="button"
                                  onClick={() => handleSelectClient(client)}
                                  className="w-full px-3.5 py-2.5 text-left hover:bg-pink-50/50 flex items-center gap-3 transition-colors first:rounded-t-xl"
                                >
                                  <Avatar className="w-8 h-8 flex-shrink-0">
                                    <AvatarFallback className="bg-gradient-to-br from-pink-400 to-rose-400 text-white text-xs font-semibold">
                                      {client.full_name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium block truncate text-gray-900">
                                      {client.full_name}
                                    </span>
                                    {(client.email || client.phone) && (
                                      <span className="text-[11px] text-gray-500 block truncate">
                                        {[client.phone, client.email].filter(Boolean).join(" · ")}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              ))}
                              <div className="border-t border-gray-100">
                                <button
                                  type="button"
                                  onClick={() => setShowNewClientDialog(true)}
                                  className="w-full px-3.5 py-2.5 text-left hover:bg-gray-50 flex items-center gap-3 text-pink-600 rounded-b-xl transition-colors"
                                >
                                  <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center flex-shrink-0">
                                    <Plus className="w-4 h-4" />
                                  </div>
                                  <span className="text-sm font-medium">Create new client</span>
                                </button>
                              </div>
                            </>
                          ) : clientSearchQuery.length >= 2 ? (
                            <div className="p-5 text-center">
                              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                                <Search className="w-5 h-5 text-gray-400" />
                              </div>
                              <p className="text-sm text-gray-500 mb-2">No clients found</p>
                              <button
                                type="button"
                                onClick={() => setShowNewClientDialog(true)}
                                className="text-sm text-pink-600 font-medium hover:text-pink-700 transition-colors"
                              >
                                + Create new client
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Contact fields - collapsed into a row */}
                  {!formData.clientId && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-500 font-medium">Phone</label>
                        <Input
                          placeholder="Phone number"
                          value={formData.clientPhone}
                          onChange={(e) => setFormData(prev => ({ ...prev, clientPhone: e.target.value }))}
                          className="w-full max-w-full box-border rounded-lg"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-500 font-medium">Email</label>
                        <Input
                          type="email"
                          placeholder="Email address"
                          value={formData.clientEmail}
                          onChange={(e) => setFormData(prev => ({ ...prev, clientEmail: e.target.value }))}
                          className="w-full max-w-full box-border rounded-lg"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {mode === "create" && formData.kind !== AppointmentKind.WALK_IN && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Repeat className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden />
                      <Label
                        htmlFor="sidebar-recurring"
                        className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer"
                      >
                        Repeating visit
                      </Label>
                    </div>
                    <Switch
                      id="sidebar-recurring"
                      checked={formData.isRecurring}
                      onCheckedChange={(v) => setFormData((prev) => ({ ...prev, isRecurring: v }))}
                      disabled={!formData.clientId}
                    />
                  </div>
                  {!formData.clientId ? (
                    <p className="text-xs text-gray-500 font-light">
                      Search and select a saved client, or create one, to enable a repeating schedule.
                    </p>
                  ) : null}
                  {formData.isRecurring && formData.clientId ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-600">Repeat</Label>
                        <Select
                          value={formData.recurrencePattern}
                          onValueChange={(v) =>
                            setFormData((prev) => ({
                              ...prev,
                              recurrencePattern: v as CreateFormData["recurrencePattern"],
                            }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="daily">Daily</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-600">Series end date (optional)</Label>
                        <Input
                          type="date"
                          value={formData.recurrenceEndDate}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, recurrenceEndDate: e.target.value }))
                          }
                          className="w-full"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            )}

            {/* Group Participants Section (VIEW mode only) */}
            {mode === "view" && selectedAppointment?.is_group_booking && selectedAppointment?.participants && selectedAppointment.participants.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2 sm:space-y-2.5 md:space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Group Participants
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      <Users className="w-3 h-3 mr-1" />
                      {selectedAppointment.participants.length} participant{selectedAppointment.participants.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {selectedAppointment.participants.map((participant, index) => (
                      <div
                        key={participant.id || index}
                        className="bg-gray-50 rounded-lg p-2 sm:p-2.5 md:p-3 border border-gray-200"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 sm:gap-2.5 flex-1 min-w-0">
                            <Avatar className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0">
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-400 text-white font-semibold text-xs">
                                {participant.participant_name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-xs sm:text-sm text-gray-900 truncate">
                                  {participant.participant_name}
                                </p>
                                {participant.is_primary_contact && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    Primary
                                  </Badge>
                                )}
                              </div>
                              {participant.service_name && (
                                <p className="text-xs text-gray-600 mt-0.5">{participant.service_name}</p>
                              )}
                              {participant.participant_email && (
                                <p className="text-[10px] text-gray-400 break-all mt-0.5">{participant.participant_email}</p>
                              )}
                              {participant.participant_phone && (
                                <p className="text-[10px] text-gray-400 break-all">{participant.participant_phone}</p>
                              )}
                              {participant.price !== undefined && (
                                <p className="text-xs font-medium text-gray-700 mt-1">
                                  ${participant.price.toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {participant.checked_in && (
                              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                                Checked In
                              </Badge>
                            )}
                            {participant.checked_out && (
                              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                Checked Out
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedAppointment.group_booking_ref && (
                    <p className="text-xs text-gray-500 mt-2">
                      Group Booking Ref: <span className="font-medium">{selectedAppointment.group_booking_ref}</span>
                    </p>
                  )}
                </div>
              </>
            )}

            <Separator />

            {/* Appointment Kind */}
            <div className="space-y-3">
              <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Appointment Type
              </Label>
              {mode === "view" ? (
                <div className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3",
                  formData.kind === AppointmentKind.AT_HOME && "bg-blue-50 border border-blue-100",
                  formData.kind === AppointmentKind.WALK_IN && "bg-amber-50 border border-amber-100",
                  formData.kind === AppointmentKind.IN_SALON && "bg-gray-50 border border-gray-100",
                )}>
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    formData.kind === AppointmentKind.AT_HOME && "bg-blue-100",
                    formData.kind === AppointmentKind.WALK_IN && "bg-amber-100",
                    formData.kind === AppointmentKind.IN_SALON && "bg-gray-200",
                  )}>
                    {formData.kind === AppointmentKind.AT_HOME && <Home className="w-4 h-4 text-blue-600" />}
                    {formData.kind === AppointmentKind.WALK_IN && <PersonStanding className="w-4 h-4 text-amber-600" />}
                    {formData.kind === AppointmentKind.IN_SALON && <Building2 className="w-4 h-4 text-gray-600" />}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {formData.kind === AppointmentKind.AT_HOME && "At-Home Service"}
                      {formData.kind === AppointmentKind.WALK_IN && "Walk-in"}
                      {formData.kind === AppointmentKind.IN_SALON && "In Salon"}
                    </span>
                    <p className="text-xs text-gray-500">
                      {formData.kind === AppointmentKind.AT_HOME && "Service at client's location"}
                      {formData.kind === AppointmentKind.WALK_IN && "No prior booking required"}
                      {formData.kind === AppointmentKind.IN_SALON && "Standard salon appointment"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([
                    { kind: AppointmentKind.IN_SALON, label: "In Salon", desc: "At your venue", icon: Building2, color: "gray" },
                    { kind: AppointmentKind.WALK_IN, label: "Walk-in", desc: "No booking", icon: PersonStanding, color: "amber" },
                    { kind: AppointmentKind.AT_HOME, label: "At Home", desc: "Client location", icon: Home, color: "blue" },
                  ] as const).map(({ kind, label, desc, icon: Icon, color }) => {
                    const isActive = formData.kind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        className={cn(
                          "flex sm:flex-col items-center gap-2 sm:gap-1 rounded-xl p-3 transition-all duration-200 border-2 sm:text-center",
                          isActive && color === "gray" && "border-gray-900 bg-gray-900 text-white shadow-lg shadow-gray-900/20",
                          isActive && color === "amber" && "border-amber-500 bg-amber-50 text-amber-900 shadow-lg shadow-amber-500/20",
                          isActive && color === "blue" && "border-blue-500 bg-blue-50 text-blue-900 shadow-lg shadow-blue-500/20",
                          !isActive && "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                        )}
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            kind,
                            ...(kind === AppointmentKind.WALK_IN
                              ? { isRecurring: false }
                              : {}),
                          }))
                        }
                      >
                        <div className={cn(
                          "w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center transition-colors",
                          isActive && color === "gray" && "bg-white/20",
                          isActive && color === "amber" && "bg-amber-200/60",
                          isActive && color === "blue" && "bg-blue-200/60",
                          !isActive && "bg-gray-100",
                        )}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col sm:items-center">
                          <span className="text-sm sm:text-xs font-semibold leading-tight">{label}</span>
                          <span className={cn(
                            "text-xs sm:text-[10px] leading-tight",
                            isActive ? "opacity-80" : "text-gray-400",
                          )}>{desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* At-Home Address */}
            {formData.kind === AppointmentKind.AT_HOME && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                    <Home className="w-3.5 h-3.5" />
                    Service Address
                  </Label>
                  {mode === "view" ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/60 overflow-hidden">
                      <div className="flex items-start gap-3 p-3.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <MapPin className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="text-sm text-gray-700 flex-1 min-w-0">
                          <p className="font-medium">{formData.addressLine1}</p>
                          {formData.addressLine2 && <p className="text-gray-500 text-xs mt-0.5">{formData.addressLine2}</p>}
                          <p className="text-gray-500 text-xs mt-0.5">{formData.addressCity} {formData.addressPostalCode}</p>
                        </div>
                      </div>
                      {formData.travelFee > 0 && (
                        <div className="px-3.5 py-2.5 bg-blue-100/50 border-t border-blue-200/60 flex justify-between items-center">
                          <span className="text-xs text-blue-700 font-medium">Travel fee</span>
                          <span className="text-sm font-semibold text-blue-800">
                            {formatMoney(
                              formData.hasTravelOverride && formData.travelFeeOverride !== null
                                ? formData.travelFeeOverride
                                : formData.travelFee
                            )}
                            {formData.hasTravelOverride && (
                              <span className="ml-1 text-[11px] text-blue-500 font-normal">(overridden)</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <AddressAutocomplete
                        value={formData.addressLine1}
                        onChange={(addr) => {
                          setFormData(prev => ({
                            ...prev,
                            addressLine1: addr.address_line1,
                            addressCity: addr.city,
                            addressPostalCode: addr.postal_code || "",
                            addressCountry: addr.country || "",
                            addressLatitude: addr.latitude,
                            addressLongitude: addr.longitude,
                          }));
                        }}
                        onInputChange={(val) => {
                          if (!val) return;
                          setFormData(prev => ({ ...prev, addressLine1: val }));
                        }}
                        placeholder="Search for address..."
                        label="Street address *"
                        country="ZA"
                        inputClassName="rounded-lg"
                      />
                      <Input
                        placeholder="Apartment, suite, etc."
                        value={formData.addressLine2}
                        onChange={(e) => setFormData(prev => ({ ...prev, addressLine2: e.target.value }))}
                        className="w-full max-w-full box-border rounded-lg"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-gray-500 font-medium">City</label>
                          <Input
                            placeholder="City *"
                            value={formData.addressCity}
                            onChange={(e) => setFormData(prev => ({ ...prev, addressCity: e.target.value }))}
                            className="w-full max-w-full box-border rounded-lg"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-gray-500 font-medium">Postal code</label>
                          <Input
                            placeholder="Postal code"
                            value={formData.addressPostalCode}
                            onChange={(e) => setFormData(prev => ({ ...prev, addressPostalCode: e.target.value }))}
                            className="w-full max-w-full box-border rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        <p className="text-xs text-blue-700">
                          <span className="font-medium">Travel fee:</span> {formatMoney(formData.travelFee)}
                          {formData.addressLatitude && formData.addressLongitude && (
                            <span className="ml-2 text-blue-500 text-[10px]">Geocoded</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Travel Override Section (Phase 3) */}
                {mode === "edit" && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Travel Override
                        </Label>
                        <Switch
                          checked={formData.hasTravelOverride}
                          onCheckedChange={(checked) => 
                            setFormData(prev => ({ 
                              ...prev, 
                              hasTravelOverride: checked,
                              // Reset override values when turning off
                              ...(checked ? {} : {
                                travelTimeOverride: null,
                                travelFeeOverride: null,
                                travelOverrideReason: "",
                              })
                            }))
                          }
                        />
                      </div>
                      
                      {formData.hasTravelOverride && (
                        <div className="space-y-3 bg-amber-50 rounded-lg p-3">
                          <div className="space-y-2">
                            <Label className="text-xs text-gray-500">Override Travel Time (minutes)</Label>
                            <Input
                              type="number"
                              placeholder="e.g., 30"
                              value={formData.travelTimeOverride ?? ""}
                              onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                travelTimeOverride: e.target.value ? parseInt(e.target.value) : null 
                              }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-gray-500">Override Travel Fee (R)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="e.g., 50.00"
                              value={formData.travelFeeOverride ?? ""}
                              onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                travelFeeOverride: e.target.value ? parseFloat(e.target.value) : null 
                              }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-gray-500">Reason for Override *</Label>
                            <Textarea
                              placeholder="Why is this being overridden?"
                              value={formData.travelOverrideReason}
                              onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                travelOverrideReason: e.target.value 
                              }))}
                              rows={2}
                              className="w-full max-w-full box-border resize-none"
                            />
                          </div>
                          <p className="text-xs text-amber-600">
                            Overrides will be recorded for audit purposes.
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
                
                {/* Show override info in view mode */}
                {mode === "view" && formData.hasTravelOverride && (
                  <>
                    <div className="bg-amber-50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-1 text-amber-700">
                        <span className="text-xs font-semibold uppercase">Travel Override Applied</span>
                      </div>
                      {formData.travelTimeOverride !== null && (
                        <p className="text-sm text-gray-700">
                          <span className="text-gray-500">Time:</span> {formData.travelTimeOverride} min
                        </p>
                      )}
                      {formData.travelFeeOverride !== null && (
                        <p className="text-sm text-gray-700">
                          <span className="text-gray-500">Fee:</span> {formatMoney(formData.travelFeeOverride)}
                        </p>
                      )}
                      {formData.travelOverrideReason && (
                        <p className="text-xs text-gray-500 italic">"{formData.travelOverrideReason}"</p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            <Separator />

            {/* Staff & Location */}
            <div className="space-y-3">
              <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                Staff & Location
              </Label>
              {mode === "view" ? (
                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                  <div className="flex items-center gap-3 px-3.5 py-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400 font-medium">Staff</p>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {(teamMembers || []).find(m => m.id === formData.staffId)?.name || "Unassigned"}
                      </p>
                    </div>
                  </div>
                  {formData.kind !== AppointmentKind.AT_HOME && (
                    <div className="flex items-center gap-3 px-3.5 py-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-gray-400 font-medium">Location</p>
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {(salonLocations || []).find(l => l.id === formData.locationId)?.name || "No location"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-gray-500 font-medium">Assign staff</label>
                    <Select value={formData.staffId} onValueChange={(v) => setFormData(prev => ({ ...prev, staffId: v }))}>
                      <SelectTrigger className="w-full max-w-full min-w-0 box-border rounded-xl">
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                      <SelectContent>
                        {(teamMembers || []).map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.kind !== AppointmentKind.AT_HOME && salonLocations.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-gray-500 font-medium">Location</label>
                      <Select value={formData.locationId} onValueChange={(v) => setFormData(prev => ({ ...prev, locationId: v }))}>
                        <SelectTrigger className="w-full max-w-full min-w-0 box-border rounded-xl">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {salonLocations.map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Date & Time */}
            <div className="space-y-3">
              <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                Schedule
              </Label>
              {mode === "view" && selectedAppointment ? (
                <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex flex-col items-center justify-center shadow-sm flex-shrink-0">
                      {(() => {
                        try {
                          const d = new Date(selectedAppointment.scheduled_date);
                          if (!isNaN(d.getTime())) return (
                            <>
                              <span className="text-[10px] font-medium text-gray-500 uppercase leading-none">{format(d, "MMM")}</span>
                              <span className="text-lg font-bold text-gray-900 leading-none">{format(d, "d")}</span>
                            </>
                          );
                        } catch { /* fallback below */ }
                        return <Calendar className="w-5 h-5 text-gray-400" />;
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {selectedAppointment.scheduled_date ? (
                          (() => {
                            try {
                              const dateValue = new Date(selectedAppointment.scheduled_date);
                              return isNaN(dateValue.getTime()) ? selectedAppointment.scheduled_date : format(dateValue, "EEEE, MMMM d, yyyy");
                            } catch {
                              return selectedAppointment.scheduled_date;
                            }
                          })()
                        ) : "—"}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                          <Clock className="w-3 h-3" />
                          {selectedAppointment.scheduled_time || "—"}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                          <Timer className="w-3 h-3" />
                          {selectedAppointment.duration_minutes} min
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Visual slot picker replaces raw date/time inputs */}
                  <AvailabilitySlotPicker
                    staffId={formData.staffId}
                    locationId={formData.locationId}
                    providerId={portalProvider?.id}
                    duration={formData.duration}
                    selectedDate={formData.date}
                    selectedTime={formData.startTime}
                    onDateChange={(date) => setFormData(prev => ({ ...prev, date }))}
                    onTimeChange={(time) => setFormData(prev => ({ ...prev, startTime: time }))}
                    mode={formData.kind === AppointmentKind.AT_HOME ? "mobile" : "salon"}
                  />

                  {/* Duration pills */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-gray-500 font-medium">Duration</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[15, 30, 45, 60, 90, 120].map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                            formData.duration === d
                              ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                          )}
                          onClick={() => setFormData(prev => ({ ...prev, duration: d }))}
                        >
                          {d >= 60 ? `${d / 60}h${d % 60 ? ` ${d % 60}m` : ''}` : `${d}m`}
                        </button>
                      ))}
                      <Select
                        value={![15, 30, 45, 60, 90, 120].includes(formData.duration) ? formData.duration.toString() : ""}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, duration: parseInt(v) }))}
                      >
                        <SelectTrigger className={cn(
                          "w-auto h-auto px-3 py-1.5 rounded-lg text-xs font-medium border",
                          ![15, 30, 45, 60, 90, 120].includes(formData.duration) ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200",
                        )}>
                          <span>{![15, 30, 45, 60, 90, 120].includes(formData.duration) ? `${formData.duration}m` : "Other"}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {[75, 150, 180, 210, 240].map((d) => (
                            <SelectItem key={d} value={d.toString()}>
                              {d >= 60 ? `${Math.floor(d / 60)}h ${d % 60 ? `${d % 60}m` : ''}` : `${d} min`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Availability conflict hint (secondary validation) */}
                  {(mode === "create" || mode === "edit") && slotAvailability.checked && !slotAvailability.available && (
                    <div
                      className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-950"
                      role="status"
                      aria-live="polite"
                    >
                      <div className="space-y-1.5">
                        <span className="flex items-center gap-2 font-semibold">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          Potential scheduling conflict
                        </span>
                        <ul className="list-disc pl-6 text-[11px] sm:text-xs space-y-0.5">
                          {slotAvailability.conflicts.map((c, i) => (
                            <li key={`${i}-${c}`}>{c}</li>
                          ))}
                        </ul>
                        <p className="text-[11px] text-amber-800/80 pt-0.5">
                          You can still book — the server validates before confirming.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Booking Status - Edit mode only */}
            {mode === "edit" && (
              <>
                <div className="space-y-3">
                  <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Booking Status
                  </Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}
                  >
                    <SelectTrigger className="w-full max-w-full min-w-0 box-border">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Pending
                        </div>
                      </SelectItem>
                      <SelectItem value="booked">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Confirmed
                        </div>
                      </SelectItem>
                      <SelectItem value="started">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-pink-500" />
                          In Service
                        </div>
                      </SelectItem>
                      <SelectItem value="completed">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gray-500" />
                          Completed
                        </div>
                      </SelectItem>
                      <SelectItem value="cancelled">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Cancelled
                        </div>
                      </SelectItem>
                      <SelectItem value="no_show">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500" />
                          No Show
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
              </>
            )}

            {/* Services & Products */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Services & Products
                  {formData.services.length > 0 && (
                    <span className="bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {formData.services.length + formData.products.length}
                    </span>
                  )}
                </Label>
                {mode !== "view" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 rounded-lg border-dashed">
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 z-[110]">
                      <DropdownMenuItem onClick={(e) => {
                        e.preventDefault();
                        const serviceSelect = document.querySelector('[data-sidebar-service-select]') as HTMLElement;
                        if (serviceSelect) {
                          serviceSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setTimeout(() => serviceSelect.click(), 100);
                        }
                      }}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Add Service
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.preventDefault();
                        const productSelect = document.querySelector('[data-sidebar-product-select]') as HTMLElement;
                        if (productSelect) {
                          productSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setTimeout(() => productSelect.click(), 100);
                        }
                      }}>
                        <Tag className="w-4 h-4 mr-2" />
                        Add Product
                      </DropdownMenuItem>
                      {packages.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => {
                            e.preventDefault();
                            const packageSelect = document.querySelector('[data-sidebar-package-select]') as HTMLElement;
                            if (packageSelect) {
                              packageSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              setTimeout(() => packageSelect.click(), 100);
                            }
                          }}>
                            <Package className="w-4 h-4 mr-2" />
                            Add Package
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Empty State */}
              {formData.services.length === 0 && formData.products.length === 0 && mode !== "view" && (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                    <Sparkles className="w-5 h-5 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">No services added yet</p>
                  <p className="text-xs text-gray-400 mt-0.5">Add services, products, or a package below</p>
                </div>
              )}

              {/* Services List */}
              {formData.services.length > 0 && (
                <div className="space-y-2">
                  {formData.services.map((service, idx) => {
                    const serviceTotal = service.price + (service.addons?.reduce((sum, a) => sum + a.price, 0) || 0);
                    const serviceDuration = service.duration + (service.addons?.reduce((sum, a) => sum + a.duration, 0) || 0);
                    
                    return (
                      <div key={service.id} className="group rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-all overflow-hidden">
                        <div className="flex items-start gap-3 p-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-pink-600">{idx + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-sm text-gray-900 truncate">
                                  {service.serviceName}
                                </p>
                                {service.variantName && (
                                  <span className="inline-flex items-center text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md mt-0.5 font-medium">
                                    {service.variantName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {mode !== "view" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                                    onClick={() => removeService(service.id)}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                                <Clock className="w-3 h-3" />
                                {serviceDuration}m
                              </span>
                              {mode !== "view" ? (
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">R</span>
                                  <Input
                                    type="number"
                                    className="w-20 h-6 text-xs pl-5 pr-1"
                                    value={service.price}
                                    onChange={(e) => {
                                      const newPrice = parseFloat(e.target.value) || 0;
                                      setFormData(prev => {
                                        const newServices = prev.services.map(s => 
                                          s.id === service.id ? { ...s, price: newPrice } : s
                                        );
                                        const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
                                        const pricing = calculatePricing(newServices, prev.products, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
                                        return {
                                          ...prev,
                                          services: newServices,
                                          subtotal: pricing.subtotal,
                                          taxAmount: pricing.taxAmount,
                                          totalAmount: pricing.totalAmount,
                                        };
                                      });
                                    }}
                                  />
                                </div>
                              ) : (
                                <span className="text-xs font-semibold text-gray-900">{formatMoney(serviceTotal)}</span>
                              )}
                            </div>
                          </div>
                          {mode === "view" && (
                            <p className="font-semibold text-sm text-gray-900 flex-shrink-0 mt-0.5">{formatMoney(serviceTotal)}</p>
                          )}
                        </div>
                        {/* Addons for this service */}
                        {service.addons && service.addons.length > 0 && (
                          <div className="px-3 pb-2 pl-14">
                            <div className="space-y-1 border-l-2 border-pink-200 pl-3">
                              {service.addons.map((addon) => (
                                <div key={addon.id} className="flex items-center justify-between text-xs group/addon">
                                  <div className="flex items-center gap-1.5">
                                    <Plus className="w-2.5 h-2.5 text-pink-400" />
                                    <span className="text-gray-600">{addon.addonName}</span>
                                    {addon.duration > 0 && <span className="text-gray-400">+{addon.duration}m</span>}
                                    {mode !== "view" && (
                                      <button
                                        className="opacity-0 group-hover/addon:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                                        onClick={() => removeAddonFromService(service.id, addon.id)}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  <span className="text-gray-700 font-medium">{formatMoney(addon.price)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {mode !== "view" && (
                          <div className="px-3 pb-2 pl-14">
                            <button
                              className="text-xs text-pink-600 hover:text-pink-700 font-medium flex items-center gap-1 transition-colors"
                              onClick={() => {
                                setSelectedServiceForAddon(service.id);
                                loadServiceAddons(service.serviceId);
                              }}
                            >
                              <Plus className="w-3 h-3" />
                              Add extra
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Products List */}
              {formData.products.length > 0 && (
                <div className="space-y-2">
                  {formData.products.map((product) => (
                    <div key={product.id} className="group rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-all p-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center flex-shrink-0">
                          <Tag className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-gray-900 truncate">
                                {product.productName}
                              </p>
                              {product.productVariantName && (
                                <span className="inline-flex items-center text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md mt-0.5 font-medium">
                                  {product.productVariantName}
                                </span>
                              )}
                            </div>
                            {mode !== "view" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 flex-shrink-0"
                                onClick={() => removeProduct(product.id)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            {mode !== "view" ? (
                              <>
                                <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                                  <button
                                    className="px-2 py-1 text-gray-500 hover:bg-gray-50 transition-colors"
                                    onClick={() => updateProductQuantity(product.id, product.quantity - 1)}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <Input
                                    type="number"
                                    className="w-10 h-6 text-xs text-center border-x border-gray-200 rounded-none"
                                    value={product.quantity}
                                    onChange={(e) => updateProductQuantity(product.id, parseInt(e.target.value) || 1)}
                                  />
                                  <button
                                    className="px-2 py-1 text-gray-500 hover:bg-gray-50 transition-colors"
                                    onClick={() => updateProductQuantity(product.id, product.quantity + 1)}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                                <span className="text-[11px] text-gray-400">×</span>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">R</span>
                                  <Input
                                    type="number"
                                    className="w-20 h-6 text-xs pl-5 pr-1"
                                    value={product.unitPrice}
                                    onChange={(e) => {
                                      const newPrice = parseFloat(e.target.value) || 0;
                                      setFormData(prev => {
                                        const newProducts = prev.products.map(p => 
                                          p.id === product.id
                                            ? { ...p, unitPrice: newPrice, totalPrice: newPrice * p.quantity }
                                            : p
                                        );
                                        const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
                                        const pricing = calculatePricing(prev.services, newProducts, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
                                        return {
                                          ...prev,
                                          products: newProducts,
                                          subtotal: pricing.subtotal,
                                          taxAmount: pricing.taxAmount,
                                          totalAmount: pricing.totalAmount,
                                        };
                                      });
                                    }}
                                  />
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-gray-500">Qty: {product.quantity} × {formatMoney(product.unitPrice)}</span>
                            )}
                          </div>
                        </div>
                        {mode === "view" && (
                          <p className="font-semibold text-sm text-gray-900 flex-shrink-0 mt-0.5">{formatMoney(product.totalPrice)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {formData.services.length === 0 && formData.products.length === 0 && (
                <div className="text-center py-4 text-sm text-gray-500">
                  No services or products added
                </div>
              )}

              {/* Service/Product/Package Selection */}
              {mode !== "view" && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search services..."
                      value={serviceSearchQuery}
                      onChange={(e) => setServiceSearchQuery(e.target.value)}
                      className="pl-8 h-9 text-sm rounded-lg"
                    />
                  </div>
                  <Select 
                    value="" 
                    onValueChange={(serviceId) => {
                      const service = services.find(s => s.id === serviceId);
                      if (!service) return;
                      
                      // If it's a variant (already a specific choice), add directly
                      if (service.service_type === "variant") {
                        const parentId = (service as any).parent_service_id;
                        const parentService = parentId ? services.find(s => s.id === parentId) : null;
                        if (parentService) {
                          addService(parentService, service.id, (service as any).variant_name || service.name);
                        } else {
                          addService(service);
                        }
                      } else if ((service as any).has_variants || ((service as any).variants?.length ?? 0) > 0) {
                        // Parent service with variants - open picker
                        setSelectedServiceForVariant(service.id);
                        loadServiceVariants(service.id);
                      } else {
                        addService(service);
                      }
                      setServiceSearchQuery("");
                    }}
                  >
                    <SelectTrigger data-sidebar-service-select>
                      <SelectValue placeholder="Add a service..." />
                    </SelectTrigger>
                    <SelectContent>
                      {services
                        .filter(s => {
                          const typeOk = !s.service_type || 
                                 s.service_type === "basic" || 
                                 s.service_type === "variant" || 
                                 s.service_type === "package";
                          if (!typeOk) return false;
                          if (!serviceSearchQuery.trim()) return true;
                          const q = serviceSearchQuery.toLowerCase();
                          return s.name.toLowerCase().includes(q) ||
                            (s.description || "").toLowerCase().includes(q) ||
                            ((s as any).variant_name || "").toLowerCase().includes(q);
                        })
                        .map((service) => {
                          const isVariant = service.service_type === "variant";
                          const isPackage = service.service_type === "package";
                          const variantName = (service as any).variant_name;
                          const hasVariants = (service as any).has_variants;
                          
                          return (
                            <SelectItem key={service.id} value={service.id}>
                              <div className="flex items-center gap-2">
                                {isVariant && <span className="text-xs text-purple-600">[Variant]</span>}
                                {isPackage && <span className="text-xs text-blue-600">[Package]</span>}
                                {hasVariants && <span className="text-xs text-purple-500">[Has Variants]</span>}
                                <span>{isVariant && variantName ? variantName : service.name}</span>
                                <span className="text-gray-400">-</span>
                                <span className="font-medium">{formatMoney(Number(service.price))}</span>
                                {service.duration_minutes && (
                                  <>
                                    <span className="text-gray-400">-</span>
                                    <span className="text-xs text-gray-500">{service.duration_minutes}min</span>
                                  </>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                  
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search products..."
                        value={productSearchQuery}
                        onChange={(e) => {
                          setProductSearchQuery(e.target.value);
                          // Load products with search if query is long enough
                          if (e.target.value.trim().length >= 2) {
                            loadProducts(e.target.value.trim());
                          } else if (e.target.value.trim().length === 0 && products.length === 0) {
                            // Only load all products when search is cleared AND products haven't been loaded
                            loadProducts();
                          }
                        }}
                        onFocus={() => {
                          // Lazy load products when user focuses on search input
                          if (!productsLoadedRef.current && products.length === 0) {
                            loadProducts();
                          }
                        }}
                        className="pl-8"
                      />
                    </div>
                    <Select 
                      value="" 
                      onValueChange={(value) => {
                        const [productId, variantId] = value.includes("::") ? value.split("::") : [value, null];
                        const product = filteredProducts.find(p => p.id === productId);
                        if (!product) return;
                        const variant = variantId && (product as any).variants?.length
                          ? (product as any).variants.find((v: any) => v.id === variantId)
                          : null;
                        addProduct(product, 1, variant ?? undefined);
                        setProductSearchQuery("");
                      }}
                      onOpenChange={(open) => {
                        if (open && !productsLoadedRef.current && products.length === 0) {
                          loadProducts();
                        }
                      }}
                    >
                      <SelectTrigger data-sidebar-product-select>
                        <SelectValue placeholder="Select a product..." />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingProducts ? (
                          <div className="p-2 text-sm text-gray-500 text-center">
                            Loading products...
                          </div>
                        ) : filteredProducts.length > 0 ? (
                          filteredProducts.flatMap((product) => {
                            const hasVariants = (product as any).has_variants && Array.isArray((product as any).variants) && (product as any).variants.length > 0;
                            if (hasVariants) {
                              return (product as any).variants.map((v: any) => {
                                const label = Object.values(v.option_values || {}).join(" / ");
                                return (
                                  <SelectItem key={`${product.id}-${v.id}`} value={`${product.id}::${v.id}`}>
                                    <div className="flex items-center gap-2">
                                      <span>{product.name}</span>
                                      <span className="text-gray-500">· {label}</span>
                                      <span className="font-medium">{formatMoney(v.retail_price ?? 0)}</span>
                                    </div>
                                  </SelectItem>
                                );
                              });
                            }
                            return [
                              <SelectItem key={product.id} value={product.id}>
                                <div className="flex items-center gap-2">
                                  <span>{product.name}</span>
                                  <span className="text-gray-400">-</span>
                                  <span className="font-medium">{formatMoney(product.retail_price ?? 0)}</span>
                                </div>
                              </SelectItem>,
                            ];
                          })
                        ) : (
                          <div className="p-2 text-sm text-gray-500 text-center">
                            {productSearchQuery.trim() 
                              ? `No products found matching "${productSearchQuery}"` 
                              : "No products available"}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Package Selection */}
                  {packages.length > 0 && (
                    <Select 
                      value={selectedPackageId || ""} 
                      onValueChange={(packageId) => {
                        const pkg = packages.find(p => p.id === packageId);
                        if (pkg) {
                          handleAddPackage(pkg);
                        }
                      }}
                    >
                      <SelectTrigger data-sidebar-package-select>
                        <SelectValue placeholder="Add a package..." />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingPackages ? (
                          <div className="p-2 text-sm text-gray-500 text-center">
                            Loading packages...
                          </div>
                        ) : (
                          packages.map((pkg) => (
                            <SelectItem key={pkg.id} value={pkg.id}>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <Package className="w-4 h-4 text-blue-600" />
                                  <span className="font-medium">{pkg.name}</span>
                                </div>
                                {pkg.description && (
                                  <span className="text-xs text-gray-500">{pkg.description}</span>
                                )}
                                {pkg.items && (
                                  <span className="text-xs text-gray-400">
                                    {pkg.items.filter((item: any) => item.offering_id).length} service(s)
                                    {pkg.items.filter((item: any) => item.product_id).length > 0 && (
                                      <> • {pkg.items.filter((item: any) => item.product_id).length} product(s)</>
                                    )}
                                  </span>
                                )}
                                {pkg.price && (
                                  <span className="text-xs font-semibold text-gray-900">{formatMoney(pkg.price)}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Pricing Breakdown */}
            <div className="space-y-2 sm:space-y-2.5 md:space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                  <Receipt className="w-3.5 h-3.5" />
                  Pricing
                </Label>
                {mode === "view" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 sm:h-7.5 md:h-8 text-xs px-2 rounded-lg">
                        <FileText className="w-3 h-3 mr-1" />
                        <span className="hidden xs:inline">Receipt</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[110]">
                      <DropdownMenuItem onClick={() => handlePrintInvoice()}>
                        <Printer className="w-4 h-4 mr-2" />
                        Print Receipt
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEmailInvoice()}>
                        <Mail className="w-4 h-4 mr-2" />
                        Email Receipt
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-3 space-y-2 bg-white">
                  {/* Subtotal */}
                  <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium text-gray-900">{formatMoney(formData.subtotal)}</span>
                  </div>
                  
                  {/* Discount */}
                  {formData.discountAmount > 0 && (
                    <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                      <span className="text-emerald-600 flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        Discount{formData.discountCode || formData.discountReason
                          ? ` · ${formData.discountCode || formData.discountReason}`
                          : ""}
                      </span>
                      <span className="font-medium text-emerald-600">-{formatMoney(formData.discountAmount)}</span>
                    </div>
                  )}
                  
                  {/* Tax */}
                  {formData.taxAmount > 0 && (
                    <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                      <span className="text-gray-500">Tax ({(Math.round(formData.taxRate * 10000) / 100).toFixed(1)}%)</span>
                      <span className="font-medium text-gray-700">{formatMoney(formData.taxAmount)}</span>
                    </div>
                  )}
                  
                  {/* Travel Fee */}
                  {formData.travelFee > 0 && (
                    <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                      <span className="text-gray-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Travel Fee
                      </span>
                      <span className="font-medium text-gray-700">{formatMoney(formData.travelFee)}</span>
                    </div>
                  )}
                  
                  {/* Service Fee */}
                  {formData.serviceFeeAmount > 0 && (
                    <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                      <span className="text-gray-500">Platform Fee ({(formData.serviceFeePercentage * 100).toFixed(1)}%)</span>
                      <span className="font-medium text-gray-700">{formatMoney(formData.serviceFeeAmount)}</span>
                    </div>
                  )}
                  
                  {/* Tip */}
                  {formData.tipAmount > 0 && (
                    <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                      <span className="text-gray-500">Tip</span>
                      <span className="font-medium text-gray-700">{formatMoney(formData.tipAmount)}</span>
                    </div>
                  )}
                </div>
                
                {/* Total - gradient accent */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-3 py-3 flex justify-between items-center">
                  <span className="font-semibold text-sm text-white/80">Total</span>
                  <span className="font-bold text-lg text-white tracking-tight">{formatMoney(formData.totalAmount)}</span>
                </div>
              </div>
              
              {/* Promo Code, Discount & Tip inputs (create/edit mode) */}
              {mode !== "view" && (
                <div className="space-y-4">
                  {/* Promo Code */}
                  <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <label className="text-[11px] text-gray-500 font-medium flex items-center gap-1.5">
                      <Tag className="w-3 h-3" />
                      Promo Code
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder="Enter code"
                        value={formData.discountCode || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, discountCode: e.target.value }))}
                        className="flex-1 uppercase rounded-lg text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-xs px-4"
                        onClick={async () => {
                        const code = formData.discountCode?.trim();
                        if (!code) {
                          toast.error("Enter a promo code");
                          return;
                        }
                        const subtotal = formData.subtotal;
                        try {
                          const res = await fetch(`/api/provider/coupons/validate?code=${encodeURIComponent(code)}&subtotal=${subtotal || 0}`);
                          const data = await res.json();
                          if (!res.ok) {
                            toast.error(data?.error?.message || "Invalid promo code");
                            return;
                          }
                          const discount = data?.data?.discount ?? 0;
                          setFormData(prev => {
                            const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
                            const pricing = calculatePricing(prev.services, prev.products, prev.travelFee, discount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
                            return {
                              ...prev,
                              discountAmount: discount,
                              discountCode: code,
                              subtotal: pricing.subtotal,
                              taxAmount: pricing.taxAmount,
                              totalAmount: pricing.totalAmount,
                            };
                          });
                          toast.success(data?.data?.message || "Promo applied");
                        } catch {
                          toast.error("Could not validate promo code");
                        }
                      }}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                  {/* Manual discount */}
                  <div className="grid grid-cols-5 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[11px] text-gray-500 font-medium">Discount</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">R</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={formData.discountAmount ? String(formData.discountAmount) : ""}
                          onChange={(e) => {
                            const discount = parseFloat(e.target.value) || 0;
                            setFormData(prev => {
                              const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
                              const pricing = calculatePricing(prev.services, prev.products, prev.travelFee, discount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
                              return {
                                ...prev,
                                discountAmount: discount,
                                subtotal: pricing.subtotal,
                                taxAmount: pricing.taxAmount,
                                totalAmount: pricing.totalAmount,
                              };
                            });
                          }}
                          className="pl-6 rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="col-span-3 space-y-1">
                      <label className="text-[11px] text-gray-500 font-medium">Reason</label>
                      <Input
                        type="text"
                        placeholder="Optional"
                        value={formData.discountReason || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, discountReason: e.target.value }))}
                        className="rounded-lg"
                      />
                    </div>
                  </div>
                  {/* Tip */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-gray-500 font-medium">Tip</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: "0%", value: 0 },
                        { label: "5%", value: 0.05 },
                        { label: "10%", value: 0.10 },
                        { label: "20%", value: 0.20 },
                        { label: "Custom", value: null },
                      ].map((option) => {
                        const tipBase = Math.max(0, formData.subtotal - formData.discountAmount);
                        const presetTips = [0, tipBase * 0.05, tipBase * 0.10, tipBase * 0.20];
                        const matchesPreset = presetTips.some(p => Math.abs(formData.tipAmount - p) < 0.01);
                        const isPreset = option.value !== null;
                        const isSelected = isPreset
                          ? Math.abs(formData.tipAmount - (tipBase * option.value)) < 0.01
                          : (customTipActive || !matchesPreset);
                        
                        return (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => {
                              if (option.value !== null) {
                                setCustomTipActive(false);
                                const tip = tipBase * option.value;
                                setFormData(prev => {
                                  const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
                                  const pricing = calculatePricing(prev.services, prev.products, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, tip);
                                  return {
                                    ...prev,
                                    tipAmount: tip,
                                    totalAmount: pricing.totalAmount,
                                  };
                                });
                              } else {
                                setCustomTipActive(true);
                                setTimeout(() => customTipInputRef.current?.focus(), 50);
                              }
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                              isSelected
                                ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    
                    {/* Custom amount */}
                    {(() => {
                      const tipBase = Math.max(0, formData.subtotal - formData.discountAmount);
                      const presets = [0, tipBase * 0.05, tipBase * 0.10, tipBase * 0.20];
                      return customTipActive || !presets.some(p => Math.abs(formData.tipAmount - p) < 0.01);
                    })() && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="relative flex-1 max-w-[120px]">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">R</span>
                          <Input
                            ref={customTipInputRef}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={formData.tipAmount > 0 ? formData.tipAmount.toFixed(2) : ""}
                            onChange={(e) => {
                              const tip = parseFloat(e.target.value) || 0;
                              setFormData(prev => {
                                const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
                                const pricing = calculatePricing(prev.services, prev.products, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, tip);
                                return {
                                  ...prev,
                                  tipAmount: tip,
                                  totalAmount: pricing.totalAmount,
                                };
                              });
                            }}
                            onBlur={() => setCustomTipActive(false)}
                            className="h-8 text-sm pl-6 rounded-lg"
                          />
                        </div>
                      </div>
                    )}
                    
                    {formData.tipAmount > 0 && (
                      <p className="text-[11px] text-gray-500">Tip: {formatMoney(formData.tipAmount)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Payment Collection (VIEW mode only for paid/pending bookings) */}
            {mode === "view" && selectedAppointment && (
              <>
                <div className="space-y-3">
                  <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5" />
                    Payment
                  </Label>
                  
                  <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                    {/* Payment Status Badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Status</span>
                      {(() => {
                        const actualPaymentStatus = selectedAppointment.payment_status || 'pending';
                        
                        return (
                          <Badge 
                            variant={
                              actualPaymentStatus === 'paid' ? 'default' : 
                              actualPaymentStatus === 'pending' ? 'outline' : 
                              actualPaymentStatus === 'refunded' ? 'outline' : 
                              actualPaymentStatus === 'partially_paid' ? 'secondary' : 
                              'outline'
                            }
                            className={cn(
                              "text-xs",
                              actualPaymentStatus === 'paid' && "bg-green-100 text-green-800 border-green-200",
                              actualPaymentStatus === 'pending' && "bg-yellow-50 text-yellow-700 border-yellow-200",
                              actualPaymentStatus === 'refunded' && "bg-gray-50 text-gray-700 border-gray-200",
                              actualPaymentStatus === 'partially_paid' && "bg-blue-50 text-blue-700 border-blue-200"
                            )}
                          >
                            {actualPaymentStatus.toUpperCase()}
                          </Badge>
                        );
                      })()}
                    </div>
                    
                    {/* Paid Amount Display */}
                    {(() => {
                      const totalPaid = (selectedAppointment as any).total_paid || 0;
                      const totalAmount = selectedAppointment.total_amount || 0;
                      const _totalRefunded = (selectedAppointment as any).total_refunded || 0;
                      if (totalPaid > 0) {
                        return (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">Paid:</span>
                            <span className={cn(
                              "font-medium",
                              totalPaid < totalAmount ? "text-blue-600" : "text-green-600"
                            )}>
                              {formatMoney(totalPaid)}
                              {totalPaid < totalAmount && (
                                <span className="text-gray-500 ml-1">of {formatMoney(totalAmount)}</span>
                              )}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    {/* Refunded Amount Display */}
                    {(() => {
                      const totalRefunded = (selectedAppointment as any).total_refunded || 0;
                      if (totalRefunded > 0) {
                        return (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">Refunded:</span>
                            <span className="font-medium text-red-600">
                              {formatMoney(totalRefunded)}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Payment Action Buttons */}
                    {/* Show payment buttons for pending, partially_paid, or failed status */}
                    {selectedAppointment.payment_status !== 'paid' && 
                     selectedAppointment.payment_status !== 'refunded' && (
                      <div className="space-y-2">
                        {(() => {
                          const totalPaid = (selectedAppointment as any).total_paid || 0;
                          const totalRefunded = (selectedAppointment as any).total_refunded || 0;
                          const totalAmount = selectedAppointment.total_amount || 0;
                          const walletAmt = Number((selectedAppointment as any).wallet_amount || 0);
                          const giftAmt = Number((selectedAppointment as any).gift_card_amount || 0);
                          const effectivePaid = Math.max(0, totalPaid - totalRefunded);
                          const remainingBalance = Math.max(0, totalAmount - effectivePaid - walletAmt - giftAmt);
                          const isPartiallyPaid = effectivePaid > 0 && remainingBalance > 0;
                          
                          return (
                            <>
                              {isPartiallyPaid && (
                                <div className="mb-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                                  Remaining Balance: <span className="font-semibold">{formatMoney(remainingBalance)}</span>
                                </div>
                              )}
                              <Button 
                                className="w-full bg-green-600 hover:bg-green-700 text-white text-xs" 
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const totalPaid = (selectedAppointment as any).total_paid || 0;
                                    const totalRefundedInner = (selectedAppointment as any).total_refunded || 0;
                                    const totalAmount = selectedAppointment.total_amount || 0;
                                    const walletInner = Number((selectedAppointment as any).wallet_amount || 0);
                                    const giftInner = Number((selectedAppointment as any).gift_card_amount || 0);
                                    const effectivePaidInner = Math.max(0, totalPaid - totalRefundedInner);
                                    const remainingBalance = Math.max(0, totalAmount - effectivePaidInner - walletInner - giftInner);
                                    const paymentAmount = remainingBalance > 0 ? remainingBalance : totalAmount;
                                    
                                    const response = await fetch(`/api/provider/bookings/${activeBookingId}/mark-paid`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        payment_method: 'cash',
                                        amount: paymentAmount,
                                        notes: isPartiallyPaid 
                                          ? `Payment received in cash - remaining balance of R${remainingBalance.toFixed(2)}`
                                          : 'Payment received in cash'
                                      })
                                    });
                              
                              if (!response.ok) {
                                const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
                                const errorMessage = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
                                throw new Error(errorMessage);
                              }
                              
                              const result = await response.json();
                              
                              // Update the appointment state immediately to reflect the payment status change
                              if (selectedAppointment) {
                                updateSelectedAppointment({
                                  ...selectedAppointment,
                                  payment_status: 'paid',
                                });
                              }
                              
                              toast.success(result.message || 'Booking marked as paid');
                              onAppointmentCreated?.(selectedAppointment);
                              onRefresh?.();
                              
                              // Don't close sidebar immediately - let user see the updated status
                              // closeSidebar();
                            } catch (error: any) {
                              const errorMessage = error?.message || 'Failed to mark booking as paid';
                              toast.error(errorMessage);
                              console.error('Mark as paid error:', error);
                            }
                          }}
                        >
                          <Check className="w-3 h-3 mr-1.5" />
                          {isPartiallyPaid ? `Pay Remaining (R${remainingBalance.toFixed(2)})` : 'Mark as Paid (Cash)'}
                        </Button>
                        
                        <Button 
                          className="w-full text-xs" 
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              // Calculate payment amount for card payment
                              const totalPaidCard = Number((selectedAppointment as any).total_paid || 0);
                              const totalRefundedCard = Number((selectedAppointment as any).total_refunded || 0);
                              const walletAmtCard = Number((selectedAppointment as any).wallet_amount || 0);
                              const giftAmtCard = Number((selectedAppointment as any).gift_card_amount || 0);
                              const totalAmountCard = selectedAppointment.total_amount || 0;
                              const effectivePaidCard = Math.max(0, totalPaidCard - totalRefundedCard);
                              const remainingBalanceCard = Math.max(0, totalAmountCard - effectivePaidCard - walletAmtCard - giftAmtCard);
                              const paymentAmountCard = remainingBalanceCard > 0 ? remainingBalanceCard : totalAmountCard;
                              
                              // Fetch Yoco terminals/devices first
                              const terminalsResponse = await fetch('/api/provider/yoco/devices');
                              const terminalsData = await terminalsResponse.json();
                              let terminals = terminalsData.data || [];

                              // IMPORTANT: Filter devices by appointment location (for multi-location providers)
                              const appointmentLocationId = selectedAppointment.location_id;
                              if (appointmentLocationId) {
                                const locationDevices = terminals.filter((t: any) => t.location_id === appointmentLocationId);
                                if (locationDevices.length > 0) {
                                  terminals = locationDevices;
                                  // filtered to location-specific devices
                                } else {
                                  // No devices at this location, but show all as fallback
                                  console.warn('No Yoco devices found for this location, showing all devices');
                                }
                              }

                              if (terminals.length === 0) {
                                const totalPaidLocal = Number((selectedAppointment as any).total_paid || 0);
                                const totalRefundedLocal = Number((selectedAppointment as any).total_refunded || 0);
                                const walletAmtLocal = Number((selectedAppointment as any).wallet_amount || 0);
                                const giftAmtLocal = Number((selectedAppointment as any).gift_card_amount || 0);
                                const totalAmountLocal = selectedAppointment.total_amount || 0;
                                const effectivePaidLocal = Math.max(0, totalPaidLocal - totalRefundedLocal);
                                const remainingBalanceLocal = Math.max(0, totalAmountLocal - effectivePaidLocal - walletAmtLocal - giftAmtLocal);
                                const paymentAmountLocal = remainingBalanceLocal > 0 ? remainingBalanceLocal : totalAmountLocal;
                                const isPartiallyPaidLocal = effectivePaidLocal > 0 && remainingBalanceLocal > 0;
                                
                                const manualConfirm = confirm(
                                  `No Yoco devices found. Do you want to manually record this card payment${isPartiallyPaidLocal ? ` of R${remainingBalanceLocal.toFixed(2)} (remaining balance)` : ''}?`
                                );
                                if (!manualConfirm) return;

                                // Manual card payment
                                const response = await fetch(`/api/provider/bookings/${activeBookingId}/mark-paid`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    payment_method: 'card',
                                    amount: paymentAmountLocal,
                                    notes: isPartiallyPaidLocal 
                                      ? `Manual card payment - remaining balance of R${remainingBalanceLocal.toFixed(2)}`
                                      : 'Manual card payment (no Yoco device)'
                                  })
                                });
                                if (!response.ok) throw new Error('Failed to mark as paid');
                                
                                // Update the appointment state immediately
                                if (selectedAppointment) {
                                  updateSelectedAppointment({
                                    ...selectedAppointment,
                                    payment_status: 'paid',
                                  });
                                }
                                
                                toast.success('Card payment recorded manually');
                                onAppointmentCreated?.(selectedAppointment);
                                onRefresh?.();
                                return;
                              }

                              // Show terminal selection if multiple devices
                              let selectedDeviceId = terminals[0].id;
                              if (terminals.length > 1) {
                                const deviceOptions = terminals.map((t: any, i: number) => 
                                  `${i + 1}. ${t.name}${t.location_name ? ` (${t.location_name})` : ''}`
                                ).join('\n');
                                const selection = prompt(`Select Yoco device (enter number 1-${terminals.length}):\n${deviceOptions}`);
                                if (!selection) return;
                                const index = parseInt(selection) - 1;
                                if (index < 0 || index >= terminals.length) {
                                  toast.error('Invalid device selection');
                                  return;
                                }
                                selectedDeviceId = terminals[index].id;
                              }

                              // Process Yoco POS payment
                              toast.info('Processing payment on Yoco terminal...');
                              const paymentResponse = await fetch('/api/provider/yoco/payments', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  device_id: selectedDeviceId,
                                  amount: paymentAmountCard,
                                  currency: portalProvider?.currency?.trim() || LAST_RESORT_CURRENCY,
                                  appointment_id: activeBookingId,
                                  metadata: {
                                    client_name: selectedAppointment.client_name,
                                    service_name: selectedAppointment.service_name,
                                  }
                                })
                              });

                              if (!paymentResponse.ok) {
                                const errorData = await paymentResponse.json();
                                throw new Error(errorData.error?.message || 'Yoco payment failed');
                              }

                              const paymentData = await paymentResponse.json();
                              
                              // Mark booking as paid - calculate payment amount
                              const totalPaidYoco = Number((selectedAppointment as any).total_paid || 0);
                              const totalRefundedYoco = Number((selectedAppointment as any).total_refunded || 0);
                              const walletAmtYoco = Number((selectedAppointment as any).wallet_amount || 0);
                              const giftAmtYoco = Number((selectedAppointment as any).gift_card_amount || 0);
                              const totalAmountYoco = selectedAppointment.total_amount || 0;
                              const effectivePaidYoco = Math.max(0, totalPaidYoco - totalRefundedYoco);
                              const remainingBalanceYoco = Math.max(0, totalAmountYoco - effectivePaidYoco - walletAmtYoco - giftAmtYoco);
                              const paymentAmountYoco = remainingBalanceYoco > 0 ? remainingBalanceYoco : totalAmountYoco;
                              const isPartiallyPaidYoco = effectivePaidYoco > 0 && remainingBalanceYoco > 0;
                              
                              const markPaidResponse = await fetch(`/api/provider/bookings/${activeBookingId}/mark-paid`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  payment_method: 'card',
                                  amount: paymentAmountYoco,
                                  reference: paymentData.data?.yoco_payment_id,
                                  notes: isPartiallyPaidYoco 
                                    ? `Yoco POS payment - Remaining balance R${remainingBalanceYoco.toFixed(2)} - Device: ${terminals.find((t: any) => t.id === selectedDeviceId)?.name}`
                                    : `Yoco POS payment - Device: ${terminals.find((t: any) => t.id === selectedDeviceId)?.name}`
                                })
                              });
                              
                              if (!markPaidResponse.ok) {
                                throw new Error('Failed to mark booking as paid');
                              }
                              
                              // Update the appointment state immediately
                              if (selectedAppointment) {
                                updateSelectedAppointment({
                                  ...selectedAppointment,
                                  payment_status: 'paid',
                                });
                              }

                              toast.success('Yoco payment successful!');
                              onAppointmentCreated?.(selectedAppointment);
                              onRefresh?.();
                            } catch (error: any) {
                              toast.error(error.message || 'Failed to process card payment');
                              console.error(error);
                            }
                          }}
                        >
                          <CreditCard className="w-3 h-3 mr-1.5" />
                          Card (Yoco POS)
                        </Button>

                        <div className="flex items-center gap-2">
                          <Button 
                            className="flex-1 text-xs" 
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const response = await fetch(`/api/provider/bookings/${activeBookingId}/send-payment-link`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    delivery_method: 'both'
                                  })
                                });
                                if (!response.ok) throw new Error('Failed to send payment link');
                                toast.success('Paystack payment link sent via SMS');
                              } catch (error) {
                                toast.error('Failed to send payment link');
                                console.error(error);
                              }
                            }}
                          >
                            <Send className="w-3 h-3 mr-1.5" />
                            Send Paystack Link
                          </Button>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                                  aria-label="Payment link information"
                                >
                                  <Info className="w-4 h-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-[200px]">
                                <p className="text-xs">
                                  Payment link will be sent to the customer via SMS
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Refund Button (for paid or partially_paid bookings) */}
                    {(selectedAppointment.payment_status === 'paid' || selectedAppointment.payment_status === 'partially_paid') && (
                      <>
                        <Button 
                          className="w-full text-xs" 
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            // For partially_paid, fetch available refund amount
                            let availableRefund = selectedAppointment.total_amount || 0;
                            
                            if (selectedAppointment.payment_status === 'partially_paid') {
                              try {
                                const paymentsResponse = await fetch(`/api/provider/bookings/${activeBookingId}/payments`);
                                if (paymentsResponse.ok) {
                                  const paymentsData = await paymentsResponse.json();
                                  const totalPaid = paymentsData.data?.summary?.total_paid || 0;
                                  const totalRefunded = paymentsData.data?.summary?.total_refunded || 0;
                                  availableRefund = totalPaid - totalRefunded;
                                }
                              } catch {
                                console.warn('Failed to fetch payment details, using total amount');
                              }
                            }
                            
                            setRefundAmount(availableRefund);
                            setRefundReason("");
                            setShowRefundDialog(true);
                          }}
                        >
                          <RotateCcw className="w-3 h-3 mr-1.5" />
                          Issue Refund
                        </Button>
                        
                        {/* Refund Dialog */}
                        <AlertDialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Issue Refund</AlertDialogTitle>
                              <AlertDialogDescription>
                                Enter the refund reason and confirm the amount.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="refund-reason">Refund Reason</Label>
                                <Textarea
                                  id="refund-reason"
                                  placeholder="Enter refund reason..."
                                  value={refundReason}
                                  onChange={(e) => setRefundReason(e.target.value)}
                                  rows={3}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="refund-amount">Refund Amount</Label>
                                <Input
                                  id="refund-amount"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={selectedAppointment.total_amount || 0}
                                  value={refundAmount}
                                  onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                                />
                                <p className="text-xs text-gray-500">
                                  {selectedAppointment.payment_status === 'partially_paid' 
                                    ? `Available to refund: R${refundAmount.toFixed(2)} (of R${selectedAppointment.total_amount?.toFixed(2) || '0.00'} total)`
                                    : `Full amount: R${selectedAppointment.total_amount?.toFixed(2) || '0.00'}`
                                  }
                                </p>
                              </div>
                            </div>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => {
                                setShowRefundDialog(false);
                                setRefundReason("");
                                setRefundAmount(0);
                              }}>
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  if (!refundReason.trim()) {
                                    toast.error('Please enter a refund reason');
                                    return;
                                  }
                                  if (refundAmount <= 0) {
                                    toast.error('Refund amount must be greater than 0');
                                    return;
                                  }
                                  
                                  try {
                                    const response = await fetch(`/api/provider/bookings/${activeBookingId}/refund`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        amount: refundAmount,
                                        reason: refundReason.trim(),
                                      })
                                    });
                                    
                                    if (!response.ok) {
                                      const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
                                      const errorMessage = errorData?.error?.message || 'Failed to process refund';
                                      throw new Error(errorMessage);
                                    }
                                    
                                    const result = await response.json();
                                    
                                    // Update the appointment state immediately
                                    if (selectedAppointment) {
                                      // After refund, status could be 'refunded' or 'partially_paid'
                                      const newStatus = refundAmount >= (selectedAppointment.total_amount || 0) 
                                        ? 'refunded' 
                                        : 'partially_paid';
                                      
                                      updateSelectedAppointment({
                                        ...selectedAppointment,
                                        payment_status: newStatus,
                                      });
                                    }
                                    
                                    toast.success(result.message || 'Refund processed successfully');
                                    setShowRefundDialog(false);
                                    setRefundReason("");
                                    setRefundAmount(0);
                                    onAppointmentCreated?.(selectedAppointment);
                                    onRefresh?.();
                                  } catch (error: any) {
                                    const errorMessage = error?.message || 'Failed to process refund';
                                    toast.error(errorMessage);
                                    console.error('Refund error:', error);
                                  }
                                }}
                                disabled={!refundReason.trim() || refundAmount <= 0}
                              >
                                Issue Refund
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
                
                <Separator />
              </>
            )}

            {/* Referral source */}
            {(mode === "create" || mode === "edit") && (
              <div className="space-y-2">
                <label className="text-[11px] text-gray-500 font-medium">How did this client find you?</label>
                <Select
                  value={formData.referralSourceId || "none"}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, referralSourceId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue placeholder="Select source (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {referralSources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "view" && (formData.referralSourceId && referralSources.length > 0) && (
              <div className="space-y-3">
                <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Referral source
                </Label>
                <p className="text-sm text-gray-700">
                  {referralSources.find(s => s.id === formData.referralSourceId)?.name ?? "—"}
                </p>
              </div>
            )}

            {/* Online booking: platform custom fields (when loaded on appointment) */}
            {mode === "view" &&
              selectedAppointment?.custom_field_values &&
              typeof selectedAppointment.custom_field_values === "object" &&
              Object.keys(selectedAppointment.custom_field_values).length > 0 && (
                <div className="space-y-3">
                  <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Additional booking details
                  </Label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                    {Object.entries(selectedAppointment.custom_field_values).map(([name, value]) => (
                      <div key={name} className="flex justify-between gap-2 text-sm">
                        <span className="text-gray-600">{name}</span>
                        <span className="text-gray-900 font-medium text-right break-all">
                          {value === null || value === undefined ? "—" : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Online booking: provider intake / consent / waiver forms */}
            {mode === "view" &&
              selectedAppointment?.provider_form_responses &&
              typeof selectedAppointment.provider_form_responses === "object" &&
              Object.keys(selectedAppointment.provider_form_responses).length > 0 && (
                <div className="space-y-3">
                  <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Client forms
                  </Label>
                  <div className="space-y-3">
                    {Object.entries(selectedAppointment.provider_form_responses).map(([formId, fields]) => {
                      if (!fields || typeof fields !== "object") return null;
                      const formMeta = providerFormDefs.find((f) => f.id === formId);
                      const formTitle = formMeta?.title ?? `Form ${formId.slice(0, 8)}…`;
                      const getFieldLabel = (fieldKey: string) =>
                        formMeta?.fields?.find((f) => f.id === fieldKey)?.name ?? fieldKey.slice(0, 8) + "…";
                      const entries = Object.entries(fields as Record<string, unknown>).filter(
                        ([k]) => k !== "_consent_document_url",
                      );
                      const consentUrl =
                        typeof (fields as Record<string, unknown>)._consent_document_url === "string"
                          ? ((fields as Record<string, unknown>)._consent_document_url as string)
                          : undefined;
                      return (
                        <div key={formId} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                          <p className="text-sm font-semibold text-gray-800">{formTitle}</p>
                          <dl className="space-y-1.5">
                            {entries.map(([fieldKey, value]) => (
                              <div key={fieldKey} className="flex justify-between gap-2 text-sm">
                                <dt className="text-gray-600">{getFieldLabel(fieldKey)}</dt>
                                <dd className="text-gray-900 font-medium text-right break-all">
                                  {value === null || value === undefined ? "—" : String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          {consentUrl ? (
                            <a
                              href={consentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-primary hover:underline inline-block"
                            >
                              View consent document
                            </a>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Payment Method (CREATE mode) */}
            {mode === "create" && (
              <div className="space-y-2">
                <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5" />
                  Payment
                </Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { value: "pay_later" as const, label: "Pay Later", icon: Clock },
                    { value: "cash" as const, label: "Cash", icon: Receipt },
                    { value: "yoco_pos" as const, label: "Card (Yoco)", icon: CreditCard },
                    { value: "payment_link" as const, label: "Payment Link", icon: Send },
                  ] as const).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, paymentMethod: value }))}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all",
                        formData.paymentMethod === value
                          ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
                {/* Gift card redemption requires reserve/capture/void RPC integration — deferred */}
              </div>
            )}

            {/* Deposit toggle — when enabled, only the deposit amount is collected now; balance is due later */}
            {(mode === "create" || mode === "edit") && depositSettings.required && formData.totalAmount > 0 && (
              <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-[11px] text-gray-600 font-medium">
                      Collect deposit only
                    </span>
                  </div>
                  <Switch
                    checked={collectDeposit}
                    onCheckedChange={setCollectDeposit}
                    className="scale-75"
                  />
                </div>
                {collectDeposit && (
                  <div className="text-[11px] text-gray-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Deposit ({depositSettings.percentage}%)</span>
                      <span className="font-medium text-gray-700">
                        {formatMoney(Math.ceil((formData.totalAmount * depositSettings.percentage) / 100))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Balance due later</span>
                      <span className="font-medium text-gray-700">
                        {formatMoney(formData.totalAmount - Math.ceil((formData.totalAmount * depositSettings.percentage) / 100))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-[11px] text-gray-500 font-medium flex items-center gap-1.5">
                <StickyNote className="w-3 h-3" />
                Special requests / notes
              </label>
              {mode === "view" ? (
                formData.notes ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{formData.notes}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No notes added</p>
                )
              ) : (
                <Textarea
                  placeholder="Add special requests or notes…"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="rounded-xl resize-none"
                />
              )}
            </div>

            {/* Notification Toggle (EDIT mode) */}
            {mode === "edit" && (
              <>
                <Separator />
                <NotificationToggle
                  checked={sendNotification}
                  onCheckedChange={setSendNotification}
                  label="Notify client of changes"
                  description="Send notification if date/time changed"
                />
              </>
            )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="border-t bg-white flex-shrink-0 box-border pb-safe">
          {mode === "create" && (
            <div className="p-3 sm:p-4 pb-20 md:pb-3 sm:pb-4 space-y-2">
              {formData.services.length > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                  <span>{formData.services.length} service{formData.services.length !== 1 ? 's' : ''} · {formData.services.reduce((sum, s) => sum + s.duration + (s.addons?.reduce((a, ad) => a + ad.duration, 0) || 0), 0)} min</span>
                  <span className="font-semibold text-gray-900 text-sm">{formatMoney(formData.totalAmount)}</span>
                </div>
              )}
              <Button
                className={cn(
                  "w-full h-12 rounded-xl text-sm font-semibold shadow-lg transition-all",
                  slotAvailability.checked && !slotAvailability.available
                    ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/25"
                    : "bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 shadow-pink-600/25",
                )}
                onClick={handleCreate}
                disabled={isSaving || !formData.clientName || (!formData.serviceId && formData.services.length === 0)}
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating…
                  </span>
                ) : slotAvailability.checked && !slotAvailability.available ? (
                  <span className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Book Anyway
                  </span>
                ) : (
                  "Book Appointment"
                )}
              </Button>
            </div>
          )}
          {mode === "edit" && (
            <div className="flex gap-2 p-3 sm:p-4 pb-20 md:pb-3 sm:pb-4">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-xl text-sm"
                onClick={switchToViewMode}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-11 rounded-xl text-sm font-semibold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 shadow-lg shadow-pink-600/25"
                onClick={handleUpdate}
                disabled={isSaving}
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </span>
                ) : "Save Changes"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Select a cancellation reason:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={cancelReason} onValueChange={(v) => setCancelReason(v as CancelReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal Cancellation</SelectItem>
                <SelectItem value="late_cancel">Late Cancellation</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
              </SelectContent>
            </Select>
            <div className="mt-4">
              <NotificationToggle
                checked={sendNotification}
                onCheckedChange={setSendNotification}
                label="Notify client"
                compact
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleCancel}
            >
              Cancel Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this appointment. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Provider-to-Client Rating Dialog */}
      {selectedAppointment && (
        <ProviderClientRatingDialog
          open={showRatingDialog}
          onOpenChange={setShowRatingDialog}
          bookingId={activeBookingId}
          customerName={selectedAppointment.client_name || "Client"}
          locationId={selectedAppointment.location_id || null}
          locationName={selectedAppointment.location_name || null}
          requireRating
onRatingSubmitted={() => {
            onRefresh?.();
            setShowPostNudge(true);
          }}
        />
      )}
      <PostForRewardNudge open={showPostNudge} onOpenChange={setShowPostNudge} />

      {/* Variant Selection Dialog */}
      <AlertDialog open={selectedServiceForVariant !== null} onOpenChange={(open) => !open && setSelectedServiceForVariant(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select Variant</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a variant for this service
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {selectedServiceForVariant && loadingVariants[selectedServiceForVariant] ? (
              <p className="text-sm text-gray-500 text-center py-4">Loading variants...</p>
            ) : selectedServiceForVariant && serviceVariants[selectedServiceForVariant]?.length ? (
              serviceVariants[selectedServiceForVariant].map((variant: any) => {
                const baseService = services.find(s => s.id === selectedServiceForVariant);
                return (
                  <button
                    key={variant.id}
                    type="button"
                    className="w-full p-3 text-left border rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation"
                    onClick={() => {
                      if (baseService) {
                        addService(baseService, variant.id, variant.variant_name || variant.title);
                      } else if (variant.id && (variant.variant_name || variant.title)) {
                        const pseudoService: ServiceItem = {
                          id: variant.id,
                          name: variant.variant_name || variant.title || "Service",
                          category_id: "",
                          duration_minutes: variant.duration_minutes ?? 60,
                          price: variant.price ?? 0,
                          is_active: true,
                          order: 0,
                        };
                        addService(pseudoService);
                      }
                      setSelectedServiceForVariant(null);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{variant.variant_name || variant.title}</p>
                        <p className="text-sm text-gray-500">{variant.duration} min</p>
                      </div>
                      <p className="font-semibold">{formatMoney(variant.price)}</p>
                    </div>
                  </button>
                );
              })
            ) : selectedServiceForVariant ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">No variants available for this service.</p>
                <button
                  type="button"
                  className="mt-2 text-sm text-blue-600 hover:underline"
                  onClick={() => {
                    const baseService = services.find(s => s.id === selectedServiceForVariant);
                    if (baseService) addService(baseService);
                    setSelectedServiceForVariant(null);
                  }}
                >
                  Add base service instead
                </button>
              </div>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Addon Selection Dialog */}
      <AlertDialog open={selectedServiceForAddon !== null} onOpenChange={(open) => !open && setSelectedServiceForAddon(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add Add-ons</AlertDialogTitle>
            <AlertDialogDescription>
              Select add-ons for this service
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {selectedServiceForAddon && (() => {
              const service = formData.services.find(s => s.id === selectedServiceForAddon);
              const addons = service ? serviceAddons[service.serviceId] : [];
              return addons && addons.length > 0 ? (
                addons.map((addon: any) => {
                  const isSelected = service?.addons?.some(a => a.addonId === addon.id);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => {
                        if (service && !isSelected) {
                          addAddonToService(service.id, addon);
                        }
                        setSelectedServiceForAddon(null);
                      }}
                      disabled={isSelected}
                      className={`w-full p-3 text-left border rounded-lg touch-manipulation transition-colors ${
                        isSelected ? "bg-gray-100 opacity-50 cursor-not-allowed" : "hover:bg-gray-50 active:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{addon.title || addon.name}</p>
                          <p className="text-sm text-gray-500">{addon.duration || 0} min</p>
                        </div>
                        <p className="font-semibold">{formatMoney(addon.price)}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  {selectedServiceForAddon && (() => {
                    const service = formData.services.find(s => s.id === selectedServiceForAddon);
                    return loadingAddons[service?.serviceId || ""] ? "Loading addons..." : "No addons available";
                  })()}
                </p>
              );
            })()}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* New Client Dialog */}
      <AlertDialog open={showNewClientDialog} onOpenChange={setShowNewClientDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create New Client</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the client's information to create a new client profile
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name *</Label>
                <Input
                  value={newClientData.first_name}
                  onChange={(e) => setNewClientData(prev => ({ ...prev, first_name: e.target.value }))}
                  placeholder="First name"
                />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input
                  value={newClientData.last_name}
                  onChange={(e) => setNewClientData(prev => ({ ...prev, last_name: e.target.value }))}
                  placeholder="Last name"
                />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={newClientData.email}
                onChange={(e) => setNewClientData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Enter email address"
              />
            </div>
            <div>
              <PhoneInput
                inputId="appointment-sidebar-new-client-phone"
                label="Phone"
                value={newClientData.phone}
                onChange={(e164) => setNewClientData((prev) => ({ ...prev, phone: e164 }))}
                placeholder="Phone number"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setNewClientData({ first_name: "", last_name: "", email: "", phone: "" });
              setShowNewClientDialog(false);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateNewClient}>
              Create Client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default AppointmentSidebar;
