"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

interface GeoResult {
  place_name: string;
  center: [number, number];
  relevance: number;
  context?: Array<{ id: string; text: string }>;
}

const COUNTRY_CODES = [
  { code: "+27", country: "ZA", flag: "🇿🇦", label: "South Africa" },
  { code: "+1", country: "US", flag: "🇺🇸", label: "United States" },
  { code: "+44", country: "GB", flag: "🇬🇧", label: "United Kingdom" },
  { code: "+61", country: "AU", flag: "🇦🇺", label: "Australia" },
  { code: "+91", country: "IN", flag: "🇮🇳", label: "India" },
  { code: "+234", country: "NG", flag: "🇳🇬", label: "Nigeria" },
  { code: "+254", country: "KE", flag: "🇰🇪", label: "Kenya" },
];

const SOURCE_OPTIONS = [
  "manual",
  "referral",
  "campaign",
  "outbound",
  "form",
] as const;

export default function NewLeadPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  // Form state
  const [businessName, setBusinessName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+27");
  const [phoneNational, setPhoneNational] = useState("");
  const [source, setSource] = useState<string>("manual");
  const [sourceDetail, setSourceDetail] = useState("");
  const [locationText, setLocationText] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [locationConfidence, setLocationConfidence] = useState<string | null>(
    null
  );
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Geocoding state
  const [geocoding, setGeocoding] = useState(false);
  

  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetcher.get<{ data: Category[] }>(
          "/api/admin/provider-ops/categories"
        );
        setCategories(res.data || []);
      } catch {
        toast.error("Failed to load categories");
      } finally {
        setCategoriesLoaded(true);
      }
    }
    loadCategories();
  }, []);

  const phoneE164 = phoneNational
    ? `${phoneCountryCode}${phoneNational.replace(/^0+/, "")}`
    : "";

  // Geocode location on blur
  const handleGeocode = useCallback(async () => {
    if (!locationText.trim()) return;
    try {
      setGeocoding(true);
      const res = await fetcher.post<{ data: GeoResult[] }>(
        "/api/mapbox/geocode",
        { query: locationText.trim() }
      );
      const features = res.data || [];

      if (features.length > 0) {
        const best = features[0];
        const confidence = best.relevance >= 0.7 ? "high" : best.relevance >= 0.4 ? "medium" : "low";
        setResolvedLocation({
          place_name: best.place_name,
          latitude: best.center?.[1],
          longitude: best.center?.[0],
          confidence: best.relevance,
        });
        setLocationConfidence(confidence);

        const countryCtx = best.context?.find((c) =>
          c.id.startsWith("country")
        );
        if (countryCtx) setCountry(countryCtx.text);
      } else {
        setResolvedLocation(null);
        setLocationConfidence("none");
      }
    } catch {
      setLocationConfidence("none");
    } finally {
      setGeocoding(false);
    }
  }, [locationText]);

  const handleSubmit = async () => {
    if (!businessName.trim() && !contactPerson.trim()) {
      toast.error("Please provide a business name or contact person name");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        business_name: businessName.trim() || null,
        contact_person_name: contactPerson.trim() || null,
        email: email.trim() || null,
        phone_country_code: phoneNational ? phoneCountryCode : null,
        phone_national: phoneNational || null,
        phone_e164: phoneE164 || null,
        source,
        source_detail: sourceDetail.trim() || null,
        suggested_location_text: locationText.trim() || null,
        resolved_location: resolvedLocation,
        location_confidence: locationConfidence,
        country: country || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        category_ids: selectedCategoryIds,
        tags,
      };

      const res = await fetcher.post<{ data: { id: string } }>(
        "/api/admin/provider-ops/leads",
        payload
      );
      toast.success("Lead created successfully");
      router.push(`/admin/provider-ops/leads/${res.data.id}`);
    } catch (err) {
      if (err instanceof FetchError) toast.error(err.message);
      else toast.error("Failed to create lead");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/admin/provider-ops/leads"
          className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Leads
        </Link>

        <h1 className="text-2xl font-bold text-zinc-900">New Lead</h1>

        <div className="bg-white border rounded-xl divide-y">
          {/* Business Info */}
          <Section title="Business Information">
            <FormField label="Business Name">
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Glow Beauty Studio"
              />
            </FormField>
            <FormField label="Contact Person">
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </FormField>
          </Section>

          {/* Contact */}
          <Section title="Contact Information">
            <FormField label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </FormField>
            <FormField label="Phone">
              <div className="flex gap-2">
                <select
                  value={phoneCountryCode}
                  onChange={(e) => setPhoneCountryCode(e.target.value)}
                  className="border rounded-md px-2 py-2 text-sm bg-white w-[140px]"
                >
                  {COUNTRY_CODES.map((cc) => (
                    <option key={cc.code} value={cc.code}>
                      {cc.flag} {cc.code} {cc.country}
                    </option>
                  ))}
                </select>
                <Input
                  value={phoneNational}
                  onChange={(e) => setPhoneNational(e.target.value)}
                  placeholder="612345678"
                  className="flex-1"
                />
              </div>
              {phoneE164 && (
                <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> E.164: {phoneE164}
                </p>
              )}
            </FormField>
          </Section>

          {/* Location */}
          <Section title="Location">
            <FormField label="Business Location">
              <div className="relative">
                <Input
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  onBlur={handleGeocode}
                  placeholder="e.g. Sandton, Johannesburg"
                />
                {geocoding && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-zinc-400" />
                )}
              </div>
              {locationConfidence && (
                <div className="mt-2 flex items-center gap-2">
                  {locationConfidence === "high" ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : locationConfidence === "medium" ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-xs text-zinc-600">
                    {resolvedLocation
                      ? (resolvedLocation.place_name as string)
                      : "Could not verify location"}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] ${
                      locationConfidence === "high"
                        ? "bg-green-100 text-green-700"
                        : locationConfidence === "medium"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {locationConfidence}
                  </Badge>
                </div>
              )}
            </FormField>
          </Section>

          {/* Categories */}
          <Section title="Categories">
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    selectedCategoryIds.includes(cat.id)
                      ? "bg-blue-100 border-blue-300 text-blue-700"
                      : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
              {categories.length === 0 && (
                <p className="text-xs text-zinc-400">
                  {categoriesLoaded ? "No categories available" : "Loading categories..."}
                </p>
              )}
            </div>
          </Section>

          {/* Source & Description */}
          <Section title="Source & Details">
            <FormField label="Source">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              >
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </FormField>
            {(source === "campaign" || source === "referral") && (
              <FormField label="Source Detail">
                <Input
                  value={sourceDetail}
                  onChange={(e) => setSourceDetail(e.target.value)}
                  placeholder={
                    source === "campaign"
                      ? "Campaign name or ID"
                      : "Referrer name"
                  }
                />
              </FormField>
            )}
            <FormField label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the lead..."
                rows={3}
                className="w-full border rounded-md px-3 py-2 text-sm resize-none"
              />
            </FormField>
            <FormField label="Internal Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Private admin notes..."
                rows={2}
                className="w-full border rounded-md px-3 py-2 text-sm resize-none"
              />
            </FormField>
          </Section>

          {/* Tags */}
          <Section title="Tags">
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                placeholder="Add a tag..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs cursor-pointer hover:bg-red-100"
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Submit */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Link href="/admin/provider-ops/leads" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Create Lead
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-zinc-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
