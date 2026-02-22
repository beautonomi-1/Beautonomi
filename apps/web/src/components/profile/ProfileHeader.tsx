"use client";

import React from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";

interface ProfileHeaderProps {
  preferredName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  memberSince: Date;
  role: string;
  onUpdate?: () => void;
}

export default function ProfileHeader({
  preferredName,
  handle,
  avatarUrl,
  memberSince,
  role,
  onUpdate,
}: ProfileHeaderProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const [isEditingHandle, setIsEditingHandle] = React.useState(false);
  const [handleValue, setHandleValue] = React.useState(handle || "");

  const formatMemberSince = (date: Date) => {
    const now = new Date();
    const months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
    const years = Math.floor(months / 12);
    if (years > 0) {
      return `${years} ${years === 1 ? "year" : "years"} on Beautonomi`;
    }
    return `${months} ${months === 1 ? "month" : "months"} on Beautonomi`;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploading(true);
    try {
      // Create FormData
      const formData = new FormData();
      formData.append("file", file);

      // Upload to Supabase Storage
      const uploadResponse = await fetch("/api/me/avatar", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error?.message || "Failed to upload photo");
      }

      const { data } = await uploadResponse.json();
      
      // Update profile with new avatar URL
      await fetcher.patch("/api/me/profile", {
        avatar_url: data.url,
      });

      toast.success("Profile photo updated");
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to upload photo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveHandle = async () => {
    if (!handleValue.trim()) {
      toast.error("Handle cannot be empty");
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,50}$/.test(handleValue)) {
      toast.error("Handle must be 3-50 characters and contain only letters, numbers, and underscores");
      return;
    }

    try {
      await fetcher.patch("/api/me/profile", {
        handle: handleValue.trim(),
      });

      toast.success("Handle updated");
      setIsEditingHandle(false);
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to update handle");
    }
  };

  const displayName = preferredName || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="relative">
          <Avatar className="h-20 w-20 md:h-24 md:w-24">
            <AvatarImage src={avatarUrl || undefined} alt={displayName} />
            <AvatarFallback className="bg-gray-100 text-gray-600 text-xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-white border-2 border-gray-200 shadow-sm hover:bg-gray-50"
                disabled={isUploading}
                aria-label="Update profile photo"
              >
                <Camera className="h-4 w-4 text-gray-600" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-white">
              <SheetHeader>
                <SheetTitle>Update Profile Photo</SheetTitle>
                <SheetDescription>
                  Choose a photo from your device or take a new one.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="photo-upload" className="mb-2 block">
                    Select Photo
                  </Label>
                  <Input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={isUploading}
                  />
                </div>
                {isUploading && (
                  <p className="text-sm text-gray-500">Uploading...</p>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Name and Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 truncate">
              {displayName}
            </h1>
            {handle && (
              <span className="text-sm text-gray-500">@{handle}</span>
            )}
          </div>
          {!handle && (
            <Sheet open={isEditingHandle} onOpenChange={setIsEditingHandle}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs text-gray-500 h-auto p-0">
                  Add handle
                </Button>
              </SheetTrigger>
              <SheetContent className="bg-white">
                <SheetHeader>
                  <SheetTitle>Add Handle</SheetTitle>
                  <SheetDescription>
                    Choose a unique username. This will be visible to others.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <div>
                    <Label htmlFor="handle-input">Handle</Label>
                    <Input
                      id="handle-input"
                      value={handleValue}
                      onChange={(e) => setHandleValue(e.target.value)}
                      placeholder="username"
                      maxLength={50}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      3-50 characters, letters, numbers, and underscores only
                    </p>
                  </div>
                  <Button onClick={handleSaveHandle} className="w-full">
                    Save
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )}
          <p className="text-sm text-gray-500 capitalize">{role}</p>
          <p className="text-xs text-gray-400 mt-1">
            {formatMemberSince(memberSince)}
          </p>
        </div>
      </div>
    </div>
  );
}
