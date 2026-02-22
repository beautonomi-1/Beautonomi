"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, MapPin, CheckCircle2, ArrowRight } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OnboardingData {
  step: number;
  preferredName?: string;
  bio?: string;
  profilePhoto?: string;
  phone?: {
    countryCode: string;
    number: string;
    verified?: boolean;
  };
  location?: {
    address_line1: string;
    address_line2?: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
    place_name?: string;
  };
  preferences?: {
    notifications: boolean;
    marketing: boolean;
  };
}

const STEPS = [
  {
    id: 1,
    title: "Welcome to Beautonomi!",
    description: "Let's get you set up in just a few steps",
    component: "welcome"
  },
  {
    id: 2,
    title: "Tell us about yourself",
    description: "Help others get to know you",
    component: "profile"
  },
  {
    id: 3,
    title: "Add your profile photo",
    description: "Help others recognize you",
    component: "photo"
  },
  {
    id: 4,
    title: "Add your phone number",
    description: "Required for bookings and house calls",
    component: "phone"
  },
  {
    id: 5,
    title: "Set your location",
    description: "Required for house calls. We'll show you services near you",
    component: "location"
  },
  {
    id: 6,
    title: "You're all set!",
    description: "Start exploring beauty services",
    component: "complete"
  }
];

export default function CustomerOnboardingPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<OnboardingData>({
    step: 1
  });
  const [isLoading, setIsLoading] = useState(false);
  const [preferredName, setPreferredName] = useState("");
  const [bio, setBio] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [phoneCountryCode, setPhoneCountryCode] = useState("+27");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Redirect if not authenticated and pre-fill data
  React.useEffect(() => {
    if (!user) {
      router.push("/signup?type=customer");
    } else {
      // Pre-fill preferred name if available
      const u = user as any;
      if (u.preferred_name || u.user_metadata?.preferred_name) {
        setPreferredName(u.preferred_name || u.user_metadata?.preferred_name);
      }
      
      // Pre-fill phone if user already has one
      if (user.phone) {
        const phoneMatch = user.phone.match(/^(\+\d{1,4})(.+)$/);
        if (phoneMatch) {
          setPhoneCountryCode(phoneMatch[1]);
          setPhoneNumber(phoneMatch[2]);
          setFormData(prev => ({
            ...prev,
            phone: {
              countryCode: phoneMatch[1],
              number: phoneMatch[2],
              verified: (user as any).phone_verified || false
            }
          }));
        }
      }
      
      // Note: Bio would need to be fetched from profile data separately if needed
    }
  }, [user, router]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Photo must be less than 5MB");
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Update preferred name and bio
      const updates: any = {};
      if (preferredName.trim()) {
        updates.preferred_name = preferredName.trim();
      }
      
      if (updates.preferred_name) {
        await fetcher.patch("/api/me/profile", updates);
      }
      
      // Update bio in profile data
      if (bio.trim()) {
        await fetcher.post("/api/me/profile-data", {
          about: bio.trim()
        });
      }
      
      setFormData(prev => ({
        ...prev,
        preferredName: preferredName.trim(),
        bio: bio.trim()
      }));
      
      await refreshUser();
      toast.success("Profile updated!");
      handleNext();
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast.error(error.message || "Failed to save profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePhoto = async () => {
    if (!photoFile || !user) {
      toast.error("Please upload a profile photo");
      return;
    }
    
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", photoFile);
      
      // Note: fetcher should handle FormData automatically, don't set Content-Type header
      const response = await fetcher.post<{ data: { url: string } }>("/api/me/avatar", formData);
      
      if (response.data?.url) {
        setFormData(prev => ({ ...prev, profilePhoto: response.data.url }));
        // Update user profile with avatar URL
        try {
          await fetcher.patch("/api/me/profile", {
            avatar_url: response.data.url
          });
        } catch (updateError) {
          console.warn("Failed to update user profile:", updateError);
          // Continue anyway - avatar is uploaded
        }
        await refreshUser();
        toast.success("Profile photo updated!");
        handleNext();
      }
    } catch (error: any) {
      console.error("Error uploading photo:", error);
      toast.error(error.message || "Failed to upload photo");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocationSelect = (address: {
    address_line1: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
    place_name?: string;
  }) => {
    // Store full structured address data
    setFormData(prev => ({
      ...prev,
      location: {
        address_line1: address.address_line1,
        address_line2: undefined, // Can be added later if needed
        city: address.city,
        state: address.state,
        postal_code: address.postal_code,
        country: address.country,
        latitude: address.latitude,
        longitude: address.longitude,
        place_name: address.place_name
      }
    }));
    
    // Save to localStorage for immediate use (for search/display)
    const addressString = address.place_name || `${address.address_line1}, ${address.city}, ${address.country}`;
    localStorage.setItem("userLocation", JSON.stringify({
      latitude: address.latitude,
      longitude: address.longitude,
      address: addressString
    }));
    
    window.dispatchEvent(new CustomEvent("userLocationChanged", {
      detail: {
        latitude: address.latitude,
        longitude: address.longitude,
        address: addressString
      }
    }));
  };

  const handleSavePhone = async () => {
    if (!phoneNumber.trim() || !user) {
      toast.error("Please enter your phone number");
      return;
    }
    
    setIsLoading(true);
    try {
      const fullPhone = `${phoneCountryCode}${phoneNumber.trim()}`;
      await fetcher.patch("/api/me/profile", {
        phone: fullPhone
      });
      
      setFormData(prev => ({
        ...prev,
        phone: {
          countryCode: phoneCountryCode,
          number: phoneNumber.trim(),
          verified: false // Phone verification can be done later if needed
        }
      }));
      
      await refreshUser();
      toast.success("Phone number saved!");
      handleNext();
    } catch (error: any) {
      console.error("Error saving phone:", error);
      toast.error(error.message || "Failed to save phone number");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!formData.location || !user) return;
    
    setIsLoading(true);
    try {
      // Use full structured address data from Mapbox
      // Generate a label from the address for easy identification
      const addressLabel = formData.location.place_name || 
                          `${formData.location.address_line1}, ${formData.location.city}`;
      
      await fetcher.post("/api/me/addresses", {
        label: addressLabel.substring(0, 100), // Limit to 100 chars for label
        address_line1: formData.location.address_line1,
        address_line2: formData.location.address_line2 || null,
        city: formData.location.city,
        state: formData.location.state || null,
        postal_code: formData.location.postal_code || null,
        country: formData.location.country,
        latitude: formData.location.latitude,
        longitude: formData.location.longitude,
        is_default: true
      });
      
      toast.success("Location saved!");
      handleNext();
    } catch (error: any) {
      console.error("Error saving location:", error);
      toast.error(error.message || "Failed to save location");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    router.push("/?onboarded=true");
  };

  const renderStepContent = () => {
    const step = STEPS[currentStep - 1];
    
    switch (step.component) {
      case "welcome":
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#FF0077] to-[#D60565] rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome, {user?.full_name || (user as any)?.first_name || "there"}!
              </h2>
              <p className="text-lg text-gray-600">
                Your account has been created successfully. Let's personalize your experience.
              </p>
            </div>
            <div className="pt-4">
              <Button
                onClick={handleNext}
                className="bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white px-8 py-6 text-lg font-semibold rounded-full"
              >
                Get Started
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      case "profile":
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium text-gray-700 mb-2 block">
                Preferred Name
              </Label>
              <p className="text-sm text-gray-500 mb-4">
                How would you like to be called? (Your full name is: {user?.full_name || (user as any)?.first_name || "Not set"})
              </p>
              <Input
                type="text"
                placeholder="Enter your preferred name"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                className="w-full"
                maxLength={50}
              />
            </div>
            <div>
              <Label className="text-base font-medium text-gray-700 mb-2 block">
                About You
              </Label>
              <p className="text-sm text-gray-500 mb-4">
                Tell others a bit about yourself (optional)
              </p>
              <Textarea
                placeholder="Write something about yourself..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full min-h-[120px] resize-none"
                maxLength={450}
              />
              <p className="text-xs text-gray-400 mt-2 text-right">
                {bio.length}/450 characters
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleSkip}
                variant="outline"
                className="flex-1"
                disabled={isLoading}
              >
                Skip for now
              </Button>
              <Button
                onClick={handleSaveProfile}
                className="flex-1 bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white"
                disabled={isLoading}
              >
                {isLoading ? "Saving..." : "Continue"}
              </Button>
            </div>
          </div>
        );

      case "phone":
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium text-gray-700 mb-2 block">
                Phone Number
              </Label>
              <p className="text-sm text-gray-500 mb-4">
                Required for bookings and house calls. We'll use this to send you booking confirmations and updates.
              </p>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="border-b border-gray-300 px-4 py-2 bg-gray-50">
                  <Label className="text-xs font-medium text-gray-700">Country code</Label>
                  <Select value={phoneCountryCode} onValueChange={setPhoneCountryCode}>
                    <SelectTrigger className="w-full border-none px-0 pt-1 text-base font-semibold bg-transparent h-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="+27">South Africa (+27)</SelectItem>
                      <SelectItem value="+254">Kenya (+254)</SelectItem>
                      <SelectItem value="+233">Ghana (+233)</SelectItem>
                      <SelectItem value="+234">Nigeria (+234)</SelectItem>
                      <SelectItem value="+20">Egypt (+20)</SelectItem>
                      <SelectItem value="+1">USA (+1)</SelectItem>
                      <SelectItem value="+44">UK (+44)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="px-4 py-3">
                  <Input
                    type="tel"
                    className="text-base border-0 px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder="Phone number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleSkip}
                variant="outline"
                className="flex-1"
                disabled={isLoading}
              >
                Skip for now
              </Button>
              <Button
                onClick={handleSavePhone}
                className="flex-1 bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white"
                disabled={!phoneNumber.trim() || isLoading}
              >
                {isLoading ? "Saving..." : "Continue"}
              </Button>
            </div>
          </div>
        );

      case "photo":
        return (
          <div className="space-y-6">
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="w-32 h-32 border-4 border-gray-200">
                <AvatarImage src={photoPreview || user?.avatar_url || ""} />
                <AvatarFallback className="text-3xl bg-gradient-to-br from-[#FF0077] to-[#D60565] text-white">
                  {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  <Camera className="w-5 h-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {photoPreview ? "Change photo" : "Upload photo"}
                  </span>
                </div>
              </label>
            </div>
            <div>
              <Button
                onClick={handleSavePhoto}
                className="w-full bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white"
                disabled={!photoFile || isLoading}
              >
                {isLoading ? "Uploading..." : "Continue"}
              </Button>
            </div>
          </div>
        );

      case "location":
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium text-gray-700 mb-2 block">
                Where are you located?
              </Label>
              <p className="text-sm text-gray-500 mb-4">
                We'll show you services and providers near you
              </p>
              <AddressAutocomplete
                onChange={handleLocationSelect}
                placeholder="Enter your address"
                label="Location"
              />
              {formData.location && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-green-800">
                    {formData.location.place_name || 
                     `${formData.location.address_line1}, ${formData.location.city}, ${formData.location.country}`}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleSkip}
                variant="outline"
                className="flex-1"
                disabled={isLoading}
              >
                Skip for now
              </Button>
              <Button
                onClick={handleSaveLocation}
                className="flex-1 bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white"
                disabled={!formData.location || isLoading}
              >
                {isLoading ? "Saving..." : "Continue"}
              </Button>
            </div>
          </div>
        );

      case "complete":
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                You're all set!
              </h2>
              <p className="text-lg text-gray-600">
                Start exploring beauty services and book your first appointment.
              </p>
            </div>
            <div className="pt-4">
              <Button
                onClick={handleComplete}
                className="bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white px-8 py-6 text-lg font-semibold rounded-full"
              >
                Start Exploring
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-white">
      <BeautonomiHeader />
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, index) => (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                      currentStep > step.id
                        ? "bg-green-500 text-white"
                        : currentStep === step.id
                        ? "bg-[#FF0077] text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      step.id
                    )}
                  </div>
                  {(step as { optional?: boolean }).optional && (
                    <span className="text-xs text-gray-500 mt-1">Optional</span>
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 transition-colors ${
                      currentStep > step.id ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-2xl shadow-lg p-8 md:p-12"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
              {STEPS[currentStep - 1].title}
            </h1>
            <p className="text-gray-600">
              {STEPS[currentStep - 1].description}
            </p>
          </div>

          <div className="min-h-[300px] flex items-center justify-center">
            {renderStepContent()}
          </div>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
}
