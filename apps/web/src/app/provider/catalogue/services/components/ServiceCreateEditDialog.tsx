"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChipCombobox } from "@/components/ui/chip-combobox";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { providerApi } from "@/lib/provider-portal/api";
import type { ServiceCategory, TeamMember, ServiceItem } from "@/lib/provider-portal/types";
import Image from "next/image";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import { useReferenceData } from "@/hooks/useReferenceData";
import { AdvancedPricingModal } from "./AdvancedPricingModal";
import { handleError } from "@/lib/provider-portal/error-handler";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { previewBookingTierName } from "@/app/api/provider/services/_helpers/sync-variants";
import { BookingTierCustomerPreview } from "./BookingTierCustomerPreview";
import { formatCurrency } from "@/lib/utils";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

interface ServiceCreateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: any;
  categoryId?: string | null;
  categories: ServiceCategory[];
  onSave: () => void;
  onCategoriesChange?: () => void; // Callback to refresh categories from parent
}

interface PricingOption {
  id: string;
  duration: number;
  priceType: string;
  price: number;
  pricingName: string;
}

export function ServiceCreateEditDialog({
  open,
  onOpenChange,
  service,
  categoryId,
  categories,
  onSave,
  onCategoriesChange,
}: ServiceCreateEditDialogProps) {
  const { t } = useTranslation();
  const { currencyCode, format: fmt } = useReportCurrency();
  // Fetch reference data for all dropdowns
  const { 
    getOptions, 
    isLoading: _isLoadingReferenceData 
  } = useReferenceData([
    "service_type", 
    "duration", 
    "price_type", 
    "availability", 
    "tax_rate", 
    "team_role", 
    "reminder_unit", 
    "extra_time",
    "addon_category"
  ]);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [allServices, setAllServices] = useState<ServiceItem[]>([]);
  const [providerResources, setProviderResources] = useState<Array<{ id: string; name: string; group_name?: string | null }>>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [showIncludedServicesDialog, setShowIncludedServicesDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showTeamMemberDialog, setShowTeamMemberDialog] = useState(false);
  const [showAdvancedPricingModal, setShowAdvancedPricingModal] = useState(false);
  const [advancedPricingRules, setAdvancedPricingRules] = useState<any[]>([]);
  const [pricingOptions, setPricingOptions] = useState<PricingOption[]>([
    { id: "1", duration: 60, priceType: "fixed", price: 0, pricingName: "" }
  ]);
  
  // Category creation form state
  const [categoryFormData, setCategoryFormData] = useState({
    name: "",
    color: "#FF0077",
    description: "",
  });
  
  // Team member creation form state
  const [teamMemberFormData, setTeamMemberFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    role: "staff" as "owner" | "manager" | "staff",
  });
  
  const [formData, setFormData] = useState({
    name: "",
    serviceType: "basic",
    includedServices: [] as string[],
    description: "",
    aftercareDescription: "",
    availableFor: "everyone",
    categoryId: categoryId || "",
    
    onlineBookable: true,
    
    selectedTeamMembers: [] as string[],
    teamMemberCommissionEnabled: false,

    extraTimeEnabled: false,
    extraTimeDuration: 0,
    
    reminderToRebookEnabled: false,
    reminderToRebookWeeks: 4,
    
    serviceCostPercentage: 0,
    
    taxRate: 0,
    isActive: true,
    
    // Location support
    supportsAtSalon: true,
    supportsAtHome: false,
    atHomeRadiusKm: 0,
    atHomePriceAdjustment: 0,
    
    // Add-on specific fields
    addonCategory: "general",
    applicableServiceIds: [] as string[],  // Which services can have this add-on
    isRecommended: false,
    
    // Variant specific fields
    parentServiceId: "",  // Parent service for variants
    variantName: "",  // Short name for variant (e.g., "Short Hair")
    variantSortOrder: 0,

    // {t("web.provider.bookings.detail.resources.title")} (rooms, equipment) for this service
    offeringResources: [] as Array<{ resource_id: string; required: boolean }>,
  });

  const loadProviderResources = async () => {
    try {
      setIsLoadingResources(true);
      const list = await providerApi.listResources();
      setProviderResources((list || []).map((r: any) => ({ id: r.id, name: r.name, group_name: r.group_name ?? null })));
    } catch {
      setProviderResources([]);
    } finally {
      setIsLoadingResources(false);
    }
  };

  // Load team members, services, and resources when dialog opens
  useEffect(() => {
    if (open) {
      loadTeamMembers();
      loadAllServices();
      loadProviderResources();
    }
  }, [open]);

  // Update categoryId when prop changes
  useEffect(() => {
    if (categoryId) {
      setFormData(prev => ({ ...prev, categoryId: categoryId }));
    }
  }, [categoryId]);

  // Update formData when categories change
  useEffect(() => {
    if (categories.length > 0 && !formData.categoryId && categoryId) {
      setFormData(prev => ({ ...prev, categoryId: categoryId }));
    }
    // Reload services when categories change (in case new services were added)
    if (open && categories.length > 0) {
      loadAllServices();
    }
  }, [categories, open]);

  const loadTeamMembers = async () => {
    try {
      setIsLoadingTeam(true);
      const members = await providerApi.listTeamMembers();
      setTeamMembers(members || []);
    } catch (error) {
      handleError(error, {
        action: "loadTeamMembers",
        resource: "team members",
      }, { showToast: false });
      setTeamMembers([]);
    } finally {
      setIsLoadingTeam(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryFormData.name.trim()) {
      toast.error(t("web.provider.catalogue.serviceDialog.categoryNameRequired"));
      return;
    }

    try {
      const newCategory = await providerApi.createServiceCategory({
        name: categoryFormData.name,
        color: categoryFormData.color,
        description: categoryFormData.description,
      });
      toast.success(t("web.provider.catalogue.serviceDialog.categoryCreated"));
      setShowCategoryDialog(false);
      setCategoryFormData({ name: "", color: "#FF0077", description: "" });
      
      // Refresh categories from parent
      if (onCategoriesChange) {
        onCategoriesChange();
      }
      
      // Auto-select the newly created category
      setFormData(prev => ({ ...prev, categoryId: newCategory.id }));
    } catch (error: any) {
      handleError(error, {
        action: "createCategory",
        resource: "service category",
      });
    }
  };

  const handleCreateTeamMember = async () => {
    if (!teamMemberFormData.name.trim() || !teamMemberFormData.email.trim() || !teamMemberFormData.mobile.trim()) {
      toast.error(t("web.provider.catalogue.serviceDialog.nameEmailMobileRequired"));
      return;
    }
    if (!isCompleteE164(teamMemberFormData.mobile)) {
      toast.error(t("web.provider.catalogue.serviceDialog.invalidMobile"));
      return;
    }

    try {
      const newMember = await providerApi.createTeamMember({
        name: teamMemberFormData.name,
        email: teamMemberFormData.email,
        mobile: teamMemberFormData.mobile.trim(),
        role: teamMemberFormData.role === "staff" ? "employee" : teamMemberFormData.role,
      });
      toast.success(t("web.provider.catalogue.serviceDialog.teamMemberCreated"));
      setShowTeamMemberDialog(false);
      setTeamMemberFormData({ name: "", email: "", mobile: "", role: "staff" });
      
      // Refresh team members
      await loadTeamMembers();
      
      // Auto-select the newly created team member
      setFormData(prev => ({
        ...prev,
        selectedTeamMembers: [...prev.selectedTeamMembers, newMember.id],
      }));
    } catch (error: unknown) {
      handleError(error, {
        action: "createTeamMember",
        resource: "team member",
      });
    }
  };

  const loadAllServices = async () => {
    try {
      setIsLoadingServices(true);
      // First try to get all services from categories prop
      const allServicesList: ServiceItem[] = [];
      if (categories && categories.length > 0) {
        categories.forEach(category => {
          if (category.services && category.services.length > 0) {
            category.services.forEach(svc => {
              // Exclude the current service if editing
              if (svc && svc.id !== service?.id) {
                allServicesList.push(svc);
              }
            });
          }
        });
      }
      
      // Always try to fetch from API to ensure we have the latest data
      try {
        const categoriesFromApi = await providerApi.listServiceCategories();
        const apiServicesList: ServiceItem[] = [];
        categoriesFromApi.forEach(category => {
          if (category.services && category.services.length > 0) {
            category.services.forEach(svc => {
              if (svc && svc.id !== service?.id) {
                apiServicesList.push(svc);
              }
            });
          }
        });
        
        // Use API services if available, otherwise fall back to prop services
        if (apiServicesList.length > 0) {
          setAllServices(apiServicesList);
        } else if (allServicesList.length > 0) {
          setAllServices(allServicesList);
        } else {
          setAllServices([]);
        }
      } catch (apiError) {
        console.warn("Failed to fetch services from API, using categories prop:", apiError);
        // Fall back to services from categories prop
        setAllServices(allServicesList);
      }
    } catch (error) {
      handleError(error, {
        action: "loadServices",
        resource: "services",
      }, { showToast: false });
      setAllServices([]);
    } finally {
      setIsLoadingServices(false);
    }
  };

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name || "",
        serviceType: service.service_type || "basic",
        includedServices: service.included_services || [],
        description: service.description || "",
        aftercareDescription: service.aftercare_description || "",
        availableFor: service.service_available_for || "everyone",
        categoryId: service.provider_category_id || service.category_id || categoryId || "",
        
        onlineBookable: service.online_booking_enabled !== false,
        
        selectedTeamMembers: service.team_member_ids || [],
        teamMemberCommissionEnabled: service.team_member_commission_enabled || false,
        
        extraTimeEnabled: service.extra_time_enabled || false,
        extraTimeDuration: service.extra_time_duration || 0,
        
        reminderToRebookEnabled: service.reminder_to_rebook_enabled || false,
        reminderToRebookWeeks: service.reminder_to_rebook_weeks || 4,
        
        serviceCostPercentage: service.service_cost_percentage || 0,
        
        taxRate: service.tax_rate || 0,
        isActive: service.is_active !== false,
        
        // Location support
        supportsAtSalon: service.supports_at_salon !== false,
        supportsAtHome: service.supports_at_home || false,
        atHomeRadiusKm: service.at_home_radius_km || 0,
        atHomePriceAdjustment: service.at_home_price_adjustment || 0,
        
        // Add-on specific fields
        addonCategory: service.addon_category || "general",
        applicableServiceIds: service.applicable_service_ids || [],
        isRecommended: service.is_recommended || false,
        
        // Variant specific fields
        parentServiceId: service.parent_service_id || "",
        variantName: service.variant_name || "",
        variantSortOrder: service.variant_sort_order || 0,
        offeringResources: [],
      });
      
      // Load pricing options if they exist
      if (service.pricing_options && Array.isArray(service.pricing_options)) {
        setPricingOptions(service.pricing_options);
      } else if (service.duration_minutes || service.price) {
        setPricingOptions([{
          id: "1",
          duration: service.duration_minutes || 60,
          priceType: service.price_type || "fixed",
          price: service.price || 0,
          pricingName: service.pricing_name || "",
        }]);
      }
      
      // Load advanced pricing rules if they exist
      if (service.advanced_pricing_rules && Array.isArray(service.advanced_pricing_rules)) {
        setAdvancedPricingRules(service.advanced_pricing_rules);
      } else {
        setAdvancedPricingRules([]);
      }

      // Load resource requirements for this service
      providerApi.getServiceResources(service.id).then((resList) => {
        setFormData((prev) => ({ ...prev, offeringResources: Array.isArray(resList) ? resList : [] }));
      }).catch(() => {
        setFormData((prev) => ({ ...prev, offeringResources: [] }));
      });
    } else {
      setFormData({
        name: "",
        serviceType: "basic",
        includedServices: [],
        description: "",
        aftercareDescription: "",
        availableFor: "everyone",
        categoryId: categoryId || "",
        onlineBookable: true,
        selectedTeamMembers: [],
        teamMemberCommissionEnabled: false,
        extraTimeEnabled: false,
        extraTimeDuration: 0,
        reminderToRebookEnabled: false,
        reminderToRebookWeeks: 4,
        serviceCostPercentage: 0,
        taxRate: 0,
        isActive: true,
        
        // Location support defaults
        supportsAtSalon: true,
        supportsAtHome: false,
        atHomeRadiusKm: 0,
        atHomePriceAdjustment: 0,
        
        // Add-on defaults
        addonCategory: "general",
        applicableServiceIds: [],
        isRecommended: false,
        
        // Variant defaults
        parentServiceId: "",
        variantName: "",
        variantSortOrder: 0,

        offeringResources: [],
      });
      setPricingOptions([{ id: "1", duration: 60, priceType: "fixed", price: 0, pricingName: "" }]);
    }
  }, [service, categoryId, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error(t("web.provider.catalogue.serviceDialog.nameRequired"));
      return;
    }
    if (!formData.categoryId) {
      toast.error(t("web.provider.catalogue.serviceDialog.categoryRequired"));
      return;
    }
    
    // Validate variant fields
    if (formData.serviceType === "variant") {
      if (!formData.parentServiceId) {
        toast.error(t("web.provider.catalogue.serviceDialog.parentRequired"));
        return;
      }
    }

    if (pricingOptions.length > 1) {
      for (let i = 1; i < pricingOptions.length; i += 1) {
        const row = pricingOptions[i];
        if (!row.duration || row.duration <= 0) {
          toast.error(t("web.provider.catalogue.serviceDialog.tierDuration", { n: i + 1 }));
          return;
        }
        if (row.price == null || Number.isNaN(row.price) || row.price < 0) {
          toast.error(t("web.provider.catalogue.serviceDialog.tierPrice", { n: i + 1 }));
          return;
        }
      }
      const explicitNames = pricingOptions.map((row) => row.pricingName.trim()).filter(Boolean);
      if (new Set(explicitNames).size !== explicitNames.length) {
        toast.error(t("web.provider.catalogue.serviceDialog.tierNameUnique"));
        return;
      }
    }
    
    try {
      // Prepare service data with all fields
      const serviceData: any = {
        name: formData.name,
        service_type: formData.serviceType,
        provider_category_id: formData.categoryId,
        description: formData.description,
        aftercare_description: formData.aftercareDescription,
        service_available_for: formData.availableFor,
        online_booking_enabled: formData.onlineBookable,
        team_member_ids: formData.selectedTeamMembers,
        team_member_commission_enabled: formData.teamMemberCommissionEnabled,
        duration_minutes: primaryPricing.duration,
        price: primaryPricing.price,
        price_type: primaryPricing.priceType,
        pricing_name: primaryPricing.pricingName,
        pricing_options: pricingOptions,
        advanced_pricing_rules: advancedPricingRules,
        extra_time_enabled: formData.extraTimeEnabled,
        extra_time_duration: formData.extraTimeDuration,
        reminder_to_rebook_enabled: formData.reminderToRebookEnabled,
        reminder_to_rebook_weeks: formData.reminderToRebookWeeks,
        service_cost_percentage: formData.serviceCostPercentage,
        tax_rate: formData.taxRate,
        included_services: formData.includedServices,
        is_active: formData.isActive,
        
        // Location support
        supports_at_salon: formData.supportsAtSalon,
        supports_at_home: formData.supportsAtHome,
        at_home_radius_km: formData.supportsAtHome ? formData.atHomeRadiusKm : null,
        at_home_price_adjustment: formData.supportsAtHome ? formData.atHomePriceAdjustment : 0,
        
        // Add-on specific fields
        addon_category: formData.serviceType === "addon" ? formData.addonCategory : null,
        applicable_service_ids: formData.serviceType === "addon" && formData.applicableServiceIds.length > 0 
          ? formData.applicableServiceIds 
          : null,
        is_recommended: formData.serviceType === "addon" ? formData.isRecommended : false,
        
        // Variant specific fields
        parent_service_id: formData.serviceType === "variant" ? formData.parentServiceId || null : null,
        variant_name: formData.serviceType === "variant" ? formData.variantName || null : null,
        variant_sort_order: formData.serviceType === "variant" ? formData.variantSortOrder : 0,
      };
      
      let savedServiceId: string;
      let variantSync: { synced?: number; errors?: string[] } | undefined;
      if (service) {
        const updated = await providerApi.updateService(service.id, serviceData) as ServiceItem & {
          variant_sync?: { synced?: number; errors?: string[] };
        };
        savedServiceId = service.id;
        variantSync = updated.variant_sync;
      } else {
        const created = await providerApi.createService(serviceData) as ServiceItem & {
          variant_sync?: { synced?: number; errors?: string[] };
        };
        savedServiceId = created.id;
        variantSync = created.variant_sync;
      }
      if (pricingOptions.length > 1 && variantSync?.errors?.length) {
        toast.warning(t("web.provider.catalogue.serviceDialog.tierSyncIssue", { error: variantSync.errors[0] }));
      } else if (pricingOptions.length > 1 && variantSync?.synced != null) {
        toast.success(
          t("web.provider.catalogue.serviceDialog.tiersSynced", { count: variantSync.synced }),
        );
      } else {
        toast.success(service ? t("web.provider.catalogue.serviceDialog.updated") : t("web.provider.catalogue.serviceDialog.created"));
      }
      if (formData.offeringResources?.length) {
        await providerApi.setServiceResources(savedServiceId, formData.offeringResources);
      } else {
        await providerApi.setServiceResources(savedServiceId, []);
      }
      invalidateSetupStatusCache();
      onSave();
    } catch (error: any) {
      handleError(error, {
        action: service ? "updateService" : "createService",
        resource: "service",
      });
    }
  };

  const handleSelectAllTeamMembers = (checked: boolean) => {
    if (checked) {
      setFormData({
        ...formData,
        selectedTeamMembers: teamMembers.map(m => m.id),
      });
    } else {
      setFormData({
        ...formData,
        selectedTeamMembers: [],
      });
    }
  };

  const handleTeamMemberToggle = (memberId: string, checked: boolean) => {
    if (checked) {
      setFormData({
        ...formData,
        selectedTeamMembers: [...formData.selectedTeamMembers, memberId],
      });
    } else {
      setFormData({
        ...formData,
        selectedTeamMembers: formData.selectedTeamMembers.filter(id => id !== memberId),
      });
    }
  };

  const handleIncludedServiceToggle = (serviceId: string, checked: boolean) => {
    if (checked) {
      setFormData({
        ...formData,
        includedServices: [...formData.includedServices, serviceId],
      });
    } else {
      setFormData({
        ...formData,
        includedServices: formData.includedServices.filter(id => id !== serviceId),
      });
    }
  };

  const handleAddPricingOption = () => {
    setPricingOptions([
      ...pricingOptions,
      { id: Date.now().toString(), duration: 60, priceType: "fixed", price: 0, pricingName: "" }
    ]);
  };

  const handleRemovePricingOption = (id: string) => {
    if (pricingOptions.length > 1) {
      setPricingOptions(pricingOptions.filter(opt => opt.id !== id));
    }
  };

  const handlePricingOptionChange = (id: string, field: keyof PricingOption, value: any) => {
    setPricingOptions(pricingOptions.map(opt => 
      opt.id === id ? { ...opt, [field]: value } : opt
    ));
  };

  const allTeamMembersSelected = teamMembers.length > 0 && formData.selectedTeamMembers.length === teamMembers.length;
  const primaryPricing: PricingOption = pricingOptions[0] || { id: "1", duration: 60, priceType: "fixed", price: 0, pricingName: "" };
  const serviceCostAmount = primaryPricing.price > 0 && formData.serviceCostPercentage > 0
    ? (primaryPricing.price * formData.serviceCostPercentage / 100)
    : 0;

  const includedServicesList = allServices.filter(s => formData.includedServices.includes(s.id));
  const availableServicesForInclusion = allServices.filter(s => s.id !== service?.id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl lg:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="px-0 sm:px-0">
            <DialogTitle className="text-lg sm:text-xl">{service ? t("provider.mobile.screens.serviceForm.editTitle") : t("web.provider.catalogue.serviceDialog.createTitle")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">
              {service ? t("web.provider.catalogue.serviceDialog.updateDetails") : t("web.provider.catalogue.serviceDialog.createDescription")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 px-0 sm:px-0">
            
            {/* Basic Info */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">{t("web.provider.catalogue.serviceDialog.basicInfo")}</h3>
              </div>
              
              <div>
                <Label htmlFor="name" className="text-sm sm:text-base">{t("provider.mobile.screens.serviceForm.serviceName")}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("web.provider.catalogue.serviceDialog.namePlaceholder")}
                  required
                  className="mt-1.5"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  {t("web.provider.catalogue.serviceDialog.nameHintPrefix")} <strong>{t("web.provider.catalogue.serviceDialog.nameHintStrong")}</strong> {t("web.provider.catalogue.serviceDialog.nameHintSuffix")}
                </p>
              </div>
              
              <div>
                <Label htmlFor="serviceType" className="text-sm sm:text-base">{t("provider.mobile.screens.serviceForm.serviceType")}</Label>
                <Select 
                  value={formData.serviceType} 
                  onValueChange={(val) => setFormData({ ...formData, serviceType: val })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder={t("web.provider.catalogue.serviceDialog.selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {getOptions("service_type").map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}{option.description ? ` (${option.description})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.typeHint")}</p>
                {formData.serviceType === "variant" ? (
                  <p className="text-xs text-amber-700 mt-1.5">
                    {t("web.provider.catalogue.serviceDialog.variantTip")}
                  </p>
                ) : formData.serviceType === "basic" ? (
                  <p className="text-xs text-gray-500 mt-1.5">
                    {t("provider.mobile.screens.serviceForm.basicHint")}
                  </p>
                ) : null}
              </div>

              {formData.serviceType === "package" && (
                <div>
                  <Label className="text-sm sm:text-base">{t("provider.mobile.screens.serviceForm.includedServices")}</Label>
                  <div className="border rounded-md p-3 bg-pink-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 text-sm min-h-[48px] mt-1.5">
                    {formData.includedServices.length === 0 ? (
                      <span className="text-gray-500 text-xs sm:text-sm">{t("web.provider.catalogue.serviceDialog.noServicesIncluded")}</span>
                    ) : (
                      <div className="flex flex-wrap gap-2 flex-1">
                        {includedServicesList.map(service => (
                          <span key={service.id} className="px-2 py-1 bg-white rounded text-xs">
                            {service.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <Button 
                      type="button"
                      variant="link" 
                      className="text-primary p-0 h-auto text-xs sm:text-sm whitespace-nowrap"
                      onClick={() => setShowIncludedServicesDialog(true)}
                      disabled={allServices.length === 0}
                    >
                      {formData.includedServices.length === 0 ? t("common.add") : t("common.edit")}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.includedHint")}</p>
                </div>
              )}

              {/* Add-on specific fields */}
              {formData.serviceType === "addon" && (
                <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 text-blue-700 font-medium">
                    <Plus className="w-4 h-4" />
                    <span>{t("web.provider.catalogue.serviceDialog.addonConfig")}</span>
                  </div>
                  
                  <div>
                    <Label className="text-sm sm:text-base">{t("provider.mobile.screens.serviceForm.addonCategory")}</Label>
                    <Select 
                      value={formData.addonCategory} 
                      onValueChange={(val) => setFormData({ ...formData, addonCategory: val })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder={t("web.provider.portal.newSaleDialog.selectCategory")} />
                      </SelectTrigger>
                      <SelectContent>
                        {getOptions("addon_category").map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.addonCategoryHint")}</p>
                  </div>

                  <div>
                    <Label className="text-sm sm:text-base">{t("provider.mobile.screens.serviceForm.applicableServices")}</Label>
                    <div className="border rounded-md p-3 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 text-sm min-h-[48px] mt-1.5">
                      {formData.applicableServiceIds.length === 0 ? (
                        <span className="text-gray-500 text-xs sm:text-sm">{t("web.provider.catalogue.serviceDialog.availableAllServices")}</span>
                      ) : (
                        <div className="flex flex-wrap gap-2 flex-1">
                          {formData.applicableServiceIds.map(serviceId => {
                            const svc = allServices.find(s => s.id === serviceId);
                            return (
                              <span key={serviceId} className="px-2 py-1 bg-blue-100 rounded text-xs">
                                {svc?.name || serviceId}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <Button 
                        type="button"
                        variant="link" 
                        className="text-primary p-0 h-auto text-xs sm:text-sm whitespace-nowrap"
                        onClick={() => setShowIncludedServicesDialog(true)}
                        disabled={allServices.length === 0}
                      >
                        {formData.applicableServiceIds.length === 0 ? t("web.provider.catalogue.serviceDialog.restrict") : t("common.edit")}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.applicableHint")}</p>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                    <Switch
                      checked={formData.isRecommended}
                      onCheckedChange={(checked) => setFormData({ ...formData, isRecommended: checked })}
                    />
                    <div className="flex-1">
                      <Label className="font-medium text-sm sm:text-base cursor-pointer">{t("provider.mobile.screens.serviceForm.recommendedAddon")}</Label>
                      <p className="text-xs text-gray-500 mt-0.5">{t("web.provider.catalogue.serviceDialog.recommendedHint")}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Variant specific fields */}
              {formData.serviceType === "variant" && (
                <div className="space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center gap-2 text-purple-700 font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>{t("web.provider.catalogue.serviceDialog.variantConfig")}</span>
                  </div>
                  
                  <div>
                    <Label className="text-sm sm:text-base">{t("provider.mobile.screens.serviceForm.parentServiceRequired")}</Label>
                    {isLoadingServices ? (
                      <div className="mt-1.5 p-3 border rounded-md bg-gray-50 text-sm text-gray-500">
                        {t("web.provider.catalogue.serviceDialog.loadingServices")}
                      </div>
                    ) : (
                      <Select 
                        value={formData.parentServiceId} 
                        onValueChange={(val) => setFormData({ ...formData, parentServiceId: val })}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder={t("provider.mobile.screens.serviceForm.selectParentService")} />
                        </SelectTrigger>
                        <SelectContent>
                          {allServices
                            .filter(s => {
                              // Include basic services or services without a type (defaults to basic)
                              const isBasic = !s.service_type || s.service_type === "basic";
                              // Exclude the current service if editing
                              const isNotCurrent = s.id !== service?.id;
                              // Exclude variants (only basic services can be parents)
                              const isNotVariant = s.service_type !== "variant";
                              return isBasic && isNotCurrent && isNotVariant;
                            })
                            .map((svc) => (
                              <SelectItem key={svc.id} value={svc.id}>
                                {svc.name}
                              </SelectItem>
                            ))}
                          {allServices.filter(s => {
                            const isBasic = !s.service_type || s.service_type === "basic";
                            const isNotCurrent = s.id !== service?.id;
                            const isNotVariant = s.service_type !== "variant";
                            return isBasic && isNotCurrent && isNotVariant;
                          }).length === 0 && (
                            <div className="p-2 text-sm text-gray-500 text-center">
                              {t("web.provider.catalogue.serviceDialog.noBasicServices")}
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                    <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.variantGroupedHint")}</p>
                    {!isLoadingServices && allServices.filter(s => {
                      const isBasic = !s.service_type || s.service_type === "basic";
                      const isNotCurrent = s.id !== service?.id;
                      const isNotVariant = s.service_type !== "variant";
                      return isBasic && isNotCurrent && isNotVariant;
                    }).length === 0 && (
                      <p className="text-xs text-amber-600 mt-1.5">
                        {t("web.provider.catalogue.serviceDialog.createBasicFirst")}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label className="text-sm sm:text-base">{t("provider.mobile.screens.serviceForm.variantName")}</Label>
                    <Input
                      value={formData.variantName}
                      onChange={(e) => setFormData({ ...formData, variantName: e.target.value })}
                      placeholder={t("web.provider.catalogue.serviceDialog.variantNamePlaceholder")}
                      className="mt-1.5"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.variantNameHint")}</p>
                  </div>

                  <div>
                    <Label className="text-sm sm:text-base">{t("provider.mobile.screens.serviceForm.sortOrder")}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.variantSortOrder}
                      onChange={(e) => setFormData({ ...formData, variantSortOrder: parseInt(e.target.value) || 0 })}
                      className="mt-1.5"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.sortOrderHint")}</p>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor="categoryId" className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.serviceCategoryRequired")}</Label>
                  <Button
                    type="button"
                    variant="link"
                    className="text-primary p-0 h-auto text-xs sm:text-sm"
                    onClick={() => setShowCategoryDialog(true)}
                  >
                    <Plus className="w-3 h-3 me-1" />
                    {t("web.provider.catalogue.serviceDialog.addCategory")}
                  </Button>
                </div>
                <div className="mt-1.5">
                  <ChipCombobox
                    singleSelect
                    value={formData.categoryId || null}
                    onChange={(v) => setFormData((prev) => ({ ...prev, categoryId: v ?? "" }))}
                    staticSuggestions={categories.map((cat) => ({ value: cat.id, label: cat.name }))}
                    onCreateNew={async (name) => {
                      try {
                        const newCategory = await providerApi.createServiceCategory({
                          name: name.trim(),
                          color: "#FF0077",
                          description: "",
                        });
                        if (onCategoriesChange) onCategoriesChange();
                        return { value: newCategory.id, label: newCategory.name };
                      } catch (err: any) {
                        handleError(err, { action: "createCategory", resource: "service category" });
                        return null;
                      }
                    }}
                    placeholder={t("web.provider.catalogue.serviceDialog.selectOrTypeCategory")}
                    aria-label={t("provider.mobile.screens.catalogueDetail.serviceCategoryA11y")}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.groupHint")}</p>
              </div>

              <div>
                <Label htmlFor="description" className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.descriptionOptional")}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("web.provider.catalogue.serviceDialog.descriptionPlaceholder")}
                  rows={3}
                  className="mt-1.5"
                />
                <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.descriptionHint")}</p>
              </div>

              <div>
                <Label htmlFor="aftercare" className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.aftercareOptional")}</Label>
                <Textarea
                  id="aftercare"
                  value={formData.aftercareDescription}
                  onChange={(e) => setFormData({ ...formData, aftercareDescription: e.target.value })}
                  placeholder={t("web.provider.catalogue.serviceDialog.aftercarePlaceholder")}
                  rows={3}
                  className="mt-1.5"
                />
                <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.aftercareHint")}</p>
              </div>

              <div>
                <Label htmlFor="availableFor" className="text-sm sm:text-base">{t("provider.mobile.screens.serviceForm.availableFor")}</Label>
                <Select 
                  value={formData.availableFor} 
                  onValueChange={(val) => setFormData({ ...formData, availableFor: val })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder={t("provider.mobile.screens.customerVisibility.modeEveryone")} />
                  </SelectTrigger>
                  <SelectContent>
                    {getOptions("availability").map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.availableForHint")}</p>
              </div>
            </div>

            <Separator />

            {/* {t("web.provider.catalogue.serviceDialog.locationSupport")} */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-1">{t("web.provider.catalogue.serviceDialog.locationSupport")}</h3>
                <p className="text-xs sm:text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.locationSupportHint")}</p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <Switch
                    checked={formData.supportsAtSalon}
                    onCheckedChange={(checked) => setFormData({ ...formData, supportsAtSalon: checked })}
                  />
                  <div className="flex-1">
                    <Label className="font-medium text-sm sm:text-base cursor-pointer">{t("web.provider.catalogue.serviceDialog.availableAtSalon")}</Label>
                    <p className="text-xs text-gray-500 mt-0.5">{t("web.provider.catalogue.serviceDialog.availableAtSalonHint")}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <Switch
                    checked={formData.supportsAtHome}
                    onCheckedChange={async (checked) => {
                      if (checked) {
                        // Validate that provider has selected service zones
                        try {
                          const { fetcher } = await import("@/lib/http/fetcher");
                          const response = await fetcher.get<{ data: any[] }>("/api/provider/zone-selections");
                          const selectedZones = (response.data || []).filter((z: any) => z.is_selected);
                          
                          if (selectedZones.length === 0) {
                            toast.error(t("web.provider.catalogue.serviceDialog.zonesRequiredToast"));
                            setTimeout(() => {
                              window.location.href = "/provider/settings/service-zones";
                            }, 2000);
                            return;
                          }
                        } catch (error) {
                          console.error("Failed to check zone selections:", error);
                          toast.error(t("web.provider.catalogue.serviceDialog.zonesVerifyFailed"));
                          return;
                        }
                      }
                      setFormData({ ...formData, supportsAtHome: checked });
                    }}
                  />
                  <div className="flex-1">
                    <Label className="font-medium text-sm sm:text-base cursor-pointer">{t("web.provider.catalogue.serviceDialog.availableAtHome")}</Label>
                    <p className="text-xs text-gray-500 mt-0.5">{t("web.provider.catalogue.serviceDialog.availableAtHomeHint")}</p>
                  </div>
                </div>
                
                {formData.supportsAtHome && (
                  <div className="ms-0 sm:ms-12 space-y-3 sm:space-y-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <Label htmlFor="atHomeRadius" className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.maxRadius")}</Label>
                      <Input
                        id="atHomeRadius"
                        type="number"
                        min="0"
                        step="0.1"
                        value={formData.atHomeRadiusKm}
                        onChange={(e) => setFormData({ ...formData, atHomeRadiusKm: parseFloat(e.target.value) || 0 })}
                        placeholder={t("web.provider.catalogue.serviceDialog.radiusPlaceholder")}
                        className="mt-1.5"
                      />
                      <p className="text-xs text-gray-500 mt-1.5">{t("web.provider.catalogue.serviceDialog.radiusHint")}</p>
                    </div>
                    
                    <div>
                      <Label htmlFor="atHomePriceAdjustment" className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.homePriceAdj")}</Label>
                      <Input
                        id="atHomePriceAdjustment"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.atHomePriceAdjustment}
                        onChange={(e) => setFormData({ ...formData, atHomePriceAdjustment: parseFloat(e.target.value) || 0 })}
                        placeholder={t("web.provider.catalogue.serviceDialog.homePricePlaceholder")}
                        className="mt-1.5"
                      />
                      <p className="text-xs text-gray-500 mt-1.5">{t("provider.mobile.screens.serviceForm.atHomePriceHint")}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {(formData.serviceType === "basic" || formData.serviceType === "variant") && (
              <>
                <Separator />
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold mb-1">{t("web.provider.bookings.detail.resources.title")}</h3>
                    <p className="text-xs sm:text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.resourceHint")}</p>
                  </div>
                  {isLoadingResources ? (
                    <p className="text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.loadingResources")}</p>
                  ) : providerResources.length === 0 ? (
                    <p className="text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.noResources")}</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                      {providerResources.map((res) => {
                        const entry = formData.offeringResources?.find((o) => o.resource_id === res.id);
                        const isRequired = entry?.required === true;
                        const isOptional = entry?.required === false;
                        return (
                          <div key={res.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-200 last:border-0">
                            <span className="text-sm font-medium truncate">{res.name}{res.group_name ? ` (${res.group_name})` : ""}</span>
                            <div className="flex items-center gap-3 shrink-0">
                              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <Checkbox
                                  checked={isRequired}
                                  onCheckedChange={(checked) => {
                                    const next = (formData.offeringResources || []).filter((o) => o.resource_id !== res.id);
                                    if (checked) next.push({ resource_id: res.id, required: true });
                                    setFormData({ ...formData, offeringResources: next });
                                  }}
                                />
                                {t("common.required")}
                              </label>
                              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <Checkbox
                                  checked={isOptional}
                                  onCheckedChange={(checked) => {
                                    const next = (formData.offeringResources || []).filter((o) => o.resource_id !== res.id);
                                    if (checked) next.push({ resource_id: res.id, required: false });
                                    setFormData({ ...formData, offeringResources: next });
                                  }}
                                />
                                {t("common.optional")}
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />

            {/* {t("provider.mobile.screens.onlineBooking.title")} */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-1">{t("provider.mobile.screens.onlineBooking.title")}</h3>
                <p className="text-xs sm:text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.onlineBookingHint")}</p>
              </div>
              <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
                <Switch
                  checked={formData.onlineBookable}
                  onCheckedChange={(checked) => setFormData({ ...formData, onlineBookable: checked })}
                />
                <div className="flex-1">
                  <Label className="font-medium text-sm sm:text-base cursor-pointer">{t("web.provider.catalogue.serviceDialog.enableOnline")}</Label>
                  <p className="text-xs text-gray-500 mt-0.5">{t("web.provider.catalogue.serviceDialog.enableOnlineHint")}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Team */}
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="text-base sm:text-lg font-semibold mb-1">{t("web.provider.catalogue.serviceDialog.assignTeam")}</h3>
                  <p className="text-xs sm:text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.assignTeamHint")}</p>
                </div>
                <Button
                  type="button"
                  variant="link"
                  className="text-primary p-0 h-auto text-xs sm:text-sm whitespace-nowrap flex-shrink-0 mt-1"
                  onClick={() => setShowTeamMemberDialog(true)}
                >
                  <Plus className="w-3 h-3 me-1" />
                  {t("web.provider.catalogue.serviceDialog.addMember")}
                </Button>
              </div>
              
              {isLoadingTeam ? (
                <div className="text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.loadingTeam")}</div>
              ) : (
                <>
                  {teamMembers.length > 0 ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Checkbox 
                          id="selectAll" 
                          checked={allTeamMembersSelected}
                          onCheckedChange={handleSelectAllTeamMembers}
                        />
                        <Label htmlFor="selectAll" className="font-normal cursor-pointer text-sm">{t("common.selectAll")}</Label>
                      </div>
                      
                      <div className="space-y-2 ps-1">
                        {teamMembers.map((member) => (
                          <div key={member.id} className="flex items-center gap-3">
                            <Checkbox 
                              id={`tm-${member.id}`}
                              checked={formData.selectedTeamMembers.includes(member.id)}
                              onCheckedChange={(checked) => handleTeamMemberToggle(member.id, checked as boolean)}
                            />
                            <div className="relative w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                              {member.avatar_url ? (
                                <Image src={member.avatar_url} alt={member.name} fill className="object-cover" unoptimized />
                              ) : (
                                <span className="text-xs text-gray-500">{member.name.charAt(0)}</span>
                              )}
                            </div>
                            <Label htmlFor={`tm-${member.id}`} className="font-normal cursor-pointer text-sm">{member.name}</Label>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="border rounded-lg p-3 sm:p-4 bg-gray-50">
                      <p className="text-sm text-gray-500 mb-2">{t("web.provider.catalogue.serviceDialog.noTeam")}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => setShowTeamMemberDialog(true)}
                      >
                        <Plus className="w-4 h-4 me-2" />
                        {t("web.provider.catalogue.serviceDialog.addFirstMember")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            <Separator />

            {/* Commission */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-1">{t("web.provider.catalogue.serviceDialog.commissionTitle")}</h3>
                <p className="text-xs sm:text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.commissionHint")}</p>
              </div>
              <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
                <Switch
                  checked={formData.teamMemberCommissionEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, teamMemberCommissionEnabled: checked })}
                />
                <div className="flex-1">
                  <Label className="font-medium text-sm sm:text-base cursor-pointer">{t("web.provider.catalogue.productDialog.enableCommission")}</Label>
                  <p className="text-xs text-gray-500 mt-0.5">{t("web.provider.catalogue.serviceDialog.enableCommissionHint")}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Price & booking options */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-1">
                  {formData.serviceType === "variant"
                    ? t("provider.mobile.screens.pricingOptions.priceDuration")
                    : pricingOptions.length > 1
                      ? t("provider.mobile.screens.pricingOptions.bookingOptions")
                      : t("provider.mobile.screens.pricingOptions.priceDuration")}
                </h3>
                <p className="text-xs sm:text-sm text-gray-500">
                  {formData.serviceType === "variant"
                    ? t("provider.mobile.screens.pricingOptions.priceDurationVariantHint")
                    : pricingOptions.length > 1
                      ? t("provider.mobile.screens.pricingOptions.bookingOptionsHint")
                      : t("web.provider.catalogue.serviceDialog.oneFixedPrice")}
                </p>
              </div>

              {formData.serviceType !== "variant" && pricingOptions.length > 1 ? (
                <BookingTierCustomerPreview
                  options={pricingOptions}
                  primaryPricingName={primaryPricing.pricingName || null}
                  serviceTitle={formData.name.trim() || undefined}
                  currencyCode={currencyCode}
                />
              ) : null}
              
              {pricingOptions.map((option, index) => {
                const previewName = previewBookingTierName(
                  option,
                  index,
                  primaryPricing.pricingName || null,
                );
                return (
                <div
                  key={option.id}
                  className={`border rounded-xl p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-hidden ${
                    pricingOptions.length > 1 && index === 0
                      ? "border-indigo-200 bg-indigo-50/30"
                      : "bg-gray-50/50"
                  }`}
                >
                  {pricingOptions.length > 1 && formData.serviceType !== "variant" ? (
                    <div
                      className={`flex justify-between items-center gap-3 border-b pb-3 -mx-3 sm:-mx-4 px-3 sm:px-4 ${
                        index === 0 ? "border-indigo-100" : "border-gray-100"
                      }`}
                    >
                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                          {previewName}
                          {index === 0 ? (
                            <span className="text-xs font-normal text-gray-500"> · default in catalogue</span>
                          ) : null}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {option.duration} min · {formatCurrency(option.price, currencyCode)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 touch-manipulation text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleRemovePricingOption(option.id)}
                        aria-label={t("web.provider.catalogue.serviceDialog.removeTierAria", { name: previewName })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <h4 className="text-sm sm:text-base font-medium text-gray-700 sr-only">{t("web.provider.catalogue.serviceDialog.defaultPricing")}</h4>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.durationRequired")}</Label>
                      <Select 
                        value={option.duration.toString()} 
                        onValueChange={(val) => handlePricingOptionChange(option.id, "duration", parseInt(val))}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder={t("web.provider.catalogue.serviceDialog.selectDuration")} />
                        </SelectTrigger>
                        <SelectContent>
                          {getOptions("duration").map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
<Label className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.priceType")}</Label>
                      <Select 
                        value={option.priceType} 
                        onValueChange={(val) => handlePricingOptionChange(option.id, "priceType", val)}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder={t("provider.mobile.screens.cancellationPolicies.feeTypeFixed")} />
                        </SelectTrigger>
                        <SelectContent>
                          {getOptions("price_type").map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
<Label className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.priceRequired")}</Label>
                    <div className="relative mt-1.5">
                      <span className="absolute start-3 top-2.5 text-gray-500 text-sm">{currencyCode}</span>
                      <Input 
                        type="number" 
                        step="0.01"
                        min="0"
                        className="ps-12"
                        value={option.price || ""}
                        onChange={(e) => handlePricingOptionChange(option.id, "price", parseFloat(e.target.value) || 0)}
placeholder={t("web.provider.portal.newSaleDialog.pricePlaceholder")}
                      />
                    </div>
                    {pricingOptions.length === 1 ? (
                      <p className="text-xs text-gray-500 mt-1.5">
                        {t("web.provider.catalogue.serviceDialog.shownToCustomers")}
                      </p>
                    ) : null}
                  </div>

                  {pricingOptions.length > 1 && formData.serviceType !== "variant" ? (
                    <div>
                      <Label className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.customerFacingLabel")}</Label>
                      <Input
                        placeholder={previewName}
                        value={option.pricingName}
                        onChange={(e) => handlePricingOptionChange(option.id, "pricingName", e.target.value)}
                        className="mt-1.5"
                      />
                      {!option.pricingName.trim() ? (
                        <p className="text-xs text-gray-500 mt-1.5">
                          {t("web.provider.catalogue.serviceDialog.leaveBlankPreview", { name: previewName })}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {index === 0 && formData.serviceType !== "variant" && (
                    <Button 
                      type="button"
                      variant="link" 
                      className="text-primary p-0 h-auto"
                      onClick={() => {
                        setShowAdvancedPricingModal(true);
                      }}
                    >
                      {t("web.provider.catalogue.serviceDialog.advancedPricing")}
                      {advancedPricingRules.length > 0 && (
                        <span className="ms-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          {t("web.provider.catalogue.serviceDialog.activeCount", { count: advancedPricingRules.filter(r => r.enabled).length })}
                        </span>
                      )}
                    </Button>
                  )}
                </div>
                );
              })}

              {formData.serviceType !== "variant" && pricingOptions.length === 1 ? (
                <button
                  type="button"
                  onClick={handleAddPricingOption}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-start transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 touch-manipulation min-h-[44px]"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-full border border-gray-200 bg-white p-2 text-indigo-600">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {t("web.provider.catalogue.serviceDialog.offerMultiplePrices")}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        {t("web.provider.catalogue.serviceDialog.offerMultiplePricesHint")}
                      </p>
                    </div>
                  </div>
                </button>
              ) : formData.serviceType !== "variant" && pricingOptions.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-sm sm:text-base min-h-[44px] touch-manipulation border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50/50"
                  onClick={handleAddPricingOption}
                >
                  <Plus className="w-4 h-4 me-2" />
                  {t("web.provider.catalogue.serviceDialog.addAnotherOption")}
                </Button>
              ) : null}
            </div>

            <Separator />

            {/* Extra Time */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-1">{t("web.provider.catalogue.serviceDialog.extraTimeTitle")}</h3>
                <p className="text-xs sm:text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.extraTimeHint")}</p>
              </div>
              <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
                <Switch
                  checked={formData.extraTimeEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, extraTimeEnabled: checked })}
                />
                <div className="flex-1">
                  <Label className="font-medium text-sm sm:text-base cursor-pointer">{t("web.provider.catalogue.serviceDialog.enableExtraTime")}</Label>
                  <p className="text-xs text-gray-500 mt-0.5">{t("web.provider.catalogue.serviceDialog.extraTimeSwitchHint")}</p>
                </div>
              </div>
              {formData.extraTimeEnabled && (
                <div className="mt-2 w-full sm:w-1/2">
                  <Label>{t("common.duration")}</Label>
                  <Select 
                    value={formData.extraTimeDuration.toString()} 
                    onValueChange={(val) => setFormData({ ...formData, extraTimeDuration: parseInt(val) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("web.provider.catalogue.serviceDialog.extraTimePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {getOptions("extra_time").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Separator />

            {/* Notification settings */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold">{t("web.provider.catalogue.serviceDialog.notificationSettings")}</h3>
              <p className="text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.notificationSettingsHint")}</p>
              
              <div className="border rounded-lg p-3 sm:p-4 bg-gray-50">
                <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <Checkbox 
                    id="rebook" 
                    checked={formData.reminderToRebookEnabled}
                    onCheckedChange={(c: boolean) => setFormData({ ...formData, reminderToRebookEnabled: c })}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label htmlFor="rebook" className="font-medium text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.reminderToRebookNotifications")}</Label>
                    <p className="text-xs text-gray-500 mt-1">{t("web.provider.catalogue.serviceDialog.reminderToRebookHint")}</p>
                  </div>
                </div>
                
                {formData.reminderToRebookEnabled && (
                  <div className="grid grid-cols-2 gap-2 sm:gap-4">
                    <Input 
                      type="number" 
                      value={formData.reminderToRebookWeeks}
                      onChange={(e) => setFormData({ ...formData, reminderToRebookWeeks: parseInt(e.target.value) || 0 })}
                      placeholder="4"
                    />
                    <Select 
                      value="weeks"
                      onValueChange={() => {/* Currently only weeks supported */}}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getOptions("reminder_unit").map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Service Cost */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold">{t("web.provider.catalogue.serviceDialog.serviceCost")}</h3>
              <p className="text-xs sm:text-sm text-gray-500">{t("web.provider.catalogue.serviceDialog.serviceCostHint")}</p>
              <div className="border rounded-lg p-3 sm:p-4">
                <Label className="text-sm sm:text-base mb-2 block">{t("web.provider.catalogue.serviceDialog.serviceCostPercentage")}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-center">
                  <div className="relative">
                    <Input 
                      type="number" 
                      step="0.01"
                      value={formData.serviceCostPercentage || ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setFormData({ 
                          ...formData, 
                          serviceCostPercentage: val,
                        });
                      }}
                      className="pe-8"
                      placeholder="0"
                    />
                    <span className="absolute end-3 top-2.5 text-gray-500">%</span>
                  </div>
                  <div className="relative">
                    <span className="absolute start-3 top-2.5 text-gray-500">{currencyCode}</span>
                    <Input 
                      type="number" 
                      readOnly
                      value={serviceCostAmount.toFixed(2)}
                      className="ps-12 bg-gray-100"
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">{t("web.provider.catalogue.serviceDialog.costCalculatedHint")}</p>
              </div>
            </div>

            <Separator />

            {/* Sales settings */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold">{t("web.provider.catalogue.serviceDialog.salesSettings")}</h3>
              
              <div className="border rounded-lg p-3 sm:p-4">
                <Label className="mb-2 block text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.setTaxRate")}</Label>
                <p className="text-xs text-gray-500 mb-3 sm:mb-4">{t("web.provider.catalogue.serviceDialog.taxIncludedInPrice")}</p>
                <Select 
                  value={formData.taxRate.toString()} 
                  onValueChange={(val) => setFormData({ ...formData, taxRate: parseFloat(val) || 0 })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("web.provider.catalogue.serviceDialog.defaultNoTax")} />
                  </SelectTrigger>
                  <SelectContent>
                    {getOptions("tax_rate").map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-2">{t("web.provider.catalogue.serviceDialog.taxIncludedHint")}</p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-2 pt-4 border-t sticky bottom-0 bg-white pb-2 sm:pb-4 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                {t("web.provider.common.cancel")}
              </Button>
              <Button 
                type="submit" 
                className="bg-primary hover:bg-primary-hover min-w-[100px] w-full sm:w-auto"
                disabled={!formData.name.trim() || !formData.categoryId}
              >
                {service ? t("provider.mobile.screens.noteTemplates.update") : t("provider.mobile.screens.expressBooking.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Included Services Selection Dialog */}
      <Dialog open={showIncludedServicesDialog} onOpenChange={setShowIncludedServicesDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] sm:max-h-[80vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="px-0 sm:px-0">
            <DialogTitle className="text-lg sm:text-xl">{t("web.provider.catalogue.serviceDialog.selectIncludedServices")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">{t("web.provider.catalogue.serviceDialog.chooseIncludedServices")}</DialogDescription>
          </DialogHeader>
          
          {isLoadingServices ? (
            <div className="text-center py-8 text-gray-500">{t("web.provider.catalogue.serviceDialog.loadingServices")}</div>
          ) : availableServicesForInclusion.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>{t("web.provider.catalogue.serviceDialog.noOtherServices")}</p>
              <p className="text-xs mt-2">{t("web.provider.catalogue.serviceDialog.createMoreServices")}</p>
            </div>
          ) : (
            <div className="space-y-2 py-2 sm:py-4 px-0 sm:px-0">
              {availableServicesForInclusion.map((svc) => (
                <div key={svc.id} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border rounded-lg hover:bg-gray-50">
                  <Checkbox
                    id={`inc-${svc.id}`}
                    checked={formData.includedServices.includes(svc.id)}
                    onCheckedChange={(checked) => handleIncludedServiceToggle(svc.id, checked as boolean)}
                  />
                  <Label htmlFor={`inc-${svc.id}`} className="flex-1 cursor-pointer">
                    <div className="font-medium">{svc.name}</div>
                    <div className="text-xs text-gray-500">
                      {svc.duration_minutes} min • {fmt(svc.price)}
                    </div>
                  </Label>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex justify-end gap-2 pt-4 border-t -mx-4 sm:-mx-6 px-4 sm:px-6">
            <Button variant="outline" onClick={() => setShowIncludedServicesDialog(false)} className="w-full sm:w-auto">
              {t("common.done")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="px-0 sm:px-0">
            <DialogTitle className="text-lg sm:text-xl">{t("web.provider.catalogue.serviceDialog.addCategory")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">
              {t("web.provider.catalogue.serviceDialog.createCategoryHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2 sm:py-4 px-0 sm:px-0">
            <div>
              <Label htmlFor="newCategoryName" className="text-sm sm:text-base">{t("web.provider.catalogue.services.categoryName")}</Label>
              <Input
                id="newCategoryName"
                value={categoryFormData.name}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                placeholder={t("web.provider.catalogue.serviceDialog.categoryNamePlaceholder")}
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
                      categoryFormData.color === color 
                        ? "border-primary ring-2 ring-primary ring-offset-1 sm:ring-offset-2" 
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setCategoryFormData({ ...categoryFormData, color })}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="newCategoryDescription" className="text-sm sm:text-base">{t("web.provider.catalogue.services.descriptionOptional")}</Label>
              <Textarea
                id="newCategoryDescription"
                value={categoryFormData.description}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
                placeholder={t("web.provider.catalogue.serviceDialog.categorySummaryPlaceholder")}
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
                setShowCategoryDialog(false);
                setCategoryFormData({ name: "", color: "#FF0077", description: "" });
              }}
              className="w-full sm:w-auto"
            >
              {t("web.provider.common.cancel")}
            </Button>
            <Button 
              onClick={handleCreateCategory} 
              className="bg-primary hover:bg-primary-hover w-full sm:w-auto"
              disabled={!categoryFormData.name.trim()}
            >
              {t("web.provider.catalogue.serviceDialog.addCategory")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Team Member Dialog */}
      <Dialog open={showTeamMemberDialog} onOpenChange={setShowTeamMemberDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="px-0 sm:px-0">
            <DialogTitle className="text-lg sm:text-xl">{t("web.provider.catalogue.serviceDialog.addTeamMemberTitle")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">
              {t("web.provider.catalogue.serviceDialog.addTeamMemberHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2 sm:py-4 px-0 sm:px-0">
            <div>
              <Label htmlFor="teamMemberName" className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.fullNameRequired")}</Label>
              <Input
                id="teamMemberName"
                value={teamMemberFormData.name}
                onChange={(e) => setTeamMemberFormData({ ...teamMemberFormData, name: e.target.value })}
                placeholder={t("web.provider.catalogue.serviceDialog.fullNamePlaceholder")}
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="teamMemberEmail" className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.emailRequired")}</Label>
              <Input
                id="teamMemberEmail"
                type="email"
                value={teamMemberFormData.email}
                onChange={(e) => setTeamMemberFormData({ ...teamMemberFormData, email: e.target.value })}
                placeholder={t("web.provider.catalogue.serviceDialog.emailPlaceholder")}
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <PhoneInput
                inputId="catalogue-team-member-mobile"
                label={t("web.provider.catalogue.serviceDialog.mobileRequired")}
                value={teamMemberFormData.mobile}
                onChange={(e164) => setTeamMemberFormData({ ...teamMemberFormData, mobile: e164 })}
                placeholder={t("provider.mobile.components.phoneInput.phonePlaceholder")}
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="teamMemberRole" className="text-sm sm:text-base">{t("web.provider.catalogue.serviceDialog.roleRequired")}</Label>
              <Select
                value={teamMemberFormData.role}
                onValueChange={(value: any) => setTeamMemberFormData({ ...teamMemberFormData, role: value })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getOptions("team_role").map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowTeamMemberDialog(false);
                setTeamMemberFormData({ name: "", email: "", mobile: "", role: "staff" });
              }}
              className="w-full sm:w-auto"
            >
              {t("web.provider.common.cancel")}
            </Button>
            <Button 
              onClick={handleCreateTeamMember} 
              className="bg-primary hover:bg-primary-hover w-full sm:w-auto"
              disabled={
                !teamMemberFormData.name.trim() ||
                !teamMemberFormData.email.trim() ||
                !isCompleteE164(teamMemberFormData.mobile)
              }
            >
              {t("web.provider.catalogue.serviceDialog.addMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advanced Pricing Modal */}
      <AdvancedPricingModal
        open={showAdvancedPricingModal}
        onOpenChange={setShowAdvancedPricingModal}
        onSave={(rules) => {
          setAdvancedPricingRules(rules);
        }}
        initialRules={advancedPricingRules}
      />
    </>
  );
}
