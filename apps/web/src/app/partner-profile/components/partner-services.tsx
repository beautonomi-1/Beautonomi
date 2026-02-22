"use client";
import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Info, Clock } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import type { OfferingCard } from "@/types/beautonomi";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import ServiceDetailModal from "./service-detail-modal";

type Service = {
  id: string;
  title: string;
  duration: string;
  price: string;
  category: string;
  description?: string;
  featured?: boolean;
};

type ServiceCategory = {
  name: string;
  services: Service[];
};

interface PartnerServicesProps {
  slug?: string;
  id?: string;
  partnerId?: string;
}

// Transform API offerings into component format
const transformOfferingsToCategories = (offerings: OfferingCard[]): ServiceCategory[] => {
  if (!offerings || offerings.length === 0) return [];

  // Group offerings by category (master_service_name)
  const groupedByCategory: { [key: string]: OfferingCard[] } = {};
  
  offerings.forEach((offering) => {
    const category = offering.master_service_name || 'Other Services';
    if (!groupedByCategory[category]) {
      groupedByCategory[category] = [];
    }
    groupedByCategory[category].push(offering);
  });

  // Transform to ServiceCategory format
  return Object.keys(groupedByCategory).map((categoryName) => ({
    name: categoryName,
    services: groupedByCategory[categoryName].map((offering) => ({
      id: offering.id,
      title: offering.title,
      duration: `${offering.duration_minutes} min`,
      price: `${offering.currency} ${offering.price}`,
      category: categoryName,
      description: offering.description || '',
      featured: false, // Can be enhanced with featured flag from API
    })),
  }));
};

const PartnerServices: React.FC<PartnerServicesProps> = ({ slug, id, partnerId }) => {
  const [activeCategory, setActiveCategory] = useState(0);
  const [offerings, setOfferings] = useState<OfferingCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get provider identifier
  const providerSlug = slug || partnerId || id;

  useEffect(() => {
    const loadOfferings = async () => {
      if (!providerSlug) {
        setError("Provider identifier is required");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{ data: OfferingCard[] }>(
          `/api/public/providers/${providerSlug}/offerings`,
          { timeoutMs: 20000 } // 20 seconds for services loading
        );
        setOfferings(response.data || []);
      } catch (err) {
        // Only set error for actual failures, not empty data
        if (err instanceof FetchTimeoutError || err instanceof FetchError) {
          const errorMessage =
            err instanceof FetchTimeoutError
              ? "Request timed out. Please try again."
              : err.message;
          setError(errorMessage);
          console.error("Error loading offerings:", err);
        } else {
          // For other errors, just log and show empty state
          console.error("Error loading offerings:", err);
          setOfferings([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadOfferings();
  }, [providerSlug]);

  // Transform offerings to categories
  const serviceCategories = useMemo(() => {
    return transformOfferingsToCategories(offerings);
  }, [offerings]);
  
  // Helper function to encode service data for URL
  const createBookingUrl = (service: Service) => {
    const serviceData = {
      title: service.title,
      duration: service.duration,
      price: service.price,
      category: service.category,
    };
    const _encoded = encodeURIComponent(JSON.stringify(serviceData));
    return `/booking?serviceId=${service.id}&partnerId=${providerSlug}&slug=${providerSlug}`;
  };

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -200 : 200;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <LoadingTimeout loadingMessage="Loading services..." />
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <div className="text-center py-8">
          <p className="text-gray-500">Loading services...</p>
        </div>
      </div>
    );
  }

  // Show error state only for actual errors
  if (error) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <EmptyState
          title="Unable to load services"
          description={error}
        />
      </div>
    );
  }

  // Show empty state when no services (but no error)
  if (serviceCategories.length === 0) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <EmptyState
          title="No services available"
          description="This provider hasn't added any services yet"
        />
      </div>
    );
  }

  const currentCategory = serviceCategories[activeCategory];

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-6 md:py-8">
      <h2 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">Services</h2>

      {/* Category Navigation */}
      <div className="relative mb-6 md:mb-8">
        <div className="flex items-center">
          <div
            ref={scrollRef}
            className="flex space-x-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 md:mx-0 md:px-0"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {serviceCategories.map((category, index) => (
              <button
                key={index}
                onClick={() => setActiveCategory(index)}
                className={`py-2 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  index === activeCategory
                    ? "bg-gray-900 text-white shadow-md"
                    : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 bg-white p-1 rounded-full shadow-md hidden md:block"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 bg-white p-1 rounded-full shadow-md hidden md:block"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Services List */}
      <div className="space-y-3 md:space-y-4">
        {currentCategory?.services.map((service) => (
          <div
            key={service.id}
            className="border border-gray-200 rounded-xl p-4 md:p-5 hover:bg-gray-50 transition-colors bg-white"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {service.featured && (
                    <span className="bg-pink-100 text-pink-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                      Featured
                    </span>
                  )}
                  <h3 className="text-base md:text-lg font-semibold text-gray-900">{service.title}</h3>
                </div>
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm">{service.duration}</span>
                  </div>
                  <span className="text-base md:text-lg font-bold text-gray-900">{service.price}</span>
                </div>
                {service.description && (
                  <p className="text-gray-600 text-sm mb-2 line-clamp-2">{service.description}</p>
                )}
              </div>
              <div className="flex gap-2 md:flex-col md:gap-2">
                {service.description && (
                  <button
                    onClick={() => {
                      setSelectedService(service);
                      setIsModalOpen(true);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium flex items-center justify-center gap-2 md:w-full"
                  >
                    <Info className="w-4 h-4" />
                    <span className="md:hidden">Details</span>
                  </button>
                )}
                <Link href={createBookingUrl(service)} className="flex-1 md:w-full">
                  <button className="w-full px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-semibold">
                    Book
                  </button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <button 
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="text-gray-600 hover:text-gray-900 underline text-sm"
        >
          View all services
        </button>
      </div>

      {/* Service Detail Modal */}
      {selectedService && (
        <ServiceDetailModal
          service={{
            id: selectedService.id,
            title: selectedService.title,
            description: selectedService.description,
            duration: selectedService.duration,
            price: selectedService.price,
            category: selectedService.category,
            supports_at_home: offerings.find(o => o.id === selectedService.id)?.supports_at_home,
            supports_at_salon: offerings.find(o => o.id === selectedService.id)?.supports_at_salon,
          }}
          providerSlug={providerSlug}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedService(null);
          }}
          onBook={() => {
            setIsModalOpen(false);
            window.location.href = createBookingUrl(selectedService);
          }}
        />
      )}
    </div>
  );
};

export default PartnerServices;
