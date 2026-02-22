"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Lock, Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import Link from "next/link";
import { format } from "date-fns";

interface Booking {
  id: string;
  booking_number: string;
  scheduled_at: string;
  status: string;
  booking_services?: Array<{
    service_name?: string;
    offering_name?: string;
    offering?: {
      title?: string;
      master_service?: { name?: string };
    };
  }>;
}

interface ServicesBookedSectionProps {
  bookings: Booking[];
  isPublic: boolean;
  onUpdate?: () => void;
}

export default function ServicesBookedSection({
  bookings = [],
  isPublic = false,
  onUpdate,
}: ServicesBookedSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [_pendingValue, setPendingValue] = useState(isPublic);

  const handleToggleChange = (checked: boolean) => {
    if (checked && !isPublic) {
      // Switching to public - show confirmation
      setPendingValue(true);
      setShowConfirmation(true);
    } else {
      // Switching to private - no confirmation needed
      handleSavePrivacy(checked);
    }
  };

  const handleSavePrivacy = async (value: boolean) => {
    setIsSaving(true);
    try {
      await fetcher.patch("/api/me/privacy-settings", {
        services_booked_visible: value,
      });
      toast.success("Privacy settings updated");
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to update privacy settings");
    } finally {
      setIsSaving(false);
      setShowConfirmation(false);
    }
  };

  const handleConfirmPublic = () => {
    handleSavePrivacy(true);
  };

  const upcomingBookings = bookings
    .filter((b) => {
      const scheduled = new Date(b.scheduled_at);
      return scheduled >= new Date() && b.status !== "cancelled";
    })
    .slice(0, 3);

  return (
    <>
      <Card className="w-full bg-white border border-gray-200 shadow-sm">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-gray-900">
                  Services Booked
                </CardTitle>
                {isOpen ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden transition-all duration-300 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <CardContent className="pt-4 bg-white space-y-4">
              {/* Privacy Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  {isPublic ? (
                    <Globe className="h-5 w-5 text-gray-600" />
                  ) : (
                    <Lock className="h-5 w-5 text-gray-600" />
                  )}
                  <div>
                    <Label htmlFor="privacy-toggle" className="text-sm font-medium text-gray-900">
                      Show booking history to providers
                    </Label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Providers can see your booking history to understand your preferences
                    </p>
                  </div>
                </div>
                <Switch
                  id="privacy-toggle"
                  checked={isPublic}
                  onCheckedChange={handleToggleChange}
                  disabled={isSaving}
                />
              </div>

              {/* Bookings Preview */}
              {isPublic && (
                <>
                  {upcomingBookings.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-900">
                          Upcoming Bookings
                        </h4>
                        <Link
                          href="/account-settings/bookings"
                          className="text-xs text-[#FF0077] hover:underline"
                        >
                          View all
                        </Link>
                      </div>
                      {upcomingBookings.map((booking) => {
                        const firstService = booking.booking_services?.[0];
                        const serviceName =
                          firstService?.service_name ||
                          firstService?.offering_name ||
                          firstService?.offering?.title ||
                          firstService?.offering?.master_service?.name ||
                          "Service";
                        const scheduledDate = new Date(booking.scheduled_at);

                        return (
                          <div
                            key={booking.id}
                            className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {serviceName}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {format(scheduledDate, "MMM d, yyyy 'at' h:mm a")}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  Booking #{booking.booking_number}
                                </p>
                              </div>
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full capitalize ml-2">
                                {booking.status}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No upcoming bookings</p>
                      <Link
                        href="/search"
                        className="text-xs text-[#FF0077] hover:underline mt-2 inline-block"
                      >
                        Browse services
                      </Link>
                    </div>
                  )}
                </>
              )}

              {!isPublic && (
                <div className="text-center py-8 text-gray-500">
                  <Lock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">Your bookings are private</p>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Make booking history public?</AlertDialogTitle>
            <AlertDialogDescription>
              Providers will be able to see your booking history. This helps them understand
              your preferences and provide better service. You can change this setting anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConfirmation(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPublic}
              className="bg-[#FF0077] hover:bg-[#E6006A] text-white"
            >
              Make Public
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
