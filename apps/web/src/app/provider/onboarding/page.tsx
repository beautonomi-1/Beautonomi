"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Check, Plus, Trash2, AlertCircle, Sparkles, Upload, Image as ImageIcon, X, Loader2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Breadcrumb from "@/components/ui/breadcrumb";
import { validateFileType, validateFileSize, IMAGE_CONSTRAINTS } from "@/lib/supabase/storage-client";
import { getPricingPlans } from "@/lib/supabase/pricing";

interface GlobalCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
}

interface ServiceAddon {
  id?: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  duration_minutes?: number;
}

interface Service {
  id?: string;
  title: string;
  description?: string;
  duration_minutes: number;
  price: number;
  currency: string;
  supports_at_home: boolean;
  supports_at_salon: boolean;
  category_id?: string;
  addons?: ServiceAddon[]; // Addons specific to this service
}

interface OnboardingData {
  // Step 1: Team Size
  team_size: "freelancer" | "small" | "medium" | "large";
  
  // Step 2: Identity (Owner Info)
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  phone_verified: boolean;
  phone_verification_code?: string;
  
  // Step 3: Business Details
  business_name: string;
  business_type: "salon" | "mobile" | "both";
  description: string;
  website?: string;
  years_in_business?: number;
  languages_spoken?: string[];
  social_media_links?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };
  
  // Step 4: Payment Setup
  yoco_machine: "yes" | "no" | "other";
  yoco_machine_other?: string;
  payout_setup_complete?: boolean; // Track if payout account is set up
  is_vat_registered?: boolean; // VAT registration status
  vat_number?: string; // SARS VAT number (if VAT registered)
  
  // Step 5: Current Software
  previous_software?: string;
  previous_software_other?: string;
  
  // Step 6: Payroll
  payroll_type: "commission" | "hourly" | "both" | "other";
  payroll_details?: string;
  
  // Step 7: Location
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    latitude?: number;
    longitude?: number;
  };
  
  // Step 8: Photos
  thumbnail_url?: string;
  gallery?: string[];

  // Business contact (used in Step3; aliased from owner_* for display)
  phone?: string;
  email?: string;

  // Public homepage / booking optimization
  accepts_custom_requests?: boolean;
  response_rate?: number;
  response_time_hours?: number;
  tax_rate_percent?: number | null;
  tips_enabled?: boolean;
  cancellation_window_hours?: number;
  requires_deposit?: boolean;
  deposit_percentage?: number | null;
  no_show_fee_enabled?: boolean;
  no_show_fee_amount?: number | null;
  include_in_search_engines?: boolean;
  
  // Step 9: Service Zones
  selected_zone_ids?: string[];
  
  // Step 10: Service Categories
  global_category_ids: string[];
  
  // Step 11: Service Catalog
  services: Service[];
  
  // Step 12: Operating Hours
  operating_hours: {
    [key: string]: { open: string; close: string; closed: boolean };
  };
  
  // Step 14: Plan Selection
  selected_plan_id?: string;
}

// New streamlined step order
const STEPS = [
  { id: 1, title: "Team Size", description: "Tell us about your team" },
  { id: 2, title: "Your Identity", description: "Your name, email, and phone" },
  { id: 3, title: "Business Details", description: "Tell us about your business" },
  { id: 4, title: "Payment Setup", description: "Do you have a Yoco machine?" },
  { id: 5, title: "Current Software", description: "Are you moving from another system?" },
  { id: 6, title: "Payroll", description: "How do you pay your staff?" },
  { id: 7, title: "Location", description: "Where are you located?" },
  { id: 8, title: "Photos", description: "Add your photos" },
  { id: 9, title: "Service Zones", description: "Select service areas", canSkip: true, conditional: (data: Partial<OnboardingData>) => data.business_type === "mobile" || data.business_type === "both" },
  { id: 10, title: "Service Categories", description: "Select categories" },
  { id: 11, title: "Service Catalog", description: "Add your services", canSkip: true },
  { id: 12, title: "Operating Hours", description: "When are you open?" },
  { id: 13, title: "Review", description: "Review and submit" },
  { id: 14, title: "Choose Your Plan", description: "Select a subscription plan" },
];

