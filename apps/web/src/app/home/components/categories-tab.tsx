"use client"
import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import Link from "next/link";

interface City {
  name: string;
  businesses: string[];
  provider_count?: number;
}

interface CountryData {
  [key: string]: City[];
}

const CategoriesTab: React.FC = () => {
  const [activeTab, setActiveTab] = useState("south-africa");
  const [countryData, setCountryData] = useState<CountryData>({});
  const [tabs, setTabs] = useState<Array<{ value: string; label: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLocationData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch providers grouped by country and city
        const response = await fetcher.get<{
          data: {
            providers: Array<{
              id: string;
              business_name: string;
              city: string;
              country: string;
              slug: string;
            }>;
          };
          error: null;
        }>("/api/public/search?limit=1000");

        const providers = response.data.providers || [];

        // Group providers by country and city
        const grouped: CountryData = {};
        const countrySet = new Set<string>();

        providers.forEach((provider) => {
          if (!provider.country || !provider.city) return;

          const countryKey = provider.country.toLowerCase().replace(/\s+/g, "-");
          countrySet.add(countryKey);

          if (!grouped[countryKey]) {
            grouped[countryKey] = [];
          }

          let cityData = grouped[countryKey].find((c) => c.name === provider.city);
          if (!cityData) {
            cityData = {
              name: provider.city,
              businesses: [],
              provider_count: 0,
            };
            grouped[countryKey].push(cityData);
          }

          if (!cityData.businesses.includes(provider.business_name)) {
            cityData.businesses.push(provider.business_name);
            cityData.provider_count = (cityData.provider_count || 0) + 1;
          }
        });

        // Create tabs from countries found
        const countryTabs = Array.from(countrySet).map((countryKey) => {
          const countryName = countryKey
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          return { value: countryKey, label: countryName };
        });

        setTabs(countryTabs.length > 0 ? countryTabs : [
          { value: "south-africa", label: "South Africa" },
          { value: "kenya", label: "Kenya" },
          { value: "ghana", label: "Ghana" },
          { value: "nigeria", label: "Nigeria" },
          { value: "egypt", label: "Egypt" },
        ]);
        setCountryData(grouped);
        
        // Set first available tab as active
        if (countryTabs.length > 0 && !countryTabs.find(t => t.value === activeTab)) {
          setActiveTab(countryTabs[0].value);
        }
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load location data";
        setError(errorMessage);
        console.error("Error loading location data:", err);
        
        // Set default tabs on error
        setTabs([
          { value: "south-africa", label: "South Africa" },
          { value: "kenya", label: "Kenya" },
          { value: "ghana", label: "Ghana" },
          { value: "nigeria", label: "Nigeria" },
          { value: "egypt", label: "Egypt" },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    loadLocationData();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-primary py-10 mt-14 overflow-x-hidden">
        <div className="mb-4 md:mb-8 max-w-[2340px] mx-auto px-10">
          <LoadingTimeout loadingMessage="Loading locations..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-primary py-10 mt-14 overflow-x-hidden">
        <div className="mb-4 md:mb-8 max-w-[2340px] mx-auto px-10">
          <EmptyState
            title="Failed to load locations"
            description={error}
          />
        </div>
      </div>
    );
  }

  const currentCountryData = countryData[activeTab] || [];

  return (
    <div className="bg-primary py-10 mt-14 overflow-x-hidden">
      <div className="mb-4 md:mb-8 max-w-[2340px] mx-auto px-10">
        <h2 className="text-[22px] font-normal text-secondary mb-6">
          Browse by City
        </h2>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex gap-5 border-b mb-8 overflow-x-scroll">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={`py-2 px-4 ${
                  activeTab === tab.value
                    ? "border-b-2 border-black text-black text-sm"
                    : "border-b-2 border-transparent text-sm font-light text-destructive"
                }`}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              {currentCountryData.length === 0 ? (
                <EmptyState
                  title="No providers found"
                  description={`No providers available in ${tab.label} yet`}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {currentCountryData.map((city, cityIndex) => (
                    <div key={cityIndex} className="bg-white rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-semibold mb-4">{city.name}</h3>
                      <ul className="space-y-2">
                        {city.businesses.slice(0, 10).map((business, businessIndex) => (
                          <li key={businessIndex}>
                            <Link
                              href={`/search?city=${encodeURIComponent(city.name)}&country=${encodeURIComponent(tab.label)}`}
                              className="text-sm text-gray-600 hover:text-[#FF0077] hover:underline"
                            >
                              {business}
                            </Link>
                          </li>
                        ))}
                        {city.businesses.length > 10 && (
                          <li className="text-sm text-gray-500">
                            +{city.businesses.length - 10} more
                          </li>
                        )}
                      </ul>
                      {city.provider_count && (
                        <p className="text-xs text-gray-500 mt-4">
                          {city.provider_count} {city.provider_count === 1 ? "provider" : "providers"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
};

export default CategoriesTab;
