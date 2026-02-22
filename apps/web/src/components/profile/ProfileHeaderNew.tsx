"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Camera, Mail, Phone, Shield, Check, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import type { ProfileUser, QuickActionBadge } from "@/types/profile";

interface ProfileHeaderProps {
  user: ProfileUser;
  onUpdate?: () => void;
}

export default function ProfileHeaderNew({ user, onUpdate }: ProfileHeaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isEditingHandle, setIsEditingHandle] = useState(false);
  const [handleValue, setHandleValue] = useState(user.handle || "");
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);

  const displayName = user.preferred_name || user.full_name || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const formatMemberSince = (date: Date) => {
    const now = new Date();
    const months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
    const years = Math.floor(months / 12);
    if (years > 0) {
      return `${years} ${years === 1 ? "year" : "years"} on Beautonomi`;
    }
    return `${months} ${months === 1 ? "month" : "months"} on Beautonomi`;
  };

  const memberSince = new Date(user.created_at);

  useEffect(() => {
    // Load loyalty points
    fetcher.get<{ data: { points_balance: number } }>("/api/me/loyalty")
      .then(res => setLoyaltyPoints(res.data.points_balance))
      .catch(() => {
        // Silently fail - loyalty points are optional
        setLoyaltyPoints(null);
      });
  }, []);

  const quickActions: QuickActionBadge[] = [
    {
      type: "email",
      label: "Email",
      verified: user.email_verified,
    },
    {
      type: "photo",
      label: "Photo",
      verified: !!user.avatar_url,
    },
    {
      type: "phone",
      label: "Phone",
      verified: user.phone_verified,
    },
    {
      type: "id",
      label: "ID",
      verified: user.identity_verified,
      pending: user.identity_verification_status === "pending",
    },
  ];

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/me/avatar", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error?.message || "Failed to upload photo");
      }

      const { data } = await uploadResponse.json();
      
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
        {/* Avatar */}
        <div className="relative group">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="relative"
          >
            <Avatar className="h-20 w-20 md:h-28 md:w-28 ring-4 ring-white/50 shadow-lg">
              <AvatarImage src={user.avatar_url || undefined} alt={displayName} />
              <AvatarFallback className="bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-700 text-2xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <label
              htmlFor="photo-upload"
              className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-white border-2 border-zinc-200 shadow-lg flex items-center justify-center cursor-pointer hover:bg-zinc-50 transition-colors group-hover:scale-110"
            >
              <Camera className="h-5 w-5 text-zinc-600" />
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>
          </motion.div>
        </div>

        {/* Name and Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-2">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
              {displayName}
            </h1>
            {user.handle ? (
              <span className="text-sm text-zinc-500">@{user.handle}</span>
            ) : (
              <button
                onClick={() => setIsEditingHandle(true)}
                className="text-sm text-zinc-400 hover:text-[#FF0077] underline font-medium transition-colors text-left"
              >
                Add handle
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="text-sm font-medium text-zinc-600 capitalize">{user.role}</span>
            <span className="text-xs text-zinc-400">•</span>
            <span className="text-xs text-zinc-500">{formatMemberSince(memberSince)}</span>
            {loyaltyPoints !== null && (
              <>
                <span className="text-xs text-zinc-400">•</span>
                <Link 
                  href="/account-settings/loyalty"
                  className="text-xs text-[#FF0077] hover:text-[#E6006A] font-medium transition-colors flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  {loyaltyPoints.toLocaleString()} points
                </Link>
              </>
            )}
          </div>

          {/* Quick Action Chips */}
          <div className="flex flex-wrap gap-2 mt-4">
            {quickActions.map((action) => (
              <motion.button
                key={action.type}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`
                  px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  flex items-center gap-1.5
                  ${
                    action.verified
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : action.pending
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-zinc-100 text-zinc-600 border border-zinc-200 hover:bg-zinc-200"
                  }
                `}
                onClick={() => {
                  // Scroll to relevant section or trigger action
                  if (action.type === "email") {
                    document.getElementById("personal-info-section")?.scrollIntoView({ behavior: "smooth" });
                  } else if (action.type === "phone") {
                    document.getElementById("personal-info-section")?.scrollIntoView({ behavior: "smooth" });
                  } else if (action.type === "id") {
                    document.getElementById("personal-info-section")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                {action.type === "email" && <Mail className="h-3 w-3" />}
                {action.type === "photo" && <Camera className="h-3 w-3" />}
                {action.type === "phone" && <Phone className="h-3 w-3" />}
                {action.type === "id" && <Shield className="h-3 w-3" />}
                {action.verified && <Check className="h-3 w-3" />}
                {action.label}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Handle Edit Modal */}
      {isEditingHandle && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
          >
            <h3 className="text-lg font-semibold mb-2">Add Handle</h3>
            <p className="text-sm text-zinc-600 mb-4">
              Choose a unique username. This will be visible to others.
            </p>
            <input
              type="text"
              value={handleValue}
              onChange={(e) => setHandleValue(e.target.value)}
              placeholder="username"
              maxLength={50}
              className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF0077] mb-4"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveHandle();
                if (e.key === "Escape") setIsEditingHandle(false);
              }}
              autoFocus
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setIsEditingHandle(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveHandle}
                className="flex-1 bg-[#FF0077] hover:bg-[#E6006A] text-white"
              >
                Save
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
