"use client";

import React, { useMemo, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Sparkles, Calendar, Clock, MapPin, Image as ImageIcon, DollarSign, X, Upload, Loader2, Info, CheckCircle2, AlertCircle } from "lucide-react";
import Image from "next/image";
import EmptyState from "@/components/ui/empty-state";

type Props = {
  providerId: string;
  acceptsCustomRequests?: boolean;
  businessName?: string;
};

export default function RequestCustomServicePage({ providerId, acceptsCustomRequests = true, businessName }: Props) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [budgetMin, setBudgetMin] = useState<string>("");
  const [budgetMax, setBudgetMax] = useState<string>("");
  const [preferredStartAt, setPreferredStartAt] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [imageUrlsText, setImageUrlsText] = useState<string>("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [locationType, setLocationType] = useState<"at_home" | "at_salon">("at_salon");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Combine uploaded images and manually entered URLs
  const imageUrls = useMemo(() => {
    const manualUrls = imageUrlsText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    return [...uploadedImages, ...manualUrls].slice(0, 6);
  }, [imageUrlsText, uploadedImages]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Validate file count
    const totalFiles = uploadedImages.length + imageUrlsText.split(/\n|,/).filter(Boolean).length + files.length;
    if (totalFiles > 6) {
      toast.error("Maximum 6 images allowed");
      return;
    }

    setUploadingImages(true);

    try {
      // Create preview URLs for immediate display
      const previews: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith("image/")) {
          previews.push(URL.createObjectURL(file));
        }
      }
      setImagePreviewUrls((prev) => [...prev, ...previews]);

      // Upload files to server
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetcher.post<{ data: { urls: string[]; count: number }; error: null }>(
        "/api/me/custom-requests/upload",
        formData
      );

      // Handle response structure: { data: { urls: [...], count: N }, error: null }
      if (response.data?.urls && Array.isArray(response.data.urls)) {
        setUploadedImages((prev) => [...prev, ...response.data.urls].slice(0, 6));
        toast.success(`${response.data.count || response.data.urls.length} image${(response.data.count || response.data.urls.length) > 1 ? "s" : ""} uploaded successfully`);
      }
    } catch (error) {
      const msg = error instanceof FetchError ? error.message : "Failed to upload images";
      toast.error(msg);
      // Remove previews on error
      setImagePreviewUrls((prev) => prev.slice(0, prev.length - files.length));
    } finally {
      setUploadingImages(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    // Determine if it's an uploaded image or manual URL
    if (index < uploadedImages.length) {
      // Remove uploaded image
      setUploadedImages((prev) => prev.filter((_, i) => i !== index));
      // Clean up preview URL
      if (imagePreviewUrls[index]) {
        URL.revokeObjectURL(imagePreviewUrls[index]);
        setImagePreviewUrls((prev) => prev.filter((_, i) => i !== index));
      }
    } else {
      // Remove from manual URLs
      const manualUrls = imageUrlsText.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
      const urlIndex = index - uploadedImages.length;
      manualUrls.splice(urlIndex, 1);
      setImageUrlsText(manualUrls.join("\n"));
    }
  };

  const submit = async () => {
    try {
      setIsSubmitting(true);
      
      // Convert datetime-local to ISO string if provided
      let preferredStartAtIso: string | null = null;
      if (preferredStartAt) {
        // datetime-local returns format: "YYYY-MM-DDTHH:mm"
        // Convert to ISO string for API
        const date = new Date(preferredStartAt);
        if (!isNaN(date.getTime())) {
          preferredStartAtIso = date.toISOString();
        }
      }
      
      // Validate budget_max >= budget_min if both provided
      if (budgetMin && budgetMax && Number(budgetMax) < Number(budgetMin)) {
        toast.error("Maximum budget must be greater than or equal to minimum budget");
        setIsSubmitting(false);
        return;
      }
      
      const res = await fetcher.post<{ data: any }>("/api/me/custom-requests", {
        provider_id: providerId,
        description,
        budget_min: budgetMin ? Number(budgetMin) : null,
        budget_max: budgetMax ? Number(budgetMax) : null,
        preferred_start_at: preferredStartAtIso,
        duration_minutes: Number(durationMinutes || 60),
        image_urls: imageUrls,
        location_type: locationType,
      });
      toast.success("Custom request sent");
      router.push("/account-settings/custom-requests");
      return res.data;
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to send request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = description.trim().length >= 10;

  // Quick template options for common requests
  const quickTemplates = [
    { label: "Wedding/Event", value: "I'm looking for services for my wedding/event. I need..." },
    { label: "Special Occasion", value: "I have a special occasion coming up and would like..." },
    { label: "Package Deal", value: "I'm interested in a custom package that includes..." },
    { label: "Group Booking", value: "I'd like to book services for a group of people..." },
  ];

  const applyTemplate = (template: string) => {
    setDescription(template);
  };

  // Show message if provider doesn't accept custom requests
  if (!acceptsCustomRequests) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8 md:py-12">
        <div className="max-w-3xl mx-auto">
          <EmptyState
            title="Custom Service Requests Not Available"
            description={`${businessName || "This provider"} is not currently accepting custom service requests. Please browse their available services or contact them directly.`}
            icon={AlertCircle}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8 md:py-12">
      {/* Header Section with Explanation */}
      <div className="max-w-3xl mx-auto mb-8 md:mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg">
            <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 tracking-tight">
            Request Custom Service
          </h1>
        </div>
        
        {/* What is this section */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 md:p-6 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">What is a Custom Service Request?</h3>
              <p className="text-sm text-gray-700 leading-relaxed mb-3">
                Can't find exactly what you're looking for in our standard services? Request a custom service tailored to your specific needs! 
                Whether it's a special occasion, unique styling, or a combination of services, we'll work with you to create the perfect experience.
              </p>
              <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside">
                <li>Describe what you need and your vision</li>
                <li>Share your budget and preferred dates</li>
                <li>Add inspiration photos (optional)</li>
                <li>Get a personalized quote from the provider</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Form Section - Apple-style card design */}
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 md:p-10 space-y-8 md:space-y-10">
            {/* Description Section with Quick Templates */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="description" className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gray-600" />
                  What are you looking for? <span className="text-red-500">*</span>
                </Label>
                <span className="text-xs text-gray-500">
                  {description.trim().length >= 10 ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-3 h-3" />
                      {description.trim().length} characters
                    </span>
                  ) : (
                    <span className="text-gray-400">
                      {description.trim().length} / 10 min
                    </span>
                  )}
                </span>
              </div>
              
              {/* Quick Templates */}
              <div className="flex flex-wrap gap-2 mb-3">
                {quickTemplates.map((template, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyTemplate(template.value)}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors border border-gray-200"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
              
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Example: I'm planning a wedding and need a complete bridal package including hair, makeup, and nails for myself and 3 bridesmaids. The wedding is on [date] and I prefer a natural, elegant look with soft pink tones..."
                rows={6}
                className="w-full resize-none border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl text-base placeholder:text-gray-400 transition-all"
              />
              <p className="text-xs text-gray-500">
                💡 Tip: Include the occasion, number of people, preferred style/colors, and any special requirements
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100"></div>

            {/* Budget Section */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-600" />
                Budget Range <span className="text-xs font-normal text-gray-500">(Optional)</span>
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="budgetMin" className="text-xs text-gray-600 font-medium">
                    Minimum (ZAR)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">R</span>
                    <Input 
                      id="budgetMin"
                      value={budgetMin} 
                      onChange={(e) => setBudgetMin(e.target.value)} 
                      type="number" 
                      min={0}
                      placeholder="500"
                      className="pl-8 border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budgetMax" className="text-xs text-gray-600 font-medium">
                    Maximum (ZAR)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">R</span>
                    <Input 
                      id="budgetMax"
                      value={budgetMax} 
                      onChange={(e) => setBudgetMax(e.target.value)} 
                      type="number" 
                      min={0}
                      placeholder="2000"
                      className="pl-8 border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">💡 Helps the provider create a quote that fits your budget</p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100"></div>

            {/* Date & Duration Section */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-600" />
                When & How Long <span className="text-xs font-normal text-gray-500">(Optional)</span>
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="preferredStartAt" className="text-xs text-gray-600 font-medium">
                    Preferred Date & Time
                  </Label>
                  <Input 
                    id="preferredStartAt"
                    value={preferredStartAt} 
                    onChange={(e) => setPreferredStartAt(e.target.value)} 
                    type="datetime-local"
                    min={new Date().toISOString().slice(0, 16)}
                    className="border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="durationMinutes" className="text-xs text-gray-600 font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Estimated Duration
                  </Label>
                  <div className="relative">
                    <Input
                      id="durationMinutes"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      type="number"
                      min={15}
                      step={15}
                      placeholder="60"
                      className="border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base pr-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">minutes</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">💡 Flexible? Leave blank and the provider will suggest available times</p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100"></div>

            {/* Location Type Section - Apple-style segmented control */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-600" />
                Service Location
              </Label>
              <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setLocationType("at_salon")}
                  type="button"
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                    locationType === "at_salon"
                      ? "bg-white text-gray-900 shadow-sm font-semibold"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  At Salon
                </button>
                <button
                  onClick={() => setLocationType("at_home")}
                  type="button"
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                    locationType === "at_home"
                      ? "bg-white text-gray-900 shadow-sm font-semibold"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  At Home
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100"></div>

            {/* Inspiration Photos Section */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-gray-600" />
                Inspiration Photos
                <span className="text-xs font-normal text-gray-500">(Optional)</span>
              </Label>

              {/* File Upload Area */}
              <div className="space-y-3">
                <div
                  onClick={() => !uploadingImages && imageUrls.length < 6 && fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    uploadingImages || imageUrls.length >= 6
                      ? "border-gray-300 bg-gray-50 cursor-not-allowed opacity-60"
                      : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                    multiple
                    onChange={handleFileSelect}
                    disabled={uploadingImages || imageUrls.length >= 6}
                    className="hidden"
                  />
                  {uploadingImages ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                      <span className="text-sm text-gray-600">Uploading images...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-6 h-6 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">
                        {imageUrls.length >= 6
                          ? "Maximum 6 images reached"
                          : "Click to upload or drag and drop"}
                      </span>
                      <span className="text-xs text-gray-500">PNG, JPG, WebP, GIF up to 5MB each</span>
                    </div>
                  )}
                </div>

                {/* Image Previews */}
                {imageUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {imageUrls.map((url, index) => {
                      const _isUploaded = index < uploadedImages.length;
                      const previewUrl = imagePreviewUrls[index] || url;
                      return (
                        <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                          <Image
                            src={previewUrl}
                            alt={`Inspiration ${index + 1}`}
                            fill
                            className="object-cover"
                            onError={(e) => {
                              // Hide broken images
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            aria-label="Remove image"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Manual URL Input (Alternative) */}
                <div className="space-y-2">
                  <Label htmlFor="imageUrls" className="text-xs text-gray-600 font-medium">
                    Or paste image URLs (one per line or comma-separated)
                  </Label>
                  <Textarea
                    id="imageUrls"
                    value={imageUrlsText}
                    onChange={(e) => setImageUrlsText(e.target.value)}
                    placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg"
                    rows={2}
                    className="w-full resize-none border-gray-200 focus:border-gray-400 focus:ring-0 rounded-xl text-sm placeholder:text-gray-400 transition-colors font-mono"
                    disabled={imageUrls.length >= 6}
                  />
                </div>

                {imageUrls.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    {imageUrls.length} / 6 {imageUrls.length === 1 ? "image" : "images"} added
                  </div>
                )}

                <p className="text-xs text-gray-500">
                  Share up to 6 inspiration images to help us understand your vision
                </p>
              </div>
            </div>
          </div>

          {/* Footer Actions - Apple-style */}
          <div className="px-6 md:px-10 py-6 bg-gray-50/50 border-t border-gray-100">
            <div className="flex flex-col-reverse md:flex-row justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={() => router.back()} 
                disabled={isSubmitting}
                className="rounded-xl h-12 px-6 border-gray-200 hover:bg-gray-100 text-gray-700 font-medium"
              >
                Cancel
              </Button>
              <Button 
                onClick={submit} 
                disabled={isSubmitting || !isValid}
                className={`rounded-xl h-12 px-8 font-semibold text-base transition-all duration-200 ${
                  isValid && !isSubmitting
                    ? "bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white shadow-lg hover:shadow-xl"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending Request...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Send Request
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
