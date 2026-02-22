"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { MapPin, ChevronDown, ChevronLeft, ChevronRight, Search, Menu, User, Scissors, Sparkles, Wand2, Droplets, Palette, Ruler, ScanFace, Eye, Armchair, Home, Briefcase, History, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
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

// Icon mapping for dynamic resolution
const IconMap: Record<string, React.ReactNode> = {
  home: <Home className="w-6 h-6" />,
  all: <Wand2 className="w-6 h-6" />, // Magic wand sparkles for "All" category
  scissors: <Scissors className="w-6 h-6" />,
  sparkles: <Sparkles className="w-6 h-6" />,
  droplets: <Droplets className="w-6 h-6" />,
  palette: <Palette className="w-6 h-6" />,
  ruler: <Ruler className="w-6 h-6" />,
  scanface: <ScanFace className="w-6 h-6" />,
  eye: <Eye className="w-6 h-6" />,
  armchair: <Armchair className="w-6 h-6" />,
  hair: <Scissors className="w-6 h-6" />,
  makeup: <Palette className="w-6 h-6" />,
  nails: <Sparkles className="w-6 h-6" />, // Fallback
  facial: <ScanFace className="w-6 h-6" />,
  massage: <Armchair className="w-6 h-6" />,
};

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string; // Database returns string (name or emoji)
}

interface BeautonomiHeaderProps {
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
}

