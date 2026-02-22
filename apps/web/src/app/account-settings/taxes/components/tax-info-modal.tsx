"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
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
import { motion } from "framer-motion";
import { fetcher } from "@/lib/http/fetcher";

interface TaxInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  initialData?: any;
}

export default function TaxInfoModal({ isOpen, onClose, onSave, initialData }: TaxInfoModalProps) {
  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>([]);
  const [formData, setFormData] = useState({
    country: "",
    tax_id: "",
    full_name: "",
    address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "",
    },
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Load countries
      fetcher.get<{ data: Array<{ code: string; name: string }> }>("/api/public/countries")
        .then((response) => {
          setCountries(response.data || []);
        })
        .catch(() => {
          // Fallback countries
          setCountries([
            { code: "US", name: "United States" },
            { code: "ZA", name: "South Africa" },
            { code: "GB", name: "United Kingdom" },
            { code: "CA", name: "Canada" },
          ]);
        });

      // Pre-fill form if editing
      if (initialData) {
        setFormData({
          country: initialData.country || "",
          tax_id: initialData.tax_id || "",
          full_name: initialData.full_name || "",
          address: {
            line1: initialData.address?.line1 || "",
            line2: initialData.address?.line2 || "",
            city: initialData.address?.city || "",
            state: initialData.address?.state || "",
            postal_code: initialData.address?.postal_code || "",
            country: initialData.address?.country || initialData.country || "",
          },
        });
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSave(formData);
    } catch {
      // Error already handled in parent
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-gray-900">Add tax info</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <Label htmlFor="country" className="text-sm font-medium text-gray-700 mb-2 block">
              Country/Region *
            </Label>
            <Select
              value={formData.country}
              onValueChange={(value) => {
                setFormData({
                  ...formData,
                  country: value,
                  address: { ...formData.address, country: value },
                });
              }}
            >
              <SelectTrigger id="country" className="w-full">
                <SelectValue placeholder="Select a country" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((country) => (
                  <SelectItem key={country.code} value={country.name}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="tax_id" className="text-sm font-medium text-gray-700 mb-2 block">
              Tax ID / SSN / TIN *
            </Label>
            <Input
              id="tax_id"
              value={formData.tax_id}
              onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
              placeholder="Enter your tax identification number"
              required
            />
          </div>

          <div>
            <Label htmlFor="full_name" className="text-sm font-medium text-gray-700 mb-2 block">
              Full Name (as on tax documents) *
            </Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="Enter your full legal name"
              required
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Address (optional)</h3>

            <div>
              <Label htmlFor="address_line1" className="text-sm font-medium text-gray-700 mb-2 block">
                Address Line 1
              </Label>
              <Input
                id="address_line1"
                value={formData.address.line1}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address, line1: e.target.value },
                  })
                }
                placeholder="Street address"
              />
            </div>

            <div>
              <Label htmlFor="address_line2" className="text-sm font-medium text-gray-700 mb-2 block">
                Address Line 2
              </Label>
              <Input
                id="address_line2"
                value={formData.address.line2}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address, line2: e.target.value },
                  })
                }
                placeholder="Apartment, suite, etc."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city" className="text-sm font-medium text-gray-700 mb-2 block">
                  City
                </Label>
                <Input
                  id="city"
                  value={formData.address.city}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: { ...formData.address, city: e.target.value },
                    })
                  }
                  placeholder="City"
                />
              </div>

              <div>
                <Label htmlFor="state" className="text-sm font-medium text-gray-700 mb-2 block">
                  State/Province
                </Label>
                <Input
                  id="state"
                  value={formData.address.state}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: { ...formData.address, state: e.target.value },
                    })
                  }
                  placeholder="State"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="postal_code" className="text-sm font-medium text-gray-700 mb-2 block">
                Postal Code
              </Label>
              <Input
                id="postal_code"
                value={formData.address.postal_code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address, postal_code: e.target.value },
                  })
                }
                placeholder="Postal code"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.country || !formData.tax_id || !formData.full_name}
              className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white"
            >
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
