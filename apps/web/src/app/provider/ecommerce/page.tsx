"use client";

import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { Store, Truck, ShoppingBag, Undo2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { label: "Orders", href: "/provider/ecommerce/orders", icon: ShoppingBag, description: "View and manage product orders" },
  { label: "Returns", href: "/provider/ecommerce/returns", icon: Undo2, description: "Process returns and refunds" },
  { label: "Products", href: "/provider/ecommerce/products", icon: Store, description: "Manage your product catalogue and inventory" },
  { label: "Shipping & Collection", href: "/provider/ecommerce/shipping", icon: Truck, description: "Shipping options and collection settings" },
  { label: "Walk-in Sale", href: "/provider/ecommerce/walk-in", icon: Store, description: "Quick in-store sales" },
];

export default function EcommerceHubPage() {
  return (
    <div>
      <PageHeader
        title="E-Commerce"
        subtitle="Orders, products, shipping, and walk-in sales"
        breadcrumbs={[
          { label: "Home", href: "/provider/dashboard" },
          { label: "E-Commerce" },
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
