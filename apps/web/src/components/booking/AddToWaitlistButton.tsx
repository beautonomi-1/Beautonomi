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
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTranslation } from "@beautonomi/i18n";

interface AddToWaitlistButtonProps {
  providerId: string;
  serviceId?: string;
  staffId?: string;
  preferredDate?: Date;
  preferredTimeStart?: string;
  preferredTimeEnd?: string;
  onSuccess?: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export default function AddToWaitlistButton({
  providerId,
  serviceId,
  staffId,
  preferredDate,
  preferredTimeStart,
  preferredTimeEnd,
  onSuccess,
  variant = "outline",
  size = "default",
  className,
}: AddToWaitlistButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    service_id: serviceId || "",
    staff_id: staffId || "",
    preferred_date: preferredDate ? format(preferredDate, "yyyy-MM-dd") : "",
    preferred_time_start: preferredTimeStart || "",
    preferred_time_end: preferredTimeEnd || "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast.error(t("web.booking.addToWaitlist.enterName"));
      return;
    }

    if (!formData.service_id) {
      toast.error(t("web.booking.addToWaitlist.selectService"));
      return;
    }

    if (formData.phone?.trim() && !isCompleteE164(formData.phone)) {
      toast.error(t("web.booking.addToWaitlist.invalidPhone"));
      return;
    }

    setIsSubmitting(true);
    try {
      await fetcher.post("/api/public/waitlist", {
        provider_id: providerId,
        ...formData,
        phone: formData.phone?.trim() || "",
      });

      toast.success(t("web.booking.addToWaitlist.addedSuccess"));
      setIsOpen(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        service_id: serviceId || "",
        staff_id: staffId || "",
        preferred_date: preferredDate ? format(preferredDate, "yyyy-MM-dd") : "",
        preferred_time_start: preferredTimeStart || "",
        preferred_time_end: preferredTimeEnd || "",
        notes: "",
      });
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || t("web.booking.addToWaitlist.addFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsOpen(true)}
        className={className}
      >
        <Clock className="w-4 h-4 me-2" />
        {t("web.booking.addToWaitlist.joinWaitlist")}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("web.booking.addToWaitlist.title")}</DialogTitle>
            <DialogDescription>
              {t("web.booking.addToWaitlist.description")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("web.booking.addToWaitlist.nameRequired")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("web.booking.addToWaitlist.namePlaceholder")}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("web.booking.addToWaitlist.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder={t("web.booking.addToWaitlist.emailPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <PhoneInput
                  inputId="public-waitlist-phone"
                  label={t("web.booking.addToWaitlist.phone")}
                  value={formData.phone}
                  onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                  placeholder={t("web.booking.addToWaitlist.phonePlaceholder")}
                />
              </div>
            </div>

            {!serviceId && (
              <div className="space-y-2">
                <Label htmlFor="service">{t("web.booking.addToWaitlist.serviceRequired")}</Label>
                <Select
                  value={formData.service_id}
                  onValueChange={(value) => setFormData({ ...formData, service_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("web.booking.addToWaitlist.selectAService")} />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Services will be loaded from API */}
                    <SelectItem value="placeholder">{t("web.booking.addToWaitlist.loadingServices")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="preferred_date">{t("web.booking.addToWaitlist.preferredDate")}</Label>
              <Input
                id="preferred_date"
                type="date"
                value={formData.preferred_date}
                onChange={(e) => setFormData({ ...formData, preferred_date: e.target.value })}
                min={format(new Date(), "yyyy-MM-dd")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preferred_time_start">{t("web.booking.addToWaitlist.preferredTimeStart")}</Label>
                <Input
                  id="preferred_time_start"
                  type="time"
                  value={formData.preferred_time_start}
                  onChange={(e) => setFormData({ ...formData, preferred_time_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferred_time_end">{t("web.booking.addToWaitlist.preferredTimeEnd")}</Label>
                <Input
                  id="preferred_time_end"
                  type="time"
                  value={formData.preferred_time_end}
                  onChange={(e) => setFormData({ ...formData, preferred_time_end: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t("web.booking.addToWaitlist.notesOptional")}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t("web.booking.addToWaitlist.notesPlaceholder")}
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="flex-1"
                disabled={isSubmitting}
              >
                {t("web.booking.addToWaitlist.cancel")}
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
                disabled={isSubmitting || !formData.name || !formData.service_id}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    {t("web.booking.addToWaitlist.adding")}
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 me-2" />
                    {t("web.booking.addToWaitlist.joinWaitlist")}
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
