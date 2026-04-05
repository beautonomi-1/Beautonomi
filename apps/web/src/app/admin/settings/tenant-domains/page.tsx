"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Pencil, Trash2, Globe, Building2, Info } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { RADIX_SELECT_NONE } from "@/lib/ui/select-radix-sentinels";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

type TenantDomain = {
  id: string;
  tenant_id: string;
  hostname: string;
  environment?: string;
  is_legacy?: boolean;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
};

type Tenant = {
  id: string;
  slug: string;
  name: string;
  region_code: string;
  is_active: boolean;
};

type IsoCountry = { code: string; name: string; is_active?: boolean };
type IsoCurrency = { code: string; name: string; is_active?: boolean };
type IsoLanguage = { code: string; name: string; is_active?: boolean };
type IsoTimezone = {
  code: string;
  name: string;
  utc_offset?: string | null;
  country_code?: string | null;
  is_active?: boolean;
};

/** Suggested defaults for common tenants; all IANA/currency/lang values must exist in your ISO tables. */
const TENANT_MARKET_PRESETS: Array<{
  id: string;
  label: string;
  slug: string;
  name: string;
  region: string;
  currency: string;
  lang: string;
  tz: string;
}> = [
  { id: "za", label: "South Africa", slug: "za", name: "South Africa", region: "ZA", currency: LAST_RESORT_CURRENCY, lang: "en", tz: "Africa/Johannesburg" },
  { id: "gb", label: "United Kingdom", slug: "uk", name: "United Kingdom", region: "GB", currency: "GBP", lang: "en", tz: "Europe/London" },
  { id: "us", label: "United States", slug: "us", name: "United States", region: "US", currency: "USD", lang: "en", tz: "America/New_York" },
  { id: "ke", label: "Kenya", slug: "ke", name: "Kenya", region: "KE", currency: "KES", lang: "en", tz: "Africa/Nairobi" },
  { id: "ng", label: "Nigeria", slug: "ng", name: "Nigeria", region: "NG", currency: "NGN", lang: "en", tz: "Africa/Lagos" },
  { id: "rw", label: "Rwanda", slug: "rw", name: "Rwanda", region: "RW", currency: "RWF", lang: "en", tz: "Africa/Kigali" },
  { id: "gh", label: "Ghana", slug: "gh", name: "Ghana", region: "GH", currency: "GHS", lang: "en", tz: "Africa/Accra" },
  { id: "eg", label: "Egypt", slug: "eg", name: "Egypt", region: "EG", currency: "EGP", lang: "en", tz: "Africa/Cairo" },
  { id: "au", label: "Australia", slug: "au", name: "Australia", region: "AU", currency: "AUD", lang: "en", tz: "Australia/Sydney" },
  { id: "ie", label: "Ireland", slug: "ie", name: "Ireland", region: "IE", currency: "EUR", lang: "en", tz: "Europe/Dublin" },
  { id: "fr", label: "France", slug: "fr", name: "France", region: "FR", currency: "EUR", lang: "fr", tz: "Europe/Paris" },
  { id: "de", label: "Germany", slug: "de", name: "Germany", region: "DE", currency: "EUR", lang: "de", tz: "Europe/Berlin" },
];

