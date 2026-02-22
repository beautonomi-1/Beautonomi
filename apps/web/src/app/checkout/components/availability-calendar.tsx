"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import Slider from "react-slick";
import { ChevronLeft, ChevronRight, Clock, X, Loader2 } from "lucide-react";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { fetcher } from "@/lib/http/fetcher";

interface TimeSlot {
  id: string;
  time: string;
  available: boolean;
  professional?: string;
  start: string;
  end: string;
}

interface APIAvailabilitySlot {
  start: string;
  end: string;
  is_available: boolean;
  staff_id?: string;
  location_id?: string;
}

interface AvailabilityCalendarProps {
  selectedProfessional?: string;
  onDateTimeSelection: (dateTime: Date) => void;
  providerSlug?: string;
  serviceId?: string;
  staffId?: string;
  locationId?: string;
  durationMinutes?: number;
}

const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({
  selectedProfessional,
  onDateTimeSelection,
  providerSlug,
  serviceId,
  staffId,
  locationId,
  durationMinutes = 60,
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateSlotCounts, setDateSlotCounts] = useState<Map<string, number>>(new Map());
  const sliderRef = useRef<Slider>(null);

  // Format date as YYYY-MM-DD for API
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Convert ISO time to 12-hour format
  const formatTimeDisplay = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Fetch availability from API
  const fetchAvailability = useCallback(async (date: Date): Promise<TimeSlot[]> => {
    if (!providerSlug) {
      // Fallback to simulated data if no provider slug
      return generateFallbackSlots(date);
    }

    const dateStr = formatDateForAPI(date);
    
    // Build query params
    const params = new URLSearchParams({ date: dateStr });
    if (serviceId) params.append("service_id", serviceId);
    if (staffId) params.append("staff_id", staffId);
    if (locationId) params.append("location_id", locationId);
    if (durationMinutes) params.append("duration_minutes", durationMinutes.toString());

    try {
      const response = await fetcher.get<{
        data: { slots: APIAvailabilitySlot[] };
        error: null;
      }>(`/api/public/providers/${providerSlug}/availability?${params.toString()}`);

      const slots = response.data?.slots || [];
      
      // Transform API slots to component format
      return slots.map((slot, index) => ({
        id: `${dateStr}-${index}`,
        time: formatTimeDisplay(slot.start),
        available: slot.is_available,
        professional: selectedProfessional,
        start: slot.start,
        end: slot.end,
      }));
    } catch (err) {
      console.error("Error fetching availability:", err);
      // Return fallback on error
      return generateFallbackSlots(date);
    }
  }, [providerSlug, serviceId, staffId, locationId, durationMinutes, selectedProfessional]);

  // Fallback slot generation (for when API is unavailable)
  const generateFallbackSlots = (date: Date): TimeSlot[] => {
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dateStr = formatDateForAPI(date);
    
    const slots: TimeSlot[] = [];
    const startHour = 9;
    const endHour = 18;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotDate = new Date(date);
        slotDate.setHours(hour, minute, 0, 0);
        
        const time12h = slotDate.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        // Weekend: closed; Weekdays: all available by default
        const isAvailable = !isWeekend;

        slots.push({
          id: `${dateStr}-${hour}-${minute}`,
          time: time12h,
          available: isAvailable,
          professional: selectedProfessional,
          start: slotDate.toISOString(),
          end: new Date(slotDate.getTime() + durationMinutes * 60000).toISOString(),
        });
      }
    }

    return slots;
  };

  const getDates = (startDate: Date, count: number): Date[] => {
    const dates = [];
    for (let i = 0; i < count; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  // Initialize dates
  useEffect(() => {
    const newDates = getDates(new Date(), 30);
    setDates(newDates);
    if (sliderRef.current) {
      const selectedIndex = newDates.findIndex(
        (date) => date.toDateString() === selectedDate.toDateString()
      );
      if (selectedIndex >= 0) {
        sliderRef.current.slickGoTo(selectedIndex, true);
      }
    }
  }, []);

  // Fetch availability when date changes
  useEffect(() => {
    const loadAvailability = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const slots = await fetchAvailability(selectedDate);
        setAvailableSlots(slots);
        setSelectedTime(null); // Reset time when date changes
        
        // Update slot count for this date
        const dateKey = formatDateForAPI(selectedDate);
        const availableCount = slots.filter(s => s.available).length;
        setDateSlotCounts(prev => new Map(prev).set(dateKey, availableCount));
      } catch (err) {
        setError("Failed to load availability");
        console.error("Error loading availability:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAvailability();
  }, [selectedDate, fetchAvailability]);

  // Pre-fetch slot counts for visible dates
  useEffect(() => {
    const fetchSlotCounts = async () => {
      if (!providerSlug) return;
      
      // Fetch counts for next 7 days
      const datesToFetch = dates.slice(0, 7);
      
      for (const date of datesToFetch) {
        const dateKey = formatDateForAPI(date);
        if (!dateSlotCounts.has(dateKey)) {
          try {
            const slots = await fetchAvailability(date);
            const availableCount = slots.filter(s => s.available).length;
            setDateSlotCounts(prev => new Map(prev).set(dateKey, availableCount));
          } catch {
            // Ignore errors for pre-fetch
          }
        }
      }
    };

    if (dates.length > 0) {
      fetchSlotCounts();
    }
  }, [dates, providerSlug, fetchAvailability, dateSlotCounts]);

  const settings = {
    dots: false,
    infinite: false,
    speed: 500,
    slidesToShow: 7,
    slidesToScroll: 1,
    initialSlide: 0,
    responsive: [
      {
        breakpoint: 1024,
        settings: {
          slidesToShow: 6,
        },
      },
      {
        breakpoint: 768,
        settings: {
          slidesToShow: 4,
        },
      },
    ],
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
  };

  const isPastTime = (slot: TimeSlot): boolean => {
    const now = new Date();
    const slotTime = new Date(slot.start);
    
    // Compare with current time (with 15 minute buffer to allow for booking processing time)
    const bufferMinutes = 15;
    const nowWithBuffer = new Date(now.getTime() + bufferMinutes * 60 * 1000);
    
    return slotTime < nowWithBuffer;
  };

  const handleTimeSelection = (slot: TimeSlot) => {
    if (!slot.available) return;
    
    // Validate that the selected time is not in the past
    if (isPastTime(slot)) {
      alert('Cannot book a time in the past. Please select a future time.');
      return;
    }
    
    setSelectedTime(slot.time);
    
    // Use the exact start time from the slot
    const dateTime = new Date(slot.start);
    onDateTimeSelection(dateTime);
  };

  const getAvailableCount = (date: Date): number | null => {
    const dateKey = formatDateForAPI(date);
    return dateSlotCounts.get(dateKey) ?? null;
  };

  const formatDateLabel = (date: Date): string => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-US", { weekday: "short" });
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold mb-1">
            {selectedDate.toLocaleString("default", {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <p className="text-xs sm:text-sm text-gray-600">
            Select a date and time slot
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setDate(newDate.getDate() - 1);
              // Don't go before today
              if (newDate >= new Date(new Date().setHours(0, 0, 0, 0))) {
                setSelectedDate(newDate);
              }
            }}
            className="p-2 rounded-full hover:bg-gray-200 active:bg-gray-300 transition-colors touch-target"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setDate(newDate.getDate() + 1);
              setSelectedDate(newDate);
            }}
            className="p-2 rounded-full hover:bg-gray-200 active:bg-gray-300 transition-colors touch-target"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>

      {/* Date Slider */}
      <Slider ref={sliderRef} {...settings} className="mb-4 sm:mb-6">
        {dates.map((date, index) => {
          const availableCount = getAvailableCount(date);
          const isSelected = date.toDateString() === selectedDate.toDateString();
          const isPast = date < new Date() && date.toDateString() !== new Date().toDateString();

          return (
            <div key={index} className="px-0.5 sm:px-1">
              <button
                onClick={() => !isPast && handleDateClick(date)}
                disabled={isPast}
                className={`w-full flex flex-col items-center p-2 sm:p-3 rounded-lg transition-all touch-target ${
                  isSelected
                    ? "bg-[#FF0077] text-white"
                    : isPast
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-white border border-gray-200 hover:border-[#FF0077] hover:bg-pink-50 active:bg-pink-100"
                }`}
              >
                <span className="text-base sm:text-lg font-semibold">{date.getDate()}</span>
                <span className="text-[10px] sm:text-xs mt-0.5 sm:mt-1">{formatDateLabel(date)}</span>
                {!isPast && (
                  <span className="text-[10px] sm:text-xs mt-0.5 sm:mt-1 opacity-75">
                    {availableCount !== null ? `${availableCount} slots` : "..."}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </Slider>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF0077]" />
          <span className="ml-2 text-gray-600">Loading availability...</span>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="text-center py-8 text-red-500">
          <p>{error}</p>
          <button 
            onClick={() => {
              setError(null);
              const loadAvailability = async () => {
                const slots = await fetchAvailability(selectedDate);
                setAvailableSlots(slots);
              };
              loadAvailability();
            }}
            className="mt-2 text-sm text-[#FF0077] underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Time Slots Grid */}
      {!isLoading && !error && availableSlots.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-gray-600" />
            <h3 className="font-medium">Available Time Slots</h3>
            <span className="text-sm text-gray-500">
              ({availableSlots.filter((s) => s.available && !isPastTime(s)).length} available)
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 sm:gap-2">
            {availableSlots.map((slot) => {
              const isSelected = selectedTime === slot.time;
              const isPast = isPastTime(slot);
              const isDisabled = !slot.available || isPast;
              
              return (
                <button
                  key={slot.id}
                  onClick={() => handleTimeSelection(slot)}
                  disabled={isDisabled}
                  className={`p-2 sm:p-3 rounded-lg text-xs sm:text-sm font-medium transition-all touch-target ${
                    isSelected
                      ? "bg-[#FF0077] text-white border-2 border-[#FF0077]"
                      : isDisabled
                      ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-50"
                      : "bg-white border border-gray-200 hover:border-[#FF0077] hover:bg-pink-50 active:bg-pink-100"
                  }`}
                  title={isPast ? 'This time is in the past' : !slot.available ? 'Not available' : ''}
                >
                  {slot.time}
                  {isPast && <span className="block text-[10px] mt-0.5">(Past)</span>}
                </button>
              );
            })}
          </div>
          {availableSlots.filter((s) => s.available && !isPastTime(s)).length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <X className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No available slots for this date</p>
              <p className="text-sm mt-1">Please select another date</p>
            </div>
          )}
        </div>
      )}

      {/* No slots at all */}
      {!isLoading && !error && availableSlots.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <X className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>This provider is closed on this day</p>
          <p className="text-sm mt-1">Please select another date</p>
        </div>
      )}

      {selectedTime && (
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-xs sm:text-sm text-green-800">
            <strong>Selected:</strong> {formatDateLabel(selectedDate)}, {selectedTime}
          </p>
        </div>
      )}
    </div>
  );
};

export default AvailabilityCalendar;
