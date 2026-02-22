"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ServiceCategory, ServiceItem, ProductItem, TeamMember, Sale } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { Money } from "./Money";
import { YocoPaymentDialog } from "./YocoPaymentDialog";
import {
  Search,
  User,
  Plus,
  Minus,
  X,
  ShoppingCart,
  CreditCard,
  Banknote,
  Smartphone,
  Gift,
  Trash2,
  Tag,
  Sparkles,
  Check,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Home,
  Building2,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
}

interface NewSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (sale: Sale) => void;
}

interface CartItem {
  id: string;
  type: "service" | "product" | "addon" | "variant";
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  team_member_id?: string;
  team_member_name?: string;
  parent_service_id?: string;
  variant_name?: string;
}

interface ServiceVariant {
  id: string;
  name: string;
  price: number;
  variant_name?: string;
}

interface ServiceAddon {
  id: string;
  name: string;
  price: number;
  addon_category?: string;
  is_recommended?: boolean;
}

// Payment methods for POS sale dialog - aligned with other dialogs
const paymentMethods = [
  { id: "cash", label: "Cash", description: "Pay with cash", icon: Banknote },
  { id: "yoco", label: "Card (Terminal)", description: "Process via card terminal", icon: CreditCard },
  { id: "card", label: "Card (Manual)", description: "Record card payment manually", icon: CreditCard },
  { id: "eft", label: "EFT / Bank Transfer", description: "Instant EFT or bank transfer", icon: Smartphone },
  { id: "gift_card", label: "Gift Card", description: "Redeem gift card balance", icon: Gift },
];

