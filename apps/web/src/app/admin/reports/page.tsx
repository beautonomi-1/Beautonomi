"use client";

import React from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { DollarSign, Calendar, Building2, Users, ArrowRight, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReportsPage() {
  const reports = [
    {
      title: "Revenue Report",
      description: "Platform revenue analysis, trends, and breakdowns by provider, service, and status",
      href: "/admin/reports/revenue",
      icon: DollarSign,
      color: "text-green-600",
    },
    {
      title: "Booking Report",
      description: "Booking statistics, completion rates, cancellations, and trends over time",
      href: "/admin/reports/bookings",
      icon: Calendar,
      color: "text-blue-600",
    },
    {
      title: "Provider Report",
      description: "Provider performance metrics, revenue, and booking statistics",
      href: "/admin/reports/providers",
      icon: Building2,
      color: "text-purple-600",
    },
    {
      title: "Customer Report",
      description: "Customer behavior analysis, booking patterns, and lifetime value",
      href: "/admin/reports/customers",
      icon: Users,
      color: "text-pink-600",
    },
    {
      title: "Gift Card Report",
      description: "Gift card sales, redemptions, liability tracking, and trends",
      href: "/admin/reports/gift-cards",
      icon: Gift,
      color: "text-green-600",
    },
  ];

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1">Comprehensive platform analytics and insights</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reports.map((report) => {
            const Icon = report.icon;
            return (
              <Card key={report.href} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className={`w-6 h-6 ${report.color}`} />
                    <CardTitle>{report.title}</CardTitle>
                  </div>
                  <CardDescription>{report.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href={report.href}>
                    <Button variant="outline" className="w-full">
                      View Report
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </RoleGuard>
  );
}
