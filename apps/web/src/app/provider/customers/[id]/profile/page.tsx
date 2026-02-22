"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Mail, Phone, MapPin, GraduationCap, Briefcase, Languages, Calendar, Heart, Music, Lightbulb, Wand2, BookOpen, Clock, PawPrint, Star } from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";
import RoleGuard from "@/components/auth/RoleGuard";
import Breadcrumb from "@/components/ui/breadcrumb";

interface CustomerProfileData {
  customer: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
    phone?: string;
    created_at: string;
    rating_average?: number;
    review_count?: number;
  };
  profile: {
    about?: string;
    school?: string;
    work?: string;
    location?: string;
    languages?: string[];
    decade_born?: string;
    favorite_song?: string;
    obsessed_with?: string;
    fun_fact?: string;
    useless_skill?: string;
    biography_title?: string;
    spend_time?: string;
    pets?: string;
    interests?: string[];
  } | null;
  bookings: Array<{
    id: string;
    booking_number: string;
    status: string;
    scheduled_at: string;
    total_amount: number;
    currency: string;
    created_at: string;
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    comment?: string;
    created_at: string;
  }>;
}

export default function CustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const [profileData, setProfileData] = useState<CustomerProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customerId) {
      loadProfile();
    }
  }, [customerId]);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: CustomerProfileData }>(
        `/api/provider/customers/${customerId}/profile`
      );
      setProfileData(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load customer profile";
      setError(errorMessage);
      console.error("Error loading customer profile:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["provider_owner", "provider_staff", "superadmin"]}>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
            <LoadingTimeout loadingMessage="Loading customer profile..." />
          </div>
        </div>
      </RoleGuard>
    );
  }

  if (error || !profileData) {
    return (
      <RoleGuard allowedRoles={["provider_owner", "provider_staff", "superadmin"]}>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">{error || "Customer profile not found"}</p>
              <Button onClick={() => router.back()} variant="outline">
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </RoleGuard>
    );
  }

  const { customer, profile, bookings, reviews } = profileData;
  const memberSince = customer.created_at ? format(new Date(customer.created_at), "MMMM yyyy") : null;

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff", "superadmin"]}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
          <Breadcrumb
            items={[
              { label: "Provider Portal", href: "/provider/dashboard" },
              { label: "Customers", href: "/provider/messaging" },
              { label: customer.full_name || "Customer Profile" },
            ]}
          />

          <div className="mt-6">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            {/* Customer Header */}
            <div className="bg-white rounded-2xl shadow-sm border p-6 md:p-8 mb-6">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                <div className="relative">
                  {customer.avatar_url ? (
                    <Image
                      src={customer.avatar_url}
                      alt={customer.full_name}
                      width={120}
                      height={120}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-30 h-30 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="h-16 w-16 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {customer.full_name || "Customer"}
                  </h1>
                  {memberSince && (
                    <p className="text-sm text-gray-500 mb-4">
                      Member since {memberSince}
                    </p>
                  )}
                  {customer.rating_average !== undefined && customer.rating_average > 0 && (
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                        <span className="text-lg font-semibold">
                          {customer.rating_average.toFixed(1)}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">
                        ({customer.review_count || 0} {customer.review_count === 1 ? 'review' : 'reviews'})
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm">
                    {customer.email && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail className="h-4 w-4" />
                        <span>{customer.email}</span>
                      </div>
                    )}
                    {customer.phone && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="h-4 w-4" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* About Section */}
            {profile?.about && (
              <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">About</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{profile.about}</p>
              </div>
            )}

            {/* Profile Information */}
            <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Profile Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profile?.school && (
                  <div className="flex items-start gap-3">
                    <GraduationCap className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">School</p>
                      <p className="text-gray-900">{profile.school}</p>
                    </div>
                  </div>
                )}
                {profile?.work && (
                  <div className="flex items-start gap-3">
                    <Briefcase className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Work</p>
                      <p className="text-gray-900">{profile.work}</p>
                    </div>
                  </div>
                )}
                {profile?.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Location</p>
                      <p className="text-gray-900">{profile.location}</p>
                    </div>
                  </div>
                )}
                {profile?.languages && profile.languages.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Languages className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Languages</p>
                      <p className="text-gray-900">{profile.languages.join(", ")}</p>
                    </div>
                  </div>
                )}
                {profile?.decade_born && (
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Decade Born</p>
                      <p className="text-gray-900">{profile.decade_born}</p>
                    </div>
                  </div>
                )}
                {profile?.favorite_song && (
                  <div className="flex items-start gap-3">
                    <Music className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Favorite Song</p>
                      <p className="text-gray-900">{profile.favorite_song}</p>
                    </div>
                  </div>
                )}
                {profile?.obsessed_with && (
                  <div className="flex items-start gap-3">
                    <Heart className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Obsessed With</p>
                      <p className="text-gray-900">{profile.obsessed_with}</p>
                    </div>
                  </div>
                )}
                {profile?.fun_fact && (
                  <div className="flex items-start gap-3">
                    <Lightbulb className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Fun Fact</p>
                      <p className="text-gray-900">{profile.fun_fact}</p>
                    </div>
                  </div>
                )}
                {profile?.useless_skill && (
                  <div className="flex items-start gap-3">
                    <Wand2 className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Useless Skill</p>
                      <p className="text-gray-900">{profile.useless_skill}</p>
                    </div>
                  </div>
                )}
                {profile?.biography_title && (
                  <div className="flex items-start gap-3">
                    <BookOpen className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Biography Title</p>
                      <p className="text-gray-900">{profile.biography_title}</p>
                    </div>
                  </div>
                )}
                {profile?.spend_time && (
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Spends Time</p>
                      <p className="text-gray-900">{profile.spend_time}</p>
                    </div>
                  </div>
                )}
                {profile?.pets && (
                  <div className="flex items-start gap-3">
                    <PawPrint className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Pets</p>
                      <p className="text-gray-900">{profile.pets}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Interests */}
              {profile?.interests && profile.interests.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <p className="text-sm font-medium text-gray-500 mb-3">Interests</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.interests.map((interest, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Booking History */}
            {bookings.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Booking History ({bookings.length})
                </h2>
                <div className="space-y-3">
                  {bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          Booking #{booking.booking_number}
                        </p>
                        <p className="text-sm text-gray-500">
                          {format(new Date(booking.scheduled_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-gray-900">
                          {booking.currency} {booking.total_amount.toFixed(2)}
                        </p>
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          booking.status === 'completed' ? 'bg-green-100 text-green-800' :
                          booking.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                          booking.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {booking.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            {reviews.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Reviews Left ({reviews.length})
                </h2>
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="border-b last:border-b-0 pb-4 last:pb-0">
                      <div className="flex items-center gap-2 mb-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= review.rating
                                ? "text-yellow-400 fill-yellow-400"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                        <span className="text-sm text-gray-500 ml-2">
                          {format(new Date(review.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="text-gray-700">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
