"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Clock, MapPin, Check } from "lucide-react";

interface ServiceDetailModalProps {
  /** Concrete offering id for ?service= (variant id when the service has variants). */
  offeringIdForBooking?: string;
  service: {
    id: string;
    title: string;
    description?: string | null;
    duration: string;
    price: string;
    category?: string;
    supports_at_home?: boolean;
    supports_at_salon?: boolean;
    /** When the service has variants, list them for transparency */
    variants?: Array<{
      id: string;
      label: string;
      description?: string | null;
      duration_minutes: number;
      priceFormatted: string;
    }>;
  };
  providerSlug?: string;
  isOpen: boolean;
  onClose: () => void;
  onBook: () => void;
}

export default function ServiceDetailModal({
  offeringIdForBooking,
  service,
  providerSlug,
  isOpen,
  onClose,
  onBook,
}: ServiceDetailModalProps) {
  const createBookingUrl = () => {
    if (!providerSlug) return "#";
    const oid =
      offeringIdForBooking?.trim() ||
      (service.variants && service.variants.length > 0 ? service.variants[0]!.id : service.id);
    return `/booking?slug=${encodeURIComponent(providerSlug)}&service=${encodeURIComponent(oid)}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white text-gray-900 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">{service.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-gray-600">
              <Clock className="w-4 h-4" />
              {service.duration}
            </span>
            <span className="text-lg font-semibold text-gray-900">{service.price}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {service.description ? (
            <div>
              <h3 className="font-medium mb-2">About this service</h3>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{service.description}</p>
            </div>
          ) : (
            <div className="bg-gray-50 p-4 rounded-xl">
              <p className="text-sm text-gray-500 italic">No description available for this service.</p>
            </div>
          )}

          {service.variants && service.variants.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">Options</h3>
              <p className="text-sm text-gray-600 mb-3">
                This service is offered in multiple options. Choose one when you book — each may differ in time and price.
              </p>
              <ul className="space-y-3">
                {service.variants.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-sm"
                  >
                    <div className="font-semibold text-gray-900">{v.label}</div>
                    {v.description && <p className="text-gray-600 mt-1 text-xs">{v.description}</p>}
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {v.duration_minutes} min
                      </span>
                      <span className="font-medium text-gray-900">{v.priceFormatted}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">Service details</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">Duration: {service.duration}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">From / base price: {service.price}</span>
              </div>
              {(service.supports_at_home || service.supports_at_salon) && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Available:{" "}
                    {service.supports_at_salon && "At Salon"}
                    {service.supports_at_salon && service.supports_at_home && " • "}
                    {service.supports_at_home && "At Home"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {service.description && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">What&apos;s included</h3>
              <ul className="space-y-2">
                {service.description
                  .split("\n")
                  .filter((line) => line.trim().length > 0)
                  .slice(0, 5)
                  .map((line, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{line.trim()}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-6 border-t mt-6">
          <Link href={createBookingUrl()} className="flex-1">
            <Button onClick={onBook} className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-full h-12">
              Book this service
            </Button>
          </Link>
          <Button variant="outline" onClick={onClose} className="rounded-full h-12 px-6">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
