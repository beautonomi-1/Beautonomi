"use client";

import React, { useState, useEffect, useRef } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { uploadAvatar, validateFileType, validateFileSize, IMAGE_CONSTRAINTS } from "@/lib/supabase/storage-client";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface ProfileData {
  email: string;
  phone: string;
  avatar_url: string | null;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
  } | null;
  plan?: string;
}

export default function ProfilePage() {
  const [formData, setFormData] = useState<ProfileData>({
    email: "",
    phone: "",
    avatar_url: null,
    address: null,
    plan: "Professional",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      const [profileResponse, subscriptionResponse] = await Promise.all([
        fetcher.get<{ data: any }>("/api/me/profile").catch(() => null),
        fetcher.get<{ data: any }>("/api/provider/subscription").catch(() => null),
      ]);
      
      const data = profileResponse?.data || {};
      
      // Get plan name from subscription, fallback to "Free" if no subscription
      let planName = "Free";
      if (subscriptionResponse?.data) {
        const subscription = subscriptionResponse.data;
        if (subscription.plan?.name) {
          planName = subscription.plan.name;
        } else if (subscription.plan_name) {
          planName = subscription.plan_name;
        }
      }
      
      setFormData({
        email: data.email || "",
        phone: data.phone || "",
        avatar_url: data.avatar_url || null,
        address: data.address ? {
          line1: data.address.line1 || "",
          line2: data.address.line2 || "",
          city: data.address.city || "",
          state: data.address.state || "",
          postal_code: data.address.postal_code || "",
          country: data.address.country || "",
        } : {
          line1: "",
          city: "",
          state: "",
          postal_code: "",
          country: "",
        },
        plan: planName,
      });
    } catch (error) {
      console.error("Error loading profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!validateFileType(file, IMAGE_CONSTRAINTS.allowedTypes)) {
      toast.error("Invalid file type. Only JPEG, PNG, and WebP are allowed.");
      return;
    }
    
    // Check file size (2MB max for profile pictures)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (!validateFileSize(file, maxSize)) {
      toast.error("File too large. Maximum size is 2MB.");
      return;
    }

    // OPTIMISTIC UPDATE: Show preview immediately
    const _previewPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const previewUrl = e.target?.result as string;
        setAvatarPreview(previewUrl);
        // Update form data immediately for instant UI feedback
        setFormData({ ...formData, avatar_url: previewUrl });
        resolve(previewUrl);
      };
      reader.onerror = () => {
        resolve("");
      };
      reader.readAsDataURL(file);
    });

    try {
      setIsUploading(true);
      
      // Get user ID
      const userResponse = await fetcher.get<{ data: { id: string } }>("/api/me/profile");
      const userId = userResponse.data?.id;

      if (!userId) {
        throw new Error("User ID not found");
      }

      // Compress image if needed (skip for files < 2MB)
      let fileToUpload = file;
      if (file.size >= 2 * 1024 * 1024) {
        const { compressImage } = await import("@/lib/utils/image-compression");
        const compressionResult = await compressImage(file, {
          maxWidth: 800,
          maxHeight: 800,
          quality: 0.9,
          maxSizeMB: 0.5, // Profile pictures should be small
          outputFormat: 'image/jpeg',
        });
        
        if (compressionResult.compressionRatio > 0) {
          fileToUpload = new File([compressionResult.file], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          toast.success(`Compressed: ${compressionResult.compressionRatio.toFixed(1)}% reduction`);
        }
      }

      // Upload avatar with timeout
      const uploadPromise = uploadAvatar(userId, fileToUpload);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Upload timeout - please try again")), 30000)
      );
      
      const result = await Promise.race([uploadPromise, timeoutPromise]) as Awaited<ReturnType<typeof uploadAvatar>>;
      const newAvatarUrl = result.publicUrl;

      // Update form data with actual URL
      setFormData({ ...formData, avatar_url: newAvatarUrl });
      setAvatarPreview(null); // Clear preview, use actual URL

      // Update profile in database in background (don't wait)
      fetcher.patch("/api/me/profile", {
        avatar_url: newAvatarUrl,
      }).then(() => {
        // Dispatch custom event to notify other components (like topbar) to refresh
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('profile-updated', { 
            detail: { avatar_url: newAvatarUrl } 
          }));
        }
      }).catch((error) => {
        console.error("Failed to save avatar to database:", error);
        toast.error("Uploaded but failed to save. Please refresh the page.");
        // Reload profile to get correct state
        loadProfile();
      });

      toast.success("Profile picture updated successfully");

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error uploading avatar:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      const errorMessage =
        error instanceof Error ? error.message : "Failed to upload profile picture";
      toast.error(`Profile picture upload failed: ${errorMessage}. Please check console for details.`);
      // Revert optimistic update on error
      setAvatarPreview(null);
      // Reload to get original state
      loadProfile();
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      // Only send address if it has at least a line1
      const addressToSend = formData.address && formData.address.line1 
        ? formData.address 
        : undefined;
      
      await fetcher.patch("/api/me/profile", {
        email: formData.email,
        phone: formData.phone,
        ...(addressToSend && { address: addressToSend }),
      });

      toast.success("Profile updated successfully");
      await loadProfile(); // Reload to get latest data
    } catch (error) {
      console.error("Error saving profile:", error);
      const errorMessage =
        error instanceof FetchError
          ? error.message
          : "Failed to update profile. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Generate initials from email or name
  const getInitials = () => {
    if (formData.email) {
      const emailParts = formData.email.split("@")[0];
      const parts = emailParts.split(/[._-]/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return emailParts.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Profile"
        subtitle="Manage your personal information"
      >
        <LoadingTimeout loadingMessage="Loading profile..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Profile"
      subtitle="Manage your personal information"
      onSave={handleSave}
      saveDisabled={isSaving}
      isSaving={isSaving}
    >
      {/* Profile Picture */}
      <SectionCard title="Profile Picture">
        <div className="flex items-center gap-6">
          <Avatar className="w-24 h-24">
            <AvatarImage 
              src={avatarPreview || formData.avatar_url || ""} 
              alt="Profile" 
              onError={(_e) => {
                console.error("Failed to load avatar:", avatarPreview || formData.avatar_url);
                // Don't set a fallback src, let AvatarFallback handle it
              }}
            />
            <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-2xl">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 mr-2" />
                  Upload Photo
                </>
              )}
            </Button>
            <p className="text-xs text-gray-500 mt-2">JPG, PNG or GIF. Max size 2MB</p>
          </div>
        </div>
      </SectionCard>

      {/* Personal Info */}
      <SectionCard title="Personal Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
        </div>
      </SectionCard>

      {/* Address */}
      <SectionCard title="Address">
        <div className="space-y-4">
          <div>
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={formData.address?.line1 || ""}
              onChange={(e) => setFormData({ 
                ...formData, 
                address: { 
                  ...formData.address, 
                  line1: e.target.value,
                  city: formData.address?.city || "",
                  state: formData.address?.state || "",
                  postal_code: formData.address?.postal_code || "",
                  country: formData.address?.country || "",
                } as any
              })}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formData.address?.country || ""}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  address: { 
                    ...formData.address, 
                    country: e.target.value,
                    line1: formData.address?.line1 || "",
                    city: formData.address?.city || "",
                    state: formData.address?.state || "",
                    postal_code: formData.address?.postal_code || "",
                  } as any
                })}
              />
            </div>
            <div>
              <Label htmlFor="state">State/Province</Label>
              <Input
                id="state"
                value={formData.address?.state || ""}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  address: { 
                    ...formData.address, 
                    state: e.target.value,
                    line1: formData.address?.line1 || "",
                    city: formData.address?.city || "",
                    postal_code: formData.address?.postal_code || "",
                    country: formData.address?.country || "",
                  } as any
                })}
              />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.address?.city || ""}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  address: { 
                    ...formData.address, 
                    city: e.target.value,
                    line1: formData.address?.line1 || "",
                    state: formData.address?.state || "",
                    postal_code: formData.address?.postal_code || "",
                    country: formData.address?.country || "",
                  } as any
                })}
              />
            </div>
            <div>
              <Label htmlFor="zipcode">Zip/Postal Code</Label>
              <Input
                id="zipcode"
                value={formData.address?.postal_code || ""}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  address: { 
                    ...formData.address, 
                    postal_code: e.target.value,
                    line1: formData.address?.line1 || "",
                    city: formData.address?.city || "",
                    state: formData.address?.state || "",
                    country: formData.address?.country || "",
                  } as any
                })}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Plan */}
      <SectionCard title="Plan">
        <div>
          <Label htmlFor="plan">Current Plan</Label>
          <Input
            id="plan"
            value={formData.plan || "Free"}
            readOnly
            className="bg-gray-50"
          />
          <div className="flex items-center gap-2 mt-2">
            <p className="text-xs text-gray-500">Contact support to change your plan</p>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-[#FF0077]"
              onClick={() => window.open("/help/submit-ticket", "_blank")}
            >
              Contact Support
            </Button>
          </div>
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
