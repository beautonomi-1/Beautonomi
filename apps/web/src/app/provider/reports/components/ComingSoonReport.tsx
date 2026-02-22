"use client";

/**
 * Placeholder for report pages not yet implemented.
 * Usage: Import in report page.tsx and render with title, description, breadcrumbs.
 * Currently unused - add to new report routes as they are scaffolded.
 */
import React from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ComingSoonReportProps {
  title: string;
  description?: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
}

export function ComingSoonReport({ title, description, breadcrumbs }: ComingSoonReportProps) {
  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs} showCloseButton={false}>
      <div className="space-y-6">
        <PageHeader
          title={title}
          subtitle={description || "This report is coming soon"}
        />

        <Card className="border-gray-200">
          <CardContent className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-yellow-50 rounded-full">
                <Construction className="w-12 h-12 text-yellow-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Coming Soon
                </h3>
                <p className="text-gray-600 mb-6 max-w-md">
                  We're working hard to bring you this report. Check back soon for updates!
                </p>
                <Link href="/provider/reports">
                  <Button variant="outline">Back to Reports</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
