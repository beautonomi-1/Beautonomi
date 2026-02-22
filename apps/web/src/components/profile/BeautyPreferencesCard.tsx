"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Info,
  X,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import type { BeautyPreferences } from "@/types/profile";

interface BeautyPreferencesCardProps {
  preferences: BeautyPreferences;
  onUpdate?: () => void;
}

const HAIR_TYPES = [
  { value: "straight", label: "Straight", icon: "📏" },
  { value: "wavy", label: "Wavy", icon: "🌊" },
  { value: "curly", label: "Curly", icon: "🌀" },
  { value: "coily", label: "Coily", icon: "🌪️" },
  { value: "other", label: "Other", icon: "✨" },
];

const SKIN_TYPES = [
  { value: "dry", label: "Dry", icon: "🏜️" },
  { value: "oily", label: "Oily", icon: "💧" },
  { value: "combination", label: "Combination", icon: "⚖️" },
  { value: "sensitive", label: "Sensitive", icon: "🌿" },
  { value: "normal", label: "Normal", icon: "✨" },
];

const ALLERGY_SUGGESTIONS = [
  "Fragrance",
  "Parabens",
  "Sulfates",
  "Alcohol",
  "Dye",
  "Formaldehyde",
  "Latex",
  "Nickel",
];

const PREFERRED_TIMES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

const DAYS_OF_WEEK = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