export default function ProviderOnboarding() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [formData, setFormData] = useState<Partial<OnboardingData>>({
    team_size: undefined,
    owner_name: "",
    owner_email: "",
    owner_phone: "",
    phone_verified: false,
    business_name: "",
    business_type: "salon",
    description: "",
    yoco_machine: undefined,
    previous_software: undefined,
    payroll_type: undefined,
    services: [],
    global_category_ids: [],
    operating_hours: {
      monday: { open: "09:00", close: "18:00", closed: false },
      tuesday: { open: "09:00", close: "18:00", closed: false },
      wednesday: { open: "09:00", close: "18:00", closed: false },
      thursday: { open: "09:00", close: "18:00", closed: false },
      friday: { open: "09:00", close: "18:00", closed: false },
      saturday: { open: "09:00", close: "18:00", closed: false },
      sunday: { open: "09:00", close: "18:00", closed: true },
    },
    selected_zone_ids: [],
  });

  // Check for pre-selected plan from query params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const planId = params.get('planId');
      if (planId) {
        setFormData(prev => ({ ...prev, selected_plan_id: planId }));
      }
    }
  }, []);

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, []);

  // Auto-save draft when form data changes
  useEffect(() => {
    const saveTimer = setTimeout(() => {
      if (formData.business_name || formData.address) {
        saveDraft();
      }
    }, 2000); // Debounce: save 2 seconds after last change

    return () => clearTimeout(saveTimer);
  }, [formData, currentStep]);

  const loadDraft = async () => {
    try {
      const response = await fetcher.get<{ data: any }>("/api/provider/onboarding/draft");
      if (response.data && response.data.draft_data) {
        setFormData(response.data.draft_data);
        setCurrentStep(response.data.current_step || 1);
        toast.success("Resumed from saved draft");
      }
    } catch {
      // No draft exists, that's fine
      console.log("No draft found, starting fresh");
    }
  };

  const saveDraft = async () => {
    try {
      setIsSavingDraft(true);
      await fetcher.post("/api/provider/onboarding/draft", {
        draft_data: formData,
        current_step: currentStep,
      });
    } catch (error) {
      console.error("Failed to save draft:", error);
      // Don't show error to user, it's background saving
    } finally {
      setIsSavingDraft(false);
    }
  };

  const updateFormData = (updates: Partial<OnboardingData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  // Step validation
  const validateStep = (step: number): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    switch (step) {
      case 1: // Team Size
        if (!formData.team_size) errors.push("Please select your team size");
        break;
      case 2: // Identity
        if (!formData.owner_name?.trim()) errors.push("Your name is required");
        if (!formData.owner_email?.trim()) errors.push("Email is required");
        if (formData.owner_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.owner_email)) {
          errors.push("Invalid email address");
        }
        if (!formData.owner_phone?.trim()) errors.push("Phone number is required");
        if (!formData.phone_verified) errors.push("Please verify your phone number");
        break;
      case 3: // Business Details
        if (!formData.business_name?.trim()) errors.push("Business name is required");
        break;
      case 4: // Payment Setup
        // Validate VAT registration if selected
        if (formData.is_vat_registered === true) {
          if (!formData.vat_number?.trim()) {
            errors.push("VAT number is required when VAT registered");
          } else if (formData.vat_number.length !== 10) {
            errors.push("VAT number must be 10 digits");
          } else if (!formData.vat_number.startsWith('4')) {
            errors.push("South African VAT numbers must start with 4");
          }
        }
        break;
      case 5: // Current Software
        // Optional - no validation
        break;
      case 6: // Payroll
        // Optional - no validation
        break;
      case 7: // Location
        if (!formData.address?.line1?.trim()) errors.push("Street address is required");
        if (!formData.address?.city?.trim()) errors.push("City is required");
        if (!formData.address?.country?.trim()) errors.push("Country is required");
        break;
      case 8: // Photos
        // Optional - no validation
        break;
      case 9: // Service Zones
        // Optional (can skip)
        break;
      case 10: // Service Categories
        if (!formData.global_category_ids || formData.global_category_ids.length === 0) {
          errors.push("Please select at least one service category");
        }
        break;
      case 11: // Service Catalog
        // Optional - no validation
        break;
      case 12: // Hours
        // Optional - no validation
        break;
      case 13: // Review
        // Optional - no validation
        break;
      case 14: // Plan Selection
        if (!formData.selected_plan_id?.trim()) {
          errors.push("Please select a subscription plan");
        }
        break;
    }

    return { valid: errors.length === 0, errors };
  };

  const handleNext = () => {
    const validation = validateStep(currentStep);
    
    if (!validation.valid) {
      validation.errors.forEach((error) => toast.error(error));
      return;
    }

    // Skip conditional steps
    let nextStep = currentStep + 1;
    while (nextStep <= STEPS.length) {
      const step = STEPS[nextStep - 1];
      if (step.conditional && !step.conditional(formData)) {
        nextStep++;
      } else {
        break;
      }
    }

    if (nextStep <= STEPS.length) {
      setCurrentStep(nextStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      // Skip conditional steps when going back
      let prevStep = currentStep - 1;
      while (prevStep >= 1) {
        const step = STEPS[prevStep - 1];
        if (step.conditional && !step.conditional(formData)) {
          prevStep--;
        } else {
          break;
        }
      }
      if (prevStep >= 1) {
        setCurrentStep(prevStep);
      } else {
        // If we've gone back too far, go to step 1
        setCurrentStep(1);
      }
    }
  };

  const handleSkip = () => {
    // Skip conditional steps when skipping
    let nextStep = currentStep + 1;
    while (nextStep <= STEPS.length) {
      const step = STEPS[nextStep - 1];
      if (step.conditional && !step.conditional(formData)) {
        nextStep++;
      } else {
        break;
      }
    }
    if (nextStep <= STEPS.length) {
      setCurrentStep(nextStep);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      // Final validation
      const validation = validateStep(1);
      if (!validation.valid) {
        validation.errors.forEach((error) => toast.error(error));
        return;
      }

      // Validate required fields
      if (!formData.team_size) {
        toast.error("Please select your team size");
        return;
      }
      if (!formData.owner_name || !formData.owner_email || !formData.owner_phone) {
        toast.error("Please complete your identity information");
        return;
      }
      if (!formData.phone_verified) {
        toast.error("Please verify your phone number");
        return;
      }
      if (!formData.business_name || !formData.address) {
        toast.error("Please complete all required fields");
        return;
      }

      if (!formData.global_category_ids || formData.global_category_ids.length === 0) {
        toast.error("Please select at least one service category");
        return;
      }

      // Submit onboarding data
      const onboardingData = {
        // New fields
        team_size: formData.team_size,
        owner_name: formData.owner_name,
        owner_email: formData.owner_email,
        owner_phone: formData.owner_phone,
        yoco_machine: formData.yoco_machine || null,
        yoco_machine_other: formData.yoco_machine_other || null,
        payroll_type: formData.payroll_type || null,
        payroll_details: formData.payroll_details || null,
        // Business fields
        business_name: formData.business_name,
        business_type: formData.business_type,
        description: formData.description || null,
        previous_software: formData.previous_software || null,
        previous_software_other: formData.previous_software_other || null,
        // Legacy fields (mapped from owner fields)
        phone: formData.owner_phone,
        email: formData.owner_email,
        address: {
          line1: formData.address?.line1 || "",
          line2: formData.address?.line2 || null,
          city: formData.address?.city || "",
          state: formData.address?.state || null,
          postal_code: formData.address?.postal_code || null,
          country: formData.address?.country || "",
          latitude: formData.address?.latitude || null,
          longitude: formData.address?.longitude || null,
        },
        global_category_ids: formData.global_category_ids || [],
        selected_zone_ids: formData.selected_zone_ids || [],
        operating_hours: formData.operating_hours || {},
        services: formData.services || [],
        // New fields for public homepage optimization
        thumbnail_url: formData.thumbnail_url || null,
        gallery: formData.gallery || [],
        years_in_business: formData.years_in_business || null,
        accepts_custom_requests: formData.accepts_custom_requests || false,
        response_rate: formData.response_rate || 100,
        response_time_hours: formData.response_time_hours || 1,
        languages_spoken: formData.languages_spoken || ["English"],
        social_media_links: formData.social_media_links || {},
        website: formData.website || null,
        tax_rate_percent: formData.tax_rate_percent || null,
        tips_enabled: formData.tips_enabled || false,
        cancellation_window_hours: formData.cancellation_window_hours || 24,
        requires_deposit: formData.requires_deposit || false,
        deposit_percentage: formData.deposit_percentage || null,
        no_show_fee_enabled: formData.no_show_fee_enabled || false,
        no_show_fee_amount: formData.no_show_fee_amount || null,
        include_in_search_engines: formData.include_in_search_engines !== false, // Default to true
        selected_plan_id: formData.selected_plan_id || null,
      };

      // Validate required fields before sending
      if (!onboardingData.address.line1 || !onboardingData.address.city || !onboardingData.address.country) {
        toast.error("Please complete all required address fields");
        return;
      }

      if (!onboardingData.global_category_ids || onboardingData.global_category_ids.length === 0) {
        toast.error("Please select at least one service category");
        return;
      }

      console.log("Submitting onboarding data:", JSON.stringify(onboardingData, null, 2));

      const response = await fetcher.post<{
        data: { provider: any; message: string; auto_configured?: any };
        error: null;
      }>("/api/provider/onboarding", onboardingData);

      const successMessage = response.data?.message || "Onboarding submitted! We'll review your application.";
      const autoConfig = response.data?.auto_configured;
      
      // Show detailed success message
      if (autoConfig && (autoConfig.zones > 0 || autoConfig.services > 0 || autoConfig.mobile_ready)) {
        toast.success(successMessage, {
          duration: 6000,
        });
      } else {
        toast.success(successMessage, {
          duration: 4000,
        });
      }
      
      // Small delay to let user see the success message
      setTimeout(() => {
        router.push("/provider/dashboard");
      }, 1500);
    } catch (error) {
      let errorMessage = "Failed to submit onboarding. Please try again.";
      
      if (error instanceof FetchError) {
        console.error("FetchError details:", {
          message: error.message,
          status: error.status,
          code: error.code,
          details: error.details
        });
        
        // Try to extract validation errors from the details
        if (error.details && Array.isArray(error.details)) {
          console.error("Validation errors:", JSON.stringify(error.details, null, 2));
          // Show all validation errors - format for toast (toast doesn't support newlines well)
          const validationErrors = error.details.map((err: any, index: number) => {
            if (typeof err === 'string') return `${index + 1}. ${err}`;
            const path = err.path || 'field';
            const msg = err.message || 'Invalid value';
            return `${index + 1}. ${path}: ${msg}`;
          });
          
          // Show first error in toast, log all to console
          if (validationErrors.length > 0) {
            errorMessage = validationErrors[0];
            if (validationErrors.length > 1) {
              console.error(`Total validation errors: ${validationErrors.length}`);
              validationErrors.forEach((err, idx) => {
                console.error(`Error ${idx + 1}: ${err}`);
              });
              errorMessage += ` (and ${validationErrors.length - 1} more - see console)`;
            }
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
      } else {
        console.error("Unknown error:", error);
      }
      
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get actual step index accounting for conditional steps
  const getActualStepIndex = () => {
    let actualIndex = 0;
    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];
      if (step.conditional && !step.conditional(formData)) {
        continue;
      }
      actualIndex++;
      if (i === currentStep - 1) break;
    }
    return actualIndex;
  };

  const currentStepData = STEPS[currentStep - 1];
  const canSkip = currentStepData?.canSkip || false;
  const totalVisibleSteps = STEPS.filter(s => !s.conditional || (s.conditional && s.conditional(formData))).length;

  return (
    <RoleGuard 
      allowedRoles={["customer", "provider_owner"]} 
      redirectTo="/become-a-partner"
      showLoading={true}
    >
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8">
          <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: "Become a Partner", href: "/become-a-partner" },
            { label: "Onboarding" }
          ]} />
          
          {/* Progress Bar - Mobile Optimized */}
          <div className="mb-4 sm:mb-6 md:mb-8">
            {/* Mobile: Show current step number */}
            <div className="sm:hidden mb-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-600">
                  Step {getActualStepIndex()} of {totalVisibleSteps}
                </p>
                <p className="text-sm text-gray-500">
                  {Math.round((getActualStepIndex() / totalVisibleSteps) * 100)}% complete
                </p>
              </div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-[#FF0077] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(getActualStepIndex() / totalVisibleSteps) * 100}%` }}
                />
              </div>
            </div>
            
            {/* Desktop: Full progress bar */}
            <div className="hidden sm:block">
              <div className="flex items-center justify-between mb-2">
                {STEPS.filter(s => !s.conditional || (s.conditional && s.conditional(formData))).map((step, index) => {
                  const _stepIndex = STEPS.findIndex(s => s.id === step.id);
                  const isCompleted = currentStep > step.id;
                  const isCurrent = currentStep === step.id;
                  return (
                    <div key={step.id} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div
                          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 transition-all duration-200 ${
                            isCompleted || isCurrent
                              ? "bg-[#FF0077] border-[#FF0077] text-white shadow-md scale-110"
                              : "bg-white border-gray-300 text-gray-400"
                          }`}
                        >
                          {isCompleted ? (
                            <Check className="w-5 h-5 sm:w-6 sm:h-6" />
                          ) : (
                            <span className="text-sm sm:text-base font-semibold">{index + 1}</span>
                          )}
                        </div>
                        <div className="mt-2 text-center">
                          <p
                            className={`text-xs sm:text-sm font-medium ${
                              isCompleted || isCurrent ? "text-gray-900" : "text-gray-400"
                            }`}
                          >
                            {step.title}
                          </p>
                        </div>
                      </div>
                      {index < filteredSteps.length - 1 && (
                        <div
                          className={`h-1 flex-1 mx-2 transition-all duration-300 ${
                            isCompleted ? "bg-[#FF0077]" : "bg-gray-300"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {isSavingDraft && (
              <p className="text-xs text-gray-500 text-center mt-2">Saving progress...</p>
            )}
          </div>

          {/* Form Content */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6 md:p-8 lg:p-10">
            <div className="mb-4 sm:mb-6 md:mb-8">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">
                {currentStepData.title}
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-gray-600 leading-relaxed">
                {currentStepData.description}
              </p>
            </div>

            {currentStep === 1 && (
              <Step1TeamSize data={formData} updateData={updateFormData} />
            )}
            {currentStep === 2 && (
              <Step2Identity data={formData} updateData={updateFormData} />
            )}
            {currentStep === 3 && (
              <Step3BusinessDetails data={formData} updateData={updateFormData} />
            )}
            {currentStep === 4 && (
              <Step4PaymentSetup data={formData} updateData={updateFormData} />
            )}
            {currentStep === 5 && (
              <Step5CurrentSoftware data={formData} updateData={updateFormData} />
            )}
            {currentStep === 6 && (
              <Step6Payroll data={formData} updateData={updateFormData} />
            )}
            {currentStep === 7 && (
              <Step7Location data={formData} updateData={updateFormData} />
            )}
            {currentStep === 8 && (
              <Step8Photos data={formData} updateData={updateFormData} />
            )}
            {currentStep === 9 && (
              <Step9ServiceZones data={formData} updateData={updateFormData} />
            )}
            {currentStep === 10 && (
              <Step10GlobalCategories data={formData} updateData={updateFormData} />
            )}
            {currentStep === 11 && (
              <Step11ServiceCatalog data={formData} updateData={updateFormData} />
            )}
            {currentStep === 12 && (
              <Step12Hours data={formData} updateData={updateFormData} />
            )}
            {currentStep === 13 && <Step13Review data={formData} />}
            {currentStep === 14 && (
              <Step14PlanSelection data={formData} updateData={updateFormData} />
            )}

            {/* Navigation */}
            <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 mt-6 sm:mt-8 md:mt-10 pt-4 sm:pt-6 md:pt-8 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
                className="w-full sm:w-auto h-12 sm:h-14 text-base font-semibold border-2 border-gray-300 hover:border-gray-400 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Back
              </Button>
              <div className="flex gap-3 sm:gap-4 w-full sm:w-auto">
                {canSkip && currentStep < STEPS.length && (
                  <Button 
                    variant="outline" 
                    onClick={handleSkip}
                    className="flex-1 sm:flex-none h-12 sm:h-14 text-base font-semibold border-2 border-gray-300 hover:border-gray-400 rounded-lg"
                  >
                    Skip for now
                  </Button>
                )}
                {currentStep < STEPS.length ? (
                  <Button 
                    onClick={handleNext} 
                    className="flex-1 sm:flex-none bg-[#FF0077] hover:bg-[#D60565] text-white h-12 sm:h-14 text-base font-semibold rounded-lg shadow-md hover:shadow-lg transition-all"
                  >
                    Next
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleSubmit} 
                    disabled={isSubmitting} 
                    className="flex-1 sm:flex-none bg-[#FF0077] hover:bg-[#D60565] text-white h-12 sm:h-14 text-base font-semibold rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

// Step 1: Team Size - Beautiful Airbnb-style card selection
function Step1TeamSize({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const teamSizeOptions = [
    {
      id: "freelancer",
      title: "Freelancer or Solo",
      subtitle: "It's just me",
      description: "Perfect for independent professionals",
      badge: "Most Popular",
      icon: "👤",
    },
    {
      id: "small",
      title: "Small Team",
      subtitle: "2 – 10 staff members",
      description: "Growing business with a small team",
      icon: "👥",
    },
    {
      id: "medium",
      title: "Medium Team",
      subtitle: "11 – 20 staff members",
      description: "Established business with a solid team",
      icon: "👨‍👩‍👧‍👦",
    },
    {
      id: "large",
      title: "Large Team",
      subtitle: "20+ staff members",
      description: "Large operation with multiple staff",
      icon: "🏢",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Tell us about your team
        </h3>
        <p className="text-base text-gray-600">
          How many staff members are there?
        </p>
        <p className="text-sm text-gray-500 mt-2">
          This helps us customize your setup experience
        </p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {teamSizeOptions.map((option) => {
          const isSelected = data.team_size === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                updateData({ team_size: option.id as any });
                // Auto-set business_type based on team size
                if (option.id === "freelancer") {
                  updateData({ business_type: "mobile" });
                } else {
                  updateData({ business_type: "salon" });
                }
              }}
              className={`relative p-6 rounded-2xl border-2 transition-all duration-200 text-left hover:shadow-lg ${
                isSelected
                  ? "border-[#FF0077] bg-[#FF0077]/5 shadow-md"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {option.badge && (
                <span className="absolute top-3 right-3 text-xs font-semibold bg-[#FF0077] text-white px-2 py-1 rounded-full">
                  {option.badge}
                </span>
              )}
              <div className="flex items-start gap-4">
                <div className="text-4xl">{option.icon}</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {option.title}
                  </h3>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {option.subtitle}
                  </p>
                  <p className="text-xs text-gray-500">
                    {option.description}
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  isSelected
                    ? "border-[#FF0077] bg-[#FF0077]"
                    : "border-gray-300"
                }`}>
                  {isSelected && (
                    <Check className="w-4 h-4 text-white" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Legacy Step1BusinessInfo - keeping for reference, will be replaced
function _Step1BusinessInfo({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [previousSoftwareOptions, setPreviousSoftwareOptions] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [isLoadingSoftwareOptions, setIsLoadingSoftwareOptions] = useState(true);

  useEffect(() => {
    const loadPreviousSoftwareOptions = async () => {
      try {
        const response = await fetcher.get<{ data: Array<{ id: string; name: string; slug: string }> }>("/api/public/previous-software-options");
        setPreviousSoftwareOptions(response.data || []);
      } catch (error) {
        console.error("Error loading previous software options:", error);
        // Fallback to empty array - the select will just be empty
        setPreviousSoftwareOptions([]);
      } finally {
        setIsLoadingSoftwareOptions(false);
      }
    };
    loadPreviousSoftwareOptions();
  }, []);
  return (
    <div className="space-y-4 sm:space-y-5 md:space-y-6">
      <Alert className="bg-blue-50 border-blue-200">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-sm">
          <strong>Quick Setup:</strong> We'll automatically configure most settings for you! 
          {data.business_type === "mobile" && " As a freelancer, we'll mark you as mobile-ready and help you select service zones."}
          {data.business_type === "both" && " We'll help you set up both salon and mobile services."}
          {(!data.business_type || data.business_type === "salon") && " We'll help you get started quickly with smart defaults."}
        </AlertDescription>
      </Alert>

      <div>
        <Label htmlFor="business_name" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Business Name <span className="text-[#FF0077]">*</span>
        </Label>
        <Input
          id="business_name"
          value={data.business_name || ""}
          onChange={(e) => updateData({ business_name: e.target.value })}
          placeholder="Enter your business name"
          className="h-12 sm:h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
          required
        />
      </div>
      <div>
        <Label htmlFor="business_type" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Business Type <span className="text-[#FF0077]">*</span>
        </Label>
        <select
          id="business_type"
          value={data.business_type || "salon"}
          onChange={(e) => {
            const newType = e.target.value as any;
            updateData({ business_type: newType });
            
            // Show helpful message about what will be auto-configured
            if (newType === "mobile") {
              toast.info("We'll automatically mark you as mobile-ready and help you set up service zones!", { duration: 4000 });
            }
          }}
          className="w-full h-12 sm:h-14 px-4 text-base border border-gray-300 rounded-lg focus:border-[#FF0077] focus:ring-[#FF0077] bg-white"
        >
          <option value="salon">Salon/Studio (Fixed Location)</option>
          <option value="mobile">Freelancer (Mobile/At-Home Services)</option>
          <option value="both">Both (Salon + Mobile Services)</option>
        </select>
        <p className="text-xs sm:text-sm text-gray-600 mt-2 leading-relaxed">
          {data.business_type === "mobile" && (
            <span>
              <strong>Freelancer mode:</strong> You'll be automatically set up as mobile-ready staff. 
              We'll help you select service zones where you can provide at-home services.
            </span>
          )}
          {data.business_type === "salon" && (
            <span>Salons have a fixed location where customers visit for services.</span>
          )}
          {data.business_type === "both" && (
            <span>
              <strong>Hybrid mode:</strong> You operate both a fixed location and provide mobile/at-home services. 
              We'll help you configure both.
            </span>
          )}
          {!data.business_type && (
            <span>Select your business model. You can upgrade from freelancer to salon later.</span>
          )}
        </p>
      </div>
      <div>
        <Label htmlFor="website" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Website URL
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">(Optional but recommended)</span>
        </Label>
        <Input
          id="website"
          type="url"
          value={data.website || ""}
          onChange={(e) => {
            let value = e.target.value.trim();
            // Auto-add https:// if missing
            if (value && !value.match(/^https?:\/\//)) {
              value = `https://${value}`;
            }
            updateData({ website: value || undefined });
          }}
          placeholder="https://yourwebsite.com"
          className="h-12 sm:h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Your website helps customers learn more about you and improves your search visibility.
        </p>
      </div>
      <div>
        <Label htmlFor="years_in_business" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Years in Business
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">(Optional)</span>
        </Label>
        <select
          id="years_in_business"
          value={data.years_in_business || ""}
          onChange={(e) => {
            const value = e.target.value;
            updateData({ years_in_business: value ? parseInt(value) : undefined });
          }}
          className="w-full h-12 sm:h-14 px-4 text-base border border-gray-300 rounded-lg focus:border-[#FF0077] focus:ring-[#FF0077] bg-white"
        >
          <option value="">Select years...</option>
          <option value="0">Just starting (0 years)</option>
          <option value="1">1 year</option>
          <option value="2">2 years</option>
          <option value="3">3 years</option>
          <option value="4">4 years</option>
          <option value="5">5 years</option>
          <option value="6">6-10 years</option>
          <option value="11">11-15 years</option>
          <option value="16">16-20 years</option>
          <option value="21">20+ years</option>
        </select>
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Your experience helps build trust with customers.
        </p>
      </div>
      <div>
        <Label htmlFor="description" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Business Description
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">
            (Recommended: 50-500 characters)
          </span>
        </Label>
        <Textarea
          id="description"
          value={data.description || ""}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length <= 2000) {
              updateData({ description: value });
            }
          }}
          placeholder="Tell customers about your business, your expertise, what makes you unique, and what they can expect..."
          className="min-h-[120px] sm:min-h-[140px] text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg resize-none"
          maxLength={2000}
        />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-2">
          <p className="text-xs sm:text-sm text-gray-600">
            {data.description && data.description.length < 50 ? (
              <span className="text-amber-600 font-medium">
                Consider adding more details ({data.description.length}/50 minimum recommended)
              </span>
            ) : (
              <span>
                {data.description?.length || 0}/2000 characters
                {data.description && data.description.length >= 50 && (
                  <span className="text-green-600 ml-2 font-medium">✓ Good length</span>
                )}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              const templates = [
                "Welcome to [Business Name]! We specialize in [service type] with [X] years of experience. Our team is dedicated to providing exceptional service in a relaxing, professional environment. We use only premium products and stay up-to-date with the latest techniques and trends.",
                "At [Business Name], we believe beauty is an art form. Our skilled professionals are passionate about helping you look and feel your best. From [service 1] to [service 2], we offer a full range of services tailored to your unique needs.",
                "[Business Name] is your trusted partner for all your beauty and wellness needs. Located in [location], we've been serving the community since [year]. Our commitment to excellence and customer satisfaction sets us apart.",
              ];
              const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
              updateData({ description: randomTemplate });
            }}
            className="text-xs sm:text-sm text-[#FF0077] hover:text-[#D60565] font-medium hover:underline transition-colors"
          >
            Use template
          </button>
        </div>
      </div>
      <div>
        <Label htmlFor="previous_software" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Previous Salon Software <span className="text-gray-500 font-normal">(Optional)</span>
        </Label>
        {isLoadingSoftwareOptions ? (
          <div className="h-12 sm:h-14 border border-gray-300 rounded-lg flex items-center justify-center">
            <p className="text-sm text-gray-500">Loading options...</p>
          </div>
        ) : (
          <select
            id="previous_software"
            value={data.previous_software || ""}
            onChange={(e) => {
              updateData({ 
                previous_software: e.target.value || undefined,
                previous_software_other: e.target.value !== "other" ? undefined : data.previous_software_other
              });
            }}
            className="w-full h-12 sm:h-14 px-4 text-base border border-gray-300 rounded-lg focus:border-[#FF0077] focus:ring-[#FF0077] bg-white"
          >
            {previousSoftwareOptions.length > 0 ? (
              previousSoftwareOptions.map((option) => (
                <option key={option.id} value={option.slug}>
                  {option.name}
                </option>
              ))
            ) : (
              // Fallback if API fails
              <>
                <option value="">None / First time using salon software</option>
                <option value="other">Other (please specify)</option>
              </>
            )}
          </select>
        )}
        {data.previous_software === "other" && (
          <Input
            id="previous_software_other"
            value={data.previous_software_other || ""}
            onChange={(e) => updateData({ previous_software_other: e.target.value })}
            placeholder="Enter the name of the software"
            className="mt-3 h-12 sm:h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
          />
        )}
        <p className="text-xs sm:text-sm text-gray-600 mt-2 leading-relaxed">
          Help us understand where providers are coming from. This information is only visible to administrators.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
        <div>
          <Label htmlFor="phone" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
            Phone <span className="text-[#FF0077]">*</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            value={data.phone || ""}
            onChange={(e) => updateData({ phone: e.target.value })}
            placeholder="+27 12 345 6789"
            className="h-12 sm:h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
            required
          />
        </div>
        <div>
          <Label htmlFor="email" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
            Email <span className="text-[#FF0077]">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            value={data.email || ""}
            onChange={(e) => updateData({ email: e.target.value })}
            placeholder="business@example.com"
            className="h-12 sm:h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="languages_spoken" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Languages You Speak
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">(Optional)</span>
        </Label>
        <p className="text-xs sm:text-sm text-gray-600 mb-2">
          Select the human languages you can communicate in with clients (e.g., English, Zulu, Afrikaans, Xhosa, etc.). 
          This helps clients find providers who speak their language.
        </p>
        <div className="flex flex-wrap gap-2">
          {["English", "Afrikaans", "Zulu", "Xhosa", "Sesotho", "Tswana", "Venda", "Tsonga", "Swati", "Ndebele", "Southern Sotho", "Northern Sotho"].map((lang) => {
            const isSelected = (data.languages_spoken || ["English"]).includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => {
                  const current = data.languages_spoken || ["English"];
                  if (isSelected) {
                    // Don't allow removing if it's the only one
                    if (current.length > 1) {
                      updateData({ languages_spoken: current.filter((l) => l !== lang) });
                    }
                  } else {
                    updateData({ languages_spoken: [...current, lang] });
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isSelected
                    ? "bg-[#FF0077] text-white border-2 border-[#FF0077]"
                    : "bg-white text-gray-700 border-2 border-gray-300 hover:border-[#FF0077] hover:text-[#FF0077]"
                } ${isSelected && (data.languages_spoken || ["English"]).length === 1 ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}
                disabled={isSelected && (data.languages_spoken || ["English"]).length === 1}
                title={isSelected && (data.languages_spoken || ["English"]).length === 1 ? "At least one language is required" : ""}
              >
                {lang}
                {isSelected && (data.languages_spoken || ["English"]).length > 1 && (
                  <span className="ml-1">×</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Selected: {(data.languages_spoken || ["English"]).join(", ")}
        </p>
      </div>
    </div>
  );
}

// Step 2: Identity - Name, Email, Phone with Verification
function Step2Identity({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    if (!data.owner_phone) {
      toast.error("Please enter your phone number first");
      return;
    }

    try {
      setIsSendingCode(true);
      await fetcher.post("/api/provider/onboarding/verify-phone", {
        phone: data.owner_phone,
      });
      
      setCodeSent(true);
      setCountdown(300); // 5 minutes
      toast.success("Verification code sent to your phone");
    } catch (error) {
      toast.error("Failed to send verification code. Please try again.");
      console.error("Error sending code:", error);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 4) {
      toast.error("Please enter a 4-digit code");
      return;
    }

    try {
      setIsVerifying(true);
      const response = await fetcher.put<{ data?: { verified?: boolean } }>("/api/provider/onboarding/verify-phone/verify", {
        phone: data.owner_phone,
        code: verificationCode,
      });

      if (response?.data?.verified) {
        updateData({ phone_verified: true });
        toast.success("Phone number verified!");
      } else {
        toast.error("Invalid verification code. Please try again.");
      }
    } catch (error) {
      toast.error("Verification failed. Please try again.");
      console.error("Error verifying code:", error);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">!</span>
          </div>
          <div>
            <h4 className="font-semibold text-blue-900 mb-1">Salon Owner Information</h4>
            <p className="text-sm text-blue-800 leading-relaxed">
              We assume you are the salon owner creating this account. Please provide your personal details below. 
              This information will be used for account verification and communication.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Name */}
        <div>
          <Label htmlFor="owner_name" className="text-base font-semibold text-gray-900 mb-2 block">
            Your Name <span className="text-[#FF0077]">*</span>
          </Label>
          <Input
            id="owner_name"
            value={data.owner_name || ""}
            onChange={(e) => updateData({ owner_name: e.target.value })}
            placeholder="Enter your full name"
            className="h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
            required
          />
        </div>

        {/* Email */}
        <div>
          <Label htmlFor="owner_email" className="text-base font-semibold text-gray-900 mb-2 block">
            Email Address <span className="text-[#FF0077]">*</span>
          </Label>
          <Input
            id="owner_email"
            type="email"
            value={data.owner_email || ""}
            onChange={(e) => updateData({ owner_email: e.target.value })}
            placeholder="your.email@example.com"
            className="h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
            required
          />
        </div>

        {/* Phone with Verification */}
        <div>
          <Label htmlFor="owner_phone" className="text-base font-semibold text-gray-900 mb-2 block">
            Mobile Number <span className="text-[#FF0077]">*</span>
          </Label>
          <div className="flex gap-3">
            <Input
              id="owner_phone"
              type="tel"
              value={data.owner_phone || ""}
              onChange={(e) => {
                const phone = e.target.value.replace(/\D/g, "");
                updateData({ owner_phone: phone, phone_verified: false });
                setCodeSent(false);
                setVerificationCode("");
              }}
              placeholder="0821234567"
              className="flex-1 h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
              required
            />
            <Button
              type="button"
              onClick={handleSendCode}
              disabled={!data.owner_phone || isSendingCode || countdown > 0}
              className="h-14 px-6 bg-[#FF0077] hover:bg-[#D60565] text-white rounded-xl disabled:opacity-50"
            >
              {isSendingCode ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : countdown > 0 ? (
                `Resend (${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')})`
              ) : (
                "Send Code"
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            We'll send a 4-digit verification code via SMS to verify your number. This helps us keep your account secure.
          </p>

          {/* Verification Code Input */}
          {codeSent && (
            <div className="mt-4 space-y-3">
              <Label htmlFor="verification_code" className="text-base font-semibold text-gray-900 mb-2 block">
                Enter Verification Code <span className="text-[#FF0077]">*</span>
              </Label>
              <div className="flex gap-3">
                <Input
                  id="verification_code"
                  type="text"
                  maxLength={4}
                  value={verificationCode}
                  onChange={(e) => {
                    const code = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setVerificationCode(code);
                  }}
                  placeholder="1234"
                  className="h-14 text-2xl text-center font-bold tracking-widest border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
                />
                <Button
                  type="button"
                  onClick={handleVerifyCode}
                  disabled={verificationCode.length !== 4 || isVerifying || data.phone_verified}
                  className="h-14 px-6 bg-[#FF0077] hover:bg-[#D60565] text-white rounded-xl disabled:opacity-50"
                >
                  {isVerifying ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : data.phone_verified ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    "Verify"
                  )}
                </Button>
              </div>
              {data.phone_verified && (
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <Check className="w-4 h-4" />
                  Phone number verified
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Step 8: Photos - Thumbnail and Gallery
function Step8Photos({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(data.thumbnail_url || null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>(data.gallery || []);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!validateFileType(file, IMAGE_CONSTRAINTS.allowedTypes)) {
      toast.error("Invalid file type. Please upload a JPEG, PNG, or WebP image.");
      return;
    }

    if (!validateFileSize(file, IMAGE_CONSTRAINTS.maxSizeBytes)) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setThumbnailFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setThumbnailPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (!validateFileType(file, IMAGE_CONSTRAINTS.allowedTypes)) {
        toast.error(`${file.name}: Invalid file type`);
        continue;
      }
      if (!validateFileSize(file, IMAGE_CONSTRAINTS.maxSizeBytes)) {
        toast.error(`${file.name}: File too large (max 5MB)`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setGalleryFiles([...galleryFiles, ...validFiles]);
    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGalleryPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeGalleryImage = (index: number) => {
    const newPreviews = galleryPreviews.filter((_, i) => i !== index);
    const newFiles = galleryFiles.filter((_, i) => i !== index);
    setGalleryPreviews(newPreviews);
    setGalleryFiles(newFiles);
  };

  // Store files in formData for later upload (after provider creation)
  useEffect(() => {
    // Note: We'll upload these after provider is created in the API
    // For now, just store previews
  }, [thumbnailFile, galleryFiles]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-purple-900 mb-2">Why Photos Matter</h4>
            {data.business_type === "mobile" ? (
              <div className="text-sm text-purple-800 space-y-2">
                <p>
                  <strong>Your Photo:</strong> A professional photo of yourself is crucial. People are 2-3x more likely to click on a human face than a logo.
                </p>
                <p>
                  <strong>Portfolio Gallery:</strong> Showcase your completed work, before/after transformations, and service examples. This builds trust and helps customers see your quality.
                </p>
              </div>
            ) : (
              <div className="text-sm text-purple-800 space-y-2">
                <p>
                  <strong>Salon/Owner Photo:</strong> A photo of your salon interior/exterior or yourself as the owner is crucial. People are 2-3x more likely to click on real photos than logos.
                </p>
                <p>
                  <strong>Portfolio Gallery:</strong> Showcase your completed work, before/after transformations, and service examples. This builds trust and helps customers see your quality.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Thumbnail Upload */}
      <div>
        <Label className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          {data.business_type === "mobile" ? "Your Photo" : "Salon Photo or Owner Photo"}
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">(Recommended)</span>
        </Label>
        <p className="text-xs sm:text-sm text-gray-600 mb-3">
          {data.business_type === "mobile" ? (
            <>
              <strong>For freelancers:</strong> Upload a professional photo of yourself. People are more likely to click on a human face than a logo. 
              This helps build trust and personal connection with clients. Use a square image (recommended: 800x800px or larger).
            </>
          ) : (
            <>
              <strong>For salons:</strong> Upload a photo of your salon interior/exterior or a professional photo of yourself as the owner. 
              People are more likely to click on real photos than logos. This helps build trust and shows your space or team. 
              Use a square image (recommended: 800x800px or larger).
            </>
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          {thumbnailPreview ? (
            <div className="relative w-full sm:w-48 h-48 border-2 border-gray-200 rounded-lg overflow-hidden">
              <Image
                src={thumbnailPreview}
                alt="Thumbnail preview"
                fill
                className="object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => {
                  setThumbnailFile(null);
                  setThumbnailPreview(null);
                  updateData({ thumbnail_url: undefined });
                  if (thumbnailInputRef.current) {
                    thumbnailInputRef.current.value = "";
                  }
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="w-full sm:w-48 h-48 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
              <div className="text-center p-4">
                <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-600">No thumbnail</p>
              </div>
            </div>
          )}
          <div className="flex-1">
            <Input
              ref={thumbnailInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleThumbnailSelect}
              className="hidden"
              id="thumbnail-upload"
            />
            <Label
              htmlFor="thumbnail-upload"
              className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4 mr-2" />
              {thumbnailPreview ? "Change Thumbnail" : "Upload Thumbnail"}
            </Label>
            {thumbnailFile && (
              <p className="text-xs text-gray-600 mt-2">
                {thumbnailFile.name} ({(thumbnailFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Gallery Upload */}
      <div>
        <Label className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Portfolio / Work Gallery
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">(Optional but recommended)</span>
        </Label>
        <p className="text-xs sm:text-sm text-gray-600 mb-3">
          <strong>Showcase your work:</strong> Upload photos of your completed work, before/after transformations, or examples of your services. 
          This is your portfolio that helps clients see the quality of your work. You can add up to 10 images. Minimum 3 recommended for best results.
        </p>
        <Input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleGallerySelect}
          className="hidden"
          id="gallery-upload"
        />
        <Label
          htmlFor="gallery-upload"
          className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors mb-4"
        >
              <Upload className="w-4 h-4 mr-2" />
          Add Portfolio Images
        </Label>

        {galleryPreviews.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
            {galleryPreviews.map((preview, index) => (
              <div key={index} className="relative aspect-square border-2 border-gray-200 rounded-lg overflow-hidden">
                <Image
                  src={preview}
                  alt={`Gallery image ${index + 1}`}
                  fill
                  className="object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => removeGalleryImage(index)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {galleryFiles.length > 0 && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              {galleryFiles.length} image{galleryFiles.length !== 1 ? "s" : ""} ready to upload after onboarding
            </p>
          </div>
        )}
      </div>

      {(!thumbnailPreview && galleryPreviews.length === 0) && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            <strong>Tip:</strong> Providers with photos get 3x more views! Your portfolio gallery helps clients see your work quality. 
            You can skip this step and add photos later, but we recommend adding at least a thumbnail now to improve your visibility in search results.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// Step 3: Business Details - Consolidated business information
function Step3BusinessDetails({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
        <p className="text-sm text-gray-700">
          <strong>💡 Tip:</strong> Complete business details help customers find you and build trust. 
          The more information you provide, the better your visibility on our platform.
        </p>
      </div>

      <div>
        <Label htmlFor="business_name" className="text-base font-semibold text-gray-900 mb-2 block">
          Business Name <span className="text-[#FF0077]">*</span>
        </Label>
        <p className="text-xs text-gray-500 mb-2">
          This is how customers will see your business on the platform
        </p>
        <Input
          id="business_name"
          value={data.business_name || ""}
          onChange={(e) => updateData({ business_name: e.target.value })}
          placeholder="Enter your business name"
          className="h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
          required
        />
      </div>

      <div>
        <Label htmlFor="description" className="text-base font-semibold text-gray-900 mb-2 block">
          Business Description <span className="text-gray-500 font-normal text-sm">(Recommended)</span>
        </Label>
        <p className="text-xs text-gray-500 mb-2">
          Describe your business, services, and what makes you special. This appears on your public profile.
        </p>
        <Textarea
          id="description"
          value={data.description || ""}
          onChange={(e) => updateData({ description: e.target.value })}
          placeholder="Tell customers about your business, your expertise, and what makes you unique..."
          className="min-h-[120px] text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl resize-none"
          maxLength={2000}
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-500">
            {(data.description?.length || 0)}/2000 characters
          </p>
          {data.description && data.description.length < 50 && (
            <p className="text-xs text-amber-600 font-medium">
              Consider adding more details (at least 50 characters recommended)
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="website" className="text-base font-semibold text-gray-900 mb-2 block">
          Website URL <span className="text-gray-500 font-normal text-sm">(Optional)</span>
        </Label>
        <p className="text-xs text-gray-500 mb-2">
          Your website helps customers learn more about you and improves your search visibility
        </p>
        <Input
          id="website"
          type="url"
          value={data.website || ""}
          onChange={(e) => {
            let value = e.target.value.trim();
            if (value && !value.match(/^https?:\/\//)) {
              value = `https://${value}`;
            }
            updateData({ website: value || undefined });
          }}
          placeholder="https://yourwebsite.com"
          className="h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
        />
      </div>

      <div>
        <Label htmlFor="years_in_business" className="text-base font-semibold text-gray-900 mb-2 block">
          Years in Business <span className="text-gray-500 font-normal text-sm">(Optional)</span>
        </Label>
        <p className="text-xs text-gray-500 mb-2">
          Your experience helps build trust with customers
        </p>
        <select
          id="years_in_business"
          value={data.years_in_business || ""}
          onChange={(e) => updateData({ years_in_business: e.target.value ? parseInt(e.target.value) : undefined })}
          className="w-full h-14 px-4 text-base border border-gray-300 rounded-xl focus:border-[#FF0077] focus:ring-[#FF0077] bg-white"
        >
          <option value="">Select years...</option>
          <option value="0">Just starting (0 years)</option>
          <option value="1">1 year</option>
          <option value="2">2 years</option>
          <option value="3">3 years</option>
          <option value="4">4 years</option>
          <option value="5">5 years</option>
          <option value="6">6-10 years</option>
          <option value="11">11-15 years</option>
          <option value="16">16-20 years</option>
          <option value="21">20+ years</option>
        </select>
      </div>

      {/* Languages Spoken */}
      <div>
        <Label htmlFor="languages_spoken" className="text-base font-semibold text-gray-900 mb-2 block">
          Languages You Speak
          <span className="text-gray-500 font-normal text-sm ml-2">(Optional but recommended)</span>
        </Label>
        <p className="text-xs text-gray-600 mb-3">
          Select the human languages you can communicate in with clients. This helps customers find providers who speak their language.
        </p>
        <div className="flex flex-wrap gap-2">
          {["English", "Afrikaans", "Zulu", "Xhosa", "Sesotho", "Tswana", "Venda", "Tsonga", "Swati", "Ndebele", "Southern Sotho", "Northern Sotho"].map((lang) => {
            const isSelected = (data.languages_spoken || ["English"]).includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => {
                  const current = data.languages_spoken || ["English"];
                  if (isSelected) {
                    if (current.length > 1) {
                      updateData({ languages_spoken: current.filter((l) => l !== lang) });
                    }
                  } else {
                    updateData({ languages_spoken: [...current, lang] });
                  }
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isSelected
                    ? "bg-[#FF0077] text-white border-2 border-[#FF0077]"
                    : "bg-white text-gray-700 border-2 border-gray-300 hover:border-[#FF0077] hover:text-[#FF0077]"
                } ${isSelected && (data.languages_spoken || ["English"]).length === 1 ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}
                disabled={isSelected && (data.languages_spoken || ["English"]).length === 1}
                title={isSelected && (data.languages_spoken || ["English"]).length === 1 ? "At least one language is required" : ""}
              >
                {lang}
                {isSelected && (data.languages_spoken || ["English"]).length > 1 && (
                  <span className="ml-1">×</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Selected: {(data.languages_spoken || ["English"]).join(", ")}
        </p>
      </div>

      {/* Social Media Links */}
      <div>
        <Label className="text-base font-semibold text-gray-900 mb-2 block">
          Social Media Links
          <span className="text-gray-500 font-normal text-sm ml-2">(Optional but recommended)</span>
        </Label>
        <p className="text-xs text-gray-600 mb-3">
          Add your social media profiles to help customers find and connect with you online.
        </p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="facebook" className="text-sm font-medium text-gray-700 mb-1 block">
              Facebook
            </Label>
            <Input
              id="facebook"
              type="url"
              value={data.social_media_links?.facebook || ""}
              onChange={(e) => {
                const current = data.social_media_links || {};
                updateData({
                  social_media_links: {
                    ...current,
                    facebook: e.target.value.trim() || undefined,
                  },
                });
              }}
              placeholder="https://facebook.com/yourpage"
              className="h-12 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
            />
          </div>
          <div>
            <Label htmlFor="instagram" className="text-sm font-medium text-gray-700 mb-1 block">
              Instagram
            </Label>
            <Input
              id="instagram"
              type="url"
              value={data.social_media_links?.instagram || ""}
              onChange={(e) => {
                const current = data.social_media_links || {};
                updateData({
                  social_media_links: {
                    ...current,
                    instagram: e.target.value.trim() || undefined,
                  },
                });
              }}
              placeholder="https://instagram.com/yourprofile"
              className="h-12 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
            />
          </div>
          <div>
            <Label htmlFor="twitter" className="text-sm font-medium text-gray-700 mb-1 block">
              Twitter / X
            </Label>
            <Input
              id="twitter"
              type="url"
              value={data.social_media_links?.twitter || ""}
              onChange={(e) => {
                const current = data.social_media_links || {};
                updateData({
                  social_media_links: {
                    ...current,
                    twitter: e.target.value.trim() || undefined,
                  },
                });
              }}
              placeholder="https://twitter.com/yourhandle"
              className="h-12 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
            />
          </div>
          <div>
            <Label htmlFor="linkedin" className="text-sm font-medium text-gray-700 mb-1 block">
              LinkedIn
            </Label>
            <Input
              id="linkedin"
              type="url"
              value={data.social_media_links?.linkedin || ""}
              onChange={(e) => {
                const current = data.social_media_links || {};
                updateData({
                  social_media_links: {
                    ...current,
                    linkedin: e.target.value.trim() || undefined,
                  },
                });
              }}
              placeholder="https://linkedin.com/in/yourprofile"
              className="h-12 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 4: Payment Setup - Yoco Machine
function Step4PaymentSetup({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const options = [
    { id: "yes", title: "Yes, I do", description: "I have a Yoco card machine" },
    { id: "no", title: "No (but I want one)", description: "I'd like to get a Yoco machine" },
    { id: "other", title: "Other", description: "I have another card machine" },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Payment Setup
        </h3>
        <p className="text-base text-gray-600 mb-2">
          Do you have a Yoco Machine?
        </p>
        <p className="text-sm text-gray-500">
          Yoco is a popular card payment solution in South Africa. We'll help you set it up after onboarding.
        </p>
      </div>

      <div className="space-y-4">
        {options.map((option) => {
          const isSelected = data.yoco_machine === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => updateData({ yoco_machine: option.id as any })}
              className={`w-full p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                isSelected
                  ? "border-[#FF0077] bg-[#FF0077]/5 shadow-md"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {option.title}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {option.description}
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  isSelected
                    ? "border-[#FF0077] bg-[#FF0077]"
                    : "border-gray-300"
                }`}>
                  {isSelected && <Check className="w-4 h-4 text-white" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {data.yoco_machine === "other" && (
        <div className="mt-4">
          <Label htmlFor="yoco_machine_other" className="text-base font-semibold text-gray-900 mb-2 block">
            What card machine do you have?
          </Label>
          <Input
            id="yoco_machine_other"
            value={data.yoco_machine_other || ""}
            onChange={(e) => updateData({ yoco_machine_other: e.target.value })}
            placeholder="e.g., iZettle, Square, etc."
            className="h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
          />
        </div>
      )}

      {/* VAT Registration */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            VAT Registration
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Are you VAT registered with SARS? VAT registration is mandatory if your annual turnover is R1 million or more.
            If you make less than R1 million per year, you don't need to be VAT registered.
          </p>
        </div>
        
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              updateData({ 
                is_vat_registered: true,
                vat_number: data.vat_number || ""
              });
            }}
            className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left ${
              data.is_vat_registered === true
                ? "border-[#FF0077] bg-[#FF0077]/5 shadow-md"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Yes, I am VAT registered</h4>
                <p className="text-sm text-gray-600">I have a SARS VAT number</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                data.is_vat_registered === true
                  ? "border-[#FF0077] bg-[#FF0077]"
                  : "border-gray-300"
              }`}>
                {data.is_vat_registered === true && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
          </button>
          
          <button
            type="button"
            onClick={() => {
              updateData({ 
                is_vat_registered: false,
                vat_number: undefined
              });
            }}
            className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left ${
              data.is_vat_registered === false
                ? "border-[#FF0077] bg-[#FF0077]/5 shadow-md"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">No, I'm not VAT registered</h4>
                <p className="text-sm text-gray-600">My annual turnover is less than R1 million</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                data.is_vat_registered === false
                  ? "border-[#FF0077] bg-[#FF0077]"
                  : "border-gray-300"
              }`}>
                {data.is_vat_registered === false && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
          </button>
        </div>

        {data.is_vat_registered === true && (
          <div className="mt-4">
            <Label htmlFor="vat_number" className="text-base font-semibold text-gray-900 mb-2 block">
              VAT Number (SARS) <span className="text-[#FF0077]">*</span>
            </Label>
            <Input
              id="vat_number"
              type="text"
              placeholder="4123456789"
              value={data.vat_number || ""}
              onChange={(e) => {
                // Only allow digits
                const value = e.target.value.replace(/\D/g, '');
                if (value.length <= 10) {
                  updateData({ vat_number: value });
                }
              }}
              maxLength={10}
              required
              className="h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
            />
            <p className="text-xs text-gray-600 mt-2">
              Your 10-digit SARS VAT registration number (must start with 4)
            </p>
            {data.vat_number && data.vat_number.length === 10 && !data.vat_number.startsWith('4') && (
              <p className="text-xs text-red-600 mt-1">
                South African VAT numbers must start with 4
              </p>
            )}
          </div>
        )}

        {data.is_vat_registered === false && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm text-green-800">
              <strong>Not VAT Registered:</strong> No tax will be collected from customers. This is suitable for small businesses making less than R1 million per year.
            </p>
          </div>
        )}
      </div>

      {/* Payout Setup */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-blue-800">
            <strong>Payout Setup:</strong> To receive payments from bookings, you'll need to add your bank account details. 
            You can complete this now or set it up later in Settings.
          </p>
        </div>
        <div className="flex items-center justify-between p-4 bg-white border-2 border-gray-200 rounded-xl">
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Bank Account for Payouts
            </h3>
            <p className="text-sm text-gray-600">
              Add your bank details to receive payments
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // Open payout setup in a new tab or modal
              // For now, mark as "will set up later"
              updateData({ payout_setup_complete: false });
              toast.info("You can set up your payout account after onboarding in Settings → Payout Accounts");
            }}
            className="border-[#FF0077] text-[#FF0077] hover:bg-[#FF0077]/5"
          >
            Set Up Later
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          You can complete payout setup after onboarding. Payments will be held until your bank account is verified.
        </p>
      </div>
    </div>
  );
}

// Step 5: Current Software
function Step5CurrentSoftware({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [softwareOptions, setSoftwareOptions] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const response = await fetcher.get<{ data: Array<{ id: string; name: string; slug: string }> }>("/api/public/previous-software-options");
        setSoftwareOptions(response.data || []);
      } catch (error) {
        console.error("Error loading software options:", error);
        setSoftwareOptions([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadOptions();
  }, []);

  const options = [
    { id: "none", name: "No, I'm new to salon software" },
    ...softwareOptions.map(opt => ({ id: opt.slug, name: opt.name })),
    { id: "other", name: "Other" },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Current Software
        </h3>
        <p className="text-base text-gray-600 mb-2">
          Are you moving from another system?
        </p>
        <p className="text-sm text-gray-500">
          This helps us provide better migration support and understand your needs
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF0077]" />
        </div>
      ) : (
        <div className="space-y-4">
          {options.map((option) => {
            const isSelected = data.previous_software === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  updateData({ previous_software: option.id, previous_software_other: undefined });
                }}
                className={`w-full p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                  isSelected
                    ? "border-[#FF0077] bg-[#FF0077]/5 shadow-md"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-gray-900">
                    {option.name}
                  </span>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    isSelected
                      ? "border-[#FF0077] bg-[#FF0077]"
                      : "border-gray-300"
                  }`}>
                    {isSelected && <Check className="w-4 h-4 text-white" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {data.previous_software === "other" && (
        <div className="mt-4">
          <Label htmlFor="previous_software_other" className="text-base font-semibold text-gray-900 mb-2 block">
            What software were you using?
          </Label>
          <Input
            id="previous_software_other"
            value={data.previous_software_other || ""}
            onChange={(e) => updateData({ previous_software_other: e.target.value })}
            placeholder="Enter software name"
            className="h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
          />
        </div>
      )}
    </div>
  );
}

// Step 6: Payroll
function Step6Payroll({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const options = [
    { id: "commission", title: "Commission", description: "Staff earn a percentage of sales" },
    { id: "hourly", title: "Hourly", description: "Staff are paid by the hour" },
    { id: "both", title: "Both", description: "Mix of commission and hourly" },
    { id: "other", title: "Other", description: "Different payment structure" },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Payroll Structure
        </h3>
        <p className="text-base text-gray-600 mb-2">
          How do you pay your staff/yourself?
        </p>
        <p className="text-sm text-gray-500">
          This information helps us understand your business model (for analytics only)
        </p>
      </div>

      <div className="space-y-4">
        {options.map((option) => {
          const isSelected = data.payroll_type === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => updateData({ payroll_type: option.id as any })}
              className={`w-full p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                isSelected
                  ? "border-[#FF0077] bg-[#FF0077]/5 shadow-md"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {option.title}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {option.description}
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  isSelected
                    ? "border-[#FF0077] bg-[#FF0077]"
                    : "border-gray-300"
                }`}>
                  {isSelected && <Check className="w-4 h-4 text-white" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {data.payroll_type === "other" && (
        <div className="mt-4">
          <Label htmlFor="payroll_details" className="text-base font-semibold text-gray-900 mb-2 block">
            Please describe your payroll structure
          </Label>
          <Textarea
            id="payroll_details"
            value={data.payroll_details || ""}
            onChange={(e) => updateData({ payroll_details: e.target.value })}
            placeholder="Describe how you pay your staff..."
            className="min-h-[100px] text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl resize-none"
          />
        </div>
      )}
    </div>
  );
}

function Step7Location({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const isFreelancer = data.business_type === "mobile";
  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>([]);
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);

  useEffect(() => {
    const loadCountries = async () => {
      try {
        const response = await fetcher.get<{ data: Array<{ code: string; name: string }> }>("/api/public/countries");
        const countriesData = response.data || [];
        
        // If API returns empty array, use fallback
        if (countriesData.length === 0) {
          console.warn("Countries API returned empty array, using fallback");
          setCountries([
            { code: "ZA", name: "South Africa" },
            { code: "KE", name: "Kenya" },
            { code: "GH", name: "Ghana" },
            { code: "NG", name: "Nigeria" },
            { code: "EG", name: "Egypt" },
            { code: "US", name: "United States" },
            { code: "GB", name: "United Kingdom" },
            { code: "CA", name: "Canada" },
            { code: "AU", name: "Australia" },
            { code: "NZ", name: "New Zealand" },
          ]);
        } else {
          setCountries(countriesData);
        }
      } catch (error) {
        console.error("Error loading countries:", error);
        // Fallback to common countries
        setCountries([
          { code: "ZA", name: "South Africa" },
          { code: "KE", name: "Kenya" },
          { code: "GH", name: "Ghana" },
          { code: "NG", name: "Nigeria" },
          { code: "EG", name: "Egypt" },
          { code: "US", name: "United States" },
          { code: "GB", name: "United Kingdom" },
          { code: "CA", name: "Canada" },
          { code: "AU", name: "Australia" },
          { code: "NZ", name: "New Zealand" },
        ]);
      } finally {
        setIsLoadingCountries(false);
      }
    };
    loadCountries();
  }, []);

  const handleAddressSelect = (addressData: {
    address_line1: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
  }) => {
    updateData({
      address: {
        line1: addressData.address_line1,
        line2: data.address?.line2 || undefined,
        city: addressData.city,
        state: addressData.state || "",
        postal_code: addressData.postal_code || "",
        country: addressData.country,
        latitude: addressData.latitude,
        longitude: addressData.longitude,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-green-900 mb-2">Business Location</h4>
            <p className="text-sm text-green-800">
              {isFreelancer ? (
                <>
                  Enter your base location or service area center. This helps customers find you and we'll use it to calculate travel fees and distances for at-home services.
                </>
              ) : (
                <>
                  Enter your salon address. This helps customers find you on the map and enables location-based search. We'll also use it to calculate travel fees for at-home services.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Address Autocomplete - Main field */}
      <div>
        <Label htmlFor="address" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Address <span className="text-[#FF0077]">*</span>
        </Label>
        <AddressAutocomplete
          value={data.address?.line1 || ""}
          onChange={handleAddressSelect}
          placeholder="Start typing your address (e.g., 12 Gary Street, Johannesburg)"
          country={(() => {
            // Convert country name to code for Mapbox if available
            const countryName = data.address?.country || "South Africa";
            const countryObj = countries.find(c => c.name === countryName);
            return countryObj?.code || countryName;
          })()}
          className="h-12 sm:h-14 text-base"
          required
        />
        <p className="text-xs sm:text-sm text-gray-500 mt-2">
          💡 Start typing your address and select from suggestions to automatically fill in city, state, and postal code.
        </p>
      </div>

      {/* Apartment/Suite - Optional */}
      <div>
        <Label htmlFor="address_line2" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Apartment, suite, etc. <span className="text-gray-500 font-normal">(Optional)</span>
        </Label>
        <Input
          id="address_line2"
          value={data.address?.line2 || ""}
          onChange={(e) => updateData({
            address: {
              ...data.address,
              line2: e.target.value || undefined,
            } as any
          })}
          placeholder="Apt 4B, Suite 200, etc."
          className="h-12 sm:h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
        />
      </div>

      {/* City - Auto-filled from address but can be edited */}
      <div>
        <Label htmlFor="city" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          City <span className="text-[#FF0077]">*</span>
        </Label>
        <Input
          id="city"
          value={data.address?.city || ""}
          onChange={(e) => updateData({
            address: {
              ...data.address,
              city: e.target.value,
            } as any
          })}
          placeholder="City (e.g., Cape Town)"
          className="h-12 sm:h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
          required
        />
        {data.address?.city && (
          <p className="text-xs text-green-600 mt-1">✓ Auto-filled from address</p>
        )}
      </div>

      {/* State/Province and Postal Code - Auto-filled but can be edited */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
        <div>
          <Label htmlFor="state" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
            State/Province <span className="text-gray-500 font-normal text-xs">(Optional)</span>
          </Label>
          <Input
            id="state"
            value={data.address?.state || ""}
            onChange={(e) => updateData({
              address: {
                ...data.address,
                state: e.target.value,
              } as any
            })}
            placeholder="State or Province"
            className="h-12 sm:h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
          />
        </div>
        <div>
          <Label htmlFor="postal_code" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
            Postal Code <span className="text-gray-500 font-normal text-xs">(Optional)</span>
          </Label>
          <Input
            id="postal_code"
            value={data.address?.postal_code || ""}
            onChange={(e) => updateData({
              address: {
                ...data.address,
                postal_code: e.target.value,
              } as any
            })}
            placeholder="Postal Code"
            className="h-12 sm:h-14 text-base border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
          />
        </div>
      </div>

      {/* Country - Dropdown */}
      <div>
        <Label htmlFor="country" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Country <span className="text-[#FF0077]">*</span>
        </Label>
        {isLoadingCountries ? (
          <div className="h-12 sm:h-14 border border-gray-300 rounded-lg flex items-center justify-center">
            <p className="text-sm text-gray-500">Loading countries...</p>
          </div>
        ) : (
          <select
            id="country"
            value={data.address?.country || "South Africa"}
            onChange={(e) => updateData({
              address: {
                ...data.address,
                country: e.target.value,
              } as any
            })}
            className="w-full h-12 sm:h-14 px-4 text-base border border-gray-300 rounded-lg focus:border-[#FF0077] focus:ring-[#FF0077] bg-white"
            required
          >
            {countries.map((country) => (
              <option key={country.code} value={country.name}>
                {country.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function Step9ServiceZones({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [suggestedZones, setSuggestedZones] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>(data.selected_zone_ids || []);

  useEffect(() => {
    const loadZones = async () => {
      if (!data.address?.latitude || !data.address?.longitude) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        // Call onboarding-specific suggest endpoint
        const response = await fetcher.post<{ data: { suggested_zones: any[] } }>("/api/provider/onboarding/suggest-zones", {
          address: data.address?.line1 || "",
          latitude: data.address?.latitude,
          longitude: data.address?.longitude,
          city: data.address?.city || "",
          postal_code: data.address?.postal_code || "",
          country: data.address?.country || "",
        });
        const zones = response.data?.suggested_zones || [];
        setSuggestedZones(zones);
        
        // Auto-select all suggested zones
        if (zones.length > 0) {
          const autoSelected = zones.map((z: any) => z.id);
          setSelectedZoneIds(autoSelected);
          updateData({ selected_zone_ids: autoSelected });
          toast.success(`Auto-selected ${autoSelected.length} zone${autoSelected.length !== 1 ? 's' : ''} matching your location`);
        }
      } catch (error) {
        console.error("Error loading suggested zones:", error);
        // If suggest endpoint fails, we'll skip zone selection
        // Zones can be configured after onboarding
      } finally {
        setIsLoading(false);
      }
    };

    loadZones();
  }, [data.address?.latitude, data.address?.longitude]);

  const toggleZone = (zoneId: string) => {
    const newSelection = selectedZoneIds.includes(zoneId)
      ? selectedZoneIds.filter(id => id !== zoneId)
      : [...selectedZoneIds, zoneId];
    setSelectedZoneIds(newSelection);
    updateData({ selected_zone_ids: newSelection });
  };

  const selectAll = () => {
    const allIds = suggestedZones.map(z => z.id);
    setSelectedZoneIds(allIds);
    updateData({ selected_zone_ids: allIds });
    toast.success(`Selected all ${allIds.length} zones`);
  };

  const deselectAll = () => {
    setSelectedZoneIds([]);
    updateData({ selected_zone_ids: [] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF0077] mx-auto mb-4"></div>
          <p className="text-gray-600">Finding service zones matching your location...</p>
        </div>
      </div>
    );
  }

  if (!data.address?.latitude || !data.address?.longitude) {
    return (
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          Please complete the location step first. We need your address coordinates to find matching service zones.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 md:space-y-6">
      <Alert className="bg-blue-50 border-blue-200">
        <AlertCircle className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <strong>Service zones</strong> define where you can provide at-home services. We've automatically found zones matching your location. You can select or skip this step and configure zones later.
        </AlertDescription>
      </Alert>

      {suggestedZones.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 text-sm">
            No service zones found for your location. You can configure zones later in Settings &gt; Service Zones.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Found <strong>{suggestedZones.length}</strong> zone{suggestedZones.length !== 1 ? 's' : ''} matching your location
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>
                Deselect All
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {suggestedZones.map((zone) => (
              <div
                key={zone.id}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedZoneIds.includes(zone.id)
                    ? "border-[#FF0077] bg-[#FF0077]/5"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => toggleZone(zone.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={selectedZoneIds.includes(zone.id)}
                        onChange={() => toggleZone(zone.id)}
                        className="w-4 h-4 text-[#FF0077] border-gray-300 rounded focus:ring-[#FF0077]"
                      />
                      <h3 className="font-semibold text-lg">{zone.name}</h3>
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                        {zone.zone_type === "postal_code" ? "Postal Code" :
                         zone.zone_type === "city" ? "City" :
                         zone.zone_type === "radius" ? "Radius" : "Polygon"}
                      </span>
                    </div>
                    <p className="text-sm text-blue-700 mb-1">{zone.match_reason}</p>
                    <p className="text-xs text-gray-600">
                      You can set custom travel fees for each zone after onboarding.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedZoneIds.length > 0 && (
            <div className="mt-4 p-4 bg-[#FF0077]/5 rounded-lg border border-[#FF0077]/20">
              <p className="text-sm text-[#FF0077]">
                <span className="font-medium">{selectedZoneIds.length}</span> zone{selectedZoneIds.length !== 1 ? 's' : ''} selected. 
                You'll be able to set travel fees and pricing for each zone after completing onboarding.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Step10GlobalCategories({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Auto-select common categories for freelancers
  useEffect(() => {
    if (data.business_type === "mobile" && globalCategories.length > 0 && (!data.global_category_ids || data.global_category_ids.length === 0)) {
      // Suggest common categories for mobile services
      const commonCategories = globalCategories
        .filter(cat => {
          const slug = cat.slug?.toLowerCase() || cat.name?.toLowerCase() || "";
          return slug.includes("hair") || slug.includes("massage") || slug.includes("nails") || slug.includes("barber");
        })
        .slice(0, 2)
        .map(cat => cat.id);
      
      if (commonCategories.length > 0) {
        updateData({ global_category_ids: commonCategories });
        toast.info(`We've pre-selected ${commonCategories.length} common categories. You can change them!`, { duration: 3000 });
      }
    }
  }, [globalCategories, data.business_type]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: GlobalCategory[];
          error: null;
        }>("/api/public/categories/global?all=true");
        setGlobalCategories(response.data || []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load categories";
        setError(errorMessage);
        console.error("Error loading global categories:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadCategories();
  }, []);

  const toggleCategory = (categoryId: string) => {
    const categoryIds = data.global_category_ids || [];
    if (categoryIds.includes(categoryId)) {
      updateData({
        global_category_ids: categoryIds.filter((id) => id !== categoryId),
      });
    } else {
      updateData({ global_category_ids: [...categoryIds, categoryId] });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF0077] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading categories...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800 text-sm">{error}</p>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          className="mt-4"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 md:space-y-6">
      <Alert className="bg-blue-50 border-blue-200">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <strong>Smart Setup:</strong> These categories help customers find you. 
          {(!data.services || data.services.length === 0) && (
            <span> If you skip adding services, we'll automatically generate basic services based on your selected categories!</span>
          )}
        </AlertDescription>
      </Alert>
      {globalCategories.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 text-sm">
            No categories available. Please contact support.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {globalCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => toggleCategory(category.id)}
              className={`p-4 border rounded-lg text-left transition-colors ${
                data.global_category_ids?.includes(category.id)
                  ? "border-[#FF0077] bg-[#FF0077]/5 text-[#FF0077]"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                {category.icon && (
                  <span className="text-2xl">{category.icon}</span>
                )}
                <span className="font-medium">{category.name}</span>
              </div>
              {category.description && (
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                  {category.description}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
      {data.global_category_ids && data.global_category_ids.length > 0 && (
        <div className="mt-4 p-4 bg-[#FF0077]/5 rounded-lg border border-[#FF0077]/20">
          <p className="text-sm text-[#FF0077]">
            <span className="font-medium">
              {data.global_category_ids.length}
            </span>{" "}
            categor{data.global_category_ids.length === 1 ? "y" : "ies"}{" "}
            selected
          </p>
        </div>
      )}
    </div>
  );
}

function Step11ServiceCatalog({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [services, setServices] = useState<Service[]>(data.services || []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formService, setFormService] = useState<Partial<Service>>({
    title: "",
    description: "",
    duration_minutes: 60,
    price: 0,
    currency: "ZAR",
    supports_at_home: false,
    supports_at_salon: true,
    addons: [],
  });

  useEffect(() => {
    updateData({ services });
  }, [services]);

  const handleAddService = () => {
    if (!formService.title || !formService.duration_minutes || formService.price === undefined) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (editingIndex !== null) {
      const updated = [...services];
      updated[editingIndex] = formService as Service;
      setServices(updated);
      setEditingIndex(null);
    } else {
      setServices([...services, formService as Service]);
    }

    setFormService({
      title: "",
      description: "",
      duration_minutes: 60,
      price: 0,
      currency: "ZAR",
      supports_at_home: false,
      supports_at_salon: true,
      addons: [],
    });
    setShowAddForm(false);
    toast.success(editingIndex !== null ? "Service updated" : "Service added");
  };

  const handleEditService = (index: number) => {
    setFormService(services[index]);
    setEditingIndex(index);
    setShowAddForm(true);
  };

  const handleDeleteService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
    toast.success("Service removed");
  };

  return (
    <div className="space-y-4 sm:space-y-5 md:space-y-6">
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          Add your actual services with prices and durations. Customers will see these when booking. You can add more later.
        </AlertDescription>
      </Alert>

      {services.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          {services.map((service, index) => (
            <div
              key={index}
              className="p-4 border rounded-lg space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium">{service.title}</h4>
                  {service.description && (
                    <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-sm text-gray-600">
                    <span>{service.duration_minutes} mins</span>
                    <span>{service.currency} {service.price}</span>
                    <span>
                      {service.supports_at_salon && "At Salon"}
                      {service.supports_at_salon && service.supports_at_home && " • "}
                      {service.supports_at_home && "At Home"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditService(index)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteService(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {/* Addons Section */}
              {service.addons && service.addons.length > 0 && (
                <div className="pl-4 border-l-2 border-[#FF0077]/20 space-y-2">
                  <p className="text-xs font-medium text-gray-500">Add-ons:</p>
                  {service.addons.map((addon, addonIndex) => (
                    <div key={addonIndex} className="text-sm text-gray-600 flex items-center justify-between">
                      <span>{addon.name} {addon.duration_minutes ? `(+${addon.duration_minutes} mins)` : ""}</span>
                      <span className="font-medium">{addon.currency} {addon.price}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <div className="p-4 border rounded-lg bg-gray-50">
          <h4 className="font-medium mb-4">
            {editingIndex !== null ? "Edit Service" : "Add Service"}
          </h4>
          <div className="space-y-4">
            <div>
              <Label htmlFor="service_title">Service Name *</Label>
              <Input
                id="service_title"
                value={formService.title || ""}
                onChange={(e) => setFormService({ ...formService, title: e.target.value })}
                placeholder="e.g., Haircut, Manicure, Massage"
                required
              />
            </div>
            <div>
              <Label htmlFor="service_description">
                Description
                <span className="text-gray-500 font-normal text-xs ml-2">
                  (Recommended: 20-300 characters)
                </span>
              </Label>
              <Textarea
                id="service_description"
                value={formService.description || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 500) {
                    setFormService({ ...formService, description: value });
                  }
                }}
                placeholder="Describe what's included in this service, what customers can expect, and any special features..."
                rows={3}
                maxLength={500}
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500">
                  {formService.description && formService.description.length < 20 ? (
                    <span className="text-amber-600">
                      Consider adding more details ({formService.description.length}/20 minimum recommended)
                    </span>
                  ) : (
                    <span>
                      {formService.description?.length || 0}/500 characters
                      {formService.description && formService.description.length >= 20 && (
                        <span className="text-green-600 ml-2">✓ Good length</span>
                      )}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const templates = [
                      "Professional [service name] using premium products. Includes consultation, [key step 1], [key step 2], and styling. Perfect for [target audience].",
                      "Comprehensive [service name] tailored to your needs. Our expert team will [main action] using [technique/product]. Results last [duration].",
                      "Full [service name] experience. We begin with [step 1], followed by [step 2], and finish with [step 3]. Includes complimentary [extra].",
                    ];
                    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
                    setFormService({ ...formService, description: randomTemplate });
                  }}
                  className="text-xs text-[#FF0077] hover:underline"
                >
                  Use template
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="service_duration">Duration (minutes) *</Label>
                <Input
                  id="service_duration"
                  type="number"
                  min="1"
                  value={formService.duration_minutes || 60}
                  onChange={(e) =>
                    setFormService({
                      ...formService,
                      duration_minutes: parseInt(e.target.value) || 60,
                    })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="service_price">Price *</Label>
                <Input
                  id="service_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formService.price || 0}
                  onChange={(e) =>
                    setFormService({
                      ...formService,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="service_currency">Currency</Label>
                <select
                  id="service_currency"
                  value={formService.currency || "ZAR"}
                  onChange={(e) =>
                    setFormService({ ...formService, currency: e.target.value })
                  }
                  className="w-full p-2 border rounded-md"
                >
                  <option value="ZAR">ZAR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formService.supports_at_salon !== false}
                  onChange={(e) =>
                    setFormService({ ...formService, supports_at_salon: e.target.checked })
                  }
                />
                <span className="text-sm">Available at salon</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formService.supports_at_home || false}
                  onChange={(e) =>
                    setFormService({ ...formService, supports_at_home: e.target.checked })
                  }
                />
                <span className="text-sm">Available at home</span>
              </label>
            </div>
            
            {/* Addons Section */}
            <ServiceAddonsManager
              addons={formService.addons || []}
              currency={formService.currency || "ZAR"}
              onAddonsChange={(addons) => setFormService({ ...formService, addons })}
            />

            <div className="flex gap-2">
              <Button
                onClick={handleAddService}
                className="bg-[#FF0077] hover:bg-[#D60565] text-white"
              >
                {editingIndex !== null ? "Update" : "Add"} Service
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingIndex(null);
                  setFormService({
                    title: "",
                    description: "",
                    duration_minutes: 60,
                    price: 0,
                    currency: "ZAR",
                    supports_at_home: false,
                    supports_at_salon: true,
                    addons: [],
                  });
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setShowAddForm(true)}
          variant="outline"
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Service
        </Button>
      )}

      {services.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No services added yet. You can add services later if you prefer.</p>
        </div>
      )}
    </div>
  );
}

function ServiceAddonsManager({
  addons,
  currency,
  onAddonsChange,
}: {
  addons: ServiceAddon[];
  currency: string;
  onAddonsChange: (addons: ServiceAddon[]) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formAddon, setFormAddon] = useState<Partial<ServiceAddon>>({
    name: "",
    description: "",
    price: 0,
    currency: currency,
    duration_minutes: 0,
  });

  const handleAddAddon = () => {
    if (!formAddon.name || formAddon.price === undefined) {
      toast.error("Addon name and price are required");
      return;
    }

    if (editingIndex !== null) {
      const updated = [...addons];
      updated[editingIndex] = formAddon as ServiceAddon;
      onAddonsChange(updated);
      setEditingIndex(null);
    } else {
      onAddonsChange([...addons, formAddon as ServiceAddon]);
    }

    setFormAddon({
      name: "",
      description: "",
      price: 0,
      currency: currency,
      duration_minutes: 0,
    });
    setShowAddForm(false);
    toast.success(editingIndex !== null ? "Addon updated" : "Addon added");
  };

  const handleEditAddon = (index: number) => {
    setFormAddon(addons[index]);
    setEditingIndex(index);
    setShowAddForm(true);
  };

  const handleDeleteAddon = (index: number) => {
    onAddonsChange(addons.filter((_, i) => i !== index));
    toast.success("Addon removed");
  };

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Add-ons (Optional)</Label>
          <p className="text-xs text-gray-500 mt-1">
            Add optional extras customers can purchase with this service (e.g., "Hair Treatment", "Nail Art")
          </p>
        </div>
        {!showAddForm && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Add-on
          </Button>
        )}
      </div>

      {addons.length > 0 && (
        <div className="space-y-2">
          {addons.map((addon, index) => (
            <div
              key={index}
              className="p-3 bg-gray-50 rounded-lg flex items-center justify-between"
            >
              <div className="flex-1">
                <span className="text-sm font-medium">{addon.name}</span>
                {addon.description && (
                  <p className="text-xs text-gray-600 mt-1">{addon.description}</p>
                )}
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  {addon.duration_minutes && addon.duration_minutes > 0 && (
                    <span>+{addon.duration_minutes} mins</span>
                  )}
                  <span>{addon.currency} {addon.price}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditAddon(index)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteAddon(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
          <h5 className="font-medium text-sm">
            {editingIndex !== null ? "Edit Add-on" : "Add Add-on"}
          </h5>
          <div className="space-y-3">
            <div>
              <Label htmlFor="addon_name" className="text-xs">Name *</Label>
              <Input
                id="addon_name"
                value={formAddon.name || ""}
                onChange={(e) => setFormAddon({ ...formAddon, name: e.target.value })}
                placeholder="e.g., Hair Treatment, Nail Art"
                className="text-sm"
                required
              />
            </div>
            <div>
              <Label htmlFor="addon_description" className="text-xs">Description</Label>
              <Textarea
                id="addon_description"
                value={formAddon.description || ""}
                onChange={(e) => setFormAddon({ ...formAddon, description: e.target.value })}
                placeholder="Brief description of the add-on"
                rows={2}
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="addon_price" className="text-xs">Price *</Label>
                <Input
                  id="addon_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formAddon.price || 0}
                  onChange={(e) =>
                    setFormAddon({
                      ...formAddon,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-sm"
                  required
                />
              </div>
              <div>
                <Label htmlFor="addon_currency" className="text-xs">Currency</Label>
                <select
                  id="addon_currency"
                  value={formAddon.currency || currency}
                  onChange={(e) =>
                    setFormAddon({ ...formAddon, currency: e.target.value })
                  }
                  className="w-full p-2 border rounded-md text-sm"
                >
                  <option value="ZAR">ZAR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <Label htmlFor="addon_duration" className="text-xs">Extra Time (mins)</Label>
                <Input
                  id="addon_duration"
                  type="number"
                  min="0"
                  value={formAddon.duration_minutes || 0}
                  onChange={(e) =>
                    setFormAddon({
                      ...formAddon,
                      duration_minutes: parseInt(e.target.value) || 0,
                    })
                  }
                  className="text-sm"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleAddAddon}
                size="sm"
                className="bg-[#FF0077] hover:bg-[#D60565] text-white"
              >
                {editingIndex !== null ? "Update" : "Add"} Add-on
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingIndex(null);
                  setFormAddon({
                    name: "",
                    description: "",
                    price: 0,
                    currency: currency,
                    duration_minutes: 0,
                  });
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Step12Hours({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const days = [
    { key: "monday", label: "Monday" },
    { key: "tuesday", label: "Tuesday" },
    { key: "wednesday", label: "Wednesday" },
    { key: "thursday", label: "Thursday" },
    { key: "friday", label: "Friday" },
    { key: "saturday", label: "Saturday" },
    { key: "sunday", label: "Sunday" },
  ];

  const updateHours = (
    day: string,
    field: "open" | "close" | "closed",
    value: string | boolean
  ) => {
    const hours = data.operating_hours || {};
    updateData({
      operating_hours: {
        ...hours,
        [day]: { ...hours[day as keyof typeof hours], [field]: value },
      },
    });
  };

  const isFreelancer = data.business_type === "mobile";
  
  // Smart defaults for freelancers (more flexible hours)
  useEffect(() => {
    if (isFreelancer && !data.operating_hours) {
      updateData({
        operating_hours: {
          monday: { open: "08:00", close: "20:00", closed: false },
          tuesday: { open: "08:00", close: "20:00", closed: false },
          wednesday: { open: "08:00", close: "20:00", closed: false },
          thursday: { open: "08:00", close: "20:00", closed: false },
          friday: { open: "08:00", close: "20:00", closed: false },
          saturday: { open: "09:00", close: "18:00", closed: false },
          sunday: { open: "10:00", close: "16:00", closed: false },
        },
      });
    }
  }, [isFreelancer]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <Alert className={isFreelancer ? "bg-green-50 border-green-200" : ""}>
        <AlertCircle className={`w-4 h-4 ${isFreelancer ? "text-green-600" : ""}`} />
        <AlertDescription className={isFreelancer ? "text-green-800" : ""}>
          {isFreelancer ? (
            <span>
              <strong>Freelancer Hours:</strong> We've set flexible hours (8 AM - 8 PM weekdays) perfect for mobile services. 
              Adjust as needed - you can change these anytime!
            </span>
          ) : (
            <span>
              Set your operating hours. Customers will only be able to book during these times. 
              You can adjust hours later in Settings.
            </span>
          )}
        </AlertDescription>
      </Alert>
      {days.map((day) => {
        const dayHours = data.operating_hours?.[day.key as keyof typeof data.operating_hours];
        return (
          <div key={day.key} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg">
            <div className="w-full sm:w-24 font-medium text-sm sm:text-base">{day.label}</div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!dayHours?.closed}
                onChange={(e) => updateHours(day.key, "closed", !e.target.checked)}
              />
              <span className="text-sm">Open</span>
            </label>
            {!dayHours?.closed && (
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <Input
                  type="time"
                  value={dayHours?.open || "09:00"}
                  onChange={(e) => updateHours(day.key, "open", e.target.value)}
                  className="w-full sm:w-32 text-sm sm:text-base"
                />
                <span className="text-sm sm:text-base">to</span>
                <Input
                  type="time"
                  value={dayHours?.close || "18:00"}
                  onChange={(e) => updateHours(day.key, "close", e.target.value)}
                  className="w-full sm:w-32 text-sm sm:text-base"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step13Review({ data }: { data: Partial<OnboardingData> }) {
  return (
    <div className="space-y-4 sm:space-y-5 md:space-y-6">
      <div>
        <h3 className="font-semibold mb-2 text-base sm:text-lg">Business Information</h3>
        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg space-y-2 text-sm">
          <p>
            <span className="font-medium">Name:</span> {data.business_name}
          </p>
          <p>
            <span className="font-medium">Type:</span> {data.business_type}
          </p>
          <p>
            <span className="font-medium">Phone:</span> {data.phone}
          </p>
          <p>
            <span className="font-medium">Email:</span> {data.email}
          </p>
          {data.previous_software && (
            <p>
              <span className="font-medium">Previous Software:</span>{" "}
              {data.previous_software === "other" 
                ? data.previous_software_other || "Other"
                : data.previous_software === "none"
                ? "None / First time using salon software"
                : data.previous_software.charAt(0).toUpperCase() + data.previous_software.slice(1).replace(/_/g, " ")
              }
            </p>
          )}
        </div>
      </div>
      {data.description && (
        <div>
          <h3 className="font-semibold mb-2 text-base sm:text-lg">Business Description</h3>
          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {data.description}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {data.description.length} characters
              {data.description.length >= 50 && (
                <span className="text-green-600 ml-2">✓ Good length</span>
              )}
            </p>
          </div>
        </div>
      )}
      <div>
        <h3 className="font-semibold mb-2 text-base sm:text-lg">Location</h3>
        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg text-sm">
          {data.address?.line1}, {data.address?.city}, {data.address?.state}{" "}
          {data.address?.postal_code}
          {data.address?.latitude && data.address?.longitude && (
            <p className="text-xs text-gray-500 mt-1">
              Coordinates: {data.address.latitude.toFixed(6)}, {data.address.longitude.toFixed(6)}
            </p>
          )}
        </div>
      </div>
      {(data.business_type === "mobile" || data.business_type === "both") && data.selected_zone_ids && data.selected_zone_ids.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2 text-base sm:text-lg">Service Zones</h3>
          <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <span className="font-medium">{data.selected_zone_ids.length}</span> zone{data.selected_zone_ids.length !== 1 ? "s" : ""} selected for at-home services
            </p>
            <p className="text-xs text-blue-600 mt-1">
              ✓ Travel fees will be set to platform defaults. You can customize pricing after onboarding.
            </p>
          </div>
        </div>
      )}
      <div>
        <h3 className="font-semibold mb-2 text-base sm:text-lg">Service Categories</h3>
        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
          {data.global_category_ids && data.global_category_ids.length > 0 ? (
            <p className="text-sm text-gray-600">
              {data.global_category_ids.length} categor
              {data.global_category_ids.length === 1 ? "y" : "ies"} selected
            </p>
          ) : (
            <p className="text-sm text-gray-500">No categories selected</p>
          )}
        </div>
      </div>
      {data.services && data.services.length > 0 ? (
        <div>
          <h3 className="font-semibold mb-2 text-base sm:text-lg">Services ({data.services.length})</h3>
          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg space-y-3 sm:space-y-4">
            {data.services.map((service, index) => (
              <div key={index} className="border-b border-gray-200 last:border-0 pb-3 last:pb-0">
                <div className="text-sm">
                  <div className="mb-1">
                    <span className="font-medium">{service.title}</span> - {service.duration_minutes} mins - {service.currency} {service.price}
                  </div>
                  {service.description && (
                    <div className="mt-2 pl-2 border-l-2 border-[#FF0077]/20">
                      <p className="text-xs text-gray-600 italic">"{service.description}"</p>
                    </div>
                  )}
                  {service.addons && service.addons.length > 0 && (
                    <div className="mt-2 pl-4 border-l-2 border-gray-300 space-y-1">
                      {service.addons.map((addon, addonIndex) => (
                        <div key={addonIndex} className="text-xs text-gray-600">
                          + {addon.name} - {addon.currency} {addon.price}
                          {addon.duration_minutes && addon.duration_minutes > 0 && ` (+${addon.duration_minutes} mins)`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <h3 className="font-semibold mb-2 text-base sm:text-lg">Services</h3>
          <div className="bg-yellow-50 p-3 sm:p-4 rounded-lg border border-yellow-200">
            <p className="text-sm text-yellow-800">
              <span className="font-medium">Auto-generation enabled:</span> We'll create basic services based on your selected categories. You can add more services after onboarding.
            </p>
          </div>
        </div>
      )}
      <div>
        <h3 className="font-semibold mb-2 text-base sm:text-lg">Operating Hours</h3>
        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
          {data.operating_hours && Object.keys(data.operating_hours).length > 0 ? (
            <div className="space-y-1 text-sm">
              {Object.entries(data.operating_hours).map(([day, hours]: [string, any]) => (
                <div key={day} className="flex justify-between">
                  <span className="capitalize font-medium">{day}:</span>
                  <span className="text-gray-600">
                    {hours.closed ? "Closed" : `${hours.open} - ${hours.close}`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Default hours will be set</p>
          )}
        </div>
      </div>
      <Alert className="bg-green-50 border-green-200">
        <Check className="w-4 h-4 text-green-600" />
        <AlertDescription className="text-green-800">
          <strong>Almost done!</strong> After submission, we'll automatically configure:
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            {data.business_type === "mobile" && (
              <li>Mark you as mobile-ready staff</li>
            )}
            {data.selected_zone_ids && data.selected_zone_ids.length > 0 && (
              <li>Set up {data.selected_zone_ids.length} service zone{data.selected_zone_ids.length !== 1 ? "s" : ""} with default pricing</li>
            )}
            {(!data.services || data.services.length === 0) && data.global_category_ids && data.global_category_ids.length > 0 && (
              <li>Generate basic services based on your categories</li>
            )}
            <li>Create your provider profile and location</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}

// Step 14: Plan Selection
function Step14PlanSelection({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [pricingPlans, setPricingPlans] = useState<Array<{
    id: string;
    name: string;
    price: string;
    period: string | null;
    description: string | null;
    cta_text: string;
    is_popular: boolean;
    features: string[];
  }>>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);

  useEffect(() => {
    async function loadPlans() {
      try {
        setIsLoadingPlans(true);
        const plans = await getPricingPlans();
        setPricingPlans(plans);
        
        // If plan was pre-selected from query params, ensure it's in the list
        if (data.selected_plan_id && !plans.find(p => p.id === data.selected_plan_id)) {
          // Plan might not be active anymore, clear selection
          updateData({ selected_plan_id: undefined });
        }
      } catch (error) {
        console.error("Error loading pricing plans:", error);
        toast.error("Failed to load pricing plans. Please try again.");
      } finally {
        setIsLoadingPlans(false);
      }
    }
    loadPlans();
  }, []);

  if (isLoadingPlans) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[#FF0077]" />
        <span className="ml-3 text-gray-600">Loading plans...</span>
      </div>
    );
  }

  if (pricingPlans.length === 0) {
    return (
      <div className="text-center py-12">
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            No pricing plans available at the moment. Please contact support.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          Choose Your Plan
        </h3>
        <p className="text-base text-gray-600">
          Select a subscription plan to get started. All plans include a 14-day free trial.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pricingPlans.map((plan) => {
          const isSelected = data.selected_plan_id === plan.id;
          return (
            <div
              key={plan.id}
              onClick={() => updateData({ selected_plan_id: plan.id })}
              className={`relative rounded-2xl border-2 p-6 cursor-pointer transition-all ${
                isSelected
                  ? "border-[#FF0077] shadow-xl bg-[#FF0077]/5"
                  : plan.is_popular
                  ? "border-gray-300 shadow-lg hover:border-[#FF0077]/50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              {plan.is_popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-[#FF0077] text-white px-3 py-1 rounded-full text-xs font-semibold">
                    Most Popular
                  </span>
                </div>
              )}
              
              <div className="text-center mb-6">
                <h4 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h4>
                <div className="flex items-baseline justify-center gap-1 mb-2">
                  <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
                  {plan.period && (
                    <span className="text-gray-600 text-sm">{plan.period}</span>
                  )}
                </div>
                {plan.description && (
                  <p className="text-sm text-gray-600">{plan.description}</p>
                )}
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-[#FF0077] flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className={`w-full h-10 rounded-full flex items-center justify-center ${
                isSelected
                  ? "bg-[#FF0077] text-white"
                  : "bg-gray-100 text-gray-600"
              }`}>
                {isSelected ? (
                  <div className="flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    <span className="font-semibold">Selected</span>
                  </div>
                ) : (
                  <span className="font-semibold">Select Plan</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.selected_plan_id && (
        <Alert className="bg-green-50 border-green-200 mt-6">
          <Check className="w-4 h-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>Plan selected!</strong> After you submit, you'll be assigned to this plan and can start your 14-day free trial.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