export function NewSaleDialog({
  open,
  onOpenChange,
  onSuccess,
}: NewSaleDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash");
  const [activeTab, setActiveTab] = useState<"services" | "products">("services");
  
  // Client search
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  
  // Selected team member for services
  const [selectedTeamMember, setSelectedTeamMember] = useState<string>("");
  
  // Service selection state
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [serviceVariants, setServiceVariants] = useState<ServiceVariant[]>([]);
  const [serviceAddons, setServiceAddons] = useState<ServiceAddon[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<ServiceVariant | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [showServiceDetails, setShowServiceDetails] = useState(false);
  
  // Discounts and gift cards
  const [couponCode, setCouponCode] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardBalance, setGiftCardBalance] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [isValidatingGiftCard, setIsValidatingGiftCard] = useState(false);
  
  // Yoco payment
  const [showYocoDialog, setShowYocoDialog] = useState(false);
  
  // Modals
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);
  const [showCustomServiceDialog, setShowCustomServiceDialog] = useState(false);
  
  // New client form
  const [newClientForm, setNewClientForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });
  
  // Custom service form
  const [customServiceForm, setCustomServiceForm] = useState({
    name: "",
    price: "",
    duration_minutes: "30",
    category_id: "",
  });
  
  // Service location
  const [serviceLocationType, setServiceLocationType] = useState<"at-salon" | "house-call">("at-salon");
  const [providerLocations, setProviderLocations] = useState<Array<{ id: string; name: string; address: string; city: string }>>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | undefined>(undefined);
  const [houseCallAddress, setHouseCallAddress] = useState({
    address_line1: "",
    city: "",
    postal_code: "",
  });
  
  // Service category selection
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  
  // Amounts
  const [tipAmount, setTipAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxRate] = useState(0.15); // 15% VAT

  useEffect(() => {
    if (open) {
      // Load data in parallel for faster opening
      Promise.all([
        loadData().catch(err => console.error("Failed to load data:", err)),
        loadLocations().catch(err => console.error("Failed to load locations:", err)),
      ]);
      resetForm();
    }
  }, [open]);

  const loadLocations = async () => {
    try {
      const locations = await providerApi.listLocations();
      setProviderLocations(locations);
      // Set default to primary location or first location
      const primaryLocation = locations.find((loc) => loc.is_primary) || locations[0];
      if (primaryLocation) {
        setSelectedLocationId(primaryLocation.id);
      } else {
        setSelectedLocationId(undefined);
      }
    } catch (error) {
      console.error("Failed to load locations:", error);
      setProviderLocations([]);
      setSelectedLocationId(undefined);
    }
  };

  // Search clients as user types
  useEffect(() => {
    const searchClients = async () => {
      if (clientSearchQuery.length >= 1) {
        try {
          const response = await fetch(`/api/provider/clients?search=${encodeURIComponent(clientSearchQuery)}`);
          if (response.ok) {
            const data = await response.json();
            const clients = data.data || [];
            
            // Map clients to the expected format
            const mapped = clients.map((client: any) => {
              const customer = client.customer || {};
              const fullName = customer.full_name || "Unknown";
              // Split full_name into first_name and last_name
              const nameParts = fullName.trim().split(/\s+/);
              const firstName = nameParts[0] || "";
              const lastName = nameParts.slice(1).join(" ") || "";
              
              return {
                id: customer.id || client.customer_id,
                first_name: firstName,
                last_name: lastName,
                email: customer.email || "",
                phone: customer.phone || "",
              };
            });
            
            setClientSearchResults(mapped);
          } else {
            setClientSearchResults([]);
          }
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

  // Load service variants and addons when service is selected
  useEffect(() => {
    if (selectedService) {
      loadServiceDetails(selectedService.id);
    }
  }, [selectedService]);


  const loadData = async () => {
    // Load all data in parallel for faster opening
    const [membersResult, categoriesResult, productsResult] = await Promise.allSettled([
      providerApi.listTeamMembers(),
      providerApi.listServiceCategories(),
      providerApi.listProducts(),
    ]);

    // Handle team members
    if (membersResult.status === "fulfilled") {
      const members = membersResult.value;
      setTeamMembers(members);
      if (members.length > 0) {
        setSelectedTeamMember(members[0].id);
      }
    } else {
      console.error("Failed to load team members:", membersResult.reason);
      setTeamMembers([]);
      toast.error("Unable to load team members. You can still create a sale.");
    }

    // Handle service categories
    if (categoriesResult.status === "fulfilled") {
      setServiceCategories(categoriesResult.value);
    } else {
      console.error("Failed to load service categories:", categoriesResult.reason);
      setServiceCategories([]);
      toast.error("Unable to load service categories.");
    }

    // Handle products
    if (productsResult.status === "fulfilled") {
      const productsResponse = productsResult.value;
      setProducts(Array.isArray(productsResponse?.data) ? productsResponse.data : []);
    } else {
      console.error("Failed to load products:", productsResult.reason);
      setProducts([]);
    }
  };

  const loadServiceDetails = async (serviceId: string) => {
    try {
      // Load variants and addons for the service
      const [variantsResponse, addonsResponse] = await Promise.all([
        fetch(`/api/provider/services/${serviceId}/variants`).catch(() => ({ ok: false })),
        fetch(`/api/provider/services/${serviceId}/addons`).catch(() => ({ ok: false })),
      ]);

      if (variantsResponse.ok && "json" in variantsResponse) {
        const variantsData = await (variantsResponse as Response).json();
        const variants = variantsData.data || variantsData || [];
        setServiceVariants(Array.isArray(variants) ? variants : []);
      } else {
        setServiceVariants([]);
      }

      if (addonsResponse.ok && "json" in addonsResponse) {
        const addonsData = await (addonsResponse as Response).json();
        const addons = addonsData.data || addonsData || [];
        setServiceAddons(Array.isArray(addons) ? addons : []);
      } else {
        setServiceAddons([]);
      }
    } catch (error) {
      console.error("Failed to load service details:", error);
      setServiceVariants([]);
      setServiceAddons([]);
    }
  };

  const resetForm = () => {
    setCart([]);
    setSelectedPaymentMethod("cash");
    setTipAmount(0);
    setDiscountAmount(0);
    setSelectedClient(null);
    setClientSearchQuery("");
    setSelectedService(null);
    setServiceVariants([]);
    setServiceAddons([]);
    setSelectedVariant(null);
    setSelectedAddons([]);
    setShowServiceDetails(false);
    setCouponCode("");
    setGiftCardCode("");
    setGiftCardBalance(0);
    setAppliedCoupon(null);
    setShowNewClientDialog(false);
    setShowCustomServiceDialog(false);
    setNewClientForm({ first_name: "", last_name: "", email: "", phone: "" });
    setCustomServiceForm({ name: "", price: "", duration_minutes: "30", category_id: "" });
    setServiceLocationType("at-salon");
    setSelectedLocationId("");
    setHouseCallAddress({ address_line1: "", city: "", postal_code: "" });
    setSelectedCategoryIndex(0);
  };

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setClientSearchQuery("");
    setClientSearchResults([]);
  };

  const handleServiceClick = (service: ServiceItem) => {
    setSelectedService(service);
    setShowServiceDetails(true);
    setSelectedVariant(null);
    setSelectedAddons([]);
    // Load service details (variants and addons)
    loadServiceDetails(service.id);
  };

  // Quick add service (without opening details modal) - supports group bookings
  const handleQuickAddService = (service: ServiceItem) => {
    const teamMember = teamMembers.find((m) => m.id === selectedTeamMember);
    
    // Create unique cart item ID that includes service ID, team member, and timestamp for group bookings
    // This allows multiple instances of the same service for group bookings
    const baseId = `${service.id}-${selectedTeamMember || 'default'}`;
    
    // Check if this exact service+team combo already exists (same base ID)
    const existingIndex = cart.findIndex(
      (item) => item.id.startsWith(baseId) && 
                item.type === "service" && 
                item.team_member_id === selectedTeamMember &&
                !item.variant_name // Only match non-variant services
    );

    if (existingIndex >= 0) {
      // Increment quantity for group bookings
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      newCart[existingIndex].total = newCart[existingIndex].quantity * newCart[existingIndex].unit_price;
      setCart(newCart);
      toast.success(`Service quantity updated (${newCart[existingIndex].quantity} items)`);
    } else {
      // Add new service - use timestamp to allow multiple instances for group bookings
      const serviceItem: CartItem = {
        id: `${baseId}-${Date.now()}`,
        type: "service",
        name: service.name,
        quantity: 1,
        unit_price: service.price,
        total: service.price,
        team_member_id: selectedTeamMember || undefined,
        team_member_name: teamMember?.name,
      };
      setCart([...cart, serviceItem]);
      toast.success("Service added to cart");
    }
  };

  const handleAddServiceWithOptions = () => {
    if (!selectedService) return;

    const teamMember = teamMembers.find((m) => m.id === selectedTeamMember);
    const serviceToAdd = selectedVariant || selectedService;
    
    // Ensure serviceAddons is an array
    const addonsArray = Array.isArray(serviceAddons) ? serviceAddons : [];
    const addonItems = addonsArray.filter((a: any) => selectedAddons.includes(a.id));
    const addonTotal = addonItems.reduce((sum: number, a: any) => sum + (a.price || 0), 0);
    const servicePrice = serviceToAdd.price + addonTotal;

    // Create unique cart item ID base
    const baseId = selectedVariant 
      ? `${serviceToAdd.id}-${selectedVariant.id}-${selectedTeamMember || 'default'}`
      : `${serviceToAdd.id}-${selectedTeamMember || 'default'}`;

    // Check if this exact service+variant+team combo already exists
    const existingIndex = cart.findIndex(
      (item) => item.id.startsWith(baseId) && 
                item.type === (selectedVariant ? "variant" : "service") && 
                item.team_member_id === selectedTeamMember &&
                item.variant_name === selectedVariant?.variant_name
    );

    if (existingIndex >= 0) {
      // Increment quantity for group bookings
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      newCart[existingIndex].total = newCart[existingIndex].quantity * newCart[existingIndex].unit_price;
      setCart(newCart);
      toast.success(`Service quantity updated (${newCart[existingIndex].quantity} items)`);
    } else {
      // Create unique ID with timestamp for group bookings
      const cartItemId = `${baseId}-${Date.now()}`;
      // Add main service
      const serviceItem: CartItem = {
        id: cartItemId,
        type: selectedVariant ? "variant" : "service",
        name: selectedVariant ? `${selectedService.name} - ${selectedVariant.variant_name || selectedVariant.name}` : selectedService.name,
        quantity: 1,
        unit_price: servicePrice,
        total: servicePrice,
        team_member_id: selectedTeamMember || undefined,
        team_member_name: teamMember?.name,
        parent_service_id: selectedVariant ? selectedService.id : undefined,
        variant_name: selectedVariant?.variant_name,
      };

      // Add addons as separate items
      const addonCartItems: CartItem[] = addonItems.map((addon: any) => ({
        id: `${addon.id}-${selectedService.id}-${Date.now()}`,
        type: "addon",
        name: addon.name,
        quantity: 1,
        unit_price: addon.price || 0,
        total: addon.price || 0,
        team_member_id: selectedTeamMember || undefined,
        team_member_name: teamMember?.name,
        parent_service_id: selectedService.id,
      }));

      setCart([...cart, serviceItem, ...addonCartItems]);
      toast.success("Service added to cart");
    }
    
    setShowServiceDetails(false);
    setSelectedService(null);
    setSelectedVariant(null);
    setSelectedAddons([]);
  };

  const handleAddProduct = (product: ProductItem) => {
    // Check if this exact product already exists (for group bookings, allow multiple)
    const existingIndex = cart.findIndex(
      (item) => item.id === product.id && item.type === "product"
    );

    if (existingIndex >= 0) {
      // Increment quantity for group bookings
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      newCart[existingIndex].total = newCart[existingIndex].quantity * newCart[existingIndex].unit_price;
      setCart(newCart);
      toast.success(`Product quantity updated (${newCart[existingIndex].quantity} items)`);
    } else {
      // Add new product
      setCart([
        ...cart,
        {
          id: product.id,
          type: "product",
          name: product.name,
          quantity: 1,
          unit_price: product.retail_price,
          total: product.retail_price,
        },
      ]);
      toast.success("Product added to cart");
    }
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    newCart[index].quantity += delta;
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1);
    } else {
      newCart[index].total = newCart[index].quantity * newCart[index].unit_price;
    }
    setCart(newCart);
  };

  const handleRemoveItem = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Please enter a coupon code");
      return;
    }

    setIsValidatingCoupon(true);
    try {
      // Include subtotal in validation request for accurate discount calculation
      const response = await fetch(`/api/provider/coupons/validate?code=${encodeURIComponent(couponCode)}&subtotal=${subtotal}`);
      if (response.ok) {
        const result = await response.json();
        const data = result.data || result; // Handle both wrapped and unwrapped responses
        const discount = data.discount || 0;
        setAppliedCoupon({ code: couponCode, discount });
        setDiscountAmount(discount);
        toast.success(data.message || "Coupon applied successfully");
      } else {
        toast.error("Invalid coupon code");
        setAppliedCoupon(null);
        setDiscountAmount(0);
      }
    } catch (error) {
      console.error("Error validating coupon:", error);
      toast.error("Failed to validate coupon");
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleApplyGiftCard = async () => {
    if (!giftCardCode.trim()) {
      toast.error("Please enter a gift card code");
      return;
    }

    setIsValidatingGiftCard(true);
    try {
      const response = await fetch(`/api/provider/gift-cards/validate?code=${encodeURIComponent(giftCardCode)}`);
      if (response.ok) {
        const result = await response.json();
        const data = result.data || result; // Handle both wrapped and unwrapped responses
        const balance = data.balance || 0;
        setGiftCardBalance(balance);
        toast.success(data.message || `Gift card balance: ${balance}`);
      } else {
        toast.error("Invalid gift card code");
        setGiftCardBalance(0);
      }
    } catch (error) {
      console.error("Error validating gift card:", error);
      toast.error("Failed to validate gift card");
    } finally {
      setIsValidatingGiftCard(false);
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const tax = subtotal * taxRate;
  const giftCardApplied = Math.min(giftCardBalance, subtotal + tax + tipAmount - discountAmount);
  const total = Math.max(0, subtotal + tax + tipAmount - discountAmount - giftCardApplied);

  const handleSubmit = async () => {
    if (cart.length === 0) {
      toast.error("Please add items to the sale");
      return;
    }

    // If Yoco terminal is selected, open Yoco dialog
    if (selectedPaymentMethod === "yoco") {
      setShowYocoDialog(true);
      return;
    }

    // Validate location selection
    if (serviceLocationType === "at-salon" && !selectedLocationId) {
      toast.error("Please select a salon location");
      return;
    }
    if (serviceLocationType === "house-call" && !houseCallAddress.address_line1.trim()) {
      toast.error("Please enter customer address for house call");
      return;
    }

    setIsLoading(true);
    try {
      const clientName = selectedClient
        ? selectedClient.id?.startsWith("walk-in")
          ? selectedClient.first_name || "Walk-in"
          : `${selectedClient.first_name || ""} ${selectedClient.last_name || ""}`.trim() || "Walk-in"
        : "Walk-in";
      
      const saleData: Partial<Sale> = {
        client_name: clientName,
        items: cart.map((item) => ({
          id: item.id,
          type: (item.type === "variant" || item.type === "addon" ? "service" : item.type) as "service" | "product",
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
        })),
        subtotal,
        tax,
        total,
        payment_method: selectedPaymentMethod,
        payment_status: "completed", // All payments including EFT are completed (simple like cash)
        location_id: serviceLocationType === "at-salon" ? selectedLocationId : undefined,
        service_location_type: serviceLocationType,
        house_call_address: serviceLocationType === "house-call" ? houseCallAddress : undefined,
        team_member_id: selectedTeamMember || undefined,
        team_member_name: teamMembers.find((m) => m.id === selectedTeamMember)?.name,
        coupon_code: appliedCoupon?.code,
        gift_card_code: giftCardBalance > 0 ? giftCardCode : undefined,
        gift_card_amount: giftCardApplied,
      };

      const sale = await providerApi.createSale(saleData);
      toast.success("Sale completed!");
      onSuccess?.(sale);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create sale:", error);
      toast.error("Failed to complete sale");
    } finally {
      setIsLoading(false);
    }
  };

  const handleYocoPaymentSuccess = (_payment: any) => {
    handleSubmit();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="h-[98vh] max-h-[98vh] rounded-t-3xl p-0 flex flex-col overflow-hidden font-sans bg-white"
        >
          {/* Grab Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
          </div>
          
          {/* Header */}
          <SheetHeader className="px-6 sm:px-8 pb-4 border-b border-gray-100 relative">
            <button
              onClick={() => onOpenChange(false)}
              className="absolute right-6 top-0 p-2 -mt-2 rounded-full hover:bg-gray-100 transition-colors touch-manipulation"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
            <SheetTitle className="text-xl font-bold text-gray-900 pr-10">
              New Sale
            </SheetTitle>
          </SheetHeader>

          {/* Content Area - Scrollable */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8 min-h-0" style={{ paddingBottom: cart.length > 0 ? '140px' : '60px' }}>
            <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            {/* Item Selection Section */}
            <div className="flex flex-col space-y-6">
              {/* Client Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-gray-900">Client</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewClientDialog(true)}
                    className="h-8 text-xs text-[#FF0077] hover:text-[#D60565] hover:bg-[#FF0077]/10"
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                    Add New Client
                  </Button>
                </div>
                {selectedClient ? (
                  <div className="flex items-center justify-between p-3 md:p-3 bg-gradient-to-r from-[#FF0077]/5 to-[#FF0077]/10 rounded-xl md:rounded-lg border border-[#FF0077]/20">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 md:w-8 md:h-8 rounded-full bg-[#FF0077] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {(selectedClient.first_name?.charAt(0) || "") + (selectedClient.last_name?.charAt(0) || "") || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">
                          {selectedClient.first_name && selectedClient.last_name 
                            ? `${selectedClient.first_name} ${selectedClient.last_name}`
                            : selectedClient.first_name || "Walk-in Client"}
                        </p>
                        {(selectedClient.email || selectedClient.phone) && (
                          <p className="text-xs text-gray-600 truncate">
                            {selectedClient.email || selectedClient.phone}
                          </p>
                        )}
                        {selectedClient.id?.startsWith("walk-in") && (
                          <p className="text-xs text-[#FF0077] font-medium">Walk-in</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedClient(null);
                        setClientSearchQuery("");
                      }}
                      className="h-8 w-8 p-0 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search client or enter name for walk-in..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      className="pl-10 h-12 text-base"
                      autoComplete="off"
                    />
                    {(clientSearchResults.length > 0 || clientSearchQuery.trim().length > 0) && (
                      <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {/* Walk-in option - always show at top */}
                        {clientSearchQuery.trim().length > 0 && (
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100"
                            onClick={() => {
                              // Create walk-in client
                              const walkInClient: Client = {
                                id: `walk-in-${Date.now()}`,
                                first_name: clientSearchQuery.trim(),
                                last_name: "",
                                email: "",
                                phone: "",
                              };
                              handleSelectClient(walkInClient);
                            }}
                          >
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                              <User className="w-4 h-4 text-gray-600" />
                            </div>
                            <div className="flex-1">
                              <span className="text-sm font-medium block">
                                Walk-in: {clientSearchQuery.trim()}
                              </span>
                              <span className="text-xs text-gray-500">New client</span>
                            </div>
                          </button>
                        )}
                        
                        {/* Existing clients */}
                        {clientSearchResults.map((client) => {
                          const initials = (client.first_name?.charAt(0) || "") + (client.last_name?.charAt(0) || "") || "?";
                          const displayName = `${client.first_name || ""} ${client.last_name || ""}`.trim() || "Unknown";
                          
                          return (
                            <button
                              key={client.id}
                              type="button"
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3"
                              onClick={() => handleSelectClient(client)}
                            >
                              <div className="w-8 h-8 rounded-full bg-[#FF0077]/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-semibold text-[#FF0077]">
                                  {initials}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium block truncate">
                                  {displayName}
                                </span>
                                {(client.email || client.phone) && (
                                  <span className="text-xs text-gray-500 block truncate">
                                    {client.email || client.phone}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Team member selection */}
              {teamMembers.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">Team Member</Label>
                  <Select value={selectedTeamMember} onValueChange={setSelectedTeamMember}>
                    <SelectTrigger className="h-12 text-base">
                      <User className="w-4 h-4 mr-2 text-gray-400" />
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Service Location Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-semibold text-gray-900">Service Location</Label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setServiceLocationType("at-salon")}
                    className={cn(
                      "p-3 rounded-lg border-2 text-left transition-all",
                      serviceLocationType === "at-salon"
                        ? "border-[#FF0077] bg-[#FF0077]/5"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className={cn(
                        "w-4 h-4",
                        serviceLocationType === "at-salon" ? "text-[#FF0077]" : "text-gray-500"
                      )} />
                      <p className="font-medium text-sm">At-Salon</p>
                    </div>
                    <p className="text-xs text-gray-500">Service at your location</p>
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setServiceLocationType("house-call")}
                      className={cn(
                        "p-3 rounded-lg border-2 text-left transition-all w-full",
                        serviceLocationType === "house-call"
                          ? "border-[#FF0077] bg-[#FF0077]/5"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Home className={cn(
                          "w-4 h-4",
                          serviceLocationType === "house-call" ? "text-[#FF0077]" : "text-gray-500"
                        )} />
                        <p className="font-medium text-sm">House Call</p>
                      </div>
                      <p className="text-xs text-gray-500">Service at customer address</p>
                    </button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setServiceLocationType("house-call");
                            }}
                          >
                            <Info className="w-3.5 h-3.5 text-blue-600" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          <div className="space-y-2">
                            <p className="font-semibold text-sm">Customer Onboarding Required</p>
                            <p className="text-xs">
                              For house calls, the customer must complete onboarding and OTP verification. 
                              Share the app download link or onboarding deeplink with them.
                            </p>
                            <div className="pt-2 border-t border-gray-200">
                              <p className="text-xs font-medium mb-1">Options:</p>
                              <ul className="text-xs space-y-1 list-disc list-inside text-gray-600">
                                <li>Download Beautonomi app</li>
                                <li>Use onboarding deeplink</li>
                                <li>Complete OTP verification</li>
                              </ul>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* At-Salon Location Selection */}
                {serviceLocationType === "at-salon" && (
                  <div className="mt-2">
                    <Select 
                      value={selectedLocationId || ""} 
                      onValueChange={(value) => setSelectedLocationId(value || undefined)}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                        <SelectValue placeholder="Select salon location *" />
                      </SelectTrigger>
                      <SelectContent>
                        {providerLocations.length > 0 ? (
                          providerLocations.map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">{location.name}</span>
                                <span className="text-xs text-gray-500">
                                  {location.address}, {location.city}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-gray-500">No locations available</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* House Call Address Input */}
                {serviceLocationType === "house-call" && (
                  <div className="mt-2 space-y-3">
                    {/* Info Banner for House Call */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-blue-900 mb-1">
                            Customer Onboarding Required
                          </p>
                          <p className="text-xs text-blue-700 mb-2">
                            The customer needs to complete onboarding and OTP verification before the house call can be confirmed.
                          </p>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-blue-900">Share with customer:</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <a
                                href="https://beautonomi.com/download"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                              >
                                📱 Download Beautonomi App
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  // Generate onboarding deeplink
                                  const deeplink = `${window.location.origin}/onboard?ref=sale&phone=${selectedClient?.phone || ''}`;
                                  navigator.clipboard.writeText(deeplink);
                                  toast.success("Onboarding link copied to clipboard!");
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 underline text-left"
                              >
                                🔗 Copy Onboarding Link
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="house_call_address" className="text-xs">Street Address *</Label>
                      <Input
                        id="house_call_address"
                        value={houseCallAddress.address_line1}
                        onChange={(e) => setHouseCallAddress({ ...houseCallAddress, address_line1: e.target.value })}
                        placeholder="Enter customer address"
                        className="h-12 text-base"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="house_call_city" className="text-xs">City *</Label>
                        <Input
                          id="house_call_city"
                          value={houseCallAddress.city}
                          onChange={(e) => setHouseCallAddress({ ...houseCallAddress, city: e.target.value })}
                          placeholder="City"
                          className="h-12 text-base"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="house_call_postal" className="text-xs">Postal Code</Label>
                        <Input
                          id="house_call_postal"
                          value={houseCallAddress.postal_code}
                          onChange={(e) => setHouseCallAddress({ ...houseCallAddress, postal_code: e.target.value })}
                          placeholder="Postal code"
                          className="h-12 text-base"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Service Details Modal */}
              {showServiceDetails && selectedService && (
                <div className="mb-3 p-4 bg-gray-50 rounded-lg border border-gray-200 flex-shrink-0">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-base">{selectedService.name}</h3>
                      <p className="text-sm text-gray-600">{selectedService.duration_minutes} min</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowServiceDetails(false);
                        setSelectedService(null);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Variants */}
                  {serviceVariants.length > 0 && (
                    <div className="mb-3">
                      <Label className="text-xs font-semibold mb-2 block">Select Variant</Label>
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setSelectedVariant(null)}
                          className={cn(
                            "w-full p-2 text-left border rounded-lg text-sm transition-colors",
                            !selectedVariant
                              ? "border-[#FF0077] bg-[#FF0077]/10"
                              : "border-gray-200 hover:border-gray-300"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span>Standard</span>
                            <Money amount={selectedService.price} />
                            {!selectedVariant && <Check className="w-4 h-4 text-[#FF0077]" />}
                          </div>
                        </button>
                        {serviceVariants.map((variant) => (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => setSelectedVariant(variant)}
                            className={cn(
                              "w-full p-2 text-left border rounded-lg text-sm transition-colors",
                              selectedVariant?.id === variant.id
                                ? "border-[#FF0077] bg-[#FF0077]/10"
                                : "border-gray-200 hover:border-gray-300"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span>{variant.variant_name || variant.name}</span>
                              <Money amount={variant.price} />
                              {selectedVariant?.id === variant.id && (
                                <Check className="w-4 h-4 text-[#FF0077]" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Addons */}
                  {serviceAddons.length > 0 && (
                    <div className="mb-3">
                      <Label className="text-xs font-semibold mb-2 block">Add-ons (Optional)</Label>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {serviceAddons.map((addon) => (
                          <label
                            key={addon.id}
                            className="flex items-center justify-between p-2 border rounded-lg cursor-pointer hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selectedAddons.includes(addon.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedAddons([...selectedAddons, addon.id]);
                                  } else {
                                    setSelectedAddons(selectedAddons.filter(id => id !== addon.id));
                                  }
                                }}
                                className="w-4 h-4 text-[#FF0077] rounded"
                              />
                              <span className="text-sm">{addon.name}</span>
                              {addon.is_recommended && (
                                <Sparkles className="w-3 h-3 text-yellow-500" />
                              )}
                            </div>
                            <Money amount={addon.price} />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleAddServiceWithOptions}
                    className="w-full bg-[#FF0077] hover:bg-[#D60565]"
                  >
                    Add to Cart
                  </Button>
                </div>
              )}

              {/* Tabs for Services/Products */}
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "services" | "products")}
                className="flex flex-col space-y-4"
              >
                <TabsList className="grid w-full grid-cols-2 h-12 bg-gray-100 rounded-lg p-1">
                  <TabsTrigger 
                    value="services"
                    className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-[#FF0077] rounded transition-all"
                  >
                    Services
                  </TabsTrigger>
                  <TabsTrigger 
                    value="products"
                    className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-[#FF0077] rounded transition-all"
                  >
                    Products
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="services" className="mt-4">
                  <div className="space-y-4">
                    {serviceCategories.length > 0 ? (
                      <>
                        {/* Horizontal scrollable category selector */}
                        <div className="relative">
                          <div className="flex items-center gap-2">
                            <div 
                              ref={categoryScrollRef}
                              className="flex space-x-2 overflow-x-auto scrollbar-hide pb-2 flex-1"
                              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                              {serviceCategories.map((category, index) => (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCategoryIndex(index);
                                    // Scroll category into view
                                    if (categoryScrollRef.current) {
                                      const button = categoryScrollRef.current.children[index] as HTMLElement;
                                      if (button) {
                                        button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                                      }
                                    }
                                  }}
                                  className={cn(
                                    "py-2.5 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0",
                                    index === selectedCategoryIndex
                                      ? "bg-[#FF0077] text-white shadow-sm"
                                      : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                                  )}
                                >
                                  {category.name}
                                </button>
                              ))}
                              {/* Add Custom Service button */}
                              <button
                                type="button"
                                onClick={() => setShowCustomServiceDialog(true)}
                                className="py-2.5 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 border-2 border-dashed border-gray-300 text-gray-600 hover:border-[#FF0077] hover:text-[#FF0077] hover:bg-[#FF0077]/5"
                              >
                                <Plus className="w-4 h-4 inline mr-1.5" />
                                Custom Service
                              </button>
                            </div>
                            {/* Scroll buttons for better tablet navigation */}
                            {serviceCategories.length > 3 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (categoryScrollRef.current) {
                                      categoryScrollRef.current.scrollBy({ left: -150, behavior: 'smooth' });
                                    }
                                  }}
                                  className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50"
                                  aria-label="Scroll left"
                                >
                                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (categoryScrollRef.current) {
                                      categoryScrollRef.current.scrollBy({ left: 150, behavior: 'smooth' });
                                    }
                                  }}
                                  className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50"
                                  aria-label="Scroll right"
                                >
                                  <ChevronRight className="w-4 h-4 text-gray-600" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Services for selected category */}
                        <div>
                          <h4 className="font-semibold text-base text-gray-900 mb-3">
                            {serviceCategories[selectedCategoryIndex]?.name}
                          </h4>
                          {serviceCategories[selectedCategoryIndex]?.services && 
                           serviceCategories[selectedCategoryIndex].services.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {serviceCategories[selectedCategoryIndex].services.map((service) => (
                                <div
                                  key={service.id}
                                  className="relative p-3 border-2 border-gray-200 rounded-lg hover:border-[#FF0077] hover:bg-[#FF0077]/5 transition-all bg-white group"
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleServiceClick(service)}
                                    className="w-full text-left"
                                  >
                                    <p className="font-semibold text-sm mb-1">{service.name}</p>
                                    <div className="flex items-center justify-between mt-1">
                                      <span className="text-xs text-gray-500">
                                        {service.duration_minutes} min
                                      </span>
                                      <span className="text-sm font-bold text-[#FF0077]">
                                        <Money amount={service.price} />
                                      </span>
                                    </div>
                                  </button>
                                  {/* Quick Add Button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleQuickAddService(service);
                                    }}
                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[#FF0077] text-white flex items-center justify-center hover:bg-[#D60565] opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                    title="Quick add to cart"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                              <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                              <p className="text-sm">No services in this category</p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowCustomServiceDialog(true)}
                                className="mt-2 text-[#FF0077] hover:text-[#D60565]"
                              >
                                Add Custom Service
                              </Button>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No service categories available</p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowCustomServiceDialog(true)}
                          className="mt-3"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Custom Service
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="products" className="mt-4">
                  <div className="grid grid-cols-2 gap-2">
                    {Array.isArray(products) && products.length > 0 ? (
                      products.map((product) => (
                        <div
                          key={product.id}
                          className="relative p-3 border-2 border-gray-200 rounded-lg hover:border-[#FF0077] hover:bg-[#FF0077]/5 transition-all bg-white group"
                        >
                          <button
                            type="button"
                            onClick={() => handleAddProduct(product)}
                            className="w-full text-left"
                          >
                            <p className="font-semibold text-sm mb-1">{product.name}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-gray-500">
                                {product.quantity} in stock
                              </span>
                              <span className="text-sm font-bold text-[#FF0077]">
                                <Money amount={product.retail_price} />
                              </span>
                            </div>
                          </button>
                          {/* Quick Add Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddProduct(product);
                            }}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[#FF0077] text-white flex items-center justify-center hover:bg-[#D60565] opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                            title="Add to cart"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-2 text-center py-8 text-gray-500">
                        <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No products available</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Cart Section - Now part of scrollable content */}
            <div className="border-t border-gray-200 pt-6 space-y-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#FF0077]/10 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-[#FF0077]" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Cart</h3>
                  <span className="text-xs text-gray-600">{cart.length} {cart.length === 1 ? 'item' : 'items'}</span>
                </div>
              </div>

              {/* Cart items */}
              {cart.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">Cart is empty</p>
                  <p className="text-xs mt-1 text-gray-400">Add services or products to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item, index) => (
                    <div
                      key={`${item.id}-${item.team_member_id || ""}-${index}`}
                      className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{item.name}</p>
                          {item.team_member_name && (
                            <p className="text-xs text-gray-500 mt-0.5">by {item.team_member_name}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="text-gray-400 hover:text-red-500 ml-2 p-1 flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(index, -1)}
                            className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:bg-gray-50 bg-white"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-sm font-bold w-8 text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(index, 1)}
                            className="w-8 h-8 rounded-full border-2 border-[#FF0077] bg-[#FF0077] text-white flex items-center justify-center hover:bg-[#D60565]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="font-bold text-base text-[#FF0077]">
                          <Money amount={item.total} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Coupon and Gift Card */}
              {cart.length > 0 && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Coupon code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="flex-1 h-10 text-sm"
                      disabled={!!appliedCoupon || isValidatingCoupon}
                    />
                    <Button
                      onClick={handleApplyCoupon}
                      disabled={!couponCode.trim() || !!appliedCoupon || isValidatingCoupon}
                      variant="outline"
                      size="sm"
                      className="h-10"
                    >
                      {isValidatingCoupon ? "..." : appliedCoupon ? <Check className="w-4 h-4" /> : <Tag className="w-4 h-4" />}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Gift card code"
                      value={giftCardCode}
                      onChange={(e) => setGiftCardCode(e.target.value)}
                      className="flex-1 h-10 text-sm"
                      disabled={giftCardBalance > 0 || isValidatingGiftCard}
                    />
                    <Button
                      onClick={handleApplyGiftCard}
                      disabled={!giftCardCode.trim() || giftCardBalance > 0 || isValidatingGiftCard}
                      variant="outline"
                      size="sm"
                      className="h-10"
                    >
                      {isValidatingGiftCard ? "..." : giftCardBalance > 0 ? <Check className="w-4 h-4" /> : <Gift className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Totals */}
              {cart.length > 0 && (
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <Money amount={subtotal} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">VAT (15%)</span>
                    <Money amount={tax} />
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>-<Money amount={discountAmount} /></span>
                    </div>
                  )}
                  {giftCardApplied > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Gift Card</span>
                      <span>-<Money amount={giftCardApplied} /></span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
                    <span>Total</span>
                    <Money amount={total} />
                  </div>
                </div>
              )}

              {/* Payment Method Selection */}
              {cart.length > 0 && (
                <div>
                  <Label className="text-sm font-semibold mb-3 block">Payment Method</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map((method) => {
                      const Icon = method.icon;
                      const isSelected = selectedPaymentMethod === method.id;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setSelectedPaymentMethod(method.id)}
                          className={cn(
                            "relative p-3 rounded-xl border-2 text-left transition-all",
                            isSelected 
                              ? "border-[#FF0077] bg-[#FF0077]/5 shadow-sm" 
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          )}
                        >
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#FF0077] flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                              isSelected ? "bg-[#FF0077]/10 text-[#FF0077]" : "bg-gray-100 text-gray-500"
                            )}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={cn(
                                "font-medium text-sm",
                                isSelected ? "text-[#FF0077]" : "text-gray-900"
                              )}>
                                {method.label}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">{method.description}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            </div>
          </div>

        {/* Sticky Total Strip - E-commerce style */}
        {cart.length > 0 && (
          <div className="sticky bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-4 sm:px-6 md:px-8 py-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-0.5">Total</p>
                <p className="text-xl font-bold text-[#FF0077]">
                  <Money amount={total} />
                </p>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || cart.length === 0}
                className="h-12 px-6 text-base font-semibold bg-[#FF0077] hover:bg-[#D60565] text-white rounded-lg shadow-lg disabled:opacity-50 active:scale-95 transition-transform flex-shrink-0"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  "Complete Sale"
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>

      {showYocoDialog && (
        <YocoPaymentDialog
          open={showYocoDialog}
          onOpenChange={setShowYocoDialog}
          amount={total}
          saleId={""}
          onSuccess={handleYocoPaymentSuccess}
        />
      )}

      {/* Add New Client Dialog */}
      <Dialog open={showNewClientDialog} onOpenChange={setShowNewClientDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Create a new client profile for this sale
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={newClientForm.first_name}
                onChange={(e) => setNewClientForm({ ...newClientForm, first_name: e.target.value })}
                placeholder="Enter first name"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                value={newClientForm.last_name}
                onChange={(e) => setNewClientForm({ ...newClientForm, last_name: e.target.value })}
                placeholder="Enter last name"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newClientForm.email}
                onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                placeholder="Enter email (optional)"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={newClientForm.phone}
                onChange={(e) => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                placeholder="Enter phone (optional)"
                className="h-11"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowNewClientDialog(false);
                  setNewClientForm({ first_name: "", last_name: "", email: "", phone: "" });
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!newClientForm.first_name.trim() || !newClientForm.last_name.trim()) {
                    toast.error("First name and last name are required");
                    return;
                  }
                  
                  try {
                    // Create client - for now, just use as walk-in with full details
                    const newClient: Client = {
                      id: `new-client-${Date.now()}`,
                      first_name: newClientForm.first_name.trim(),
                      last_name: newClientForm.last_name.trim(),
                      email: newClientForm.email.trim() || undefined,
                      phone: newClientForm.phone.trim() || undefined,
                    };
                    
                    handleSelectClient(newClient);
                    setShowNewClientDialog(false);
                    setNewClientForm({ first_name: "", last_name: "", email: "", phone: "" });
                    toast.success("Client added successfully");
                  } catch (error) {
                    console.error("Error creating client:", error);
                    toast.error("Failed to create client");
                  }
                }}
                className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
              >
                Add Client
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Custom Service Dialog */}
      <Dialog open={showCustomServiceDialog} onOpenChange={setShowCustomServiceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Service</DialogTitle>
            <DialogDescription>
              Create a one-time custom service for this sale
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="service_name">Service Name *</Label>
              <Input
                id="service_name"
                value={customServiceForm.name}
                onChange={(e) => setCustomServiceForm({ ...customServiceForm, name: e.target.value })}
                placeholder="e.g., Custom Treatment"
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="service_price">Price (ZAR) *</Label>
                <Input
                  id="service_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={customServiceForm.price}
                  onChange={(e) => setCustomServiceForm({ ...customServiceForm, price: e.target.value })}
                  placeholder="0.00"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service_duration">Duration (min) *</Label>
                <Input
                  id="service_duration"
                  type="number"
                  min="1"
                  value={customServiceForm.duration_minutes}
                  onChange={(e) => setCustomServiceForm({ ...customServiceForm, duration_minutes: e.target.value })}
                  placeholder="30"
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="service_category">Category (Optional)</Label>
              <Select
                value={customServiceForm.category_id}
                onValueChange={(value) => setCustomServiceForm({ ...customServiceForm, category_id: value })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {serviceCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCustomServiceDialog(false);
                  setCustomServiceForm({ name: "", price: "", duration_minutes: "30", category_id: "" });
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!customServiceForm.name.trim() || !customServiceForm.price) {
                    toast.error("Service name and price are required");
                    return;
                  }
                  
                  const price = parseFloat(customServiceForm.price);
                  if (isNaN(price) || price <= 0) {
                    toast.error("Please enter a valid price");
                    return;
                  }
                  
                  const duration = parseInt(customServiceForm.duration_minutes);
                  if (isNaN(duration) || duration <= 0) {
                    toast.error("Please enter a valid duration");
                    return;
                  }
                  
                  // Add custom service to cart
                  const customService: CartItem = {
                    id: `custom-${Date.now()}`,
                    type: "service",
                    name: customServiceForm.name.trim(),
                    quantity: 1,
                    unit_price: price,
                    total: price,
                    team_member_id: selectedTeamMember || undefined,
                    team_member_name: teamMembers.find((m) => m.id === selectedTeamMember)?.name,
                  };
                  
                  setCart([...cart, customService]);
                  setShowCustomServiceDialog(false);
                  setCustomServiceForm({ name: "", price: "", duration_minutes: "30", category_id: "" });
                  toast.success("Custom service added to cart");
                }}
                className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
              >
                Add to Cart
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* EFT/Bank Transfer Verification Dialog - REMOVED - EFT now works like cash */}
      {/* Removed dialog - EFT is now simple like cash payment */}
    </>
  );
}
