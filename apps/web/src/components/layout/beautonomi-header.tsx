"use client";

import React, { useState, useRef, useEffect, useTransition, useCallback } from "react";
import Link from "next/link";
import { MapPin, ChevronDown, ChevronLeft, ChevronRight, Search, Menu, User, Home, Briefcase, History, CheckCircle2, AlertCircle, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlatformLogo from "@/components/platform/PlatformLogo";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import LoginModal from "@/components/global/login-modal";
import EnhancedAddressDialog from "@/components/global/enhanced-address-dialog";
import { useSavedAddresses } from "@/hooks/useSavedAddresses";
import { useRecentLocations } from "@/hooks/useRecentLocations";
import { useServiceAvailability } from "@/hooks/useServiceAvailability";
import { toast } from "sonner";
import { HomeNavIcon, ExploreNavIcon } from "@/components/layout/nav-icons";
import { GlobalCategoryIcon } from "@/components/icons/GlobalCategoryIcon";
import { CustomerNotificationsDropdown } from "@/components/customer/CustomerNotificationsDropdown";
import { cn } from "@/lib/utils";
import { fetchPublicHomeClient } from "@/app/home/fetch-public-home-client";
import { useCookieConsent } from "@/providers/CookieConsentProvider";
import { useTranslation } from "@beautonomi/i18n";
import { PreferencesTrigger } from "@/components/global/PreferencesTrigger";
import { useOpenGlobalPreferences } from "@/components/global/GlobalPreferencesDialog";
import { translatePublicCategory } from "@/lib/i18n/translate-public-category";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string; // Lucide name (PascalCase), image URL, or legacy emoji
  nameI18n?: Record<string, string> | null;
}

interface BeautonomiHeaderProps {
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
  /** When set (e.g. from RSC home), category pills render without a client fetch delay */
  initialGlobalCategories?: Category[];
}

