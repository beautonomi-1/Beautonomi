"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExplorePostForm } from "@/components/provider/ExplorePostForm";
import RoleGuard from "@/components/auth/RoleGuard";
import { ChevronLeft } from "lucide-react";

export default function ProviderExploreNewPage() {
  const router = useRouter();

  return (
    <RoleGuard
      allowedRoles={["provider_owner", "provider_staff"]}
      redirectTo="/provider/dashboard"
      showLoading={false}
    >
      <div className="min-h-screen bg-white">
        {/* Minimal header - Instagram/TikTok style */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <Link
            href="/provider/explore"
            className="flex items-center gap-1 text-gray-700 hover:text-gray-900 -ml-1"
          >
            <ChevronLeft className="w-6 h-6" />
            <span className="text-base font-medium">Cancel</span>
          </Link>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold text-gray-900">
            New post
          </h1>
          <div className="w-14" /> {/* Spacer for center */}
        </header>

        <div className="max-w-lg mx-auto px-4 py-6">
          <ExplorePostForm
            onSuccess={() => router.replace("/provider/explore")}
            onCancel={() => router.push("/provider/explore")}
          />
        </div>
      </div>
    </RoleGuard>
  );
}
