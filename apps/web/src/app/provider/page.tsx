"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Building2, Calendar, DollarSign, Users, Sparkles } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";

export default function ProviderPage() {
  const router = useRouter();
  const { user, role, isLoading, refreshUser } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<"login" | "signup">("login");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Redirect if already logged in as provider
  useEffect(() => {
    if (!isLoading && user && (role === "provider_owner" || role === "provider_staff")) {
      const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
      if (!currentPath.startsWith("/provider/dashboard") && (currentPath === "/provider" || !currentPath.startsWith("/provider/"))) {
        router.push("/provider/dashboard");
      }
    }
  }, [user, role, isLoading, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <LoadingTimeout loadingMessage="Loading..." timeoutMs={5000} />
      </div>
    );
  }

  // If user is logged in but not a provider, show message
  if (user && role !== "provider_owner" && role !== "provider_staff") {
    const handleRefresh = async () => {
      setIsRefreshing(true);
      try {
        await refreshUser();
        // Wait a moment for state to update
        setTimeout(() => {
          setIsRefreshing(false);
        }, 1000);
      } catch (error) {
        console.error("Error refreshing user:", error);
        setIsRefreshing(false);
      }
    };

    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-3xl font-bold mb-4">Provider Access Required</h1>
            <p className="text-gray-600 mb-4">
              You need a provider account to access this area. Please contact support to upgrade your account.
            </p>
            {/* Debug information */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mb-6 p-4 bg-gray-100 rounded-lg text-left">
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Debug Info:</strong>
                </p>
                <p className="text-sm text-gray-600">
                  <strong>User ID:</strong> {user.id}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Detected Role:</strong> {role || "null"} {role === "customer" && "(default)"}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Email:</strong> {user.email}
                </p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={handleRefresh} 
                variant="outline"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Account Data"}
              </Button>
              <Button onClick={() => router.push("/")} variant="outline">
                Go to Home
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              If you believe you should have provider access, try clicking "Refresh Account Data" above, 
              or contact support with your user ID: {user.id}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show login/signup page for unauthenticated users
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/images/logo.svg"
                alt="Beautonomi"
                width={150}
                height={40}
                className="h-8 w-auto"
              />
            </Link>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => {
                  setInitialMode("login");
                  setIsLoginModalOpen(true);
                }}
              >
                Sign In
              </Button>
              <Button
                onClick={() => {
                  setInitialMode("signup");
                  setIsLoginModalOpen(true);
                }}
                className="bg-gradient-to-r from-[#FF0077] to-[#D60565]"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Side - Content */}
            <div className="space-y-8">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                  Grow Your Beauty Business
                </h1>
                <p className="text-xl text-gray-600 mb-8">
                  Join thousands of beauty professionals who are growing their business with Beautonomi.
                </p>
              </div>

              {/* Features */}
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-pink-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">Smart Booking System</h3>
                    <p className="text-gray-600">
                      Manage appointments, availability, and client bookings all in one place.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">Increase Revenue</h3>
                    <p className="text-gray-600">
                      Reach more customers and grow your business with our powerful platform.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">Client Management</h3>
                    <p className="text-gray-600">
                      Keep track of your clients, their preferences, and booking history.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">Professional Tools</h3>
                    <p className="text-gray-600">
                      Access analytics, marketing tools, and business insights to grow faster.
                    </p>
                  </div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button
                  size="lg"
                  onClick={() => {
                    setInitialMode("signup");
                    setIsLoginModalOpen(true);
                  }}
                  className="bg-gradient-to-r from-[#FF0077] to-[#D60565] text-white hover:opacity-90"
                >
                  <Building2 className="w-5 h-5 mr-2" />
                  Create Provider Account
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setInitialMode("login");
                    setIsLoginModalOpen(true);
                  }}
                >
                  Sign In to Your Account
                </Button>
              </div>
            </div>

            {/* Right Side - Visual/Illustration */}
            <div className="hidden md:block">
              <div className="relative">
                <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Provider Dashboard</h3>
                        <p className="text-sm text-gray-500">Manage everything from one place</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-pink-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-pink-600">1,234</div>
                        <div className="text-sm text-gray-600">Total Bookings</div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-purple-600">R45,678</div>
                        <div className="text-sm text-gray-600">Revenue</div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600">4.8</div>
                        <div className="text-sm text-gray-600">Rating</div>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-yellow-600">89%</div>
                        <div className="text-sm text-gray-600">Satisfaction</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode={initialMode}
        redirectContext="provider"
      />
    </div>
  );
}
