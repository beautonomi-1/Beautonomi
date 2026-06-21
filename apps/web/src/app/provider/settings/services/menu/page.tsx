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
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Services Menu" },
      ]}
    >
      <SectionCard>
        <p className="text-gray-600 mb-4">
          Your services, categories, and pricing are managed from the catalogue.
          Use the button below to add, edit, or reorder your service menu.
        </p>
        <Link href="/provider/catalogue/services">
          <Button className="bg-primary hover:bg-primary-hover">
            Manage Services in Catalogue
          </Button>
        </Link>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
