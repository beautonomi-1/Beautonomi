"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface Country {
  code: string;
  name: string;
  phone_country_code: string;
}

interface PhoneDisplayProps {
  phone?: string | null;
  showIcon?: boolean;
  className?: string;
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
function parsePhoneNumber(
  phone: string,
  countries: Country[] = []
): { countryCode: string; number: string; countryFlag?: string } {
  if (!phone) return { countryCode: "", number: "" };
  
  // Check if phone starts with a country code (starts with +)
  const match = phone.match(/^(\+\d{1,4})\s*(.+)$/);
  if (match) {
    const countryCode = match[1];
    const number = match[2];
    
    // Find country by phone code from API data
    const country = countries.find((c) => c.phone_country_code === countryCode);
    const countryCode2 = country?.code || "";
    const flag = countryCode2 ? getCountryFlag(countryCode2) : "🌍";
    
    return { countryCode, number, countryFlag: flag };
  }
  
  // No country code found, return as-is
  return { countryCode: "", number: phone };
}

export function PhoneDisplay({ phone, showIcon = true, className }: PhoneDisplayProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch countries for phone code mapping
  useEffect(() => {
    async function fetchCountries() {
      try {
        const response = await fetch("/api/public/countries");
        const result = await response.json();
        if (result.data && Array.isArray(result.data)) {
          const countriesWithPhones = result.data.filter(
            (c: Country) => c.phone_country_code
          );
          setCountries(countriesWithPhones);
        }
      } catch (error) {
        console.error("Failed to fetch countries:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCountries();
  }, []);

  const parsed = useMemo(() => {
    return phone ? parsePhoneNumber(phone, countries) : null;
  }, [phone, countries]);

  if (!phone) {
    return (
      <div className={cn("flex items-center gap-2 text-gray-400", className)}>
        {showIcon && <Phone className="w-3 h-3" />}
        <span className="text-sm">Not provided</span>
      </div>
    );
  }

  if (loading || !parsed) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {showIcon && <Phone className="w-3 h-3 text-gray-400" />}
        <span className="text-sm">{phone}</span>
      </div>
    );
  }
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showIcon && <Phone className="w-3 h-3 text-gray-400" />}
      {parsed.countryFlag && (
        <span className="text-base" title={parsed.countryCode}>
          {parsed.countryFlag}
        </span>
      )}
      <span className="text-sm">
        {parsed.countryCode && (
          <span className="font-medium text-gray-600">{parsed.countryCode}</span>
        )}
        {parsed.countryCode && parsed.number && <span className="mx-1"> </span>}
        {parsed.number || phone}
      </span>
    </div>
  );
}
