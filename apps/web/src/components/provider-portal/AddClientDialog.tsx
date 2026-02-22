"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  X,
  User,
  Mail,
  MapPin,
  Save,
  CalendarIcon,
  Bell,
  Globe,
  Heart,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Client {
  id?: string;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: Date;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
  };
  emergency_contact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  preferred_language?: string;
  preferred_currency?: string;
  timezone?: string;
  communication_preferences?: {
    email_notifications: boolean;
    sms_notifications: boolean;
    push_notifications: boolean;
  };
  notes?: string;
}

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (client: Client) => void;
  defaultCountryCode?: string;
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "af", label: "Afrikaans" },
  { value: "zu", label: "Zulu" },
  { value: "xh", label: "Xhosa" },
  { value: "fr", label: "French" },
];

const CURRENCIES = [
  { value: "ZAR", label: "South African Rand (ZAR)" },
  { value: "USD", label: "US Dollar (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "GBP", label: "British Pound (GBP)" },
];

const TIMEZONES = [
  { value: "Africa/Johannesburg", label: "South Africa (SAST)" },
  { value: "Africa/Cairo", label: "Egypt (EET)" },
  { value: "Africa/Lagos", label: "Nigeria (WAT)" },
  { value: "Africa/Nairobi", label: "Kenya (EAT)" },
  { value: "UTC", label: "UTC" },
];

const EMERGENCY_RELATIONSHIPS = [
  "Spouse",
  "Parent",
  "Sibling",
  "Child",
  "Friend",
  "Other",
];

export function AddClientDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultCountryCode = "+27",
}: AddClientDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [defaultCountry, setDefaultCountry] = useState(defaultCountryCode);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState<Client>({
    first_name: "",
    last_name: "",
    preferred_name: "",
    email: "",
    phone: "",
    date_of_birth: undefined,
    address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "ZA",
    },
    emergency_contact: {
      name: "",
      phone: "",
      relationship: "",
    },
    preferred_language: "en",
    preferred_currency: "ZAR",
    timezone: "Africa/Johannesburg",
    communication_preferences: {
      email_notifications: true,
      sms_notifications: false,
      push_notifications: true,
    },
    notes: "",
  });

  useEffect(() => {
    if (open) {
      // Fetch default country code
      fetch("/api/public/platform-settings")
        .then((res) => res.json())
        .then((data) => {
          if (data.default_country_code) {
            setDefaultCountry(data.default_country_code);
          }
        })
        .catch(() => {});
    } else {
      // Reset form when closed
      setFormData({
        first_name: "",
        last_name: "",
        preferred_name: "",
        email: "",
        phone: "",
        date_of_birth: undefined,
        address: {
          line1: "",
          line2: "",
          city: "",
          state: "",
          postal_code: "",
          country: "ZA",
        },
        emergency_contact: {
          name: "",
          phone: "",
          relationship: "",
        },
        preferred_language: "en",
        preferred_currency: "ZAR",
        timezone: "Africa/Johannesburg",
        communication_preferences: {
          email_notifications: true,
          sms_notifications: false,
          push_notifications: true,
        },
        notes: "",
      });
      setShowAdvanced(false);
    }
  }, [open]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!formData.first_name || !formData.last_name) {
      alert("Please enter client's first and last name");
      return;
    }

    setIsLoading(true);
    try {
      // Format phone number (remove spaces)
      const formattedPhone = formData.phone ? formData.phone.replace(/\s/g, '') : undefined;
      
      // Combine first_name and last_name into full_name
      const full_name = `${formData.first_name} ${formData.last_name}`.trim();
      
      // Create email if not provided (for walk-in clients)
      const email = formData.email || `walkin-${Date.now()}@beautonomi.local`;
      
      // Prepare user data
      const userData = {
        email,
        full_name,
        phone: formattedPhone,
        preferred_name: formData.preferred_name || null,
        date_of_birth: formData.date_of_birth ? format(formData.date_of_birth, "yyyy-MM-dd") : null,
        emergency_contact_name: formData.emergency_contact?.name || null,
        emergency_contact_phone: formData.emergency_contact?.phone || null,
        emergency_contact_relationship: formData.emergency_contact?.relationship || null,
        preferred_language: formData.preferred_language || "en",
        preferred_currency: formData.preferred_currency || "ZAR",
        timezone: formData.timezone || "Africa/Johannesburg",
        email_notifications_enabled: formData.communication_preferences?.email_notifications ?? true,
        sms_notifications_enabled: formData.communication_preferences?.sms_notifications ?? false,
        push_notifications_enabled: formData.communication_preferences?.push_notifications ?? true,
      };

      // Create address data if provided
      const addressData = formData.address?.line1 && formData.address?.city ? {
        address_line1: formData.address.line1,
        address_line2: formData.address.line2 || null,
        city: formData.address.city,
        state: formData.address.state || null,
        postal_code: formData.address.postal_code || null,
        country: formData.address.country || "ZA",
        is_default: true,
      } : null;

      // Call API to create client
      const response = await fetch("/api/provider/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: formData.first_name,
          last_name: formData.last_name,
          ...userData,
          address: addressData,
          notes: formData.notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create client");
      }

      const result = await response.json();
      onSuccess?.(result.data as Client);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to create client:", error);
      alert(error.message || "Failed to create client. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-[90vh] max-h-[90vh] rounded-t-3xl p-0 flex flex-col overflow-hidden font-sans bg-white"
      >
        {/* Grab Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <SheetHeader className="px-6 sm:px-8 pb-4 border-b border-gray-100 relative">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-6 top-0 p-2 -mt-2 rounded-full hover:bg-gray-100 transition-colors touch-manipulation"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
          <SheetTitle className="text-xl font-bold text-gray-900 pr-10">
            Add New Client
          </SheetTitle>
        </SheetHeader>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 sm:py-8 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4" />
                Basic Information
              </h3>
              
              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    First Name *
                  </Label>
                  <Input
                    placeholder="John"
                    value={formData.first_name}
                    onChange={(e) =>
                      setFormData({ ...formData, first_name: e.target.value })
                    }
                    className="h-12 text-base"
                    required
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    Last Name *
                  </Label>
                  <Input
                    placeholder="Doe"
                    value={formData.last_name}
                    onChange={(e) =>
                      setFormData({ ...formData, last_name: e.target.value })
                    }
                    className="h-12 text-base"
                    required
                  />
                </div>
              </div>

              {/* Preferred Name */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  Preferred Name
                </Label>
                <Input
                  placeholder="How they like to be called"
                  value={formData.preferred_name}
                  onChange={(e) =>
                    setFormData({ ...formData, preferred_name: e.target.value })
                  }
                  className="h-12 text-base"
                />
              </div>

              {/* Date of Birth */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  Date of Birth
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-12 text-base justify-start text-left font-normal",
                        !formData.date_of_birth && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.date_of_birth ? (
                        format(formData.date_of_birth, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.date_of_birth}
                      onSelect={(date) =>
                        setFormData({ ...formData, date_of_birth: date })
                      }
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Contact Information
              </h3>

              {/* Email */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="email"
                    placeholder="john.doe@example.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="h-12 text-base pl-10"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-3">
                <PhoneInput
                  value={formData.phone}
                  onChange={(value) => {
                    const e164Format = value.replace(/\s/g, '');
                    setFormData({ ...formData, phone: e164Format });
                  }}
                  label="Phone Number"
                  placeholder="123 456 7890"
                  defaultCountryCode={defaultCountry}
                  required={false}
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Address
              </h3>

              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  Street Address
                </Label>
                <Input
                  placeholder="123 Main Street"
                  value={formData.address?.line1 || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: {
                        ...formData.address!,
                        line1: e.target.value,
                        country: formData.address?.country || "ZA",
                      },
                    })
                  }
                  className="h-12 text-base"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  Apartment, Suite, etc. (Optional)
                </Label>
                <Input
                  placeholder="Apt 4B"
                  value={formData.address?.line2 || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: {
                        ...formData.address!,
                        line2: e.target.value,
                        country: formData.address?.country || "ZA",
                      },
                    })
                  }
                  className="h-12 text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    City *
                  </Label>
                  <Input
                    placeholder="Cape Town"
                    value={formData.address?.city || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: {
                          ...formData.address!,
                          city: e.target.value,
                          country: formData.address?.country || "ZA",
                        },
                      })
                    }
                    className="h-12 text-base"
                    required={!!formData.address?.line1}
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    State/Province
                  </Label>
                  <Input
                    placeholder="Western Cape"
                    value={formData.address?.state || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: {
                          ...formData.address!,
                          state: e.target.value,
                          country: formData.address?.country || "ZA",
                        },
                      })
                    }
                    className="h-12 text-base"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    Postal Code
                  </Label>
                  <Input
                    placeholder="8001"
                    value={formData.address?.postal_code || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: {
                          ...formData.address!,
                          postal_code: e.target.value,
                          country: formData.address?.country || "ZA",
                        },
                      })
                    }
                    className="h-12 text-base"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    Country
                  </Label>
                  <Select
                    value={formData.address?.country || "ZA"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        address: {
                          ...formData.address!,
                          country: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ZA">South Africa</SelectItem>
                      <SelectItem value="US">United States</SelectItem>
                      <SelectItem value="GB">United Kingdom</SelectItem>
                      <SelectItem value="KE">Kenya</SelectItem>
                      <SelectItem value="NG">Nigeria</SelectItem>
                      <SelectItem value="GH">Ghana</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Emergency Contact
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    Name
                  </Label>
                  <Input
                    placeholder="Emergency contact name"
                    value={formData.emergency_contact?.name || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        emergency_contact: {
                          ...formData.emergency_contact!,
                          name: e.target.value,
                        },
                      })
                    }
                    className="h-12 text-base"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    Relationship
                  </Label>
                  <Select
                    value={formData.emergency_contact?.relationship || ""}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        emergency_contact: {
                          ...formData.emergency_contact!,
                          relationship: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Select relationship" />
                    </SelectTrigger>
                    <SelectContent>
                      {EMERGENCY_RELATIONSHIPS.map((rel) => (
                        <SelectItem key={rel} value={rel} className="h-12">
                          {rel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  Phone Number
                </Label>
                <PhoneInput
                  value={formData.emergency_contact?.phone || ""}
                  onChange={(value) => {
                    const e164Format = value.replace(/\s/g, '');
                    setFormData({
                      ...formData,
                      emergency_contact: {
                        ...formData.emergency_contact!,
                        phone: e164Format,
                      },
                    });
                  }}
                  label=""
                  placeholder="123 456 7890"
                  defaultCountryCode={defaultCountry}
                  required={false}
                />
              </div>
            </div>

            {/* Advanced Options Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-900">
                Advanced Options
              </span>
              <ChevronDown
                className={cn(
                  "w-5 h-5 text-gray-500 transition-transform",
                  showAdvanced && "rotate-180"
                )}
              />
            </button>

            {/* Advanced Options */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  {/* Preferences */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Preferences
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-gray-900">
                          Preferred Language
                        </Label>
                        <Select
                          value={formData.preferred_language || "en"}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              preferred_language: value,
                            })
                          }
                        >
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LANGUAGES.map((lang) => (
                              <SelectItem key={lang.value} value={lang.value} className="h-12">
                                {lang.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-gray-900">
                          Preferred Currency
                        </Label>
                        <Select
                          value={formData.preferred_currency || "ZAR"}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              preferred_currency: value,
                            })
                          }
                        >
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((curr) => (
                              <SelectItem key={curr.value} value={curr.value} className="h-12">
                                {curr.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-semibold text-gray-900">
                        Timezone
                      </Label>
                      <Select
                        value={formData.timezone || "Africa/Johannesburg"}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            timezone: value,
                          })
                        }
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value} className="h-12">
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Communication Preferences */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      Communication Preferences
                    </h3>

                    <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Label className="text-sm font-semibold text-gray-900">
                            Email Notifications
                          </Label>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Receive booking confirmations and updates via email
                          </p>
                        </div>
                        <Switch
                          checked={formData.communication_preferences?.email_notifications ?? true}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              communication_preferences: {
                                ...formData.communication_preferences!,
                                email_notifications: checked,
                              },
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Label className="text-sm font-semibold text-gray-900">
                            SMS Notifications
                          </Label>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Receive text message reminders and updates
                          </p>
                        </div>
                        <Switch
                          checked={formData.communication_preferences?.sms_notifications ?? false}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              communication_preferences: {
                                ...formData.communication_preferences!,
                                sms_notifications: checked,
                              },
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Label className="text-sm font-semibold text-gray-900">
                            Push Notifications
                          </Label>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Receive push notifications on mobile app
                          </p>
                        </div>
                        <Switch
                          checked={formData.communication_preferences?.push_notifications ?? true}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              communication_preferences: {
                                ...formData.communication_preferences!,
                                push_notifications: checked,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Notes */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-900">
                Notes
              </Label>
              <Textarea
                placeholder="Any additional notes about this client (allergies, preferences, etc.)..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="min-h-[100px] text-base"
              />
            </div>
          </motion.div>
        </div>

        {/* Sticky Footer - Thumb Zone Optimized */}
        <div className="border-t border-gray-200 bg-white px-6 sm:px-8 py-5 space-y-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="flex-1 h-14 text-base font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || !formData.first_name || !formData.last_name}
              className="flex-1 h-14 text-base font-semibold bg-[#FF0077] hover:bg-[#D60565] text-white active:scale-95 transition-transform"
            >
              {isLoading ? (
                "Creating..."
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Create Client
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
