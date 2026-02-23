"use client";

/**
 * Appointment Sidebar - Mangomint-style right panel
 * 
 * Supports three modes:
 * - CREATE: New appointment with prefilled slot data
 * - VIEW: View existing appointment details
 * - EDIT: Edit existing appointment
 * 
 * @module components/appointments/AppointmentSidebar
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
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
} from "lucide-react";

import type { Appointment, TeamMember, ServiceItem, ProductItem, Salon } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { fetcher } from "@/lib/http/fetcher";
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
import { PostForRewardNudge } from "@/components/provider/PostForRewardNudge";
import { getStatusColors } from "@/lib/scheduling/visualMapping";
import { DEFAULT_APPOINTMENT_STATUS } from "@/lib/provider-portal/constants";
import { computeTravelFee, DEFAULT_TRAVEL_FEE_RULES, type TravelFeeRules } from "@/lib/travel/travelFeeEngine";
import { NotificationToggle } from "@/components/calendar/NotificationToggle";

// ============================================================================
// TYPES
// ============================================================================

interface AppointmentSidebarProps {
  teamMembers: TeamMember[];
  services: ServiceItem[];
  products?: ProductItem[]; // Optional products list
  locations: Salon[];
  onAppointmentCreated?: (appointment: Appointment) => void;
  onAppointmentUpdated?: (appointment: Appointment) => void;
  onAppointmentDeleted?: (appointmentId: string) => void;
  onRefresh?: () => void;
}

interface AppointmentService {
  id: string;
  serviceId: string;
  serviceName: string;
  duration: number;
  price: number;
  customization?: string;
  addons?: Array<{
    id: string;
    addonId: string;
    addonName: string;
    price: number;
    duration: number;
  }>;
  variantId?: string;
  variantName?: string;
}

interface AppointmentProduct {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface CreateFormData {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  kind: AppointmentKind;
  locationId: string;
  staffId: string;
  date: string;
  startTime: string;
  duration: number;
  serviceId: string; // Keep for backward compatibility
  serviceName: string; // Keep for backward compatibility
  price: number; // Keep for backward compatibility
  services: AppointmentService[]; // Multiple services
  products: AppointmentProduct[]; // Products
  notes: string;
  status: string; // For editing existing appointments
  // Pricing breakdown
  subtotal: number;
  discountAmount: number;
  discountCode?: string;
  discountReason?: string;
  taxAmount: number;
  taxRate: number;
  serviceFeePercentage: number;
  serviceFeeAmount: number;
  tipAmount: number;
  totalAmount: number;
  // At-home fields
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressPostalCode: string;
  travelFee: number;
  // Travel override fields (Phase 3)
  travelTimeOverride: number | null;
  travelFeeOverride: number | null;
  travelOverrideReason: string;
  hasTravelOverride: boolean;
  referralSourceId: string;
}

type CancelReason = "normal" | "late_cancel" | "no_show";

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
    travelFee: 0,
    travelTimeOverride: null,
    travelFeeOverride: null,
    travelOverrideReason: "",
    hasTravelOverride: false,
    referralSourceId: "",
  });

  // Referral sources (for "Where did this client come from?")
  const [referralSources, setReferralSources] = useState<Array<{ id: string; name: string; description?: string | null; is_active: boolean }>>([]);

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
  const [selectedServiceForVariant, setSelectedServiceForVariant] = useState<string | null>(null);
  const [selectedServiceForAddon, setSelectedServiceForAddon] = useState<string | null>(null);
  
  // New client creation state
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);
  const [newClientData, setNewClientData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    countryCode: "+27", // Default to South Africa
  });
  const [phoneValidationError, setPhoneValidationError] = useState<string>("");
  
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
  
  const handleSelectClient = (client: { id: string; full_name: string; email?: string; phone?: string }) => {
    setFormData(prev => ({
      ...prev,
      clientName: client.full_name,
      clientEmail: client.email || "",
      clientPhone: client.phone || "",
    }));
    setClientSearchQuery("");
    setClientSearchResults([]);
    setShowClientSearch(false);
  };
  
  // Format phone number to E.164 format (required by Supabase Auth)
  const _formatPhoneToE164 = (phone: string, countryCode: string = "+27"): string | undefined => {
    if (!phone || !phone.trim()) {
      return undefined;
    }
    
    // Remove all whitespace and non-digit characters
    let cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
    
    // If it already starts with +, validate it
    if (cleaned.startsWith('+')) {
      // E.164 format: + followed by country code and number (min 7 digits after country code)
      // Minimum valid length: +1 + 7 digits = 9 characters
      if (cleaned.length >= 9 && /^\+[1-9]\d{7,}$/.test(cleaned)) {
        return cleaned;
      }
      // Invalid format, return undefined
      return undefined;
    }
    
    // Remove all non-digit characters
    cleaned = cleaned.replace(/[^\d]/g, '');
    
    if (cleaned.length === 0) {
      return undefined;
    }
    
    // If it starts with 0, remove the leading 0 and use the selected country code
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }
    
    // Combine country code with phone number
    const formatted = countryCode + cleaned;
    
    // Validate length (minimum 9 characters: country code + 7 digits)
    if (formatted.length >= 9 && /^\+[1-9]\d{7,}$/.test(formatted)) {
      return formatted;
    }
    
    // Invalid format
    return undefined;
  };
  
  const handleCreateNewClient = useCallback(async () => {
    if (!newClientData.first_name.trim() || !newClientData.last_name.trim()) {
      toast.error("First name and last name are required");
      return;
    }
    
    // Validate phone number if provided
    const phone = newClientData.phone.trim();
    if (phone) {
      // Remove spaces, dashes, parentheses
      const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
      
      // Check if it starts with + (international format)
      if (cleanPhone.startsWith('+')) {
        // International format: +27 followed by 9 digits (South Africa example)
        const digits = cleanPhone.substring(1).replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) {
          setPhoneValidationError("Phone number must be 10-15 digits (including country code)");
          toast.error("Invalid phone number length");
          return;
        }
      } else if (cleanPhone.startsWith('0')) {
        // Local format: 0 followed by 9 digits (South Africa example)
        const digits = cleanPhone.replace(/\D/g, '');
        if (digits.length !== 10) {
          setPhoneValidationError("Phone number must be 10 digits (e.g., 0823456789)");
          toast.error("Invalid phone number length");
          return;
        }
      } else {
        // No prefix - assume it needs country code
        const digits = cleanPhone.replace(/\D/g, '');
        if (digits.length !== 9) {
          setPhoneValidationError("Phone number must be 9 digits without leading 0");
          toast.error("Invalid phone number length");
          return;
        }
      }
      
      // Clear validation error if we got here
      setPhoneValidationError("");
    }
    
    // Parse phone number to extract country code and number (same format as clients page)
    const phoneMatch = phone.match(/^(\+\d{1,4})\s*(.+)$/);
    const phoneNumber = phoneMatch ? phoneMatch[2] : phone;
    const countryCode = phoneMatch ? phoneMatch[1] : newClientData.countryCode;
    
    // Prepare request body - use same format as clients page
    const requestBody: {
      first_name: string;
      last_name: string;
      full_name: string;
      email?: string;
      phone?: string;
      countryCode?: string;
    } = {
      first_name: newClientData.first_name.trim(),
      last_name: newClientData.last_name.trim(),
      full_name: `${newClientData.first_name.trim()} ${newClientData.last_name.trim()}`.trim(),
    };
    
    if (newClientData.email.trim()) {
      requestBody.email = newClientData.email.trim();
    }
    
    // Format phone same way as clients page: "countryCode phoneNumber"
    // Also send countryCode separately for proper normalization
    if (phoneNumber) {
      requestBody.phone = `${countryCode} ${phoneNumber}`.trim();
      requestBody.countryCode = countryCode; // Send separately for phone normalization
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
      
      // Update form data with new client
      setFormData(prev => ({
        ...prev,
        clientName: customer.full_name || `${newClientData.first_name} ${newClientData.last_name}`.trim(),
        clientEmail: customer.email || newClientData.email || "",
        clientPhone: customer.phone || newClientData.phone || "",
      }));
      
      // Reset and close dialog
      setNewClientData({ first_name: "", last_name: "", email: "", phone: "", countryCode: "+27" });
      setPhoneValidationError("");
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
        } catch (error) {
          console.warn("Failed to load settings, using defaults:", error);
        }
      };
    loadSettings();
  }, []); // Run once on mount so tax/travel/settings are ready when sidebar opens

  // Handle Escape key to close sidebar
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSidebar();
      }
    };
    
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, closeSidebar]);

  // Fetch full booking data when opening in view mode (calendar passes expanded/incomplete data)
  useEffect(() => {
    if (mode !== "view" || !selectedAppointment?.id || !updateSelectedAppointment) return;
    const existingServices = (selectedAppointment as any).services;
    if (Array.isArray(existingServices) && existingServices.length > 0) {
      return; // Already have full data (e.g. from /provider/appointments)
    }
    const fetchFullAppointment = async () => {
      try {
        setLoading(true);
        const fullAppointment = await providerApi.getAppointment(selectedAppointment.id);
        updateSelectedAppointment(fullAppointment);
      } catch (err) {
        console.warn("Could not fetch full appointment data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchFullAppointment();
  }, [mode, selectedAppointment?.id]);

  // Listen for custom event to open sidebar in CREATE mode (from /provider/appointments)
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

  // Helper function to calculate pricing
  const calculatePricing = useCallback((servicesList: AppointmentService[], productsList: AppointmentProduct[], travelFee: number, discountAmount: number, taxRate: number, serviceFeePercentage: number, tipAmount: number) => {
    const servicesSubtotal = servicesList.reduce((sum, s) => {
      const servicePrice = s.price;
      const addonsPrice = s.addons?.reduce((a, ad) => a + ad.price, 0) || 0;
      return sum + servicePrice + addonsPrice;
    }, 0);
    const productsSubtotal = productsList.reduce((sum, p) => sum + p.totalPrice, 0);
    const subtotal = servicesSubtotal + productsSubtotal;
    const afterDiscount = subtotal - discountAmount;
    // Tax is calculated on the subtotal after discount
    const taxAmount = afterDiscount * taxRate;
    // Service fee is calculated on the subtotal after discount (NOT including tax)
    const serviceFeeAmount = afterDiscount * serviceFeePercentage;
    const totalAmount = afterDiscount + taxAmount + travelFee + serviceFeeAmount + tipAmount;
    
    return {
      subtotal,
      afterDiscount,
      taxAmount,
      serviceFeeAmount,
      totalAmount,
    };
  }, []);

  // Load service variants
  const loadServiceVariants = useCallback(async (serviceId: string) => {
    if (serviceVariants[serviceId] || loadingVariants[serviceId]) return;
    
    try {
      setLoadingVariants(prev => ({ ...prev, [serviceId]: true }));
      const response = await fetcher.get<{ data: { variants: any[] } }>(
        `/api/provider/services/${serviceId}/variants`
      );
      if (response.data?.variants && response.data.variants.length > 0) {
        setServiceVariants(prev => ({
          ...prev,
          [serviceId]: response.data.variants,
        }));
      }
    } catch (error) {
      console.error("Error loading variants:", error);
    } finally {
      setLoadingVariants(prev => ({ ...prev, [serviceId]: false }));
    }
  }, [serviceVariants, loadingVariants]);
  
  // Load service addons
  const loadServiceAddons = useCallback(async (serviceId: string) => {
    if (serviceAddons[serviceId] || loadingAddons[serviceId]) return;
    
    try {
      setLoadingAddons(prev => ({ ...prev, [serviceId]: true }));
      const response = await fetcher.get<{ data: { addons: any[] } }>(
        `/api/provider/services/${serviceId}/addons`
      );
      if (response.data?.addons && response.data.addons.length > 0) {
        setServiceAddons(prev => ({
          ...prev,
          [serviceId]: response.data.addons,
        }));
      }
    } catch (error) {
      console.error("Error loading addons:", error);
    } finally {
      setLoadingAddons(prev => ({ ...prev, [serviceId]: false }));
    }
  }, [serviceAddons, loadingAddons]);

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
      
      // Auto-apply 5% tip for the first service in CREATE mode
      const isFirstService = prev.services.length === 0 && mode === "create";
      let tipToUse = prev.tipAmount;
      
      if (isFirstService) {
        // Calculate 5% of the new subtotal
        const tempPricing = calculatePricing(newServices, prev.products, prev.travelFee, prev.discountAmount, prev.taxRate, serviceFeeToUse, 0);
        tipToUse = tempPricing.subtotal * 0.05; // 5% default tip
      }
      
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
        duration: newServices.reduce((sum, s) => sum + s.duration, 0),
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
  // Always create a new line item, even for the same product, so each can be edited independently
  const addProduct = useCallback((product: ProductItem, quantity: number = 1) => {
    // Always create a new line item with unique ID
    const newProduct: AppointmentProduct = {
      id: `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // More unique ID
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice: product.retail_price,
      totalPrice: product.retail_price * quantity,
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
      // Use booking ID (handle composite id from calendar: bookingId-svc-0)
      const bookingId = selectedAppointment.id.includes("-svc-")
        ? selectedAppointment.id.split("-svc-")[0]
        : selectedAppointment.id;
      const refNumber = selectedAppointment.ref_number;
      
      if (!bookingId) {
        throw new Error("Appointment ID is missing");
      }
      
      console.log("Generating invoice for:", {
        bookingId,
        refNumber,
        appointmentId: selectedAppointment.id,
        clientName: selectedAppointment.client_name,
        serviceName: selectedAppointment.service_name,
        scheduledDate: selectedAppointment.scheduled_date,
        status: selectedAppointment.status,
        hasId: !!bookingId,
        idType: typeof bookingId,
        idLength: bookingId?.length
      });
      
      // Fetch booking receipt data from API (not platform invoices)
      const response = await fetch(`/api/provider/bookings/${bookingId}/receipt`);
      
      // Check if response is ok before parsing JSON
      if (!response.ok) {
        let result;
        try {
          result = await response.json();
        } catch {
          // If JSON parsing fails, use status text
          const statusText = response.statusText || `HTTP ${response.status}`;
          console.error("Invoice API error (non-JSON response):", { 
            bookingId, 
            status: response.status, 
            statusText 
          });
          throw new Error(`Failed to generate invoice: ${statusText}`);
        }
        
        // Handle different error response formats
        let errorMessage = "Failed to generate invoice";
        
        if (result.error) {
          if (typeof result.error === 'string') {
            errorMessage = result.error;
          } else if (result.error.message) {
            errorMessage = result.error.message;
          } else if (result.error.code) {
            errorMessage = `Error: ${result.error.code}`;
          } else if (Object.keys(result.error).length === 0) {
            // Empty error object - use status code
            errorMessage = `Booking not found (Status: ${response.status})`;
          }
        } else if (result.message) {
          errorMessage = result.message;
        } else {
          // No error structure found, use status
          errorMessage = `Failed to generate invoice (Status: ${response.status})`;
        }
        
        console.error("Invoice API error:", { 
          bookingId, 
          status: response.status, 
          statusText: response.statusText,
          result: result,
          error: result.error,
          fullResponse: JSON.stringify(result, null, 2)
        });
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      
      const invoiceData = result.data;
      
      if (!invoiceData) {
        throw new Error("Invoice data is missing");
      }
      
      const invoiceWindow = window.open('', '_blank');
      if (!invoiceWindow) {
        toast.error("Please allow popups to print invoice");
        return;
      }
      
      const invoiceHTML = generateInvoiceHTMLFromData(invoiceData);
      invoiceWindow.document.write(invoiceHTML);
      invoiceWindow.document.close();
      invoiceWindow.focus();
      setTimeout(() => {
        invoiceWindow.print();
      }, 250);
    } catch (error) {
      console.error("Failed to generate invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate invoice");
    }
  }, [selectedAppointment]);

  const handleEmailInvoice = useCallback(async () => {
    if (!selectedAppointment) return;
    
    try {
      const bookingId = selectedAppointment.id.includes("-svc-")
        ? selectedAppointment.id.split("-svc-")[0]
        : selectedAppointment.id;
      
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
  }, [selectedAppointment]);


  // Generate invoice HTML from API data
  const generateInvoiceHTMLFromData = (invoiceData: any) => {
    const formatCurrency = (amount: number) => {
      return `${invoiceData.currency || 'ZAR'} ${amount.toFixed(2)}`;
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${invoiceData.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; }
            .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .section { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f5f5f5; }
            .total { font-size: 18px; font-weight: bold; }
            .text-right { text-align: right; }
            .summary { margin-top: 20px; }
            .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
            .summary-total { border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>INVOICE</h1>
            <p>Invoice #: ${invoiceData.invoice_number}</p>
            <p>Date: ${invoiceData.invoice_date}</p>
            ${invoiceData.booking_date ? `<p>Booking Date: ${invoiceData.booking_date}</p>` : ''}
          </div>
          
          <div class="invoice-details">
            <div>
              <h3>From:</h3>
              <p><strong>${invoiceData.provider.name}</strong></p>
              ${invoiceData.provider.email ? `<p>Email: ${invoiceData.provider.email}</p>` : ''}
              ${invoiceData.provider.phone ? `<p>Phone: ${invoiceData.provider.phone}</p>` : ''}
              ${invoiceData.provider.address.line1 ? `<p>${invoiceData.provider.address.line1}</p>` : ''}
              ${invoiceData.provider.address.line2 ? `<p>${invoiceData.provider.address.line2}</p>` : ''}
              ${invoiceData.provider.address.city ? `<p>${invoiceData.provider.address.city}${invoiceData.provider.address.state ? ', ' + invoiceData.provider.address.state : ''} ${invoiceData.provider.address.postal_code || ''}</p>` : ''}
            </div>
            <div>
              <h3>Bill To:</h3>
              <p><strong>${invoiceData.customer.name}</strong></p>
              ${invoiceData.customer.email ? `<p>Email: ${invoiceData.customer.email}</p>` : ''}
              ${invoiceData.customer.phone ? `<p>Phone: ${invoiceData.customer.phone}</p>` : ''}
            </div>
          </div>
          
          ${invoiceData.location_type === 'at_home' && invoiceData.service_address ? `
            <div class="section" style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
              <h3 style="margin-top: 0;">Service Location:</h3>
              ${invoiceData.service_address.line1 ? `<p style="margin: 5px 0;">${invoiceData.service_address.line1}</p>` : ''}
              ${invoiceData.service_address.line2 ? `<p style="margin: 5px 0;">${invoiceData.service_address.line2}</p>` : ''}
              ${invoiceData.service_address.city ? `<p style="margin: 5px 0;">${invoiceData.service_address.city}${invoiceData.service_address.state ? ', ' + invoiceData.service_address.state : ''} ${invoiceData.service_address.postal_code || ''}</p>` : ''}
            </div>
          ` : ''}
          
          <div class="section">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="text-right">Quantity</th>
                  <th class="text-right">Unit Price</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${invoiceData.items.map((item: any) => `
                  <tr>
                    <td>${item.description}${item.staff ? ` (${item.staff})` : ''}${item.duration ? ` (${item.duration} min)` : ''}</td>
                    <td class="text-right">${item.quantity}</td>
                    <td class="text-right">${formatCurrency(item.unit_price)}</td>
                    <td class="text-right">${formatCurrency(item.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="summary">
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>${formatCurrency(invoiceData.subtotal)}</span>
            </div>
            ${invoiceData.discount_amount > 0 ? `
              <div class="summary-row">
                <span>Discount${invoiceData.discount_reason ? ` (${invoiceData.discount_reason})` : ''}:</span>
                <span>-${formatCurrency(invoiceData.discount_amount)}</span>
              </div>
            ` : ''}
            ${invoiceData.travel_fee > 0 ? `
              <div class="summary-row">
                <span>Travel Fee:</span>
                <span>${formatCurrency(invoiceData.travel_fee)}</span>
              </div>
            ` : ''}
            ${invoiceData.tax_amount > 0 ? `
              <div class="summary-row">
                <span>Tax${invoiceData.tax_rate > 0 ? ` (${invoiceData.tax_rate.toFixed(1)}%)` : ''}:</span>
                <span>${formatCurrency(invoiceData.tax_amount)}</span>
              </div>
            ` : ''}
            ${(invoiceData as any).service_fee_amount > 0 ? `
              <div class="summary-row">
                <span>Service Fee${(invoiceData as any).service_fee_percentage > 0 ? ` (${((invoiceData as any).service_fee_percentage * 100).toFixed(1)}%)` : ''}:</span>
                <span>${formatCurrency((invoiceData as any).service_fee_amount)}</span>
              </div>
            ` : ''}
            ${invoiceData.tip_amount > 0 ? `
              <div class="summary-row">
                <span>Tip:</span>
                <span>${formatCurrency(invoiceData.tip_amount)}</span>
              </div>
            ` : ''}
            <div class="summary-row summary-total">
              <span>Total Amount:</span>
              <span>${formatCurrency(invoiceData.total_amount)}</span>
            </div>
          </div>
          
          ${invoiceData.payment_status ? `
            <div class="section" style="margin-top: 20px; padding: 10px; background-color: ${
              invoiceData.payment_status === 'paid' ? '#d4edda' : 
              invoiceData.payment_status === 'pending' ? '#fff3cd' : '#f8d7da'
            }; border-radius: 5px;">
              <p style="margin: 0;"><strong>Payment Status:</strong> ${
                invoiceData.payment_status === 'paid' ? 'PAID' :
                invoiceData.payment_status === 'pending' ? 'PENDING' :
                invoiceData.payment_status === 'failed' ? 'FAILED' :
                invoiceData.payment_status.toUpperCase()
              }</p>
            </div>
          ` : ''}
          
          ${invoiceData.notes ? `
            <div class="section">
              <h3>Notes:</h3>
              <p>${invoiceData.notes}</p>
            </div>
          ` : ''}
        </body>
      </html>
    `;
  };

  // Generate invoice HTML (legacy function for backward compatibility)
  const _generateInvoiceHTML = (data: CreateFormData, appointment: Appointment) => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${appointment.ref_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; }
            .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .section { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f5f5f5; }
            .total { font-size: 18px; font-weight: bold; }
            .text-right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>INVOICE</h1>
            <p>Reference: ${appointment.ref_number}</p>
            <p>Date: ${format(new Date(appointment.scheduled_date + 'T' + appointment.scheduled_time), 'PPP')}</p>
          </div>
          
          <div class="invoice-details">
            <div>
              <h3>Bill To:</h3>
              <p>${data.clientName}</p>
              ${data.clientEmail ? `<p>${data.clientEmail}</p>` : ''}
              ${data.clientPhone ? `<p>${data.clientPhone}</p>` : ''}
            </div>
          </div>
          
          <div class="section">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="text-right">Quantity</th>
                  <th class="text-right">Price</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${data.services.map(s => `
                  <tr>
                    <td>${s.serviceName}</td>
                    <td class="text-right">1</td>
                    <td class="text-right">R${s.price.toFixed(2)}</td>
                    <td class="text-right">R${s.price.toFixed(2)}</td>
                  </tr>
                `).join('')}
                ${data.products.map(p => `
                  <tr>
                    <td>${p.productName}</td>
                    <td class="text-right">${p.quantity}</td>
                    <td class="text-right">R${p.unitPrice.toFixed(2)}</td>
                    <td class="text-right">R${p.totalPrice.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="section">
            <table>
              <tr>
                <td class="text-right">Subtotal:</td>
                <td class="text-right">R${data.subtotal.toFixed(2)}</td>
              </tr>
              ${data.discountAmount > 0 ? `
                <tr>
                  <td class="text-right">Discount:</td>
                  <td class="text-right">-R${data.discountAmount.toFixed(2)}</td>
                </tr>
              ` : ''}
              ${data.taxAmount > 0 ? `
                <tr>
                  <td class="text-right">Tax (${data.taxRate * 100}%):</td>
                  <td class="text-right">R${data.taxAmount.toFixed(2)}</td>
                </tr>
              ` : ''}
              ${data.travelFee > 0 ? `
                <tr>
                  <td class="text-right">Travel Fee:</td>
                  <td class="text-right">R${data.travelFee.toFixed(2)}</td>
                </tr>
              ` : ''}
              ${data.tipAmount > 0 ? `
                <tr>
                  <td class="text-right">Tip:</td>
                  <td class="text-right">R${data.tipAmount.toFixed(2)}</td>
                </tr>
              ` : ''}
              <tr class="total">
                <td class="text-right">Total:</td>
                <td class="text-right">R${data.totalAmount.toFixed(2)}</td>
              </tr>
            </table>
          </div>
        </body>
      </html>
    `;
  };

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
        clientName: "",
        clientEmail: "",
        clientPhone: "",
        kind: initialKind,
        locationId: draftSlot.locationId || (locations[0]?.id ?? ""),
        staffId: staffIdToUse, // Always use draftSlot.staffId if available, otherwise preserve existing
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
        serviceFeePercentage: 0, // Provider-created appointments have no service fee
        serviceFeeAmount: 0, // Provider-created appointments have no service fee
        taxAmount: pricing.taxAmount,
        taxRate: defaultTaxRate, // This will be updated when provider settings load
        tipAmount: 0,
        totalAmount: pricing.totalAmount,
        addressLine1: "",
        addressLine2: "",
        addressCity: "",
        addressPostalCode: "",
        travelFee: 0,
        travelTimeOverride: null,
        travelFeeOverride: null,
        travelOverrideReason: "",
        hasTravelOverride: false,
        referralSourceId: "",
      }));
    } else if ((mode === "view" || mode === "edit") && selectedAppointment) {
      const kind = selectedAppointment.location_type === "at_home" 
        ? AppointmentKind.AT_HOME 
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
      const appointmentProducts: AppointmentProduct[] = bookingProducts.map((bp: any, idx: number) => ({
        id: `product-${idx}`,
        productId: bp.product_id || bp.id,
        productName: bp.product_name || bp.product?.name || bp.name || "Product",
        quantity: bp.quantity || 1,
        unitPrice: bp.unit_price || bp.price || bp.product?.price || 0,
        totalPrice: bp.total_price || (bp.quantity || 1) * (bp.unit_price || bp.price || bp.product?.price || 0),
      }));
      
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
      
      // Debug logging to help identify the issue
      if (mode === "view") {
        console.log("Appointment financial data:", {
          appointmentId: selectedAppointment.id,
          subtotal: storedSubtotal,
          taxAmountRaw: taxAmountRaw,
          taxAmount: storedTaxAmount,
          totalAmount: storedTotalAmount,
          tipAmount: tipAmount,
          hasTaxAmount: !!(selectedAppointment as any).tax_amount,
          appointmentKeys: Object.keys(selectedAppointment).filter(k => k.includes('tax') || k.includes('subtotal') || k.includes('total')),
        });
      }
      
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
      
      // For walk-in appointments, always use 0 service fee
      // Check if this is a walk-in appointment (booking_source is 'walk_in' or null/undefined for old appointments)
      const bookingSource = (selectedAppointment as any).booking_source;
      const isWalkIn = !bookingSource || bookingSource === 'walk_in';
      
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
        travelFee,
        travelTimeOverride: travelOverride?.overrideTravelMinutes ?? null,
        travelFeeOverride: travelOverride?.overrideTravelFee ?? null,
        travelOverrideReason: travelOverride?.reason || "",
        hasTravelOverride: !!travelOverride,
        referralSourceId: (selectedAppointment as any).referral_source_id ?? "",
      });
    }
  }, [mode, draftSlot, selectedAppointment, locations, services, calculatePricing, defaultTaxRate]);

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

  // Compute travel fee when address changes
  useEffect(() => {
    if (formData.kind === AppointmentKind.AT_HOME && formData.addressPostalCode) {
      // Simple zone-based fee calculation using postal code prefix
      const result = computeTravelFee(
        null, // Would use actual salon location coordinates
        {
          line1: formData.addressLine1,
          line2: formData.addressLine2,
          city: formData.addressCity,
          postalCode: formData.addressPostalCode,
        }
      );
      if (result.fee >= 0) {
        setFormData(prev => {
          // Provider-created appointments always have 0 service fee
          const serviceFeeToUse = mode === "create" ? 0 : prev.serviceFeePercentage;
          const pricing = calculatePricing(prev.services, prev.products, result.fee, prev.discountAmount, prev.taxRate, serviceFeeToUse, prev.tipAmount);
          return {
            ...prev,
            travelFee: result.fee,
            totalAmount: pricing.totalAmount,
          };
        });
      }
    }
  }, [formData.kind, formData.addressPostalCode, formData.addressLine1, formData.addressLine2, formData.addressCity, calculatePricing]);

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

    setSaving(true);
    try {
      const appointmentData: Partial<Appointment> = {
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
        status: DEFAULT_APPOINTMENT_STATUS,
        notes: formData.notes || undefined,
        location_type: formData.kind === AppointmentKind.AT_HOME ? "at_home" : "at_salon",
        location_id: formData.locationId || undefined,
        location_name: (locations || []).find(l => l.id === formData.locationId)?.name,
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
      // Mark as provider-created (not from client portal)
      (appointmentData as any).booking_source = 'walk_in';
      (appointmentData as any).referral_source_id = formData.referralSourceId || null;

      // Add at-home fields if applicable
      if (formData.kind === AppointmentKind.AT_HOME) {
        appointmentData.address_line1 = formData.addressLine1;
        appointmentData.address_line2 = formData.addressLine2 || undefined;
        appointmentData.address_city = formData.addressCity;
        appointmentData.address_postal_code = formData.addressPostalCode;
        appointmentData.travel_fee = formData.travelFee;
      }

      const created = await providerApi.createAppointment(appointmentData as any);
      
      toast.success("Appointment created successfully");
      onAppointmentCreated?.(created);
      onRefresh?.();
      closeSidebar();
    } catch (error) {
      console.error("Failed to create appointment:", error);
      toast.error("Failed to create appointment");
    } finally {
      setSaving(false);
    }
  };

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
      const bookingSource = (selectedAppointment as any).booking_source;
      if (existingServiceFee > 0 && bookingSource === 'online') {
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

      // Include version for optimistic locking if available
      if ((selectedAppointment as any).version !== undefined) {
        (updates as any).version = (selectedAppointment as any).version;
      }

      // Add location_id if changed
      if (formData.locationId && formData.locationId !== selectedAppointment.location_id) {
        (updates as any).location_id = formData.locationId;
      }

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
        updates.travel_fee = formData.travelFee;
      }
      (updates as any).referral_source_id = formData.referralSourceId || null;

      // Check if time/date changed for notification
      const timeChanged = 
        selectedAppointment.scheduled_date !== formData.date ||
        selectedAppointment.scheduled_time !== formData.startTime;

      await providerApi.updateAppointment(selectedAppointment.id, updates);
      
      // Send reschedule notification if enabled and time changed (API route to avoid server-only imports)
      if (sendNotification && timeChanged) {
        try {
          const res = await fetch(`/api/provider/bookings/${selectedAppointment.id}/notify-reschedule`, {
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
    } catch (error: any) {
      console.error("Failed to update appointment:", error);
      // Show more detailed error message
      const errorMessage = error?.message || error?.details || "Failed to update appointment";
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // Handle status change
  const handleStatusChange = async (newStatus: AppointmentStatus) => {
    if (!selectedAppointment) return;

    setSaving(true);
    try {
      const dbStatus = unmapStatus(newStatus);
      const updatePayload: Record<string, any> = { status: dbStatus };

      // Client Arrived: set current_stage so the UI and calendar reflect WAITING state
      if (newStatus === AppointmentStatus.WAITING) {
        updatePayload.current_stage = "client_arrived";
      }
      // Mark In Service: clear client_arrived (we're now in service), status becomes started
      if (newStatus === AppointmentStatus.IN_SERVICE) {
        updatePayload.current_stage = null; // Cleared when service starts
      }

      await providerApi.updateAppointment(selectedAppointment.id, {
        ...updatePayload,
        ...(newStatus === AppointmentStatus.WAITING && sendNotification && { send_arrival_notification: true }),
      } as any);

      const updated = { ...selectedAppointment, status: dbStatus, ...updatePayload };
      updateSelectedAppointment(updated);
      onAppointmentUpdated?.(updated);
      onRefresh?.();
      
      // Show user-friendly success messages
      let successMessage = "";
      switch (newStatus) {
        case AppointmentStatus.WAITING:
          successMessage = "Client marked as arrived";
          break;
        case AppointmentStatus.IN_SERVICE:
          successMessage = "Service started";
          break;
        case AppointmentStatus.COMPLETED:
          successMessage = "Appointment completed";
          // Check if rating already exists, then show rating dialog
          if (selectedAppointment?.id && selectedAppointment?.client_id) {
            try {
              const ratingCheck = await fetch(`/api/provider/ratings?booking_id=${selectedAppointment.id}`);
              if (ratingCheck.ok) {
                const ratingData = await ratingCheck.json();
                // If no rating exists for this booking, show dialog
                if (!ratingData.data?.has_rating) {
                  setShowRatingDialog(true);
                }
              } else {
                // Show dialog if check fails (might be first time)
                setShowRatingDialog(true);
              }
            } catch (error) {
              console.error("Error checking existing rating:", error);
              // Show dialog anyway if check fails
              setShowRatingDialog(true);
            }
          }
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
      await providerApi.updateAppointment(selectedAppointment.id, {
        status: "cancelled",
        cancellation_reason: cancelReason,
      });

      if (sendNotification) {
        try {
          const res = await fetch(`/api/provider/bookings/${selectedAppointment.id}/notify-cancellation`, {
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
      await providerApi.updateAppointment(selectedAppointment.id, {
        status: DEFAULT_APPOINTMENT_STATUS,
        cancellation_reason: undefined,
      });

      toast.success("Appointment restored");
      onAppointmentUpdated?.({ ...selectedAppointment, status: "booked" });
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
      await providerApi.deleteAppointment(selectedAppointment.id);
      toast.success("Appointment deleted");
      onAppointmentDeleted?.(selectedAppointment.id);
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
      const res = await fetch(`/api/provider/bookings/${selectedAppointment.id}/notify-resend`, {
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
      
      {/* Centered Modal - Airbnb style */}
      <div className={cn(
        "fixed z-[101] bg-white rounded-2xl shadow-2xl overflow-hidden",
        "transition-all duration-300 ease-out",
        // Desktop: centered modal
        "hidden sm:flex sm:flex-col",
        "sm:w-[90vw] sm:max-w-[600px] sm:h-[90vh] sm:max-h-[800px]",
        "sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
        // Mobile: bottom sheet
        "flex flex-col",
        "w-full max-w-full h-[95vh] max-h-[95vh]",
        "bottom-0 left-0 right-0 rounded-t-3xl",
        isOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none",
        // Animation
        isOpen && "animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:fade-in-0 sm:zoom-in-95 duration-300"
      )}>
        {/* Header - Airbnb style */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white flex-shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {mode === "create" ? "New Appointment" : formData.clientName || "Appointment"}
            </h2>
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
                      <Check className="w-4 h-4 ml-auto text-[#FF0077]" />
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
                      <Check className="w-4 h-4 ml-auto text-[#FF0077]" />
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
                      <Check className="w-4 h-4 ml-auto text-[#FF0077]" />
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
                      <Check className="w-4 h-4 ml-auto text-[#FF0077]" />
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
                      <Check className="w-4 h-4 ml-auto text-[#FF0077]" />
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
                      <Check className="w-4 h-4 ml-auto text-[#FF0077]" />
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
                      <Check className="w-4 h-4 ml-auto text-[#FF0077]" />
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
                    Print Invoice
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleEmailInvoice}>
                    <Mail className="w-4 h-4 mr-2" />
                    Email Invoice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeSidebar}>
              <X className="w-4 h-4 text-gray-500" />
            </Button>
          </div>
        </div>

        {/* Content - Scrollable Area */}
        <div className="flex-1 min-h-0 overflow-hidden box-border relative">
          <ScrollArea className="absolute inset-0 w-full h-full box-border">
            <div className="p-2 sm:p-2.5 md:p-3 lg:p-4 pr-2 sm:pr-3 md:pr-4 lg:pr-6 pb-6 sm:pb-5 md:pb-4 space-y-2.5 sm:space-y-3 md:space-y-4 box-border w-full max-w-full overflow-x-hidden min-w-0">
            {/* Status Actions (VIEW mode only) */}
            {mode === "view" && selectedAppointment && !isCanceled && (
              <div className="space-y-2 min-w-0">
                {/* In-salon only: client_arrived means client checked in at salon */}
                {selectedAppointment.location_type !== "at_home" && mangomintStatus === AppointmentStatus.WAITING && (
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-purple-50 border border-purple-200">
                    <Check className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="text-sm font-medium text-purple-800">Client arrived – ready for service</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {/* Client Arrived: in-salon only (at-home uses provider_on_way/provider_arrived) */}
                {selectedAppointment.location_type !== "at_home" && mangomintStatus !== AppointmentStatus.WAITING && mangomintStatus === AppointmentStatus.CONFIRMED && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-purple-600 border-purple-200 hover:bg-purple-50"
                    onClick={() => handleStatusChange(AppointmentStatus.WAITING)}
                    disabled={isSaving}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Client Arrived
                  </Button>
                )}
                {mangomintStatus === AppointmentStatus.WAITING && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-pink-600 border-pink-200 hover:bg-pink-50"
                    onClick={() => handleStatusChange(AppointmentStatus.IN_SERVICE)}
                    disabled={isSaving}
                  >
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    Mark In Service
                  </Button>
                )}
                {mangomintStatus === AppointmentStatus.IN_SERVICE && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-gray-600 border-gray-200 hover:bg-gray-50"
                    onClick={() => handleStatusChange(AppointmentStatus.COMPLETED)}
                    disabled={isSaving}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Mark Completed
                  </Button>
                )}
                </div>
              </div>
            )}

            {/* Client Section */}
            <div className="space-y-2 sm:space-y-2.5 md:space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Client
                </Label>
                {mode !== "view" && (
                  <button
                    type="button"
                    onClick={() => setShowNewClientDialog(true)}
                    className="flex items-center gap-1.5 text-xs text-[#FF0077] hover:text-[#E6006B] font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add new client
                  </button>
                )}
              </div>
              {mode === "view" ? (
                <div className="bg-gray-50 rounded-lg p-2 sm:p-2.5 md:p-3 overflow-hidden">
                  <div className="flex items-center gap-2 sm:gap-2.5 md:gap-3 min-w-0">
                    <Avatar className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 flex-shrink-0">
                      <AvatarFallback className="bg-gradient-to-br from-pink-500 to-orange-400 text-white font-semibold text-xs sm:text-xs md:text-sm">
                        {formData.clientName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="font-medium text-sm sm:text-sm md:text-base text-gray-900 truncate">{formData.clientName}</p>
                      {formData.clientPhone && (
                        <p className="text-xs text-gray-500 break-all">{formData.clientPhone}</p>
                      )}
                      {formData.clientEmail && (
                        <p className="text-xs text-gray-400 break-all">{formData.clientEmail}</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 overflow-hidden">
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Search or enter client name *"
                        value={clientSearchQuery || formData.clientName}
                        onChange={(e) => {
                          const value = e.target.value;
                          setClientSearchQuery(value);
                          setFormData(prev => ({ ...prev, clientName: value }));
                          setShowClientSearch(value.length >= 2);
                        }}
                        onFocus={() => {
                          if (clientSearchQuery.length >= 2) {
                            setShowClientSearch(true);
                          }
                        }}
                        onBlur={() => {
                          // Delay hiding to allow click on results
                          setTimeout(() => setShowClientSearch(false), 200);
                        }}
                        className="w-full max-w-full box-border pl-10 pr-8"
                      />
                      {clientSearchQuery.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setClientSearchQuery("");
                            setFormData(prev => ({ ...prev, clientName: "" }));
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
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {clientSearchResults.length > 0 ? (
                          <>
                            {clientSearchResults.map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                onClick={() => handleSelectClient(client)}
                                className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3"
                              >
                                <div className="w-8 h-8 rounded-full bg-[#FF0077]/10 flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-semibold text-[#FF0077]">
                                    {client.full_name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium block truncate">
                                    {client.full_name}
                                  </span>
                                  {(client.email || client.phone) && (
                                    <span className="text-xs text-gray-500 block truncate">
                                      {client.email || client.phone}
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}
                            <div className="border-t border-gray-200">
                              <button
                                type="button"
                                onClick={() => setShowNewClientDialog(true)}
                                className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-[#FF0077]"
                              >
                                <Plus className="w-4 h-4" />
                                <span className="text-sm font-medium">Create new client</span>
                              </button>
                            </div>
                          </>
                        ) : clientSearchQuery.length >= 2 ? (
                          <div className="p-4 text-center">
                            <p className="text-sm text-gray-500 mb-2">No clients found</p>
                            <button
                              type="button"
                              onClick={() => setShowNewClientDialog(true)}
                              className="text-sm text-[#FF0077] font-medium hover:underline"
                            >
                              Create new client
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <Input
                    placeholder="Phone"
                    value={formData.clientPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, clientPhone: e.target.value }))}
                    className="w-full max-w-full box-border"
                  />
                  <Input
                    type="email"
                    placeholder="Email"
                    value={formData.clientEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, clientEmail: e.target.value }))}
                    className="w-full max-w-full box-border"
                  />
                </div>
              )}
            </div>

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
                Type
              </Label>
              {mode === "view" ? (
                <div className="flex items-center gap-2">
                  {formData.kind === AppointmentKind.AT_HOME && <Home className="w-4 h-4 text-blue-500" />}
                  {formData.kind === AppointmentKind.WALK_IN && <PersonStanding className="w-4 h-4 text-amber-500" />}
                  {formData.kind === AppointmentKind.IN_SALON && <Building2 className="w-4 h-4 text-gray-500" />}
                  <span className="text-sm text-gray-700">
                    {formData.kind === AppointmentKind.AT_HOME && "At-home service"}
                    {formData.kind === AppointmentKind.WALK_IN && "Walk-in"}
                    {formData.kind === AppointmentKind.IN_SALON && "In salon"}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1 sm:gap-1.5 md:gap-2">
                  {[
                    { kind: AppointmentKind.IN_SALON, label: "In Salon", icon: Building2 },
                    { kind: AppointmentKind.WALK_IN, label: "Walk-in", icon: PersonStanding },
                    { kind: AppointmentKind.AT_HOME, label: "At Home", icon: Home },
                  ].map(({ kind, label, icon: Icon }) => (
                    <Button
                      key={kind}
                      type="button"
                      variant={formData.kind === kind ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "w-full text-[10px] sm:text-[10px] md:text-xs px-1 sm:px-1.5 md:px-2 h-8 sm:h-8.5 md:h-9",
                        formData.kind === kind && "bg-gray-900 text-white"
                      )}
                      onClick={() => setFormData(prev => ({ ...prev, kind }))}
                    >
                      <Icon className="w-3 h-3 sm:w-3 sm:h-3 md:w-3.5 md:h-3.5 mr-0.5 sm:mr-0.5 md:mr-1 flex-shrink-0" />
                      <span className="truncate">{label}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* At-Home Address */}
            {formData.kind === AppointmentKind.AT_HOME && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Service Address
                  </Label>
                  {mode === "view" ? (
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-blue-500 mt-0.5" />
                        <div className="text-sm text-gray-700">
                          <p>{formData.addressLine1}</p>
                          {formData.addressLine2 && <p>{formData.addressLine2}</p>}
                          <p>{formData.addressCity} {formData.addressPostalCode}</p>
                        </div>
                      </div>
                      {formData.travelFee > 0 && (
                        <div className="mt-2 pt-2 border-t border-blue-100">
                          <div className="flex justify-between items-center">
                            <p className="text-sm text-blue-700">Travel fee</p>
                            <p className="text-sm font-medium text-blue-700">
                              R{(formData.hasTravelOverride && formData.travelFeeOverride !== null 
                                ? formData.travelFeeOverride 
                                : formData.travelFee
                              ).toFixed(2)}
                              {formData.hasTravelOverride && (
                                <span className="ml-1 text-xs text-blue-500">(overridden)</span>
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        placeholder="Street address *"
                        value={formData.addressLine1}
                        onChange={(e) => setFormData(prev => ({ ...prev, addressLine1: e.target.value }))}
                        className="w-full max-w-full box-border"
                      />
                      <Input
                        placeholder="Apartment, suite, etc."
                        value={formData.addressLine2}
                        onChange={(e) => setFormData(prev => ({ ...prev, addressLine2: e.target.value }))}
                        className="w-full max-w-full box-border"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="City *"
                          value={formData.addressCity}
                          onChange={(e) => setFormData(prev => ({ ...prev, addressCity: e.target.value }))}
                          className="w-full max-w-full box-border"
                        />
                        <Input
                          placeholder="Postal code"
                          value={formData.addressPostalCode}
                          onChange={(e) => setFormData(prev => ({ ...prev, addressPostalCode: e.target.value }))}
                          className="w-full max-w-full box-border"
                        />
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2">
                        <p className="text-xs text-blue-700">
                          <span className="font-medium">Calculated travel fee:</span> R{formData.travelFee.toFixed(2)}
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
                          <span className="text-gray-500">Fee:</span> R{formData.travelFeeOverride.toFixed(2)}
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
              <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Staff & Location
              </Label>
              {mode === "view" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">
                      {(teamMembers || []).find(m => m.id === formData.staffId)?.name || "Unassigned"}
                    </span>
                  </div>
                  {formData.kind !== AppointmentKind.AT_HOME && (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">
                        {(locations || []).find(l => l.id === formData.locationId)?.name || "No location"}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Select value={formData.staffId} onValueChange={(v) => setFormData(prev => ({ ...prev, staffId: v }))}>
                    <SelectTrigger className="w-full max-w-full min-w-0 box-border">
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
                  {formData.kind !== AppointmentKind.AT_HOME && locations.length > 0 && (
                    <Select value={formData.locationId} onValueChange={(v) => setFormData(prev => ({ ...prev, locationId: v }))}>
                      <SelectTrigger className="w-full max-w-full min-w-0 box-border">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {(locations || []).map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Date & Time */}
            <div className="space-y-3">
              <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Date & Time
              </Label>
              {mode === "view" && selectedAppointment ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">
                      {selectedAppointment.scheduled_date ? (
                        (() => {
                          try {
                            const dateValue = new Date(selectedAppointment.scheduled_date);
                            return isNaN(dateValue.getTime()) ? selectedAppointment.scheduled_date : format(dateValue, "EEE, MMM d, yyyy");
                          } catch {
                            return selectedAppointment.scheduled_date;
                          }
                        })()
                      ) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">
                      {selectedAppointment.scheduled_time || "—"} ({selectedAppointment.duration_minutes} min)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className="flex-1 min-w-0 max-w-full box-border"
                  />
                  <Input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                    className="flex-1 min-w-0 max-w-full box-border"
                  />
                  <Select
                    value={formData.duration.toString()}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, duration: parseInt(v) }))}
                  >
                    <SelectTrigger className="flex-1 min-w-0 max-w-full box-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[15, 30, 45, 60, 75, 90, 120, 150, 180].map((d) => (
                        <SelectItem key={d} value={d.toString()}>
                          {d} min
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      <SelectItem value="booked">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Booked
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
                <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Services & Products
                </Label>
                {mode !== "view" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8">
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 z-[110]">
                      <DropdownMenuItem onClick={(e) => {
                        e.preventDefault();
                        // Scroll to service selection dropdown and focus it
                        const serviceSelect = document.querySelector('[placeholder="Add a service..."]') as HTMLElement;
                        if (serviceSelect) {
                          serviceSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setTimeout(() => serviceSelect.click(), 100);
                        }
                      }}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Service
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.preventDefault();
                        // Scroll to product selection dropdown and focus it
                        const productSelect = document.querySelector('[placeholder="Select a product..."]') as HTMLElement;
                        if (productSelect) {
                          productSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setTimeout(() => productSelect.click(), 100);
                        }
                      }}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Product
                      </DropdownMenuItem>
                      {packages.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => {
                            e.preventDefault();
                            // Scroll to package selection dropdown and focus it
                            const packageSelect = document.querySelector('[placeholder="Add a package..."]') as HTMLElement;
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

              {/* Services List */}
              {formData.services.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Services</Label>
                  {formData.services.map((service) => {
                    const serviceTotal = service.price + (service.addons?.reduce((sum, a) => sum + a.price, 0) || 0);
                    const serviceDuration = service.duration + (service.addons?.reduce((sum, a) => sum + a.duration, 0) || 0);
                    
                    return (
                      <div key={service.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm text-gray-900 truncate">
                                {service.serviceName}
                                {service.variantName && (
                                  <span className="text-xs text-purple-600 ml-1">({service.variantName})</span>
                                )}
                              </p>
                              {mode !== "view" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 flex-shrink-0"
                                  onClick={() => removeService(service.id)}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                              <span>{serviceDuration} min</span>
                              {mode !== "view" && (
                                <Input
                                  type="number"
                                  className="w-20 h-6 text-xs"
                                  value={service.price}
                                  onChange={(e) => {
                                    const newPrice = parseFloat(e.target.value) || 0;
                                    setFormData(prev => {
                                      const newServices = prev.services.map(s => 
                                        s.id === service.id ? { ...s, price: newPrice } : s
                                      );
                                      // Provider-created appointments always have 0 service fee
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
                              )}
                            </div>
                            {/* Addons for this service */}
                            {service.addons && service.addons.length > 0 && (
                              <div className="mt-2 space-y-1 pl-2 border-l-2 border-gray-300">
                                {service.addons.map((addon) => (
                                  <div key={addon.id} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-600">+ {addon.addonName}</span>
                                      {mode !== "view" && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-4 w-4"
                                          onClick={() => removeAddonFromService(service.id, addon.id)}
                                        >
                                          <X className="w-2.5 h-2.5" />
                                        </Button>
                                      )}
                                    </div>
                                    <span className="text-gray-700 font-medium">R{addon.price.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Add addon button */}
                            {mode !== "view" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs mt-2"
                                onClick={() => {
                                  setSelectedServiceForAddon(service.id);
                                  loadServiceAddons(service.serviceId);
                                }}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add add-on
                              </Button>
                            )}
                          </div>
                          <p className="font-semibold text-sm text-gray-900 flex-shrink-0">R{serviceTotal.toFixed(2)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Products List */}
              {formData.products.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Products</Label>
                  {formData.products.map((product) => (
                    <div key={product.id} className="bg-gray-50 rounded-lg p-3 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-gray-900 truncate">{product.productName}</p>
                          {mode !== "view" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 flex-shrink-0"
                              onClick={() => removeProduct(product.id)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          {mode !== "view" ? (
                            <>
                              <span>Qty:</span>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => updateProductQuantity(product.id, product.quantity - 1)}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <Input
                                  type="number"
                                  className="w-12 h-6 text-xs text-center"
                                  value={product.quantity}
                                  onChange={(e) => updateProductQuantity(product.id, parseInt(e.target.value) || 1)}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => updateProductQuantity(product.id, product.quantity + 1)}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                              <span className="text-gray-400">×</span>
                              <Input
                                type="number"
                                className="w-20 h-6 text-xs"
                                value={product.unitPrice}
                                onChange={(e) => {
                                  const newPrice = parseFloat(e.target.value) || 0;
                                  setFormData(prev => {
                                    const newProducts = prev.products.map(p => 
                                      p.id === product.id
                                        ? { ...p, unitPrice: newPrice, totalPrice: newPrice * p.quantity }
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
                                }}
                              />
                            </>
                          ) : (
                            <span>Qty: {product.quantity} × R{product.unitPrice.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      <p className="font-semibold text-sm text-gray-900 flex-shrink-0">R{product.totalPrice.toFixed(2)}</p>
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
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add a service..." />
                    </SelectTrigger>
                    <SelectContent>
                      {services
                        .filter(s => {
                          return !s.service_type || 
                                 s.service_type === "basic" || 
                                 s.service_type === "variant" || 
                                 s.service_type === "package";
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
                                <span className="font-medium">R{service.price}</span>
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
                      onValueChange={(productId) => {
                        const product = filteredProducts.find(p => p.id === productId);
                        if (product) {
                          addProduct(product, 1);
                          setProductSearchQuery(""); // Clear search after selection
                        }
                      }}
                      onOpenChange={(open) => {
                        // Lazy load products when dropdown opens
                        if (open && !productsLoadedRef.current && products.length === 0) {
                          loadProducts();
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a product..." />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingProducts ? (
                          <div className="p-2 text-sm text-gray-500 text-center">
                            Loading products...
                          </div>
                        ) : filteredProducts.length > 0 ? (
                          filteredProducts.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              <div className="flex items-center gap-2">
                                <span>{product.name}</span>
                                <span className="text-gray-400">-</span>
                                <span className="font-medium">R{product.retail_price}</span>
                              </div>
                            </SelectItem>
                          ))
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
                          setSelectedPackageId(null); // Reset selection
                        }
                      }}
                    >
                      <SelectTrigger>
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
                                  <span className="text-xs font-semibold text-gray-900">R{pkg.price.toFixed(2)}</span>
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
                <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Pricing Breakdown
                </Label>
                {mode === "view" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 sm:h-7.5 md:h-8 text-xs px-2">
                        <FileText className="w-3 h-3 mr-1" />
                        <span className="hidden xs:inline">Invoice</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[110]">
                      <DropdownMenuItem onClick={() => handlePrintInvoice()}>
                        <Printer className="w-4 h-4 mr-2" />
                        Print Invoice
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEmailInvoice()}>
                        <Mail className="w-4 h-4 mr-2" />
                        Email Invoice
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              
              <div className="bg-gray-50 rounded-lg p-2 sm:p-2.5 md:p-3 space-y-1.5 sm:space-y-1.5 md:space-y-2">
                {/* Subtotal */}
                <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium text-gray-900">R{formData.subtotal.toFixed(2)}</span>
                </div>
                
                {/* Discount */}
                {formData.discountAmount > 0 && (
                  <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                    <span className="text-gray-600">
                      Discount{formData.discountCode || formData.discountReason
                        ? ` (${formData.discountCode || formData.discountReason})`
                        : ""}
                    </span>
                    <span className="font-medium text-red-600">-R{formData.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                
                {/* Tax */}
                {formData.taxAmount > 0 && (
                  <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                    <span className="text-gray-600">Tax ({(Math.round(formData.taxRate * 10000) / 100).toFixed(1)}%)</span>
                    <span className="font-medium text-gray-900">R{formData.taxAmount.toFixed(2)}</span>
                  </div>
                )}
                
                {/* Travel Fee */}
                {formData.travelFee > 0 && (
                  <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                    <span className="text-gray-600">Travel Fee</span>
                    <span className="font-medium text-gray-900">R{formData.travelFee.toFixed(2)}</span>
                  </div>
                )}
                
                {/* Service Fee */}
                {formData.serviceFeeAmount > 0 && (
                  <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                    <span className="text-gray-600">Service Fee ({(formData.serviceFeePercentage * 100).toFixed(1)}%)</span>
                    <span className="font-medium text-gray-900">R{formData.serviceFeeAmount.toFixed(2)}</span>
                  </div>
                )}
                
                {/* Tip */}
                {formData.tipAmount > 0 && (
                  <div className="flex justify-between text-xs sm:text-xs md:text-sm">
                    <span className="text-gray-600">Tip</span>
                    <span className="font-medium text-gray-900">R{formData.tipAmount.toFixed(2)}</span>
                  </div>
                )}
                
                <Separator />
                
                {/* Total */}
                <div className="flex justify-between">
                  <span className="font-semibold text-sm sm:text-sm md:text-base text-gray-900">Total</span>
                  <span className="font-bold text-base sm:text-base md:text-lg text-gray-900">R{formData.totalAmount.toFixed(2)}</span>
                </div>
              </div>
              
              {/* Promo Code, Discount & Tip inputs (create/edit mode) */}
              {mode !== "view" && (
                <div className="space-y-3">
                  {/* Promo Code */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">Promo Code</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder="Enter promo code"
                        value={formData.discountCode || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, discountCode: e.target.value }))}
                        className="flex-1 uppercase"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
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
                  {/* Manual discount amount + reason */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">Discount Amount</Label>
                    <div className="flex items-center gap-2">
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
                      className="flex-1"
                    />
                    <Input
                      type="text"
                      placeholder="Reason (optional)"
                      value={formData.discountReason || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, discountReason: e.target.value }))}
                      className="flex-1"
                    />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">Tip</Label>
                    
                    {/* Pill-shaped tip buttons - % based on (subtotal - discount) */}
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
                              "min-h-[32px] min-w-[36px] px-2.5 py-1 rounded-full text-[11px] font-medium transition-all touch-manipulation",
                              isSelected
                                ? "bg-[#FF0077] text-white border border-[#FF0077] shadow-sm"
                                : "bg-gray-100 text-gray-700 border border-transparent hover:bg-gray-200 hover:border-gray-300"
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    
                    {/* Custom amount - show when Custom selected or non-preset value */}
                    {(() => {
                      const tipBase = Math.max(0, formData.subtotal - formData.discountAmount);
                      const presets = [0, tipBase * 0.05, tipBase * 0.10, tipBase * 0.20];
                      return customTipActive || !presets.some(p => Math.abs(formData.tipAmount - p) < 0.01);
                    })() && (
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] text-gray-500 shrink-0">Custom (R)</Label>
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
                          className="h-8 text-sm flex-1 max-w-[100px]"
                        />
                      </div>
                    )}
                    
                    {formData.tipAmount > 0 && (
                      <p className="text-[11px] text-gray-500">Tip: R{formData.tipAmount.toFixed(2)}</p>
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
                  <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Payment Collection
                  </Label>
                  
                  <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                    {/* Payment Status Badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Status:</span>
                      {(() => {
                        // Determine actual payment status: if total_paid < total_amount, it's partially_paid
                        const totalPaid = (selectedAppointment as any).total_paid || 0;
                        const totalAmount = selectedAppointment.total_amount || 0;
                        const actualPaymentStatus = totalPaid > 0 && totalPaid < totalAmount 
                          ? 'partially_paid' 
                          : selectedAppointment.payment_status || 'pending';
                        
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
                              R{totalPaid.toFixed(2)}
                              {totalPaid < totalAmount && (
                                <span className="text-gray-500 ml-1">of R{totalAmount.toFixed(2)}</span>
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
                              R{totalRefunded.toFixed(2)}
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
                          const totalAmount = selectedAppointment.total_amount || 0;
                          const remainingBalance = totalAmount - totalPaid;
                          const isPartiallyPaid = totalPaid > 0 && totalPaid < totalAmount;
                          
                          return (
                            <>
                              {isPartiallyPaid && (
                                <div className="mb-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                                  Remaining Balance: <span className="font-semibold">R{remainingBalance.toFixed(2)}</span>
                                </div>
                              )}
                              <Button 
                                className="w-full bg-green-600 hover:bg-green-700 text-white text-xs" 
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const totalPaid = (selectedAppointment as any).total_paid || 0;
                                    const totalAmount = selectedAppointment.total_amount || 0;
                                    const remainingBalance = totalAmount - totalPaid;
                                    const paymentAmount = remainingBalance > 0 ? remainingBalance : totalAmount;
                                    
                                    const response = await fetch(`/api/provider/bookings/${selectedAppointment.id}/mark-paid`, {
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
                              const totalPaidCard = (selectedAppointment as any).total_paid || 0;
                              const totalAmountCard = selectedAppointment.total_amount || 0;
                              const remainingBalanceCard = totalAmountCard - totalPaidCard;
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
                                  console.log(`Filtered to ${locationDevices.length} device(s) at this location`);
                                } else {
                                  // No devices at this location, but show all as fallback
                                  console.warn('No Yoco devices found for this location, showing all devices');
                                }
                              }

                              if (terminals.length === 0) {
                                const totalPaidLocal = (selectedAppointment as any).total_paid || 0;
                                const totalAmountLocal = selectedAppointment.total_amount || 0;
                                const remainingBalanceLocal = totalAmountLocal - totalPaidLocal;
                                const paymentAmountLocal = remainingBalanceLocal > 0 ? remainingBalanceLocal : totalAmountLocal;
                                const isPartiallyPaidLocal = totalPaidLocal > 0 && totalPaidLocal < totalAmountLocal;
                                
                                const manualConfirm = confirm(
                                  `No Yoco devices found. Do you want to manually record this card payment${isPartiallyPaidLocal ? ` of R${remainingBalanceLocal.toFixed(2)} (remaining balance)` : ''}?`
                                );
                                if (!manualConfirm) return;

                                // Manual card payment
                                const response = await fetch(`/api/provider/bookings/${selectedAppointment.id}/mark-paid`, {
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
                                  currency: 'ZAR',
                                  appointment_id: selectedAppointment.id,
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
                              const totalPaidYoco = (selectedAppointment as any).total_paid || 0;
                              const totalAmountYoco = selectedAppointment.total_amount || 0;
                              const remainingBalanceYoco = totalAmountYoco - totalPaidYoco;
                              const paymentAmountYoco = remainingBalanceYoco > 0 ? remainingBalanceYoco : totalAmountYoco;
                              const isPartiallyPaidYoco = totalPaidYoco > 0 && totalPaidYoco < totalAmountYoco;
                              
                              const markPaidResponse = await fetch(`/api/provider/bookings/${selectedAppointment.id}/mark-paid`, {
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
                                const response = await fetch(`/api/provider/bookings/${selectedAppointment.id}/send-payment-link`, {
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
                                const paymentsResponse = await fetch(`/api/provider/bookings/${selectedAppointment.id}/payments`);
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
                                    const response = await fetch(`/api/provider/bookings/${selectedAppointment.id}/refund`, {
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

            {/* Referral source (Where did this client come from?) */}
            {(mode === "create" || mode === "edit") && (
              <div className="space-y-3">
                <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Where did this client come from?
                </Label>
                <Select
                  value={formData.referralSourceId || "none"}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, referralSourceId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select referral source (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None / Not specified —</SelectItem>
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

            {/* Notes */}
            <div className="space-y-3">
              <Label className="text-[10px] sm:text-[10px] md:text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Notes
              </Label>
              {mode === "view" ? (
                formData.notes ? (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <StickyNote className="w-4 h-4 text-gray-400 mt-0.5" />
                      <p className="text-sm text-gray-700">{formData.notes}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No notes</p>
                )
              ) : (
                <Textarea
                  placeholder="Internal notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
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

        {/* Footer - Add extra bottom padding on mobile to account for bottom navigation */}
        <div className="p-2 sm:p-2.5 md:p-3 lg:p-4 pr-2 sm:pr-3 md:pr-4 lg:pr-6 border-t bg-white flex-shrink-0 box-border pb-20 md:pb-2 sm:pb-2.5 md:pb-3 lg:pb-4">
          {mode === "create" && (
            <Button
              className="w-full bg-pink-600 hover:bg-pink-700 min-w-0 text-xs sm:text-sm"
              onClick={handleCreate}
              disabled={isSaving || !formData.clientName || !formData.serviceId}
            >
              <span className="truncate">{isSaving ? "Creating..." : "Book Appointment"}</span>
            </Button>
          )}
          {mode === "edit" && (
            <div className="flex gap-2 min-w-0">
              <Button
                variant="outline"
                className="flex-1 min-w-0 text-xs sm:text-sm"
                onClick={switchToViewMode}
                disabled={isSaving}
              >
                <span className="truncate">Cancel</span>
              </Button>
              <Button
                className="flex-1 min-w-0 bg-pink-600 hover:bg-pink-700 text-xs sm:text-sm"
                onClick={handleUpdate}
                disabled={isSaving}
              >
                <span className="truncate">{isSaving ? "Saving..." : "Save Changes"}</span>
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
          bookingId={selectedAppointment.id}
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
            {selectedServiceForVariant && serviceVariants[selectedServiceForVariant] ? (
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
                      <p className="font-semibold">R{variant.price.toFixed(2)}</p>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Loading variants...</p>
            )}
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
                        <p className="font-semibold">R{addon.price.toFixed(2)}</p>
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
              <Label>Phone</Label>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="border-b border-gray-300 px-4 py-2 bg-gray-50">
                  <Label className="text-xs font-medium text-gray-700">Country code</Label>
                  <Select 
                    value={newClientData.countryCode} 
                    onValueChange={(value) => setNewClientData(prev => ({ ...prev, countryCode: value }))}
                  >
                    <SelectTrigger className="w-full border-none px-0 pt-1 text-base font-semibold bg-transparent h-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="+27">South Africa (+27)</SelectItem>
                      <SelectItem value="+254">Kenya (+254)</SelectItem>
                      <SelectItem value="+233">Ghana (+233)</SelectItem>
                      <SelectItem value="+234">Nigeria (+234)</SelectItem>
                      <SelectItem value="+20">Egypt (+20)</SelectItem>
                      <SelectItem value="+1">USA (+1)</SelectItem>
                      <SelectItem value="+44">UK (+44)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="px-4 py-3">
                  <Input
                    type="tel"
                    className={`text-base border-0 px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 ${
                      phoneValidationError ? 'text-red-600' : ''
                    }`}
                    placeholder="Phone number (e.g., 0823456789 or +27823456789)"
                    value={newClientData.phone}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewClientData(prev => ({ ...prev, phone: value }));
                      
                      // Real-time validation
                      if (value.trim()) {
                        const cleanPhone = value.replace(/[\s\-\(\)]/g, '');
                        const digits = cleanPhone.replace(/\D/g, '');
                        
                        if (cleanPhone.startsWith('+')) {
                          if (digits.length < 10 || digits.length > 15) {
                            setPhoneValidationError(`${digits.length} digits - need 10-15`);
                          } else {
                            setPhoneValidationError("");
                          }
                        } else if (cleanPhone.startsWith('0')) {
                          if (digits.length !== 10) {
                            setPhoneValidationError(`${digits.length} digits - need 10`);
                          } else {
                            setPhoneValidationError("");
                          }
                        } else {
                          if (digits.length !== 9) {
                            setPhoneValidationError(`${digits.length} digits - need 9`);
                          } else {
                            setPhoneValidationError("");
                          }
                        }
                      } else {
                        setPhoneValidationError("");
                      }
                    }}
                    autoComplete="tel"
                    inputMode="tel"
                  />
                  {phoneValidationError && (
                    <p className="text-xs text-red-600 mt-1">{phoneValidationError}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Format: 0823456789 (10 digits) or +27823456789 (country code + 9 digits)
                  </p>
                </div>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setNewClientData({ first_name: "", last_name: "", email: "", phone: "", countryCode: "+27" });
              setPhoneValidationError("");
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
