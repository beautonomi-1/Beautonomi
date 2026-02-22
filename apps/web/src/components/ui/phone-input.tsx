"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Phone } from "lucide-react";

interface Country {
  code: string;
  name: string;
  phone_country_code: string;
}

interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onCountryCodeChange?: (countryCode: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  defaultCountryCode?: string;
  onValidationChange?: (isValid: boolean, error?: string) => void;
}

// Helper function to get country flag emoji from ISO code
function getCountryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍";
  
  // Convert ISO code to flag emoji
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Helper function to parse phone number and extract country code
function parsePhoneNumber(phone: string): { countryCode: string; number: string } {
  if (!phone) return { countryCode: "+27", number: "" };
  
  // Check if phone starts with a country code (starts with +)
  const match = phone.match(/^(\+\d{1,4})\s*(.+)$/);
  if (match) {
    return { countryCode: match[1], number: match[2] };
  }
  
  // Default to South Africa if no country code
  return { countryCode: "+27", number: phone };
}

export function PhoneInput({
  value = "",
  onChange,
  onCountryCodeChange,
  label = "Phone Number",
  required = false,
  placeholder = "123 456 7890",
  className,
  disabled = false,
  defaultCountryCode = "+27",
  onValidationChange,
}: PhoneInputProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCountryCode, setSelectedCountryCode] = useState(defaultCountryCode);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [validationError, setValidationError] = useState<string>("");
  const lastEmittedValueRef = useRef<string>(value);
  const isInitialMount = useRef(true);

  // Parse initial value - only update if value changed externally (not from our own onChange)
  useEffect(() => {
    // On initial mount, always parse the value
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (value) {
        const parsed = parsePhoneNumber(value);
        setSelectedCountryCode(parsed.countryCode);
        setPhoneNumber(parsed.number);
      } else {
        setSelectedCountryCode(defaultCountryCode);
        setPhoneNumber("");
      }
      lastEmittedValueRef.current = value;
      return;
    }

    // Skip if this value matches what we just emitted (we're the source of the change)
    if (value === lastEmittedValueRef.current) {
      return;
    }

    // Value changed from external source - update internal state
    if (value) {
      const parsed = parsePhoneNumber(value);
      setSelectedCountryCode(parsed.countryCode);
      setPhoneNumber(parsed.number);
    } else {
      setSelectedCountryCode(defaultCountryCode);
      setPhoneNumber("");
    }
    lastEmittedValueRef.current = value;
  }, [value, defaultCountryCode]);

  // Fetch countries
  useEffect(() => {
    async function fetchCountries() {
      try {
        setLoading(true);
        const response = await fetch("/api/public/countries");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.data && Array.isArray(result.data)) {
          // Filter to only countries with phone codes
          const countriesWithPhones = result.data.filter(
            (c: Country) => c.phone_country_code && c.phone_country_code.trim() !== ""
          );
          setCountries(countriesWithPhones);
        } else {
          // If no data, use fallback
          throw new Error("No countries data returned");
        }
      } catch (error) {
        console.error("Failed to fetch countries:", error);
        // Fallback to common countries
        const fallbackCountries = [
          { code: "ZA", name: "South Africa", phone_country_code: "+27" },
          { code: "US", name: "United States", phone_country_code: "+1" },
          { code: "GB", name: "United Kingdom", phone_country_code: "+44" },
          { code: "KE", name: "Kenya", phone_country_code: "+254" },
          { code: "NG", name: "Nigeria", phone_country_code: "+234" },
          { code: "GH", name: "Ghana", phone_country_code: "+233" },
        ];
        setCountries(fallbackCountries);
      } finally {
        setLoading(false);
      }
    }

    fetchCountries();
  }, []);

  // Find country by phone code
  const selectedCountry = useMemo(() => {
    return countries.find((c) => c.phone_country_code === selectedCountryCode);
  }, [countries, selectedCountryCode]);

  const handleCountryCodeChange = (newCountryCode: string) => {
    setSelectedCountryCode(newCountryCode);
    onCountryCodeChange?.(newCountryCode);
    
    // Update full phone number
    const fullPhone = phoneNumber ? `${newCountryCode} ${phoneNumber}` : "";
    lastEmittedValueRef.current = fullPhone;
    onChange?.(fullPhone);
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNumber = e.target.value;
    setPhoneNumber(newNumber);
    
    // Validate phone number length
    let error = '';
    let isValid = true;
    
    if (newNumber.trim()) {
      const cleanPhone = newNumber.replace(/[\s\-\(\)]/g, '');
      const digits = cleanPhone.replace(/\D/g, '');
      
      // South African numbers should be 9 digits (without leading 0) or 10 digits (with leading 0)
      if (selectedCountryCode === '+27') {
        if (cleanPhone.startsWith('0')) {
          if (digits.length !== 10) {
            error = `${digits.length} digits - need 10 (e.g., 0823456789)`;
            isValid = false;
          }
        } else {
          if (digits.length !== 9) {
            error = `${digits.length} digits - need 9 (e.g., 823456789)`;
            isValid = false;
          }
        }
      } else {
        // For other countries, require 7-15 digits
        if (digits.length < 7 || digits.length > 15) {
          error = `${digits.length} digits - need 7-15`;
          isValid = false;
        }
      }
    }
    
    setValidationError(error);
    onValidationChange?.(isValid, error);
    
    // Combine country code and number
    const fullPhone = newNumber ? `${selectedCountryCode} ${newNumber}` : "";
    lastEmittedValueRef.current = fullPhone;
    onChange?.(fullPhone);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label htmlFor="phone-input" className="text-sm sm:text-base font-semibold text-gray-900">
          {label} {required && <span className="text-[#FF0077]">*</span>}
        </Label>
      )}
      
      <div className="flex gap-2">
        {/* Country Code Selector */}
        <Select
          value={selectedCountryCode}
          onValueChange={handleCountryCodeChange}
          disabled={disabled || loading}
        >
          <SelectTrigger className="w-[140px] sm:w-[160px] min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg">
            <SelectValue placeholder={loading ? "Loading..." : "Select country"} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px] z-[10000]" sideOffset={4}>
            {loading ? (
              <div className="p-2 text-sm text-gray-500 text-center">Loading countries...</div>
            ) : countries.length === 0 ? (
              <div className="p-2 text-sm text-gray-500 text-center">No countries available</div>
            ) : (
              countries.map((country) => (
                <SelectItem
                  key={country.code}
                  value={country.phone_country_code}
                  className="cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-lg flex-shrink-0">{getCountryFlag(country.code)}</span>
                    <span className="font-medium flex-shrink-0">{country.phone_country_code}</span>
                    <span className="text-gray-600 truncate">{country.name}</span>
                  </span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {/* Phone Number Input */}
        <Input
          id="phone-input"
          type="tel"
          value={phoneNumber}
          onChange={handlePhoneNumberChange}
          placeholder={selectedCountryCode === '+27' ? '0823456789 or 823456789' : placeholder}
          required={required}
          disabled={disabled}
          className={cn(
            "flex-1 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg",
            validationError && "border-red-500 focus:border-red-500 focus:ring-red-500"
          )}
        />
      </div>
      
      {validationError && (
        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
          <span>⚠️</span>
          <span>{validationError}</span>
        </p>
      )}
      
      {!validationError && phoneNumber && (
        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
          <span>✓</span>
          <span>Valid format</span>
        </p>
      )}
      
      {selectedCountry && !phoneNumber && (
        <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
          <Phone className="w-3 h-3" />
          <span>
            {selectedCountry.name} ({selectedCountry.phone_country_code})
          </span>
        </p>
      )}
    </div>
  );
}
