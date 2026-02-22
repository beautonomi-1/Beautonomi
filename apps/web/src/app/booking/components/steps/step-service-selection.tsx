"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Check, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { BookingState } from "../booking-flow";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@beautonomi/i18n";
import ServiceAddons from "./service-addons-inline";
import BookingProducts from "./booking-products";

interface StepServiceSelectionProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  onNext: () => void;
  providerSlug: string;
}

interface Service {
  id: string;
  title: string;
  description?: string;
  duration: number;
  price: number;
  currency: string;
  category: string;
  hasAddons: boolean;
  hasVariants?: boolean;
}

interface Staff {
  id: string;
  name: string;
  role: string;
  avatar_url?: string;
  rating?: number;
  mobileReady: boolean;
}

export default function StepServiceSelection({
  bookingState,
  updateBookingState,
  onNext: _onNext,
  providerSlug,
}: StepServiceSelectionProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serviceVariants, setServiceVariants] = useState<Record<string, any[]>>({});
  const [loadingVariants, setLoadingVariants] = useState<Record<string, boolean>>({});
  const [groupBookingSettings, setGroupBookingSettings] = useState<{
    enabled: boolean;
    maxGroupSize: number;
    excludedServices: string[];
  } | null>(null);
  const staffScrollRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const hasLoadedRef = useRef(false);
  const lastProviderSlugRef = useRef<string | null>(null);
  const lastModeRef = useRef<string | null>(null);

  useEffect(() => {
    // Only load if providerSlug changed or mode actually changed (not just initialized)
    const providerChanged = providerSlug !== lastProviderSlugRef.current;
    const modeChanged = bookingState.mode !== lastModeRef.current;
    
    if (providerSlug && (providerChanged || (modeChanged && hasLoadedRef.current))) {
      hasLoadedRef.current = true;
      lastProviderSlugRef.current = providerSlug;
      lastModeRef.current = bookingState.mode;
      
      loadServices();
      loadStaff();
      loadGroupBookingSettings();
    } else if (providerSlug && !hasLoadedRef.current) {
      // Initial load
      hasLoadedRef.current = true;
      lastProviderSlugRef.current = providerSlug;
      lastModeRef.current = bookingState.mode;
      
      loadServices();
      loadStaff();
      loadGroupBookingSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerSlug, bookingState.mode]);

  // Ensure all selected services have staff assigned (auto-assign if missing)
  // Also re-assign staff when mode changes (e.g., mobile requires mobile-ready staff)
  useEffect(() => {
    if (staff.length === 0 || bookingState.selectedServices.length === 0) return;
    
    // Check if any service has staff that's no longer available for current mode
    const servicesNeedingStaff = bookingState.selectedServices.filter((service) => {
      if (!service.staffId || service.staffId.trim() === "") return true;
      // Check if assigned staff is still available for current mode
      const assignedStaff = staff.find((s) => s.id === service.staffId);
      if (!assignedStaff) return true; // Staff no longer exists
      if (bookingState.mode === "mobile" && !assignedStaff.mobileReady) return true; // Not mobile-ready
      return false;
    });
    
    if (servicesNeedingStaff.length > 0 && filteredStaff.length > 0) {
      // Auto-assign first available staff to services missing or with invalid staff
      const defaultStaff = filteredStaff[0];
      updateBookingState({
        selectedServices: bookingState.selectedServices.map((service) => {
          const needsStaff = !service.staffId || service.staffId.trim() === "";
          const assignedStaff = staff.find((s) => s.id === service.staffId);
          const isInvalidStaff = 
            !assignedStaff || 
            (bookingState.mode === "mobile" && assignedStaff && !assignedStaff.mobileReady);
          
          if (needsStaff || isInvalidStaff) {
            return {
              ...service,
              staffId: defaultStaff.id,
              staffName: defaultStaff.name,
            };
          }
          return service;
        }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff.length, bookingState.selectedServices.length, bookingState.mode]);

  const loadGroupBookingSettings = async () => {
    if (!providerSlug) return;
    
    try {
      const response = await fetcher.get<{
        data: {
          enabled: boolean;
          maxGroupSize: number;
          excludedServices: string[];
        };
      }>(`/api/public/providers/${encodeURIComponent(providerSlug)}/group-booking-settings`);
      setGroupBookingSettings(response.data);
    } catch {
      // If endpoint doesn't exist or fails, group booking is not available
      setGroupBookingSettings({ enabled: false, maxGroupSize: 10, excludedServices: [] });
    }
  };

  // Handle pre-selected service from URL (only once when services load)
  useEffect(() => {
    if (typeof window === "undefined" || services.length === 0) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const serviceId = urlParams.get("serviceId");
    
    if (serviceId && !bookingState.selectedServices.some((s) => s.id === serviceId)) {
      const service = services.find((s) => s.id === serviceId);
      if (service) {
        // Auto-select first available staff member if staff selection is available
        const defaultStaff = filteredStaff.length > 0 ? filteredStaff[0] : null;
        
        // Auto-select the service with staff assignment
        updateBookingState({
          selectedServices: [
            ...bookingState.selectedServices,
            {
              id: service.id,
              title: service.title,
              duration: service.duration,
              price: service.price,
              currency: service.currency,
              staffId: defaultStaff?.id,
              staffName: defaultStaff?.name,
            },
          ],
        });
        if (service.hasAddons || defaultStaff) {
          setExpandedService(service.id);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.length, staff.length]); // Run when services or staff are loaded

  const loadServices = async () => {
    if (!providerSlug) {
      console.error("[Service Selection] No provider slug provided");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      // Since services is now first step, load all services (type=salon shows all services)
      // Default to "salon" which will load all services regardless of venue type
      const mode = bookingState.mode === "mobile" ? "mobile" : "salon";
      
      // Get serviceId from URL if available (for pre-selected services)
      const urlParams = new URLSearchParams(window.location.search);
      const serviceId = urlParams.get("serviceId");
      
      console.log(`[Service Selection] Loading services for providerSlug: ${providerSlug}, mode: ${mode}, serviceId: ${serviceId || 'none'}`);
      
      // Build API URL with serviceId if available
      let apiUrl = `/api/services?type=${mode}&providerSlug=${encodeURIComponent(providerSlug)}`;
      if (serviceId) {
        apiUrl += `&serviceId=${encodeURIComponent(serviceId)}`;
      }
      
      const response = await fetcher.get<{ data: Service[] }>(apiUrl, {
        timeoutMs: 20000 // 20 seconds timeout for services loading
      });
      
      console.log(`[Service Selection] API Response:`, response);
      const servicesData = response.data || [];
      console.log(`[Service Selection] Loaded ${servicesData.length} services`);
      
      if (servicesData.length === 0) {
        console.error(`[Service Selection] Empty services array for provider: ${providerSlug}`);
        console.error(`[Service Selection] Full API response:`, JSON.stringify(response, null, 2));
      }
      
      if (servicesData.length === 0) {
        console.warn(`[Service Selection] No services found for provider: ${providerSlug}`);
        toast.error("No services available for this provider");
      }
      
      setServices(servicesData);
      
      // Extract unique categories
      const uniqueCategories = Array.from(
        new Set(servicesData.map((s) => s.category))
      );
      setCategories(uniqueCategories);
      if (uniqueCategories.length > 0) {
        setActiveCategory(uniqueCategories[0]);
      }
    } catch (error) {
      console.error("[Service Selection] Error loading services:", error);
      toast.error(
        error instanceof FetchError
          ? error.message
          : "Failed to load services"
      );
      setServices([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStaff = async () => {
    try {
      const response = await fetcher.get<{ data: Staff[] }>(
        `/api/public/providers/${providerSlug}/staff`
      );
      setStaff(response.data || []);
    } catch (error) {
      console.error("Error loading staff:", error);
    }
  };

  // Filter services based on category and group booking exclusions
  const filteredServices = (activeCategory
    ? services.filter((s) => s.category === activeCategory)
    : services
  ).filter((s) => {
    // If group booking is enabled, exclude services that are not allowed
    if (bookingState.isGroupBooking && groupBookingSettings?.excludedServices.length) {
      return !groupBookingSettings.excludedServices.includes(s.id);
    }
    return true;
  });

  const filteredStaff = bookingState.mode === "mobile"
    ? staff.filter((s) => s.mobileReady)
    : staff;

  const handleServiceToggle = (service: Service) => {
    const isSelected = bookingState.selectedServices.some(
      (s) => s.id === service.id
    );

    if (isSelected) {
      updateBookingState({
        selectedServices: bookingState.selectedServices.filter(
          (s) => s.id !== service.id
        ),
      });
      setExpandedService(null);
    } else {
      // Auto-select first available staff member if staff selection is available
      const defaultStaff = filteredStaff.length > 0 ? filteredStaff[0] : null;
      
      updateBookingState({
        selectedServices: [
          ...bookingState.selectedServices,
          {
            id: service.id,
            title: service.title,
            duration: service.duration,
            price: service.price,
            currency: service.currency,
            staffId: defaultStaff?.id,
            staffName: defaultStaff?.name,
          },
        ],
      });
      setExpandedService(service.id);
      
      // Load variants if service has them
      if (service.hasVariants) {
        loadVariants(service.id);
      }
    }
  };

  const loadVariants = async (serviceId: string) => {
    if (serviceVariants[serviceId] || loadingVariants[serviceId]) {
      return; // Already loaded or loading
    }

    try {
      setLoadingVariants((prev) => ({ ...prev, [serviceId]: true }));
      const response = await fetcher.get<{ data: { variants: any[] } }>(
        `/api/public/providers/${encodeURIComponent(providerSlug)}/services/${serviceId}/variants`
      );
      
      if (response.data?.variants && response.data.variants.length > 0) {
        setServiceVariants((prev) => ({
          ...prev,
          [serviceId]: response.data.variants,
        }));
      }
    } catch (error) {
      console.error(`[Service Selection] Error loading variants for ${serviceId}:`, error);
    } finally {
      setLoadingVariants((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const handleVariantSelect = (serviceId: string, variant: any) => {
    // Replace the base service with the selected variant, preserving staff assignment
    const currentService = bookingState.selectedServices.find((s) => s.id === serviceId);
    updateBookingState({
      selectedServices: bookingState.selectedServices.map((s) =>
        s.id === serviceId
          ? {
              id: variant.id,
              title: variant.title || variant.variant_name,
              duration: variant.duration,
              price: variant.price,
              currency: variant.currency,
              baseServiceId: serviceId, // Keep reference to base service
              staffId: currentService?.staffId, // Preserve staff assignment
              staffName: currentService?.staffName, // Preserve staff name
            }
          : s
      ),
    });
  };

  const handleStaffSelect = (serviceId: string, staffMember: Staff | null) => {
    updateBookingState({
      selectedServices: bookingState.selectedServices.map((s) =>
        s.id === serviceId
          ? {
              ...s,
              staffId: staffMember?.id,
              staffName: staffMember?.name,
            }
          : s
      ),
    });
  };

  const scrollStaff = (direction: "left" | "right") => {
    if (staffScrollRef.current) {
      const scrollAmount = direction === "left" ? -200 : 200;
      staffScrollRef.current.scrollBy({
        left: scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          {t("booking.selectService")}
        </h2>
        <p className="text-gray-600">
          {t("booking.addService")}
        </p>
      </div>

      {/* Group Booking Toggle */}
      {groupBookingSettings?.enabled && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <label className="flex items-center gap-3 cursor-pointer touch-target">
            <input
              type="checkbox"
              checked={bookingState.isGroupBooking || false}
              onChange={(e) => {
                updateBookingState({ isGroupBooking: e.target.checked });
                if (!e.target.checked) {
                  // Clear group participants when disabling
                  updateBookingState({ groupParticipants: undefined });
                }
              }}
              className="w-5 h-5 rounded border-gray-300 text-[#FF0077] focus:ring-[#FF0077]"
            />
            <div className="flex-1">
              <p className="font-medium text-gray-900">Book for multiple people</p>
              <p className="text-sm text-gray-600">
                Add up to {groupBookingSettings.maxGroupSize} participants to this booking
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Category Tabs */}
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap touch-target transition-colors ${
                activeCategory === category
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {/* Services List */}
      <div className="space-y-3">
        {filteredServices.map((service) => {
          const isSelected = bookingState.selectedServices.some(
            (s) => s.id === service.id
          );
          const selectedService = bookingState.selectedServices.find(
            (s) => s.id === service.id
          );
          const _isExpanded = expandedService === service.id;

          return (
            <motion.div
              key={service.id}
              layout
              className={`border-2 rounded-xl overflow-hidden transition-all ${
                isSelected
                  ? "border-[#FF0077] bg-pink-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              {/* Service Card */}
              <button
                onClick={() => handleServiceToggle(service)}
                className="w-full p-4 text-left touch-target"
                aria-label={`${isSelected ? "Deselect" : "Select"} ${service.title}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {service.title}
                    </h3>
                    {service.description && (
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                        {service.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {service.duration} min
                      </span>
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(service.price, service.currency)}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected
                        ? "bg-[#FF0077] text-white"
                        : "border-2 border-gray-300"
                    }`}
                  >
                    {isSelected ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Plus className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Content: Staff Selection & Addons */}
              {isSelected && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-gray-200 bg-white"
                >
                  <div className="p-4 space-y-4">
                    {/* Variants Selection */}
                    {service.hasVariants && serviceVariants[service.id] && serviceVariants[service.id].length > 0 && (
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-3 block">
                          Choose Option
                        </Label>
                        <div className="space-y-2">
                          {/* Base service option */}
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleVariantSelect(service.id, {
                              id: service.id,
                              title: service.title,
                              duration: service.duration,
                              price: service.price,
                              currency: service.currency,
                            })}
                            className={`w-full p-3 rounded-lg border-2 text-left transition-all touch-target ${
                              !selectedService?.baseServiceId || selectedService?.id === service.id
                                ? "border-[#FF0077] bg-pink-50"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium text-gray-900">{service.title}</span>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {service.duration} min
                                  </span>
                                  <span className="font-semibold text-gray-900">
                                    {formatCurrency(service.price, service.currency)}
                                  </span>
                                </div>
                              </div>
                              {(!selectedService?.baseServiceId || selectedService?.id === service.id) && (
                                <Check className="w-5 h-5 text-[#FF0077]" />
                              )}
                            </div>
                          </motion.button>
                          
                          {/* Variant options */}
                          {serviceVariants[service.id].map((variant: any) => (
                            <motion.button
                              key={variant.id}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleVariantSelect(service.id, variant)}
                              className={`w-full p-3 rounded-lg border-2 text-left transition-all touch-target ${
                                selectedService?.id === variant.id
                                  ? "border-[#FF0077] bg-pink-50"
                                  : "border-gray-200 bg-white hover:border-gray-300"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-medium text-gray-900">
                                    {variant.variant_name || variant.title}
                                  </span>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {variant.duration} min
                                    </span>
                                    <span className="font-semibold text-gray-900">
                                      {formatCurrency(variant.price, variant.currency)}
                                    </span>
                                  </div>
                                </div>
                                {selectedService?.id === variant.id && (
                                  <Check className="w-5 h-5 text-[#FF0077]" />
                                )}
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Staff Selection */}
                    {filteredStaff.length > 0 ? (
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-3 block">
                          Select Professional <span className="text-[#FF0077]">*</span>
                        </Label>
                        <p className="text-xs text-gray-500 mb-3">
                          Choose a professional to ensure your booking appears on their calendar
                        </p>
                        {!selectedService?.staffId && (
                          <p className="text-xs text-[#FF0077] mb-2 font-medium">
                            Please select a professional to continue
                          </p>
                        )}
                        <div className="relative">
                          <div
                            ref={staffScrollRef}
                            className="flex gap-3 overflow-x-auto scrollbar-hide pb-2"
                            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                          >
                            {/* Staff Members */}
                            {filteredStaff.map((staffMember) => (
                              <button
                                key={staffMember.id}
                                onClick={() => handleStaffSelect(service.id, staffMember)}
                                className={`flex-shrink-0 w-20 flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors touch-target ${
                                  selectedService?.staffId === staffMember.id
                                    ? "border-[#FF0077] bg-pink-50"
                                    : "border-gray-200 bg-white"
                                }`}
                              >
                                {staffMember.avatar_url ? (
                                  <img
                                    src={staffMember.avatar_url}
                                    alt={staffMember.name}
                                    className="w-12 h-12 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                                    <span className="text-sm font-semibold text-gray-600">
                                      {staffMember.name.charAt(0)}
                                    </span>
                                  </div>
                                )}
                                <span className="text-xs font-medium text-center line-clamp-2">
                                  {staffMember.name}
                                </span>
                              </button>
                            ))}
                          </div>
                          {filteredStaff.length > 3 && (
                            <>
                              <button
                                onClick={() => scrollStaff("left")}
                                className="absolute left-0 top-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-md touch-target"
                                aria-label="Scroll left"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => scrollStaff("right")}
                                className="absolute right-0 top-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-md touch-target"
                                aria-label="Scroll right"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs font-medium text-red-800 mb-1">
                          ⚠️ No staff members available
                        </p>
                        <p className="text-xs text-red-700">
                          This service requires a staff member to be assigned. Please contact the provider or select a different service.
                        </p>
                      </div>
                    )}

                    {/* Add-ons */}
                    {service.hasAddons && (
                      <ServiceAddons
                        serviceId={service.id}
                        providerSlug={providerSlug}
                        selectedAddons={bookingState.selectedAddons}
                        onAddonsChange={(addons) => {
                          updateBookingState({ selectedAddons: addons });
                        }}
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {filteredServices.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>{t("common.noResults")}</p>
        </div>
      )}

      {/* Products Section */}
      {bookingState.selectedServices.length > 0 && (
        <div className="mt-8 border-t border-gray-200 pt-6">
          <BookingProducts
            bookingState={bookingState}
            updateBookingState={updateBookingState}
            providerSlug={providerSlug}
          />
        </div>
      )}
    </div>
  );
}

