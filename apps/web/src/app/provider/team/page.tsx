"use client";

import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import {
  Users,
  DollarSign,
  CalendarOff,
  CalendarRange,
  Clock,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { label: "Team members", href: "/provider/team/members", icon: Users, description: "Manage staff, roles, and permissions" },
  { label: "My Earnings", href: "/provider/team/my-earnings", icon: DollarSign, description: "View your earnings and payouts" },
  { label: "Days Off", href: "/provider/team/days-off", icon: CalendarOff, description: "Team days off and time off requests" },
  { label: "Shifts", href: "/provider/team/shifts", icon: CalendarRange, description: "Schedule and manage shifts" },
  { label: "Time Clock", href: "/provider/team/time-clock", icon: Clock, description: "Time tracking and clock in/out" },
  { label: "Payroll", href: "/provider/team/payroll", icon: DollarSign, description: "Pay runs and staff pay" },
  { label: "Totals", href: "/provider/team/totals", icon: BarChart3, description: "Daily and weekly performance metrics" },
];

export default function TeamHubPage() {
  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Members, earnings, shifts, and payroll"
        breadcrumbs={[
          { label: "Home", href: "/provider/dashboard" },
          { label: "Team" },
        ]}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between p-6 rounded-xl border border-gray-200",
                "bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
              )}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <span className="font-semibold text-gray-900">{item.label}</span>
                  <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
