"use client";
import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

interface ProviderInfo {
  name: string;
  slug: string;
}

interface City {
  city: string;
  country: string;
  count: number;
  businesses?: string[]; // Business names in this city (for backward compatibility)
  providers?: ProviderInfo[]; // Provider info with names and slugs
}

const BrowseByCitySection = () => {
  const [activeTab, setActiveTab] = useState("ZA");
  const [cities, setCities] = useState<City[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Start false to render immediately
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: { browseByCity: City[] };
          error: null;
        }>("/api/public/home", { timeoutMs: 10000 });
        setCities(response.data.browseByCity || []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load cities";
        setError(errorMessage);
        console.error("Error loading cities:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const countryMap: Record<string, string> = {
    ZA: "south-africa",
    KE: "kenya",
    GH: "ghana",
    NG: "nigeria",
    EG: "egypt",
  };

  const countryNameMap: Record<string, string> = {
    ZA: "South Africa",
    KE: "Kenya",
    GH: "Ghana",
    NG: "Nigeria",
    EG: "Egypt",
  };

  const getCountryCode = (tab: string): string => {
    const reverseMap: Record<string, string> = {
      "south-africa": "ZA",
      kenya: "KE",
      ghana: "GH",
      nigeria: "NG",
      egypt: "EG",
    };
    return reverseMap[tab] || "ZA";
  };

  const handleTabChange = (value: string) => {
    const countryCode = getCountryCode(value);
    setActiveTab(countryCode);
  };

  const getFilteredCities = () => {
    return cities.filter((city) => {
      // Normalize country name for case-insensitive matching
      const normalizeCountry = (country: string): string => {
        if (!country) return "";
        return country.trim();
      };
      
      // Map country codes (case-insensitive)
      const countryCodeMap: Record<string, string> = {
        "south africa": "ZA",
        "kenya": "KE",
        "ghana": "GH",
        "nigeria": "NG",
        "egypt": "EG",
      };
      
      const normalizedCountry = normalizeCountry(city.country).toLowerCase();
      return countryCodeMap[normalizedCountry] === activeTab;
    });
  };

  if (isLoading) {
    return (
      <div className="bg-[#F7F7F7] py-6 md:py-12">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <LoadingTimeout loadingMessage="Loading cities..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#F7F7F7] py-6 md:py-12">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <EmptyState
            title="Failed to load cities"
            description={error}
            action={{
              label: "Retry",
              onClick: () => window.location.reload(),
            }}
          />
        </div>
      </div>
    );
  }

  // Group cities by country and sort by count (with normalized country names)
  const citiesByCountry = cities.reduce((acc, city) => {
    const countryCodeMap: Record<string, string> = {
      "south africa": "ZA",
      "kenya": "KE",
      "ghana": "GH",
      "nigeria": "NG",
      "egypt": "EG",
    };
    const normalizedCountry = (city.country || "").trim().toLowerCase();
    const code = countryCodeMap[normalizedCountry] || "ZA";
    if (!acc[code]) {
      acc[code] = [];
    }
    acc[code].push(city);
    return acc;
  }, {} as Record<string, City[]>);

  // Sort cities within each country by count
  Object.keys(citiesByCountry).forEach((code) => {
    citiesByCountry[code].sort((a, b) => b.count - a.count);
  });

  return (
    <div className="bg-[#F7F7F7] py-6 md:py-12">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <h2 className="text-xl md:text-2xl lg:text-3xl font-normal mb-4 md:mb-6">
          Browse by City
        </h2>
        <Tabs value={countryMap[activeTab] || "south-africa"} onValueChange={handleTabChange}>
          <TabsList className="bg-transparent border-b mb-4 md:mb-6 overflow-x-auto hide-scrollbar">
            {["ZA", "KE", "GH", "NG", "EG"].map((code) => {
              const tabValue = countryMap[code];
              const hasCities = citiesByCountry[code] && citiesByCountry[code].length > 0;
              if (!hasCities) return null;
              
              return (
                <TabsTrigger
                  key={code}
                  value={tabValue}
                  className={`px-3 md:px-4 py-2 font-normal text-sm md:text-base ${
                    activeTab === code
                      ? "border-b-2 border-[#FF0077] text-[#FF0077]"
                      : "text-gray-500"
                  }`}
                >
                  {countryNameMap[code]}
                </TabsTrigger>
              );
            })}
            <ChevronRight className="h-5 w-5 text-gray-400 ml-2 flex-shrink-0" />
          </TabsList>

          <TabsContent value={countryMap[activeTab] || "south-africa"}>
            {getFilteredCities().length === 0 ? (
              <EmptyState
                title="No cities found"
                description={`No providers found in ${countryNameMap[activeTab]}`}
              />
            ) : (
              <div className="relative">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-8">
                  {getFilteredCities().slice(0, 5).map((city, index) => (
                    <div key={index}>
                      <h3 className="font-semibold text-base md:text-lg mb-2 md:mb-3">
                        <Link
                          href={`/search?city=${encodeURIComponent(city.city)}&country=${encodeURIComponent(city.country)}`}
                          className="hover:text-[#FF0077] transition-colors"
                        >
                          {city.city}
                        </Link>
                      </h3>
                      {city.providers && city.providers.length > 0 ? (
                        <ul className="space-y-1">
                          {city.providers.slice(0, 10).map((provider, providerIndex) => (
                            <li key={providerIndex}>
                              <Link
                                href={`/partner-profile?slug=${encodeURIComponent(provider.slug)}`}
                                className="text-xs md:text-sm text-gray-600 font-light hover:text-[#FF0077] transition-colors cursor-pointer block"
                              >
                                {provider.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : city.businesses && city.businesses.length > 0 ? (
                        <ul className="space-y-1">
                          {city.businesses.slice(0, 10).map((business, bizIndex) => (
                            <li key={bizIndex}>
                              <Link
                                href={`/search?city=${encodeURIComponent(city.city)}&country=${encodeURIComponent(city.country)}&q=${encodeURIComponent(business)}`}
                                className="text-xs md:text-sm text-gray-600 font-light hover:text-[#FF0077] transition-colors cursor-pointer block"
                              >
                                {business}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs md:text-sm text-gray-500 font-light">
                          {city.count} {city.count === 1 ? "provider" : "providers"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {getFilteredCities().length > 5 && (
                  <div className="absolute right-0 top-0 flex items-center">
                    <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default BrowseByCitySection;
