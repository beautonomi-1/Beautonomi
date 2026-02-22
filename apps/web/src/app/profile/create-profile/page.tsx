'use client'
import React from "react";
import AuthGuard from "@/components/auth/auth-guard";
import ProfileDataCollector from "./components/profile-data-collector";
import Breadcrumb from "@/components/ui/breadcrumb";

const Page = () => {
  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto p-4">
        <Breadcrumb items={[
          { label: "Home", href: "/" },
          { label: "Profile", href: "/profile" },
          { label: "Create Profile" }
        ]} />
        <ProfileDataCollector />
      </div>
    </AuthGuard>
  );
};

export default Page;
