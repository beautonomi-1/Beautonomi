"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, MapPin } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { useTranslation } from "@beautonomi/i18n";

interface CityWaitlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCity?: string;
  countryCode?: string;
  source?: "web" | "customer_app" | "provider_app";
  persona?: "customer" | "provider";
}

export default function CityWaitlistModal({
  open,
  onOpenChange,
  defaultCity = "",
  countryCode = "",
  source = "web",
  persona = "customer",
}: CityWaitlistModalProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    city_name: defaultCity,
    name: user?.full_name || "",
    email: user?.email || "",
    phone: "",
    is_building_owner: false,
    building_address: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.city_name.trim()) {
      toast.error(t("web.global.cityWaitlist.enterCity"));
      return;
    }

    if (!formData.name.trim()) {
      toast.error(t("web.global.cityWaitlist.enterName"));
      return;
    }

    const hasEmail = formData.email?.trim().includes("@");
    const hasPhone = (formData.phone?.trim().length ?? 0) >= 7;
    if (!hasEmail && !hasPhone) {
      toast.error(t("web.global.cityWaitlist.contactRequired") || "Email or phone is required");
      return;
    }

    if (formData.phone?.trim() && !isCompleteE164(formData.phone)) {
      toast.error(t("web.global.cityWaitlist.invalidPhone"));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetcher.post<{ data?: { entry?: { message?: string } } }>(
        "/api/public/city-waitlist",
        {
          ...formData,
          country_code: countryCode || undefined,
          source,
          persona,
        },
      );
      
      toast.success(response?.data?.entry?.message || t("web.global.cityWaitlist.joinedSuccess"));
      onOpenChange(false);
      
      // Reset form
      setFormData({
        city_name: defaultCity,
        name: user?.full_name || "",
        email: user?.email || "",
        phone: "",
        is_building_owner: false,
        building_address: "",
        notes: "",
      });
    } catch (error: any) {
      const errorMessage = error.message || t("web.global.cityWaitlist.joinFailed");
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            {t("web.global.cityWaitlist.title")}
          </DialogTitle>
          <DialogDescription>
            {t("web.global.cityWaitlist.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="city_name">{t("web.global.cityWaitlist.cityNameRequired")}</Label>
            <Input
              id="city_name"
              value={formData.city_name}
              onChange={(e) => setFormData({ ...formData, city_name: e.target.value })}
              placeholder={t("web.global.cityWaitlist.cityPlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">{t("web.global.cityWaitlist.yourNameRequired")}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("web.global.cityWaitlist.fullNamePlaceholder")}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("web.global.cityWaitlist.email")}</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder={t("web.global.cityWaitlist.emailPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <PhoneInput
                inputId="city-waitlist-phone"
                label={t("web.global.cityWaitlist.phone")}
                value={formData.phone}
                onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                placeholder={t("web.global.cityWaitlist.phonePlaceholder")}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_building_owner"
              checked={formData.is_building_owner}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_building_owner: checked === true })
              }
            />
            <Label
              htmlFor="is_building_owner"
              className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {t("web.global.cityWaitlist.buildingOwner")}
            </Label>
          </div>

          {formData.is_building_owner && (
            <div className="space-y-2">
              <Label htmlFor="building_address">{t("web.global.cityWaitlist.buildingAddress")}</Label>
              <Input
                id="building_address"
                value={formData.building_address}
                onChange={(e) => setFormData({ ...formData, building_address: e.target.value })}
                placeholder={t("web.global.cityWaitlist.buildingAddressPlaceholder")}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">{t("web.global.cityWaitlist.notesOptional")}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder={t("web.global.cityWaitlist.notesPlaceholder")}
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isSubmitting}
            >
              {t("web.global.cityWaitlist.cancel")}
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
              disabled={isSubmitting || !formData.city_name.trim() || !formData.name.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  {t("web.global.cityWaitlist.joining")}
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4 me-2" />
                  {t("web.global.cityWaitlist.joinWaitlist")}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
