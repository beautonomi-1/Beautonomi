"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Upload, Image as ImageIcon, Trash2, Star, Loader2, Maximize2, Pencil, CircleUser } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import RoleGuard from "@/components/auth/RoleGuard";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";
import { uploadProviderGalleryImage, uploadFile, validateFileType, validateFileSize, IMAGE_CONSTRAINTS } from "@/lib/supabase/storage-client";
import { type CompressionResult } from "@/lib/utils/image-compression";

interface _GalleryImage {
  url: string;
  index: number;
}

export default function GalleryManagementPage() {
  const { t } = useTranslation();
  const [gallery, setGallery] = useState<string[]>([]);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState<{ [key: string]: CompressionResult }>({});
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    loadGallery();
    
    // Safety timeout: if loading takes more than 10 seconds, force it to stop
    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn("Gallery loading timeout - forcing loading to false");
        setIsLoading(false);
      }
    }, 10000);
    
    return () => clearTimeout(timeout);
  }, []);

  const loadGallery = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: { gallery: string[]; thumbnail_url: string | null; avatar_url?: string | null } }>(
        "/api/me/provider"
      );
      setGallery(response.data?.gallery || []);
      setThumbnailUrl(response.data?.thumbnail_url || null);
      setAvatarUrl(response.data?.avatar_url ?? null);
    } catch (error) {
      console.error("Error loading gallery:", error);
      // Don't show toast on initial load to avoid annoying users
      // Only show error if we already have some data (retry scenario)
      if (gallery.length > 0 || thumbnailUrl) {
        toast.error(t("web.provider.settings.pages.gallery.failedToLoadGallery"));
      }
    } finally {
      // Always set loading to false, even on error
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const validFiles: File[] = [];

    // Validate files
    for (const file of fileArray) {
      if (!validateFileType(file, IMAGE_CONSTRAINTS.allowedTypes)) {
        toast.error(t("web.provider.settings.pages.gallery.invalidFileTypeNamed", { name: file.name }));
        continue;
      }
      if (!validateFileSize(file, IMAGE_CONSTRAINTS.maxSizeBytes)) {
        toast.error(t("web.provider.settings.pages.gallery.fileTooLargeNamed", { name: file.name }));
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    await uploadImages(validFiles);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadImages = async (files: File[]) => {
    try {
      setIsUploading(true);
      setCompressionProgress({});

      // Get provider ID first (before compression to fail fast if needed)
      const providerResponse = await fetcher.get<{ data: { id: string } }>("/api/me/provider");
      const providerId = providerResponse.data?.id;

      if (!providerId) {
        throw new Error(t("web.provider.settings.pages.gallery.providerIdNotFound"));
      }

      // Compress images before upload (optimized for speed)
      // Skip compression for files smaller than 2MB to speed up upload
      const { compressImage } = await import("@/lib/utils/image-compression");
      
      const compressionResults = await Promise.all(
        files.map(async (file) => {
          // Skip compression for files smaller than 2MB to speed up upload significantly
          if (file.size < 2 * 1024 * 1024) { // Less than 2MB - skip compression
            return {
              file: file,
              originalSize: file.size,
              compressedSize: file.size,
              compressionRatio: 0,
            };
          }
          
          // Compress larger files with optimized settings for speed
          return await compressImage(file, {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 0.85, // Good balance between quality and speed
            maxSizeMB: 2, // Target 2MB to reduce compression iterations
            outputFormat: 'image/jpeg',
          });
        })
      );

      // Store compression results for display
      const compressionMap: { [key: string]: CompressionResult } = {};
      files.forEach((file, index) => {
        compressionMap[file.name] = compressionResults[index];
      });
      setCompressionProgress(compressionMap);

      // Show compression stats only if compression happened
      const compressedCount = compressionResults.filter(r => r.compressionRatio > 0).length;
      if (compressedCount > 0) {
        const _totalOriginal = compressionResults.reduce((sum, r) => sum + r.originalSize, 0);
        const _totalCompressed = compressionResults.reduce((sum, r) => sum + r.compressedSize, 0);
        const avgCompression = compressionResults.reduce((sum, r) => sum + r.compressionRatio, 0) / compressedCount;
        
        toast.success(
          t("web.provider.settings.pages.gallery.compressedImages", { count: compressedCount, percent: avgCompression.toFixed(1) })
        );
      }

      // Upload compressed images in parallel with timeout
      const uploadPromises = compressionResults.map((result, index) => {
        // Convert Blob to File if needed
        const fileToUpload = result.file instanceof File 
          ? result.file 
          : new File([result.file], files[index].name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
        const uploadPromise = uploadProviderGalleryImage(providerId, fileToUpload, gallery.length + index);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(t("web.provider.settings.pages.gallery.uploadTimeoutNamed", { name: files[index].name }))), 30000)
        );
        return Promise.race([uploadPromise, timeoutPromise]) as Promise<{ publicUrl: string }>;
      });

      const uploadResults = await Promise.all(uploadPromises);
      const newImageUrls = uploadResults.map((result) => result.publicUrl);

      console.log("Uploaded image URLs:", newImageUrls);

      // OPTIMISTIC UPDATE: Update UI immediately with new images
      const updatedGallery = [...gallery, ...newImageUrls];
      setGallery(updatedGallery);
      console.log("Updated gallery array (optimistic):", updatedGallery);

      // Save to database in background (don't wait for it)
      saveGallery(updatedGallery, thumbnailUrl).catch((error) => {
        console.error("Failed to save gallery to database:", error);
        // Reload from server to get correct state
        loadGallery();
        toast.error(t("web.provider.settings.pages.gallery.uploadedImagesButFailedToSave"));
      });
      
      // Clear compression progress
      setCompressionProgress({});
      
      toast.success(t("web.provider.settings.pages.gallery.successfullyUploadedImages", { count: files.length }));
    } catch (error) {
      console.error("Upload error:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      const errorMessage =
        error instanceof Error ? error.message : t("web.provider.settings.pages.gallery.failedToUploadImages");
      toast.error(t("web.provider.settings.pages.gallery.uploadFailedDetails", { message: errorMessage }));
      setCompressionProgress({});
      // Revert optimistic update on error
      setGallery(gallery); // Revert to original gallery
    } finally {
      setIsUploading(false);
      setCompressionProgress({});
    }
  };

  const handleThumbnailSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!validateFileType(file, IMAGE_CONSTRAINTS.allowedTypes)) {
      toast.error(t("web.provider.settings.pages.gallery.invalidFileTypeOnlyJpegPng"));
      return;
    }
    if (!validateFileSize(file, IMAGE_CONSTRAINTS.maxSizeBytes)) {
      toast.error(t("web.provider.settings.pages.gallery.fileTooLargeMaximumSizeIs"));
      return;
    }

    try {
      setIsUploading(true);

      // Get provider ID first
      const providerResponse = await fetcher.get<{ data: { id: string } }>("/api/me/provider");
      const providerId = providerResponse.data?.id;

      if (!providerId) {
        throw new Error(t("web.provider.settings.pages.gallery.providerIdNotFound"));
      }

      // Compress thumbnail before upload (skip if very small)
      let compressionResult;
      if (file.size < 2 * 1024 * 1024) {
        // Skip compression for files smaller than 2MB
        compressionResult = {
          file: file,
          originalSize: file.size,
          compressedSize: file.size,
          compressionRatio: 0,
        };
      } else {
        const { compressImage } = await import("@/lib/utils/image-compression");
        compressionResult = await compressImage(file, {
          maxWidth: 800,
          maxHeight: 800,
          quality: 0.9,
          maxSizeMB: 0.5, // Thumbnails should be smaller
          outputFormat: 'image/jpeg',
        });
        
        if (compressionResult.compressionRatio > 0) {
          toast.success(
            t("web.provider.settings.pages.gallery.compressedPercent", { percent: compressionResult.compressionRatio.toFixed(1) })
          );
        }
      }

      // Upload compressed thumbnail with a unique path
      const compressedFile = compressionResult.file instanceof File 
        ? compressionResult.file 
        : new File([compressionResult.file], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
      
      // Use a dedicated thumbnail path instead of index 0 to avoid conflicts
      const thumbnailPath = `${providerId}/thumbnail`;
      const uploadPromise = uploadFile({
        bucket: 'provider-gallery',
        path: thumbnailPath,
        file: compressedFile,
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true, // Allow overwriting existing thumbnail
      });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(t("web.provider.settings.pages.gallery.uploadTimeoutTryAgain"))), 30000)
      );
      
      const result = await Promise.race([uploadPromise, timeoutPromise]) as Awaited<ReturnType<typeof uploadFile>>;
      const newThumbnailUrl = result.publicUrl;

      // OPTIMISTIC UPDATE: Update UI immediately
      setThumbnailUrl(newThumbnailUrl);

      // Update thumbnail in database in background
      saveGallery(gallery, newThumbnailUrl).catch((error) => {
        console.error("Failed to save thumbnail to database:", error);
        // Reload from server to get correct state
        loadGallery();
        toast.error(t("web.provider.settings.pages.gallery.uploadedThumbnailButFailedToSave"));
      });
      
      toast.success(t("web.provider.settings.pages.gallery.thumbnailUpdatedSuccessfully"));

      // Reset input
      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Thumbnail upload error:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      const errorMessage =
        error instanceof Error ? error.message : t("web.provider.settings.pages.gallery.failedToUploadThumbnail");
      toast.error(t("web.provider.settings.pages.gallery.thumbnailUploadFailedDetails", { message: errorMessage }));
      // Revert optimistic update on error
      setThumbnailUrl(thumbnailUrl); // Revert to original
      // Don't reload here to avoid double loading
    } finally {
      setIsUploading(false);
    }
  };

  const handleAvatarSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!validateFileType(file, IMAGE_CONSTRAINTS.allowedTypes)) {
      toast.error(t("web.provider.settings.pages.gallery.invalidFileTypeOnlyJpegPng"));
      return;
    }
    if (!validateFileSize(file, IMAGE_CONSTRAINTS.maxSizeBytes)) {
      toast.error(t("web.provider.settings.pages.gallery.fileTooLargeMaximumSizeIs"));
      return;
    }

    try {
      setIsUploadingAvatar(true);

      const providerResponse = await fetcher.get<{ data: { id: string } }>("/api/me/provider");
      const providerId = providerResponse.data?.id;
      if (!providerId) throw new Error(t("web.provider.settings.pages.gallery.providerIdNotFound"));

      let compressionResult: { file: File | Blob; originalSize: number; compressedSize: number; compressionRatio: number };
      if (file.size < 2 * 1024 * 1024) {
        compressionResult = {
          file,
          originalSize: file.size,
          compressedSize: file.size,
          compressionRatio: 0,
        };
      } else {
        const { compressImage } = await import("@/lib/utils/image-compression");
        compressionResult = await compressImage(file, {
          maxWidth: 600,
          maxHeight: 600,
          quality: 0.9,
          maxSizeMB: 0.4,
          outputFormat: "image/jpeg",
        });
      }

      const compressedFile =
        compressionResult.file instanceof File
          ? compressionResult.file
          : new File([compressionResult.file], file.name, { type: "image/jpeg", lastModified: Date.now() });

      const avatarPath = `${providerId}/avatar`;
      const result = await uploadFile({
        bucket: "provider-gallery",
        path: avatarPath,
        file: compressedFile,
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });
      const newAvatarUrl = result.publicUrl;

      setAvatarUrl(newAvatarUrl);
      const response = await fetcher.patch<{ data: { avatar_url: string | null } }>("/api/provider/profile", {
        avatar_url: newAvatarUrl,
      });
      if (response.data?.avatar_url !== undefined) setAvatarUrl(response.data.avatar_url);
      invalidateSetupStatusCache();
      toast.success(t("web.provider.settings.pages.gallery.profileCircleImageUpdatedItAppears"));

      if (avatarInputRef.current) avatarInputRef.current.value = "";
    } catch (error) {
      const msg = error instanceof FetchError ? error.message : t("web.provider.settings.pages.gallery.failedToUploadProfileImage");
      toast.error(msg);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const saveGallery = async (newGallery: string[], newThumbnail: string | null) => {
    try {
      setIsSaving(true);
      console.log("Saving gallery:", { gallery: newGallery, thumbnail: newThumbnail });
      
      const response = await fetcher.patch<{ data: any }>("/api/provider/profile", {
        gallery: newGallery,
        thumbnail_url: newThumbnail,
      });
      
      invalidateSetupStatusCache();
      // Verify the response contains the updated data
      if (response.data) {
        console.log("Gallery saved successfully:", response.data);
        if (response.data.gallery) setGallery(response.data.gallery);
        if (response.data.thumbnail_url !== undefined) setThumbnailUrl(response.data.thumbnail_url);
        if (response.data.avatar_url !== undefined) setAvatarUrl(response.data.avatar_url);
      }
    } catch (error) {
      console.error("Save gallery error:", error);
      const errorMessage =
        error instanceof FetchError
          ? error.message
          : t("web.provider.settings.pages.gallery.failedToSaveGallery");
      throw new Error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteImage = async (index: number) => {
    if (!confirm(t("web.provider.settings.pages.gallery.confirmDeleteImage"))) return;

    try {
      const updatedGallery = gallery.filter((_, i) => i !== index);
      
      // If deleting thumbnail, also remove thumbnail_url
      const updatedThumbnail = thumbnailUrl === gallery[index] ? null : thumbnailUrl;
      const wasAvatar = avatarUrl === gallery[index];
      
      await saveGallery(updatedGallery, updatedThumbnail);
      setGallery(updatedGallery);
      if (updatedThumbnail !== thumbnailUrl) setThumbnailUrl(null);
      if (wasAvatar) {
        setAvatarUrl(null);
        await fetcher.patch("/api/provider/profile", { avatar_url: null }).catch(() => {});
      }
      toast.success(t("web.provider.settings.pages.gallery.imageDeletedSuccessfully"));
    } catch (error) {
      const errorMessage =
        error instanceof FetchError
          ? error.message
          : t("web.provider.settings.pages.gallery.failedToDeleteImage");
      toast.error(errorMessage);
    }
  };

  const handleSetThumbnail = async (url: string) => {
    try {
      await saveGallery(gallery, url);
      setThumbnailUrl(url);
      toast.success(t("web.provider.settings.pages.gallery.thumbnailSetSuccessfully"));
    } catch (error) {
      const errorMessage =
        error instanceof FetchError
          ? error.message
          : t("web.provider.settings.pages.gallery.failedToSetThumbnail");
      toast.error(errorMessage);
    }
  };

  const handleSetAvatar = async (url: string) => {
    try {
      setIsSaving(true);
      const response = await fetcher.patch<{ data: { avatar_url: string | null } }>("/api/provider/profile", {
        avatar_url: url,
      });
      if (response.data?.avatar_url !== undefined) setAvatarUrl(response.data.avatar_url);
      invalidateSetupStatusCache();
      toast.success(t("web.provider.settings.pages.gallery.profileImageUpdatedItAppearsIn"));
    } catch (error) {
      const errorMessage =
        error instanceof FetchError ? error.message : t("web.provider.settings.pages.gallery.failedToSetProfileImage");
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const openEditDetails = (index: number) => {
    setEditIndex(index);
    setEditCaption("");
    setEditDetailsOpen(true);
  };

  const handleSaveEditDetails = async () => {
    if (editIndex === null) return;
    try {
      setIsSavingDetails(true);
      await fetcher.patch<{ data: { caption: string | null } }>(
        `/api/provider/gallery/${editIndex}`,
        { caption: editCaption.trim() || null }
      );
      toast.success(t("web.provider.settings.pages.gallery.photoDetailsSaved"));
      setEditDetailsOpen(false);
      setEditIndex(null);
      setEditCaption("");
    } catch (_err) {
      toast.error(t("web.provider.settings.pages.gallery.failedToSavePhotoDetails"));
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    const newGallery = [...gallery];
    const [moved] = newGallery.splice(fromIndex, 1);
    newGallery.splice(toIndex, 0, moved);
    
    try {
      await saveGallery(newGallery, thumbnailUrl);
      setGallery(newGallery);
      toast.success(t("web.provider.settings.pages.gallery.galleryReorderedSuccessfully"));
    } catch (error) {
      const errorMessage =
        error instanceof FetchError
          ? error.message
          : t("web.provider.settings.pages.gallery.failedToReorderGallery");
      toast.error(errorMessage);
    }
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["provider_owner"]} redirectTo="/provider/dashboard" showLoading={false}>
        <div className="min-h-screen bg-white">
          <PageHeader 
            title={t("web.provider.settings.categories.appointmentActivity.items.gallery.title")} 
            subtitle={t("web.provider.settings.categories.appointmentActivity.items.gallery.description")}
            breadcrumbs={[
              { label: t("web.provider.common.breadcrumbHome"), href: "/" },
              { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
              { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
              { label: t("web.provider.settings.pages.gallery.gallery") }
            ]}
          />
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-600">{t("common.loading")}</p>
            </div>
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner"]} redirectTo="/provider/dashboard" showLoading={false}>
      <div className="min-h-screen bg-white">
        <PageHeader
          title={t("web.provider.settings.categories.appointmentActivity.items.gallery.title")}
          subtitle={t("web.provider.settings.categories.appointmentActivity.items.gallery.description")}
          breadcrumbs={[
            { label: t("web.provider.common.breadcrumbHome"), href: "/" },
            { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
            { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
            { label: t("web.provider.settings.pages.gallery.gallery") }
          ]}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4 sm:mt-6 space-y-4 sm:space-y-6">
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription>
              <strong>{t("web.provider.settings.pages.gallery.listingImageThumbnailStrong")}</strong> {t("web.provider.settings.pages.gallery.listingImageHelp")} 
              <br />
              <strong>{t("web.provider.settings.pages.gallery.profileCircleStrong")}</strong> {t("web.provider.settings.pages.gallery.profileCircleHelp")}
              <br />
              <strong>{t("web.provider.settings.pages.gallery.portfolioGalleryStrong")}</strong> {t("web.provider.settings.pages.gallery.portfolioGalleryHelp")}
              <br />
              <strong>{t("web.provider.settings.pages.gallery.imagesCompressedStrong")}</strong> {t("web.provider.settings.pages.gallery.maxImageConstraints")}
            </AlertDescription>
          </Alert>

          {/* Profile circle (business face) - direct upload */}
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4">{t("web.provider.settings.pages.gallery.profileCircleBusinessFace")}</h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
              {t("web.provider.settings.pages.gallery.profileCircleUploadHint")}
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              {avatarUrl ? (
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-indigo-500 flex-shrink-0 bg-gray-100">
                  <img
                    src={avatarUrl}
                    alt={t("web.provider.settings.pages.gallery.profileCircleAlt")}
                    className="w-full h-full object-cover"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.src = "/images/placeholder-image.jpg";
                    }}
                  />
                  <div className="absolute bottom-0 end-0 bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-tl flex items-center gap-1">
                    <CircleUser className="w-3 h-3" />
                    <span className="hidden sm:inline">{t("web.provider.settings.pages.gallery.face")}</span>
                  </div>
                </div>
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 flex-shrink-0">
                  <CircleUser className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
                </div>
              )}
              <div className="flex-1 w-full sm:w-auto">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
                <Button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  variant="outline"
                  className="w-full sm:w-auto touch-manipulation border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
                >
                  {isUploadingAvatar ? (
                    <>
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      {t("web.provider.settings.pages.gallery.uploading")}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 me-2" />
                      <span className="hidden sm:inline">{avatarUrl ? t("web.provider.settings.pages.gallery.changeProfileImage") : t("web.provider.settings.pages.gallery.uploadProfileImage")}</span>
                      <span className="sm:hidden">{avatarUrl ? t("web.provider.settings.pages.gallery.change") : t("web.provider.settings.pages.gallery.upload")}</span>
                    </>
                  )}
                </Button>
                <p className="text-xs text-gray-500 mt-2">{t("web.provider.settings.pages.gallery.orChooseFromGallery")}</p>
              </div>
            </div>
          </div>

          {/* Listing image (thumbnail) - direct upload */}
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4">{t("web.provider.settings.pages.gallery.listingImageThumbnail")}</h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
              {t("web.provider.settings.pages.gallery.listingImageUploadHint")}
            </p>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              {thumbnailUrl ? (
                <div 
                  className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden border-2 border-primary cursor-pointer flex-shrink-0"
                  onClick={() => {
                    const index = gallery.findIndex(url => url === thumbnailUrl);
                    if (index !== -1) setSelectedImageIndex(index);
                  }}
                >
                  <img
                    src={thumbnailUrl}
                    alt={t("web.provider.settings.pages.gallery.thumbnail")}
                    className="w-full h-full object-cover"
                    style={{ imageRendering: 'auto' }}
                    decoding="async"
                    onError={(e) => {
                      console.error("Failed to load thumbnail:", thumbnailUrl);
                      e.currentTarget.src = '/images/placeholder-image.jpg';
                    }}
                  />
                  <div className="absolute top-1 end-1 sm:top-2 sm:end-2 bg-primary text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex items-center gap-1">
                    <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
                    <span className="hidden sm:inline">{t("web.provider.settings.pages.gallery.thumbnail")}</span>
                  </div>
                </div>
              ) : (
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 flex-shrink-0">
                  <ImageIcon className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
                </div>
              )}
              
              <div className="flex-1 w-full sm:w-auto">
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleThumbnailSelect}
                  className="hidden"
                />
                <Button
                  onClick={() => thumbnailInputRef.current?.click()}
                  disabled={isUploading}
                  variant="outline"
                  className="w-full sm:w-auto touch-manipulation"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      {t("web.provider.settings.pages.gallery.uploading")}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 me-2" />
                      <span className="hidden sm:inline">{thumbnailUrl ? t("web.provider.settings.pages.gallery.changeThumbnail") : t("web.provider.settings.pages.gallery.uploadThumbnail")}</span>
                      <span className="sm:hidden">{thumbnailUrl ? t("web.provider.settings.pages.gallery.change") : t("web.provider.settings.pages.gallery.upload")}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Gallery Section */}
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold">{t("web.provider.settings.pages.gallery.portfolioWorkGallery")}</h3>
                <p className="text-xs sm:text-sm text-gray-600 mb-2">
                  {t("web.provider.settings.pages.gallery.portfolioWorkHint")}
                </p>
                <p className="text-xs sm:text-sm text-gray-500">
                  {t("web.provider.settings.pages.gallery.imagesUploaded", { count: gallery.length })}
                </p>
              </div>
              <div className="w-full sm:w-auto">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isSaving}
                  className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-white disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                >
                  <Upload className="w-4 h-4 me-2" />
                  {isUploading ? t("web.provider.settings.pages.gallery.uploading") : t("web.provider.settings.pages.gallery.uploadImages")}
                </Button>
              </div>
            </div>

            {isUploading && Object.keys(compressionProgress).length > 0 && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800 mb-2">{t("web.provider.settings.pages.gallery.preparingImages")}</p>
                <div className="space-y-2">
                  {Object.entries(compressionProgress).map(([fileName, result]) => (
                    <div key={fileName} className="text-xs text-blue-700">
                      {fileName}: {result.compressionRatio > 0 
                        ? t("web.provider.settings.pages.gallery.compressedPercentShort", { percent: result.compressionRatio.toFixed(1) })
                        : t("web.provider.settings.pages.gallery.readyToUpload")}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {gallery.length === 0 ? (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 sm:p-12 text-center">
                <ImageIcon className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
                <p className="text-sm sm:text-base text-gray-600 mb-2">{t("web.provider.settings.pages.gallery.noPortfolioImages")}</p>
                <p className="text-xs sm:text-sm text-gray-500 mb-4">
                  {t("web.provider.settings.pages.gallery.uploadPhotosHint")}
                </p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isSaving}
                  className="bg-primary hover:bg-primary-hover text-white disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                >
                  <Upload className="w-4 h-4 me-2" />
                  {isUploading ? t("web.provider.settings.pages.gallery.uploading") : t("web.provider.settings.pages.gallery.uploadPhotos")}
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
                  {gallery.map((url, index) => (
                    <div
                      key={index}
                      className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-primary transition-all cursor-pointer"
                      onClick={() => setSelectedImageIndex(index)}
                    >
                      <img
                        src={url}
                        alt={t("web.provider.settings.pages.gallery.galleryImageAlt", { index: index + 1 })}
                        className="w-full h-full object-cover"
                        style={{ imageRendering: 'auto' }}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          console.error("Failed to load gallery image:", url);
                          e.currentTarget.src = '/images/placeholder-image.jpg';
                        }}
                      />
                      {/* Mobile: Always visible compact action buttons */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 sm:group-hover:bg-black/70 transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 p-1.5 sm:p-2">
                        {/* View Full Size Button - Always visible on mobile */}
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImageIndex(index);
                          }}
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-white text-gray-900 border-0 shadow-md font-medium h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm touch-manipulation"
                        >
                          <Maximize2 className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline ms-1">{t("web.provider.settings.pages.gallery.view")}</span>
                        </Button>
                        
                        {/* Action buttons - Stacked on mobile, side-by-side on desktop */}
                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetThumbnail(url);
                            }}
                            className={`opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-md font-medium h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm touch-manipulation ${
                              thumbnailUrl === url
                                ? 'bg-primary text-white border-0 cursor-not-allowed'
                                : 'bg-white/90 hover:bg-white text-gray-900 border-0'
                            }`}
                            disabled={thumbnailUrl === url}
                            title={thumbnailUrl === url ? t("web.provider.settings.pages.gallery.listingImage") : t("web.provider.settings.pages.gallery.setAsListingImage")}
                          >
                            <Star className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span className="hidden sm:inline ms-1">{thumbnailUrl === url ? t("web.provider.settings.pages.gallery.thumbnail") : t("web.provider.settings.pages.gallery.set")}</span>
                          </Button>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetAvatar(url);
                            }}
                            className={`opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-md font-medium h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm touch-manipulation ${
                              avatarUrl === url
                                ? 'bg-indigo-600 text-white border-0 cursor-not-allowed'
                                : 'bg-white/90 hover:bg-white text-gray-900 border-0'
                            }`}
                            disabled={avatarUrl === url}
                            title={avatarUrl === url ? t("web.provider.settings.pages.gallery.profileCircleAlt") : t("web.provider.settings.pages.gallery.setAsProfileCircleFace")}
                          >
                            <CircleUser className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span className="hidden sm:inline ms-1">{avatarUrl === url ? t("web.provider.settings.pages.gallery.face") : t("web.provider.settings.pages.gallery.profile")}</span>
                          </Button>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteImage(index);
                            }}
                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-red-600/90 hover:bg-red-700 text-white shadow-md font-medium h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm touch-manipulation border-0"
                          >
                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span className="hidden sm:inline ms-1">{t("web.provider.common.delete")}</span>
                          </Button>
                        </div>
                      </div>
                      
                      {/* Listing image & Profile circle badges */}
                      {thumbnailUrl === url && (
                        <div className="absolute top-1 end-1 bg-primary text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex items-center gap-1 shadow-md">
                          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
                          <span className="hidden sm:inline">{t("web.provider.settings.pages.gallery.listing")}</span>
                        </div>
                      )}
                      {avatarUrl === url && (
                        <div className="absolute bottom-1 end-1 bg-indigo-600 text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex items-center gap-1 shadow-md">
                          <CircleUser className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          <span className="hidden sm:inline">{t("web.provider.settings.pages.gallery.face")}</span>
                        </div>
                      )}
                      
                      {/* Reorder buttons - Only on desktop hover */}
                      {index > 0 && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReorder(index, index - 1);
                          }}
                          className="absolute top-1 start-1 opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-white text-gray-900 border-0 shadow-md font-medium h-6 w-6 sm:h-7 sm:w-7 p-0 touch-manipulation hidden sm:flex items-center justify-center"
                          title={t("web.provider.settings.pages.gallery.moveUp")}
                        >
                          ↑
                        </Button>
                      )}
                      {index < gallery.length - 1 && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReorder(index, index + 1);
                          }}
                          className="absolute bottom-1 start-1 opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-white text-gray-900 border-0 shadow-md font-medium h-6 w-6 sm:h-7 sm:w-7 p-0 touch-manipulation hidden sm:flex items-center justify-center"
                          title={t("web.provider.settings.pages.gallery.moveDown")}
                        >
                          ↓
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Lightbox Dialog for Full-Size Image Viewing */}
                <Dialog open={selectedImageIndex !== null} onOpenChange={(open) => !open && setSelectedImageIndex(null)}>
                  <DialogContent className="max-w-[100vw] max-h-[100vh] w-full h-full p-0 bg-black/95 border-0 rounded-none sm:rounded-xl sm:max-w-[95vw] sm:max-h-[95vh] sm:p-4">
                    {selectedImageIndex !== null && (
                      <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-0">
                        <img
                          src={gallery[selectedImageIndex]}
                          alt={t("web.provider.settings.pages.gallery.galleryImageAlt", { index: selectedImageIndex + 1 })}
                          className="max-w-full max-h-[calc(100vh-8rem)] sm:max-h-[90vh] object-contain rounded-lg"
                          style={{ imageRendering: 'auto' }}
                          decoding="async"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col sm:flex-row gap-2 bg-black/70 backdrop-blur-sm rounded-lg p-2 sm:p-3 w-[calc(100%-2rem)] sm:w-auto min-h-[52px] sm:min-h-0">
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSetThumbnail(gallery[selectedImageIndex]);
                              setSelectedImageIndex(null);
                            }}
                            className={`min-h-[44px] sm:min-h-0 ${
                              thumbnailUrl === gallery[selectedImageIndex]
                                ? 'bg-primary text-white'
                                : 'bg-white/90 hover:bg-white text-gray-900'
                            } border-0 shadow-md touch-manipulation w-full sm:w-auto`}
                            disabled={thumbnailUrl === gallery[selectedImageIndex]}
                          >
                            <Star className="w-4 h-4 me-1" />
                            <span className="text-xs sm:text-sm">{thumbnailUrl === gallery[selectedImageIndex] ? t("web.provider.settings.pages.gallery.thumbnail") : t("web.provider.settings.pages.gallery.setAsThumbnail")}</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSetAvatar(gallery[selectedImageIndex]);
                              setSelectedImageIndex(null);
                            }}
                            className={`min-h-[44px] sm:min-h-0 ${
                              avatarUrl === gallery[selectedImageIndex]
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white/90 hover:bg-white text-gray-900'
                            } border-0 shadow-md touch-manipulation w-full sm:w-auto`}
                            disabled={avatarUrl === gallery[selectedImageIndex]}
                          >
                            <CircleUser className="w-4 h-4 me-1" />
                            <span className="text-xs sm:text-sm">{avatarUrl === gallery[selectedImageIndex] ? t("web.provider.settings.pages.gallery.profileCircleAlt") : t("web.provider.settings.pages.gallery.setAsProfileCircle")}</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openEditDetails(selectedImageIndex);
                            }}
                            className="min-h-[44px] sm:min-h-0 bg-white/90 hover:bg-white text-gray-900 border-0 shadow-md touch-manipulation w-full sm:w-auto"
                          >
                            <Pencil className="w-4 h-4 me-1" />
                            <span className="text-xs sm:text-sm">{t("web.provider.settings.pages.gallery.editDetails")}</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteImage(selectedImageIndex);
                              setSelectedImageIndex(null);
                            }}
                            className="min-h-[44px] sm:min-h-0 bg-red-600 hover:bg-red-700 text-white border-0 shadow-md touch-manipulation w-full sm:w-auto"
                          >
                            <Trash2 className="w-4 h-4 me-1" />
                            <span className="text-xs sm:text-sm">{t("web.provider.common.delete")}</span>
                          </Button>
                        </div>
                        <div className="absolute top-2 sm:top-4 end-2 sm:end-4 text-white text-xs sm:text-sm bg-black/70 backdrop-blur-sm rounded px-2 py-1">
                          {selectedImageIndex + 1} / {gallery.length}
                        </div>
                        {selectedImageIndex > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedImageIndex(selectedImageIndex - 1);
                            }}
                            className="absolute start-2 sm:start-4 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white text-gray-900 border-0 shadow-md touch-manipulation min-w-[44px] min-h-[44px]"
                            aria-label={t("web.provider.settings.pages.gallery.previousImage")}
                          >
                            ←
                          </Button>
                        )}
                        {selectedImageIndex < gallery.length - 1 && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedImageIndex(selectedImageIndex + 1);
                            }}
                            className="absolute end-2 sm:end-4 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white text-gray-900 border-0 shadow-md touch-manipulation min-w-[44px] min-h-[44px]"
                            aria-label={t("web.provider.settings.pages.gallery.nextImage")}
                          >
                            →
                          </Button>
                        )}
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

                {/* Edit photo details modal */}
                <Dialog open={editDetailsOpen} onOpenChange={setEditDetailsOpen}>
                  <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                      <DialogTitle>{t("web.provider.settings.pages.gallery.editPhotoDetails")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-caption">{t("web.provider.settings.pages.gallery.captionOptional")}</Label>
                        <Input
                          id="edit-caption"
                          value={editCaption}
                          onChange={(e) => setEditCaption(e.target.value)}
                          placeholder={t("web.provider.settings.pages.gallery.addACaptionForThisPhoto")}
                          className="touch-manipulation"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={() => setEditDetailsOpen(false)}>
                          {t("web.provider.common.cancel")}
                        </Button>
                        <Button
                          type="button"
                          onClick={handleSaveEditDetails}
                          disabled={isSavingDetails}
                          className="bg-primary hover:bg-primary-hover text-white"
                        >
                          {isSavingDetails ? (
                            <>
                              <Loader2 className="w-4 h-4 me-2 animate-spin" />
                              {t("web.provider.common.saving")}
                            </>
                          ) : (
                            t("web.provider.common.save")
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
