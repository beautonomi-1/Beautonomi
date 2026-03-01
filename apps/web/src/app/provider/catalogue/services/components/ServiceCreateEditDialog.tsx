"use client";

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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { providerApi } from "@/lib/provider-portal/api";
import type { ServiceCategory, TeamMember, ServiceItem } from "@/lib/provider-portal/types";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import { useReferenceData } from "@/hooks/useReferenceData";
import { AdvancedPricingModal } from "./AdvancedPricingModal";
import { handleError } from "@/lib/provider-portal/error-handler";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";

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

    // Resource requirements (rooms, equipment) for this service
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
      toast.error("Category name is required");
      return;
    }

    try {
      const newCategory = await providerApi.createServiceCategory({
        name: categoryFormData.name,
        color: categoryFormData.color,
        description: categoryFormData.description,
      });
      toast.success("Category created");
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
      toast.error("Name, email, and mobile are required");
      return;
    }

    try {
      const newMember = await providerApi.createTeamMember({
        name: teamMemberFormData.name,
        email: teamMemberFormData.email,
        mobile: teamMemberFormData.mobile,
        role: teamMemberFormData.role === "staff" ? "employee" : teamMemberFormData.role,
      });
      toast.success("Team member created");
      setShowTeamMemberDialog(false);
      setTeamMemberFormData({ name: "", email: "", mobile: "", role: "staff" });
      
      // Refresh team members
      await loadTeamMembers();
      
      // Auto-select the newly created team member
      setFormData(prev => ({
        ...prev,
        selectedTeamMembers: [...prev.selectedTeamMembers, newMember.id],
      }));
    } catch (error: any) {
      handleError(error, {
        action: "createTeamMember",
        resource: "team member",
      });
      toast.error(error?.message || "Failed to create team member");
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
      toast.error("Service name is required");
      return;
    }
    if (!formData.categoryId) {
      toast.error("Service category is required");
      return;
    }
    
    // Validate variant fields
    if (formData.serviceType === "variant") {
      if (!formData.parentServiceId) {
        toast.error("Parent service is required for variants");
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
      if (service) {
        await providerApi.updateService(service.id, serviceData);
        savedServiceId = service.id;
        toast.success("Service updated successfully");
      } else {
        const created = await providerApi.createService(serviceData);
        savedServiceId = created.id;
        toast.success("Service created successfully");
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
            <DialogTitle className="text-lg sm:text-xl">{service ? "Edit Service" : "Create Service"}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">
              {service ? "Update the service details below" : "Add a new service to your catalogue. Clients will see the service name in their notifications and booking confirmations."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 px-0 sm:px-0">
            
            {/* Basic Info */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Basic Information</h3>
              </div>
              
              <div>
                <Label htmlFor="name" className="text-sm sm:text-base">Service name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Signature Haircut, Full Body Massage, Classic Manicure"
                  required
                  className="mt-1.5"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Make sure the service name can be understood independently. Clients will only see the <strong>service name</strong> in their notifications, not the category name.
                </p>
              </div>
              
              <div>
                <Label htmlFor="serviceType" className="text-sm sm:text-base">Service type</Label>
                <Select 
                  value={formData.serviceType} 
                  onValueChange={(val) => setFormData({ ...formData, serviceType: val })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    {getOptions("service_type").map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}{option.description ? ` (${option.description})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1.5">Choose how this service appears to clients in your booking system</p>
              </div>

              {formData.serviceType === "package" && (
                <div>
                  <Label className="text-sm sm:text-base">Included services</Label>
                  <div className="border rounded-md p-3 bg-pink-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 text-sm min-h-[48px] mt-1.5">
                    {formData.includedServices.length === 0 ? (
                      <span className="text-gray-500 text-xs sm:text-sm">No services included</span>
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
                      className="text-[#FF0077] p-0 h-auto text-xs sm:text-sm whitespace-nowrap"
                      onClick={() => setShowIncludedServicesDialog(true)}
                      disabled={allServices.length === 0}
                    >
                      {formData.includedServices.length === 0 ? "Add" : "Edit"}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">Select which services are included in this package</p>
                </div>
              )}

              {/* Add-on specific fields */}
              {formData.serviceType === "addon" && (
                <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 text-blue-700 font-medium">
                    <Plus className="w-4 h-4" />
                    <span>Add-on Configuration</span>
                  </div>
                  
                  <div>
                    <Label className="text-sm sm:text-base">Add-on category</Label>
                    <Select 
                      value={formData.addonCategory} 
                      onValueChange={(val) => setFormData({ ...formData, addonCategory: val })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {getOptions("addon_category").map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1.5">Group similar add-ons together during checkout</p>
                  </div>

                  <div>
                    <Label className="text-sm sm:text-base">Applicable services</Label>
                    <div className="border rounded-md p-3 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 text-sm min-h-[48px] mt-1.5">
                      {formData.applicableServiceIds.length === 0 ? (
                        <span className="text-gray-500 text-xs sm:text-sm">Available for all services</span>
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
                        className="text-[#FF0077] p-0 h-auto text-xs sm:text-sm whitespace-nowrap"
                        onClick={() => setShowIncludedServicesDialog(true)}
                        disabled={allServices.length === 0}
                      >
                        {formData.applicableServiceIds.length === 0 ? "Restrict" : "Edit"}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">Leave empty to make this add-on available for all services, or select specific services</p>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                    <Switch
                      checked={formData.isRecommended}
                      onCheckedChange={(checked) => setFormData({ ...formData, isRecommended: checked })}
                    />
                    <div className="flex-1">
                      <Label className="font-medium text-sm sm:text-base cursor-pointer">Recommended add-on</Label>
                      <p className="text-xs text-gray-500 mt-0.5">Highlight this add-on to clients during checkout</p>
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
                    <span>Variant Configuration</span>
                  </div>
                  
                  <div>
                    <Label className="text-sm sm:text-base">Parent service *</Label>
                    {isLoadingServices ? (
                      <div className="mt-1.5 p-3 border rounded-md bg-gray-50 text-sm text-gray-500">
                        Loading services...
                      </div>
                    ) : (
                      <Select 
                        value={formData.parentServiceId} 
                        onValueChange={(val) => setFormData({ ...formData, parentServiceId: val })}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Select parent service" />
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
                              No basic services available. Create a basic service first.
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                    <p className="text-xs text-gray-500 mt-1.5">This variant will be grouped under the selected parent service</p>
                    {!isLoadingServices && allServices.filter(s => {
                      const isBasic = !s.service_type || s.service_type === "basic";
                      const isNotCurrent = s.id !== service?.id;
                      const isNotVariant = s.service_type !== "variant";
                      return isBasic && isNotCurrent && isNotVariant;
                    }).length === 0 && (
                      <p className="text-xs text-amber-600 mt-1.5">
                        ⚠️ You need to create at least one basic service before creating variants.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label className="text-sm sm:text-base">Variant name</Label>
                    <Input
                      value={formData.variantName}
                      onChange={(e) => setFormData({ ...formData, variantName: e.target.value })}
                      placeholder="e.g., Short Hair, Long Hair, Gel, Acrylic"
                      className="mt-1.5"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">Short name shown when selecting between variants</p>
                  </div>

                  <div>
                    <Label className="text-sm sm:text-base">Sort order</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.variantSortOrder}
                      onChange={(e) => setFormData({ ...formData, variantSortOrder: parseInt(e.target.value) || 0 })}
                      className="mt-1.5"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">Lower numbers appear first when showing variant options</p>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor="categoryId" className="text-sm sm:text-base">Service category *</Label>
                  <Button
                    type="button"
                    variant="link"
                    className="text-[#FF0077] p-0 h-auto text-xs sm:text-sm"
                    onClick={() => setShowCategoryDialog(true)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Category
                  </Button>
                </div>
                {categories.length === 0 ? (
                  <div className="border rounded-md p-3 sm:p-4 bg-yellow-50 mt-1.5">
                    <p className="text-sm text-gray-700 mb-2">No categories available</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setShowCategoryDialog(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create your first category
                    </Button>
                  </div>
                ) : (
                  <>
                    <Select 
                      value={formData.categoryId} 
                      onValueChange={(val) => setFormData({ ...formData, categoryId: val })}
                      required
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1.5">Group this service with similar offerings</p>
                  </>
                )}
              </div>

              <div>
                <Label htmlFor="description" className="text-sm sm:text-base">Service description (Optional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what clients can expect from this service. This helps clients understand what's included."
                  rows={3}
                  className="mt-1.5"
                />
                <p className="text-xs text-gray-500 mt-1.5">A clear description helps clients understand what's included and sets proper expectations</p>
              </div>

              <div>
                <Label htmlFor="aftercare" className="text-sm sm:text-base">Aftercare instructions (Optional)</Label>
                <Textarea
                  id="aftercare"
                  value={formData.aftercareDescription}
                  onChange={(e) => setFormData({ ...formData, aftercareDescription: e.target.value })}
                  placeholder="e.g., Avoid washing hair for 24 hours, Keep the area dry for 48 hours"
                  rows={3}
                  className="mt-1.5"
                />
                <p className="text-xs text-gray-500 mt-1.5">Post-service care instructions help clients get the best results and maintain the service quality</p>
              </div>

              <div>
                <Label htmlFor="availableFor" className="text-sm sm:text-base">Available for</Label>
                <Select 
                  value={formData.availableFor} 
                  onValueChange={(val) => setFormData({ ...formData, availableFor: val })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Everyone" />
                  </SelectTrigger>
                  <SelectContent>
                    {getOptions("availability").map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1.5">Restrict who can book this service (applies to online booking)</p>
              </div>
            </div>

            <Separator />

            {/* Location Support */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-1">Location Support</h3>
                <p className="text-xs sm:text-sm text-gray-500">Choose where this service can be provided - at your salon or at the client's home.</p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <Switch
                    checked={formData.supportsAtSalon}
                    onCheckedChange={(checked) => setFormData({ ...formData, supportsAtSalon: checked })}
                  />
                  <div className="flex-1">
                    <Label className="font-medium text-sm sm:text-base cursor-pointer">Available at Salon</Label>
                    <p className="text-xs text-gray-500 mt-0.5">Clients can book this service at your salon location</p>
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
                            toast.error("Please select service zones first before enabling at-home services. You'll be redirected to the service zones page.");
                            setTimeout(() => {
                              window.location.href = "/provider/settings/service-zones";
                            }, 2000);
                            return;
                          }
                        } catch (error) {
                          console.error("Failed to check zone selections:", error);
                          toast.error("Unable to verify service zones. Please ensure you have selected zones in Settings > Service Zones.");
                          return;
                        }
                      }
                      setFormData({ ...formData, supportsAtHome: checked });
                    }}
                  />
                  <div className="flex-1">
                    <Label className="font-medium text-sm sm:text-base cursor-pointer">Available at Home (Housecall)</Label>
                    <p className="text-xs text-gray-500 mt-0.5">Clients can book this service at their location</p>
                  </div>
                </div>
                
                {formData.supportsAtHome && (
                  <div className="ml-0 sm:ml-12 space-y-3 sm:space-y-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <Label htmlFor="atHomeRadius" className="text-sm sm:text-base">Maximum Service Radius (km)</Label>
                      <Input
                        id="atHomeRadius"
                        type="number"
                        min="0"
                        step="0.1"
                        value={formData.atHomeRadiusKm}
                        onChange={(e) => setFormData({ ...formData, atHomeRadiusKm: parseFloat(e.target.value) || 0 })}
                        placeholder="e.g., 10"
                        className="mt-1.5"
                      />
                      <p className="text-xs text-gray-500 mt-1.5">Maximum distance from your salon for at-home bookings</p>
                    </div>
                    
                    <div>
                      <Label htmlFor="atHomePriceAdjustment" className="text-sm sm:text-base">Price Adjustment for At-Home (R)</Label>
                      <Input
                        id="atHomePriceAdjustment"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.atHomePriceAdjustment}
                        onChange={(e) => setFormData({ ...formData, atHomePriceAdjustment: parseFloat(e.target.value) || 0 })}
                        placeholder="e.g., 50"
                        className="mt-1.5"
                      />
                      <p className="text-xs text-gray-500 mt-1.5">Additional charge (or discount if negative) for at-home service</p>
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
                    <h3 className="text-base sm:text-lg font-semibold mb-1">Resource requirements</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Assign rooms or equipment required or optional for this service. Required resources are reserved when the service is booked.</p>
                  </div>
                  {isLoadingResources ? (
                    <p className="text-sm text-gray-500">Loading resources...</p>
                  ) : providerResources.length === 0 ? (
                    <p className="text-sm text-gray-500">No resources yet. Add rooms or equipment under Resources in the main menu first.</p>
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
                                Required
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
                                Optional
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

            {/* Online Booking */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-1">Online Booking</h3>
                <p className="text-xs sm:text-sm text-gray-500">Control whether clients can book this service online through your booking page.</p>
              </div>
              <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
                <Switch
                  checked={formData.onlineBookable}
                  onCheckedChange={(checked) => setFormData({ ...formData, onlineBookable: checked })}
                />
                <div className="flex-1">
                  <Label className="font-medium text-sm sm:text-base cursor-pointer">Enable online bookings</Label>
                  <p className="text-xs text-gray-500 mt-0.5">Allow clients to book this service through your online booking page</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Team */}
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="text-base sm:text-lg font-semibold mb-1">Assign to Team Members</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Select which team members can perform this service. You can customize pricing per team member later.</p>
                </div>
                <Button
                  type="button"
                  variant="link"
                  className="text-[#FF0077] p-0 h-auto text-xs sm:text-sm whitespace-nowrap flex-shrink-0 mt-1"
                  onClick={() => setShowTeamMemberDialog(true)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Member
                </Button>
              </div>
              
              {isLoadingTeam ? (
                <div className="text-sm text-gray-500">Loading team members...</div>
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
                        <Label htmlFor="selectAll" className="font-normal cursor-pointer text-sm">Select all</Label>
                      </div>
                      
                      <div className="space-y-2 pl-1">
                        {teamMembers.map((member) => (
                          <div key={member.id} className="flex items-center gap-3">
                            <Checkbox 
                              id={`tm-${member.id}`}
                              checked={formData.selectedTeamMembers.includes(member.id)}
                              onCheckedChange={(checked) => handleTeamMemberToggle(member.id, checked as boolean)}
                            />
                            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                              {member.avatar_url ? (
                                <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover" />
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
                      <p className="text-sm text-gray-500 mb-2">No team members available</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => setShowTeamMemberDialog(true)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add your first team member
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
                <h3 className="text-base sm:text-lg font-semibold mb-1">Team Member Commission</h3>
                <p className="text-xs sm:text-sm text-gray-500">Enable commission calculation for team members when this service is sold.</p>
              </div>
              <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
                <Switch
                  checked={formData.teamMemberCommissionEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, teamMemberCommissionEnabled: checked })}
                />
                <div className="flex-1">
                  <Label className="font-medium text-sm sm:text-base cursor-pointer">Enable team member commission</Label>
                  <p className="text-xs text-gray-500 mt-0.5">Calculate and track commission for team members on this service</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Pricing and Duration */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-1">Duration & Pricing</h3>
                <p className="text-xs sm:text-sm text-gray-500">Set the default duration and price for this service. These can be customized later for individual staff members or locations.</p>
              </div>
              
              {pricingOptions.map((option, index) => (
                <div key={option.id} className="border rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4 bg-gray-50/50">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm sm:text-base font-medium text-[#FF0077]">
                      {pricingOptions.length === 1 ? "Default Pricing" : `Pricing Option ${index + 1}`}
                    </h4>
                    {pricingOptions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 sm:h-6 sm:w-6 touch-manipulation"
                        onClick={() => handleRemovePricingOption(option.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label className="text-sm sm:text-base">Duration *</Label>
                      <Select 
                        value={option.duration.toString()} 
                        onValueChange={(val) => handlePricingOptionChange(option.id, "duration", parseInt(val))}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Select duration" />
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
                      <Label className="text-sm sm:text-base">Price type</Label>
                      <Select 
                        value={option.priceType} 
                        onValueChange={(val) => handlePricingOptionChange(option.id, "priceType", val)}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Fixed" />
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
                    <Label className="text-sm sm:text-base">Price *</Label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-2.5 text-gray-500 text-sm">ZAR</span>
                      <Input 
                        type="number" 
                        step="0.01"
                        min="0"
                        className="pl-12"
                        value={option.price || ""}
                        onChange={(e) => handlePricingOptionChange(option.id, "price", parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">This is the default price. You can customize pricing for different staff members or locations later.</p>
                  </div>

                  <div>
                    <Label className="text-sm sm:text-base">Pricing name (Optional)</Label>
                    <Input 
                      placeholder="e.g., Long hair, Short hair"
                      value={option.pricingName}
                      onChange={(e) => handlePricingOptionChange(option.id, "pricingName", e.target.value)}
                      className="mt-1.5"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">Distinguish this pricing option from others</p>
                  </div>

                  {index === 0 && (
                    <Button 
                      type="button"
                      variant="link" 
                      className="text-[#FF0077] p-0 h-auto"
                      onClick={() => {
                        setShowAdvancedPricingModal(true);
                      }}
                    >
                      Advanced pricing options
                      {advancedPricingRules.length > 0 && (
                        <span className="ml-2 text-xs bg-[#FF0077]/10 text-[#FF0077] px-1.5 py-0.5 rounded">
                          {advancedPricingRules.filter(r => r.enabled).length} active
                        </span>
                      )}
                    </Button>
                  )}
                </div>
              ))}

              {pricingOptions.length === 1 && (
                <Button 
                  type="button"
                  variant="outline"
                  className="w-full text-sm sm:text-base min-h-[44px] touch-manipulation"
                  onClick={handleAddPricingOption}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add another pricing option
                </Button>
              )}
              {pricingOptions.length > 1 && (
                <div className="space-y-2">
                  <Button 
                    type="button"
                    variant="outline"
                    className="w-full text-sm sm:text-base min-h-[44px] touch-manipulation"
                    onClick={handleAddPricingOption}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add pricing option
                  </Button>
                  <p className="text-xs text-gray-500 text-center">Use multiple pricing options for different service variations (e.g., long hair vs short hair)</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Extra Time */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-1">Extra Time</h3>
                <p className="text-xs sm:text-sm text-gray-500">Add buffer time after the service for cleanup, preparation, or transition between appointments.</p>
              </div>
              <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
                <Switch
                  checked={formData.extraTimeEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, extraTimeEnabled: checked })}
                />
                <div className="flex-1">
                  <Label className="font-medium text-sm sm:text-base cursor-pointer">Enable extra time</Label>
                  <p className="text-xs text-gray-500 mt-0.5">Add buffer time after this service completes</p>
                </div>
              </div>
              {formData.extraTimeEnabled && (
                <div className="mt-2 w-full sm:w-1/2">
                  <Label>Duration</Label>
                  <Select 
                    value={formData.extraTimeDuration.toString()} 
                    onValueChange={(val) => setFormData({ ...formData, extraTimeDuration: parseInt(val) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="15 min" />
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
              <h3 className="text-base sm:text-lg font-semibold">Notification settings</h3>
              <p className="text-sm text-gray-500">Manage automated messages sent for this service.</p>
              
              <div className="border rounded-lg p-3 sm:p-4 bg-gray-50">
                <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <Checkbox 
                    id="rebook" 
                    checked={formData.reminderToRebookEnabled}
                    onCheckedChange={(c: boolean) => setFormData({ ...formData, reminderToRebookEnabled: c })}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label htmlFor="rebook" className="font-medium text-sm sm:text-base">Reminder to rebook notifications</Label>
                    <p className="text-xs text-gray-500 mt-1">Choose when you would like to notify your clients to rebook this service.</p>
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
              <h3 className="text-base sm:text-lg font-semibold">Service cost</h3>
              <p className="text-xs sm:text-sm text-gray-500">Configure a cost associated with delivering this service.</p>
              <div className="border rounded-lg p-3 sm:p-4">
                <Label className="text-sm sm:text-base mb-2 block">Service cost percentage</Label>
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
                      className="pr-8"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-2.5 text-gray-500">%</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500">ZAR</span>
                    <Input 
                      type="number" 
                      readOnly
                      value={serviceCostAmount.toFixed(2)}
                      className="pl-12 bg-gray-100"
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Cost will be calculated as a % of sale price before discounts</p>
              </div>
            </div>

            <Separator />

            {/* Sales settings */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold">Sales settings</h3>
              
              <div className="border rounded-lg p-3 sm:p-4">
                <Label className="mb-2 block text-sm sm:text-base">Set the tax rate</Label>
                <p className="text-xs text-gray-500 mb-3 sm:mb-4">Tax (included in price)</p>
                <Select 
                  value={formData.taxRate.toString()} 
                  onValueChange={(val) => setFormData({ ...formData, taxRate: parseFloat(val) || 0 })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Default: No Tax" />
                  </SelectTrigger>
                  <SelectContent>
                    {getOptions("tax_rate").map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-2">Tax is included in the service price</p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-2 pt-4 border-t sticky bottom-0 bg-white pb-2 sm:pb-4 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-[#FF0077] hover:bg-[#D60565] min-w-[100px] w-full sm:w-auto"
                disabled={!formData.name.trim() || !formData.categoryId}
              >
                {service ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Included Services Selection Dialog */}
      <Dialog open={showIncludedServicesDialog} onOpenChange={setShowIncludedServicesDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] sm:max-h-[80vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="px-0 sm:px-0">
            <DialogTitle className="text-lg sm:text-xl">Select Included Services</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">Choose which services are included in this package</DialogDescription>
          </DialogHeader>
          
          {isLoadingServices ? (
            <div className="text-center py-8 text-gray-500">Loading services...</div>
          ) : availableServicesForInclusion.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No other services available to include</p>
              <p className="text-xs mt-2">Create more services first to build packages</p>
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
                      {svc.duration_minutes} min • ZAR {svc.price}
                    </div>
                  </Label>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex justify-end gap-2 pt-4 border-t -mx-4 sm:-mx-6 px-4 sm:px-6">
            <Button variant="outline" onClick={() => setShowIncludedServicesDialog(false)} className="w-full sm:w-auto">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="px-0 sm:px-0">
            <DialogTitle className="text-lg sm:text-xl">Add Category</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">
              Create a new category to organize your services
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2 sm:py-4 px-0 sm:px-0">
            <div>
              <Label htmlFor="newCategoryName" className="text-sm sm:text-base">Category name *</Label>
              <Input
                id="newCategoryName"
                value={categoryFormData.name}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
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
                      categoryFormData.color === color 
                        ? "border-[#FF0077] ring-2 ring-[#FF0077] ring-offset-1 sm:ring-offset-2" 
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
              <Label htmlFor="newCategoryDescription" className="text-sm sm:text-base">Description (Optional)</Label>
              <Textarea
                id="newCategoryDescription"
                value={categoryFormData.description}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
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
                setShowCategoryDialog(false);
                setCategoryFormData({ name: "", color: "#FF0077", description: "" });
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateCategory} 
              className="bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto"
              disabled={!categoryFormData.name.trim()}
            >
              Add Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Team Member Dialog */}
      <Dialog open={showTeamMemberDialog} onOpenChange={setShowTeamMemberDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="px-0 sm:px-0">
            <DialogTitle className="text-lg sm:text-xl">Add Team Member</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">
              Add a new team member to assign to services
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2 sm:py-4 px-0 sm:px-0">
            <div>
              <Label htmlFor="teamMemberName" className="text-sm sm:text-base">Full Name *</Label>
              <Input
                id="teamMemberName"
                value={teamMemberFormData.name}
                onChange={(e) => setTeamMemberFormData({ ...teamMemberFormData, name: e.target.value })}
                placeholder="Enter full name"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="teamMemberEmail" className="text-sm sm:text-base">Email *</Label>
              <Input
                id="teamMemberEmail"
                type="email"
                value={teamMemberFormData.email}
                onChange={(e) => setTeamMemberFormData({ ...teamMemberFormData, email: e.target.value })}
                placeholder="Enter email address"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="teamMemberMobile" className="text-sm sm:text-base">Mobile Number *</Label>
              <Input
                id="teamMemberMobile"
                type="tel"
                value={teamMemberFormData.mobile}
                onChange={(e) => setTeamMemberFormData({ ...teamMemberFormData, mobile: e.target.value })}
                placeholder="Enter mobile number"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="teamMemberRole" className="text-sm sm:text-base">Role *</Label>
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
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTeamMember} 
              className="bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto"
              disabled={!teamMemberFormData.name.trim() || !teamMemberFormData.email.trim() || !teamMemberFormData.mobile.trim()}
            >
              Add Member
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
