"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";

interface BeautyPreferences {
  hair_type?: string;
  skin_type?: string;
  allergies?: string[];
  things_to_avoid?: string;
  appointment_style?: string;
  preferred_times?: string[];
  preferred_days?: string[];
  product_preferences?: string;
}

interface BeautyPreferencesSectionProps {
  preferences: BeautyPreferences;
  onUpdate?: () => void;
}

const HAIR_TYPES = [
  { value: "straight", label: "Straight" },
  { value: "wavy", label: "Wavy" },
  { value: "curly", label: "Curly" },
  { value: "coily", label: "Coily" },
  { value: "other", label: "Other" },
];

const SKIN_TYPES = [
  { value: "dry", label: "Dry" },
  { value: "oily", label: "Oily" },
  { value: "combination", label: "Combination" },
  { value: "sensitive", label: "Sensitive" },
  { value: "normal", label: "Normal" },
];

const APPOINTMENT_STYLES = [
  { value: "quiet", label: "Quiet" },
  { value: "chatty", label: "Chatty" },
  { value: "either", label: "Either" },
];

const PREFERRED_TIMES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

const DAYS_OF_WEEK = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const ALLERGY_SUGGESTIONS = [
  "Fragrance",
  "Parabens",
  "Sulfates",
  "Alcohol",
  "Dyes",
  "Formaldehyde",
  "Latex",
  "Nickel",
];

export default function BeautyPreferencesSection({
  preferences = {},
  onUpdate,
}: BeautyPreferencesSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<BeautyPreferences>(preferences);
  const [allergyInput, setAllergyInput] = useState("");

  useEffect(() => {
    setFormData(preferences);
  }, [preferences]);

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

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(preferences);

  return (
    <Card id="beauty-preferences-section" className="w-full bg-white border border-gray-200 shadow-sm">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors bg-white border-b border-gray-200">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-900">
                Beauty Preferences
              </CardTitle>
              {isOpen ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden transition-all duration-300 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <CardContent className="pt-4 bg-white space-y-6">
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800">
                Providers see this when you book. Helps them prepare for your appointment.
              </p>
            </div>

            {/* Hair Type */}
            <div>
              <Label htmlFor="hair-type">Hair Type/Texture</Label>
              <Select
                value={formData.hair_type || ""}
                onValueChange={(value) =>
                  setFormData({ ...formData, hair_type: value })
                }
              >
                <SelectTrigger id="hair-type">
                  <SelectValue placeholder="Select hair type" />
                </SelectTrigger>
                <SelectContent>
                  {HAIR_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Skin Type */}
            <div>
              <Label htmlFor="skin-type">Skin Type</Label>
              <Select
                value={formData.skin_type || ""}
                onValueChange={(value) =>
                  setFormData({ ...formData, skin_type: value })
                }
              >
                <SelectTrigger id="skin-type">
                  <SelectValue placeholder="Select skin type" />
                </SelectTrigger>
                <SelectContent>
                  {SKIN_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Allergies */}
            <div>
              <Label htmlFor="allergies">Allergies & Sensitivities</Label>
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <input
                    id="allergies"
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
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddAllergy}
                  >
                    Add
                  </Button>
                </div>
                {ALLERGY_SUGGESTIONS.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {ALLERGY_SUGGESTIONS.map((allergy) => (
                      <Badge
                        key={allergy}
                        variant="outline"
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleAddSuggestedAllergy(allergy)}
                      >
                        + {allergy}
                      </Badge>
                    ))}
                  </div>
                )}
                {formData.allergies && formData.allergies.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.allergies.map((allergy) => (
                      <Badge
                        key={allergy}
                        variant="default"
                        className="bg-gray-100 text-gray-700 hover:bg-gray-200"
                      >
                        {allergy}
                        <button
                          onClick={() => handleRemoveAllergy(allergy)}
                          className="ml-2 hover:text-red-600"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Things to Avoid */}
            <div>
              <Label htmlFor="things-to-avoid">Things to Avoid</Label>
              <Textarea
                id="things-to-avoid"
                value={formData.things_to_avoid || ""}
                onChange={(e) =>
                  setFormData({ ...formData, things_to_avoid: e.target.value })
                }
                placeholder="List any products, ingredients, or techniques to avoid"
                rows={3}
                maxLength={200}
              />
            </div>

            {/* Appointment Style */}
            <div>
              <Label>Appointment Style</Label>
              <RadioGroup
                value={formData.appointment_style || ""}
                onValueChange={(value) =>
                  setFormData({ ...formData, appointment_style: value })
                }
                className="mt-2"
              >
                {APPOINTMENT_STYLES.map((style) => (
                  <div key={style.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={style.value} id={style.value} />
                    <Label htmlFor={style.value} className="font-normal cursor-pointer">
                      {style.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Preferred Times */}
            <div>
              <Label>Preferred Times</Label>
              <div className="mt-2 space-y-2">
                {PREFERRED_TIMES.map((time) => (
                  <div key={time.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={time.value}
                      checked={(formData.preferred_times || []).includes(time.value)}
                      onCheckedChange={(checked) => {
                        const current = formData.preferred_times || [];
                        if (checked) {
                          setFormData({
                            ...formData,
                            preferred_times: [...current, time.value],
                          });
                        } else {
                          setFormData({
                            ...formData,
                            preferred_times: current.filter((t) => t !== time.value),
                          });
                        }
                      }}
                    />
                    <Label htmlFor={time.value} className="font-normal cursor-pointer">
                      {time.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Preferred Days */}
            <div>
              <Label>Preferred Days</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={day.value}
                      checked={(formData.preferred_days || []).includes(day.value)}
                      onCheckedChange={(checked) => {
                        const current = formData.preferred_days || [];
                        if (checked) {
                          setFormData({
                            ...formData,
                            preferred_days: [...current, day.value],
                          });
                        } else {
                          setFormData({
                            ...formData,
                            preferred_days: current.filter((d) => d !== day.value),
                          });
                        }
                      }}
                    />
                    <Label htmlFor={day.value} className="font-normal cursor-pointer text-sm">
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Product Preferences */}
            <div>
              <Label htmlFor="product-preferences">Product Preferences (Optional)</Label>
              <Textarea
                id="product-preferences"
                value={formData.product_preferences || ""}
                onChange={(e) =>
                  setFormData({ ...formData, product_preferences: e.target.value })
                }
                placeholder="Any specific product preferences or brands you prefer"
                rows={3}
                maxLength={200}
              />
            </div>

            {/* Save Button */}
            {hasChanges && (
              <div className="pt-4 border-t">
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full bg-[#FF0077] hover:bg-[#E6006A] text-white"
                >
                  {isSaving ? "Saving..." : "Save Preferences"}
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
