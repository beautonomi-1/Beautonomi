"use client";

import React from "react";
import PageHeader from "@/components/ui/page-header";
import { ExploreModerationTable } from "@/components/admin/ExploreModerationTable";
import RoleGuard from "@/components/auth/RoleGuard";

export default function AdminExplorePage() {
  return (
    <RoleGuard
      allowedRoles={["superadmin"]}
      redirectTo="/admin/dashboard"
      showLoading={false}
    >
      <div className="min-h-screen bg-white">
        <PageHeader
          title="Explore Moderation"
          description="Manage explore feed posts"
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <ExploreModerationTable />
        </div>
      </div>
    </RoleGuard>
  );
}
