"use client";

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { mapGeocodeFeatureToAddressParts } from "@beautonomi/utils";
import { cn } from "@/lib/utils";

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
    /** Full Mapbox label; prefer for the search field display when set. */
    place_name?: string;
  }) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  /** ISO 3166-1 alpha-2 (e.g. ZA). Only this form is sent to Mapbox—full country names are ignored for the API. */
  country?: string;
  /** When Mapbox omits country or user types manually without selecting, use this display name (e.g. "South Africa"). */
  defaultCountryName?: string;
  proximity?: { latitude: number; longitude: number };
  /** Forward geocode `types` filter (Mapbox). Example: ["address", "place"]. Omit for default Mapbox mix. */
  geocodeTypes?: string[];
  required?: boolean;
  className?: string;
  inputClassName?: string;
  inputId?: string;
  disabled?: boolean;
}

export default function AddressAutocomplete({
  value = "",
  onChange,
  onInputChange,
  placeholder = "Search for an address...",
  label,
  country,
  defaultCountryName,
  proximity,
  geocodeTypes,
  required = false,
  className = "",
  inputClassName,
  inputId = "address-autocomplete",
  disabled = false,
}: AddressAutocompleteProps) {
  const countryIso =
    country && /^[a-zA-Z]{2}$/.test(country.trim()) ? country.trim().toUpperCase() : undefined;
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const didSelectRef = useRef(false);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const updateDropdownPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDropdownRect({
      top: r.bottom + 4,
      left: r.left,
      width: r.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!showSuggestions || suggestions.length === 0) {
      setDropdownRect(null);
      return;
    }
    updateDropdownPosition();
    window.addEventListener("scroll", updateDropdownPosition, true);
    window.addEventListener("resize", updateDropdownPosition);
    return () => {
      window.removeEventListener("scroll", updateDropdownPosition, true);
      window.removeEventListener("resize", updateDropdownPosition);
    };
  }, [showSuggestions, suggestions.length, updateDropdownPosition, query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (suggestionsRef.current?.contains(t)) return;
      setShowSuggestions(false);
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
      const payload: {
        query: string;
        limit: number;
        country?: string;
        proximity?: { longitude: number; latitude: number };
        types?: string[];
      } = {
        query: searchQuery,
        limit: 8,
      };
      if (countryIso) {
        payload.country = countryIso;
      }
      if (proximity) {
        payload.proximity = {
          longitude: proximity.longitude,
          latitude: proximity.latitude,
        };
      }
      if (geocodeTypes?.length) {
        payload.types = geocodeTypes;
      }

      const response = await fetcher.post<{ data: AddressSuggestion[] | null }>(
        "/api/mapbox/geocode",
        payload
      );

      const raw = response?.data;
      const results = Array.isArray(raw) ? raw : [];
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
    // If user just selected a suggestion, don't overwrite with partial manual entry
    if (didSelectRef.current) {
      didSelectRef.current = false;
      setShowSuggestions(false);
      return;
    }
    // Only update if user typed something and didn't select a suggestion
    if (onChange && query.trim().length > 0) {
      const isManualEntry = !showSuggestions || 
        suggestions.length === 0 ||
        !suggestions.some(s => s.place_name === query);
      
      if (isManualEntry) {
        onChange({
          address_line1: query.trim(),
          city: "",
          state: undefined,
          postal_code: undefined,
          country: defaultCountryName || "",
          latitude: 0,
          longitude: 0,
        });
      }
    }
    setShowSuggestions(false);
  };

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    didSelectRef.current = true;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const address = mapGeocodeFeatureToAddressParts(suggestion, {
      defaultCountryName,
    });
    setQuery(suggestion.place_name);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedIndex(-1);

    if (onChange) {
      onChange({
        ...address,
        state: address.state || undefined,
        postal_code: address.postal_code || undefined,
      });
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
        <Label htmlFor={inputId} className="mb-2 block">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          ref={inputRef}
          id={inputId}
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
          className={cn("pl-10", inputClassName)}
          required={required}
          disabled={disabled}
          autoComplete="street-address"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 animate-spin" />
        )}
      </div>

      {typeof document !== "undefined" &&
        showSuggestions &&
        suggestions.length > 0 &&
        dropdownRect &&
        createPortal(
          <div
            ref={suggestionsRef}
            data-address-autocomplete-listbox="true"
            role="listbox"
            className="bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
            style={{
              position: "fixed",
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              zIndex: 200000,
            }}
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                data-address-autocomplete-option="true"
                role="option"
                aria-selected={index === selectedIndex}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectSuggestion(suggestion);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full text-left px-4 py-3 hover:bg-[#FF0077]/5 transition-colors border-b border-gray-100 last:border-b-0 ${
                  index === selectedIndex ? "bg-[#FF0077]/10" : "bg-white"
                } ${index === 0 ? "rounded-t-lg" : ""} ${
                  index === suggestions.length - 1 ? "rounded-b-lg" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <MapPin
                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      index === selectedIndex ? "text-[#FF0077]" : "text-gray-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        index === selectedIndex ? "text-[#FF0077]" : "text-gray-900"
                      }`}
                    >
                      {suggestion.place_name}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
