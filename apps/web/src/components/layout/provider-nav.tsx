"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Package,
  Star,
  BarChart3,
  Settings,
  ClipboardList,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";

const providerNavItems = [
  { 
    name: "Dashboard", 
    href: "/provider/dashboard", 
    icon: BarChart3,
    description: "Overview and analytics"
  },
  { 
    name: "Bookings", 
    href: "/provider/bookings", 
    icon: Calendar,
    description: "Manage appointments"
  },
  { 
    name: "Packages", 
    href: "/provider/packages", 
    icon: Package,
    description: "Service packages"
  },
  { 
    name: "Reviews", 
    href: "/provider/reviews", 
    icon: Star,
    description: "Customer reviews"
  },
  { 
    name: "Waitlist", 
    href: "/provider/waitlist", 
    icon: ClipboardList,
    description: "Waitlist management"
  },
  { 
    name: "Analytics", 
    href: "/provider/analytics", 
    icon: BarChart3,
    description: "Business insights"
  },
  { 
    name: "Messages", 
    href: "/provider/messages", 
    icon: MessageSquare,
    description: "Customer messages"
  },
  { 
    name: "Settings", 
    href: "/provider/settings", 
    icon: Settings,
    description: "Provider settings"
  },
];

export default function ProviderNav() {
  const pathname = usePathname();

  return (
    <nav className="w-64 bg-white border-r border-gray-200 min-h-screen p-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Provider Portal</h2>
      </div>
      <ul className="space-y-1">
        {providerNavItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          const Icon = item.icon;
          
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  isActive
                    ? "bg-[#FF0077] text-white"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <Icon className="w-5 h-5" />
                <div className="flex-1">
                  <div className="font-medium">{item.name}</div>
                  <div className={cn(
                    "text-xs",
                    isActive ? "text-white/80" : "text-gray-500"
                  )}>
                    {item.description}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
