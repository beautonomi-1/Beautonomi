"use client";
import React, { useState, useEffect } from "react";
import { Calendar, Package, GraduationCap, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "../components/back-button";
import AuthGuard from "@/components/auth/auth-guard";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

const businessBenefits = [
  {
    title: "Streamlined business bookings",
    description:
      "Book beauty services for corporate events, client meetings, and professional engagements with ease.",
    icon: Calendar,
  },
  {
    title: "Corporate packages & discounts",
    description: "Access exclusive corporate packages and volume discounts for company events.",
    icon: Package,
  },
  {
    title: "Professional development",
    description:
      "Book training sessions and professional development workshops with certified beauty experts.",
    icon: GraduationCap,
  },
];

interface BusinessPreferences {
  email: string | null;
  enabled: boolean;
}

const BusinessServices: React.FC = () => {
  const [email, setEmail] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved business preferences from profile
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetcher.get<{ data: { business_preferences?: BusinessPreferences } }>("/api/me/profile", { cache: "no-store" });
        const prefs = res?.data?.business_preferences;
        if (prefs) {
          setEmail(prefs.email ?? "");
          setIsEnabled(Boolean(prefs.enabled));
        }
      } catch {
        // use defaults
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // Check if the email is a valid business email address
  const isValidBusinessEmail = email.includes("@") && !email.toLowerCase().includes("@gmail.");

  const handleToggle = (checked: boolean) => {
    if (checked && !isValidBusinessEmail) {
      return;
    }
    setIsEnabled(checked);
  };

  const handleSave = async () => {
    if (isEnabled && !isValidBusinessEmail) {
      toast.error("Please enter a valid business email (not a personal email like Gmail) to enable.");
      return;
    }
    try {
      setIsSaving(true);
      await fetcher.patch("/api/me/profile", {
        business_email: email.trim() || null,
        business_features_enabled: isEnabled,
      });
      toast.success("Business preferences saved.");
    } catch {
      toast.error("Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthGuard>
      <div className="w-full max-w-[1052px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 lg:py-12">
        <BackButton href="/account-settings" />
        <Breadcrumb
          items={[
            { label: "Account", href: "/account-settings" },
            { label: "Business Services" }
          ]}
        />
        <h2 className="text-2xl md:text-3xl lg:text-[32px] font-extrabold mb-6 md:mb-8 text-[#484848]">
          Business Services
        </h2>
        <div className="flex flex-col lg:flex-row justify-between gap-14">
          <div className="flex-1">
            <h3 className="text-2xl font-extrabold text-[#484848] mb-4">
              Beautonomi for Business
            </h3>
            <p className="text-base font-light text-[#484848] mb-7">
              Add your business email to access corporate packages, event booking tools,
              and professional development opportunities.
            </p>
            <Label className="text-base font-semibold text-[#484848]">
              Business email address
            </Label>
            <div className="border rounded-md my-2 py-1">
              <Input
                placeholder="business@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-0 focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-3 mt-4">
              <Switch
                checked={isEnabled}
                onCheckedChange={handleToggle}
                disabled={!isValidBusinessEmail}
              />
              <Label className="text-base font-semibold text-[#484848] cursor-pointer">
                Enable Business Features
              </Label>
            </div>
            {!isLoading && (
              <Button
                onClick={handleSave}
                disabled={isSaving || (isEnabled && !isValidBusinessEmail)}
                className="mt-6 bg-[#FF0077] hover:bg-[#E6006A] text-white"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {isSaving ? "Saving..." : "Save preferences"}
              </Button>
            )}
          </div>
          <div className="w-full lg:w-1/3 mt-8 lg:mt-0">
            {businessBenefits.map((benefit, index) => {
              const IconComponent = benefit.icon;
              return (
                <div key={index} className="mb-6 last:mb-0">
                  <IconComponent className="w-10 h-10 text-[#484848] mb-3" />
                  <h4 className="text-lg font-bold text-[#484848] mb-2">
                    {benefit.title}
                  </h4>
                  <p className="text-base font-light text-[#484848]">
                    {benefit.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
};

export default BusinessServices;