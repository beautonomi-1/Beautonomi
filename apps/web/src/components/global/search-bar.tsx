import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Search, MapPin, Calendar, Clock, Home, Briefcase, History, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import Link from "next/link";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { useRecentLocations, type RecentLocation } from "@/hooks/useRecentLocations";
import { useServiceAvailability } from "@/hooks/useServiceAvailability";
import { useUserLocation } from "@/hooks/useUserLocation";
import { toast } from "sonner";

import Hair from "./../../.././public/images/hair-cut.png";
import Nails from "./../../../public/images/care.png";
import Massage from "./../../../public/images/massage.png";
import Eyebrows from "./../../../public/images/hair-removal.png";
import Barbering from "./../../../public/images/barbershop.png";

const categories = [
  {
    name: "Hair & styling",
    icon: Hair,
    subcategories: ["Haircut", "Hair coloring", "Hair extensions"],
  },
  {
    name: "Nails",
    icon: Nails,
    subcategories: ["Manicure", "Pedicure", "Nail art"],
  },
  {
    name: "Eyebrows & eyelashes",
    icon: Eyebrows,
    subcategories: ["Eyebrow threading", "Eyelash extensions", "Microblading"],
  },
  {
    name: "Massage",
    icon: Massage,
    subcategories: [
      "Swedish massage",
      "Deep tissue massage",
      "Hot stone massage",
    ],
  },
  {
    name: "Barbering",
    icon: Barbering,
    subcategories: ["Men's haircut", "Beard trim", "Hot towel shave"],
  },
];

const timeSlots = ["Any time", "Morning", "Afternoon", "Evening"];

interface SearchBarProps {
  searchQuery: string;
  onSearchSubmit: (query: string) => void;
}