export default function TenantDomainsSettingsPage() {
  const { user, role } = useAuth();
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TenantDomain | null>(null);
  const [formHostname, setFormHostname] = useState("");
  const [formTenantId, setFormTenantId] = useState("");
  const [formPrimary, setFormPrimary] = useState(false);
  const [formActive, setFormActive] = useState(true);
  const [formEnvironment, setFormEnvironment] = useState("production");
  const [formLegacy, setFormLegacy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantRegion, setNewTenantRegion] = useState("");
  const [newTenantCurrency, setNewTenantCurrency] = useState("");
  const [newTenantLang, setNewTenantLang] = useState("en");
  const [newTenantTz, setNewTenantTz] = useState("");
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [showTenantForm, setShowTenantForm] = useState(false);

  const [isoLoading, setIsoLoading] = useState(false);
  const [isoLoadError, setIsoLoadError] = useState<string | null>(null);
  const [isoCountries, setIsoCountries] = useState<IsoCountry[]>([]);
  const [isoCurrencies, setIsoCurrencies] = useState<IsoCurrency[]>([]);
  const [isoLanguages, setIsoLanguages] = useState<IsoLanguage[]>([]);
  const [isoTimezones, setIsoTimezones] = useState<IsoTimezone[]>([]);
  const [tenantPreset, setTenantPreset] = useState<string>(RADIX_SELECT_NONE);

  const loadIsoReference = useCallback(async () => {
    setIsoLoading(true);
    setIsoLoadError(null);
    try {
      const [cRes, curRes, lRes, tzRes] = await Promise.all([
        fetcher.get<{ data?: IsoCountry[] }>("/api/admin/iso-codes/countries"),
        fetcher.get<{ data?: IsoCurrency[] }>("/api/admin/iso-codes/currencies"),
        fetcher.get<{ data?: IsoLanguage[] }>("/api/admin/iso-codes/languages"),
        fetcher.get<{ data?: IsoTimezone[] }>("/api/admin/iso-codes/timezones"),
      ]);
      const active = <T extends { is_active?: boolean }>(rows: T[] | undefined) =>
        (rows ?? []).filter((r) => r.is_active !== false);
      setIsoCountries(active(cRes.data));
      setIsoCurrencies(active(curRes.data));
      setIsoLanguages(active(lRes.data));
      setIsoTimezones(active(tzRes.data));
    } catch (e) {
      const msg = e instanceof FetchError ? e.message : "Failed to load ISO reference data";
      setIsoLoadError(msg);
      toast.error(msg);
    } finally {
      setIsoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showTenantForm && user?.id && role === "superadmin") {
      void loadIsoReference();
    }
  }, [showTenantForm, user?.id, role, loadIsoReference]);

  const timezonesForRegion = useMemo(() => {
    if (!newTenantRegion || isoTimezones.length === 0) return isoTimezones;
    const match = isoTimezones.filter((t) => t.country_code === newTenantRegion);
    return match.length > 0 ? match : isoTimezones;
  }, [isoTimezones, newTenantRegion]);

  /** Drop timezone if it is not valid for the current (filtered) timezone list. */
  useEffect(() => {
    if (!newTenantTz || timezonesForRegion.length === 0) return;
    const ok = timezonesForRegion.some((t) => t.code === newTenantTz);
    if (!ok) setNewTenantTz("");
  }, [newTenantRegion, timezonesForRegion, newTenantTz]);

  const applyTenantPreset = (presetId: string) => {
    if (presetId === RADIX_SELECT_NONE) return;
    const p = TENANT_MARKET_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setNewTenantSlug(p.slug);
    setNewTenantName(p.name);
    setNewTenantRegion(p.region);
    setNewTenantCurrency(p.currency);
    setNewTenantLang(p.lang);
    setNewTenantTz(p.tz);
    setTenantPreset(RADIX_SELECT_NONE);
  };

  const tenantById = useMemo(() => {
    const m = new Map<string, Tenant>();
    tenants.forEach((t) => m.set(t.id, t));
    return m;
  }, [tenants]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: { domains: TenantDomain[]; tenants: Tenant[] } }>(
        "/api/admin/tenant-domains",
      );
      setDomains(res.data?.domains ?? []);
      setTenants(res.data?.tenants ?? []);
    } catch (e) {
      const msg =
        e instanceof FetchTimeoutError
          ? "Request timed out."
          : e instanceof FetchError
            ? e.message
            : "Failed to load";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id && role === "superadmin") {
      load();
    } else if (role != null && role !== "superadmin") {
      setLoading(false);
    }
  }, [user?.id, role]);

  const openCreate = () => {
    setEditing(null);
    setFormHostname("");
    setFormTenantId(tenants[0]?.id ?? "");
    setFormPrimary(false);
    setFormActive(true);
    setFormEnvironment("production");
    setFormLegacy(false);
    setDialogOpen(true);
  };

  const openEdit = (d: TenantDomain) => {
    setEditing(d);
    setFormHostname(d.hostname);
    setFormTenantId(d.tenant_id);
    setFormPrimary(d.is_primary);
    setFormActive(d.is_active);
    setFormEnvironment(d.environment ?? "production");
    setFormLegacy(Boolean(d.is_legacy));
    setDialogOpen(true);
  };

  const saveDomain = async () => {
    try {
      setSaving(true);
      if (editing) {
        const body: Record<string, unknown> = {
          hostname: formHostname,
          is_active: formActive,
        };
        if (formPrimary !== editing.is_primary) {
          body.is_primary = formPrimary;
        }
        if (formEnvironment !== (editing.environment ?? "production")) {
          body.environment = formEnvironment;
        }
        if (formLegacy !== Boolean(editing.is_legacy)) {
          body.is_legacy = formLegacy;
        }
        await fetcher.patch(`/api/admin/tenant-domains/${editing.id}`, body);
        toast.success("Domain updated");
      } else {
        await fetcher.post("/api/admin/tenant-domains", {
          tenant_id: formTenantId,
          hostname: formHostname,
          environment: formEnvironment,
          is_legacy: formLegacy,
          is_primary: formPrimary,
          is_active: formActive,
        });
        toast.success("Domain added");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof FetchError ? e.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const removeDomain = async (d: TenantDomain) => {
    const envLabel = d.environment ?? "production";
    if (
      !window.confirm(
        `Remove hostname "${d.hostname}" (${envLabel})? Traffic will no longer resolve to a tenant.`,
      )
    ) {
      return;
    }
    try {
      await fetcher.delete(`/api/admin/tenant-domains/${d.id}`);
      toast.success("Domain removed");
      await load();
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Delete failed");
    }
  };

  const createTenant = async () => {
    const slug = newTenantSlug.trim();
    const name = newTenantName.trim();
    if (!slug || !name) {
      toast.error("Slug and display name are required.");
      return;
    }
    if (!newTenantRegion || !newTenantCurrency || !newTenantLang || !newTenantTz) {
      toast.error("Select country/region, currency, language, and timezone from the lists.");
      return;
    }
    try {
      setCreatingTenant(true);
      const res = await fetcher.post<{ data: { tenant: Tenant } }>("/api/admin/tenants", {
        slug,
        name,
        region_code: newTenantRegion,
        default_currency: newTenantCurrency,
        default_language: newTenantLang,
        default_timezone: newTenantTz,
      });
      const t = res.data?.tenant;
      if (t) {
        toast.success(`Tenant “${t.slug}” created`);
        setNewTenantSlug("");
        setNewTenantName("");
        setNewTenantRegion("");
        setNewTenantCurrency("");
        setNewTenantLang("en");
        setNewTenantTz("");
        setTenantPreset(RADIX_SELECT_NONE);
        setShowTenantForm(false);
        await load();
        setFormTenantId(t.id);
      }
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to create tenant");
    } finally {
      setCreatingTenant(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="container max-w-6xl py-8 px-4">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Globe className="h-7 w-7 text-[#FF0077]" />
            Tenant domains
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Map hostnames (Vercel / DNS) to markets. The web app resolves{" "}
            <code className="text-xs bg-muted px-1 rounded">Host</code> →{" "}
            <code className="text-xs bg-muted px-1 rounded">tenant_domains</code> → tenant (spec §7.1).
          </p>
        </div>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>Production checklist</AlertTitle>
          <AlertDescription>
            Add every hostname users hit (apex and <code className="text-xs">www</code> separately unless you
            redirect). Preview URLs like <code className="text-xs">*.vercel.app</code> only work if you add that
            exact hostname here. Use lowercase; no port or <code className="text-xs">https://</code>.
          </AlertDescription>
        </Alert>

        {loading ? (
          <LoadingTimeout />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-medium">Hostname mappings</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowTenantForm((v) => !v)} type="button">
                  <Building2 className="h-4 w-4 mr-2" />
                  New tenant
                </Button>
                <Button onClick={openCreate} className="bg-[#FF0077] hover:bg-[#FF0077]/90" type="button">
                  <Plus className="h-4 w-4 mr-2" />
                  Add hostname
                </Button>
              </div>
            </div>

            {showTenantForm && (
              <div className="mb-8 rounded-lg border bg-card p-4 space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Create tenant (market)
                </h3>
                <p className="text-sm text-muted-foreground">
                  Creates <code className="text-xs">tenants</code> plus empty settings/secrets rows. Then map a domain
                  below. Region, currency, language, and timezone come from your ISO tables (Integrations → ISO Codes).
                </p>
                {isoLoadError && (
                  <p className="text-sm text-destructive">
                    {isoLoadError}{" "}
                    <button
                      type="button"
                      className="underline font-medium"
                      onClick={() => void loadIsoReference()}
                    >
                      Retry
                    </button>
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Label>Quick fill (optional)</Label>
                    <Select
                      value={tenantPreset}
                      onValueChange={(v) => {
                        setTenantPreset(v);
                        if (v !== RADIX_SELECT_NONE) applyTenantPreset(v);
                      }}
                      disabled={isoLoading}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Choose a common market…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={RADIX_SELECT_NONE}>Choose a common market…</SelectItem>
                        {TENANT_MARKET_PRESETS.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="nt-slug">Slug</Label>
                    <Input
                      id="nt-slug"
                      placeholder="uk"
                      value={newTenantSlug}
                      onChange={(e) => setNewTenantSlug(e.target.value)}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Lowercase, e.g. za, uk, us</p>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="nt-name">Display name</Label>
                    <Input
                      id="nt-name"
                      placeholder="United Kingdom"
                      value={newTenantName}
                      onChange={(e) => setNewTenantName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Country / region (ISO 3166-1)</Label>
                    <Select
                      value={newTenantRegion || RADIX_SELECT_NONE}
                      onValueChange={(v) => {
                        const code = v === RADIX_SELECT_NONE ? "" : v;
                        setNewTenantRegion(code);
                        if (code) {
                          const c = isoCountries.find((x) => x.code === code);
                          if (c) {
                            setNewTenantName((prev) => (prev.trim() === "" ? c.name : prev));
                            setNewTenantSlug((prev) => (prev.trim() === "" ? code.toLowerCase() : prev));
                          }
                        }
                      }}
                      disabled={isoLoading || isoCountries.length === 0}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={isoLoading ? "Loading…" : "Select country"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(50vh,320px)] overflow-y-auto">
                        <SelectItem value={RADIX_SELECT_NONE}>Select country</SelectItem>
                        {isoCountries.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name} ({c.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      If slug and display name are empty, they are filled from the country you pick.
                    </p>
                  </div>
                  <div>
                    <Label>Default currency (ISO 4217)</Label>
                    <Select
                      value={newTenantCurrency || RADIX_SELECT_NONE}
                      onValueChange={(v) => setNewTenantCurrency(v === RADIX_SELECT_NONE ? "" : v)}
                      disabled={isoLoading || isoCurrencies.length === 0}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={isoLoading ? "Loading…" : "Select currency"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(50vh,280px)] overflow-y-auto">
                        <SelectItem value={RADIX_SELECT_NONE}>Select currency</SelectItem>
                        {isoCurrencies.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.code} — {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Default language (ISO 639-1)</Label>
                    <Select
                      value={newTenantLang || RADIX_SELECT_NONE}
                      onValueChange={(v) => setNewTenantLang(v === RADIX_SELECT_NONE ? "" : v)}
                      disabled={isoLoading || isoLanguages.length === 0}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={isoLoading ? "Loading…" : "Select language"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(50vh,280px)] overflow-y-auto">
                        <SelectItem value={RADIX_SELECT_NONE}>Select language</SelectItem>
                        {isoLanguages.map((l) => (
                          <SelectItem key={l.code} value={l.code}>
                            {l.code} — {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Default timezone (IANA)</Label>
                    <Select
                      value={newTenantTz || RADIX_SELECT_NONE}
                      onValueChange={(v) => setNewTenantTz(v === RADIX_SELECT_NONE ? "" : v)}
                      disabled={isoLoading || timezonesForRegion.length === 0}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={isoLoading ? "Loading…" : "Select timezone"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(60vh,360px)] overflow-y-auto">
                        <SelectItem value={RADIX_SELECT_NONE}>Select timezone</SelectItem>
                        {timezonesForRegion.map((tz) => (
                          <SelectItem key={tz.code} value={tz.code}>
                            {tz.code}
                            {tz.utc_offset ? ` (${tz.utc_offset})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {newTenantRegion ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Timezones filtered by country when your ISO data links them; otherwise the full IANA list is
                        shown.
                      </p>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={createTenant}
                  disabled={creatingTenant || isoLoading || isoCountries.length === 0}
                >
                  {creatingTenant ? "Creating…" : "Create tenant"}
                </Button>
              </div>
            )}

            {domains.length === 0 ? (
              <EmptyState
                title="No hostnames yet"
                description="Add your production domain so requests resolve to the correct tenant."
              />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hostname</TableHead>
                      <TableHead>Environment</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Primary</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domains.map((d) => {
                      const t = tenantById.get(d.tenant_id);
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono text-sm">
                            {d.hostname}
                            {d.is_legacy ? (
                              <Badge variant="outline" className="ml-2 text-xs">
                                legacy
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm capitalize">{d.environment ?? "production"}</TableCell>
                          <TableCell>
                            {t ? (
                              <span>
                                <span className="font-medium">{t.name}</span>{" "}
                                <Badge variant="secondary" className="ml-1 text-xs">
                                  {t.slug}
                                </Badge>
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">{d.tenant_id}</span>
                            )}
                          </TableCell>
                          <TableCell>{d.is_primary ? <Badge>Primary</Badge> : "—"}</TableCell>
                          <TableCell>{d.is_active ? "Yes" : "No"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(d)} aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeDomain(d)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit hostname" : "Add hostname"}</DialogTitle>
              <DialogDescription>
                One row per hostname and environment (e.g. Vercel preview vs production). Mark one primary per tenant for
                canonical SEO (see spec §9.7).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {!editing && (
                <div>
                  <Label>Tenant</Label>
                  <Select value={formTenantId} onValueChange={setFormTenantId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="env">Environment</Label>
                <Select value={formEnvironment} onValueChange={setFormEnvironment}>
                  <SelectTrigger id="env" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">production</SelectItem>
                    <SelectItem value="preview">preview</SelectItem>
                    <SelectItem value="development">development</SelectItem>
                    <SelectItem value="staging">staging</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Must match the deploy (e.g. VERCEL_ENV=preview or TENANT_DOMAIN_ENV).
                </p>
              </div>
              <div>
                <Label htmlFor="host">Hostname</Label>
                <Input
                  id="host"
                  className="mt-1 font-mono"
                  placeholder="www.example.com"
                  value={formHostname}
                  onChange={(e) => setFormHostname(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="legacy">Legacy hostname</Label>
                <Switch id="legacy" checked={formLegacy} onCheckedChange={setFormLegacy} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="primary">Primary for tenant</Label>
                <Switch id="primary" checked={formPrimary} onCheckedChange={setFormPrimary} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="active">Active</Label>
                <Switch id="active" checked={formActive} onCheckedChange={setFormActive} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={saveDomain} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
