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
import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
  const [isUploading, setIsUploading] = React.useState(false);
  const [isEditingHandle, setIsEditingHandle] = React.useState(false);
  const [handleValue, setHandleValue] = React.useState(handle || "");

  const formatMemberSince = (date: Date) => {
    const now = new Date();
    const months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
    const years = Math.floor(months / 12);
    if (years > 0) {
      return t("web.accountSettings.profileHeader.yearsOn", { count: years });
    }
    return t("web.accountSettings.profileHeader.monthsOn", { count: months });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error(t("web.accountSettings.profileHeader.selectImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("web.accountSettings.profileHeader.imageTooLarge"));
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
        throw new Error(error.error?.message || t("web.accountSettings.profileHeader.uploadFailed"));
      }

      const { data } = await uploadResponse.json();

      await fetcher.patch("/api/me/profile", {
        avatar_url: data.url,
      });

      toast.success(t("web.accountSettings.profileHeader.photoUpdated"));
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || t("web.accountSettings.profileHeader.uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveHandle = async () => {
    if (!handleValue.trim()) {
      toast.error(t("web.accountSettings.profileHeader.handleEmpty"));
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,50}$/.test(handleValue)) {
      toast.error(t("web.accountSettings.profileHeader.handleInvalid"));
      return;
    }

    try {
      await fetcher.patch("/api/me/profile", {
        handle: handleValue.trim(),
      });

      toast.success(t("web.accountSettings.profileHeader.handleUpdated"));
      setIsEditingHandle(false);
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || t("web.accountSettings.profileHeader.handleUpdateFailed"));
    }
  };

  const displayName = preferredName || t("web.accountSettings.profileHeader.userFallback");
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <div className="flex items-start gap-6">
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
                aria-label={t("web.accountSettings.profileHeader.updatePhotoAria")}
              >
                <Camera className="h-4 w-4 text-gray-600" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-white">
              <SheetHeader>
                <SheetTitle>{t("web.accountSettings.profileHeader.updatePhotoTitle")}</SheetTitle>
                <SheetDescription>
                  {t("web.accountSettings.profileHeader.updatePhotoDescription")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="photo-upload" className="mb-2 block">
                    {t("web.accountSettings.profileHeader.selectPhoto")}
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
                  <p className="text-sm text-gray-500">{t("web.accountSettings.profileHeader.uploading")}</p>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>

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
                  {t("web.accountSettings.profileHeader.addHandle")}
                </Button>
              </SheetTrigger>
              <SheetContent className="bg-white">
                <SheetHeader>
                  <SheetTitle>{t("web.accountSettings.profileHeader.addHandleTitle")}</SheetTitle>
                  <SheetDescription>
                    {t("web.accountSettings.profileHeader.addHandleDescription")}
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <div>
                    <Label htmlFor="handle-input">{t("web.accountSettings.profileHeader.handle")}</Label>
                    <Input
                      id="handle-input"
                      value={handleValue}
                      onChange={(e) => setHandleValue(e.target.value)}
                      placeholder={t("web.accountSettings.profileHeader.handlePlaceholder")}
                      maxLength={50}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.accountSettings.profileHeader.handleHint")}
                    </p>
                  </div>
                  <Button onClick={handleSaveHandle} className="w-full">
                    {t("web.accountSettings.profileHeader.save")}
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
