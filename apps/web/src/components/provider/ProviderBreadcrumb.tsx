"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  calendar: "Calendar",
  appointments: "Appointments",
  sales: "Sales",
  payments: "Payments",
  catalogue: "Catalogue",
  products: "Products",
  services: "Services",
  marketing: "Marketing",
  "blast-campaigns": "Blast Campaigns",
  automations: "Automations",
  team: "Team",
  members: "Members",
  shifts: "Scheduled Shifts",
  settings: "Business Settings",
  "appointment-activity": "Appointment Activity",
  clients: "Clients",
  billing: "Billing & Invoices",
  locations: "Locations",
  account: "Account",
  profile: "Profile",
};

export function ProviderBreadcrumb() {
  const pathname = usePathname();

  const paths = pathname
    .split("/")
    .filter((p) => p && p !== "provider")
    .map((p) => ({
      path: p,
      label: routeLabels[p] || p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " "),
    }));

  if (paths.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 overflow-hidden">
      <Link
        href="/provider/dashboard"
        className="flex items-center gap-1 hover:text-[#FF0077] transition-colors flex-shrink-0"
      >
        <Home className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">Dashboard</span>
      </Link>
      {paths.map((item, index) => {
        const isLast = index === paths.length - 1;
        const href = `/provider/${paths.slice(0, index + 1).map((p) => p.path).join("/")}`;

        return (
          <React.Fragment key={item.path}>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {isLast ? (
              <span className="text-gray-900 font-medium truncate">{item.label}</span>
            ) : (
              <Link
                href={href}
                className="hover:text-[#FF0077] transition-colors truncate"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
