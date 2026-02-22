"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, User, Calendar, Package, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";

export interface ProviderSearchSuggestion {
  type: "client" | "appointment" | "service";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

interface ProviderGlobalSearchProps {
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  onFocusChange?: (focused: boolean) => void;
}

export function ProviderGlobalSearch({
  placeholder = "Search clients, appointments, services...",
  className,
  inputClassName,
  inputStyle,
  onFocusChange,
}: ProviderGlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProviderSearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Update dropdown position for portal (avoids overflow clipping from sticky/overflow parents)
  const updateDropdownPosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      });
    }
  };

  useLayoutEffect(() => {
    if (isOpen && suggestions.length > 0 && containerRef.current) {
      updateDropdownPosition();
      const resizeObserver = new ResizeObserver(updateDropdownPosition);
      resizeObserver.observe(containerRef.current);
      window.addEventListener("scroll", updateDropdownPosition, true);
      window.addEventListener("resize", updateDropdownPosition);
      return () => {
        resizeObserver.disconnect();
        window.removeEventListener("scroll", updateDropdownPosition, true);
        window.removeEventListener("resize", updateDropdownPosition);
      };
    }
  }, [isOpen, suggestions.length]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetcher.get<{
          data: { suggestions: ProviderSearchSuggestion[] };
        }>(
          `/api/provider/search?q=${encodeURIComponent(query.trim())}&limit=10`
        );
        const results = response.data?.suggestions || [];
        setSuggestions(results);
        setIsOpen(results.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        console.error("Provider search error:", error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Click outside to close (dropdown is portaled, so check both container and dropdown)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isOutsideContainer =
        containerRef.current && !containerRef.current.contains(target);
      const dropdownEl = document.getElementById("provider-search-results");
      const isOutsideDropdown =
        !dropdownEl || !dropdownEl.contains(target);
      if (isOutsideContainer && isOutsideDropdown) {
        setIsOpen(false);
        onFocusChange?.(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onFocusChange]);

  const handleSelect = (suggestion: ProviderSearchSuggestion) => {
    router.push(suggestion.url);
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.blur();
    onFocusChange?.(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) =>
          i < suggestions.length - 1 ? i + 1 : i
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => (i > 0 ? i - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const getIcon = (type: ProviderSearchSuggestion["type"]) => {
    switch (type) {
      case "client":
        return <User className="w-4 h-4 text-blue-500" />;
      case "appointment":
        return <Calendar className="w-4 h-4 text-green-500" />;
      case "service":
        return <Package className="w-4 h-4 text-purple-500" />;
    }
  };

  const getTypeLabel = (type: ProviderSearchSuggestion["type"]) => {
    switch (type) {
      case "client":
        return "Client";
      case "appointment":
        return "Appointment";
      case "service":
        return "Service";
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
            onFocusChange?.(true);
          }}
          placeholder={placeholder}
          className={cn(
            "pl-10 bg-gray-50 border-gray-200 w-full",
            inputClassName
          )}
          style={inputStyle}
          aria-label="Search clients, appointments, and services"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="provider-search-results"
          role="combobox"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
      </div>

      {typeof document !== "undefined" &&
        isOpen &&
        suggestions.length > 0 &&
        (() => {
          const rect = containerRef.current?.getBoundingClientRect();
          const style = rect
            ? { top: rect.bottom + 4, left: rect.left, width: rect.width }
            : { top: dropdownPosition.top, left: dropdownPosition.left, width: dropdownPosition.width };
          return createPortal(
            <div
              id="provider-search-results"
              role="listbox"
              className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-2 max-h-80 overflow-y-auto"
              style={style}
            >
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.id}`}
                role="option"
                aria-selected={index === selectedIndex}
                type="button"
                onClick={() => handleSelect(suggestion)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors",
                  index === selectedIndex && "bg-gray-50"
                )}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  {getIcon(suggestion.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {suggestion.title}
                  </p>
                  {suggestion.subtitle && (
                    <p className="text-sm text-gray-500 truncate">
                      {suggestion.subtitle}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 text-xs text-gray-400 capitalize">
                  {getTypeLabel(suggestion.type)}
                </span>
              </button>
            ))}
          </div>,
          document.body
        );
        })()}
    </div>
  );
}
