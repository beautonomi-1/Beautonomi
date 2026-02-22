"use client";

import React, { useState, useEffect } from 'react';
import { motion } from "framer-motion";
import Breadcrumb from "@/components/ui/breadcrumb";
import BackButton from "@/components/ui/back-button";
import BottomNav from "@/components/layout/bottom-nav";
import AuthGuard from "@/components/auth/auth-guard";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Check, X, Globe, Loader2 } from "lucide-react";

type PreferenceField = "language" | "currency" | "timezone" | null;

interface PreferenceOption {
  id: string;
  type: 'language' | 'currency' | 'timezone';
  code: string | null;
  name: string;
  display_order: number;
  metadata?: any;
}

interface Preferences {
  language: { code: string; name: string } | null;
  currency: { code: string; name: string } | null;
  timezone: { code: string; name: string } | null;
}

const GlobalPreferences: React.FC = () => {
  const { user } = useAuth();
  const [editingField, setEditingField] = useState<PreferenceField>(null);
  const [preferences, setPreferences] = useState<Preferences>({
    language: null,
    currency: null,
    timezone: null,
  });
  const [tempValue, setTempValue] = useState<string>("");
  const [options, setOptions] = useState<{
    languages: PreferenceOption[];
    currencies: PreferenceOption[];
    timezones: PreferenceOption[];
  }>({
    languages: [],
    currencies: [],
    timezones: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      loadOptionsAndPreferences();
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps -- load when user changes

  const loadOptionsAndPreferences = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      
      // Load options and preferences in parallel
      const [langsRes, currenciesRes, timezonesRes, profileRes] = await Promise.all([
        fetcher.get<{ data: PreferenceOption[] }>("/api/public/preference-options?type=language"),
        fetcher.get<{ data: PreferenceOption[] }>("/api/public/preference-options?type=currency"),
        fetcher.get<{ data: PreferenceOption[] }>("/api/public/preference-options?type=timezone"),
        fetcher.get<{ 
          data: { 
            preferred_language: string | null; 
            preferred_currency: string | null; 
            timezone: string | null;
          } 
        }>("/api/me/profile", { cache: "no-store" }),
      ]);

      const loadedOptions = {
        languages: langsRes.data || [],
        currencies: currenciesRes.data || [],
        timezones: timezonesRes.data || [],
      };
      
      setOptions(loadedOptions);

      // Now load preferences with the loaded options
      const data = profileRes.data;
      const languageCode = data?.preferred_language || "en";
      const currencyCode = data?.preferred_currency || "ZAR";
      const timezoneCode = data?.timezone || "Africa/Johannesburg";

      const languageOption = loadedOptions.languages.find(l => l.code === languageCode) || 
        loadedOptions.languages.find(l => l.code === "en") || 
        { code: "en", name: "English" };
      const currencyOption = loadedOptions.currencies.find(c => c.code === currencyCode) || 
        loadedOptions.currencies.find(c => c.code === "ZAR") || 
        { code: "ZAR", name: "South African Rand" };
      const timezoneOption = loadedOptions.timezones.find(t => t.code === timezoneCode) || 
        loadedOptions.timezones.find(t => t.code === "Africa/Johannesburg") || 
        { code: "Africa/Johannesburg", name: "Africa/Johannesburg" };

      setPreferences({
        language: { code: languageOption.code || "en", name: languageOption.name },
        currency: { code: currencyOption.code || "ZAR", name: currencyOption.name },
        timezone: { code: timezoneOption.code || "Africa/Johannesburg", name: timezoneOption.name },
      });
    } catch (error) {
      console.error("Failed to load preferences:", error);
      toast.error("Failed to load preferences");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (field: PreferenceField) => {
    if (!field) return;
    
    if (editingField === field) {
      // Cancel edit
      setEditingField(null);
      setTempValue("");
    } else {
      // Start editing
      const currentValue = preferences[field]?.code || "";
      setTempValue(currentValue);
      setEditingField(field);
    }
  };

  const handleSave = async (field: PreferenceField) => {
    if (!field || !tempValue) return;

    try {
      setIsSaving(true);
      const updateData: Record<string, string> = {};
      
      if (field === "language") {
        updateData.preferred_language = tempValue;
      } else if (field === "currency") {
        updateData.preferred_currency = tempValue;
      } else if (field === "timezone") {
        updateData.timezone = tempValue;
      }

      await fetcher.patch("/api/me/profile", updateData);
      
      // Find the option to get the name
      const optionList = field === "language" ? options.languages : 
                        field === "currency" ? options.currencies : 
                        options.timezones;
      const selectedOption = optionList.find(o => o.code === tempValue);
      
      // Update preferences state
      setPreferences({
        ...preferences,
        [field]: {
          code: tempValue,
          name: selectedOption?.name || tempValue,
        },
      });
      
      toast.success(`${field === "language" ? "Language" : field === "currency" ? "Currency" : "Timezone"} updated successfully`);
      setEditingField(null);
      setTempValue("");
      router.refresh();
    } catch (error: any) {
      console.error("Failed to save preference:", error);
      toast.error(error.message || "Failed to save preference");
    } finally {
      setIsSaving(false);
    }
  };

  const getCurrentOptions = (field: PreferenceField): PreferenceOption[] => {
    if (field === "language") return options.languages;
    if (field === "currency") return options.currencies;
    return options.timezones;
  };

  const renderField = (
    label: string, 
    field: PreferenceField,
    icon: React.ReactNode
  ) => {
    if (!field) return null;
    
    const isEditing = editingField === field;
    const currentPreference = preferences[field];
    const currentOptions = getCurrentOptions(field);
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 mb-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-lg">
              {icon}
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tighter text-gray-900">{label}</h2>
              {!isEditing && currentPreference && (
                <p className="text-sm font-light text-gray-600 mt-1">{currentPreference.name}</p>
              )}
            </div>
          </div>
          
          {!isEditing ? (
            <motion.button
              onClick={() => handleEdit(field)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 text-[#FF0077] hover:bg-[#FF0077]/10 rounded-lg transition-colors font-medium"
            >
              <Edit className="w-4 h-4" />
              <span>Edit</span>
            </motion.button>
          ) : (
            <div className="flex items-center gap-2">
              <motion.button
                onClick={() => handleEdit(field)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isSaving}
              >
                <X className="w-4 h-4" />
              </motion.button>
              <motion.button
                onClick={() => handleSave(field)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 text-[#FF0077] hover:bg-[#FF0077]/10 rounded-lg transition-colors"
                disabled={isSaving || !tempValue}
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </motion.button>
            </div>
          )}
        </div>

        {isEditing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4"
          >
            <Select
              value={tempValue}
              onValueChange={setTempValue}
            >
              <SelectTrigger className="w-full backdrop-blur-sm bg-white/60 border-white/40">
                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {currentOptions.map((option) => (
                  <SelectItem key={option.id} value={option.code || option.name}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </motion.div>
        )}
      </motion.div>
    );
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <Breadcrumb 
            items={[
              { label: "Home", href: "/" },
              { label: "Account Settings", href: "/account-settings" },
              { label: "Global preferences" }
            ]} 
          />
          <BackButton href="/account-settings" />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-6"
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-8">
              Global preferences
            </h1>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-[#FF0077] animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Main Content */}
                <div className="w-full lg:w-2/3">
                  {renderField("Preferred language", "language", <Globe className="w-5 h-5 text-[#FF0077]" />)}
                  {renderField("Preferred currency", "currency", <Globe className="w-5 h-5 text-[#FF0077]" />)}
                  {renderField("Time zone", "timezone", <Globe className="w-5 h-5 text-[#FF0077]" />)}
                </div>

                {/* Sidebar */}
                <div className="w-full lg:w-1/3">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 sticky top-6"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-xl">
                        <Globe className="w-6 h-6 text-[#FF0077]" />
                      </div>
                      <h2 className="text-lg font-semibold tracking-tighter text-gray-900">
                        Your global preferences
                      </h2>
                    </div>
                    <p className="text-sm font-light text-gray-600 leading-relaxed">
                      Changing your currency updates how you see prices. You can change how you get payments in your payments & payouts preferences.
                    </p>
                  </motion.div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
        <BottomNav />
      </div>
    </AuthGuard>
  );
};

export default GlobalPreferences;
