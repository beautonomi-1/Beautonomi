"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { CalendarIcon, Search, User, Plus, X, ShoppingCart, Clock, Minus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/ui/phone-input";
import { Slider } from "@/components/ui/slider";

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
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

// Clients will be fetched from API

// Phone validation function - E.164 format
const isValidPhone = (phone: string): boolean => {
  if (!phone) return true; // Optional field
  // Remove spaces and check E.164 format: + followed by 1-15 digits
  const cleaned = phone.replace(/\s/g, '');
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(cleaned);
};

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
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [defaultCountryCode, setDefaultCountryCode] = useState("+27");
  const [_selectedAddons, _setSelectedAddons] = useState<string[]>([]);
  const [_selectedVariants, _setSelectedVariants] = useState<Record<string, string>>({});
  const [_showCheckout, _setShowCheckout] = useState(false);
  const [_serviceAddons, _setServiceAddons] = useState<any[]>([]);
  const [_serviceVariants, _setServiceVariants] = useState<any[]>([]);
  
  // Cart system for services and products
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [_showNewClientDialog, setShowNewClientDialog] = useState(false);
  const [_selectedServiceForDialog, setSelectedServiceForDialog] = useState<ServiceItem | null>(null);
  
  const [formData, setFormData] = useState({
    client_id: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    team_member_id: defaultTeamMemberId || "",
    scheduled_date: defaultDate || new Date(),
    scheduled_time: defaultTime || "10:00",
    duration_minutes: 0, // Will be calculated from cart
    price: 0, // Will be calculated from cart
    notes: "",
    is_recurring: false,
    recurrence_pattern: "weekly" as "daily" | "weekly" | "biweekly" | "monthly",
    recurrence_end_date: "",
    recurrence_occurrences: undefined as number | undefined,
  });

  // Load default country code from platform settings
  useEffect(() => {
    const loadDefaultCountryCode = async () => {
      try {
        // Try to get from platform settings (if available)
        const response = await fetch("/api/public/platform-settings");
        if (response.ok) {
          const _data = await response.json();
          // Platform settings might have locale info, but for now default to +27 (South Africa)
          // You can extend this to get from settings.localization.default_country_code if available
          setDefaultCountryCode("+27");
        }
      } catch (error) {
        console.error("Failed to load platform settings:", error);
        // Default to +27 (South Africa)
        setDefaultCountryCode("+27");
      }
    };
    loadDefaultCountryCode();
  }, []);

  useEffect(() => {
    if (open) {
      loadData();
      if (appointment) {
        setFormData({
          client_id: "",
          client_name: appointment.client_name,
          client_email: appointment.client_email || "",
          client_phone: appointment.client_phone || "",
          team_member_id: appointment.team_member_id,
          scheduled_date: new Date(appointment.scheduled_date),
          scheduled_time: appointment.scheduled_time,
          duration_minutes: appointment.duration_minutes,
          price: appointment.price,
          notes: appointment.notes || "",
          is_recurring: false,
          recurrence_pattern: "weekly" as "daily" | "weekly" | "biweekly" | "monthly",
          recurrence_end_date: "",
          recurrence_occurrences: undefined as number | undefined,
        });
        // Load appointment services/products into cart
        const loadAppointmentCart = async () => {
          try {
            const response = await fetch(`/api/provider/bookings/${appointment.id}/services`);
            if (response.ok) {
              const data = await response.json();
              const bookingServices = data.data || [];
              if (bookingServices.length > 0) {
                setCart(bookingServices.map((bs: any) => ({
                  id: `service-${bs.offering_id || bs.service_id}-${Date.now()}`,
                  type: "service" as const,
                  name: bs.offering?.name || bs.service_name || "Service",
                  quantity: bs.quantity || 1,
                  unit_price: bs.price || bs.offering?.price || 0,
                  total: (bs.quantity || 1) * (bs.price || bs.offering?.price || 0),
                  service_id: bs.offering_id || bs.service_id,
                  duration_minutes: bs.duration_minutes || bs.offering?.duration_minutes || 30,
                })));
              } else {
                setCart([]);
              }
            } else {
              setCart([]);
            }
          } catch (error) {
            console.error("Failed to load appointment services:", error);
            setCart([]);
          }
        };
        loadAppointmentCart();
        setSelectedClient(null);
        setIsWalkIn(false);
      } else {
        setFormData({
          client_id: "",
          client_name: "",
          client_email: "",
          client_phone: "",
          team_member_id: defaultTeamMemberId || "",
          scheduled_date: defaultDate || new Date(),
          scheduled_time: defaultTime || "10:00",
          duration_minutes: 0,
          price: 0,
          notes: "",
          is_recurring: false,
          recurrence_pattern: "weekly" as "daily" | "weekly" | "biweekly" | "monthly",
          recurrence_end_date: "",
          recurrence_occurrences: undefined as number | undefined,
        });
        setCart([]);
        setSelectedClient(null);
        setIsWalkIn(false);
        setClientSearchQuery("");
        setShowClientSearch(true);
      }
    }
  }, [open, appointment, defaultDate, defaultTime, defaultTeamMemberId]);

  // Search clients as user types
  useEffect(() => {
    const searchClients = async () => {
      if (clientSearchQuery.length >= 2) {
        try {
          const response = await fetch(`/api/provider/clients?search=${encodeURIComponent(clientSearchQuery)}`);
          if (response.ok) {
            const data = await response.json();
            setClientSearchResults(data.data || []);
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

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setFormData({
      ...formData,
      client_id: client.id,
      client_name: `${client.first_name} ${client.last_name}`,
      client_email: client.email || "",
      client_phone: client.phone || "",
    });
    setClientSearchQuery("");
    setClientSearchResults([]);
    setShowClientSearch(false);
  };

  const handleWalkIn = () => {
    setIsWalkIn(true);
    setSelectedClient(null);
    setShowClientSearch(false);
    setFormData({
      ...formData,
      client_id: "",
      client_name: "",
      client_email: "",
      client_phone: "",
    });
  };

  const handleClearClient = () => {
    setSelectedClient(null);
    setIsWalkIn(false);
    setShowClientSearch(true);
    setFormData({
      ...formData,
      client_id: "",
      client_name: "",
      client_email: "",
      client_phone: "",
    });
  };

  const loadData = async () => {
    setIsLoadingData(true);
    try {
      console.log("Loading appointment dialog data...");
      const [members, categories, productsResponse] = await Promise.all([
        providerApi.listTeamMembers(),
        providerApi.listServiceCategories(),
        providerApi.listProducts().catch(() => ({ data: [] })), // Handle products gracefully
      ]);
      console.log("Loaded team members:", members);
      console.log("Loaded categories:", categories);
      setTeamMembers(members || []);
      const allServices = categories.flatMap((cat) => cat.services || []);
      console.log("All services:", allServices);
      setServices(allServices || []);
      setProducts(Array.isArray(productsResponse?.data) ? productsResponse.data : []);
      
      // If default team member is set and exists, use it
      if (defaultTeamMemberId && members.length > 0) {
        const defaultMember = members.find(m => m.id === defaultTeamMemberId);
        if (defaultMember) {
          setFormData(prev => ({ ...prev, team_member_id: defaultTeamMemberId }));
        }
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      setTeamMembers([]);
      setServices([]);
      setProducts([]);
    } finally {
      setIsLoadingData(false);
    }
  };
  
  // Calculate total duration and price from cart
  useEffect(() => {
    const totalDuration = cart.reduce((sum, item) => {
      if (item.type === "service" && item.duration_minutes) {
        return sum + item.duration_minutes;
      }
      return sum;
    }, 0);
    const totalPrice = cart.reduce((sum, item) => sum + item.total, 0);
    setFormData(prev => ({
      ...prev,
      duration_minutes: totalDuration || 60, // Default to 60 if no services
      price: totalPrice,
    }));
  }, [cart]);

  const handleAddService = (service: ServiceItem) => {
    const existingIndex = cart.findIndex(
      (item) => item.type === "service" && item.service_id === service.id
    );
    
    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      newCart[existingIndex].total = newCart[existingIndex].quantity * newCart[existingIndex].unit_price;
      setCart(newCart);
    } else {
      const cartItem: CartItem = {
        id: `service-${service.id}-${Date.now()}`,
        type: "service",
        name: service.name,
        quantity: 1,
        unit_price: service.price,
        total: service.price,
        service_id: service.id,
        duration_minutes: service.duration_minutes,
      };
      setCart([...cart, cartItem]);
    }
    setShowServiceDialog(false);
    setSelectedServiceForDialog(null);
  };
  
  const handleAddProduct = (product: ProductItem) => {
    const existingIndex = cart.findIndex(
      (item) => item.type === "product" && item.product_id === product.id
    );
    
    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      newCart[existingIndex].total = newCart[existingIndex].quantity * newCart[existingIndex].unit_price;
      setCart(newCart);
    } else {
      const cartItem: CartItem = {
        id: `product-${product.id}-${Date.now()}`,
        type: "product",
        name: product.name,
        quantity: 1,
        unit_price: product.retail_price,
        total: product.retail_price,
        product_id: product.id,
      };
      setCart([...cart, cartItem]);
    }
    setShowProductDialog(false);
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

  const handleSubmitAndGetAppointment = async (e: React.FormEvent): Promise<Appointment | null> => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.team_member_id) {
      alert("Please select a team member");
      return null;
    }

    if (cart.length === 0) {
      alert("Please add at least one service or product");
      return null;
    }
    
    // Check if there's at least one service (required for appointments)
    const hasService = cart.some(item => item.type === "service");
    if (!hasService) {
      alert("Please add at least one service to the appointment");
      return null;
    }

    // Format phone number to E.164 (remove spaces)
    const formattedPhone = formData.client_phone ? formData.client_phone.replace(/\s/g, '') : null;
    
    // Validate phone number format if provided
    if (formattedPhone && !isValidPhone(formattedPhone)) {
      alert("Please enter a valid phone number in E.164 format (e.g., +27123456789)");
      return null;
    }

    // For walk-ins, client_name can be empty, but we'll use a default
    const clientName = formData.client_name || (isWalkIn ? "Walk-in Client" : "");

    const selectedMember = teamMembers.find((m) => m.id === formData.team_member_id);

    if (!selectedMember) {
      alert("Selected team member not found. Please try again.");
      return null;
    }

    // Get services from cart
    const cartServices = cart.filter(item => item.type === "service");
    const primaryService = cartServices[0]; // Use first service as primary
    
    if (!primaryService) {
      alert("At least one service is required for appointments.");
      return null;
    }
    
    // Calculate total price from cart
    const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
    
    // Calculate total duration from services
    const totalDuration = cartServices.reduce((sum, item) => sum + (item.duration_minutes || 0), 0);
    
    // Get the primary service details
    const primaryServiceData = services.find((s) => s.id === primaryService.service_id);
    
    if (!primaryServiceData) {
      alert("Primary service not found. Please try again.");
      return null;
    }
    
    const appointmentData: Partial<Appointment> = {
      client_name: clientName,
      client_email: formData.client_email || undefined,
      client_phone: formattedPhone || undefined,
      team_member_id: formData.team_member_id,
      team_member_name: selectedMember.name,
      service_id: primaryService.service_id!,
      service_name: primaryServiceData.name,
      scheduled_date: format(formData.scheduled_date, "yyyy-MM-dd"),
      scheduled_time: formData.scheduled_time,
      duration_minutes: totalDuration || 60,
      price: cartTotal,
      notes: formData.notes || undefined,
      status: appointment?.status || "booked",
      // Store cart items for checkout
      cart_items: cart.map(item => ({
        id: item.id,
        type: item.type,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        service_id: item.service_id,
        product_id: item.product_id,
        duration_minutes: item.duration_minutes,
      })),
    } as any;

    try {
      const createdAppointment = await providerApi.createAppointment(appointmentData);
      console.log("Appointment created successfully:", createdAppointment);
      return createdAppointment;
    } catch (error) {
      console.error("Failed to create appointment:", error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate required fields
      if (!formData.team_member_id) {
        alert("Please select a team member");
        setIsLoading(false);
        return;
      }

      if (cart.length === 0) {
        alert("Please add at least one service or product");
        setIsLoading(false);
        return;
      }
      
      const hasService = cart.some(item => item.type === "service");
      if (!hasService) {
        alert("Please add at least one service to the appointment");
        setIsLoading(false);
        return;
      }

      if (!formData.client_name && !isWalkIn) {
        alert("Please select or enter a client name");
        setIsLoading(false);
        return;
      }

      // Format phone number to E.164 (remove spaces)
      const formattedPhone = formData.client_phone ? formData.client_phone.replace(/\s/g, '') : null;
      
      // Validate phone number format if provided
      if (formattedPhone && !isValidPhone(formattedPhone)) {
        alert("Please enter a valid phone number in E.164 format (e.g., +27123456789)");
        setIsLoading(false);
        return;
      }

      // For walk-ins, client_name can be empty, but we'll use a default
      const clientName = formData.client_name || (isWalkIn ? "Walk-in Client" : "");

      const selectedMember = teamMembers.find((m) => m.id === formData.team_member_id);

      if (!selectedMember) {
        alert("Selected team member not found. Please try again.");
        setIsLoading(false);
        return;
      }

      const cartServices = cart.filter(item => item.type === "service");
      const primaryService = cartServices[0];
      const primaryServiceData = services.find((s) => s.id === primaryService?.service_id);
      
      if (!primaryService || !primaryServiceData) {
        alert("At least one service is required for appointments.");
        setIsLoading(false);
        return;
      }
      
      const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
      const totalDuration = cartServices.reduce((sum, item) => sum + (item.duration_minutes || 0), 0);

      const appointmentData: Partial<Appointment> = {
        client_name: clientName,
        client_email: formData.client_email || undefined,
        client_phone: formattedPhone || undefined,
        team_member_id: formData.team_member_id,
        team_member_name: selectedMember.name,
        service_id: primaryService.service_id!,
        service_name: primaryServiceData.name,
        scheduled_date: format(formData.scheduled_date, "yyyy-MM-dd"),
        scheduled_time: formData.scheduled_time,
        duration_minutes: totalDuration || 60,
        price: cartTotal,
        notes: formData.notes || undefined,
        cart_items: cart.map(item => ({
          id: item.id,
          type: item.type,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          service_id: item.service_id,
          product_id: item.product_id,
          duration_minutes: item.duration_minutes,
        })),
        status: appointment?.status || "booked",
      };

      if (appointment) {
        await providerApi.updateAppointment(appointment.id, appointmentData);
      } else {
        // Check if this is a recurring appointment
        if (formData.is_recurring && formData.recurrence_pattern) {
          const recurrenceRule = {
            pattern: formData.recurrence_pattern,
            interval: formData.recurrence_pattern === "biweekly" ? 2 : 1,
            end_date: formData.recurrence_end_date || undefined,
            occurrences: formData.recurrence_occurrences || undefined,
          };

          try {
            await providerApi.createRecurringAppointment({
              ...appointmentData,
              recurrence_rule: recurrenceRule,
            } as any);
          } catch (error) {
            console.error("Failed to create recurring appointment:", error);
            // Fallback to creating a single appointment if recurring fails
            await providerApi.createAppointment(appointmentData);
          }
        } else {
          const createdAppointment = await providerApi.createAppointment(appointmentData);
          console.log("Appointment created successfully:", createdAppointment);
        }
      }

      // Show success message
      console.log("Appointment saved successfully, refreshing calendar...");
      
      // Close dialog first
      onOpenChange(false);
      
      // Then trigger success callback to refresh calendar
      // Use setTimeout to ensure dialog closes before refresh
      setTimeout(() => {
        console.log("Calling onSuccess callback to refresh calendar");
        onSuccess?.();
      }, 300); // Increased delay to ensure API call completes
    } catch (error) {
      console.error("Failed to save appointment:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Error details:", {
        error,
        formData,
        cart,
      });
      alert(`Failed to save appointment: ${errorMessage}. Please check the console for details.`);
      setIsLoading(false);
    }
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 8; hour <= 20; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        options.push(time);
      }
    }
    return options;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 !z-[10000]">
        <DialogHeader className="px-0 sm:px-0">
          <DialogTitle className="text-base sm:text-lg font-semibold">
            {appointment ? "Edit Appointment" : "Create Appointment"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">
            {appointment ? "Update appointment details below" : "Schedule a new appointment for a client"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-0 sm:px-0">
          {/* Client Selection */}
          <div className="space-y-2">
            <Label>Client *</Label>
            
            {/* Show selected client or walk-in info */}
            {(selectedClient || isWalkIn) && !showClientSearch ? (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center",
                    isWalkIn ? "bg-gray-200" : "bg-[#FF0077]/10"
                  )}>
                    <User className={cn("w-5 h-5", isWalkIn ? "text-gray-600" : "text-[#FF0077]")} />
                  </div>
                  <div>
                    <p className="font-medium">
                      {isWalkIn ? "Walk-in Client" : formData.client_name}
                    </p>
                    {!isWalkIn && (formData.client_email || formData.client_phone) && (
                      <p className="text-sm text-gray-600">
                        {formData.client_email || formData.client_phone}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearClient}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              /* Client search */
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search for a client..."
                    value={clientSearchQuery}
                    onChange={(e) => setClientSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                {/* Search results dropdown */}
                {clientSearchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {clientSearchResults.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3"
                        onClick={() => handleSelectClient(client)}
                      >
                        <div className="w-8 h-8 rounded-full bg-[#FF0077]/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-[#FF0077]">
                            {client.first_name.charAt(0)}{client.last_name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{client.first_name} {client.last_name}</p>
                          <p className="text-sm text-gray-600">{client.email || client.phone}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick actions */}
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant={isWalkIn ? "default" : "outline"}
                    size="sm"
                    onClick={handleWalkIn}
                    className={cn(
                      "flex-1",
                      isWalkIn && "bg-[#FF0077] hover:bg-[#D60565] text-white"
                    )}
                  >
                    <User className="w-4 h-4 mr-2" />
                    Walk-in Client
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      // Open new client dialog
                      setShowNewClientDialog(true);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Client
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Walk-in client details - Mobile First */}
          {isWalkIn && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-lg border">
              <div>
                <Label htmlFor="client_name">Name (Optional)</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) =>
                    setFormData({ ...formData, client_name: e.target.value })
                  }
                  placeholder="Enter client name"
                  className="min-h-[44px] touch-manipulation"
                />
              </div>
              <div>
                <PhoneInput
                  value={formData.client_phone}
                  onChange={(value) => {
                    // PhoneInput returns format like "+27 123456789", convert to E.164
                    const e164Format = value.replace(/\s/g, '');
                    setFormData({ ...formData, client_phone: e164Format });
                  }}
                  label="Phone"
                  placeholder="123 456 7890"
                  defaultCountryCode={defaultCountryCode}
                  className="w-full"
                />
                {formData.client_phone && !isValidPhone(formData.client_phone) && (
                  <p className="text-xs text-red-500 mt-1">
                    Phone must be in E.164 format (e.g., +27123456789)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Team Member Selection */}
          <div>
            <Label htmlFor="team_member">Team Member *</Label>
            {isLoadingData ? (
              <div className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm flex items-center text-muted-foreground">
                Loading team members...
              </div>
            ) : (
              <Select
                value={formData.team_member_id}
                onValueChange={(value) => {
                  console.log("Team member selected:", value);
                  setFormData({ ...formData, team_member_id: value });
                }}
                onOpenChange={(open) => {
                  console.log("Team member dropdown open:", open);
                }}
                required
                disabled={isLoadingData}
              >
                <SelectTrigger 
                  className="w-full min-h-[44px] touch-manipulation" 
                  disabled={isLoadingData}
                  onClick={() => console.log("Team member trigger clicked")}
                >
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent 
                  className="!z-[10000]" 
                  position="popper"
                  sideOffset={4}
                >
                  {teamMembers.length === 0 ? (
                    <div className="p-2 text-sm text-gray-500">No team members available</div>
                  ) : (
                    teamMembers.map((member) => (
                      <SelectItem 
                        key={member.id} 
                        value={member.id}
                        className="min-h-[44px] touch-manipulation flex items-center"
                      >
                        {member.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Services & Products Section */}
          <div>
            <Label>Services & Products *</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowServiceDialog(true)}
                className="flex-1"
                disabled={isLoadingData || services.length === 0}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add a service...
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowProductDialog(true)}
                className="flex-1"
                disabled={isLoadingData || products.length === 0}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add a product...
              </Button>
            </div>
            
            {/* Cart Items */}
            {cart.length > 0 && (
              <div className="mt-4 space-y-2">
                {cart.map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {item.type === "service" && item.duration_minutes && (
                          <span className="text-xs text-gray-500">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {item.duration_minutes} min
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-gray-600">
                          R{item.unit_price.toFixed(2)} × {item.quantity} = R{item.total.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUpdateQuantity(index, -1)}
                        className="h-8 w-8 p-0"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUpdateQuantity(index, 1)}
                        className="h-8 w-8 p-0"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(index)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {cart.length === 0 && !isLoadingData && (
              <p className="text-sm text-gray-500 mt-2">No services or products added yet</p>
            )}
          </div>

          {/* Date, Time, Duration - Mobile First Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <Label>Date *</Label>
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal min-h-[44px] touch-manipulation"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    <span className="text-sm sm:text-base">
                      {format(formData.scheduled_date, "MMM d, yyyy")}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 !z-[10000]" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.scheduled_date}
                    onSelect={(date) => {
                      if (date) {
                        setFormData({ ...formData, scheduled_date: date });
                        setIsDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                    className="rounded-md border"
                    classNames={{
                      months: "flex flex-col",
                      month: "space-y-4",
                      caption: "flex justify-center pt-1 relative items-center",
                      caption_label: "text-sm font-medium",
                      nav: "space-x-1 flex items-center",
                      nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                      nav_button_previous: "absolute left-1",
                      nav_button_next: "absolute right-1",
                      table: "w-full border-collapse",
                      head_row: "flex",
                      head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                      row: "flex w-full mt-2",
                      cell: "h-9 w-9 text-center text-sm p-0 relative",
                      day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md",
                      day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                      day_today: "bg-accent text-accent-foreground",
                      day_outside: "day-outside text-muted-foreground opacity-50",
                      day_disabled: "text-muted-foreground opacity-50",
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label htmlFor="time">Time *</Label>
              <Select
                value={formData.scheduled_time}
                onValueChange={(value) => {
                  console.log("Time selected:", value);
                  setFormData({ ...formData, scheduled_time: value });
                }}
                onOpenChange={(open) => {
                  console.log("Time dropdown open:", open);
                }}
                required
              >
                <SelectTrigger 
                  className="min-h-[44px] touch-manipulation w-full" 
                  onClick={() => console.log("Time trigger clicked")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent 
                  className="!z-[10000]" 
                  position="popper"
                  sideOffset={4}
                >
                  {generateTimeOptions().map((time) => (
                    <SelectItem 
                      key={time} 
                      value={time}
                      className="min-h-[44px] touch-manipulation flex items-center"
                    >
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="duration">Duration (min) *</Label>
              <div className="space-y-3">
                <Slider
                  value={[formData.duration_minutes]}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      duration_minutes: value[0],
                    })
                  }
                  min={15}
                  max={480}
                  step={15}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>15 min</span>
                  <span className="font-medium text-gray-900">{formData.duration_minutes} min</span>
                  <span>8 hrs</span>
                </div>
                <Input
                  id="duration"
                  type="number"
                  value={formData.duration_minutes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      duration_minutes: parseInt(e.target.value) || 60,
                    })
                  }
                  min={15}
                  step={15}
                  className="min-h-[44px] touch-manipulation"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="price">Price (R)</Label>
            <Input
              id="price"
              type="number"
              value={formData.price}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  price: parseFloat(e.target.value) || 0,
                })
              }
              min={0}
              step={0.01}
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
            />
          </div>

          {/* Recurring Appointment Option - Mangomint Style */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-start gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="is_recurring"
                checked={formData.is_recurring || false}
                onChange={(e) =>
                  setFormData({ ...formData, is_recurring: e.target.checked })
                }
                className="mt-1 rounded w-4 h-4 sm:w-5 sm:h-5 touch-manipulation"
              />
              <div className="flex-1">
                <Label htmlFor="is_recurring" className="font-medium text-sm sm:text-base cursor-pointer">
                  Make this a repeating appointment
                </Label>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  Schedule this appointment to repeat automatically
                </p>
              </div>
            </div>
            {formData.is_recurring && (
              <div className="ml-0 sm:ml-8 space-y-3 sm:space-y-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <Label htmlFor="recurrence_pattern" className="text-sm sm:text-base">Repeat Pattern *</Label>
                  <Select
                    value={formData.recurrence_pattern || "weekly"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        recurrence_pattern: value as any,
                      })
                    }
                  >
                    <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent 
                      className="!z-[10000]" 
                      position="popper"
                      sideOffset={4}
                    >
                      <SelectItem 
                        value="daily"
                        className="min-h-[44px] touch-manipulation flex items-center"
                      >
                        Daily - Every day
                      </SelectItem>
                      <SelectItem 
                        value="weekly"
                        className="min-h-[44px] touch-manipulation flex items-center"
                      >
                        Weekly - Every week
                      </SelectItem>
                      <SelectItem 
                        value="biweekly"
                        className="min-h-[44px] touch-manipulation flex items-center"
                      >
                        Bi-weekly - Every 2 weeks
                      </SelectItem>
                      <SelectItem 
                        value="monthly"
                        className="min-h-[44px] touch-manipulation flex items-center"
                      >
                        Monthly - Every month
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1.5">How often should this appointment repeat?</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <Label htmlFor="recurrence_end_date" className="text-sm sm:text-base">End Date (Optional)</Label>
                    <Input
                      id="recurrence_end_date"
                      type="date"
                      value={formData.recurrence_end_date || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          recurrence_end_date: e.target.value,
                        })
                      }
                      className="mt-1.5 min-h-[44px] touch-manipulation"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">Stop repeating after this date</p>
                  </div>
                  <div>
                    <Label htmlFor="recurrence_occurrences" className="text-sm sm:text-base">Number of Occurrences (Optional)</Label>
                    <Input
                      id="recurrence_occurrences"
                      type="number"
                      min={1}
                      value={formData.recurrence_occurrences || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          recurrence_occurrences: parseInt(e.target.value) || undefined,
                        })
                      }
                      placeholder="e.g., 10"
                      className="mt-1.5 min-h-[44px] touch-manipulation"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">Leave empty for no limit</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              Cancel
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button 
                type="submit" 
                disabled={isLoading} 
                variant="outline"
                className="flex-1 sm:flex-none min-h-[44px] touch-manipulation"
                onClick={(e) => {
                  e.preventDefault();
                  handleSubmit(e);
                }}
              >
                {isLoading ? "Saving..." : appointment ? "Update" : "Save"}
              </Button>
              {!appointment && (
                <Button 
                  type="button" 
                  disabled={isLoading || !cart.some(item => item.type === "service") || !formData.team_member_id} 
                  className="flex-1 sm:flex-none bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
                  onClick={async (e) => {
                    e.preventDefault();
                    setIsLoading(true);
                    try {
                      const savedAppointment = await handleSubmitAndGetAppointment(e);
                      if (savedAppointment) {
                        // Trigger success callback to refresh calendar
                        onSuccess?.();
                        // Open checkout if handler provided
                        if (onCheckout) {
                          onCheckout(savedAppointment);
                          onOpenChange(false);
                        } else {
                          // Fallback: just close and show success
                          alert("Appointment created! You can now process payment from the appointment details.");
                          onOpenChange(false);
                        }
                      }
                    } catch (error) {
                      console.error("Failed to create appointment for checkout:", error);
                      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
                      alert(`Failed to create appointment: ${errorMessage}`);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  {isLoading ? "Processing..." : "Checkout"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
      
      {/* Service Selection Dialog */}
      <Dialog open={showServiceDialog} onOpenChange={setShowServiceDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select a Service</DialogTitle>
            <DialogDescription>Choose a service to add to the appointment</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {services.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No services available</p>
            ) : (
              services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => handleAddService(service)}
                  className="w-full text-left p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-sm text-gray-500">
                        {service.duration_minutes} min • R{service.price.toFixed(2)}
                      </p>
                    </div>
                    <Plus className="w-5 h-5 text-gray-400" />
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Product Selection Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select a Product</DialogTitle>
            <DialogDescription>Choose a product to add to the appointment</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {products.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No products available</p>
            ) : (
              products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleAddProduct(product)}
                  className="w-full text-left p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-gray-500">
                        R{product.retail_price.toFixed(2)}
                        {product.brand && ` • ${product.brand}`}
                        {product.sku && ` • SKU: ${product.sku}`}
                      </p>
                    </div>
                    <Plus className="w-5 h-5 text-gray-400" />
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
