"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import MapboxMapPreview, { MapboxMapPreviewUnavailable } from "@/components/mapbox/MapboxMapPreview";
import { useServiceAvailability } from "@/hooks/useServiceAvailability";
import { useRecentLocations } from "@/hooks/useRecentLocations";
import { fetchMapboxPublicMapConfig } from "@/lib/mapbox/fetch-public-map-config";

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
  const [mapboxConfig, setMapboxConfig] = useState<{
    token: string;
    styleUrl?: string | null;
  } | null>(null);
  const { availability, checkAvailability } = useServiceAvailability();
  const { addLocation } = useRecentLocations();

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchMapboxPublicMapConfig();
        if (cancelled || !cfg.accessToken) return;
        setMapboxConfig({ token: cfg.accessToken, styleUrl: cfg.styleUrl });
      } catch {
        if (!cancelled) setMapboxConfig(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    queueMicrotask(() => {
      if (selectedAddress) {
        checkAvailability(selectedAddress.latitude, selectedAddress.longitude);
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

          {/* Map Preview (Mapbox) */}
          {selectedAddress && (
            <div className="border rounded-lg overflow-hidden">
              <div className="aspect-video w-full">
                {mapboxConfig?.token ? (
                  <MapboxMapPreview
                    latitude={selectedAddress.latitude}
                    longitude={selectedAddress.longitude}
                    accessToken={mapboxConfig.token}
                    styleUrl={mapboxConfig.styleUrl}
                    className="w-full h-full"
                  />
                ) : (
                  <MapboxMapPreviewUnavailable
                    placeName={selectedAddress.place_name}
                    addressLine1={selectedAddress.address_line1}
                    city={selectedAddress.city}
                    className="w-full h-full"
                  />
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
