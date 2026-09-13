"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  PersonStanding,
  Clock,
  User,
  Scissors,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { toast } from "sonner";
import { format } from "date-fns";
import type { TeamMember, ServiceCategory } from "@/lib/provider-portal/types";
import { snapToIncrement, formatTime12h } from "@/lib/scheduling/mangomintAdapter";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { useTranslation } from "@beautonomi/i18n";

interface WalkInButtonProps {
  className?: string;
  /** Team members for the full dialog mode */
  teamMembers?: TeamMember[];
  /** Services for the full dialog mode */
  services?: ServiceCategory[];
  /** Default staff ID for the full dialog mode */
  defaultStaffId?: string;
  /** Callback for full dialog mode - creates a walk-in appointment */
  onCreateWalkIn?: (data: WalkInData) => Promise<void>;
  /** Simple mode - just trigger this onClick (bypasses dialog) */
  onClick?: () => void;
  variant?: "default" | "compact";
}

export interface WalkInData {
  clientName: string;
  clientPhone?: string;
  staffId: string;
  serviceId: string;
  serviceName: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  price: number;
  addToWaitingRoom: boolean;
  notes?: string;
}

/**
 * Walk-in Quick Booking Button
 * 
 * Opens a streamlined dialog for quickly adding walk-in clients.
 * Designed for front-desk workflow efficiency.
 */
