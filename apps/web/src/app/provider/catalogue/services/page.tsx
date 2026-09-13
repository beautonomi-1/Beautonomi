"use client";
import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
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
      toast.error(t("web.provider.catalogue.services.categoryNameRequired"));
      return;
    }

    try {
      if (editingCategory) {
        await providerApi.updateServiceCategory(editingCategory.id, { 
          name: categoryName,
          color: categoryColor,
          description: categoryDescription,
        });
        toast.success(t("web.provider.catalogue.services.categoryUpdated"));
      } else {
        await providerApi.createServiceCategory({ 
          name: categoryName,
          color: categoryColor,
          description: categoryDescription,
        });
        toast.success(t("web.provider.catalogue.services.categoryCreated"));
      }
      setIsCategoryDialogOpen(false);
      setCategoryName("");
      setCategoryColor("#FF0077");
      setCategoryDescription("");
      setEditingCategory(null);
      loadServices();
    } catch (error) {
      console.error("Failed to save category:", error);
      toast.error(t("web.provider.catalogue.services.failedToSaveCategory"));
    }
  };

  const handleDeleteCategory = async (category: ServiceCategory) => {
    if (category.services.length > 0) {
      toast.error(t("web.provider.catalogue.services.cannotDeleteWithServices"));
      return;
    }

    if (confirm(t("web.provider.catalogue.services.deleteConfirm", { name: category.name }))) {
      try {
        await providerApi.deleteServiceCategory(category.id);
        toast.success(t("web.provider.catalogue.services.categoryDeleted"));
        loadServices();
      } catch (error) {
        console.error("Failed to delete category:", error);
        toast.error(t("web.provider.catalogue.services.failedToDeleteCategory"));
      }
    }
  };

  if (isLoading) {
    return (
      <div>
        <Breadcrumb
          items={[
            { label: t("web.provider.sidebar.items.dashboard"), href: "/provider/dashboard" },
            { label: t("web.provider.sidebar.items.catalogue"), href: "/provider/catalogue" },
            { label: t("web.provider.sidebar.items.services") },
          ]}
        />
        <PageHeader title={t("web.provider.catalogue.services.title")} subtitle={t("web.provider.settings.categories.services.items.servicesMenu.description")} />
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
          { label: t("web.provider.sidebar.items.dashboard"), href: "/provider/dashboard" },
          { label: t("web.provider.sidebar.items.catalogue"), href: "/provider/catalogue" },
          { label: t("web.provider.sidebar.items.services") },
        ]}
      />
      <PageHeader
        title={t("web.provider.catalogue.services.title")}
        subtitle={t("web.provider.catalogue.services.subtitle")}
        primaryAction={{
          label: t("web.provider.catalogue.services.addService"),
          onClick: () => handleCreateService(),
          icon: <Plus className="w-4 h-4 me-2" />,
        }}
        actions={
          <>
            <Button 
              variant="outline" 
              onClick={() => setIsReordering(!isReordering)}
              className="me-2 min-h-[44px] touch-manipulation w-full sm:w-auto"
            >
              {isReordering ? t("web.provider.catalogue.services.done") : t("web.provider.catalogue.services.manageOrder")}
            </Button>
            <Button 
              variant="outline"
              onClick={handleCreateCategory}
              className="min-h-[44px] touch-manipulation w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 me-2" />
              <span className="hidden sm:inline">{t("web.provider.catalogue.services.addCategory")}</span>
              <span className="sm:hidden">{t("web.provider.catalogue.services.addCategory")}</span>
            </Button>
          </>
        }
      />

      {categories.length === 0 || !hasAnyServices ? (
        <SectionCard className="p-4 sm:p-6 lg:p-8">
          <div className="text-center max-w-md mx-auto">
            <div className="mb-4 sm:mb-6 flex justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-pink-100 rounded-full flex items-center justify-center">
                <Grid3x3 className="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
              </div>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2 sm:mb-3 px-2">
              {t("web.provider.catalogue.services.emptyTitle")}
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 px-2">
              {t("web.provider.catalogue.services.emptyBody")}
            </p>
            <ul className="text-start space-y-2 mb-6 sm:mb-8 text-gray-600 text-sm sm:text-base px-4">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1 flex-shrink-0">•</span>
                <span>{t("web.provider.catalogue.services.emptyBullet1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1 flex-shrink-0">•</span>
                <span>{t("web.provider.catalogue.services.emptyBullet2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1 flex-shrink-0">•</span>
                <span>{t("web.provider.catalogue.services.emptyBullet3")}</span>
              </li>
            </ul>
            <div className="flex flex-col sm:flex-row gap-3 justify-center px-4">
              <button
                onClick={handleCreateCategory}
                className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover active:bg-[#C00454] transition-colors min-h-[44px] touch-manipulation"
              >
                {t("web.provider.catalogue.services.startNow")}
              </button>
              <button className="w-full sm:w-auto px-6 py-3 sm:py-2.5 text-primary font-medium hover:underline active:opacity-70 min-h-[44px] touch-manipulation">
                {t("web.provider.catalogue.services.learnMore")}
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
                  <AccordionTrigger className="hover:no-underline flex-1 min-w-0 [&>svg]:ms-2">
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
                      <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8 flex-shrink-0 touch-manipulation ms-2">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleEditCategory(category)}>
                        {t("web.provider.catalogue.services.editCategory")}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={() => handleDeleteCategory(category)}
                      >
                        {t("web.provider.catalogue.services.deleteCategory")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <AccordionContent className="px-3 sm:px-4 lg:px-6 pb-3 sm:pb-4">
                  <div className="space-y-2 sm:space-y-3 pt-2">
                    {category.services.length === 0 ? (
                      <div className="text-center py-6 sm:py-8 text-gray-500">
                        <p className="text-sm sm:text-base">{t("web.provider.catalogue.services.noServicesInCategory")}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4 min-h-[44px] touch-manipulation"
                          onClick={() => handleCreateService(category.id)}
                        >
                          <Plus className="w-4 h-4 me-2" />
                          {t("web.provider.catalogue.services.addService")}
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
                                        <span className="text-xs text-gray-500">{t("web.provider.catalogue.services.variant")}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-600">
                                      <span>{t("web.provider.catalogue.services.durationMin", { count: service.duration_minutes })}</span>
                                      <span className="hidden sm:inline">•</span>
                                      <span className="font-medium text-gray-900"><Money amount={service.price} /></span>
                                    </div>
                                  </div>
                                  {/* Show variants if present */}
                                  {(service as any).variants && (service as any).variants.length > 0 && (
                                    <div className="mt-2 ms-6 space-y-1">
                                      <p className="text-xs text-gray-500 font-medium">{t("web.provider.catalogue.services.variants")}</p>
                                      {(service as any).variants.map((variant: any) => (
                                        <div key={variant.id} className="flex items-center gap-2 text-xs text-gray-600">
                                          <span className="w-1 h-1 rounded-full bg-purple-400"></span>
                                          <span>{variant.variant_name || variant.name}</span>
                                          <span className="text-gray-400">•</span>
                                          <span>{t("web.provider.catalogue.services.durationMin", { count: variant.duration_minutes })}</span>
                                          <span className="text-gray-400">•</span>
                                          <span><Money amount={variant.price} /></span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {/* Show included services for packages */}
                                  {service.service_type === "package" && service.included_services && service.included_services.length > 0 && (
                                    <div className="mt-2 ms-6">
                                      <p className="text-xs text-gray-500 font-medium mb-1">{t("web.provider.catalogue.services.includes")}</p>
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
                                    <div className="mt-2 ms-6">
                                      <p className="text-xs text-gray-500 font-medium mb-1">{t("web.provider.catalogue.services.availableFor")}</p>
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
                                    {t("web.provider.common.edit")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="text-red-600"
                                    onClick={async () => {
                                      if (confirm(t("web.provider.catalogue.services.deleteConfirm", { name: service.name }))) {
                                        try {
                                          await providerApi.deleteService(service.id);
                                          toast.success(t("web.provider.catalogue.services.serviceDeleted"));
                                          loadServices();
                                        } catch (error) {
                                          console.error("Failed to delete service:", error);
                                          toast.error(t("web.provider.catalogue.services.failedToDeleteService"));
                                        }
                                      }
                                    }}
                                  >
                                    {t("web.provider.common.delete")}
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
                          <Plus className="w-4 h-4 me-2" />
                          <span className="hidden sm:inline">{t("web.provider.catalogue.services.addServiceTo", { name: category.name })}</span>
                          <span className="sm:hidden">{t("web.provider.catalogue.services.addService")}</span>
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
              {editingCategory ? t("web.provider.catalogue.services.editCategory") : t("web.provider.catalogue.services.addCategory")}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">
              {t("web.provider.catalogue.services.categoryDialogHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2 sm:py-4 px-0 sm:px-0">
            <div>
              <Label htmlFor="categoryName" className="text-sm sm:text-base">{t("web.provider.catalogue.services.categoryName")}</Label>
              <Input
                id="categoryName"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder={t("web.provider.catalogue.services.categoryNamePlaceholder")}
                required
                className="mt-1.5"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                {t("web.provider.catalogue.services.categoryNameHint")}
              </p>
            </div>
            
            <div>
              <Label className="text-sm sm:text-base">{t("web.provider.catalogue.services.appointmentColor")}</Label>
              <p className="text-xs text-gray-500 mb-2 mt-1.5">{t("web.provider.catalogue.services.appointmentColorHint")}</p>
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
                        ? "border-primary ring-2 ring-primary ring-offset-1 sm:ring-offset-2" 
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
              <Label htmlFor="categoryDescription" className="text-sm sm:text-base">{t("web.provider.catalogue.services.descriptionOptional")}</Label>
              <Textarea
                id="categoryDescription"
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                placeholder={t("web.provider.catalogue.services.descriptionPlaceholder")}
                rows={3}
                className="mt-1.5"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                {t("web.provider.catalogue.services.descriptionHint")}
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
              {t("web.provider.common.cancel")}
            </Button>
            <Button 
              onClick={handleSaveCategory} 
              className="bg-primary hover:bg-primary-hover w-full sm:w-auto"
              disabled={!categoryName.trim()}
            >
              {editingCategory ? t("web.provider.common.update") : t("web.provider.common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
