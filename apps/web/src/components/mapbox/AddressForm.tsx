"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import AddressAutocomplete from "./AddressAutocomplete";

interface AddressFormProps {
  initialAddress?: {
    label?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    apartment_unit?: string;
    building_name?: string;
    floor_number?: string;
    access_codes?: { gate?: string; buzzer?: string; door?: string } | string;
    parking_instructions?: string;
    location_landmarks?: string;
  };
  onSave: (address: any) => void | Promise<void>;
  onCancel?: () => void;
  showLabel?: boolean;
  country?: string;
  proximity?: { latitude: number; longitude: number };
  asForm?: boolean; // If false, renders as div instead of form (to avoid nested forms)
  showHouseCallFields?: boolean; // Show house call specific fields
}

export default function AddressForm({
  initialAddress,
  onSave,
  onCancel,
  showLabel = true,
  country,
  proximity,
  asForm = true,
  showHouseCallFields = true, // Default to true for saved addresses
}: AddressFormProps) {
  // Parse access_codes if it's a string (from database JSONB)
  const parseAccessCodes = (codes: any): { gate?: string; buzzer?: string; door?: string } => {
    if (!codes) return {};
    if (typeof codes === 'string') {
      try {
        return JSON.parse(codes);
      } catch {
        return {};
      }
    }
    return codes;
  };

  const [formData, setFormData] = useState({
    label: initialAddress?.label || "",
    address_line1: initialAddress?.address_line1 || "",
    address_line2: initialAddress?.address_line2 || "",
    city: initialAddress?.city || "",
    state: initialAddress?.state || "",
    postal_code: initialAddress?.postal_code || "",
    country: initialAddress?.country || country || "",
    latitude: initialAddress?.latitude || undefined,
    longitude: initialAddress?.longitude || undefined,
    apartment_unit: initialAddress?.apartment_unit || "",
    building_name: initialAddress?.building_name || "",
    floor_number: initialAddress?.floor_number || "",
    access_codes: parseAccessCodes(initialAddress?.access_codes),
    parking_instructions: initialAddress?.parking_instructions || "",
    location_landmarks: initialAddress?.location_landmarks || "",
  });
  const [isSaving, setIsSaving] = useState(false);

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
    setFormData({
      ...formData,
      address_line1: address.address_line1,
      city: address.city,
      state: address.state || "",
      postal_code: address.postal_code || "",
      country: address.country,
      latitude: address.latitude,
      longitude: address.longitude,
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setIsSaving(true);
      await onSave(formData);
    } catch (error) {
      console.error("Error saving address:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const FormWrapper = asForm ? 'form' : 'div';
  const formProps = asForm ? { onSubmit: handleSubmit } : {};

  return (
    <FormWrapper {...formProps} className="space-y-4">
      {showLabel && (
        <div>
          <Label htmlFor="label">Label (e.g., Home, Work)</Label>
          <Input
            id="label"
            value={formData.label}
            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
            placeholder="Home"
          />
        </div>
      )}

      <div>
        <Label htmlFor="address">Address *</Label>
        <AddressAutocomplete
          value={formData.address_line1}
          onChange={handleAddressSelect}
          placeholder="Start typing an address..."
          country={formData.country || country}
          proximity={proximity}
          required
        />
      </div>

      <div>
        <Label htmlFor="address_line2">Apartment, suite, etc. (optional)</Label>
        <Input
          id="address_line2"
          value={formData.address_line2}
          onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
          placeholder="Apt 4B"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            required
          />
        </div>

        <div>
          <Label htmlFor="state">State/Province</Label>
          <Input
            id="state"
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="postal_code">Postal Code</Label>
          <Input
            id="postal_code"
            value={formData.postal_code}
            onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="country">Country *</Label>
          <Input
            id="country"
            value={formData.country}
            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            required
          />
        </div>
      </div>

      {/* House Call Specific Fields */}
      {showHouseCallFields && (
        <div className="space-y-4 pt-4 border-t">
          <p className="text-sm font-medium text-gray-700">Additional Location Details (Optional)</p>
          <p className="text-xs text-gray-500 mb-3">
            Help service providers find you easily by providing these details
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="apartment_unit">Apartment/Unit Number</Label>
              <Input
                id="apartment_unit"
                value={formData.apartment_unit}
                onChange={(e) => setFormData({ ...formData, apartment_unit: e.target.value })}
                placeholder="e.g., Apt 5B, Unit 12"
              />
            </div>

            <div>
              <Label htmlFor="building_name">Building/Complex Name</Label>
              <Input
                id="building_name"
                value={formData.building_name}
                onChange={(e) => setFormData({ ...formData, building_name: e.target.value })}
                placeholder="e.g., Sunset Towers"
              />
            </div>

            <div>
              <Label htmlFor="floor_number">Floor Number</Label>
              <Input
                id="floor_number"
                value={formData.floor_number}
                onChange={(e) => setFormData({ ...formData, floor_number: e.target.value })}
                placeholder="e.g., 3rd Floor"
              />
            </div>

            <div>
              <Label htmlFor="parking_instructions">Parking Instructions</Label>
              <Input
                id="parking_instructions"
                value={formData.parking_instructions}
                onChange={(e) => setFormData({ ...formData, parking_instructions: e.target.value })}
                placeholder="e.g., Free street parking, Visitor parking lot"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="access_codes" className="mb-2 block">Access Codes (Optional)</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Input
                  id="gate_code"
                  value={formData.access_codes?.gate || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    access_codes: { ...formData.access_codes, gate: e.target.value },
                  })}
                  placeholder="Gate code"
                />
                <Label htmlFor="gate_code" className="text-xs text-gray-500 mt-0.5 block">Gate</Label>
              </div>
              <div>
                <Input
                  id="buzzer_code"
                  value={formData.access_codes?.buzzer || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    access_codes: { ...formData.access_codes, buzzer: e.target.value },
                  })}
                  placeholder="Buzzer code"
                />
                <Label htmlFor="buzzer_code" className="text-xs text-gray-500 mt-0.5 block">Buzzer</Label>
              </div>
              <div>
                <Input
                  id="door_code"
                  value={formData.access_codes?.door || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    access_codes: { ...formData.access_codes, door: e.target.value },
                  })}
                  placeholder="Door code"
                />
                <Label htmlFor="door_code" className="text-xs text-gray-500 mt-0.5 block">Door</Label>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="location_landmarks">Landmarks/Directions</Label>
            <Input
              id="location_landmarks"
              value={formData.location_landmarks}
              onChange={(e) => setFormData({ ...formData, location_landmarks: e.target.value })}
              placeholder="e.g., Next to the blue mailbox, red door"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button 
          type={asForm ? "submit" : "button"} 
          onClick={asForm ? undefined : handleSubmit}
          disabled={isSaving || !formData.address_line1 || !formData.city || !formData.country}
        >
          {isSaving ? "Saving..." : "Save Address"}
        </Button>
      </div>
    </FormWrapper>
  );
}
