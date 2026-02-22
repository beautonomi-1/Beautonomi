"use client";

import React from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

const marketingIntegrations = [
  { 
    title: "Email Integration", 
    description: "Connect SendGrid or Mailchimp for email marketing campaigns", 
    href: "/provider/settings/integrations/email" 
  },
  { 
    title: "Twilio Integration", 
    description: "Connect Twilio for SMS and WhatsApp marketing campaigns", 
    href: "/provider/settings/integrations/twilio" 
  },
];

export default function MarketingIntegrationsPage() {
  return (
    <div>
      <PageHeader
        title="Marketing Integrations"
        subtitle="Connect third-party services to run effective marketing campaigns"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Marketing Integrations" }
        ]}
      />

      <div className="mt-6">
        <SectionCard>
          <h3 className="text-lg font-semibold mb-2">Marketing Integrations</h3>
          <p className="text-sm text-gray-600 mb-6">
            Connect third-party services to run effective marketing campaigns
          </p>
          <div className="space-y-2">
            {marketingIntegrations.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                className="flex items-center justify-between p-4 border rounded-lg transition-colors border-gray-200 hover:bg-gray-50"
              >
                <div>
                  <h4 className="font-medium">{item.title}</h4>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
