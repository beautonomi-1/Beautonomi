"use client";

import React from "react";
import { Calendar, CreditCard, MessageSquare, Clock, Users, Phone, Home, Sparkles, MapPin, Star, TrendingUp, Package, Heart } from "lucide-react";

interface PortalMockupProps {
  activeTab: string;
}

export default function PortalMockup({ activeTab }: PortalMockupProps) {
  const renderContent = () => {
    switch (activeTab) {
      case "CALENDAR":
        return <CalendarView />;
      case "ONLINE BOOKING":
        return <OnlineBookingView />;
      case "CUSTOM SERVICES":
        return <CustomServicesView />;
      case "CALLS & TEXTS":
        return <CallsTextsView />;
      case "HOUSE CALLS":
        return <HouseCallsView />;
      default:
        return <CalendarView />;
    }
  };

  return (
    <div className="relative -mt-12 md:-mt-20 lg:-mt-32 mb-12 md:mb-20 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Spacing between tabs and image */}
        <div className="mb-8 md:mb-12 lg:mb-16"></div>
        {/* Mockup Container */}
        <div className="relative bg-white rounded-xl md:rounded-2xl shadow-2xl overflow-hidden border border-gray-200 transform hover:scale-[1.01] transition-all duration-500">
          {/* Top Navigation Bar (Mockup) */}
          <div className="bg-gradient-to-r from-[#FF0077] to-[#D60565] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-[#FF0077] font-bold text-sm sm:text-lg">B</span>
              </div>
              <span className="text-white font-semibold text-base sm:text-lg">Beautonomi</span>
            </div>
            <div className="hidden sm:flex items-center gap-4 lg:gap-6 text-white text-xs sm:text-sm">
              <span className="cursor-pointer hover:opacity-80">Calendar</span>
              <span className="cursor-pointer hover:opacity-80">Clients</span>
              <span className="cursor-pointer hover:opacity-80">Sales</span>
              <span className="cursor-pointer hover:opacity-80 hidden lg:inline">Reports</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white/20 rounded-full flex-shrink-0"></div>
              <span className="text-white text-xs sm:text-sm hidden sm:inline">Sarah Johnson</span>
            </div>
          </div>

          {/* Dynamic Content Based on Active Tab */}
          <div className="p-4 sm:p-6 md:p-8 bg-gray-50 relative transition-all duration-500">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

// Calendar View Component
function CalendarView() {
  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <button className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white border border-gray-300 rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-50 whitespace-nowrap">
            TODAY
          </button>
          <div className="flex items-center gap-1 sm:gap-2">
            <button className="p-1.5 sm:p-2 hover:bg-gray-200 rounded text-sm">‹</button>
            <span className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 whitespace-nowrap">Tuesday, July 16</span>
            <button className="p-1.5 sm:p-2 hover:bg-gray-200 rounded text-sm">›</button>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg whitespace-nowrap">
            FILTERS
          </button>
          <div className="flex bg-white border border-gray-300 rounded-lg overflow-hidden">
            <button className="px-3 sm:px-4 py-1.5 sm:py-2 bg-[#FF0077] text-white text-xs sm:text-sm font-medium">
              DAY
            </button>
            <button className="px-3 sm:px-4 py-1.5 sm:py-2 text-gray-700 text-xs sm:text-sm font-medium hover:bg-gray-50">
              WEEK
            </button>
          </div>
        </div>
      </div>

      {/* Team Members Row */}
      <div className="flex gap-2 sm:gap-3 md:gap-4 mb-4 overflow-x-auto pb-2 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 scrollbar-hide">
        {["Marcus", "Natalie", "Michael", "Chelsea"].map((name, idx) => (
          <div key={name} className="flex-1 min-w-[160px] sm:min-w-[180px] md:min-w-[200px] flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                {name[0]}
              </div>
              <span className="text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">{name}</span>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              {idx === 0 && (
                <>
                  <div className="bg-blue-100 border-l-4 border-blue-500 p-2 sm:p-2.5 md:p-3 rounded text-[10px] sm:text-xs">
                    <div className="font-semibold text-gray-900 truncate">WOMEN'S HAIRCUT</div>
                    <div className="text-gray-600 truncate">Laura Johnson</div>
                    <div className="text-gray-500 text-[9px] sm:text-[10px]">12:00 PM - 1:00 PM</div>
                  </div>
                  <div className="bg-purple-100 border-l-4 border-purple-500 p-2 sm:p-2.5 md:p-3 rounded text-[10px] sm:text-xs">
                    <div className="font-semibold text-gray-900 truncate">FULL HIGHLIGHT</div>
                    <div className="text-gray-600 truncate">Kesha Williamson</div>
                    <div className="text-gray-500 text-[9px] sm:text-[10px]">2:00 PM - 4:00 PM</div>
                  </div>
                </>
              )}
              {idx === 1 && (
                <>
                  <div className="bg-pink-100 border-l-4 border-pink-500 p-2 sm:p-2.5 md:p-3 rounded text-[10px] sm:text-xs">
                    <div className="font-semibold text-gray-900 truncate">50-MINUTE FACIAL</div>
                    <div className="text-gray-600 truncate">Teresa Marion</div>
                    <div className="text-gray-500 text-[9px] sm:text-[10px]">12:00 PM - 1:00 PM</div>
                  </div>
                  <div className="bg-[#FF0077] border-l-4 border-[#D60565] p-2 sm:p-2.5 md:p-3 rounded text-[10px] sm:text-xs text-white">
                    <div className="font-semibold truncate">50-MINUTE FACIAL</div>
                    <div className="truncate">Lucy Carmichael</div>
                    <div className="text-[9px] sm:text-[10px] opacity-90">1:00 PM - 2:00 PM</div>
                  </div>
                </>
              )}
              {idx === 2 && (
                <div className="bg-orange-100 border-l-4 border-orange-500 p-2 sm:p-2.5 md:p-3 rounded text-[10px] sm:text-xs">
                  <div className="font-semibold text-gray-900 truncate">DOUBLE PROCESS COLOR</div>
                  <div className="text-gray-600 truncate">Abbey Bauch</div>
                  <div className="text-gray-500 text-[9px] sm:text-[10px]">12:00 PM - 1:45 PM</div>
                </div>
              )}
              {idx === 3 && (
                <div className="bg-green-100 border-l-4 border-green-500 p-2 sm:p-2.5 md:p-3 rounded text-[10px] sm:text-xs">
                  <div className="font-semibold text-gray-900 truncate">MEN'S HAIRCUT</div>
                  <div className="text-gray-600 truncate">Matthew Hammer</div>
                  <div className="text-gray-500 text-[9px] sm:text-[10px]">12:00 PM - 12:45 PM</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Appointment Details Sidebar */}
      <div className="absolute right-4 sm:right-6 md:right-8 top-4 sm:top-6 md:top-8 w-64 sm:w-72 md:w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 sm:p-5 md:p-6 hidden lg:block">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Appointment</h3>
          <span className="px-2 sm:px-3 py-1 bg-green-100 text-green-700 text-[10px] sm:text-xs font-medium rounded-full">
            Checked In
          </span>
        </div>
        <button className="w-full bg-[#FF0077] text-white py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium mb-3 sm:mb-4 hover:bg-[#D60565] transition-colors">
          CHECKOUT
        </button>
        <div className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">On Tue, Jul 16 At 1:00 PM</div>
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-pink-400 to-purple-400 rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-semibold flex-shrink-0">
            LC
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-xs sm:text-sm truncate">Lucy Carmichael</div>
            <div className="text-[10px] sm:text-xs text-gray-500">Client since April 2022</div>
          </div>
        </div>
        <div className="border-t pt-3 sm:pt-4">
          <div className="text-xs sm:text-sm font-medium text-gray-900 mb-1 truncate">
            Premium Facial Membership
          </div>
          <div className="text-[10px] sm:text-xs text-gray-500">Active Billing: July 25</div>
        </div>
      </div>
    </>
  );
}

// Online Booking View Component
function OnlineBookingView() {
  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Online Bookings</h2>
        <button className="px-4 py-2 bg-[#FF0077] text-white rounded-lg text-sm font-medium hover:bg-[#D60565] transition-colors">
          New Booking
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-5 h-5 text-[#FF0077]" />
            <span className="text-sm font-medium text-gray-600">Today</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">12</div>
          <div className="text-xs text-gray-500 mt-1">Appointments</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-gray-600">Pending</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">5</div>
          <div className="text-xs text-gray-500 mt-1">Awaiting Confirmation</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium text-gray-600">This Week</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">48</div>
          <div className="text-xs text-gray-500 mt-1">Total Bookings</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Bookings</h3>
        <div className="space-y-3">
          {[
            { name: "Emma Wilson", service: "Haircut & Style", time: "2:00 PM", status: "Confirmed" },
            { name: "James Brown", service: "Beard Trim", time: "3:30 PM", status: "Pending" },
            { name: "Sarah Davis", service: "Full Color", time: "4:00 PM", status: "Confirmed" },
          ].map((booking, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <div className="font-semibold text-sm text-gray-900">{booking.name}</div>
                <div className="text-xs text-gray-600">{booking.service}</div>
                <div className="text-xs text-gray-500 mt-1">{booking.time}</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                booking.status === "Confirmed" 
                  ? "bg-green-100 text-green-700" 
                  : "bg-yellow-100 text-yellow-700"
              }`}>
                {booking.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Custom Services View Component
function CustomServicesView() {
  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">Custom Services</h2>
          <p className="text-sm text-gray-500">Create unique service packages for your clients</p>
        </div>
        <button className="px-4 py-2 bg-gradient-to-r from-[#FF0077] to-[#D60565] text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all">
          <Sparkles className="w-4 h-4 inline mr-2" />
          Create Service
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl p-5 border border-pink-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-gradient-to-br from-[#FF0077] to-[#D60565] rounded-lg">
              <Package className="w-5 h-5 text-white" />
            </div>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">12</div>
          <div className="text-sm font-medium text-gray-700">Active Services</div>
          <div className="text-xs text-gray-500 mt-1">Custom offerings</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">48</div>
          <div className="text-sm font-medium text-gray-700">This Month</div>
          <div className="text-xs text-gray-500 mt-1">Total bookings</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">R8,400</div>
          <div className="text-sm font-medium text-gray-700">Revenue</div>
          <div className="text-xs text-green-600 font-medium mt-1">↑ 20% from last month</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Popular Custom Services</h3>
          <button className="text-sm text-[#FF0077] hover:text-[#D60565] font-medium">View All</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: "Bridal Package", description: "Full makeup, hair styling, and consultation", price: "R2,500", bookings: 8, icon: Heart, color: "from-pink-500 to-rose-500" },
            { name: "Event Makeup", description: "Professional makeup for special occasions", price: "R850", bookings: 15, icon: Sparkles, color: "from-purple-500 to-pink-500" },
            { name: "Beauty Consultation", description: "Personalized skincare and beauty advice", price: "R450", bookings: 12, icon: Star, color: "from-amber-500 to-orange-500" },
          ].map((service, idx) => {
            const Icon = service.icon;
            return (
              <div key={idx} className="group relative overflow-hidden bg-gradient-to-br from-gray-50 to-white rounded-xl p-5 border border-gray-200 hover:border-[#FF0077] hover:shadow-lg transition-all cursor-pointer">
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br opacity-10 group-hover:opacity-20 transition-opacity" style={{ background: `linear-gradient(135deg, var(--tw-gradient-stops))` }}></div>
                <div className="relative">
                  <div className={`inline-flex p-3 bg-gradient-to-br ${service.color} rounded-xl mb-3 shadow-sm`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="font-bold text-lg text-gray-900 mb-1">{service.name}</div>
                  <div className="text-xs text-gray-600 mb-3 line-clamp-2">{service.description}</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-gray-900">{service.price}</div>
                      <div className="text-xs text-gray-500">{service.bookings} bookings</div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[#FF0077] font-medium">
                      <span>View</span>
                      <TrendingUp className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// Calls & Texts View Component
function CallsTextsView() {
  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Calls & Messages</h2>
        <button className="px-4 py-2 bg-[#FF0077] text-white rounded-lg text-sm font-medium hover:bg-[#D60565] transition-colors">
          New Message
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <Phone className="w-5 h-5 text-[#FF0077]" />
            <span className="text-sm font-medium text-gray-900">Recent Calls</span>
          </div>
          <div className="space-y-2">
            {[
              { name: "Emma Wilson", time: "2:15 PM", type: "Missed" },
              { name: "James Brown", time: "1:30 PM", type: "Answered" },
            ].map((call, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div>
                  <div className="text-sm font-medium text-gray-900">{call.name}</div>
                  <div className="text-xs text-gray-500">{call.time}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  call.type === "Answered" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  {call.type}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <MessageSquare className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-gray-900">Unread Messages</span>
            <span className="bg-[#FF0077] text-white text-xs px-2 py-0.5 rounded-full">3</span>
          </div>
          <div className="space-y-2">
            {[
              { name: "Sarah Davis", message: "Can I reschedule my appointment?", time: "2:00 PM" },
              { name: "Michael Chen", message: "Thank you for the great service!", time: "1:45 PM" },
            ].map((msg, idx) => (
              <div key={idx} className="p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium text-gray-900">{msg.name}</div>
                  <div className="text-xs text-gray-500">{msg.time}</div>
                </div>
                <div className="text-xs text-gray-600 truncate">{msg.message}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Message Thread</h3>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {[
            { sender: "Client", message: "Hi, I'd like to book an appointment", time: "10:30 AM" },
            { sender: "You", message: "Sure! What service are you interested in?", time: "10:32 AM" },
            { sender: "Client", message: "A haircut and beard trim please", time: "10:35 AM" },
          ].map((msg, idx) => (
            <div key={idx} className={`flex ${msg.sender === "You" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] p-3 rounded-lg ${
                msg.sender === "You" 
                  ? "bg-[#FF0077] text-white" 
                  : "bg-gray-100 text-gray-900"
              }`}>
                <div className="text-sm">{msg.message}</div>
                <div className={`text-xs mt-1 ${msg.sender === "You" ? "text-pink-100" : "text-gray-500"}`}>
                  {msg.time}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// House Calls View Component
function HouseCallsView() {
  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">House Calls</h2>
          <p className="text-sm text-gray-500">Bring your services directly to clients' homes</p>
        </div>
        <button className="px-4 py-2 bg-gradient-to-r from-[#FF0077] to-[#D60565] text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all">
          <Home className="w-4 h-4 inline mr-2" />
          Schedule Call
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-5 border border-rose-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-gradient-to-br from-[#FF0077] to-[#D60565] rounded-lg">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">5</div>
          <div className="text-sm font-medium text-gray-700">Today's Calls</div>
          <div className="text-xs text-gray-500 mt-1">Scheduled appointments</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">18</div>
          <div className="text-sm font-medium text-gray-700">This Week</div>
          <div className="text-xs text-gray-500 mt-1">Total house calls</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">72</div>
          <div className="text-sm font-medium text-gray-700">This Month</div>
          <div className="text-xs text-green-600 font-medium mt-1">↑ 15% from last month</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Upcoming House Calls</h3>
          <button className="text-sm text-[#FF0077] hover:text-[#D60565] font-medium">View All</button>
        </div>
        <div className="space-y-3">
          {[
            { name: "Sarah Johnson", service: "Full Facial Treatment", address: "123 Main St, Apt 4B", time: "2:00 PM", status: "Confirmed", avatar: "SJ" },
            { name: "Emma Wilson", service: "Haircut & Styling", address: "456 Oak Ave", time: "4:30 PM", status: "Confirmed", avatar: "EW" },
            { name: "Michael Chen", service: "Beard Trim & Grooming", address: "789 Pine Rd", time: "6:00 PM", status: "Pending", avatar: "MC" },
          ].map((call, idx) => (
            <div key={idx} className="group relative overflow-hidden bg-gradient-to-r from-gray-50 to-white rounded-xl p-4 border border-gray-200 hover:border-[#FF0077] hover:shadow-md transition-all cursor-pointer">
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#FF0077] to-[#D60565] rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                    {call.avatar}
                  </div>
                  {call.status === "Confirmed" && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <div className="font-bold text-base text-gray-900">{call.name}</div>
                      <div className="text-sm font-medium text-gray-700 mt-0.5">{call.service}</div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ml-2 ${
                      call.status === "Confirmed" 
                        ? "bg-green-100 text-green-700 border border-green-200" 
                        : "bg-yellow-100 text-yellow-700 border border-yellow-200"
                    }`}>
                      {call.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                    <MapPin className="w-3.5 h-3.5 text-[#FF0077]" />
                    <span className="truncate">{call.address}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{call.time}</span>
                  </div>
                </div>
                <button className="flex-shrink-0 p-2 text-[#FF0077] hover:bg-pink-50 rounded-lg transition-colors">
                  <TrendingUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