const BeautonomiHeader: React.FC<BeautonomiHeaderProps> = ({
  activeCategory,
  onCategoryChange,
  initialGlobalCategories,
}) => {
  const { t, i18n } = useTranslation();
  const openPreferences = useOpenGlobalPreferences();
  const { user, isLoading: authLoading, signOut, role: authRole } = useAuth();
  const { isReady: consentReady, allowsFunctional } = useCookieConsent();
  const canPersistUserLocation = consentReady && allowsFunctional;
  const router = useRouter();
  const [isCategoryNavPending, startCategoryTransition] = useTransition();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isHomePage = pathname === "/" || pathname === "";
  const isExplorePage = pathname?.startsWith("/explore");
  
  // Get active category from URL if not provided
  const urlCategory = searchParams.get("category") || "all";
  const currentActiveCategory = activeCategory || urlCategory;
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<"login" | "signup">("login");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAddressMenuOpenDesktop, setIsAddressMenuOpenDesktop] = useState(false);
  const [isAddressMenuOpenMobile, setIsAddressMenuOpenMobile] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number; address: string } | null>(null);
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{
    type: 'service' | 'provider' | 'category';
    id: string;
    name: string;
    url: string;
    category?: string;
  }>>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [isMounted, setIsMounted] = useState(false);
  const [hasTriedIPLocation, setHasTriedIPLocation] = useState(false);
  const [portalKind, setPortalKind] = useState<string | null>(null);
  const { addresses, isLoading: _addressesLoading, loadAddresses } = useSavedAddresses();
  const { recentLocations, addLocation } = useRecentLocations();
  const { availability, checkAvailability } = useServiceAvailability();
  const [categories, setCategories] = useState<Category[]>(() => {
    const all: Category = { id: "all", name: t("web.layout.header.allCategories"), slug: "all", icon: "all" };
    if (initialGlobalCategories?.length) {
      return [
        all,
        ...initialGlobalCategories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon || "BeautonomiAll",
          nameI18n: c.nameI18n ?? null,
        })),
      ];
    }
    return [all];
  });
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const effectiveRole = authRole ?? user?.role ?? null;
  const isProviderLikeUser =
    effectiveRole === "provider_owner" ||
    effectiveRole === "provider_staff" ||
    portalKind === "provider" ||
    portalKind === "provider_onboarding";
  const showProviderContextBanner =
    Boolean(user && isProviderLikeUser) &&
    !pathname?.startsWith("/provider") &&
    !pathname?.startsWith("/admin");

  const persistUserLocation = useCallback(
    (data: { latitude: number; longitude: number; address: string }) => {
      if (!canPersistUserLocation) return;
      try {
        localStorage.setItem("userLocation", JSON.stringify(data));
      } catch (e) {
        console.error("Failed to persist user location", e);
      }
    },
    [canPersistUserLocation],
  );

  // Fetch categories from API (skipped when RSC already supplied them — faster first paint on home)
  useEffect(() => {
    if (initialGlobalCategories?.length) return;

    const fetchCategories = async () => {
      try {
        // Categories are mostly static; cache for 5 minutes so repeated navigation
        // (home → category → back) never triggers a fresh network request.
        const response = await fetcher.get<{ data: any[] }>("/api/public/categories/global?all=true", {
          staleTimeMs: 5 * 60_000,
        });

        if (response && response.data && Array.isArray(response.data) && response.data.length > 0) {
          const mappedCategories = response.data.map((cat: any) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            icon: cat.icon || "BeautonomiAll",
            nameI18n: (cat.name_i18n ?? cat.nameI18n ?? null) as Record<string, string> | null,
          }));

          // Prepend "All" category if not present
          setCategories([
            { id: "all", name: t("web.layout.header.allCategories"), slug: "all", icon: "all" },
            ...mappedCategories
          ]);
        } else {
          console.warn("No categories returned from API or empty response:", response);
          // Keep the default "All" category
          setCategories([
            { id: "all", name: t("web.layout.header.allCategories"), slug: "all", icon: "all" }
          ]);
        }
      } catch (error) {
        console.error("Failed to load categories", error);
        // Keep fallback categories with just "All"
        setCategories([
          { id: "all", name: t("web.layout.header.allCategories"), slug: "all", icon: "all" }
        ]);
      }
    };

    if (isMounted) {
      fetchCategories();
    }
  }, [isMounted, initialGlobalCategories]);

  useEffect(() => {
    setIsMounted(true);
    
    // Click outside to close search and suggestions (exclude the search toggle button)
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchToggleRef.current?.contains(target)) return; // Don't close when clicking the toggle
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setIsSearchOpen(false);
        setSelectedSuggestionIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user || effectiveRole === "provider_owner" || effectiveRole === "provider_staff") {
      setPortalKind(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data?: { portal?: string } }>("/api/me/portal", {
          staleTimeMs: 60_000,
          timeoutMs: 5000,
        });
        if (!cancelled) setPortalKind(res.data?.portal ?? null);
      } catch {
        if (!cancelled) setPortalKind(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, effectiveRole]);

  // Fetch search suggestions with debouncing
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Don't search if query is too short
    if (searchQuery.trim().length < 2) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);

    // Debounce API call
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetcher.get<{ 
          data: { 
            suggestions: Array<{
              type: 'service' | 'provider' | 'category';
              id: string;
              name: string;
              url: string;
              category?: string;
            }>;
          } 
        }>(`/api/public/search/suggestions?q=${encodeURIComponent(searchQuery.trim())}&limit=10`);
        
        setSuggestions(response.data?.suggestions || []);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const toggleSearch = () => {
    setIsSearchOpen(!isSearchOpen);
    if (!isSearchOpen) {
      setTimeout(() => {
        const input = document.querySelector('input[type="text"]') as HTMLInputElement;
        if (input) input.focus();
      }, 100);
    } else {
      // Reset when closing
      setSelectedSuggestionIndex(-1);
    }
  };

  const renderCategoryIcon = (iconStr?: string, active?: boolean) => (
    <GlobalCategoryIcon
      icon={iconStr || "BeautonomiAll"}
      size={24}
      strokeWidth={1.75}
      className="text-current"
      isActive={active}
    />
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let savedLocation: string | null = null;
    if (canPersistUserLocation) {
      savedLocation = localStorage.getItem("userLocation");
    }
    if (savedLocation) {
      try {
        const location = JSON.parse(savedLocation);
        setSelectedLocation(location);
        setSelectedAddress(location.address || null);
      } catch (error) {
        console.error("Error parsing saved location:", error);
      }
    } else if (!hasTriedIPLocation) {
      setHasTriedIPLocation(true);
      void fetchLocationFromIP();
    }
    if (user && !savedLocation) {
      loadAddresses();
    }
  }, [user, hasTriedIPLocation, canPersistUserLocation]);

  // Set default address when addresses load
  useEffect(() => {
    if (user && addresses.length > 0 && !selectedLocation) {
      const defaultAddress = addresses.find(addr => addr.is_default) || addresses[0];
      if (defaultAddress && defaultAddress.latitude && defaultAddress.longitude) {
        const addressString = `${defaultAddress.address_line1}, ${defaultAddress.city}, ${defaultAddress.country}`;
        setSelectedAddress(addressString);
        setSelectedLocation({
          latitude: defaultAddress.latitude,
          longitude: defaultAddress.longitude,
          address: addressString
        });
        persistUserLocation({
          latitude: defaultAddress.latitude,
          longitude: defaultAddress.longitude,
          address: addressString
        });
      }
    }
  }, [user, addresses, selectedLocation, persistUserLocation]);

  // Fetch location from IP address as fallback
  const fetchLocationFromIP = async () => {
    // Don't fetch if user already has a location selected
    if (selectedLocation) {
      return;
    }

    try {
      // Show a temporary address while fetching
      setSelectedAddress(t("web.layout.header.detectingLocation"));

      let response: { 
        data: {
          country: string | null;
          countryCode: string | null;
          city: string | null;
          postalCode: string | null;
          region: string | null;
          latitude: number | null;
          longitude: number | null;
          timezone: string | null;
          ip: string;
        } | null;
        error: any;
      };

      try {
        response = await fetcher.get<{ 
          data: {
            country: string | null;
            countryCode: string | null;
            city: string | null;
            postalCode: string | null;
            region: string | null;
            latitude: number | null;
            longitude: number | null;
            timezone: string | null;
            ip: string;
          } | null;
          error: any;
        }>("/api/public/ip-geolocation");
      } catch (fetchError: any) {
        // Handle FetchError from fetcher
        console.warn("IP geolocation failed:", fetchError.message || fetchError);
        // Check if it's a reserved IP error or other geolocation error
        if (fetchError.code === "RESERVED_IP" || fetchError.message?.includes("reserved range")) {
          console.log("IP geolocation not available (reserved IP - likely in development)");
          setSelectedAddress(null);
          return; // Exit early, user can select location manually
        }
        // For other errors, also show default
        setSelectedAddress(null);
        return;
      }

      // Check for error in response (including reserved IP errors)
      if (response.error) {
        // If it's a reserved IP error or geolocation error, just show default
        // This is common in development environments
        if (response.error.code === "RESERVED_IP" || response.error.code === "GEOLOCATION_ERROR" || response.error.code === "IP_NOT_FOUND") {
          console.log("IP geolocation not available (likely in development):", response.error.message);
          setSelectedAddress(null);
          return; // Exit early, user can select location manually
        }
        // For other errors, also show default
        setSelectedAddress(null);
        return;
      }

      if (response.data && !response.error) {
        const ipLocation = response.data;
        
        // Build address string from IP location data - prioritize city and country
        const addressParts: string[] = [];
        if (ipLocation.city) addressParts.push(ipLocation.city);
        if (ipLocation.region && ipLocation.region !== ipLocation.city) {
          addressParts.push(ipLocation.region);
        }
        if (ipLocation.country) addressParts.push(ipLocation.country);
        
        const addressString = addressParts.length > 0 
          ? addressParts.join(", ")
          : ipLocation.country || ipLocation.city || t("web.layout.header.currentLocation");

        // If we have coordinates from IP, use them directly
        if (ipLocation.latitude && ipLocation.longitude) {
          const locationData = {
            latitude: ipLocation.latitude,
            longitude: ipLocation.longitude,
            address: addressString
          };
          
          // Always set the location and address - this ensures it displays immediately
          setSelectedLocation(locationData);
          setSelectedAddress(addressString);
          persistUserLocation(locationData);
          window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));
          
          // Check service availability
          checkAvailability(ipLocation.latitude, ipLocation.longitude);
        } else if (ipLocation.city || ipLocation.country) {
          // If no coordinates, try to geocode the city/country to get accurate coordinates
          try {
            const geocodeQuery = ipLocation.city && ipLocation.country
              ? `${ipLocation.city}, ${ipLocation.country}`
              : ipLocation.country || ipLocation.city || "";
            
            if (geocodeQuery) {
              const geocodeResponse = await fetcher.post<{ data: any[] }>("/api/mapbox/geocode", {
                query: geocodeQuery,
                limit: 1
              });

              if (geocodeResponse.data && geocodeResponse.data.length > 0) {
                const result = geocodeResponse.data[0];
                // Use the full place_name from Mapbox for better address display
                const fullAddress = result.place_name || addressString;
                const locationData = {
                  latitude: result.center[1],
                  longitude: result.center[0],
                  address: fullAddress
                };
                
                // Always set the location and address
                setSelectedLocation(locationData);
                setSelectedAddress(fullAddress);
                persistUserLocation(locationData);
                window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));
                
                // Check service availability
                checkAvailability(locationData.latitude, locationData.longitude);
              } else {
                // If geocoding fails but we have address info, still set it
                setSelectedAddress(addressString);
              }
            }
          } catch (geocodeError) {
            console.error("Error geocoding IP location:", geocodeError);
            // If geocoding fails, still show the address string
            setSelectedAddress(addressString);
          }
        } else {
          // Fallback if we have no location data at all
          setSelectedAddress(null);
        }
      } else {
        // If IP geolocation fails, show default
        setSelectedAddress(null);
      }
    } catch (error) {
      console.error("Error fetching location from IP:", error);
      // On error, show default
      setSelectedAddress(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  const handleCategoryClick = (slug: string) => {
    if (onCategoryChange) {
      onCategoryChange(slug);
    } else {
      const params = new URLSearchParams();
      if (selectedLocation?.latitude != null && selectedLocation?.longitude != null) {
        params.set("lat", String(selectedLocation.latitude));
        params.set("lng", String(selectedLocation.longitude));
      }
      if (slug !== "all") {
        params.set("category", slug);
      }
      // Warm the home payload for all sections before route-state updates.
      void fetchPublicHomeClient(params, { forceFresh: true });
      startCategoryTransition(() => {
        if (slug === "all") {
          router.replace("/", { scroll: false });
        } else {
          router.replace(`/?category=${encodeURIComponent(slug)}`, { scroll: false });
        }
      });
    }
  };

  const prefetchCategoryHome = useCallback(
    (slug: string) => {
      if (onCategoryChange) return;
      const params = new URLSearchParams();
      if (selectedLocation?.latitude != null && selectedLocation?.longitude != null) {
        params.set("lat", String(selectedLocation.latitude));
        params.set("lng", String(selectedLocation.longitude));
      }
      if (slug !== "all") {
        params.set("category", slug);
      }
      void fetchPublicHomeClient(params);
      const href = slug === "all" ? "/" : `/?category=${encodeURIComponent(slug)}`;
      router.prefetch(href);
    },
    [onCategoryChange, router, selectedLocation?.latitude, selectedLocation?.longitude],
  );

  // Get current location using geolocation API
  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error(t("web.layout.header.toastGeolocationUnsupported"));
      return;
    }

    setIsGettingLocation(true);
    setIsAddressMenuOpenDesktop(false);
    setIsAddressMenuOpenMobile(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Use reverse-geocode endpoint with explicit coordinates.
          const response = await fetcher.post<{ data: any | null }>("/api/mapbox/reverse-geocode", {
            longitude,
            latitude,
          });

          if (response.data?.place_name) {
            const address = response.data.place_name;
            setSelectedAddress(address);
            setSelectedLocation({ latitude, longitude, address });
            
            // Save to localStorage
            const locationData = {
              latitude,
              longitude,
              address
            };
            persistUserLocation(locationData);
            
            // Dispatch custom event for immediate updates in same tab
            window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));

            toast.success(t("web.layout.header.toastLocationUpdated"));
          } else {
            // Fallback to coordinates if reverse geocoding fails
            const address = t("web.layout.header.currentLocationWithCoords", { lat: latitude.toFixed(4), lng: longitude.toFixed(4) });
            setSelectedAddress(t("web.layout.header.currentLocation"));
            setSelectedLocation({ latitude, longitude, address });
            persistUserLocation({
              latitude,
              longitude,
              address
            });
            toast.success(t("web.layout.header.toastLocationUpdated"));
          }
        } catch (error) {
          console.error("Error reverse geocoding:", error);
          // Fallback to coordinates if reverse geocoding fails
          const address = t("web.layout.header.currentLocationWithCoords", { lat: latitude.toFixed(4), lng: longitude.toFixed(4) });
          setSelectedAddress(t("web.layout.header.currentLocation"));
          setSelectedLocation({ latitude, longitude, address });
          persistUserLocation({
            latitude,
            longitude,
            address
          });
          toast.success(t("web.layout.header.toastLocationUpdated"));
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        console.error("Error getting location:", error);
        toast.error(t("web.layout.header.toastLocationPermissionDenied"));
        setIsGettingLocation(false);
      }
    );
  };

  // Handle address selection from autocomplete
  const handleAddressSelect = async (address: {
    address_line1: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
    place_name?: string;
  }) => {
    const addressString = address.place_name || `${address.address_line1}, ${address.city}, ${address.country}`;
    setSelectedAddress(addressString);
    setSelectedLocation({
      latitude: address.latitude,
      longitude: address.longitude,
      address: addressString
    });

    // Save to localStorage
    const locationData = {
      latitude: address.latitude,
      longitude: address.longitude,
      address: addressString
    };
    persistUserLocation(locationData);
    
    // Dispatch custom event for immediate updates in same tab
    window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));

    // Add to recent locations
    addLocation({
      address: addressString,
      latitude: address.latitude,
      longitude: address.longitude,
      city: address.city,
      country: address.country,
    });

    // Check service availability
    checkAvailability(address.latitude, address.longitude);

    setIsAddressDialogOpen(false);
    toast.success(t("web.layout.header.toastLocationUpdated"));
  };

  // Handle selecting a saved address
  const handleSelectSavedAddress = (savedAddress: any) => {
    if (savedAddress.latitude && savedAddress.longitude) {
      const addressString = `${savedAddress.address_line1}, ${savedAddress.city}, ${savedAddress.country}`;
      setSelectedAddress(addressString);
      setSelectedLocation({
        latitude: savedAddress.latitude,
        longitude: savedAddress.longitude,
        address: addressString
      });

      const locationData = {
        latitude: savedAddress.latitude,
        longitude: savedAddress.longitude,
        address: addressString
      };
      persistUserLocation(locationData);
      
      // Dispatch custom event for immediate updates in same tab
      window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));

      // Add to recent locations
      addLocation({
        address: addressString,
        latitude: savedAddress.latitude,
        longitude: savedAddress.longitude,
        city: savedAddress.city,
        country: savedAddress.country,
      });

      // Check service availability
      checkAvailability(savedAddress.latitude, savedAddress.longitude);

      setIsAddressMenuOpenDesktop(false);
      setIsAddressMenuOpenMobile(false);
      toast.success(t("web.layout.header.toastLocationUpdated"));
    }
  };

  // Handle selecting a recent location
  const handleSelectRecentLocation = (recentLoc: any) => {
    setSelectedAddress(recentLoc.address);
    setSelectedLocation({
      latitude: recentLoc.latitude,
      longitude: recentLoc.longitude,
      address: recentLoc.address
    });

    const locationData = {
      latitude: recentLoc.latitude,
      longitude: recentLoc.longitude,
      address: recentLoc.address
    };
    persistUserLocation(locationData);
    window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));

    checkAvailability(recentLoc.latitude, recentLoc.longitude);

    setIsAddressMenuOpenDesktop(false);
    setIsAddressMenuOpenMobile(false);
    toast.success(t("web.layout.header.toastLocationUpdated"));
  };

  const scrollCategories = (direction: "left" | "right") => {
    if (categoryScrollRef.current) {
      const scrollAmount = 200;
      categoryScrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <header className="relative bg-white border-b shadow-sm sticky top-0 z-[100] isolate">
      {showProviderContextBanner && (
        <div className="border-b border-pink-100 bg-gradient-to-r from-pink-50 via-white to-rose-50">
          <div className="max-w-[2340px] mx-auto px-4 md:px-6 lg:px-20 py-2.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-950">{t("web.layout.header.providerBannerTitle")}</p>
                <p className="text-xs text-gray-600">
                  {t("web.layout.header.providerBannerBody")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Link
                  href="/provider/settings/ads"
                  className="inline-flex min-h-9 items-center justify-center rounded-full border border-pink-200 bg-white px-3 py-1.5 text-xs font-semibold text-pink-700 shadow-sm hover:bg-pink-50"
                >
                  {t("web.layout.header.managePaidAds")}
                </Link>
                <Link
                  href="/provider/dashboard"
                  className="inline-flex min-h-9 items-center justify-center rounded-full bg-gray-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-gray-800"
                >
                  {t("web.layout.header.returnToDashboard")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Address Selector Bar - Top Most */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-[2340px] mx-auto px-4 md:px-6 lg:px-20">
          <div className="flex items-center justify-center py-2 md:py-3">
            <DropdownMenu open={isAddressMenuOpenDesktop || isAddressMenuOpenMobile} onOpenChange={(open) => {
              setIsAddressMenuOpenDesktop(open);
              setIsAddressMenuOpenMobile(open);
            }}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full max-w-md bg-[#FF007F] hover:bg-[#E6006F] text-white rounded-full px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-center gap-2 font-medium transition-colors shadow-sm touch-manipulation select-none"
                >
                  <MapPin className="h-4 w-4 md:h-5 md:w-5 text-white flex-shrink-0" />
                  <span className="text-sm md:text-base truncate flex-1 text-center">{selectedAddress ?? t("web.layout.header.selectAddress")}</span>
                  <ChevronDown className="h-4 w-4 md:h-5 md:w-5 text-white flex-shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-[calc(100vw-32px)] md:w-80 p-2 rounded-xl shadow-lg border border-[#FF007F]/20 bg-white max-h-[500px] overflow-y-auto">
                {/* Service Availability Indicator */}
                {selectedLocation && (
                  <div className="px-4 py-2 mb-2 rounded-lg border border-gray-200 bg-gray-50">
                    {availability.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t("web.layout.header.checkingAvailability")}</span>
                      </div>
                    ) : availability.in_zone ? (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{t("web.layout.header.servicesAvailable")}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-amber-600">
                        <AlertCircle className="h-4 w-4" />
                        <span>{t("web.layout.header.limitedAvailability")}</span>
                      </div>
                    )}
                  </div>
                )}

                <DropdownMenuItem 
                  onClick={getCurrentLocation}
                  disabled={isGettingLocation}
                  className="cursor-pointer py-3 px-4 rounded-lg hover:bg-[#FF007F]/10 focus:bg-[#FF007F]/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#FF007F]" />
                    <span className="text-base text-gray-900">
                      {isGettingLocation ? t("web.layout.header.gettingLocation") : t("web.layout.header.currentLocation")}
                    </span>
                  </div>
                </DropdownMenuItem>

                {/* Quick Shortcuts (Home/Work) */}
                {(recentLocations.find(loc => loc.label === "Home") || recentLocations.find(loc => loc.label === "Work")) && (
                  <>
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {t("web.layout.header.quickAccess")}
                    </div>
                    {recentLocations.find(loc => loc.label === "Home") && (
                      <DropdownMenuItem 
                        onClick={() => handleSelectRecentLocation(recentLocations.find(loc => loc.label === "Home")!)}
                        className="cursor-pointer py-3 px-4 rounded-lg hover:bg-[#FF007F]/10 focus:bg-[#FF007F]/10 transition-colors"
                      >
                        <div className="flex items-start gap-2 w-full">
                          <Home className="h-4 w-4 text-[#FF007F] mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{t("web.layout.header.home")}</p>
                            <p className="text-xs text-gray-600 truncate">
                              {recentLocations.find(loc => loc.label === "Home")!.address}
                            </p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    )}
                    {recentLocations.find(loc => loc.label === "Work") && (
                      <DropdownMenuItem 
                        onClick={() => handleSelectRecentLocation(recentLocations.find(loc => loc.label === "Work")!)}
                        className="cursor-pointer py-3 px-4 rounded-lg hover:bg-[#FF007F]/10 focus:bg-[#FF007F]/10 transition-colors"
                      >
                        <div className="flex items-start gap-2 w-full">
                          <Briefcase className="h-4 w-4 text-[#FF007F] mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{t("web.layout.header.work")}</p>
                            <p className="text-xs text-gray-600 truncate">
                              {recentLocations.find(loc => loc.label === "Work")!.address}
                            </p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    )}
                  </>
                )}

                {/* Recent Locations */}
                {recentLocations.filter(loc => loc.label !== "Home" && loc.label !== "Work").length > 0 && (
                  <>
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {t("web.layout.header.recentLocations")}
                    </div>
                    {recentLocations.filter(loc => loc.label !== "Home" && loc.label !== "Work").slice(0, 3).map((loc) => (
                      <DropdownMenuItem 
                        key={loc.id}
                        onClick={() => handleSelectRecentLocation(loc)}
                        className="cursor-pointer py-3 px-4 rounded-lg hover:bg-[#FF007F]/10 focus:bg-[#FF007F]/10 transition-colors"
                      >
                        <div className="flex items-start gap-2 w-full">
                          <History className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            {loc.label && (
                              <p className="text-sm font-medium text-gray-900">{loc.label}</p>
                            )}
                            <p className="text-xs text-gray-600 truncate">{loc.address}</p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                
                {user && addresses.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {t("web.layout.header.savedAddresses")}
                    </div>
                    {addresses.map((addr) => (
                      <DropdownMenuItem 
                        key={addr.id}
                        onClick={() => handleSelectSavedAddress(addr)}
                        className="cursor-pointer py-3 px-4 rounded-lg hover:bg-[#FF007F]/10 focus:bg-[#FF007F]/10 transition-colors"
                      >
                        <div className="flex items-start gap-2 w-full">
                          <MapPin className="h-4 w-4 text-[#FF007F] mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            {addr.label && (
                              <p className="text-sm font-medium text-gray-900">{addr.label}</p>
                            )}
                            <p className="text-sm text-gray-600 truncate">
                              {addr.address_line1}, {addr.city}
                            </p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("web.layout.header.options")}
                </div>
                <DropdownMenuItem 
                  onClick={() => { 
                    setIsAddressDialogOpen(true); 
                    setIsAddressMenuOpenDesktop(false);
                    setIsAddressMenuOpenMobile(false);
                  }}
                  className="cursor-pointer py-3 px-4 rounded-lg hover:bg-[#FF007F]/10 focus:bg-[#FF007F]/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#FF007F]" />
                    <span className="text-base text-gray-900">{t("web.layout.header.selectAddress")}</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Header Bar — 3 equal columns so the globe never collides with Home/Explore */}
      <div className="max-w-[2340px] mx-auto px-3 sm:px-4 md:px-6 lg:px-20 relative">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 py-2 md:py-4">
          <div className="flex items-center justify-start min-w-0">
            <Link href="/" className="flex items-center gap-2 min-w-0">
              <PlatformLogo alt={t("web.layout.header.logoAlt")} className="h-5 sm:h-6 md:h-10 w-auto max-w-[88px] sm:max-w-none" />
            </Link>
          </div>

          <nav
            className="flex items-center justify-center gap-0 sm:gap-1 shrink-0"
            aria-label={t("web.a11y.primaryNav")}
          >
            <Link
              href="/"
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-2 py-2 sm:px-3 md:px-5 md:gap-1 rounded-lg transition-colors min-w-[44px] sm:min-w-[56px] md:min-w-[72px] touch-manipulation select-none",
                isHomePage ? "text-[#FF007F] font-bold" : "text-gray-600 hover:text-gray-900 active:text-gray-900",
              )}
            >
              <HomeNavIcon active={isHomePage} size={24} />
              <span className="text-[10px] md:text-xs font-medium leading-none">{t("web.layout.home")}</span>
              {isHomePage && (
                <div className="absolute bottom-0 left-1 right-1 md:left-2 md:right-2 h-1 bg-[#FF007F] rounded-full" aria-hidden />
              )}
            </Link>
            <Link
              href="/explore"
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-2 py-2 sm:px-3 md:px-5 md:gap-1 rounded-lg transition-colors min-w-[44px] sm:min-w-[56px] md:min-w-[72px] touch-manipulation select-none",
                isExplorePage ? "text-[#FF007F] font-bold" : "text-gray-600 hover:text-gray-900 active:text-gray-900",
              )}
            >
              <ExploreNavIcon active={isExplorePage} size={24} />
              <span className="flex items-center gap-1 text-[10px] md:text-xs font-medium leading-none">
                {t("web.layout.explore")}
                <span className="hidden sm:inline px-1 py-0.5 text-[8px] md:text-[9px] font-bold uppercase bg-[#FF007F] text-white rounded leading-none">
                  {t("web.layout.newBadge")}
                </span>
              </span>
              {isExplorePage && (
                <div className="absolute bottom-0 left-1 right-1 md:left-2 md:right-2 h-1 bg-[#FF007F] rounded-full" aria-hidden />
              )}
            </Link>
          </nav>

          {/* Right: globe aligned with menu; search + partner stay md+ */}
          <div className="relative z-[110] flex items-center justify-end gap-0.5 md:gap-3 min-w-0">
            <button
              ref={searchToggleRef}
              type="button"
              onClick={toggleSearch}
              className="hidden md:inline-flex p-1.5 md:p-2 min-w-[44px] min-h-[44px] items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation select-none"
              aria-label={t("web.a11y.toggleSearch")}
            >
              <Search className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
            </button>

            {isMounted ? (
              <PreferencesTrigger
                variant="header"
                onClick={() => openPreferences({ surface: "header" })}
              />
            ) : (
              <span className="inline-flex min-w-[44px] min-h-[44px]" aria-hidden />
            )}

            {/* Notification bell for signed-in customers (incl. mobile public home). */}
            {isMounted && user && user.role === "customer" ? <CustomerNotificationsDropdown /> : null}

            {/* Become a partner link (Desktop) */}
            <Link
              href="/become-a-partner"
              className="hidden md:block text-sm md:text-base font-normal text-gray-700 hover:text-[#FF007F] transition-colors"
            >
              {t("web.layout.becomePartner")}
            </Link>

            {/* User Menu */}
            {isMounted ? (
              !user && !authLoading ? (
                // Unauthenticated: Show hamburger menu
                <Sheet open={isUserMenuOpen} onOpenChange={setIsUserMenuOpen}>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("web.a11y.openMenu")}
                      className="p-1.5 md:p-2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation select-none"
                    >
                      <Menu className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side="end" className="w-full sm:w-[400px] max-w-[95vw] overflow-y-auto p-0 gap-0 bg-white">
                    <SheetHeader className="p-6 pb-2 border-b border-gray-100">
                      <SheetTitle className="text-start text-xl font-bold text-gray-900">
                        {t("web.layout.logInOrSignUp")}
                      </SheetTitle>
                      <SheetDescription className="text-start text-sm text-gray-600">
                        {t("web.layout.accessAccountHint")}
                      </SheetDescription>
                    </SheetHeader>
                    <div className="flex flex-col p-2">
                      <div className="grid grid-cols-3 gap-2 px-4 py-2 border-b border-gray-100 md:hidden">
                        <Link
                          href="/"
                          className={`py-2 text-center text-sm font-medium rounded-lg ${
                            isHomePage ? "bg-[#FF007F]/10 text-[#FF007F]" : "text-gray-600 hover:bg-gray-50"
                          }`}
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          {t("web.layout.header.home")}
                        </Link>
                        <Link
                          href="/explore"
                          className={`py-2 text-center text-sm font-medium rounded-lg ${
                            isExplorePage ? "bg-[#FF007F]/10 text-[#FF007F]" : "text-gray-600 hover:bg-gray-50"
                          }`}
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          {t("web.layout.explore")}
                        </Link>
                        <Link
                          href="/search"
                          className={`py-2 text-center text-sm font-medium rounded-lg ${
                            pathname === "/search" ? "bg-[#FF007F]/10 text-[#FF007F]" : "text-gray-600 hover:bg-gray-50"
                          }`}
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          {t("web.layout.header.search")}
                        </Link>
                      </div>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-base font-medium h-14 px-4 hover:bg-gray-50 rounded-xl"
                        onClick={() => {
                          setLoginModalMode("login");
                          setIsLoginModalOpen(true);
                          setIsUserMenuOpen(false);
                        }}
                      >
                        {t("web.layout.header.logIn")}
                      </Button>
                      <Button
                        variant="secondary"
                        className="w-full justify-start text-base font-medium h-14 px-4 bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white rounded-xl"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          router.push("/signup?type=customer");
                        }}
                      >
                        {t("web.layout.header.signUp")}
                      </Button>
                      <div className="h-px bg-gray-100 my-2 mx-4" />
                      <Link 
                        href="/become-a-partner"
                        className="flex items-center w-full justify-start text-base font-normal h-14 px-4 hover:bg-gray-50 rounded-xl text-gray-700"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        {t("web.layout.becomePartner")}
                      </Link>
                      <Link 
                        href="/help"
                        className="flex items-center w-full justify-start text-base font-normal h-14 px-4 hover:bg-gray-50 rounded-xl text-gray-700"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        {t("web.layout.header.helpCentre")}
                      </Link>
                      <Link 
                        href="/learn"
                        className="flex items-center w-full justify-start text-base font-normal h-14 px-4 hover:bg-gray-50 rounded-xl text-gray-700"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        {t("web.layout.header.learningCenter")}
                      </Link>
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full justify-start text-base font-normal h-14 px-4 hover:bg-gray-50 rounded-xl text-gray-700"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          openPreferences({ surface: "header" });
                        }}
                      >
                        <Globe className="h-4 w-4 shrink-0" aria-hidden />
                        {t("web.preferences.title")}
                      </button>
                    </div>
                  </SheetContent>
                </Sheet>
              ) : user && (authRole ?? user.role) === "customer" ? (
                <Link
                  href="/account-settings"
                  className="p-1.5 md:p-2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation select-none"
                  aria-label={t("web.layout.header.accountSettingsAria")}
                >
                  <User className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
                </Link>
              ) : user ? (
                // Authenticated non-customer: dashboard + account + sign out
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("web.layout.header.userMenuAria")}
                      className="p-1.5 md:p-2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation select-none"
                    >
                      <User className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white border-gray-200">
                    <div className="px-4 py-2 border-b border-gray-200">
                      <p className="text-sm font-medium text-gray-900">
                        {user?.full_name || t("web.layout.header.userFallback")}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    {(authRole ?? user?.role) && (authRole ?? user?.role) !== "customer" ? (
                      <DropdownMenuItem asChild>
                        <Link href="/portal" className="cursor-pointer">
                          {t("web.layout.header.dashboard")}
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem asChild>
                      <Link href="/account-settings" className="cursor-pointer">
                        {t("web.layout.header.profileAndAccount")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={async () => {
                        await signOut();
                      }}
                      className="cursor-pointer text-red-600 focus:text-red-600"
                    >
                      {t("web.layout.header.signOut")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="p-1.5 md:p-2 min-w-[44px] min-h-[44px]" aria-hidden />
              )
            ) : (
              <div className="p-1.5 md:p-2 rounded-full">
                <Menu className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Section - Toggle to expand (desktop only) */}
      <div
        ref={searchContainerRef}
        className={cn(
          "hidden md:block max-w-[2340px] mx-auto px-4 md:px-6 lg:px-20 transition-all duration-300 ease-in-out overflow-visible",
          isSearchOpen
            ? "max-h-96 opacity-100 pb-4 pt-2 border-t border-gray-100 pointer-events-auto"
            : "max-h-0 opacity-0 overflow-hidden pointer-events-none",
        )}
      >
        <form onSubmit={handleSearch} className="relative z-50 touch-manipulation">
          <input
            type="text"
            placeholder={t("web.layout.searchProvidersPlaceholder")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedSuggestionIndex(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedSuggestionIndex(prev => 
                  prev < suggestions.length - 1 ? prev + 1 : prev
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
              } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
                e.preventDefault();
                const suggestion = suggestions[selectedSuggestionIndex];
                window.location.href = suggestion.url;
              } else if (e.key === 'Escape') {
                setIsSearchOpen(false);
                setSelectedSuggestionIndex(-1);
              }
            }}
            className="w-full rounded-full border border-gray-200 px-4 md:px-6 py-2.5 md:py-3.5 ps-8 pe-12 md:pe-16 text-base md:text-base shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-[#FF007F] focus:border-transparent placeholder:text-gray-400"
          />
          <button
            type="submit"
            className="absolute end-1.5 md:end-2 top-1/2 -translate-y-1/2 bg-[#FF007F] hover:bg-[#E6006F] text-white rounded-full p-2 md:p-2.5 transition-all hover:scale-105 active:scale-95"
            aria-label={t("web.a11y.search")}
          >
            <Search className="h-4 w-4 md:h-5 md:w-5" />
          </button>

          {/* Autocomplete Suggestions */}
          {isSearchOpen && searchQuery.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 max-h-96 overflow-y-auto">
              {isLoadingSuggestions ? (
                <div className="px-6 py-4 text-sm text-gray-500 text-center">
                  {t("web.layout.header.searching")}
                </div>
              ) : suggestions.length > 0 ? (
                <>
                  {suggestions.map((suggestion, index) => (
                    <Link
                      key={`${suggestion.type}-${suggestion.id}-${index}`}
                      href={suggestion.url}
                      className={`w-full text-start px-6 py-3 text-sm text-gray-700 flex items-center gap-3 transition-colors ${
                        index === selectedSuggestionIndex 
                          ? 'bg-[#FF007F]/10 border-s-2 border-[#FF007F]' 
                          : 'hover:bg-gray-50'
                      }`}
                      onMouseEnter={() => setSelectedSuggestionIndex(index)}
                      onClick={() => {
                        setIsSearchOpen(false);
                        setSearchQuery(suggestion.name);
                        setSelectedSuggestionIndex(-1);
                      }}
                    >
                      <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {suggestion.name}
                        </div>
                        {suggestion.category && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {suggestion.category}
                          </div>
                        )}
                        {suggestion.type === 'provider' && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {t("web.layout.header.suggestionProvider")}
                          </div>
                        )}
                        {suggestion.type === 'category' && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {t("web.layout.header.suggestionCategory")}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </>
              ) : (
                <div className="px-6 py-4 text-sm text-gray-500 text-center">
                  {t("web.layout.header.noSuggestions")}
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Category Navigation - Home page only */}
      {isHomePage && (
      <div
        className={cn("border-t bg-white", isCategoryNavPending && "opacity-[0.97] transition-opacity")}
        aria-busy={isCategoryNavPending}
      >
        <div className="max-w-[2340px] mx-auto px-4 md:px-6 lg:px-20">
          <div className="relative flex items-center gap-2">
            {/* Left scroll button */}
            <button
              type="button"
              onClick={() => scrollCategories("left")}
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm z-10 touch-manipulation"
              aria-label={t("web.a11y.scrollLeft")}
            >
              <ChevronLeft className="h-4 w-4 text-gray-400" />
            </button>

            {/* Categories */}
            <div
              ref={categoryScrollRef}
              className="flex-1 flex items-center gap-2 md:gap-4 overflow-x-auto px-2 scrollbar-hide"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {categories.map((category) => {
                const isActive = currentActiveCategory === category.slug;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleCategoryClick(category.slug)}
                    onPointerEnter={() => prefetchCategoryHome(category.slug)}
                    className={cn(
                      "relative flex flex-col items-center gap-1 md:gap-2 px-2 md:px-4 py-2 md:py-3 min-h-[44px] md:min-h-0 whitespace-nowrap transition-colors touch-manipulation select-none rounded-lg active:opacity-80",
                      isActive
                        ? "text-[#FF007F] font-semibold"
                        : "text-gray-600 font-normal hover:text-gray-900 active:text-gray-900",
                    )}
                  >
                    <span className="flex items-center justify-center h-6 w-6 text-inherit">
                      {renderCategoryIcon(category.icon, isActive)}
                    </span>
                    <span className="text-[10px] md:text-sm font-medium">
                      {translatePublicCategory(t, category.slug, category.name, {
                        language: i18n.language,
                        nameI18n: category.nameI18n,
                      })}
                    </span>
                    {isActive && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-0.5 bg-[#FF007F] rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right scroll button */}
            <button
              type="button"
              onClick={() => scrollCategories("right")}
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm z-10 touch-manipulation"
              aria-label={t("web.a11y.scrollRight")}
            >
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Login Modal */}
      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode={loginModalMode}
      />

      {/* Enhanced Address Selection Dialog */}
      <EnhancedAddressDialog
        isOpen={isAddressDialogOpen}
        onClose={() => setIsAddressDialogOpen(false)}
        onAddressSelect={handleAddressSelect}
      />
    </header>
  );
};

export default BeautonomiHeader;
