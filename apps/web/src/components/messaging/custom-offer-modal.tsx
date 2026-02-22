"use client";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Sparkles, X, Upload } from "lucide-react";

interface CustomOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName?: string;
  onSuccess?: () => void;
}

export default function CustomOfferModal({
  isOpen,
  onClose,
  customerId,
  customerName,
  onSuccess,
}: CustomOfferModalProps) {
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("ZAR");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [locationType, setLocationType] = useState<"at_home" | "at_salon">("at_salon");
  const [expirationDays, setExpirationDays] = useState("7");
  const [notes, setNotes] = useState("");
  const [preferredStartAt, setPreferredStartAt] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceCategoryId, setServiceCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; name: string; is_active: boolean }>>([]);

  // Load service categories and staff members
  useEffect(() => {
    if (isOpen) {
      loadCategories();
      loadStaffMembers();
    }
  }, [isOpen]);

  const loadCategories = async () => {
    try {
      const response = await fetcher.get<{ data: Array<{ id: string; name: string }> }>("/api/public/categories/global");
      setCategories(response.data || []);
    } catch (err) {
      console.error("Failed to load categories:", err);
      // Continue without categories
    }
  };

  const loadStaffMembers = async () => {
    try {
      const response = await fetcher.get<{ data: Array<{ id: string; name: string; is_active: boolean }> }>("/api/provider/staff");
      // Only show active staff members
      const activeStaff = (response.data || []).filter((staff) => staff.is_active);
      setStaffMembers(activeStaff);
    } catch (err) {
      console.error("Failed to load staff members:", err);
      // Continue without staff selection
    }
  };

  const handleQuickTemplate = (template: string) => {
    const templates: Record<string, string> = {
      "Wedding Package": `I'd like to offer you a complete wedding package including hair, makeup, and nails. This includes a trial session before the wedding day. Perfect for your special day!`,
      "Special Occasion": `I have a special offer for your upcoming occasion. This includes full styling and makeup services tailored to your needs.`,
      "Package Deal": `I'm offering you a discounted package deal for multiple services. This is a great value opportunity!`,
      "Group Booking": `I can offer you a group booking discount for multiple people. Perfect for events, parties, or special occasions!`,
    };
    setDescription(templates[template] || "");
  };

  const _handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (imageUrls.length + files.length > 6) {
      toast.error("Maximum 6 images allowed");
      return;
    }

    // For now, we'll need to upload images to get URLs
    // This is a simplified version - you may need to implement actual image upload
    toast.info("Image upload functionality needs to be implemented");
  };

  const removeImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateExpirationDate = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  };

  const isValid = () => {
    return (
      description.trim().length >= 10 &&
      description.trim().length <= 4000 &&
      price &&
      Number(price) >= 0 &&
      durationMinutes &&
      Number(durationMinutes) >= 15 &&
      Number(durationMinutes) <= 480 &&
      expirationDays &&
      Number(expirationDays) > 0
    );
  };

  const handleSubmit = async () => {
    if (!isValid()) {
      toast.error("Please fill in all required fields correctly");
      return;
    }

    try {
      setIsSubmitting(true);

      // Convert datetime-local to ISO string if provided
      let preferredStartAtIso: string | null = null;
      if (preferredStartAt) {
        const date = new Date(preferredStartAt);
        if (!isNaN(date.getTime())) {
          preferredStartAtIso = date.toISOString();
        }
      }

      const expirationAt = calculateExpirationDate(Number(expirationDays));

      await fetcher.post<{ data: { request: any; offer: any } }>(
        "/api/provider/custom-offers/create",
        {
          customer_id: customerId,
          service_category_id: serviceCategoryId || null,
          location_type: locationType,
          description: description.trim(),
          price: Number(price),
          currency: currency,
          duration_minutes: Number(durationMinutes),
          expiration_at: expirationAt,
          notes: notes.trim() || null,
          preferred_start_at: preferredStartAtIso,
          image_urls: imageUrls,
          staff_id: staffId || null, // Include assigned staff
        }
      );

      toast.success("Custom offer sent successfully!");
      onSuccess?.();
      handleClose();
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to send custom offer. Please try again.";
      toast.error(errorMessage);
      console.error("Error creating custom offer:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setDescription("");
    setPrice("");
    setCurrency("ZAR");
    setDurationMinutes("60");
    setLocationType("at_salon");
    setExpirationDays("7");
    setNotes("");
    setPreferredStartAt("");
    setImageUrls([]);
    setServiceCategoryId(null);
    setStaffId(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#FF0077]" />
            Send Custom Offer to {customerName || "Customer"}
          </DialogTitle>
          <DialogDescription>
            Create a personalized service offer for this customer. The offer will be sent as a message in your conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Quick Templates */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Quick Templates</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickTemplate("Wedding Package")}
                className="rounded-full text-xs"
              >
                Wedding Package
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickTemplate("Special Occasion")}
                className="rounded-full text-xs"
              >
                Special Occasion
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickTemplate("Package Deal")}
                className="rounded-full text-xs"
              >
                Package Deal
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickTemplate("Group Booking")}
                className="rounded-full text-xs"
              >
                Group Booking
              </Button>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-semibold flex items-center gap-2">
              Service Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the service you're offering. Include details about what's included, style preferences, special features, etc."
              rows={5}
              className="resize-none"
            />
            <p className="text-xs text-gray-500">
              {description.trim().length} / 10-4000 characters
            </p>
          </div>

          {/* Price and Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price" className="text-sm font-semibold">
                Price <span className="text-red-500">*</span>
              </Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency" className="text-sm font-semibold">
                Currency <span className="text-red-500">*</span>
              </Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZAR">ZAR (South African Rand)</SelectItem>
                  <SelectItem value="USD">USD (US Dollar)</SelectItem>
                  <SelectItem value="EUR">EUR (Euro)</SelectItem>
                  <SelectItem value="GBP">GBP (British Pound)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration and Location */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration" className="text-sm font-semibold">
                Duration (minutes) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="duration"
                type="number"
                min="15"
                max="480"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="60"
              />
              <p className="text-xs text-gray-500">15-480 minutes (1-8 hours)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location" className="text-sm font-semibold">
                Location Type <span className="text-red-500">*</span>
              </Label>
              <Select value={locationType} onValueChange={(value: "at_home" | "at_salon") => setLocationType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="at_salon">At Salon</SelectItem>
                  <SelectItem value="at_home">At Home</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Expiration and Preferred Start */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expiration" className="text-sm font-semibold">
                Offer Expires In (days) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="expiration"
                type="number"
                min="1"
                max="30"
                value={expirationDays}
                onChange={(e) => setExpirationDays(e.target.value)}
                placeholder="7"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredStart" className="text-sm font-semibold">
                Preferred Start Date (optional)
              </Label>
              <Input
                id="preferredStart"
                type="datetime-local"
                value={preferredStartAt}
                onChange={(e) => setPreferredStartAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
          </div>

          {/* Service Category (optional) */}
          {categories.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="category" className="text-sm font-semibold">
                Service Category (optional)
              </Label>
              <Select value={serviceCategoryId || ""} onValueChange={(value) => setServiceCategoryId(value || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Staff Assignment (optional) */}
          {staffMembers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="staff" className="text-sm font-semibold">
                Assign to Staff Member (optional)
              </Label>
              <Select value={staffId || ""} onValueChange={(value) => setStaffId(value || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a staff member (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No specific assignment</SelectItem>
                  {staffMembers.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                If assigned, this staff member will be assigned to the booking when the offer is accepted
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-semibold">
              Additional Notes (optional)
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information, terms, or special conditions..."
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-gray-500">Max 4000 characters</p>
          </div>

          {/* Image Upload (optional) */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Inspiration Images (optional)</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="flex flex-col items-center justify-center gap-2">
                <Upload className="w-8 h-8 text-gray-400" />
                <p className="text-sm text-gray-500">Image upload coming soon</p>
                <p className="text-xs text-gray-400">Max 6 images</p>
              </div>
            </div>
            {imageUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {imageUrls.map((url, index) => (
                  <div key={index} className="relative">
                    <img src={url} alt={`Preview ${index + 1}`} className="w-full h-24 object-cover rounded" />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid() || isSubmitting}
            className="bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white"
          >
            {isSubmitting ? "Sending..." : "Send Offer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
