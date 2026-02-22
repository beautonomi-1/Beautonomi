"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Check, AlertCircle } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import RoleGuard from "@/components/auth/RoleGuard";
import { useRouter } from "next/navigation";

export default function BusinessDescriptionPage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [originalDescription, setOriginalDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadDescription();
  }, []);

  const loadDescription = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: { description: string | null } }>(
        "/api/me/provider"
      );
      const desc = response.data?.description || "";
      setDescription(desc);
      setOriginalDescription(desc);
    } catch (error) {
      console.error("Error loading description:", error);
      toast.error("Failed to load business description");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // Validation
      if (description.length > 2000) {
        toast.error("Description must be 2000 characters or less");
        return;
      }

      const response = await fetcher.patch<{ data?: unknown }>("/api/provider/profile", {
        description: description || null,
      });

      if (response?.data) {
        setOriginalDescription(description);
        toast.success("Business description updated successfully");
        router.push("/provider/settings");
      }
    } catch (error) {
      const errorMessage =
        error instanceof FetchError
          ? error.message
          : "Failed to update description. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseTemplate = () => {
    const templates = [
      "Welcome to our salon! We specialize in premium beauty services with years of experience. Our team is dedicated to providing exceptional service in a relaxing, professional environment. We use only premium products and stay up-to-date with the latest techniques and trends.",
      "At our salon, we believe beauty is an art form. Our skilled professionals are passionate about helping you look and feel your best. From haircuts to facials, we offer a full range of services tailored to your unique needs.",
      "We are your trusted partner for all your beauty and wellness needs. Our commitment to excellence and customer satisfaction sets us apart. Experience the difference with our personalized approach and attention to detail.",
    ];
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    setDescription(randomTemplate);
  };

  const hasChanges = description !== originalDescription;
  const isGoodLength = description.length >= 50 && description.length <= 2000;
  const showWarning = description.length > 0 && description.length < 50;

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["provider_owner", "provider_staff"]} redirectTo="/provider/dashboard">
        <div className="w-full max-w-full overflow-x-hidden">
          <PageHeader 
          title="Business Description" 
          subtitle="Edit your business description"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Settings", href: "/provider/settings" },
            { label: "Business Description" }
          ]}
        />
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF0077] mx-auto mb-4"></div>
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]} redirectTo="/provider/dashboard">
      <div className="w-full max-w-full overflow-x-hidden">
        <PageHeader
          title="Business Description"
          subtitle="Edit the description that customers see on your profile"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Settings", href: "/provider/settings" },
            { label: "Business Description" }
          ]}
        />

        <div className="max-w-3xl mt-6 w-full max-w-full overflow-x-hidden">
          <Alert className="mb-6 w-full max-w-full">
            <Info className="w-4 h-4 flex-shrink-0" />
            <AlertDescription className="break-words">
              Your business description appears in the "About" tab on your public profile. 
              A good description helps customers understand what makes your business unique.
            </AlertDescription>
          </Alert>

          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 space-y-4 w-full max-w-full overflow-x-hidden">
            <div className="w-full">
              <Label htmlFor="description" className="block w-full">
                <span className="block sm:inline">Description</span>
                <span className="text-gray-500 font-normal text-xs ml-0 sm:ml-2 block sm:inline">
                  (Recommended: 50-500 characters)
                </span>
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 2000) {
                    setDescription(value);
                  }
                }}
                placeholder="Tell customers about your business, your expertise, what makes you unique, and what they can expect..."
                className="min-h-[200px] mt-2 w-full max-w-full"
                maxLength={2000}
              />
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-2 gap-2 w-full">
                <p className="text-xs text-gray-500 min-w-0 flex-1 w-full sm:w-auto">
                  {showWarning ? (
                    <span className="text-amber-600 flex items-start gap-1 flex-wrap">
                      <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span className="break-words flex-1 min-w-0">Consider adding more details ({description.length}/50 minimum recommended)</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="whitespace-nowrap">{description.length}/2000 characters</span>
                      {isGoodLength && (
                        <span className="text-green-600 flex items-center gap-1 whitespace-nowrap">
                          <Check className="w-3 h-3 flex-shrink-0" />
                          <span>Good length</span>
                        </span>
                      )}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={handleUseTemplate}
                  className="text-xs text-[#FF0077] hover:underline whitespace-nowrap flex-shrink-0 self-start sm:self-auto"
                >
                  Use template
                </button>
              </div>
            </div>

            {/* Preview */}
            {description && (
              <div className="mt-6 pt-6 border-t w-full">
                <Label className="text-sm font-medium mb-2 block">Preview</Label>
                <div className="bg-gray-50 p-4 rounded-lg border w-full overflow-x-hidden">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed break-words">
                    {description}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  This is how customers will see your description on your profile
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t w-full">
              <Button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className="bg-[#FF0077] hover:bg-[#D60565] text-white w-full sm:w-auto"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDescription(originalDescription);
                  toast.info("Changes discarded");
                }}
                disabled={!hasChanges || isSaving}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
