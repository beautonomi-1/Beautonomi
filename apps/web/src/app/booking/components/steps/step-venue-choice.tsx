"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Home, MapPin, AlertCircle, Check, Briefcase, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookingState, BookingMode } from "../booking-flow";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { useSavedAddresses } from "@/hooks/useSavedAddresses";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StepVenueChoiceProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  onNext: () => void;
  providerSlug?: string;
}

interface ProviderLocation {
  id: string;
  name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  country: string;
  is_primary: boolean;
  location_type?: "salon" | "base";
}

export default function StepVenueChoice({
  bookingState,
  updateBookingState,
  onNext: _onNext,
  providerSlug,
}: StepVenueChoiceProps) {
  const { user } = useAuth();
  const { addresses: savedAddresses, saveAddress, loadAddresses } = useSavedAddresses();
  const [isValidating, setIsValidating] = useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [showAddressInput, setShowAddressInput] = useState(false);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [providerLocations, setProviderLocations] = useState<ProviderLocation[]>([]);
  const [showSaveAddressDialog, setShowSaveAddressDialog] = useState(false);
  const [addressToSave, setAddressToSave] = useState<any>(null);
  const [saveAddressLabel, setSaveAddressLabel] = useState("Home");
  const [customLabel, setCustomLabel] = useState("");
  const [offersMobileServices, setOffersMobileServices] = useState<boolean | null>(null);
  const [isLoadingProviderInfo, setIsLoadingProviderInfo] = useState(false);
  const [serviceZones, setServiceZones] = useState<Array<{
    id: string;
    name: string;
    type: string;
    description?: string | null;
    travelFee: number;
    travelTimeMinutes?: number;
    coverage: string;
  }>>([]);
  const [showZonesInfo, setShowZonesInfo] = useState(false);

  // Load provider info to check mobile services availability
  useEffect(() => {
    if (providerSlug) {
      loadProviderInfo();
    }
  }, [providerSlug]);

  const loadProviderInfo = async () => {
    if (!providerSlug) return;
    
    try {
      setIsLoadingProviderInfo(true);
      const [providerResponse, zonesResponse] = await Promise.all([
        fetcher.get<{ data: { offers_mobile_services?: boolean } }>(
          `/api/public/providers/${encodeURIComponent(providerSlug)}`
        ),
        fetcher.get<{ data: { zones?: any[] } }>(
          `/api/public/providers/${encodeURIComponent(providerSlug)}/service-zones`
        ).catch(() => ({ data: { zones: [] } })), // Silently fail if zones endpoint doesn't exist
      ]);
      
      setOffersMobileServices(providerResponse.data?.offers_mobile_services ?? true);
      setServiceZones(zonesResponse.data?.zones || []);
    } catch (error) {
      console.error("Error loading provider info:", error);
      // Default to true if we can't load (backward compatibility)
      setOffersMobileServices(true);
      setServiceZones([]);
    } finally {
      setIsLoadingProviderInfo(false);
    }
  };

  useEffect(() => {
    if (bookingState.mode === "salon" && providerSlug) {
      loadProviderLocations();
    }
  }, [bookingState.mode, providerSlug]);

  const loadProviderLocations = async () => {
    if (!providerSlug) return;
    
    try {
      setIsLoadingLocations(true);
      const response = await fetcher.get<{ data: { locations?: ProviderLocation[] } }>(
        `/api/public/providers/${encodeURIComponent(providerSlug)}`
      );
      const allLocations = response.data?.locations || [];
      // Only show locations where clients can visit (salon); base = distance-only
      const locations = allLocations.filter((l) => (l.location_type || "salon") === "salon");
      setProviderLocations(locations);

      // Auto-select location:
      // 1. If only one location, select it
      // 2. If multiple locations, select primary
      // 3. If no primary, select first one
      if (locations.length === 1) {
        updateBookingState({ selectedLocationId: locations[0].id });
      } else if (locations.length > 1) {
        const primaryLocation = locations.find((loc) => loc.is_primary) || locations[0];
        if (primaryLocation) {
          updateBookingState({ selectedLocationId: primaryLocation.id });
        }
      } else if (locations.length === 0) {
        updateBookingState({ selectedLocationId: undefined });
      }
    } catch (error) {
      console.error("Error loading provider locations:", error);
      toast.error("Failed to load locations");
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const getAddressIcon = (label: string) => {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes("home") || lowerLabel === "home") {
      return <Home className="w-5 h-5 text-[#FF0077] flex-shrink-0 mt-0.5" />;
    } else if (lowerLabel.includes("work") || lowerLabel.includes("office")) {
      return <Briefcase className="w-5 h-5 text-[#FF0077] flex-shrink-0 mt-0.5" />;
    }
    return <MapPin className="w-5 h-5 text-[#FF0077] flex-shrink-0 mt-0.5" />;
  };

  const handleSaveAddress = async () => {
    if (!addressToSave || !user) return;

    const finalLabel = saveAddressLabel === "Other" ? customLabel : saveAddressLabel;
    if (!finalLabel || finalLabel.trim() === "") {
      toast.error("Please enter a label for this address");
      return;
    }

    try {
      const addressData = {
        label: finalLabel,
        address_line1: addressToSave.structuredAddress?.line1 || addressToSave.fullAddress?.split(",")[0] || "",
        city: addressToSave.structuredAddress?.city || "",
        country: addressToSave.structuredAddress?.country || HOUSE_CALL_CONFIG.DEFAULT_COUNTRY_NAME,
        postal_code: addressToSave.structuredAddress?.postalCode || "",
        latitude: addressToSave.coordinates?.lat || null,
        longitude: addressToSave.coordinates?.lng || null,
        is_default: false,
      };

      await saveAddress(addressData);
      toast.success(`Address saved as "${finalLabel}"`);
      setShowSaveAddressDialog(false);
      setAddressToSave(null);
      setSaveAddressLabel("Home");
      setCustomLabel("");
      await loadAddresses(); // Refresh saved addresses
    } catch (error: any) {
      toast.error(error.message || "Failed to save address");
    }
  };

  const handleModeSelect = (mode: BookingMode) => {
    setZoneError(null);
    updateBookingState({ mode });
    
    if (mode === "salon") {
      updateBookingState({ address: null });
      // Can proceed immediately for salon
    } else {
      // For mobile, need to select/enter address
      setShowAddressInput(true);
    }
  };

  const handleAddressSelect = async (address: any) => {
    setZoneError(null);
    setIsValidating(true);
    
    try {
      // Build address string from saved address or autocomplete result
      let addressString: string;
      if (address.fullAddress) {
        addressString = address.fullAddress;
      } else if (address.place_name) {
        addressString = address.place_name;
      } else if (address.address_line1) {
        // Saved address from database - re-validate to ensure it's still valid
        addressString = [
          address.address_line1,
          address.address_line2,
          address.city,
          address.state,
          address.postal_code,
          address.country,
        ]
          .filter(Boolean)
          .join(", ");
      } else {
        addressString = address.address || "";
      }
      
      const response = await fetcher.post<{
        data: { 
          valid: boolean; 
          travelFee: number; 
          zoneId: string | null;
          distanceKm?: number;
          travelTimeMinutes?: number;
          coordinates?: { latitude: number; longitude: number };
          address?: {
            line1: string;
            city: string;
            country: string;
            postalCode?: string;
            fullAddress: string;
          };
          reason?: string;
          breakdown?: Array<{ label: string; amount: number }>;
        };
      }>("/api/location/validate", {
        address: addressString,
        provider_slug: providerSlug,
        provider_id: bookingState.providerId,
      });

      if (response.data.valid) {
        // Parse access_codes if it's a string (from database JSONB)
        const parseAccessCodes = (codes: any): { gate?: string; buzzer?: string; door?: string } | undefined => {
          if (!codes) return undefined;
          if (typeof codes === 'string') {
            try {
              return JSON.parse(codes);
            } catch {
              return undefined;
            }
          }
          return codes;
        };

        const validatedAddress = {
          id: address.id,
          fullAddress: response.data.address?.fullAddress || addressString,
          zoneId: response.data.zoneId || undefined,
          travelFee: response.data.travelFee,
          distanceKm: response.data.distanceKm,
          travelTimeMinutes: response.data.travelTimeMinutes,
          breakdown: response.data.breakdown,
          coordinates: response.data.coordinates 
            ? { lat: response.data.coordinates.latitude, lng: response.data.coordinates.longitude }
            : (address.coordinates || address.latitude && address.longitude 
              ? { lat: address.latitude, lng: address.longitude }
              : undefined),
          // Store structured address for booking creation
          structuredAddress: response.data.address ? {
            line1: response.data.address.line1,
            city: response.data.address.city,
            country: response.data.address.country,
            postalCode: response.data.address.postalCode,
          } : undefined,
          // Preserve house call specific fields from saved address
          apartmentUnit: address.apartment_unit || undefined,
          buildingName: address.building_name || undefined,
          floorNumber: address.floor_number || undefined,
          accessCodes: parseAccessCodes(address.access_codes),
          parkingInstructions: address.parking_instructions || undefined,
          locationLandmarks: address.location_landmarks || undefined,
        };

        updateBookingState({ address: validatedAddress });
        setShowAddressInput(false);
      } else {
        setZoneError(
          response.data.reason || "We don't service this area yet! Would you like to book at our Salon instead?"
        );
      }
    } catch (error) {
      toast.error(
        error instanceof FetchError
          ? error.message
          : "Failed to validate address"
      );
    } finally {
      setIsValidating(false);
    }
  };

  const handleAddressInput = async (selectedAddress: any) => {
    if (!selectedAddress) return;

    setZoneError(null);
    setIsValidating(true);

    try {
      const addressString = selectedAddress.place_name || 
        `${selectedAddress.address_line1}, ${selectedAddress.city}, ${selectedAddress.country}`;
      
      const response = await fetcher.post<{
        data: { 
          valid: boolean; 
          travelFee: number; 
          zoneId: string | null;
          distanceKm?: number;
          travelTimeMinutes?: number;
          coordinates?: { latitude: number; longitude: number };
          address?: {
            line1: string;
            city: string;
            country: string;
            postalCode?: string;
            fullAddress: string;
          };
          reason?: string;
          breakdown?: Array<{ label: string; amount: number }>;
        };
      }>("/api/location/validate", {
        address: addressString,
        provider_slug: providerSlug,
        provider_id: bookingState.providerId,
      });

      if (response.data.valid) {
        const validatedAddress = {
          fullAddress: response.data.address?.fullAddress || addressString,
          zoneId: response.data.zoneId || undefined,
          travelFee: response.data.travelFee,
          distanceKm: response.data.distanceKm,
          travelTimeMinutes: response.data.travelTimeMinutes,
          breakdown: response.data.breakdown,
          coordinates: response.data.coordinates 
            ? { lat: response.data.coordinates.latitude, lng: response.data.coordinates.longitude }
            : (selectedAddress.latitude && selectedAddress.longitude
              ? { lat: selectedAddress.latitude, lng: selectedAddress.longitude }
              : undefined),
          // Store structured address for booking creation
          structuredAddress: response.data.address ? {
            line1: response.data.address.line1,
            city: response.data.address.city,
            country: response.data.address.country,
            postalCode: response.data.address.postalCode,
          } : undefined,
        };

        updateBookingState({ address: validatedAddress });
        
        // If user is logged in, offer to save address
        if (user && !savedAddresses.find(addr => 
          addr.address_line1 === validatedAddress.structuredAddress?.line1 &&
          addr.city === validatedAddress.structuredAddress?.city
        )) {
          setAddressToSave(validatedAddress);
          setShowSaveAddressDialog(true);
        }
        
        setAddressInput("");
        setShowAddressInput(false);
      } else {
        setZoneError(
          response.data.reason || "We don't service this area yet! Would you like to book at our Salon instead?"
        );
      }
    } catch (error) {
      toast.error(
        error instanceof FetchError
          ? error.message
          : "Failed to validate address"
      );
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          How would you like your service?
        </h2>
        <p className="text-gray-600">
          Choose between visiting our salon or having us come to you
        </p>
      </div>

      {/* Mode Selection */}
      <div className="grid grid-cols-2 gap-4">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => handleModeSelect("salon")}
          className={`p-6 rounded-xl border-2 transition-all touch-target ${
            bookingState.mode === "salon"
              ? "border-[#FF0077] bg-pink-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
          aria-label="Book at salon"
        >
          <Building2
            className={`w-8 h-8 mx-auto mb-3 ${
              bookingState.mode === "salon" ? "text-[#FF0077]" : "text-gray-400"
            }`}
          />
          <h3 className="font-semibold text-gray-900 mb-1">At the Salon</h3>
          <p className="text-sm text-gray-600">
            Visit our location for your service
          </p>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => handleModeSelect("mobile")}
          disabled={offersMobileServices === false || isLoadingProviderInfo}
          className={`p-6 rounded-xl border-2 transition-all touch-target ${
            bookingState.mode === "mobile"
              ? "border-[#FF0077] bg-pink-50"
              : offersMobileServices === false
              ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
          aria-label="Book at home or office"
        >
          <Home
            className={`w-8 h-8 mx-auto mb-3 ${
              bookingState.mode === "mobile" ? "text-[#FF0077]" : offersMobileServices === false ? "text-gray-300" : "text-gray-400"
            }`}
          />
          <h3 className="font-semibold text-gray-900 mb-1">At My Home/Office</h3>
          <p className="text-sm text-gray-600">
            {offersMobileServices === false 
              ? "Not available for this provider"
              : isLoadingProviderInfo
              ? "Checking availability..."
              : "We'll come to your location"}
          </p>
        </motion.button>
      </div>

      {/* Location Selection for Salon */}
      {bookingState.mode === "salon" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-4"
        >
          {isLoadingLocations ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading locations...</div>
            </div>
          ) : providerLocations.length > 1 ? (
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-3 block">
                Select Location
              </Label>
              <div className="space-y-2">
                {providerLocations.map((location) => (
                  <motion.button
                    key={location.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => updateBookingState({ selectedLocationId: location.id })}
                    className={`w-full p-4 text-left border-2 rounded-lg transition-all touch-target ${
                      bookingState.selectedLocationId === location.id
                        ? "border-[#FF0077] bg-pink-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-[#FF0077] flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-gray-900">{location.name}</p>
                          {location.is_primary && (
                            <span className="text-xs bg-[#FF0077] text-white px-2 py-0.5 rounded">
                              Primary
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {location.address_line1}
                          {location.address_line2 && `, ${location.address_line2}`}
                        </p>
                        <p className="text-sm text-gray-600">
                          {location.city}, {location.country}
                        </p>
                      </div>
                      {bookingState.selectedLocationId === location.id && (
                        <Check className="w-5 h-5 text-[#FF0077] flex-shrink-0" />
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : providerLocations.length === 1 ? (
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">{providerLocations[0].name}</p>
                  <p className="text-sm text-gray-600">
                    {providerLocations[0].address_line1}, {providerLocations[0].city}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </motion.div>
      )}

      {/* Address Selection for Mobile */}
      {bookingState.mode === "mobile" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-4"
        >
          {/* Service Zones Info */}
          {serviceZones.length > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <button
                onClick={() => setShowZonesInfo(!showZonesInfo)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">
                    Service Areas ({serviceZones.length})
                  </span>
                </div>
                <span className="text-xs text-blue-600">
                  {showZonesInfo ? "Hide" : "Show"}
                </span>
              </button>
              {showZonesInfo && (
                <div className="mt-3 space-y-2 pt-3 border-t border-blue-200">
                  {serviceZones.map((zone) => (
                    <div key={zone.id} className="text-xs text-blue-800">
                      <div className="font-medium">{zone.name}</div>
                      <div className="text-blue-600">{zone.coverage}</div>
                      {zone.travelFee > 0 && (
                        <div className="text-blue-600">
                          Travel fee: {zone.travelFee.toFixed(2)} {bookingState.selectedServices[0]?.currency || "ZAR"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {zoneError && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">{zoneError}</p>
                {serviceZones.length > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    This provider services: {serviceZones.map(z => z.name).join(", ")}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => handleModeSelect("salon")}
                >
                  Book at Salon Instead
                </Button>
              </div>
            </div>
          )}

          {!showAddressInput && savedAddresses.length > 0 && (
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-3 block">
                Select Saved Address
              </Label>
              <div className="space-y-2">
                {savedAddresses.map((address) => {
                  const addressString = (address as { fullAddress?: string }).fullAddress || 
                    `${address.address_line1}${address.address_line2 ? `, ${address.address_line2}` : ""}, ${address.city}, ${address.country}`;
                  
                  return (
                    <button
                      key={address.id}
                      onClick={() => handleAddressSelect(address)}
                      disabled={isValidating}
                      className="w-full p-4 text-left border-2 border-gray-200 rounded-lg hover:border-[#FF0077] hover:bg-pink-50 transition-all touch-target disabled:opacity-50"
                    >
                      <div className="flex items-start gap-3">
                        {getAddressIcon(address.label || "Home")}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-gray-900">
                              {address.label || "Home"}
                            </p>
                            {address.is_default && (
                              <Star className="w-4 h-4 text-[#FF0077] fill-[#FF0077]" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            {addressString}
                          </p>
                        </div>
                        {bookingState.address?.id === address.id && (
                          <Check className="w-5 h-5 text-[#FF0077] flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!showAddressInput && (
            <Button
              variant="outline"
              onClick={() => setShowAddressInput(true)}
              className="w-full touch-target"
            >
              {savedAddresses.length > 0
                ? "Enter New Address"
                : "Enter Address"}
            </Button>
          )}

          {showAddressInput && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              <div>
                <Label htmlFor="address" className="text-sm font-medium text-gray-700">
                  Enter Your Address
                </Label>
                <p className="text-xs text-gray-500 mb-2">
                  Start typing your address and select from suggestions. We'll calculate travel fees based on your location.
                </p>
                <AddressAutocomplete
                  value={addressInput}
                  onChange={(address) => {
                    if (address) {
                      handleAddressInput(address);
                    }
                  }}
                  onInputChange={(value) => setAddressInput(value)}
                  placeholder="Enter your full address"
                  required
                  disabled={isValidating}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddressInput(false);
                    setAddressInput("");
                  }}
                  className="flex-1 touch-target"
                  disabled={isValidating}
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          )}

          {bookingState.address && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-900">Address Confirmed</p>
                    <p className="text-sm text-green-700 mt-1">
                      {bookingState.address.fullAddress}
                    </p>
                    {bookingState.address.travelFee !== undefined && (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm font-medium text-green-900">
                          Travel Fee: {bookingState.address.travelFee.toFixed(2)} {bookingState.selectedServices[0]?.currency || "ZAR"}
                        </p>
                        {bookingState.address.distanceKm && (
                          <p className="text-xs text-green-700">
                            Distance: {bookingState.address.distanceKm.toFixed(1)}km
                            {bookingState.address.travelTimeMinutes && ` • Est. travel time: ${bookingState.address.travelTimeMinutes} min`}
                          </p>
                        )}
                        {bookingState.address.breakdown && bookingState.address.breakdown.length > 0 && (
                          <div className="text-xs text-green-700 mt-1 pt-1 border-t border-green-200">
                            {bookingState.address.breakdown.map((item, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span>{item.label}:</span>
                                <span>{item.amount.toFixed(2)} {bookingState.selectedServices[0]?.currency || "ZAR"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* House Call Specific Details */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <p className="text-sm font-medium text-blue-900">Additional Location Details</p>
                <p className="text-xs text-blue-700">
                  Help your provider find you easily by providing these details
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="apartmentUnit" className="text-xs text-blue-800">
                      Apartment/Unit Number
                    </Label>
                    <Input
                      id="apartmentUnit"
                      value={bookingState.address.apartmentUnit || ""}
                      onChange={(e) => {
                        updateBookingState({
                          address: {
                            ...bookingState.address!,
                            apartmentUnit: e.target.value,
                          },
                        });
                      }}
                      placeholder="e.g., Apt 5B, Unit 12"
                      className="mt-1 text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="buildingName" className="text-xs text-blue-800">
                      Building/Complex Name
                    </Label>
                    <Input
                      id="buildingName"
                      value={bookingState.address.buildingName || ""}
                      onChange={(e) => {
                        updateBookingState({
                          address: {
                            ...bookingState.address!,
                            buildingName: e.target.value,
                          },
                        });
                      }}
                      placeholder="e.g., Sunset Towers"
                      className="mt-1 text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="floorNumber" className="text-xs text-blue-800">
                      Floor Number
                    </Label>
                    <Input
                      id="floorNumber"
                      value={bookingState.address.floorNumber || ""}
                      onChange={(e) => {
                        updateBookingState({
                          address: {
                            ...bookingState.address!,
                            floorNumber: e.target.value,
                          },
                        });
                      }}
                      placeholder="e.g., 3rd Floor"
                      className="mt-1 text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="parkingInstructions" className="text-xs text-blue-800">
                      Parking Instructions
                    </Label>
                    <Input
                      id="parkingInstructions"
                      value={bookingState.address.parkingInstructions || ""}
                      onChange={(e) => {
                        updateBookingState({
                          address: {
                            ...bookingState.address!,
                            parkingInstructions: e.target.value,
                          },
                        });
                      }}
                      placeholder="e.g., Free street parking, Visitor parking lot"
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="accessCodes" className="text-xs text-blue-800 mb-2 block">
                    Access Codes (Optional)
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Input
                        id="gateCode"
                        value={bookingState.address.accessCodes?.gate || ""}
                        onChange={(e) => {
                          updateBookingState({
                            address: {
                              ...bookingState.address!,
                              accessCodes: {
                                ...bookingState.address!.accessCodes,
                                gate: e.target.value,
                              },
                            },
                          });
                        }}
                        placeholder="Gate code"
                        className="text-sm"
                      />
                      <Label htmlFor="gateCode" className="text-xs text-blue-600 mt-0.5 block">Gate</Label>
                    </div>
                    <div>
                      <Input
                        id="buzzerCode"
                        value={bookingState.address.accessCodes?.buzzer || ""}
                        onChange={(e) => {
                          updateBookingState({
                            address: {
                              ...bookingState.address!,
                              accessCodes: {
                                ...bookingState.address!.accessCodes,
                                buzzer: e.target.value,
                              },
                            },
                          });
                        }}
                        placeholder="Buzzer code"
                        className="text-sm"
                      />
                      <Label htmlFor="buzzerCode" className="text-xs text-blue-600 mt-0.5 block">Buzzer</Label>
                    </div>
                    <div>
                      <Input
                        id="doorCode"
                        value={bookingState.address.accessCodes?.door || ""}
                        onChange={(e) => {
                          updateBookingState({
                            address: {
                              ...bookingState.address!,
                              accessCodes: {
                                ...bookingState.address!.accessCodes,
                                door: e.target.value,
                              },
                            },
                          });
                        }}
                        placeholder="Door code"
                        className="text-sm"
                      />
                      <Label htmlFor="doorCode" className="text-xs text-blue-600 mt-0.5 block">Door</Label>
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="locationLandmarks" className="text-xs text-blue-800">
                    Landmarks/Directions
                  </Label>
                  <Input
                    id="locationLandmarks"
                    value={bookingState.address.locationLandmarks || ""}
                    onChange={(e) => {
                      updateBookingState({
                        address: {
                          ...bookingState.address!,
                          locationLandmarks: e.target.value,
                        },
                      });
                    }}
                    placeholder="e.g., Next to the blue mailbox, red door"
                    className="mt-1 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Save Address Dialog */}
          <Dialog open={showSaveAddressDialog} onOpenChange={setShowSaveAddressDialog}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Save This Address?</DialogTitle>
                <DialogDescription>
                  Save this address for faster checkout next time
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="address-label" className="text-sm font-medium text-gray-700 mb-2 block">
                    Label (e.g., Home, Work)
                  </Label>
                  <Select value={saveAddressLabel} onValueChange={setSaveAddressLabel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Home">Home</SelectItem>
                      <SelectItem value="Work">Work</SelectItem>
                      <SelectItem value="Office">Office</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {saveAddressLabel === "Other" && (
                  <div>
                    <Label htmlFor="custom-label" className="text-sm font-medium text-gray-700 mb-2 block">
                      Custom Label
                    </Label>
                    <Input
                      id="custom-label"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder="Enter label (e.g., Mom's House, Gym)"
                    />
                  </div>
                )}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    {addressToSave?.fullAddress}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSaveAddressDialog(false);
                    setAddressToSave(null);
                    setSaveAddressLabel("Home");
                    setCustomLabel("");
                  }}
                >
                  Skip
                </Button>
                <Button
                  onClick={handleSaveAddress}
                  className="bg-[#FF0077] hover:bg-[#E6006A] text-white"
                >
                  Save Address
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>
      )}
    </div>
  );
}
