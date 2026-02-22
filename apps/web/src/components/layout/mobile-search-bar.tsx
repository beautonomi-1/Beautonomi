"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  Search,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronUp,
  Home,
  Briefcase,
  History,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { format } from "date-fns";

import Hair from "./../../.././public/images/hair-cut.png";
import Nails from "./../../../public/images/care.png";
import Massage from "./../../../public/images/massage.png";
import Eyebrows from "./../../../public/images/hair-removal.png";
import Barbering from "./../../../public/images/barbershop.png";
import { EssentialsButtons } from "@/app/category/components/amenties";
import Link from "next/link";
import LanguageModal from "../global/langauges-modal";
import Filter from "./../../../public/images/filters.svg";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { useRecentLocations, type RecentLocation } from "@/hooks/useRecentLocations";
import { useServiceAvailability } from "@/hooks/useServiceAvailability";
import { useUserLocation } from "@/hooks/useUserLocation";
import { toast } from "sonner";
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

interface LocationState {
  address: string;
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
}

const MobileSearchBar: React.FC = () => {
  const [treatment, setTreatment] = useState<string>("");
  const [locationState, setLocationState] = useState<LocationState | null>(null);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [timeSlot, setTimeSlot] = useState<string>("Any time");
  const [fromTime, setFromTime] = useState<string>("");
  const [toTime, setToTime] = useState<string>("");
  const [openSection, setOpenSection] = useState<string>("treatment");
  const [categorySearch, setCategorySearch] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState(["wifi", "kitchen"]);
  const [_isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

  const { location: userLocation } = useUserLocation();
  const { recentLocations, addLocation } = useRecentLocations();
  const { availability, checkAvailability } = useServiceAvailability();

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
    }
  }, [locationState, checkAvailability]);

  const _handleOpenLanguageModal = () => {
    setIsLanguageModalOpen(true);
    setIsSideMenuOpen(false);
  };

  const handleSearch = () => {
    console.log({ treatment, location: locationState, date, timeSlot, fromTime, toTime });
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

    // Save to localStorage and dispatch event
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

    setOpenSection("");
  };

  const handleSelectRecentLocation = (recentLoc: RecentLocation) => {
    setLocationState({
      address: recentLoc.address,
      latitude: recentLoc.latitude,
      longitude: recentLoc.longitude,
      city: recentLoc.city,
      country: recentLoc.country,
    });

    const locationData = {
      latitude: recentLoc.latitude,
      longitude: recentLoc.longitude,
      address: recentLoc.address,
    };
    localStorage.setItem("userLocation", JSON.stringify(locationData));
    window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));

    setOpenSection("");
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

  const homeLocation = recentLocations.find((loc) => loc.label === "Home");
  const workLocation = recentLocations.find((loc) => loc.label === "Work");
  const otherRecentLocations = recentLocations.filter(
    (loc) => loc.label !== "Home" && loc.label !== "Work"
  );

  const timeSlots = ["Any time", "Morning", "Afternoon", "Evening"];

  const sections = ["treatment", "location", "date", "time"];

  const toggleSection = (section: string) => {
    if (openSection === section) {
      const currentIndex = sections.indexOf(section);
      const nextSection = sections[currentIndex + 1];
      if (
        nextSection &&
        sections.indexOf(nextSection) <= sections.indexOf("time")
      ) {
        setOpenSection(nextSection);
      } else {
        setOpenSection("");
      }
    } else {
      setOpenSection(section);
    }
  };

  // Legacy function removed - location is now managed via locationState and handleAddressSelect

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSelectedSubcategory("");
    setCategorySearch("");
  };

  const handleSubcategorySelect = (subcategory: string) => {
    setSelectedSubcategory(subcategory);
    setTreatment(`${selectedCategory} - ${subcategory}`);
    setOpenSection("location");
  };

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes.toString().padStart(2, "0")} ${period}`;
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

  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  useEffect(() => {
    if (treatment && openSection === "treatment") {
      queueMicrotask(() => setOpenSection("location"));
    }
  }, [treatment, openSection]);

  const renderSection = (
    title: string,
    content: React.ReactNode,
    section: string
  ) => {
    const isOpen = openSection === section;

    return (
      <div className="border border-gray-200 p-4 rounded-xl">
        <button
          className="flex justify-between items-center w-full text-left"
          onClick={() => toggleSection(section)}
        >
          <h4 className="text-sm font-normal text-secondary">
            {section === "treatment" &&
            (selectedCategory || selectedSubcategory) ? (
              <span>
                {selectedCategory}
                {selectedSubcategory && (
                  <span className="text-destructive">
                    {" "}
                    - {selectedSubcategory}
                  </span>
                )}
              </span>
            ) : section === "date" && date ? (
              <span>{format(date, "PPP")}</span>
            ) : section === "time" && (fromTime || toTime) ? (
              <span>
                {fromTime && toTime
                  ? `${formatTime(fromTime)} - ${formatTime(toTime)}`
                  : fromTime
                  ? `From ${formatTime(fromTime)}`
                  : `To ${formatTime(toTime)}`}
              </span>
            ) : section === "location" && locationState?.address && !isOpen ? (
              <span>{locationState.address}</span>
            ) : (
              title
            )}
          </h4>
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {isOpen && <div className="mt-2">{content}</div>}
      </div>
    );
  };

  function toggleOption(option: string): void {
    setSelectedOptions((prev: string[]) =>
      prev.includes(option)
        ? prev.filter((item: string) => item !== option)
        : [...prev, option]
    );
  }

  return (
    <div className="px-6 pt-3">
      <div className="flex items-center gap-3 pb-2 pt-0">
        <div className="w-full">
          <Sheet>
            <SheetTrigger asChild>
              <div className="bg-white transition-all hover:shadow-lg cursor-pointer rounded-full searchShadow border border-[#DDDDDD] flex items-center justify-between">
                <span className="text-secondary text-[10px] sm:text-sm font-medium pl-4  py-1 sm:py-4">
                  Anywhere
                </span>
                <div className="h-4 w-px bg-gray-300 mx-2" />
                <span className="text-secondary text-[10px] sm:text-sm font-medium py-1 sm:py-4 px-0 sm:px-3">
                  Any Time
                </span>
                <div className="h-4 w-px bg-gray-300 mx-2" />
                <span className="text-[#767A7C] text-[10px] sm:text-sm font-light py-1 sm:py-4 px-0 sm:px-3">
                  Add Booking
                </span>
                <Link href="/search">
                  <Button className="w-7 sm:w-10 h-7 sm:h-10 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-2 mt-1 sm:mt-auto mr-2 rounded-full">
                    <Search className="text-white w-6 h-6" />
                  </Button>
                </Link>
              </div>
            </SheetTrigger>
            <SheetContent side="top" className="overflow-y-auto max-h-[80vh] bg-white">
              <SheetHeader>
                <SheetTitle>Search Options</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                {renderSection(
                  "Top categories",
                  <>
                    <Input
                      placeholder="Search categories"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="mb-2"
                    />
                    <div className="grid grid-cols-1 gap-2 mt-2">
                      {selectedCategory ? (
                        <>
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-destructive"
                            onClick={() => setSelectedCategory("")}
                          >
                            ← Back to categories
                          </Button>
                          {categories
                            .find((cat) => cat.name === selectedCategory)
                            ?.subcategories.map((subcategory) => (
                              <div
                                key={subcategory}
                                className="flex items-center gap-4 rounded-md px-2 py-2 hover:bg-gray-100 cursor-pointer"
                                onClick={() =>
                                  handleSubcategorySelect(subcategory)
                                }
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
                            <span className="flex justify-center items-center rounded-xl border border-gray-300 w-10 h-10 bg-white">
                              <Image
                                src={category.icon}
                                alt={category.name}
                                width={24}
                                height={24}
                              />
                            </span>
                            <span className="text-sm font-light">
                              {category.name}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </>,
                  "treatment"
                )}

                {renderSection(
                  "Location",
                  <>
                    <AddressAutocomplete
                      onChange={handleAddressSelect}
                      placeholder="Search for an address..."
                      className="w-full"
                    />
                    
                    {/* Service Availability Indicator */}
                    {locationState && (
                      <div className="mt-3 px-3 py-2 rounded-lg border bg-gray-50">
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

                    {/* Quick Shortcuts */}
                    {(homeLocation || workLocation) && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Quick Access
                        </div>
                        <div className="space-y-2">
                          {homeLocation && (
                            <button
                              onClick={() => handleSelectRecentLocation(homeLocation)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left border border-gray-200"
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
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left border border-gray-200"
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
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Recent Locations
                        </div>
                        <div className="space-y-2">
                          {otherRecentLocations.slice(0, 3).map((loc) => (
                            <button
                              key={loc.id}
                              onClick={() => handleSelectRecentLocation(loc)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left border border-gray-200"
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
                    <div className="mt-3 border-t pt-3">
                      <button
                        onClick={handleGetCurrentLocation}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left border border-gray-200"
                      >
                        <MapPin className="h-4 w-4 text-[#FF0077]" />
                        <span className="text-sm text-gray-900">Use current location</span>
                      </button>
                    </div>
                  </>,
                  "location"
                )}

                {renderSection(
                  "Date",
                  <>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-light rounded-full py-3 pl-4 hover:bg-gray-100"
                      onClick={() => setOpenSection("date")}
                    >
                      <Calendar className="mr-2 h-4 w-4 text-secondary" />
                      <span className="text-destructive font-light ml-4">
                        {date ? format(date, "PPP") : "Any date"}
                      </span>
                    </Button>
                    <CalendarComponent
                      mode="single"
                      selected={date}
                      onSelect={(newDate) => {
                        setDate(newDate);
                        setOpenSection("time");
                      }}
                      initialFocus
                      className="mt-4"
                    />
                  </>,
                  "date"
                )}

                {renderSection(
                  "Time",
                  <>
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
                            setOpenSection("");
                          }}
                        >
                          {slot}
                        </Button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={fromTime}
                        onValueChange={handleFromTimeChange}
                      >
                        <SelectTrigger className="font-light">
                          <SelectValue placeholder="From" />
                        </SelectTrigger>
                        <SelectContent className="bg-white font-light">
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem
                              key={i}
                              value={`${i.toString().padStart(2, "0")}:00`}
                            >
                              {formatTime(
                                `${i.toString().padStart(2, "0")}:00`
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={toTime}
                        onValueChange={(value) => {
                          setToTime(value);
                          setOpenSection("");
                        }}
                      >
                        <SelectTrigger className="font-light">
                          <SelectValue placeholder="To">
                            {toTime ? formatTime(toTime) : "Select To Time"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="font-light bg-white">
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem
                              key={i}
                              value={`${i.toString().padStart(2, "0")}:00`}
                            >
                              {formatTime(
                                `${i.toString().padStart(2, "0")}:00`
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>,
                  "time"
                )}

                {/* Buttons Section */}
                <div className="flex justify-between items-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTreatment("");
                      setLocationState(null);
                      setDate(undefined);
                      setTimeSlot("Any time");
                      setFromTime("");
                      setToTime("");
                      setOpenSection("treatment");
                      setSelectedCategory("");
                      setSelectedSubcategory("");
                      setCategorySearch("");
                    }}
                  >
                    Clear all
                  </Button>
                  <Link href="/search">
                    <Button onClick={handleSearch} variant="secondary">
                      <Search className="mr-2 h-4 w-4" />
                      Search
                    </Button>
                  </Link>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div>
          <Button
            variant="outline"
            className="flex sm:hidden items-center justify-center h-8 sm:h-10 w-8 sm:w-10 p-0 rounded-full border-gray-300 hover:border-gray-400 transition-all duration-200 group"
            onClick={() => setIsModalOpen(true)}
          >
            <Image
              src={Filter}
              alt="Filters"
              className="h-4 sm:h-5 w-4 sm:w-5 group-hover:scale-110 transition-transform duration-200"
            />
          </Button>

          <EssentialsButtons
            showMore={true}
            selectedOptions={selectedOptions}
            toggleOption={toggleOption}
            isOpen={isModalOpen}
            onOpenChange={setIsModalOpen}
          />
        </div>
      </div>
      <LanguageModal
        open={isLanguageModalOpen}
        onOpenChange={setIsLanguageModalOpen}
      />
    </div>
  );
};

export default MobileSearchBar;
