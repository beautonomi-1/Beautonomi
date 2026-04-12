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
import { LocationPinnerDialog, type PinnedLocation } from "@/components/maps/LocationPinnerDialog";
import { ChevronDown, ChevronRight, MapPinned, Plus, Trash2 } from "lucide-react";

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

const COUNTRIES = [
  { code: "ZA", label: "South Africa" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
  { code: "NG", label: "Nigeria" },
  { code: "KE", label: "Kenya" },
  { code: "GH", label: "Ghana" },
  { code: "CA", label: "Canada" },
  { code: "AE", label: "UAE" },
];

const SOURCE_OPTIONS = ["manual", "referral", "campaign", "outbound", "form"] as const;

const LANGUAGE_OPTIONS = ["English", "Afrikaans", "Zulu", "Xhosa", "Sotho", "Tswana", "Venda", "Tsonga", "Swati", "Ndebele", "French", "Portuguese", "Spanish", "Arabic", "Hindi"];

const DEFAULT_HOURS: Record<string, { open: string; close: string; closed: boolean }> = {
  Monday: { open: "09:00", close: "17:00", closed: false },
  Tuesday: { open: "09:00", close: "17:00", closed: false },
  Wednesday: { open: "09:00", close: "17:00", closed: false },
  Thursday: { open: "09:00", close: "17:00", closed: false },
  Friday: { open: "09:00", close: "17:00", closed: false },
  Saturday: { open: "09:00", close: "13:00", closed: false },
  Sunday: { open: "09:00", close: "13:00", closed: true },
};

interface ServiceRow {
  name: string;
  duration_minutes: number;
  price: number;
  currency: string;
  at_home: boolean;
  at_salon: boolean;
}

function emptyServiceRow(): ServiceRow {
  return { name: "", duration_minutes: 60, price: 0, currency: "ZAR", at_home: false, at_salon: true };
}

export function ProviderOpsLeadNewPage() {
  const navigate = useNavigate();
  const { denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Core lead fields
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

  // Onboarding: Business Profile
  const [businessType, setBusinessType] = useState<string>("");
  const [teamSize, setTeamSize] = useState<string>("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState<string>("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [facebookUrl, setFacebookUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");

  // Onboarding: Business Address
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrPostalCode, setAddrPostalCode] = useState("");
  const [addrCountry, setAddrCountry] = useState("");
  const [addrLat, setAddrLat] = useState("");
  const [addrLng, setAddrLng] = useState("");
  const [showPinDialog, setShowPinDialog] = useState(false);

  // Onboarding: Services
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([]);

  // Onboarding: Payment & Tax
  const [isVatRegistered, setIsVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [acceptsTips, setAcceptsTips] = useState(false);
  const [cancellationWindowHours, setCancellationWindowHours] = useState<string>("");
  const [requiresDeposit, setRequiresDeposit] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState<string>("");

  // Onboarding: Operating Hours
  const [operatingHours, setOperatingHours] = useState<Record<string, { open: string; close: string; closed: boolean }>>(() => JSON.parse(JSON.stringify(DEFAULT_HOURS)));

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const catQ = useQuery({
    queryKey: adminQueryKeys.providerOps.categories(),
    queryFn: () => adminApi.getJson<{ data: Category[] }>("/api/admin/provider-ops/categories"),
  });
  const categories = catQ.data?.data ?? [];
  const phoneE164 = phoneNational ? `${phoneCountryCode}${phoneNational.replace(/^0+/, "")}` : "";

  const toggleSection = (key: string) => setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

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

  const buildOnboardingData = () => {
    const data: Record<string, unknown> = {};
    if (businessType) data.business_type = businessType;
    if (teamSize) data.team_size = teamSize;
    if (websiteUrl.trim()) data.website_url = websiteUrl.trim();
    if (yearsInBusiness) data.years_in_business = Number(yearsInBusiness);
    if (languages.length > 0) data.languages = languages;
    const social: Record<string, string> = {};
    if (facebookUrl.trim()) social.facebook = facebookUrl.trim();
    if (instagramUrl.trim()) social.instagram = instagramUrl.trim();
    if (twitterUrl.trim()) social.twitter = twitterUrl.trim();
    if (Object.keys(social).length > 0) data.social_media = social;

    const addr: Record<string, unknown> = {};
    if (addressLine1.trim()) addr.address_line1 = addressLine1.trim();
    if (addressLine2.trim()) addr.address_line2 = addressLine2.trim();
    if (addrCity.trim()) addr.city = addrCity.trim();
    if (addrState.trim()) addr.state = addrState.trim();
    if (addrPostalCode.trim()) addr.postal_code = addrPostalCode.trim();
    if (addrCountry) addr.country = addrCountry;
    if (addrLat) addr.latitude = Number(addrLat);
    if (addrLng) addr.longitude = Number(addrLng);
    if (Object.keys(addr).length > 0) data.address = addr;

    const validServices = serviceRows.filter((s) => s.name.trim());
    if (validServices.length > 0) data.services = validServices;

    const payment: Record<string, unknown> = {};
    if (isVatRegistered) { payment.is_vat_registered = true; if (vatNumber.trim()) payment.vat_number = vatNumber.trim(); }
    if (acceptsTips) payment.accepts_tips = true;
    if (cancellationWindowHours) payment.cancellation_window_hours = Number(cancellationWindowHours);
    if (requiresDeposit) { payment.requires_deposit = true; if (depositPercentage) payment.deposit_percentage = Number(depositPercentage); }
    if (Object.keys(payment).length > 0) data.payment = payment;

    const hasHoursChanged = JSON.stringify(operatingHours) !== JSON.stringify(DEFAULT_HOURS);
    if (hasHoursChanged) data.operating_hours = operatingHours;

    return Object.keys(data).length > 0 ? data : null;
  };

  const handleSubmit = async () => {
    if (!businessName.trim() && !contactPerson.trim()) { setError("Provide a business name or contact person"); return; }
    try {
      setSubmitting(true); setError(null);
      const onboardingData = buildOnboardingData();
      const res = await adminApi.postJson<{ data: { id: string } }>("/api/admin/provider-ops/leads", {
        business_name: businessName.trim() || null, contact_person_name: contactPerson.trim() || null,
        email: email.trim() || null, phone_country_code: phoneNational ? phoneCountryCode : null,
        phone_national: phoneNational || null, phone_e164: phoneE164 || null, source,
        source_detail: sourceDetail.trim() || null, suggested_location_text: locationText.trim() || null,
        resolved_location: resolvedLocation, location_confidence: locationConfidence, country: country || null,
        description: description.trim() || null, notes: notes.trim() || null, category_ids: selectedCategoryIds, tags,
        ...(onboardingData ? { onboarding_data: onboardingData } : {}),
      });
      navigate(adminSpaTo(`/admin/provider-ops/leads/${res.data.id}`));
    } catch (err) { setError((err as Error).message || "Failed to create lead"); }
    finally { setSubmitting(false); }
  };

  const handleLocationPinned = (loc: PinnedLocation) => {
    setAddressLine1(loc.address_line1 || "");
    setAddrCity(loc.city || "");
    if (loc.state) setAddrState(loc.state);
    if (loc.postal_code) setAddrPostalCode(loc.postal_code);
    if (loc.country) setAddrCountry(loc.country);
    setAddrLat(String(loc.latitude));
    setAddrLng(String(loc.longitude));
  };

  const updateServiceRow = (idx: number, patch: Partial<ServiceRow>) => {
    setServiceRows((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const updateDayHours = (day: string, patch: Partial<{ open: string; close: string; closed: boolean }>) => {
    setOperatingHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
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

      {/* Onboarding Sections */}
      <AdminPanel>
        <div className="space-y-0 divide-y divide-gray-100">
          {/* Business Profile */}
          <CollapsibleSection
            title="Business Profile"
            expanded={!!expandedSections.profile}
            onToggle={() => toggleSection("profile")}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Business Type">
                <div className="flex flex-wrap gap-2">
                  {[{ value: "salon", label: "Salon/Studio" }, { value: "mobile", label: "Mobile/Freelancer" }, { value: "both", label: "Both" }].map((opt) => (
                    <label key={opt.value} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${businessType === opt.value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
                      <input type="radio" name="businessType" value={opt.value} checked={businessType === opt.value} onChange={(e) => setBusinessType(e.target.value)} className="sr-only" />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </FormField>
              <FormField label="Team Size">
                <div className="flex flex-wrap gap-2">
                  {[{ value: "freelancer", label: "Solo Freelancer" }, { value: "small", label: "Small (2-5)" }, { value: "medium", label: "Medium (6-15)" }, { value: "large", label: "Large (16+)" }].map((opt) => (
                    <label key={opt.value} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${teamSize === opt.value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
                      <input type="radio" name="teamSize" value={opt.value} checked={teamSize === opt.value} onChange={(e) => setTeamSize(e.target.value)} className="sr-only" />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </FormField>
              <FormField label="Website URL">
                <input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </FormField>
              <FormField label="Years in Business">
                <input type="number" min={0} value={yearsInBusiness} onChange={(e) => setYearsInBusiness(e.target.value)} placeholder="e.g. 5" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Languages Spoken">
                  <div className="flex flex-wrap gap-1.5">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <button key={lang} type="button" onClick={() => setLanguages((prev) => prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang])}
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${languages.includes(lang) ? "border-blue-300 bg-blue-100 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
                        {lang}
                      </button>
                    ))}
                  </div>
                </FormField>
              </div>
              <FormField label="Facebook URL"><input type="url" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/business" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
              <FormField label="Instagram URL"><input type="url" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/handle" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
              <FormField label="Twitter/X URL"><input type="url" value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="https://x.com/handle" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
            </div>
          </CollapsibleSection>

          {/* Business Address */}
          <CollapsibleSection
            title="Business Address"
            expanded={!!expandedSections.address}
            onToggle={() => toggleSection("address")}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField label="Address Line 1"><input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Street address" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Address Line 2 (optional)"><input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Suite, unit, building" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
              </div>
              <FormField label="City"><input type="text" value={addrCity} onChange={(e) => setAddrCity(e.target.value)} placeholder="City" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
              <FormField label="State/Province"><input type="text" value={addrState} onChange={(e) => setAddrState(e.target.value)} placeholder="State or province" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
              <FormField label="Postal Code"><input type="text" value={addrPostalCode} onChange={(e) => setAddrPostalCode(e.target.value)} placeholder="Postal code" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
              <FormField label="Country">
                <select value={addrCountry} onChange={(e) => setAddrCountry(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </FormField>
              <FormField label="Latitude"><input type="text" value={addrLat} onChange={(e) => setAddrLat(e.target.value)} placeholder="Auto-filled from pin" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
              <FormField label="Longitude"><input type="text" value={addrLng} onChange={(e) => setAddrLng(e.target.value)} placeholder="Auto-filled from pin" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
              <div className="sm:col-span-2">
                <button type="button" onClick={() => setShowPinDialog(true)} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
                  <MapPinned className="h-4 w-4" /> Pin on Map
                </button>
              </div>
            </div>
          </CollapsibleSection>

          {/* Services */}
          <CollapsibleSection
            title="Services & Categories"
            expanded={!!expandedSections.services}
            onToggle={() => toggleSection("services")}
          >
            <div className="space-y-3">
              {serviceRows.map((svc, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_90px_70px_auto_auto_32px] items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <FormField label={idx === 0 ? "Service Name" : ""}>
                    <input type="text" value={svc.name} onChange={(e) => updateServiceRow(idx, { name: e.target.value })} placeholder="e.g. Haircut" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </FormField>
                  <FormField label={idx === 0 ? "Duration" : ""}>
                    <input type="number" min={5} step={5} value={svc.duration_minutes} onChange={(e) => updateServiceRow(idx, { duration_minutes: Number(e.target.value) })} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                  </FormField>
                  <FormField label={idx === 0 ? "Price" : ""}>
                    <input type="number" min={0} step={0.01} value={svc.price || ""} onChange={(e) => updateServiceRow(idx, { price: Number(e.target.value) })} placeholder="0.00" className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                  </FormField>
                  <FormField label={idx === 0 ? "Currency" : ""}>
                    <select value={svc.currency} onChange={(e) => updateServiceRow(idx, { currency: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-1 py-2 text-xs">
                      {["ZAR", "USD", "GBP", "EUR", "NGN", "KES"].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </FormField>
                  <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-600">
                    <input type="checkbox" checked={svc.at_home} onChange={(e) => updateServiceRow(idx, { at_home: e.target.checked })} className="rounded border-gray-300" /> Home
                  </label>
                  <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-600">
                    <input type="checkbox" checked={svc.at_salon} onChange={(e) => updateServiceRow(idx, { at_salon: e.target.checked })} className="rounded border-gray-300" /> Salon
                  </label>
                  <button type="button" onClick={() => setServiceRows((prev) => prev.filter((_, i) => i !== idx))} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setServiceRows((prev) => [...prev, emptyServiceRow()])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800">
                <Plus className="h-3.5 w-3.5" /> Add Service
              </button>
            </div>
          </CollapsibleSection>

          {/* Payment & Tax */}
          <CollapsibleSection
            title="Payment & Tax"
            expanded={!!expandedSections.payment}
            onToggle={() => toggleSection("payment")}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <ToggleSwitch checked={isVatRegistered} onChange={setIsVatRegistered} />
                <span className="text-sm text-gray-700">VAT Registered</span>
              </div>
              {isVatRegistered && (
                <FormField label="VAT Number"><input type="text" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="VAT number" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></FormField>
              )}
              <div className="flex items-center gap-3">
                <ToggleSwitch checked={acceptsTips} onChange={setAcceptsTips} />
                <span className="text-sm text-gray-700">Accepts Tips</span>
              </div>
              <FormField label="Cancellation Window (hours)">
                <input type="number" min={0} value={cancellationWindowHours} onChange={(e) => setCancellationWindowHours(e.target.value)} placeholder="e.g. 24" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </FormField>
              <div className="flex items-center gap-3">
                <ToggleSwitch checked={requiresDeposit} onChange={setRequiresDeposit} />
                <span className="text-sm text-gray-700">Requires Deposit</span>
              </div>
              {requiresDeposit && (
                <FormField label="Deposit Percentage">
                  <input type="number" min={1} max={100} value={depositPercentage} onChange={(e) => setDepositPercentage(e.target.value)} placeholder="e.g. 50" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </FormField>
              )}
            </div>
          </CollapsibleSection>

          {/* Operating Hours */}
          <CollapsibleSection
            title="Operating Hours"
            expanded={!!expandedSections.hours}
            onToggle={() => toggleSection("hours")}
          >
            <div className="space-y-2">
              {Object.entries(operatingHours).map(([day, h]) => (
                <div key={day} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <span className="w-24 text-sm font-medium text-gray-700">{day}</span>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={h.closed} onChange={(e) => updateDayHours(day, { closed: e.target.checked })} className="rounded border-gray-300" /> Closed
                  </label>
                  {!h.closed && (
                    <>
                      <input type="time" value={h.open} onChange={(e) => updateDayHours(day, { open: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                      <span className="text-xs text-gray-400">to</span>
                      <input type="time" value={h.close} onChange={(e) => updateDayHours(day, { close: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                    </>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      </AdminPanel>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <Link to={adminSpaTo("/admin/provider-ops/leads")} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</Link>
        <button type="button" disabled={submitting} onClick={handleSubmit} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">{submitting ? "Creating..." : "Create Lead"}</button>
      </div>

      <LocationPinnerDialog
        open={showPinDialog}
        onClose={() => setShowPinDialog(false)}
        initialLatitude={addrLat ? Number(addrLat) : undefined}
        initialLongitude={addrLng ? Number(addrLng) : undefined}
        onLocationPicked={handleLocationPinned}
      />
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-4 pt-5 first:pt-0"><h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>{children}</div>;
}
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm text-gray-600">{label}</label>{children}</div>;
}

function CollapsibleSection({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
          <p className="mt-0.5 text-[10px] text-gray-400">Optional — for assisted onboarding</p>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>
      {expanded && <div className="mt-4">{children}</div>}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${checked ? "translate-x-4 ml-0.5" : "translate-x-0.5"}`} />
    </button>
  );
}
