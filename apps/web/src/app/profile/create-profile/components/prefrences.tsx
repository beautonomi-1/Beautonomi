"use client";
import { Scissors, Sparkles, Heart, Star } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";

interface BookedService {
  id: string;
  service_name?: string;
  offering_name?: string;
  scheduled_start_at?: string;
}

interface PreferencesProps {
  travelDestinations: string[] | null;
  setTravelDestinations: (value: string[] | null) => void;
  showTravelHistory: boolean;
  setShowTravelHistory: (value: boolean) => void;
}

export default function Preferences({ 
  travelDestinations: _travelDestinations, 
  setTravelDestinations: _setTravelDestinations,
  showTravelHistory,
  setShowTravelHistory,
}: PreferencesProps) {
  const [bookedServices, setBookedServices] = useState<BookedService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  useEffect(() => {
    const loadBookedServices = async () => {
      try {
        setIsLoadingServices(true);
        // Fetch upcoming bookings - use upcoming status to get confirmed/paid future bookings
        const response = await fetcher.get<{ data: { data: any[] } | any[] }>("/api/me/bookings?status=upcoming&limit=10");
        // Handle both paginated and non-paginated responses
        const bookingsData = Array.isArray(response.data) 
          ? response.data 
          : (response.data?.data || []);
        
        // Extract service information from bookings
        // Booking type has services: BookingServiceDetail[] with offering_name
        const services: BookedService[] = [];
        for (const booking of bookingsData) {
          // Check both 'services' (from Booking type) and 'booking_services' (from DB query)
          const bookingServices = booking.services || booking.booking_services || [];
          
          if (Array.isArray(bookingServices) && bookingServices.length > 0) {
            for (const service of bookingServices) {
              if (services.length >= 4) break;
              const serviceName = service.offering_name || 
                                 service.offering?.name || 
                                 service.name || 
                                 "Service";
              services.push({
                id: service.id || `${booking.id}-${services.length}`,
                service_name: serviceName,
                offering_name: service.offering_name || service.offering?.name,
                scheduled_start_at: service.scheduled_start_at || booking.scheduled_at,
              });
            }
          } else if (services.length < 4) {
            // If no services array, try to get service name from booking level
            const serviceName = booking.service_name || booking.offering_name || "Service";
            services.push({
              id: booking.id,
              service_name: serviceName,
              offering_name: booking.offering_name,
              scheduled_start_at: booking.scheduled_at,
            });
          }
          if (services.length >= 4) break;
        }
        
        setBookedServices(services);
      } catch (error) {
        console.error("Failed to load booked services:", error);
        // Don't show error to user - just show empty state
        setBookedServices([]);
      } finally {
        setIsLoadingServices(false);
      }
    };

    loadBookedServices();
  }, []);

  const icons = [Scissors, Sparkles, Heart, Star];
  const displayServices = bookedServices.length > 0 ? bookedServices : [];
  const emptySlots = 4 - displayServices.length;

  return (
    <div className="max-w-3xl mx-auto px-6 border-b mb-8 pb-10">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-[22px] font-medium text-gray-800">Services {"you've"} booked</h2>
        <Switch checked={showTravelHistory} onCheckedChange={setShowTravelHistory} />
      </div>
      <p className="text-sm text-destructive font-light mb-10">
        Choose whether other people can see the beauty services {"you've"} booked on Beautonomi.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {isLoadingServices ? (
          // Show loading placeholders
          [Scissors, Sparkles, Heart, Star].map((Icon, index) => (
            <div
              key={`loading-${index}`}
              className="flex flex-col items-center justify-between bg-white"
            >
              <div className="flex items-center justify-center border border-gray-300 rounded-md w-full py-8 mb-5 animate-pulse">
                <Icon className="w-14 h-14 text-gray-300" />
              </div>
              <span className="text-sm text-gray-300 font-light">Loading...</span>
            </div>
          ))
        ) : (
          <>
            {/* Display actual booked services */}
            {displayServices.map((service, index) => {
              const Icon = icons[index % icons.length];
              const serviceName = service.service_name || service.offering_name || "Service";
              return (
                <div
                  key={service.id}
                  className="flex flex-col items-center justify-between bg-white"
                >
                  <div className="flex items-center justify-center border border-gray-300 rounded-md w-full py-8 mb-5">
                    <Icon className="w-14 h-14 text-gray-500" />
                  </div>
                  <span className="text-sm text-gray-400 font-light truncate w-full text-center px-1" title={serviceName}>
                    {serviceName}
                  </span>
                </div>
              );
            })}
            {/* Show empty slots as "Next service" */}
            {emptySlots > 0 && Array.from({ length: emptySlots }).map((_, index) => {
              const Icon = icons[(displayServices.length + index) % icons.length];
              return (
                <div
                  key={`empty-${index}`}
                  className="flex flex-col items-center justify-between bg-white"
                >
                  <div className="flex items-center justify-center border border-gray-300 rounded-md w-full py-8 mb-5">
                    <Icon className="w-14 h-14 text-gray-500" />
                  </div>
                  <span className="text-sm text-destructive font-light">Next service</span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  )
}