interface LocationState {
  address: string;
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchSubmit,
}) => {
  const [inputValue, _setInputValue] = useState(searchQuery);
  const [treatment, setTreatment] = useState("");
  const [locationState, setLocationState] = useState<LocationState | null>(null);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [timeSlot, setTimeSlot] = useState("Any time");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [_showLocationLabelDialog, setShowLocationLabelDialog] = useState(false);
  const [_locationToLabel, setLocationToLabel] = useState<RecentLocation | null>(null);
  const [_newLabel, setNewLabel] = useState("");

  // New state to control popover visibility
  const [isServicePopoverOpen, setIsServicePopoverOpen] = useState(false);
  const [isLocationPopoverOpen, setIsLocationPopoverOpen] = useState(false);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const [isTimePopoverOpen, setIsTimePopoverOpen] = useState(false);

  const searchBarRef = useRef<HTMLDivElement>(null);
  const { location: userLocation } = useUserLocation();
  const { recentLocations, addLocation, updateLocationLabel } = useRecentLocations();
  const { availability, checkAvailability, reset: resetAvailability } = useServiceAvailability();

  // Sync with header location
  useEffect(() => {
    if (userLocation) {
      queueMicrotask(() =>
        setLocationState({
          address: userLocation.address,
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        })
      );
    }
  }, [userLocation]);

  // Check service availability when location changes
  useEffect(() => {
    if (locationState?.latitude && locationState?.longitude) {
      checkAvailability(locationState.latitude, locationState.longitude);
    } else {
      resetAvailability();
    }
  }, [locationState, checkAvailability, resetAvailability]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 0) {
        setIsServicePopoverOpen(false);
        setIsLocationPopoverOpen(false);
        setIsDatePopoverOpen(false);
        setIsTimePopoverOpen(false);
      }
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (selectedCategory && selectedSubcategory) {
        setTreatment(`${selectedCategory} - ${selectedSubcategory}`);
      } else if (selectedCategory) {
        setTreatment(selectedCategory);
      }
    });
  }, [selectedCategory, selectedSubcategory]);

  const handleSearch = () => {
    console.log({ treatment, location: locationState, date, timeSlot, fromTime, toTime });
    onSearchSubmit(inputValue);
  };

  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSelectedSubcategory("");
    setCategorySearch("");
  };

  const handleSubcategorySelect = (subcategory: string) => {
    setSelectedSubcategory(subcategory);
    setTreatment(`${selectedCategory} - ${subcategory}`);
    setIsServicePopoverOpen(false);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  const handleFromTimeChange = (selectedTime: string) => {
    setFromTime(selectedTime);

    const [hour, minutes] = selectedTime.split(":").map(Number);
    const newToHour = (hour + 2) % 24;
    const formattedNewToTime = `${newToHour
      .toString()
      .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

    setToTime(formattedNewToTime);
  };

  const truncateLocation = (loc: string) => {
    return loc.length > 20 ? loc.substring(0, 20) + "..." : loc;
  };

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
    const addressString = address.place_name || `${address.address_line1}, ${address.city}, ${address.country}`;
    
    setLocationState({
      address: addressString,
      latitude: address.latitude,
      longitude: address.longitude,
      city: address.city,
      country: address.country,
    });

    // Save to localStorage and dispatch event (sync with header)
    const locationData = {
      latitude: address.latitude,
      longitude: address.longitude,
      address: addressString,
    };
    localStorage.setItem("userLocation", JSON.stringify(locationData));
    window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));

    // Add to recent locations
    addLocation({
      address: addressString,
      latitude: address.latitude,
      longitude: address.longitude,
      city: address.city,
      country: address.country,
    });

    setIsLocationPopoverOpen(false);
    setLocationSearchQuery("");
  };

  const handleSelectRecentLocation = (recentLoc: RecentLocation) => {
    setLocationState({
      address: recentLoc.address,
      latitude: recentLoc.latitude,
      longitude: recentLoc.longitude,
      city: recentLoc.city,
      country: recentLoc.country,
    });

    // Save to localStorage and dispatch event
    const locationData = {
      latitude: recentLoc.latitude,
      longitude: recentLoc.longitude,
      address: recentLoc.address,
    };
    localStorage.setItem("userLocation", JSON.stringify(locationData));
    window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));

    setIsLocationPopoverOpen(false);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          const response = await fetch("/api/mapbox/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `${longitude},${latitude}`,
              limit: 1,
            }),
          });

          const data = await response.json();
          if (data.data && data.data.length > 0) {
            const address = data.data[0].place_name;
            handleAddressSelect({
              address_line1: address.split(",")[0] || address,
              city: data.data[0].context?.find((c: any) => c.id.startsWith("place."))?.text || "",
              country: data.data[0].context?.find((c: any) => c.id.startsWith("country."))?.text || "",
              latitude,
              longitude,
              place_name: address,
            });
            toast.success("Location updated");
          } else {
            toast.error("Could not find address for this location");
          }
        } catch (error) {
          console.error("Error reverse geocoding:", error);
          toast.error("Failed to get address");
        }
      },
      (error) => {
        console.error("Error getting location:", error);
        toast.error("Unable to get your location. Please enable location permissions.");
      }
    );
  };

  const _handleSetLocationLabel = (loc: RecentLocation, label: string) => {
    updateLocationLabel(loc.id, label);
    setShowLocationLabelDialog(false);
    setLocationToLabel(null);
    setNewLabel("");
    toast.success(`Location saved as "${label}"`);
  };

  const homeLocation = recentLocations.find((loc) => loc.label === "Home");
  const workLocation = recentLocations.find((loc) => loc.label === "Work");
  const otherRecentLocations = recentLocations.filter(
    (loc) => loc.label !== "Home" && loc.label !== "Work"
  );

  return (
    <div ref={searchBarRef} className="flex relative flex-col sm:flex-row items-center bg-white rounded-full searchShadow border border-[#DDDDDD]">
      <Popover open={isServicePopoverOpen} onOpenChange={setIsServicePopoverOpen}>
        <PopoverTrigger
          asChild
          className="border border-transparent hover:bg-[#F2F2F2] pl-4 rounded-l-full py-3 rounded-full ml-1 w-1/4"
        >
          <Button
            variant="outline"
            className="w-full justify-start text-left font-light flex flex-col items-start"
          >
            <label
              htmlFor="service-needed"
              className="text-xs text-muted font-bold ml-7"
            >
              Service needed?
            </label>
            <div className="flex items-center w-32">
              <Search
                className="h-4 w-4 text-[#161616] mr-3"
                aria-hidden="true"
              />
              <span
                id="service-needed"
                className="text-[#767A7C] font-light truncate"
              >
                {treatment || "Any treatment or venue"}
              </span>
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] rounded-3xl mt-1 ml-10">
          <div className="space-y-4">
            <h4 className="font-normal">Top categories</h4>
            <Input
              placeholder="Search categories"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              className="mb-2"
            />
            <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto">
              {selectedCategory ? (
                <>
                  <button
                    className="justify-start flex text-destructive"
                    onClick={() => setSelectedCategory("")}
                  >
                    ← Back to categories
                  </button>
                  {categories
                    .find((cat) => cat.name === selectedCategory)
                    ?.subcategories.map((subcategory) => (
                      <div
                        key={subcategory}
                        className="flex items-center gap-4 rounded-md px-2 py-2 hover:bg-gray-100 cursor-pointer"
                        onClick={() => handleSubcategorySelect(subcategory)}
                      >
                        <span className="flex justify-center items-center rounded-sm border border-gray-300 w-10 h-10 bg-white">
                          <Image
                            src={
                              categories.find(
                                (cat) => cat.name === selectedCategory
                              )?.icon || ""
                            }
                            alt={subcategory}
                            width={24}
                            height={24}
                          />
                        </span>
                        <span className="text-sm font-light">
                          {subcategory}
                        </span>
                      </div>
                    ))}
                </>
              ) : (
                filteredCategories.map((category) => (
                  <div
                    key={category.name}
                    className="flex items-center gap-4 rounded-md px-2 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleCategorySelect(category.name)}
                  >
                    <span className="flex justify-center items-center rounded-sm border border-gray-300 w-10 h-10 bg-white">
                      <Image
                        src={category.icon}
                        alt={category.name}
                        width={24}
                        height={24}
                      />
                    </span>
                    <span className="text-sm font-light">{category.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className="w-2 h-6 bg-[#c8cacd]" />

      <Popover open={isLocationPopoverOpen} onOpenChange={setIsLocationPopoverOpen}>
        <PopoverTrigger
          asChild
          className="border border-transparent hover:bg-[#F2F2F2] pl-4 rounded-full w-1/4"
        >
          <Button
            variant="outline"
            className="w-full justify-start text-left font-light flex flex-col items-start"
          >
            <label
              htmlFor="service-needed"
              className="text-xs text-muted font-bold ml-7"
            >
              Where?
            </label>
            <div className="flex items-center w-full">
              <MapPin className="h-4 w-4 text-[#161616]" />
              <span className="text-[#767A7C] font-light ml-3 truncate">
                {locationState ? truncateLocation(locationState.address) : "Current location"}
              </span>
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 rounded-3xl max-h-[600px] overflow-y-auto">
          <div className="space-y-4">
            {/* Address Autocomplete */}
            <div>
              <AddressAutocomplete
                value={locationSearchQuery}
                onChange={handleAddressSelect}
                placeholder="Search for an address..."
                className="w-full"
              />
            </div>

            {/* Service Availability Indicator */}
            {locationState && (
              <div className="px-2 py-2 rounded-lg border">
                {availability.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Checking service availability...</span>
                  </div>
                ) : availability.in_zone ? (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Services available in your area</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>Limited service availability</span>
                  </div>
                )}
              </div>
            )}

            {/* Quick Shortcuts */}
            {(homeLocation || workLocation) && (
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Quick Access
                </div>
                <div className="space-y-1">
                  {homeLocation && (
                    <button
                      onClick={() => handleSelectRecentLocation(homeLocation)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
                    >
                      <Home className="h-4 w-4 text-[#FF0077]" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">Home</div>
                        <div className="text-xs text-gray-500 truncate">{homeLocation.address}</div>
                      </div>
                    </button>
                  )}
                  {workLocation && (
                    <button
                      onClick={() => handleSelectRecentLocation(workLocation)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
                    >
                      <Briefcase className="h-4 w-4 text-[#FF0077]" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">Work</div>
                        <div className="text-xs text-gray-500 truncate">{workLocation.address}</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Recent Locations */}
            {otherRecentLocations.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Recent Locations
                </div>
                <div className="space-y-1">
                  {otherRecentLocations.slice(0, 3).map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => handleSelectRecentLocation(loc)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
                    >
                      <History className="h-4 w-4 text-gray-400" />
                      <div className="flex-1 min-w-0">
                        {loc.label && (
                          <div className="text-sm font-medium text-gray-900">{loc.label}</div>
                        )}
                        <div className="text-xs text-gray-500 truncate">{loc.address}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Current Location Button */}
            <div className="border-t pt-2">
              <button
                onClick={handleGetCurrentLocation}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
              >
                <MapPin className="h-4 w-4 text-[#FF0077]" />
                <span className="text-sm text-gray-900">Use current location</span>
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className="w-2 h-6 bg-[#c8cacd]" />

      <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen}>
        <PopoverTrigger
          asChild
          className="border border-transparent hover:bg-[#F2F2F2] pl-4 rounded-full w-1/4"
        >
          <Button
            variant="outline"
            className="w-full justify-start text-left font-light flex flex-col items-start"
          >
            <label
              htmlFor="service-needed"
              className="text-xs text-muted font-bold ml-7"
            >
              When?
            </label>
            <div className="flex items-center w-full">
              <Calendar className="h-4 w-4 text-[#161616]" />
              <span className="text-[#767A7C] font-light ml-3">
                {date ? format(date, "d MMM yyyy") : "Any date"}
              </span>
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 rounded-3xl" align="start">
          <CalendarComponent
            mode="single"
            selected={date}
            onSelect={(newDate) => {
              setDate(newDate);
              setIsDatePopoverOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <div className="w-2 h-6 bg-[#c8cacd]" />

      <Popover open={isTimePopoverOpen} onOpenChange={setIsTimePopoverOpen}>
        <PopoverTrigger
          asChild
          className="border border-transparent hover:bg-[#F2F2F2] pl-4 pr-20  rounded-r-full py-[20px] rounded-full mr-1 my-1"
        >
          <Button
            variant="outline"
            className="w-full justify-start text-left font-light"
          >
            <Clock className="mr-2 h-4 w-4 text-[#161616]" />
            <span className="text-[#767A7C] font-light ml-4 truncate">
              {fromTime && toTime
                ? `${formatTime(fromTime)} - ${formatTime(toTime)}`
                : fromTime
                ? `From ${formatTime(fromTime)}`
                : toTime
                ? `To ${formatTime(toTime)}`
                : timeSlot}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] rounded-3xl mr-20 mt-1">
          <div className="flex flex-wrap gap-2 mb-4">
            {timeSlots.map((slot) => (
              <Button
                key={slot}
                variant="outline"
                size="sm"
                className="px-3 font-light"
                onClick={() => {
                  setTimeSlot(slot);
                  setFromTime("");
                  setToTime("");
                  setIsTimePopoverOpen(false);
                }}
              >
                {slot}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={fromTime} onValueChange={handleFromTimeChange}>
              <SelectTrigger className="font-light">
                <SelectValue placeholder="From" />
              </SelectTrigger>
              <SelectContent className="bg-white font-light text-left">
                {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                  <SelectItem
                    key={hour}
                    value={`${hour.toString().padStart(2, "0")}:00`}
                  >
                    {formatTime(`${hour.toString().padStart(2, "0")}:00`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={toTime} onValueChange={setToTime}>
              <SelectTrigger className="font-light">
                <SelectValue placeholder="To">
                  {toTime ? formatTime(toTime) : "Select To Time"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-white font-light text-left">
                {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                  <SelectItem
                    key={hour}
                    value={`${hour.toString().padStart(2, "0")}:00`}
                  >
                    {formatTime(`${hour.toString().padStart(2, "0")}:00`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>
      <div className="absolute right-2 top-[7px]">
        <Link href="/search">
          <Button
            className="w-12 h-12 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-3.5 rounded-full"
            onClick={handleSearch}
          >
            <Search className="text-white w-12 h-12" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default SearchBar;
