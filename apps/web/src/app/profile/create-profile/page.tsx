"use client";
import React, { Suspense } from "react";
import AuthGuard from "@/components/auth/auth-guard";
import ProfileDataCollector from "./components/profile-data-collector";
import Breadcrumb from "@/components/ui/breadcrumb";

const Page = () => {
  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto p-4">
        <Breadcrumb items={[
          { label: "Home", href: "/" },
          { label: "Account", href: "/account-settings" },
          { label: "Create Profile" }
        ]} />
        <Suspense
          fallback={
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-8 animate-pulse min-h-[12rem]" aria-busy />
          }
        >
          <ProfileDataCollector />
        </Suspense>
      </div>
    </AuthGuard>
  );
};

export default Page;
