"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, MapPin, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { useServiceAvailability } from "@/hooks/useServiceAvailability";
import { useRecentLocations } from "@/hooks/useRecentLocations";

interface EnhancedAddressDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddressSelect: (address: {
    address_line1: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
    place_name?: string;
  }) => void;
}

export default function EnhancedAddressDialog({
  isOpen,
  onClose,
  onAddressSelect,
}: EnhancedAddressDialogProps) {
  const [selectedAddress, setSelectedAddress] = useState<{
    address_line1: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
    place_name?: string;
  } | null>(null);
  const [mapUrl, setMapUrl] = useState<string>("");
  const { availability, checkAvailability } = useServiceAvailability();
  const { addLocation } = useRecentLocations();

  useEffect(() => {
    queueMicrotask(() => {
      if (selectedAddress) {
        const lat = selectedAddress.latitude;
        const lng = selectedAddress.longitude;
        setMapUrl(
          `https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}&q=${lat},${lng}&zoom=15`
        );
        checkAvailability(lat, lng);
      } else {
        setMapUrl("");
      }
    });
  }, [selectedAddress, checkAvailability]);

  const handleAddressSelect = (address: {
    address_line1: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
    place_name?: string;
  }) => {
    setSelectedAddress(address);
  };

  const handleConfirm = () => {
    if (selectedAddress) {
      // Add to recent locations
      const addressString = selectedAddress.place_name || `${selectedAddress.address_line1}, ${selectedAddress.city}, ${selectedAddress.country}`;
      addLocation({
        address: addressString,
        latitude: selectedAddress.latitude,
        longitude: selectedAddress.longitude,
        city: selectedAddress.city,
        country: selectedAddress.country,
      });

      onAddressSelect(selectedAddress);
      setSelectedAddress(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95%] sm:max-w-[600px] p-6 rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left text-xl font-bold text-gray-900 flex items-center justify-between">
            Select Address
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Address Autocomplete */}
          <div>
            <AddressAutocomplete
              onChange={handleAddressSelect}
              placeholder="Search for an address..."
              className="w-full"
            />
          </div>

          {/* Map Preview */}
          {selectedAddress && mapUrl && (
            <div className="border rounded-lg overflow-hidden">
              <div className="aspect-video w-full">
                {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? (
                  <iframe
                    src={mapUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm">Map preview unavailable</p>
                      <p className="text-xs mt-1">{selectedAddress.place_name || `${selectedAddress.address_line1}, ${selectedAddress.city}`}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Service Availability Indicator */}
          {selectedAddress && (
            <div className="px-4 py-3 rounded-lg border">
              {availability.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Checking service availability...</span>
                </div>
              ) : availability.in_zone ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Services are available in this area</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>Limited service availability in this area</span>
                </div>
              )}
            </div>
          )}

          {/* Address Details */}
          {selectedAddress && (
            <div className="px-4 py-3 rounded-lg border bg-gray-50">
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900">
                  {selectedAddress.place_name || selectedAddress.address_line1}
                </p>
                {selectedAddress.city && (
                  <p className="text-xs text-gray-600">
                    {selectedAddress.city}
                    {selectedAddress.state && `, ${selectedAddress.state}`}
                    {selectedAddress.postal_code && ` ${selectedAddress.postal_code}`}
                  </p>
                )}
                {selectedAddress.country && (
                  <p className="text-xs text-gray-500">{selectedAddress.country}</p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedAddress}
              className="bg-[#FF007F] hover:bg-[#E6006F] text-white"
            >
              Confirm Location
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
