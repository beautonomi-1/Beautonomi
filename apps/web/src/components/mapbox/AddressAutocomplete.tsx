"use client";

import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";

interface AddressSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  context?: Array<{
    id: string;
    text: string;
    short_code?: string;
  }>;
}

interface AddressAutocompleteProps {
  value?: string;
  onChange?: (address: {
    address_line1: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
    place_name?: string;
  }) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  country?: string;
  proximity?: { latitude: number; longitude: number };
  required?: boolean;
  className?: string;
  disabled?: boolean;
}

export default function AddressAutocomplete({
  value = "",
  onChange,
  onInputChange,
  placeholder = "Search for an address...",
  label,
  country,
  proximity,
  required = false,
  className = "",
  disabled = false,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    // Close suggestions when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchAddresses = async (searchQuery: string) => {
    // Reduced minimum to 2 characters for faster autocomplete
    if (searchQuery.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      setIsLoading(true);
      const payload: any = {
        query: searchQuery,
        limit: 5,
      };

      // Use country code for Mapbox (e.g., "ZA" for South Africa)
      // Mapbox expects ISO 3166-1 alpha-2 country codes
      if (country) {
        // If it's already a 2-letter code, use it directly
        // Otherwise, Mapbox will try to match by name
        payload.country = country.length === 2 ? country.toUpperCase() : country;
      }

      if (proximity) {
        payload.proximity = {
          longitude: proximity.longitude,
          latitude: proximity.latitude,
        };
      }

      const response = await fetcher.post<{ data: AddressSuggestion[] }>(
        "/api/mapbox/geocode",
        payload
      );

      // Handle response - data might be empty array if Mapbox isn't configured
      const results = response.data || [];
      setSuggestions(results);
      
      // Only show suggestions if we have results
      if (results.length > 0) {
        setShowSuggestions(true);
        setSelectedIndex(-1);
      } else {
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error("Error searching addresses:", error);
      // Silently fail - user can still manually enter address
      // Don't show error to user, just don't show suggestions
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    onInputChange?.(newQuery);

    // Clear suggestions if query is too short
    if (newQuery.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Debounce search - reduced delay for faster response
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      searchAddresses(newQuery);
    }, 250); // Reduced from 300ms to 250ms for faster autocomplete
  };

  // Handle manual address entry when user finishes typing (on blur)
  // This allows the form to work even if Mapbox autocomplete isn't available
  const handleBlur = () => {
    // Only update if user typed something and didn't select a suggestion
    // This ensures manual entry works even without Mapbox
    if (onChange && query.trim().length > 0) {
      // Check if this is a manual entry (no suggestions shown or query doesn't match)
      const isManualEntry = !showSuggestions || 
        suggestions.length === 0 ||
        !suggestions.some(s => s.place_name === query);
      
      if (isManualEntry) {
        // User typed manually - update address_line1
        // Note: We set city to empty string, but the form will preserve manually entered values
        // because the parent component's handleAddressSelect merges with existing data
        onChange({
          address_line1: query.trim(),
          city: '', // User will fill this manually in the city field
          state: undefined,
          postal_code: undefined,
          country: country || '',
          latitude: 0, // Optional - can be geocoded later if Mapbox is configured
          longitude: 0,
        });
      }
    }
    // If required and empty, the HTML5 validation will handle it via the required attribute
    setShowSuggestions(false);
  };

  const parseAddress = (suggestion: AddressSuggestion) => {
    const context = suggestion.context || [];
    const addressParts: any = {
      address_line1: "",
      city: "",
      state: "",
      postal_code: "",
      country: "",
      latitude: suggestion.center[1],
      longitude: suggestion.center[0],
      place_name: suggestion.place_name,
    };

    // Parse context to extract address components
    // Mapbox context array is ordered from most specific to least specific
    for (const item of context) {
      if (item.id.startsWith("place.")) {
        // City/town
        if (!addressParts.city) {
          addressParts.city = item.text;
        }
      } else if (item.id.startsWith("district.")) {
        // District (sometimes used for city)
        if (!addressParts.city) {
          addressParts.city = item.text;
        }
      } else if (item.id.startsWith("region.")) {
        // State/Province
        addressParts.state = item.text;
      } else if (item.id.startsWith("postcode.")) {
        // Postal code
        addressParts.postal_code = item.text;
      } else if (item.id.startsWith("country.")) {
        // Country
        addressParts.country = item.text;
      }
    }

    // Extract street address from place_name
    // Format is usually: "Street Address, City, State, Postal Code, Country"
    const placeParts = suggestion.place_name.split(",").map(p => p.trim());
    
    if (placeParts.length > 0) {
      // First part is usually the street address
      addressParts.address_line1 = placeParts[0];
      
      // If we don't have city from context, try to get it from place_name
      if (!addressParts.city && placeParts.length > 1) {
        addressParts.city = placeParts[1];
      }
      
      // If we don't have state from context, try to get it from place_name
      if (!addressParts.state && placeParts.length > 2) {
        addressParts.state = placeParts[2];
      }
      
      // If we don't have postal code from context, try to get it from place_name
      if (!addressParts.postal_code && placeParts.length > 3) {
        // Check if it looks like a postal code (numbers or alphanumeric)
        const possiblePostal = placeParts[3];
        if (/^[0-9A-Z\s-]+$/.test(possiblePostal) && possiblePostal.length <= 10) {
          addressParts.postal_code = possiblePostal;
        }
      }
    }

    // Fallback: if country wasn't found, use the provided country prop
    if (!addressParts.country && country) {
      addressParts.country = country;
    }

    return addressParts;
  };

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    const address = parseAddress(suggestion);
    // Use the full place_name for display, but the parsed address_line1 for the actual address
    setQuery(suggestion.place_name);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedIndex(-1);

    if (onChange) {
      onChange(address);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Select the highlighted suggestion, or the first one if none is highlighted
      const indexToSelect = selectedIndex >= 0 ? selectedIndex : 0;
      if (suggestions[indexToSelect]) {
        handleSelectSuggestion(suggestions[indexToSelect]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <Label htmlFor="address-autocomplete" className="mb-2 block">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          id="address-autocomplete"
          type="text"
          value={query}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={placeholder}
          className="pl-10"
          required={required}
          disabled={disabled}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 animate-spin" />
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full text-left px-4 py-3 hover:bg-[#FF0077]/5 transition-colors border-b border-gray-100 last:border-b-0 ${
                index === selectedIndex ? "bg-[#FF0077]/10" : "bg-white"
              } ${index === 0 ? "rounded-t-lg" : ""} ${
                index === suggestions.length - 1 ? "rounded-b-lg" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                  index === selectedIndex ? "text-[#FF0077]" : "text-gray-400"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${
                    index === selectedIndex ? "text-[#FF0077]" : "text-gray-900"
                  }`}>
                    {suggestion.place_name}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
