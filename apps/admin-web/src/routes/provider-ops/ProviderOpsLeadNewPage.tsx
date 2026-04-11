import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminSpaTo } from "@/lib/adminSpaPath";

interface Category { id: string; name: string; slug: string; icon: string | null }

const COUNTRY_CODES = [
  { code: "+27", country: "ZA", label: "🇿🇦 +27 ZA" },
  { code: "+1", country: "US", label: "🇺🇸 +1 US" },
  { code: "+44", country: "GB", label: "🇬🇧 +44 GB" },
  { code: "+61", country: "AU", label: "🇦🇺 +61 AU" },
  { code: "+91", country: "IN", label: "🇮🇳 +91 IN" },
  { code: "+234", country: "NG", label: "🇳🇬 +234 NG" },
  { code: "+254", country: "KE", label: "🇰🇪 +254 KE" },
];

const SOURCE_OPTIONS = ["manual", "referral", "campaign", "outbound", "form"] as const;

export function ProviderOpsLeadNewPage() {
  const navigate = useNavigate();
  const { denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+27");
  const [phoneNational, setPhoneNational] = useState("");
  const [source, setSource] = useState("manual");
  const [sourceDetail, setSourceDetail] = useState("");
  const [locationText, setLocationText] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState<Record<string, unknown> | null>(null);
  const [locationConfidence, setLocationConfidence] = useState<string | null>(null);
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const catQ = useQuery({
    queryKey: adminQueryKeys.providerOps.categories(),
    queryFn: () => adminApi.getJson<{ data: Category[] }>("/api/admin/provider-ops/categories"),
  });
  const categories = catQ.data?.data ?? [];
  const phoneE164 = phoneNational ? `${phoneCountryCode}${phoneNational.replace(/^0+/, "")}` : "";

  const handleGeocode = useCallback(async () => {
    if (!locationText.trim()) return;
    try {
      setGeocoding(true);
      const res = await fetch("/api/mapbox/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: locationText.trim() }), credentials: "include" });
      if (!res.ok) { setLocationConfidence("none"); return; }
      const json = await res.json();
      const features = json.data || [];
      if (features.length > 0) {
        const best = features[0];
        setResolvedLocation({ place_name: best.place_name, latitude: best.center?.[1], longitude: best.center?.[0], confidence: best.relevance });
        setLocationConfidence(best.relevance >= 0.7 ? "high" : best.relevance >= 0.4 ? "medium" : "low");
        const cc = best.context?.find((c: { id: string; text: string }) => c.id.startsWith("country"));
        if (cc) setCountry(cc.text);
      } else { setResolvedLocation(null); setLocationConfidence("none"); }
    } catch { setLocationConfidence("none"); }
    finally { setGeocoding(false); }
  }, [locationText]);

  useEffect(() => { /* reset */ }, []);

  const handleSubmit = async () => {
    if (!businessName.trim() && !contactPerson.trim()) { setError("Provide a business name or contact person"); return; }
    try {
      setSubmitting(true); setError(null);
      const res = await adminApi.postJson<{ data: { id: string } }>("/api/admin/provider-ops/leads", {
        business_name: businessName.trim() || null, contact_person_name: contactPerson.trim() || null,
        email: email.trim() || null, phone_country_code: phoneNational ? phoneCountryCode : null,
        phone_national: phoneNational || null, phone_e164: phoneE164 || null, source,
        source_detail: sourceDetail.trim() || null, suggested_location_text: locationText.trim() || null,
        resolved_location: resolvedLocation, location_confidence: locationConfidence, country: country || null,
        description: description.trim() || null, notes: notes.trim() || null, category_ids: selectedCategoryIds, tags,
      });
      navigate(adminSpaTo(`/admin/provider-ops/leads/${res.data.id}`));
    } catch (err) { setError((err as Error).message || "Failed to create lead"); }
    finally { setSubmitting(false); }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <Link to={adminSpaTo("/admin/provider-ops/leads")} className="text-sm text-gray-500 hover:text-gray-700">← Back to Leads</Link>
      <AdminPageHeader title="New Lead" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <AdminPanel>
        <div className="space-y-6 divide-y">
          <FormSection title="Business Information">
            <FormField label="Business Name"><input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Glow Beauty Studio" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
            <FormField label="Contact Person"><input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="e.g. Jane Smith" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
          </FormSection>

          <FormSection title="Contact">
            <FormField label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
            <FormField label="Phone">
              <div className="flex gap-2">
                <select value={phoneCountryCode} onChange={(e) => setPhoneCountryCode(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm">
                  {COUNTRY_CODES.map((cc) => <option key={cc.code} value={cc.code}>{cc.label}</option>)}
                </select>
                <input type="text" value={phoneNational} onChange={(e) => setPhoneNational(e.target.value)} placeholder="612345678" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              {phoneE164 && <p className="mt-1 text-xs text-gray-400">E.164: {phoneE164}</p>}
            </FormField>
          </FormSection>

          <FormSection title="Location">
            <FormField label="Business Location">
              <input type="text" value={locationText} onChange={(e) => setLocationText(e.target.value)} onBlur={handleGeocode} placeholder="e.g. Sandton, Johannesburg" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              {geocoding && <p className="mt-1 text-xs text-gray-400">Resolving location...</p>}
              {locationConfidence && (
                <p className={`mt-1 text-xs ${locationConfidence === "high" ? "text-green-600" : locationConfidence === "medium" ? "text-amber-600" : "text-red-600"}`}>
                  {resolvedLocation ? String(resolvedLocation.place_name) : "Could not verify location"} ({locationConfidence})
                </p>
              )}
            </FormField>
          </FormSection>

          <FormSection title="Categories">
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button key={cat.id} type="button" onClick={() => setSelectedCategoryIds((prev) => prev.includes(cat.id) ? prev.filter((c) => c !== cat.id) : [...prev, cat.id])}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${selectedCategoryIds.includes(cat.id) ? "border-blue-300 bg-blue-100 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
                  {cat.name}
                </button>
              ))}
              {categories.length === 0 && <p className="text-xs text-gray-400">Loading categories...</p>}
            </div>
          </FormSection>

          <FormSection title="Source & Details">
            <FormField label="Source">
              <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </FormField>
            {(source === "campaign" || source === "referral") && (
              <FormField label="Source Detail"><input type="text" value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} placeholder={source === "campaign" ? "Campaign name" : "Referrer name"} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
            )}
            <FormField label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description..." rows={3} className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
            <FormField label="Internal Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Private admin notes..." rows={2} className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
          </FormSection>

          <FormSection title="Tags">
            <div className="flex gap-2">
              <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = tagInput.trim(); if (t && !tags.includes(t)) setTags([...tags, t]); setTagInput(""); } }} placeholder="Add a tag..." className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button type="button" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50" onClick={() => { const t = tagInput.trim(); if (t && !tags.includes(t)) setTags([...tags, t]); setTagInput(""); }}>Add</button>
            </div>
            {tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{tags.map((tag) => <span key={tag} className="cursor-pointer rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-red-100" onClick={() => setTags(tags.filter((t) => t !== tag))}>{tag} ×</span>)}</div>}
          </FormSection>
        </div>
      </AdminPanel>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <Link to={adminSpaTo("/admin/provider-ops/leads")} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</Link>
        <button type="button" disabled={submitting} onClick={handleSubmit} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">{submitting ? "Creating..." : "Create Lead"}</button>
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-4 pt-5 first:pt-0"><h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>{children}</div>;
}
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm text-gray-600">{label}</label>{children}</div>;
}
