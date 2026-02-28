"use client";

import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import {
  CalendarRange,
  CalendarOff,
  Package,
  FileEdit,
  ShoppingBag,
  Undo2,
  Store,
  Truck,
  Users,
  Grid3x3,
  BarChart3,
  Settings,
  ChevronRight,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const hubSections = [
  {
    title: "Schedule",
    description: "Time blocks and team days off",
    items: [
      { label: "Schedule", href: "/provider/schedule", icon: CalendarRange },
      { label: "Time Blocks", href: "/provider/time-blocks", icon: CalendarRange },
      { label: "Days Off", href: "/provider/team/days-off", icon: CalendarOff },
    ],
  },
  {
    title: "Resources & Forms",
    description: "Resources and intake forms",
    items: [
      { label: "Resources & Forms", href: "/provider/resources-forms", icon: Package },
      { label: "Resources", href: "/provider/resources", icon: Package },
      { label: "Forms", href: "/provider/forms", icon: FileEdit },
    ],
  },
  {
    title: "Orders",
    description: "Product orders and returns",
    items: [
      { label: "Orders", href: "/provider/orders", icon: ShoppingBag },
      { label: "View orders", href: "/provider/ecommerce/orders", icon: ShoppingBag },
      { label: "Returns", href: "/provider/ecommerce/returns", icon: Undo2 },
    ],
  },
  {
    title: "E-Commerce",
    description: "Orders, products, shipping, walk-in",
    items: [
      { label: "E-Commerce", href: "/provider/ecommerce", icon: Store },
      { label: "Products", href: "/provider/ecommerce/products", icon: Store },
      { label: "Shipping & Collection", href: "/provider/ecommerce/shipping", icon: Truck },
      { label: "Walk-in Sale", href: "/provider/ecommerce/walk-in", icon: Store },
    ],
  },
  {
    title: "Finance",
    description: "Earnings and payouts",
    items: [
      { label: "Finance Hub", href: "/provider/more/finance-hub", icon: Wallet },
      { label: "Finance & Earnings", href: "/provider/finance", icon: Wallet },
      { label: "Payout Accounts", href: "/provider/settings/payout-accounts", icon: Wallet },
    ],
  },
  {
    title: "Team & more",
    description: "Team, catalogue, reports, settings",
    items: [
      { label: "Team", href: "/provider/team", icon: Users },
      { label: "Team members", href: "/provider/team/members", icon: Users },
      { label: "Catalogue", href: "/provider/catalogue", icon: Grid3x3 },
      { label: "Reports", href: "/provider/reports", icon: BarChart3 },
      { label: "Settings", href: "/provider/settings", icon: Settings },
    ],
  },
];

export default function ProviderMorePage() {
  return (
    <div>
      <PageHeader
        title="More"
        subtitle="Schedule, resources, forms, orders, and settings"
        breadcrumbs={[
          { label: "Home", href: "/provider/dashboard" },
          { label: "More" },
        ]}
      />

      <div className="mt-6 space-y-8">
        {hubSections.map((section) => (
          <div key={section.title}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {section.title}
            </h2>
            <p className="text-sm text-gray-600 mb-4">{section.description}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-xl border border-gray-200",
                      "bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="font-medium text-gray-900">{item.label}</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
