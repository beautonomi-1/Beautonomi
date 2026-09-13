"use client";
import React, { useState, useEffect, useMemo } from "react";
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

import Hair from "./../../../public/images/hairstylist_6672954.svg";
import Nails from "./../../../public/images/nail-art.svg";
import Massage from "./../../../public/images/massage.svg";
import Eyebrows from "./../../../public/images/mascara.svg";
import Barbering from "./../../../public/images/barbershop.svg";
import { EssentialsButtons } from "@/app/category/components/amenties";
import Link from "next/link";
import Filter from "./../../../public/images/filters.svg";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { useRecentLocations, type RecentLocation } from "@/hooks/useRecentLocations";
import { useServiceAvailability } from "@/hooks/useServiceAvailability";
import { useUserLocation } from "@/hooks/useUserLocation";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";

const MS = "web.layout.mobileSearch";

interface LocationState {
  address: string;
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
}

const MobileSearchBar: React.FC = () => {
  const { t } = useTranslation();
  const categories = useMemo(
    () => [
      {
        name: t(`${MS}.categories.hairStyling`),
        icon: Hair,
        subcategories: [
          t(`${MS}.subcategories.haircut`),
          t(`${MS}.subcategories.hairColoring`),
          t(`${MS}.subcategories.hairExtensions`),
        ],
      },
      {
        name: t(`${MS}.categories.nails`),
        icon: Nails,
        subcategories: [
          t(`${MS}.subcategories.manicure`),
          t(`${MS}.subcategories.pedicure`),
          t(`${MS}.subcategories.nailArt`),
        ],
      },
      {
        name: t(`${MS}.categories.eyebrowsEyelashes`),
        icon: Eyebrows,
        subcategories: [
          t(`${MS}.subcategories.eyebrowThreading`),
          t(`${MS}.subcategories.eyelashExtensions`),
          t(`${MS}.subcategories.microblading`),
        ],
      },
      {
        name: t(`${MS}.categories.massage`),
        icon: Massage,
        subcategories: [
          t(`${MS}.subcategories.swedishMassage`),
          t(`${MS}.subcategories.deepTissueMassage`),
          t(`${MS}.subcategories.hotStoneMassage`),
        ],
      },
      {
        name: t(`${MS}.categories.barbering`),
        icon: Barbering,
        subcategories: [
          t(`${MS}.subcategories.mensHaircut`),
          t(`${MS}.subcategories.beardTrim`),
          t(`${MS}.subcategories.hotTowelShave`),
        ],
      },
    ],
    [t]
  );
  const timeSlotKeys = ["anyTimeSlot", "morning", "afternoon", "evening"] as const;
  const [treatment, setTreatment] = useState<string>("");
  const [locationState, setLocationState] = useState<LocationState | null>(null);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [timeSlotKey, setTimeSlotKey] = useState<(typeof timeSlotKeys)[number]>("anyTimeSlot");
  const [fromTime, setFromTime] = useState<string>("");
  const [toTime, setToTime] = useState<string>("");
  const [openSection, setOpenSection] = useState<string>("treatment");
  const [categorySearch, setCategorySearch] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState(["wifi", "kitchen"]);
  const [_isSideMenuOpen, setIsSideMenuOpen] = useState(false);

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

  const handleSearch = () => {
    console.log({
      treatment,
      location: locationState,
      date,
      timeSlot: t(`${MS}.${timeSlotKey}`),
      fromTime,
      toTime,
    });
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
      toast.error(t(`${MS}.toastGeolocationUnsupported`));
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
            toast.success(t(`${MS}.toastLocationUpdated`));
          } else {
            toast.error(t(`${MS}.toastAddressNotFound`));
          }
        } catch (error) {
          console.error("Error reverse geocoding:", error);
          toast.error(t(`${MS}.toastFailedGetAddress`));
        }
      },
      (error) => {
        console.error("Error getting location:", error);
        toast.error(t(`${MS}.toastLocationPermissionDenied`));
      }
    );
  };

  const homeLocation = recentLocations.find((loc) => loc.label === "Home");
  const workLocation = recentLocations.find((loc) => loc.label === "Work");
  const otherRecentLocations = recentLocations.filter(
    (loc) => loc.label !== "Home" && loc.label !== "Work"
  );

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
    const period = hours >= 12 ? t("time.pm") : t("time.am");
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
    (category?.name ?? "").toLowerCase().includes((categorySearch ?? "").toLowerCase())
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
          className="flex justify-between items-center w-full text-start"
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
                  ? t(`${MS}.fromTimeDisplay`, { time: formatTime(fromTime) })
                  : t(`${MS}.toTimeDisplay`, { time: formatTime(toTime) })}
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
                <span className="text-secondary text-[10px] sm:text-sm font-medium ps-4  py-1 sm:py-4">
                  {t(`${MS}.anywhere`)}
                </span>
                <div className="h-4 w-px bg-gray-300 mx-2" />
                <span className="text-secondary text-[10px] sm:text-sm font-medium py-1 sm:py-4 px-0 sm:px-3">
                  {t(`${MS}.anyTime`)}
                </span>
                <div className="h-4 w-px bg-gray-300 mx-2" />
                <span className="text-[#767A7C] text-[10px] sm:text-sm font-light py-1 sm:py-4 px-0 sm:px-3">
                  {t(`${MS}.addBooking`)}
                </span>
                <Link href="/search">
                  <Button className="w-7 sm:w-10 h-7 sm:h-10 bg-[#ff385c] hover:bg-[#DC0E63] text-white p-2 mt-1 sm:mt-auto me-2 rounded-full">
                    <Search className="text-white w-6 h-6" />
                  </Button>
                </Link>
              </div>
            </SheetTrigger>
            <SheetContent side="top" className="overflow-y-auto max-h-[80vh] bg-white">
              <SheetHeader>
                <SheetTitle>{t(`${MS}.searchOptions`)}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                {renderSection(
                  t(`${MS}.topCategories`),
                  <>
                    <Input
                      placeholder={t("web.layout.searchCategoriesPlaceholder")}
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
                            {t(`${MS}.backToCategories`)}
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
                  t(`${MS}.location`),
                  <>
                    <AddressAutocomplete
                      onChange={handleAddressSelect}
                      placeholder={t("web.layout.searchAddressPlaceholder")}
                      className="w-full"
                    />
                    
                    {/* Service Availability Indicator */}
                    {locationState && (
                      <div className="mt-3 px-3 py-2 rounded-lg border bg-gray-50">
                        {availability.isLoading ? (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{t(`${MS}.checkingAvailability`)}</span>
                          </div>
                        ) : availability.in_zone ? (
                          <div className="flex items-center gap-2 text-sm text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{t(`${MS}.servicesAvailable`)}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-amber-600">
                            <AlertCircle className="h-4 w-4" />
                            <span>{t(`${MS}.limitedAvailability`)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Quick Shortcuts */}
                    {(homeLocation || workLocation) && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          {t(`${MS}.quickAccess`)}
                        </div>
                        <div className="space-y-2">
                          {homeLocation && (
                            <button
                              onClick={() => handleSelectRecentLocation(homeLocation)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-start border border-gray-200"
                            >
                              <Home className="h-4 w-4 text-[#FF0077]" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">{t(`${MS}.home`)}</div>
                                <div className="text-xs text-gray-500 truncate">{homeLocation.address}</div>
                              </div>
                            </button>
                          )}
                          {workLocation && (
                            <button
                              onClick={() => handleSelectRecentLocation(workLocation)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-start border border-gray-200"
                            >
                              <Briefcase className="h-4 w-4 text-[#FF0077]" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">{t(`${MS}.work`)}</div>
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
                          {t(`${MS}.recentLocations`)}
                        </div>
                        <div className="space-y-2">
                          {otherRecentLocations.slice(0, 3).map((loc) => (
                            <button
                              key={loc.id}
                              onClick={() => handleSelectRecentLocation(loc)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-start border border-gray-200"
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
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-start border border-gray-200"
                      >
                        <MapPin className="h-4 w-4 text-[#FF0077]" />
                        <span className="text-sm text-gray-900">{t(`${MS}.useCurrentLocation`)}</span>
                      </button>
                    </div>
                  </>,
                  "location"
                )}

                {renderSection(
                  t(`${MS}.date`),
                  <>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-start font-light rounded-full py-3 ps-4 hover:bg-gray-100"
                      onClick={() => setOpenSection("date")}
                    >
                      <Calendar className="me-2 h-4 w-4 text-secondary" />
                      <span className="text-destructive font-light ms-4">
                        {date ? format(date, "PPP") : t(`${MS}.anyDate`)}
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
                  t(`${MS}.time`),
                  <>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {timeSlotKeys.map((slotKey) => (
                        <Button
                          key={slotKey}
                          variant="outline"
                          size="sm"
                          className="px-3 font-light"
                          onClick={() => {
                            setTimeSlotKey(slotKey);
                            setFromTime("");
                            setToTime("");
                            setOpenSection("");
                          }}
                        >
                          {t(`${MS}.${slotKey}`)}
                        </Button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={fromTime}
                        onValueChange={handleFromTimeChange}
                      >
                        <SelectTrigger className="font-light">
                          <SelectValue placeholder={t(`${MS}.fromPlaceholder`)} />
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
                          <SelectValue placeholder={t(`${MS}.toPlaceholder`)}>
                            {toTime ? formatTime(toTime) : t(`${MS}.selectToTime`)}
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
                      setTimeSlotKey("anyTimeSlot");
                      setFromTime("");
                      setToTime("");
                      setOpenSection("treatment");
                      setSelectedCategory("");
                      setSelectedSubcategory("");
                      setCategorySearch("");
                    }}
                  >
                    {t(`${MS}.clearAll`)}
                  </Button>
                  <Link href="/search">
                    <Button onClick={handleSearch} variant="secondary">
                      <Search className="me-2 h-4 w-4" />
                      {t(`${MS}.search`)}
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
              alt={t(`${MS}.filtersAlt`)}
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
    </div>
  );
};

export default MobileSearchBar;
