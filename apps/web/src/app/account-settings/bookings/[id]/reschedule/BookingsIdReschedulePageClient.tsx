"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";
import type { Booking } from "@/types/beautonomi";
import { toast } from "sonner";
import AvailabilityCalendar from "@/app/checkout/components/availability-calendar";
import { useTranslation } from "@beautonomi/i18n";
import BackButton from "../../../components/back-button";
import Breadcrumb from "../../../components/breadcrumb";
import { getDefaultMoneyLocale } from "@beautonomi/utils";

export default function RescheduleBookingPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [providerSlug, setProviderSlug] = useState<string | undefined>();
  const [selectedDateTime, setSelectedDateTime] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyHoursBefore, setPolicyHoursBefore] = useState<number | null>(null);

  useEffect(() => {
    const loadBooking = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetcher.get<{
          data: Booking & { provider?: { slug?: string } };
          error: null;
        }>(`/api/me/bookings/${bookingId}`, { cache: "no-store" });

        setBooking(response.data);
        if (response.data.provider?.slug) {
          setProviderSlug(response.data.provider.slug);
        }
        if (response.data.scheduled_at) {
          setSelectedDateTime(new Date(response.data.scheduled_at));
        }
        if (response.data.provider_id) {
          try {
            const policyRes = await fetcher.get<{ data?: Array<{ hours_before_cutoff?: number }> }>(
              `/api/public/cancellation-policy?provider_id=${response.data.provider_id}&location_type=${response.data.location_type || "at_salon"}`,
            );
            const hours = policyRes.data?.[0]?.hours_before_cutoff;
            if (hours != null) setPolicyHoursBefore(Number(hours));
          } catch {
            setPolicyHoursBefore(24);
          }
        }
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? t("web.accountSettings.reschedule.timeout")
            : err instanceof FetchError
            ? err.message
            : t("web.accountSettings.reschedule.loadFailed");
        setError(errorMessage);
        console.error("Error loading booking:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (bookingId) {
      loadBooking();
    }
  }, [bookingId]);

  const handleReschedule = async () => {
    if (!selectedDateTime || !booking) {
      toast.error(t("web.accountSettings.reschedule.selectDateTime"));
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetcher.post<{
        data: { booking: Booking; requires_confirmation: boolean };
        error: null;
      }>(`/api/me/bookings/${bookingId}/reschedule`, {
        new_datetime: selectedDateTime.toISOString(),
        reason: "Customer request",
      });

      toast.success(
        response.data.requires_confirmation
          ? t("web.accountSettings.reschedule.submittedPending")
          : t("web.accountSettings.reschedule.success")
      );
      router.push(`/account-settings/bookings/${bookingId}`);
    } catch (err) {
      const errorMessage =
        err instanceof FetchError ? err.message : t("web.accountSettings.reschedule.failed");
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage={t("web.accountSettings.reschedule.loading")} />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title={t("web.accountSettings.reschedule.notFoundTitle")}
          description={error || t("web.accountSettings.reschedule.notFoundDescription")}
          action={{
            label: t("web.accountSettings.bookings.goBack"),
            onClick: () => router.push("/account-settings/bookings"),
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:px-8 py-4 md:py-6 lg:py-8">
      <BackButton href={`/account-settings/bookings/${bookingId}`} label={t("web.accountSettings.reschedule.backToBooking")} />
      <Breadcrumb 
        items={[
          { label: t("web.accountSettings.bookings.breadcrumbAccount"), href: "/account-settings" },
          { label: t("web.accountSettings.bookings.breadcrumbBookings"), href: "/account-settings/bookings" },
          { label: t("web.accountSettings.bookings.bookingNumber", { number: booking.booking_number }), href: `/account-settings/bookings/${bookingId}` },
          { label: t("web.accountSettings.reschedule.breadcrumbReschedule") }
        ]} 
      />

      <h1 className="text-2xl md:text-3xl font-semibold mb-4 md:mb-6 text-gray-900">{t("web.accountSettings.reschedule.title")}</h1>

      {/* Current Booking Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">{t("web.accountSettings.reschedule.currentAppointment")}</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-600">{t("web.accountSettings.bookings.date")}</p>
              <p className="font-medium">
                {new Date(booking.scheduled_at).toLocaleDateString(getDefaultMoneyLocale(), {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-600">{t("web.accountSettings.bookings.time")}</p>
              <p className="font-medium">
                {new Date(booking.scheduled_at).toLocaleTimeString(getDefaultMoneyLocale(), {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* New Date/Time Selection */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">{t("web.accountSettings.reschedule.selectNewDateTime")}</h2>
        {policyHoursBefore != null && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-md p-3 mb-4">
            {t("customer.mobile.screens.bookingDetail.reschedulePolicyNote", {
              hours: policyHoursBefore,
            })}
          </p>
        )}
        <AvailabilityCalendar
          selectedProfessional={booking.services?.[0]?.staff_id || undefined}
          providerSlug={providerSlug}
          serviceId={booking.services?.[0]?.offering_id || undefined}
          serviceIds={
            booking.services && booking.services.length > 0
              ? booking.services.map((s: any) => s.offering_id).filter(Boolean).join(",")
              : undefined
          }
          staffId={booking.services?.[0]?.staff_id || undefined}
          locationId={(booking as any).location_id || undefined}
          durationMinutes={
            booking.services?.reduce(
              (sum: number, s: any) => sum + (s.duration_minutes || 60),
              0
            ) || 60
          }
          bufferMinutes={
            booking.services?.reduce(
              (max: number, s: any) => Math.max(max, s.buffer_minutes || 0),
              0
            ) || 0
          }
          locationType={(booking as any).location_type || undefined}
          excludeBookingId={bookingId}
          onDateTimeSelection={(dateTime) => {
            setSelectedDateTime(dateTime);
          }}
        />
        {selectedDateTime && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">{t("web.accountSettings.reschedule.selectedTime")}</p>
            <p className="font-medium">
              {t("web.accountSettings.reschedule.selectedDateTime", {
                date: selectedDateTime.toLocaleDateString(getDefaultMoneyLocale(), {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
                time: selectedDateTime.toLocaleTimeString(getDefaultMoneyLocale(), {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                }),
              })}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
        <Button
          variant="outline"
          onClick={() => router.push(`/account-settings/bookings/${bookingId}`)}
          className="w-full sm:flex-1"
        >
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleReschedule}
          disabled={!selectedDateTime || isSubmitting}
          className="w-full sm:flex-1 bg-gray-900 text-white hover:bg-gray-800"
        >
          {isSubmitting ? t("web.accountSettings.reschedule.rescheduling") : t("web.accountSettings.reschedule.confirmReschedule")}
        </Button>
      </div>
      </div>
  );
}
