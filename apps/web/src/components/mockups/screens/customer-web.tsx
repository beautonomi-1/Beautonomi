"use client";

import React from "react";
import { Calendar, CreditCard, FileText, MapPin, MessageSquare, Package, Search, Star } from "lucide-react";
import { BrowserFrame } from "../BrowserFrame";
import { KpiCard, ListRow, PillTabs, ScreenSection } from "../shared-ui";

export function CustomerWebAccountScreen() {
  return (
    <BrowserFrame title="My account" url="beautonomi.co.za/account">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Account hub</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Documents & settings</h3>
        <p className="text-sm text-gray-500">Receipts, addresses, wallet, and support</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="Wallet" value="R250" tone="primary" />
        <KpiCard label="Loyalty pts" value="480" tone="default" />
        <KpiCard label="Open tickets" value="0" tone="green" />
      </div>
      <div className="mt-4 space-y-2">
        <ListRow icon={<FileText className="h-4 w-4 text-gray-500" />} title="Receipts & invoices" subtitle="Booking and order history" />
        <ListRow icon={<MapPin className="h-4 w-4 text-gray-500" />} title="Saved addresses" subtitle="Home · Sandton · Verified pin" />
        <ListRow icon={<CreditCard className="h-4 w-4 text-gray-500" />} title="Payment methods" subtitle="Visa ·••• 4242 · Paystack" />
        <ListRow icon={<MessageSquare className="h-4 w-4 text-gray-500" />} title="Support tickets" subtitle="Help desk and disputes" />
      </div>
    </BrowserFrame>
  );
}

export function CustomerWebShopScreen() {
  const items = [
    { name: "Hydrating serum", price: "R320", provider: "Glow Studio" },
    { name: "Spa day package", price: "R1,850", provider: "Urban Spa" },
  ];

  return (
    <BrowserFrame title="Shop" url="beautonomi.co.za/shop">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">E-commerce</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Products & packages</h3>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <Search className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-400">Search catalogue</span>
        </div>
      </div>
      <div className="mt-4">
        <PillTabs tabs={["All", "Products", "Packages", "Gift cards"]} />
      </div>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.name} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <Package className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">{item.provider}</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-primary">{item.price}</p>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

export function CustomerWebManageBookingsScreen() {
  return (
    <BrowserFrame title="Booking detail" url="beautonomi.co.za/account/bookings/abc123">
      <ScreenSection title="Balayage & trim" subtitle="Glow Studio · Sat 14 Jul · 2:00 PM">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-800">Confirmed</span>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-semibold text-gray-600">At salon</span>
        </div>
        <p className="text-sm text-gray-600">R1,200 paid via Paystack · Receipt #BN-4821</p>
      </ScreenSection>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Reschedule", icon: Calendar },
          { label: "Message", icon: MessageSquare },
          { label: "Pay balance", icon: CreditCard },
          { label: "Leave review", icon: Star },
        ].map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-3 text-center"
          >
            <Icon className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-semibold text-gray-700">{label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-semibold text-amber-900">Cancellation policy applies</p>
        <p className="mt-1 text-[10px] text-amber-800">Free reschedule up to 24 hours before your appointment.</p>
      </div>
    </BrowserFrame>
  );
}
