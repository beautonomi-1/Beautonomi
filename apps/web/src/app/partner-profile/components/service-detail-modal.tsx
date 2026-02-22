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
  service: {
    id: string;
    title: string;
    description?: string | null;
    duration: string;
    price: string;
    category?: string;
    supports_at_home?: boolean;
    supports_at_salon?: boolean;
  };
  providerSlug?: string;
  isOpen: boolean;
  onClose: () => void;
  onBook: () => void;
}

export default function ServiceDetailModal({
  service,
  providerSlug,
  isOpen,
  onClose,
  onBook,
}: ServiceDetailModalProps) {
  const createBookingUrl = () => {
    const serviceData = {
      title: service.title,
      duration: service.duration,
      price: service.price,
      category: service.category,
    };
    const _encoded = encodeURIComponent(JSON.stringify(serviceData));
    return `/booking?serviceId=${service.id}&partnerId=${providerSlug}&slug=${providerSlug}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white text-gray-900">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">{service.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-gray-600">
              <Clock className="w-4 h-4" />
              {service.duration}
            </span>
            <span className="text-lg font-semibold text-gray-900">{service.price}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Description */}
          {service.description ? (
            <div>
              <h3 className="font-medium mb-2">About this service</h3>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {service.description}
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 italic">
                No description available for this service.
              </p>
            </div>
          )}

          {/* Service Details */}
          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">Service Details</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">Duration: {service.duration}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">Price: {service.price}</span>
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

          {/* What's Included */}
          {service.description && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">What's Included</h3>
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
            <Button
              onClick={onBook}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white"
            >
              Book This Service
            </Button>
          </Link>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
