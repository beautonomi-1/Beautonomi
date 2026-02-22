"use client";

import React from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ServicesMenuSettings() {
  return (
    <SettingsDetailLayout
      title="Services Menu"
      subtitle="Manage your service offerings"
      onSave={() => console.log("Save services menu")}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Services Menu" },
      ]}
    >

      <SectionCard>
        <p className="text-gray-600 mb-4">
          Manage your services from the main services page.
        </p>
        <Link href="/provider/catalogue/services">
          <Button className="bg-[#FF0077] hover:bg-[#D60565]">
            Go to Services
          </Button>
        </Link>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