export function WalkInButton({
  className,
  teamMembers = [],
  services = [],
  defaultStaffId,
  onCreateWalkIn,
  onClick,
  variant = "default",
}: WalkInButtonProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Simple mode: just render button with onClick
  const isSimpleMode = !!onClick && !onCreateWalkIn;
  
  // Form state
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [staffId, setStaffId] = useState(defaultStaffId || teamMembers[0]?.id || "");
  const [serviceId, setServiceId] = useState("");
  const [addToWaitingRoom, setAddToWaitingRoom] = useState(true);
  const [notes, setNotes] = useState("");
  
  // Get current time snapped to 15-minute increment
  const now = new Date();
  const currentTime = snapToIncrement(
    `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`,
    15
  );
  
  // Find selected service details
  const selectedService = services
    .flatMap(cat => cat.services)
    .find(s => s.id === serviceId);
  
  // Reset form when dialog closes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setClientName("");
      setClientPhone("");
      setStaffId(defaultStaffId || teamMembers[0]?.id || "");
      setServiceId("");
      setAddToWaitingRoom(true);
      setNotes("");
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!clientName.trim() || !staffId || !serviceId || !selectedService || !onCreateWalkIn) {
      return;
    }

    if (clientPhone.trim() && !isCompleteE164(clientPhone)) {
      toast.error(t("web.calendar.walkInButton.invalidPhone"));
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await onCreateWalkIn({
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim() || undefined,
        staffId,
        serviceId,
        serviceName: selectedService.name,
        scheduledDate: format(now, "yyyy-MM-dd"),
        scheduledTime: currentTime,
        durationMinutes: selectedService.duration_minutes,
        price: selectedService.price,
        addToWaitingRoom,
        notes: notes.trim() || undefined,
      });
      
      handleOpenChange(false);
    } catch (error) {
      console.error("Failed to create walk-in:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Simple mode: just return the button with onClick handler
  if (isSimpleMode) {
    return (
      <Button
        variant="outline"
        size={variant === "compact" ? "sm" : "default"}
        className={cn(
          "gap-2 bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:text-amber-800",
          className
        )}
        onClick={onClick}
      >
        <PersonStanding className={cn("w-4 h-4", variant === "compact" && "w-3.5 h-3.5")} />
        <span className={variant === "compact" ? "hidden sm:inline" : ""}>{t("web.calendar.walkInButton.walkIn")}</span>
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size={variant === "compact" ? "sm" : "default"}
        className={cn(
          "gap-2 bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:text-amber-800",
          className
        )}
        onClick={() => setIsOpen(true)}
      >
        <PersonStanding className={cn("w-4 h-4", variant === "compact" && "w-3.5 h-3.5")} />
        <span className={variant === "compact" ? "hidden sm:inline" : ""}>{t("web.calendar.walkInButton.walkIn")}</span>
      </Button>
      
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <PersonStanding className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <DialogTitle>{t("web.calendar.walkInButton.addWalkIn")}</DialogTitle>
                <DialogDescription>
                  {t("web.calendar.walkInButton.quickBooking")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {/* Time Badge */}
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">
                {t("web.calendar.walkInButton.startingAt")}{" "}
                <span className="font-semibold">{formatTime12h(currentTime)}</span>
              </span>
              <Badge variant="outline" className="ms-auto text-xs">
                {t("web.calendar.walkInButton.today")}
              </Badge>
            </div>
            
            {/* Client Name */}
            <div className="space-y-2">
              <Label htmlFor="client-name">
                <User className="w-3.5 h-3.5 inline me-1" />
                {t("web.calendar.walkInButton.clientNameRequired")}
              </Label>
              <Input
                id="client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={t("web.calendar.walkInButton.enterClientName")}
                required
                autoFocus
              />
            </div>
            
            {/* Client Phone (Optional) */}
            <div className="space-y-2">
              <PhoneInput
                inputId="calendar-walk-in-client-phone"
                label={t("web.calendar.walkInButton.phoneOptional")}
                value={clientPhone}
                onChange={setClientPhone}
                placeholder={t("web.calendar.walkInButton.phonePlaceholder")}
              />
            </div>
            
            <Separator />
            
            {/* Service Selection */}
            <div className="space-y-2">
              <Label>
                <Scissors className="w-3.5 h-3.5 inline me-1" />
                {t("web.calendar.walkInButton.serviceRequired")}
              </Label>
              <Select value={serviceId} onValueChange={setServiceId} required>
                <SelectTrigger>
                  <SelectValue placeholder={t("web.calendar.walkInButton.selectService")} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {services.map((category) => (
                    <React.Fragment key={category.id}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                        {category.name}
                      </div>
                      {category.services.filter(s => s.is_active).map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          <div className="flex justify-between w-full">
                            <span>{service.name}</span>
                            <span className="text-muted-foreground ms-2">
                              {t("web.calendar.walkInButton.durationPrice", {
                                price: formatMoney(Number(service.price)),
                                minutes: service.duration_minutes,
                              })}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedService && (
                <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                  <span>{t("web.calendar.walkInButton.durationMinutes", { count: selectedService.duration_minutes })}</span>
                  <span className="font-medium text-foreground">
                    {formatMoney(Number(selectedService.price))}
                  </span>
                </div>
              )}
            </div>
            
            {/* Staff Selection */}
            <div className="space-y-2">
              <Label>{t("web.calendar.walkInButton.staffMemberRequired")}</Label>
              <Select value={staffId} onValueChange={setStaffId} required>
                <SelectTrigger>
                  <SelectValue placeholder={t("web.calendar.walkInButton.selectStaff")} />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.filter(m => m.is_active).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Separator />
            
            {/* Add to Waiting Room */}
            <div className="flex items-start space-x-3">
              <Checkbox
                id="add-to-waiting"
                checked={addToWaitingRoom}
                onCheckedChange={(checked) => setAddToWaitingRoom(!!checked)}
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="add-to-waiting"
                  className="text-sm font-normal cursor-pointer"
                >
                  {t("web.calendar.walkInButton.addToWaitingRoom")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("web.calendar.walkInButton.waitingRoomHint")}
                </p>
              </div>
            </div>
            
            {/* Notes (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="notes">{t("web.calendar.walkInButton.notesOptional")}</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("web.calendar.walkInButton.notesPlaceholder")}
              />
            </div>
            
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t("web.calendar.walkInButton.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !clientName.trim() || !staffId || !serviceId}
                className="bg-[#FF0077] hover:bg-[#D60565]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    {t("web.calendar.walkInButton.creating")}
                  </>
                ) : (
                  <>
                    <PersonStanding className="w-4 h-4 me-2" />
                    {t("web.calendar.walkInButton.addWalkIn")}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default WalkInButton;
