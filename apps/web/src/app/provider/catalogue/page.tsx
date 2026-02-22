"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Grid3x3, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { providerApi } from "@/lib/provider-portal/api";
import { Skeleton } from "@/components/ui/skeleton";

export default function CataloguePage() {
  const pathname = usePathname();
  const [hasProducts, setHasProducts] = useState<boolean | null>(null);
  const [hasServices, setHasServices] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkData();
  }, []);

  const checkData = async () => {
    try {
      setIsLoading(true);
      // Check for products
      const productsResponse = await providerApi.listProducts({}, { page: 1, limit: 1 });
      setHasProducts(productsResponse.data.length > 0);

      // Check for services
      const servicesResponse = await providerApi.listServiceCategories();
      const totalServices = servicesResponse.reduce((sum, cat) => sum + (cat.services?.length || 0), 0);
      setHasServices(totalServices > 0);
    } catch (error) {
      console.error("Failed to check data:", error);
      setHasProducts(false);
      setHasServices(false);
    } finally {
      setIsLoading(false);
    }
  };

  const hasAnyData = hasProducts || hasServices;

  const sections = [
    {
      id: "products",
      title: "Products",
      description: "Manage your product inventory, categories, and pricing",
      href: "/provider/catalogue/products",
      icon: Package,
    },
    {
      id: "services",
      title: "Services",
      description: "Manage your service offerings, categories, and pricing",
      href: "/provider/catalogue/services",
      icon: Grid3x3,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Catalogue"
        subtitle="Manage your services and products"
      />

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 mt-4 lg:mt-6">
        {/* Left Navigation Panel */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <SectionCard className="p-0">
            <div className="p-3 sm:p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Catalogue</h3>
            </div>
            <nav className="p-2 sm:p-3 grid grid-cols-2 lg:grid-cols-1 gap-2">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = pathname.startsWith(section.href);

                return (
                  <Link key={section.id} href={section.href}>
                    <div
                      className={cn(
                        "flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-2.5 rounded-lg transition-colors cursor-pointer min-h-[44px] touch-manipulation",
                        isActive
                          ? "bg-[#FF0077] text-white"
                          : "text-gray-700 hover:bg-gray-100 active:bg-gray-200"
                      )}
                    >
                      <Icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                      <span className="text-sm sm:text-base font-medium">{section.title}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </SectionCard>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <SectionCard className="p-4 sm:p-6 lg:p-8">
              <div className="text-center max-w-md mx-auto">
                <Skeleton className="w-20 h-20 sm:w-24 sm:h-24 rounded-full mx-auto mb-4 sm:mb-6" />
                <Skeleton className="h-6 sm:h-8 w-full mb-2 sm:mb-3" />
                <Skeleton className="h-4 w-3/4 mx-auto mb-4 sm:mb-6" />
                <div className="space-y-2 mb-6 sm:mb-8">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <Skeleton className="h-10 sm:h-12 w-32 mx-auto" />
              </div>
            </SectionCard>
          ) : !hasAnyData ? (
            <SectionCard className="p-4 sm:p-6 lg:p-8">
              <div className="text-center max-w-md mx-auto">
                <div className="mb-4 sm:mb-6 flex justify-center">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-yellow-100 rounded-full flex items-center justify-center">
                    <Package className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-600" />
                  </div>
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2 sm:mb-3 px-2">
                  Manage your inventory with Beautonomi product list
                </h2>
                <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 px-2">
                  Organize and manage your products and services efficiently
                </p>
                <ul className="text-left space-y-2 mb-6 sm:mb-8 text-gray-600 text-sm sm:text-base px-4">
                  <li className="flex items-start gap-2">
                    <span className="text-[#FF0077] mt-1 flex-shrink-0">•</span>
                    <span>Start with a single product or import many at once</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FF0077] mt-1 flex-shrink-0">•</span>
                    <span>Organise your list by adding brands and categories</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FF0077] mt-1 flex-shrink-0">•</span>
                    <span>Set pricing and manage inventory levels</span>
                  </li>
                </ul>
                <div className="flex flex-col sm:flex-row gap-3 justify-center px-4">
                  <Link href="/provider/catalogue/products" className="w-full sm:w-auto">
                    <button className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-[#FF0077] text-white rounded-lg font-medium hover:bg-[#D60565] active:bg-[#C00454] transition-colors min-h-[44px] touch-manipulation">
                      Start now
                    </button>
                  </Link>
                  <button className="w-full sm:w-auto px-6 py-3 sm:py-2.5 text-[#FF0077] font-medium hover:underline active:opacity-70 min-h-[44px] touch-manipulation">
                    Learn more
                  </button>
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard className="p-4 sm:p-6 lg:p-8">
              <div className="text-center">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Welcome to Catalogue</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 px-2">
                  Select a section above to manage your {hasProducts && hasServices ? "products and services" : hasProducts ? "products" : "services"}.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                  {!hasProducts && (
                    <Link href="/provider/catalogue/products" className="w-full sm:w-auto">
                      <button className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-[#FF0077] text-white rounded-lg font-medium hover:bg-[#D60565] active:bg-[#C00454] transition-colors min-h-[44px] touch-manipulation">
                        Add Products
                      </button>
                    </Link>
                  )}
                  {!hasServices && (
                    <Link href="/provider/catalogue/services" className="w-full sm:w-auto">
                      <button className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-[#FF0077] text-white rounded-lg font-medium hover:bg-[#D60565] active:bg-[#C00454] transition-colors min-h-[44px] touch-manipulation">
                        Add Services
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