export default function BeautyPreferencesCard({
  preferences = {},
  onUpdate,
}: BeautyPreferencesCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<BeautyPreferences>(preferences);
  const [allergyInput, setAllergyInput] = useState("");
  const [otherAppointmentStyle, setOtherAppointmentStyle] = useState("");

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(preferences);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetcher.patch("/api/me/beauty-preferences", formData);
      toast.success("Beauty preferences saved");
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAllergy = () => {
    if (!allergyInput.trim()) return;
    const newAllergies = [...(formData.allergies || []), allergyInput.trim()];
    setFormData({ ...formData, allergies: newAllergies });
    setAllergyInput("");
  };

  const handleRemoveAllergy = (allergy: string) => {
    const newAllergies = (formData.allergies || []).filter((a) => a !== allergy);
    setFormData({ ...formData, allergies: newAllergies });
  };

  const handleAddSuggestedAllergy = (allergy: string) => {
    if ((formData.allergies || []).includes(allergy)) return;
    const newAllergies = [...(formData.allergies || []), allergy];
    setFormData({ ...formData, allergies: newAllergies });
  };

  const togglePreferredTime = (time: string) => {
    const current = formData.preferred_times || [];
    if (current.includes(time)) {
      setFormData({
        ...formData,
        preferred_times: current.filter((t) => t !== time),
      });
    } else {
      setFormData({
        ...formData,
        preferred_times: [...current, time],
      });
    }
  };

  const togglePreferredDay = (day: string) => {
    const current = formData.preferred_days || [];
    if (current.includes(day)) {
      setFormData({
        ...formData,
        preferred_days: current.filter((d) => d !== day),
      });
    } else {
      setFormData({
        ...formData,
        preferred_days: [...current, day],
      });
    }
  };

  return (
    <div className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 flex items-center justify-between hover:bg-white/40 transition-colors"
        aria-expanded={isOpen}
      >
        <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
          Beauty Preferences
        </h3>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-zinc-500" />
        ) : (
          <ChevronDown className="h-5 w-5 text-zinc-500" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-6 border-t border-white/40">
              {/* Info Banner */}
              <div className="flex items-start gap-3 p-4 bg-blue-50/80 border border-blue-200/50 rounded-xl">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Provides data when you book. Helps them prepare for your appointment.
                </p>
              </div>

              {/* Hair Type */}
              <div>
                <label className="text-sm font-medium text-zinc-900 mb-3 block">
                  Hair Type/Texture
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {HAIR_TYPES.map((type) => (
                    <motion.button
                      key={type.value}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setFormData({ ...formData, hair_type: type.value })}
                      className={`
                        p-4 rounded-xl border-2 transition-all
                        ${
                          formData.hair_type === type.value
                              ? "bg-[#FF0077] text-white border-[#FF0077] shadow-lg"
                              : "bg-white/60 border-zinc-200 hover:border-zinc-300 text-zinc-700"
                        }
                      `}
                    >
                      <div className="text-2xl mb-1">{type.icon}</div>
                      <div className="text-xs font-medium">{type.label}</div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Skin Type */}
              <div>
                <label className="text-sm font-medium text-zinc-900 mb-3 block">
                  Skin Type
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {SKIN_TYPES.map((type) => (
                    <motion.button
                      key={type.value}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setFormData({ ...formData, skin_type: type.value })}
                      className={`
                        p-4 rounded-xl border-2 transition-all
                        ${
                          formData.skin_type === type.value
                              ? "bg-[#FF0077] text-white border-[#FF0077] shadow-lg"
                              : "bg-white/60 border-zinc-200 hover:border-zinc-300 text-zinc-700"
                        }
                      `}
                    >
                      <div className="text-2xl mb-1">{type.icon}</div>
                      <div className="text-xs font-medium">{type.label}</div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Allergies */}
              <div>
                <label className="text-sm font-medium text-zinc-900 mb-3 block">
                  Allergies & Sensitivities
                </label>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={allergyInput}
                      onChange={(e) => setAllergyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddAllergy();
                        }
                      }}
                      placeholder="Add allergy or sensitivity"
                      className="flex-1 px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF0077] text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddAllergy}
                      className="border-zinc-300"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                  {ALLERGY_SUGGESTIONS.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {ALLERGY_SUGGESTIONS.map((allergy) => (
                        <motion.button
                          key={allergy}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleAddSuggestedAllergy(allergy)}
                          disabled={(formData.allergies || []).includes(allergy)}
                          className={`
                            px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                            ${
                              (formData.allergies || []).includes(allergy)
                                ? "bg-zinc-200 text-zinc-500 border-zinc-300 cursor-not-allowed"
                                : "bg-white/60 text-zinc-700 border-zinc-300 hover:bg-zinc-50"
                            }
                          `}
                        >
                          + {allergy}
                        </motion.button>
                      ))}
                    </div>
                  )}
                  {formData.allergies && formData.allergies.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.allergies.map((allergy) => (
                        <motion.span
                          key={allergy}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#FF0077] text-white flex items-center gap-2 group"
                        >
                          {allergy}
                          <button
                            onClick={() => handleRemoveAllergy(allergy)}
                            className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                            aria-label={`Remove ${allergy}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </motion.span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Things to Avoid */}
              <div>
                <label htmlFor="things-to-avoid" className="text-sm font-medium text-zinc-900 mb-2 block">
                  Things to Avoid
                </label>
                <Textarea
                  id="things-to-avoid"
                  value={formData.things_to_avoid || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, things_to_avoid: e.target.value })
                  }
                  placeholder="List any products, ingredients, or techniques to avoid"
                  rows={3}
                  maxLength={200}
                  className="border-zinc-300 focus:ring-[#FF0077]"
                />
              </div>

              {/* Appointment Style */}
              <div>
                <label className="text-sm font-medium text-zinc-900 mb-3 block">
                  Appointment Style
                </label>
                <AppointmentStyleToggle
                  value={formData.appointment_style || ""}
                  onChange={(value) => setFormData({ ...formData, appointment_style: value })}
                  otherValue={otherAppointmentStyle}
                  onOtherChange={setOtherAppointmentStyle}
                />
              </div>

              {/* Preferred Times */}
              <div>
                <label className="text-sm font-medium text-zinc-900 mb-3 block">
                  Preferred Times
                </label>
                <div className="flex flex-wrap gap-2">
                  {PREFERRED_TIMES.map((time) => {
                    const isSelected = (formData.preferred_times || []).includes(time.value);
                    return (
                      <motion.button
                        key={time.value}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => togglePreferredTime(time.value)}
                        className={`
                          px-4 py-2 rounded-full text-sm font-medium border-2 transition-all
                          ${
                            isSelected
                              ? "bg-zinc-900 text-white border-zinc-900 shadow-lg"
                              : "bg-white/60 text-zinc-700 border-zinc-200 hover:border-zinc-300"
                          }
                        `}
                      >
                        {time.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Preferred Days */}
              <div>
                <label className="text-sm font-medium text-zinc-900 mb-3 block">
                  Preferred Days
                </label>
                <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                  {DAYS_OF_WEEK.map((day) => {
                    const isSelected = (formData.preferred_days || []).includes(day.value);
                    return (
                      <motion.button
                        key={day.value}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => togglePreferredDay(day.value)}
                        className={`
                          px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all
                          ${
                            isSelected
                              ? "bg-zinc-900 text-white border-zinc-900 shadow-lg"
                              : "bg-white/60 text-zinc-700 border-zinc-200 hover:border-zinc-300"
                          }
                        `}
                      >
                        {day.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Save Button */}
              {hasChanges && (
                <div className="pt-4 border-t border-zinc-200">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full bg-[#FF0077] hover:bg-[#E6006A] text-white"
                  >
                    {isSaving ? "Saving..." : "Save Preferences"}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// iOS Focus-mode style toggle
interface AppointmentStyleToggleProps {
  value: string;
  onChange: (value: string) => void;
  otherValue: string;
  onOtherChange: (value: string) => void;
}

function AppointmentStyleToggle({
  value,
  onChange,
  otherValue,
  onOtherChange,
}: AppointmentStyleToggleProps) {
  const [showOther, setShowOther] = useState(value === "other" || !!otherValue);

  return (
    <div className="space-y-3">
      <div className="relative inline-flex p-1 bg-zinc-100 rounded-full border border-zinc-200">
        <motion.div
          className="absolute inset-y-1 left-1 bg-white rounded-full shadow-sm"
          style={{
            width: "calc(33.333% - 0.25rem)",
          }}
          animate={{
            x: value === "quiet" ? 0 : value === "chatty" ? "100%" : "200%",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
        <div className="relative flex gap-1">
          {["quiet", "chatty", "other"].map((option) => (
            <button
              key={option}
              onClick={() => {
                onChange(option);
                if (option === "other") {
                  setShowOther(true);
                } else {
                  setShowOther(false);
                  onOtherChange("");
                }
              }}
              className={`
                relative z-10 px-6 py-2 rounded-full text-sm font-medium transition-colors
                ${
                  value === option
                    ? "text-[#FF0077] font-semibold"
                    : "text-zinc-500 hover:text-zinc-700"
                }
              `}
            >
              {option === "quiet" ? "Quiet" : option === "chatty" ? "Chatty" : "Other"}
            </button>
          ))}
        </div>
      </div>
      {showOther && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
        >
          <input
            type="text"
            value={otherValue}
            onChange={(e) => {
              onOtherChange(e.target.value);
              if (e.target.value) onChange("other");
            }}
            placeholder="Describe your preference"
            className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF0077] text-sm"
          />
        </motion.div>
      )}
    </div>
  );
}