const BeautonomiHeader: React.FC<BeautonomiHeaderProps> = ({
  activeCategory,
  onCategoryChange,
}) => {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();
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
  const [selectedAddress, setSelectedAddress] = useState("Select address");
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
  const { addresses, isLoading: _addressesLoading, loadAddresses } = useSavedAddresses();
  const { recentLocations, addLocation } = useRecentLocations();
  const { availability, checkAvailability } = useServiceAvailability();
  const [categories, setCategories] = useState<Category[]>([
    // Initial fallback state while loading
    { id: "all", name: "All", slug: "all", icon: "all" },
  ]);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        console.log("Fetching categories from API...");
        const response = await fetcher.get<{ data: any[] }>("/api/public/categories/global?all=true");
        console.log("Categories API response:", response);
        
        if (response && response.data && Array.isArray(response.data) && response.data.length > 0) {
          const mappedCategories = response.data.map((cat: any) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            icon: cat.icon || "scissors" // Fallback icon if not provided
          }));
          
          console.log("Mapped categories:", mappedCategories);
          
          // Prepend "All" category if not present
          setCategories([
            { id: "all", name: "All", slug: "all", icon: "all" },
            ...mappedCategories
          ]);
        } else {
          console.warn("No categories returned from API or empty response:", response);
          // Keep the default "All" category
          setCategories([
            { id: "all", name: "All", slug: "all", icon: "all" }
          ]);
        }
      } catch (error) {
        console.error("Failed to load categories", error);
        // Keep fallback categories with just "All"
        setCategories([
          { id: "all", name: "All", slug: "all", icon: "all" }
        ]);
      }
    };

    if (isMounted) {
      fetchCategories();
    }
  }, [isMounted]);

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

  // Helper to render icon
  const renderCategoryIcon = (iconStr?: string) => {
    if (!iconStr) return <Wand2 className="w-6 h-6" />; // Default for "All" / missing icons
    
    // Check if it's a known Lucide icon name (lowercase)
    const lowerIcon = iconStr.toLowerCase();
    if (IconMap[lowerIcon]) {
      return IconMap[lowerIcon];
    }
    
    // Assume it's an emoji or other text
    return <span className="text-2xl leading-none">{iconStr}</span>;
  };

  useEffect(() => {
    setIsMounted(true);
    
    // Load saved location from localStorage
    if (typeof window !== "undefined") {
      const savedLocation = localStorage.getItem("userLocation");
      if (savedLocation) {
        try {
          const location = JSON.parse(savedLocation);
          setSelectedLocation(location);
          setSelectedAddress(location.address || "Select address");
        } catch (error) {
          console.error("Error parsing saved location:", error);
        }
      } else if (!hasTriedIPLocation) {
        // If no saved location and we haven't tried IP location yet, try to get location from IP
        setHasTriedIPLocation(true);
        fetchLocationFromIP();
      }
      
      // If user is logged in, try to load default address
      if (user && !savedLocation) {
        loadAddresses();
      }
    }
  }, [user, hasTriedIPLocation]);

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
        localStorage.setItem("userLocation", JSON.stringify({
          latitude: defaultAddress.latitude,
          longitude: defaultAddress.longitude,
          address: addressString
        }));
      }
    }
  }, [user, addresses, selectedLocation]);

  // Fetch location from IP address as fallback
  const fetchLocationFromIP = async () => {
    // Don't fetch if user already has a location selected
    if (selectedLocation) {
      return;
    }

    try {
      // Show a temporary address while fetching
      setSelectedAddress("Detecting location...");

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
          setSelectedAddress("Select address");
          return; // Exit early, user can select location manually
        }
        // For other errors, also show default
        setSelectedAddress("Select address");
        return;
      }

      // Check for error in response (including reserved IP errors)
      if (response.error) {
        // If it's a reserved IP error or geolocation error, just show default
        // This is common in development environments
        if (response.error.code === "RESERVED_IP" || response.error.code === "GEOLOCATION_ERROR" || response.error.code === "IP_NOT_FOUND") {
          console.log("IP geolocation not available (likely in development):", response.error.message);
          setSelectedAddress("Select address");
          return; // Exit early, user can select location manually
        }
        // For other errors, also show default
        setSelectedAddress("Select address");
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
          : ipLocation.country || ipLocation.city || "Current location";

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
          localStorage.setItem("userLocation", JSON.stringify(locationData));
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
                localStorage.setItem("userLocation", JSON.stringify(locationData));
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
          setSelectedAddress("Select address");
        }
      } else {
        // If IP geolocation fails, show default
        setSelectedAddress("Select address");
      }
    } catch (error) {
      console.error("Error fetching location from IP:", error);
      // On error, show default
      setSelectedAddress("Select address");
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
      // If "all", go to home page, otherwise filter by category
      if (slug === "all") {
        window.location.href = `/`;
      } else {
        window.location.href = `/?category=${encodeURIComponent(slug)}`;
      }
    }
  };

  // Get current location using geolocation API
  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setIsGettingLocation(true);
    setIsAddressMenuOpenDesktop(false);
    setIsAddressMenuOpenMobile(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Reverse geocode to get address - Mapbox uses "longitude,latitude" format
          const response = await fetcher.post<{ data: any[] }>("/api/mapbox/geocode", {
            query: `${longitude},${latitude}`,
            limit: 1
          });

          if (response.data && response.data.length > 0) {
            const address = response.data[0].place_name;
            setSelectedAddress(address);
            setSelectedLocation({ latitude, longitude, address });
            
            // Save to localStorage
            const locationData = {
              latitude,
              longitude,
              address
            };
            localStorage.setItem("userLocation", JSON.stringify(locationData));
            
            // Dispatch custom event for immediate updates in same tab
            window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));

            toast.success("Location updated");
          } else {
            // Fallback to coordinates if reverse geocoding fails
            const address = `Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
            setSelectedAddress("Current location");
            setSelectedLocation({ latitude, longitude, address });
            localStorage.setItem("userLocation", JSON.stringify({
              latitude,
              longitude,
              address
            }));
            toast.success("Location updated");
          }
        } catch (error) {
          console.error("Error reverse geocoding:", error);
          // Fallback to coordinates if reverse geocoding fails
          const address = `Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
          setSelectedAddress("Current location");
          setSelectedLocation({ latitude, longitude, address });
          localStorage.setItem("userLocation", JSON.stringify({
            latitude,
            longitude,
            address
          }));
          toast.success("Location updated");
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        console.error("Error getting location:", error);
        toast.error("Unable to get your location. Please enable location permissions.");
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
    localStorage.setItem("userLocation", JSON.stringify(locationData));
    
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
    toast.success("Location updated");
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
      localStorage.setItem("userLocation", JSON.stringify(locationData));
      
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
      toast.success("Location updated");
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
    localStorage.setItem("userLocation", JSON.stringify(locationData));
    window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));

    checkAvailability(recentLoc.latitude, recentLoc.longitude);

    setIsAddressMenuOpenDesktop(false);
    setIsAddressMenuOpenMobile(false);
    toast.success("Location updated");
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
    <header className="relative bg-white border-b shadow-sm sticky top-0 z-50">
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
                  className="w-full max-w-md bg-[#FF007F] hover:bg-[#E6006F] text-white rounded-full px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-center gap-2 font-medium transition-colors shadow-sm"
                >
                  <MapPin className="h-4 w-4 md:h-5 md:w-5 text-white flex-shrink-0" />
                  <span className="text-sm md:text-base truncate flex-1 text-center">{selectedAddress}</span>
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
                        <span>Checking availability...</span>
                      </div>
                    ) : availability.in_zone ? (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Services available</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-amber-600">
                        <AlertCircle className="h-4 w-4" />
                        <span>Limited availability</span>
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
                      {isGettingLocation ? "Getting location..." : "Current location"}
                    </span>
                  </div>
                </DropdownMenuItem>

                {/* Quick Shortcuts (Home/Work) */}
                {(recentLocations.find(loc => loc.label === "Home") || recentLocations.find(loc => loc.label === "Work")) && (
                  <>
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Quick Access
                    </div>
                    {recentLocations.find(loc => loc.label === "Home") && (
                      <DropdownMenuItem 
                        onClick={() => handleSelectRecentLocation(recentLocations.find(loc => loc.label === "Home")!)}
                        className="cursor-pointer py-3 px-4 rounded-lg hover:bg-[#FF007F]/10 focus:bg-[#FF007F]/10 transition-colors"
                      >
                        <div className="flex items-start gap-2 w-full">
                          <Home className="h-4 w-4 text-[#FF007F] mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">Home</p>
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
                            <p className="text-sm font-medium text-gray-900">Work</p>
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
                      Recent Locations
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
                      Saved Addresses
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
                  Options
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
                    <span className="text-base text-gray-900">Select address</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Header Bar */}
      <div className="max-w-[2340px] mx-auto px-4 md:px-6 lg:px-20 relative">
        <div className="flex items-center justify-between py-2 md:py-4 relative">
          {/* Left: Logo (desktop) / Nothing (mobile - nav is centered) */}
          <div className="flex items-center min-w-0 md:min-w-[140px]">
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <PlatformLogo alt="BEAUTONOMI Logo" className="h-6 md:h-10 w-auto" />
            </Link>
          </div>

          {/* Center: Home | Explore nav (desktop + mobile, centered) */}
          <nav className="flex items-center gap-1 absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
            <Link
              href="/"
              className={`relative flex flex-col items-center gap-0.5 px-3 py-2 md:px-5 md:gap-1 rounded-lg transition-colors min-w-[56px] md:min-w-[72px] ${
                isHomePage
                  ? "text-[#FF007F] font-bold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <HomeNavIcon active={isHomePage} size={24} />
              <span className="text-[10px] md:text-xs font-medium">Home</span>
              {isHomePage && (
                <div className="absolute bottom-0 left-1 right-1 md:left-2 md:right-2 h-1 bg-[#FF007F] rounded-full" aria-hidden />
              )}
            </Link>
            <Link
              href="/explore"
              className={`relative flex flex-col items-center gap-0.5 px-3 py-2 md:px-5 md:gap-1 rounded-lg transition-colors min-w-[56px] md:min-w-[72px] ${
                isExplorePage
                  ? "text-[#FF007F] font-bold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <ExploreNavIcon active={isExplorePage} size={24} />
              <span className="flex items-center gap-1 text-[10px] md:text-xs font-medium">
                Explore
                <span className="px-1 py-0.5 text-[8px] md:text-[9px] font-bold uppercase bg-[#FF007F] text-white rounded leading-none">
                  New
                </span>
              </span>
              {isExplorePage && (
                <div className="absolute bottom-0 left-1 right-1 md:left-2 md:right-2 h-1 bg-[#FF007F] rounded-full" aria-hidden />
              )}
            </Link>
          </nav>

          {/* Right: Search Icon + Become a partner + User Menu */}
          <div className="flex items-center justify-end gap-2 md:gap-4 min-w-0 md:min-w-[140px]">
            {/* Search Icon Toggle */}
            <button
              ref={searchToggleRef}
              type="button"
              onClick={toggleSearch}
              className="p-1.5 md:p-2 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Toggle search"
            >
              <Search className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
            </button>

            {/* Become a partner link (Desktop) */}
            <Link
              href="/become-a-partner"
              className="hidden md:block text-sm md:text-base font-normal text-gray-700 hover:text-[#FF007F] transition-colors"
            >
              Become a partner
            </Link>

            {/* User Menu */}
            {isMounted ? (
              !user && !authLoading ? (
                // Unauthenticated: Show hamburger menu
                <Sheet open={isUserMenuOpen} onOpenChange={setIsUserMenuOpen}>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      aria-label="Open menu"
                      className="p-1.5 md:p-2 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <Menu className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:w-[400px] max-w-[95vw] overflow-y-auto p-0 gap-0 bg-white">
                    <SheetHeader className="p-6 pb-2 border-b border-gray-100">
                      <SheetTitle className="text-left text-xl font-bold text-gray-900">
                        Log in or sign up
                      </SheetTitle>
                      <SheetDescription className="text-left text-sm text-gray-600">
                        Access your account to save addresses and manage bookings
                      </SheetDescription>
                    </SheetHeader>
                    <div className="flex flex-col p-2">
                      <div className="flex gap-2 px-4 py-2 border-b border-gray-100 md:hidden">
                        <Link
                          href="/"
                          className={`flex-1 py-2 text-center text-sm font-medium rounded-lg ${
                            isHomePage ? "bg-[#FF007F]/10 text-[#FF007F]" : "text-gray-600 hover:bg-gray-50"
                          }`}
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          Home
                        </Link>
                        <Link
                          href="/explore"
                          className={`flex-1 py-2 text-center text-sm font-medium rounded-lg ${
                            isExplorePage ? "bg-[#FF007F]/10 text-[#FF007F]" : "text-gray-600 hover:bg-gray-50"
                          }`}
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          Explore
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
                        Log in
                      </Button>
                      <Button
                        variant="secondary"
                        className="w-full justify-start text-base font-medium h-14 px-4 bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#D60565] hover:to-[#FF0077] text-white rounded-xl"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          router.push("/signup?type=customer");
                        }}
                      >
                        Sign up
                      </Button>
                      <div className="h-px bg-gray-100 my-2 mx-4" />
                      <Link 
                        href="/become-a-partner"
                        className="flex items-center w-full justify-start text-base font-normal h-14 px-4 hover:bg-gray-50 rounded-xl text-gray-700"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        Become a partner
                      </Link>
                      <Link 
                        href="/help"
                        className="flex items-center w-full justify-start text-base font-normal h-14 px-4 hover:bg-gray-50 rounded-xl text-gray-700"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        Help Centre
                      </Link>
                    </div>
                  </SheetContent>
                </Sheet>
              ) : (
                // Authenticated: Show profile dropdown
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="User menu"
                      className="p-1.5 md:p-2 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <User className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white border-gray-200">
                    <div className="px-4 py-2 border-b border-gray-200">
                      <p className="text-sm font-medium text-gray-900">
                        {user?.full_name || "User"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <DropdownMenuItem asChild>
                      <Link
                        href="/profile"
                        className="cursor-pointer"
                      >
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        href="/account-settings"
                        className="cursor-pointer"
                      >
                        Account Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={async () => {
                        await signOut();
                        router.push("/");
                      }}
                      className="cursor-pointer text-red-600 focus:text-red-600"
                    >
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            ) : (
              <div className="p-1.5 md:p-2 rounded-full">
                <Menu className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Section - Toggle to expand */}
      <div 
        ref={searchContainerRef}
        className={`max-w-[2340px] mx-auto px-4 md:px-6 lg:px-20 transition-all duration-300 ease-in-out overflow-visible ${
          isSearchOpen ? "max-h-96 opacity-100 pb-4 pt-2 border-t border-gray-100" : "max-h-0 opacity-0 overflow-hidden"
        }`}
      >
        <form onSubmit={handleSearch} className="relative z-50">
          <input
            type="text"
            placeholder="Search for providers..."
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
            className="w-full rounded-full border border-gray-200 px-4 md:px-6 py-2.5 md:py-3.5 pl-8 pr-12 md:pr-16 text-base md:text-base shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-[#FF007F] focus:border-transparent placeholder:text-gray-400"
          />
          <button
            type="submit"
            className="absolute right-1.5 md:right-2 top-1/2 -translate-y-1/2 bg-[#FF007F] hover:bg-[#E6006F] text-white rounded-full p-2 md:p-2.5 transition-all hover:scale-105 active:scale-95"
            aria-label="Search"
          >
            <Search className="h-4 w-4 md:h-5 md:w-5" />
          </button>

          {/* Autocomplete Suggestions */}
          {isSearchOpen && searchQuery.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 max-h-96 overflow-y-auto">
              {isLoadingSuggestions ? (
                <div className="px-6 py-4 text-sm text-gray-500 text-center">
                  Searching...
                </div>
              ) : suggestions.length > 0 ? (
                <>
                  {suggestions.map((suggestion, index) => (
                    <Link
                      key={`${suggestion.type}-${suggestion.id}-${index}`}
                      href={suggestion.url}
                      className={`w-full text-left px-6 py-3 text-sm text-gray-700 flex items-center gap-3 transition-colors ${
                        index === selectedSuggestionIndex 
                          ? 'bg-[#FF007F]/10 border-l-2 border-[#FF007F]' 
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
                            Provider
                          </div>
                        )}
                        {suggestion.type === 'category' && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            Category
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </>
              ) : (
                <div className="px-6 py-4 text-sm text-gray-500 text-center">
                  No suggestions found
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Category Navigation - Home page only */}
      {isHomePage && (
      <div className="border-t bg-white">
        <div className="max-w-[2340px] mx-auto px-4 md:px-6 lg:px-20">
          <div className="relative flex items-center gap-2">
            {/* Left scroll button */}
            <button
              onClick={() => scrollCategories("left")}
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm z-10"
              aria-label="Scroll left"
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
                    onClick={() => handleCategoryClick(category.slug)}
                    className={`relative flex flex-col items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-3 whitespace-nowrap transition-colors ${
                      isActive
                        ? "text-[#FF007F] font-semibold"
                        : "text-gray-600 font-normal hover:text-gray-900"
                    }`}
                  >
                    <span className="text-gray-600 group-hover:text-[#FF007F] transition-colors flex items-center justify-center h-6">
                      {renderCategoryIcon(category.icon)}
                    </span>
                    <span className="text-[10px] md:text-sm font-medium">{category.name}</span>
                    {isActive && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-0.5 bg-[#FF007F] rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right scroll button */}
            <button
              onClick={() => scrollCategories("right")}
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm z-10"
              aria-label="Scroll right"
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
