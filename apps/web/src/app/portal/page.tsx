"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Calendar, Mail, ArrowRight } from "lucide-react";

export default function PortalLandingPage() {
  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full text-center">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-[#FF0077]/10 p-4">
              <Calendar className="h-12 w-12 text-[#FF0077]" />
            </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Booking Portal
          </h1>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Access your booking details, reschedule, or cancel appointments using
            the secure link sent to your email or SMS.
          </p>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 text-left mb-8">
            <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#FF0077]" />
              How to access your booking
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              After you make a booking, we send a confirmation email and/or SMS
              with a personalized link. Click that link to:
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-[#FF0077] mt-0.5">•</span>
                View your booking details
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FF0077] mt-0.5">•</span>
                Reschedule to a different date or time
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FF0077] mt-0.5">•</span>
                Cancel your appointment if needed
              </li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild className="bg-[#FF0077] hover:bg-[#D60565]">
              <Link href="/" className="flex items-center gap-2">
                Go to Homepage
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/account-settings/bookings">
                Log in to view bookings
              </Link>
            </Button>
          </div>

          <p className="text-xs text-gray-500 mt-6">
            Don&apos;t have your link?{" "}
            <Link
              href="/account-settings"
              className="text-[#FF0077] hover:underline"
            >
              Log in
            </Link>{" "}
            to view all your bookings in your account.
          </p>
        </div>
      </main>
    </div>
  );
}
