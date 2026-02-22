"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { ServiceCategory } from "@/lib/provider-portal/types";
import { handleError } from "@/lib/provider-portal/error-handler";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/provider-portal/Money";
import { Plus, MoreVertical, GripVertical, Grid3x3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Breadcrumb from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ServiceCreateEditDialog } from "./components/ServiceCreateEditDialog";
import { toast } from "sonner";

export default function ProviderServices() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#FF0077");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [isReordering, setIsReordering] = useState(false);

  // Cache for services data
  const servicesCacheRef = useRef<{ data: ServiceCategory[]; timestamp: number } | null>(null);
  const SERVICES_CACHE_DURATION = 30 * 1000; // 30 seconds
  const isLoadingRef = useRef(false);

  const loadServices = useCallback(async () => {
    // Prevent concurrent loads
    if (isLoadingRef.current) return;
    
    // Check cache first
    if (servicesCacheRef.current && Date.now() - servicesCacheRef.current.timestamp < SERVICES_CACHE_DURATION) {
      setCategories(servicesCacheRef.current.data);
      setIsLoading(false);
      
      // Refresh in background if cache is > 20 seconds old
      if (Date.now() - servicesCacheRef.current.timestamp > 20 * 1000) {
        loadServicesFresh().catch(() => {
          // Silently fail background refresh
        });
      }
      return;
    }

    await loadServicesFresh();
  }, []);

  const loadServicesFresh = useCallback(async () => {
    if (isLoadingRef.current) return;
    
    try {
      isLoadingRef.current = true;
      setIsLoading(true);
      const data = await providerApi.listServiceCategories();
      
      // Update cache
      servicesCacheRef.current = {
        data,
        timestamp: Date.now(),
      };
      
      setCategories(data);
    } catch (error) {
      handleError(error, {
        action: "loadServices",
        resource: "services",
      });
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const handleCreateService = (categoryId?: string) => {
    setSelectedService(null);
    setSelectedCategory(categoryId || null);
    setIsCreateDialogOpen(true);
  };

  const handleEditService = (service: any) => {
    setSelectedService(service);
    setSelectedCategory(service.category_id);
    setIsCreateDialogOpen(true);
  };

  const handleSave = useCallback(() => {
    setIsCreateDialogOpen(false);
    setSelectedService(null);
    setSelectedCategory(null);
    // Clear cache and reload
    servicesCacheRef.current = null;
    loadServicesFresh();
  }, [loadServicesFresh]);

  const handleCreateCategory = () => {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryColor("#FF0077");
    setCategoryDescription("");
    setIsCategoryDialogOpen(true);
  };

  const handleEditCategory = (category: ServiceCategory) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryColor((category as any).color || "#FF0077");
    setCategoryDescription((category as any).description || "");
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      toast.error("Category name is required");
      return;
    }

    try {
      if (editingCategory) {
        await providerApi.updateServiceCategory(editingCategory.id, { 
          name: categoryName,
          color: categoryColor,
          description: categoryDescription,
        });
        toast.success("Category updated");
      } else {
        await providerApi.createServiceCategory({ 
          name: categoryName,
          color: categoryColor,
          description: categoryDescription,
        });
        toast.success("Category created");
      }
      setIsCategoryDialogOpen(false);
      setCategoryName("");
      setCategoryColor("#FF0077");
      setCategoryDescription("");
      setEditingCategory(null);
      loadServices();
    } catch (error) {
      console.error("Failed to save category:", error);
      toast.error("Failed to save category");
    }
  };

  const handleDeleteCategory = async (category: ServiceCategory) => {
    if (category.services.length > 0) {
      toast.error("Cannot delete category with services. Please remove all services first.");
      return;
    }

    if (confirm(`Are you sure you want to delete "${category.name}"?`)) {
      try {
        await providerApi.deleteServiceCategory(category.id);
        toast.success("Category deleted");
        loadServices();
      } catch (error) {
        console.error("Failed to delete category:", error);
        toast.error("Failed to delete category");
      }
    }
  };

  if (isLoading) {
    return (
      <div>
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/provider/dashboard" },
            { label: "Catalogue", href: "/provider/catalogue" },
            { label: "Services" },
          ]}
        />
        <PageHeader title="Services menu" subtitle="Manage your service offerings" />
        <SectionCard>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </SectionCard>
      </div>
    );
  }

  // Check if there are actually any services (not just categories)
  const hasAnyServices = categories.some(cat => cat.services && cat.services.length > 0);

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/provider/dashboard" },
          { label: "Catalogue", href: "/provider/catalogue" },
          { label: "Services" },
        ]}
      />
      <PageHeader
        title="Services menu"
        subtitle="Manage, add or categorize services here"
        primaryAction={{
          label: "Add Service",
          onClick: () => handleCreateService(),
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
        actions={
          <>
            <Button 
              variant="outline" 
              onClick={() => setIsReordering(!isReordering)}
              className="mr-2 min-h-[44px] touch-manipulation w-full sm:w-auto"
            >
              {isReordering ? "Done" : "Manage order"}
            </Button>
            <Button 
              variant="outline"
              onClick={handleCreateCategory}
              className="min-h-[44px] touch-manipulation w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Add Category</span>
              <span className="sm:hidden">Add Category</span>
            </Button>
          </>
        }
      />

      {categories.length === 0 || !hasAnyServices ? (
        <SectionCard className="p-4 sm:p-6 lg:p-8">
          <div className="text-center max-w-md mx-auto">
            <div className="mb-4 sm:mb-6 flex justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-pink-100 rounded-full flex items-center justify-center">
                <Grid3x3 className="w-10 h-10 sm:w-12 sm:h-12 text-[#FF0077]" />
              </div>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2 sm:mb-3 px-2">
              Manage your services with Beautonomi service list
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 px-2">
              Organize and manage your service offerings efficiently
            </p>
            <ul className="text-left space-y-2 mb-6 sm:mb-8 text-gray-600 text-sm sm:text-base px-4">
              <li className="flex items-start gap-2">
                <span className="text-[#FF0077] mt-1 flex-shrink-0">•</span>
                <span>Start with a single service or create service packages</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FF0077] mt-1 flex-shrink-0">•</span>
                <span>Organise your services by adding categories</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FF0077] mt-1 flex-shrink-0">•</span>
                <span>Set pricing, duration, and assign team members</span>
              </li>
            </ul>
            <div className="flex flex-col sm:flex-row gap-3 justify-center px-4">
              <button
                onClick={handleCreateCategory}
                className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-[#FF0077] text-white rounded-lg font-medium hover:bg-[#D60565] active:bg-[#C00454] transition-colors min-h-[44px] touch-manipulation"
              >
                Start now
              </button>
              <button className="w-full sm:w-auto px-6 py-3 sm:py-2.5 text-[#FF0077] font-medium hover:underline active:opacity-70 min-h-[44px] touch-manipulation">
                Learn more
              </button>
            </div>
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          <Accordion type="multiple" className="w-full" defaultValue={categories.map((c) => c.id)}>
            {categories.map((category) => (
              <AccordionItem key={category.id} value={category.id} className="border-gray-200">
                <div className="flex items-center justify-between px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
                  <AccordionTrigger className="hover:no-underline flex-1 min-w-0 [&>svg]:ml-2">
                    <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                      {isReordering && (
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 sm:h-6 sm:w-6 touch-manipulation"
                            disabled={categories.findIndex(c => c.id === category.id) === 0}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const currentIndex = categories.findIndex(c => c.id === category.id);
                              if (currentIndex > 0) {
                                const newCategories = [...categories];
                                [newCategories[currentIndex - 1], newCategories[currentIndex]] = 
                                  [newCategories[currentIndex], newCategories[currentIndex - 1]];
                                // Update display_order for both categories
                                await Promise.all(
                                  newCategories.map((cat, idx) =>
                                    providerApi.updateServiceCategory(cat.id, { order: idx })
                                  )
                                );
                                loadServices();
                              }
                            }}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 sm:h-6 sm:w-6 touch-manipulation"
                            disabled={categories.findIndex(c => c.id === category.id) === categories.length - 1}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const currentIndex = categories.findIndex(c => c.id === category.id);
                              if (currentIndex < categories.length - 1) {
                                const newCategories = [...categories];
                                [newCategories[currentIndex], newCategories[currentIndex + 1]] = 
                                  [newCategories[currentIndex + 1], newCategories[currentIndex]];
                                // Update display_order for both categories
                                await Promise.all(
                                  newCategories.map((cat, idx) =>
                                    providerApi.updateServiceCategory(cat.id, { order: idx })
                                  )
                                );
                                loadServices();
                              }
                            }}
                          >
                            ↓
                          </Button>
                        </div>
                      )}
                      <div 
                        className="w-1 h-8 sm:h-12 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: (category as any).color || "#FF0077" }}
                      />
                      <span className="font-semibold text-base sm:text-lg truncate">{category.name}</span>
                    </div>
                  </AccordionTrigger>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8 flex-shrink-0 touch-manipulation ml-2">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleEditCategory(category)}>
                        Edit Category
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={() => handleDeleteCategory(category)}
                      >
                        Delete Category
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <AccordionContent className="px-3 sm:px-4 lg:px-6 pb-3 sm:pb-4">
                  <div className="space-y-2 sm:space-y-3 pt-2">
                    {category.services.length === 0 ? (
                      <div className="text-center py-6 sm:py-8 text-gray-500">
                        <p className="text-sm sm:text-base">No services in this category</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4 min-h-[44px] touch-manipulation"
                          onClick={() => handleCreateService(category.id)}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Service
                        </Button>
                      </div>
                    ) : (
                      <>
                        {category.services.map((service, serviceIndex) => (
                          <SectionCard key={service.id} className="p-3 sm:p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                                {isReordering && (
                                  <div className="flex flex-col gap-1 flex-shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 sm:h-6 sm:w-6 touch-manipulation"
                                      disabled={serviceIndex === 0}
                                      onClick={async () => {
                                        if (serviceIndex > 0) {
                                          const newServices = [...category.services];
                                          [newServices[serviceIndex - 1], newServices[serviceIndex]] = 
                                            [newServices[serviceIndex], newServices[serviceIndex - 1]];
                                          // Update display_order for both services
                                          await providerApi.reorderServices(category.id, newServices.map(s => s.id));
                                          loadServices();
                                        }
                                      }}
                                    >
                                      ↑
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 sm:h-6 sm:w-6 touch-manipulation"
                                      disabled={serviceIndex === category.services.length - 1}
                                      onClick={async () => {
                                        if (serviceIndex < category.services.length - 1) {
                                          const newServices = [...category.services];
                                          [newServices[serviceIndex], newServices[serviceIndex + 1]] = 
                                            [newServices[serviceIndex + 1], newServices[serviceIndex]];
                                          // Update display_order for both services
                                          await providerApi.reorderServices(category.id, newServices.map(s => s.id));
                                          loadServices();
                                        }
                                      }}
                                    >
                                      ↓
                                    </Button>
                                  </div>
                                )}
                                {!isReordering && <GripVertical className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0 mt-1" />}
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-sm sm:text-base truncate">{service.name}</span>
                                      {/* Service type badge */}
                                      {service.service_type && service.service_type !== "basic" && (
                                        <span className={`
                                          text-xs px-2 py-0.5 rounded-full font-medium
                                          ${service.service_type === "variant" ? "bg-purple-100 text-purple-700" : ""}
                                          ${service.service_type === "package" ? "bg-blue-100 text-blue-700" : ""}
                                          ${service.service_type === "addon" ? "bg-amber-100 text-amber-700" : ""}
                                        `}>
                                          {service.service_type === "variant" && service.variant_name 
                                            ? service.variant_name 
                                            : service.service_type}
                                        </span>
                                      )}
                                      {/* Variant indicator */}
                                      {service.service_type === "variant" && service.parent_service_id && (
                                        <span className="text-xs text-gray-500">(variant)</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-600">
                                      <span>{service.duration_minutes}min</span>
                                      <span className="hidden sm:inline">•</span>
                                      <span className="font-medium text-gray-900"><Money amount={service.price} /></span>
                                    </div>
                                  </div>
                                  {/* Show variants if present */}
                                  {(service as any).variants && (service as any).variants.length > 0 && (
                                    <div className="mt-2 ml-6 space-y-1">
                                      <p className="text-xs text-gray-500 font-medium">Variants:</p>
                                      {(service as any).variants.map((variant: any) => (
                                        <div key={variant.id} className="flex items-center gap-2 text-xs text-gray-600">
                                          <span className="w-1 h-1 rounded-full bg-purple-400"></span>
                                          <span>{variant.variant_name || variant.name}</span>
                                          <span className="text-gray-400">•</span>
                                          <span>{variant.duration_minutes}min</span>
                                          <span className="text-gray-400">•</span>
                                          <span><Money amount={variant.price} /></span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {/* Show included services for packages */}
                                  {service.service_type === "package" && service.included_services && service.included_services.length > 0 && (
                                    <div className="mt-2 ml-6">
                                      <p className="text-xs text-gray-500 font-medium mb-1">Includes:</p>
                                      <div className="flex flex-wrap gap-1">
                                        {service.included_services.map((incId: string, idx: number) => {
                                          // Find service name from all categories
                                          let incName = incId;
                                          categories.forEach(cat => {
                                            const found = cat.services.find(s => s.id === incId);
                                            if (found) incName = found.name;
                                          });
                                          return (
                                            <span key={idx} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                                              {incName}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                  {/* Show applicable services for addons */}
                                  {service.service_type === "addon" && (service as any).applicable_service_ids && (service as any).applicable_service_ids.length > 0 && (
                                    <div className="mt-2 ml-6">
                                      <p className="text-xs text-gray-500 font-medium mb-1">Available for:</p>
                                      <div className="flex flex-wrap gap-1">
                                        {(service as any).applicable_service_ids.map((appId: string, idx: number) => {
                                          let appName = appId;
                                          categories.forEach(cat => {
                                            const found = cat.services.find(s => s.id === appId);
                                            if (found) appName = found.name;
                                          });
                                          return (
                                            <span key={idx} className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded">
                                              {appName}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8 flex-shrink-0 touch-manipulation">
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem onClick={() => handleEditService(service)}>
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="text-red-600"
                                    onClick={async () => {
                                      if (confirm(`Are you sure you want to delete "${service.name}"?`)) {
                                        try {
                                          await providerApi.deleteService(service.id);
                                          toast.success("Service deleted");
                                          loadServices();
                                        } catch (error) {
                                          console.error("Failed to delete service:", error);
                                          toast.error("Failed to delete service");
                                        }
                                      }
                                    }}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </SectionCard>
                        ))}
                        <Button
                          variant="outline"
                          className="w-full mt-2 min-h-[44px] touch-manipulation"
                          onClick={() => handleCreateService(category.id)}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          <span className="hidden sm:inline">Add Service to {category.name}</span>
                          <span className="sm:hidden">Add Service</span>
                        </Button>
                      </>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      <ServiceCreateEditDialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            setSelectedService(null);
            setSelectedCategory(null);
          }
        }}
        service={selectedService}
        categoryId={selectedCategory}
        categories={categories}
        onSave={handleSave}
        onCategoriesChange={loadServices}
      />

      {/* Category Create/Edit Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="px-0 sm:px-0">
            <DialogTitle className="text-lg sm:text-xl">
              {editingCategory ? "Edit Category" : "Add Category"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">
              Organize your services into categories to help clients browse more easily
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2 sm:py-4 px-0 sm:px-0">
            <div>
              <Label htmlFor="categoryName" className="text-sm sm:text-base">Category name *</Label>
              <Input
                id="categoryName"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g., Nails, Hair & Styling"
                required
                className="mt-1.5"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                The name that appears in your service menu and to clients when booking
              </p>
            </div>
            
            <div>
              <Label className="text-sm sm:text-base">Appointment color</Label>
              <p className="text-xs text-gray-500 mb-2 mt-1.5">Choose a color to visually identify services in this category</p>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                {[
                  "#FF0077", "#FF6B9D", "#FFB6C1", "#FFA07A",
                  "#98D8C8", "#6BCF7F", "#4ECDC4", "#45B7D1",
                  "#96CEB4", "#FFEAA7", "#DDA15E", "#BC6C25",
                  "#C77DFF", "#9D4EDD", "#7209B7", "#560BAD",
                  "#FF6B6B", "#FF8E53", "#E94560", "#C44569",
                  "#6C5CE7", "#A29BFE", "#74B9FF", "#00B894"
                ].map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-md border-2 transition-colors ${
                      categoryColor === color 
                        ? "border-[#FF0077] ring-2 ring-[#FF0077] ring-offset-1 sm:ring-offset-2" 
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setCategoryColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="categoryDescription" className="text-sm sm:text-base">Description (Optional)</Label>
              <Textarea
                id="categoryDescription"
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                placeholder="Add a short summary that helps clients understand what types of services are included in this category"
                rows={3}
                className="mt-1.5"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Help clients understand what types of services are included in this category
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setIsCategoryDialogOpen(false);
                setCategoryName("");
                setCategoryColor("#FF0077");
                setCategoryDescription("");
                setEditingCategory(null);
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveCategory} 
              className="bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto"
              disabled={!categoryName.trim()}
            >
              {editingCategory ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
