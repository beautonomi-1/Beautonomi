"use client";

import React from "react";
import { Calendar, CreditCard, TrendingUp, Users } from "lucide-react";
import { BrowserFrame } from "../BrowserFrame";

export function ProviderWebDashboardScreen() {
  return (
    <BrowserFrame title="Provider portal" url="beautonomi.co.za/provider/dashboard">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Provider portal</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Dashboard</h3>
        <p className="text-sm text-gray-500">Sandton Studio · Tuesday, 16 Jul</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Today's bookings", value: "8", icon: Calendar, tone: "text-primary bg-primary/5" },
          { label: "Pending", value: "3", icon: Users, tone: "text-amber-700 bg-amber-50" },
          { label: "Revenue (week)", value: "R18.2k", icon: TrendingUp, tone: "text-green-700 bg-green-50" },
          { label: "Available", value: "R12.4k", icon: CreditCard, tone: "text-indigo-700 bg-indigo-50" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className={`mb-2 inline-flex rounded-lg p-2 ${tone}`}>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">Upcoming appointments</p>
        <div className="mt-3 space-y-2">
          {[
            { time: "10:30", service: "Gel manicure", client: "Thandi M." },
            { time: "12:00", service: "Blow dry & style", client: "Nomsa K." },
          ].map((row) => (
            <div key={row.time} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2">
              <span className="text-sm font-bold text-gray-900">{row.time}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{row.service}</p>
                <p className="truncate text-xs text-gray-500">{row.client}</p>
              </div>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">Confirmed</span>
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}

export function CustomerWebBookingScreen() {
  return (
    <BrowserFrame title="Book a service" url="beautonomi.co.za/book/glow-studio">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Book with Glow Studio</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Choose your service</h3>
        <p className="text-sm text-gray-500">Sandton · 4.9 ★ · Hair & Nails</p>
      </div>
      <div className="mt-4 space-y-2">
        {[
          { name: "Women's cut & blow dry", price: "R450", duration: "60 min" },
          { name: "Balayage full head", price: "R1,200", duration: "180 min" },
        ].map((s) => (
          <div key={s.name} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{s.name}</p>
              <p className="text-xs text-gray-500">{s.duration}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-primary">{s.price}</p>
              <button type="button" className="mt-1 text-xs font-semibold text-gray-700 underline">
                Select
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
        <p className="text-sm font-semibold text-gray-900">Checkout</p>
        <p className="mt-1 text-xs text-gray-600">Pick date, time, and pay securely with Paystack.</p>
        <button type="button" className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white">
          Continue to checkout
        </button>
      </div>
    </BrowserFrame>
  );
}
