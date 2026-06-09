"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";
import {
  Save,
  Eye,
  EyeOff,
  KeyRound,
  Palette,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  Radio,
} from "lucide-react";

function formatFetchError(e: unknown, fallback: string): string {
  if (!(e instanceof FetchError)) return e instanceof Error ? e.message : fallback;
  const msg = e.message;
  if (!e.details) return msg;
  const details = Array.isArray(e.details)
    ? (e.details as Array<{ path?: string; message?: string }>)
        .map((d) => (d.path ? `${d.path}: ${d.message ?? ""}` : String(d.message ?? d)))
        .join("; ")
    : String(e.details);
  return details ? `${msg}: ${details}` : msg;
}

interface MapboxConfig {
  access_token: string;
  public_access_token: string;
  style_url?: string | null;
  is_enabled: boolean;
  id?: string;
}

type PublicEndpointStatus = "idle" | "checking" | "ok" | "no_token" | "disabled" | "error";
type GeocodingEndpointStatus = "idle" | "checking" | "ok" | "not_configured" | "error";

const LINKS = [
  { label: "Access tokens", href: "https://account.mapbox.com/access-tokens/" },
  { label: "Mapbox docs", href: "https://docs.mapbox.com/" },
  { label: "Mapbox Studio", href: "https://studio.mapbox.com/" },
] as const;

export default function MapboxConfigTab() {
  const [config, setConfig] = useState<MapboxConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showPublicToken, setShowPublicToken] = useState(false);
  const [publicCheck, setPublicCheck] = useState<PublicEndpointStatus>("idle");
  const [geocodingCheck, setGeocodingCheck] = useState<GeocodingEndpointStatus>("idle");
  const [guideOpen, setGuideOpen] = useState(false);
  const [formData, setFormData] = useState({
    access_token: "",
    public_access_token: "",
    style_url: "",
    is_enabled: true,
  });

  const verifyGeocodingEndpoint = useCallback(async () => {
    setGeocodingCheck("checking");
    try {
      const res = await fetch("/api/mapbox/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Johannesburg", limit: 1, country: "ZA" }),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: unknown[];
        error?: { code?: string; message?: string };
      };
      if (res.status === 503 && json?.error?.code === "MAPBOX_NOT_CONFIGURED") {
        setGeocodingCheck("not_configured");
        return;
      }
      if (!res.ok) {
        setGeocodingCheck("error");
        return;
      }
      if (Array.isArray(json?.data)) {
        setGeocodingCheck("ok");
        return;
      }
      setGeocodingCheck("error");
    } catch {
      setGeocodingCheck("error");
    }
  }, []);

  const verifyPublicEndpoint = useCallback(async () => {
    setPublicCheck("checking");
    try {
      const res = await fetch("/api/public/directions-config", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { provider?: string; mapboxPublicToken?: string };
      };
      const data = json?.data;
      if (!res.ok) {
        setPublicCheck("error");
        return;
      }
      if (data?.provider === "mapbox" && data?.mapboxPublicToken) {
        setPublicCheck("ok");
        return;
      }
      if (data?.provider === "google") {
        setPublicCheck("disabled");
        return;
      }
      setPublicCheck("no_token");
    } catch {
      setPublicCheck("error");
    }
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: MapboxConfig | null }>("/api/admin/mapbox/config");
      if (response?.data) {
        setConfig(response.data);
        const pub = response.data.public_access_token || "";
        const isMasked = pub === "***" || pub.length <= 12 || pub.endsWith("...");
        setFormData({
          access_token: "",
          public_access_token: isMasked ? "" : pub,
          style_url: response.data.style_url || "",
          is_enabled: response.data.is_enabled,
        });
      } else {
        setConfig(null);
        setFormData({
          access_token: "",
          public_access_token: "",
          style_url: "",
          is_enabled: true,
        });
      }
    } catch (error) {
      console.error("Error loading config:", error);
      toast.error("Failed to load Mapbox configuration");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      void verifyPublicEndpoint();
      void verifyGeocodingEndpoint();
    }
  }, [isLoading, verifyPublicEndpoint, verifyGeocodingEndpoint]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      is_enabled: formData.is_enabled,
      style_url: formData.style_url || null,
    };
    if (formData.access_token.trim()) payload.access_token = formData.access_token;
    const pub = formData.public_access_token.trim();
    if (pub && pub !== "***" && !pub.endsWith("...")) payload.public_access_token = pub;
    try {
      setIsSaving(true);
      await fetcher.put("/api/admin/mapbox/config", payload);
      toast.success("Mapbox configuration saved");
      await loadConfig();
      await verifyPublicEndpoint();
      await verifyGeocodingEndpoint();
    } catch (error) {
      toast.error(formatFetchError(error, "Failed to save configuration"));
    } finally {
      setIsSaving(false);
    }
  };

  const hasProfile = Boolean(config?.id);
  const secretStored = Boolean(config);
  const publicStored = Boolean(config?.public_access_token);

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading Mapbox configuration…" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {hasProfile ? (
            <Badge variant="secondary" className="rounded-md px-2.5 py-0.5 font-normal">
              Saved in database
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 text-amber-900">
              First-time setup
            </Badge>
          )}
          {secretStored && (
            <Badge variant="outline" className="rounded-md font-normal text-slate-600">
              Secret: stored (masked)
            </Badge>
          )}
          {publicStored && (
            <Badge variant="outline" className="rounded-md font-normal text-slate-600">
              Public: stored (masked)
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {l.label}
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/60 pb-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900">Live status</CardTitle>
              <CardDescription>
                What browsers and apps receive from{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/api/public/directions-config</code>
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => {
                void verifyPublicEndpoint();
                void verifyGeocodingEndpoint();
              }}
              disabled={publicCheck === "checking" || geocodingCheck === "checking"}
            >
              {publicCheck === "checking" || geocodingCheck === "checking" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Re-check
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-100 bg-white p-4">
            {publicCheck === "checking" && (
              <>
                <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">Checking public endpoint…</p>
                  <p className="text-sm text-slate-600">Verifying that client maps can obtain a token.</p>
                </div>
              </>
            )}
            {publicCheck === "ok" && (
              <>
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-medium text-slate-900">Public maps ready</p>
                  <p className="text-sm text-slate-600">
                    Mapbox is the active provider and a public token is exposed to the client (as intended).
                    Admin maps, search, and static previews should load.
                  </p>
                </div>
              </>
            )}
            {publicCheck === "disabled" && (
              <>
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-slate-900">Mapbox disabled for clients</p>
                  <p className="text-sm text-slate-600">
                    The toggle is off or no public token is configured, so the API falls back to Google for
                    directions links and does not ship a <code className="text-xs">pk.</code> token to the browser.
                  </p>
                </div>
              </>
            )}
            {publicCheck === "no_token" && (
              <>
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-slate-900">No public token available</p>
                  <p className="text-sm text-slate-600">
                    Enable Mapbox and save a <strong>public</strong> token below, or set{" "}
                    <code className="rounded bg-slate-100 px-1 text-xs">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> on the
                    server for a fallback.
                  </p>
                </div>
              </>
            )}
            {publicCheck === "error" && (
              <>
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <p className="font-medium text-slate-900">Could not verify endpoint</p>
                  <p className="text-sm text-slate-600">Network or server error. Try Re-check after saving.</p>
                </div>
              </>
            )}
            {publicCheck === "idle" && (
              <>
                <Radio className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">Status pending</p>
                  <p className="text-sm text-slate-600">Run a check to validate the public configuration.</p>
                </div>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-start gap-3 rounded-xl border border-slate-100 bg-white p-4">
            {geocodingCheck === "checking" && (
              <>
                <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">Checking server geocoding…</p>
                  <p className="text-sm text-slate-600">
                    Probing <code className="rounded bg-slate-100 px-1 text-xs">POST /api/mapbox/geocode</code> for
                    address autocomplete and reverse-geocode.
                  </p>
                </div>
              </>
            )}
            {geocodingCheck === "ok" && (
              <>
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-medium text-slate-900">Server geocoding ready</p>
                  <p className="text-sm text-slate-600">
                    Address search and reverse-geocode are working. Customer and provider apps will receive suggestions
                    from this endpoint.
                  </p>
                </div>
              </>
            )}
            {geocodingCheck === "not_configured" && (
              <>
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-slate-900">Server geocoding not configured</p>
                  <p className="text-sm text-slate-600">
                    Mobile address autocomplete will show an error until you save a <strong>secret</strong> Mapbox token
                    below (or set <code className="rounded bg-slate-100 px-1 text-xs">MAPBOX_ACCESS_TOKEN</code> on the
                    server). A public token alone is used as fallback when no secret is stored.
                  </p>
                </div>
              </>
            )}
            {geocodingCheck === "error" && (
              <>
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <p className="font-medium text-slate-900">Geocoding check failed</p>
                  <p className="text-sm text-slate-600">
                    The geocode endpoint returned an unexpected error. Save credentials and Re-check.
                  </p>
                </div>
              </>
            )}
            {geocodingCheck === "idle" && (
              <>
                <Radio className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">Server geocoding pending</p>
                  <p className="text-sm text-slate-600">Run Re-check to validate address search on the server.</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="h-4 w-4" />
            </span>
            Credentials
          </CardTitle>
          <CardDescription>
            Public token is stored in <code className="text-xs">mapbox_config</code> for maps. Optional secret (
            <code className="text-xs">platform_secrets</code> or <code className="text-xs">MAPBOX_ACCESS_TOKEN</code>)
            is preferred for server routes; if you leave it blank, the same public token is used for geocoding (e.g.
            Market Coverage suggestions).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="is_enabled" className="text-base font-semibold text-slate-900">
                Enable Mapbox for clients
              </Label>
              <p className="text-sm text-slate-600 max-w-xl">
                When off, <code className="rounded bg-white px-1 text-xs">directions-config</code> will not expose your
                public token. Server geocoding can still use the secret if configured.
              </p>
            </div>
            <Switch
              id="is_enabled"
              checked={formData.is_enabled}
              onCheckedChange={(v) => setFormData({ ...formData, is_enabled: v })}
              className="shrink-0"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="access_token" className="text-slate-800">
              Secret access token (server, optional)
            </Label>
            <div className="relative">
              <Input
                id="access_token"
                type={showAccessToken ? "text" : "password"}
                value={formData.access_token}
                onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                placeholder={
                  config
                    ? "Leave blank to keep current secret"
                    : "sk.eyJ1… — optional; geocoding can use your public token if empty"
                }
                className="pr-11 font-mono text-sm h-11"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowAccessToken(!showAccessToken)}
                className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 text-slate-500"
                aria-label={showAccessToken ? "Hide secret token" : "Show secret token"}
              >
                {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Never commit this token or use it in mobile/web bundles. Used for{" "}
              <code className="rounded bg-slate-100 px-1">/api/mapbox/*</code> and related server routes.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="public_access_token" className="text-slate-800">
              Public access token (maps) {!config ? <span className="text-red-600">*</span> : null}
            </Label>
            <div className="relative">
              <Input
                id="public_access_token"
                type={showPublicToken ? "text" : "password"}
                value={formData.public_access_token}
                onChange={(e) => setFormData({ ...formData, public_access_token: e.target.value })}
                placeholder={
                  config
                    ? "Leave blank to keep current public token"
                    : "pk.eyJ1… — URL-restrict in Mapbox when possible"
                }
                required={!config}
                className="pr-11 font-mono text-sm h-11"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPublicToken(!showPublicToken)}
                className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 text-slate-500"
                aria-label={showPublicToken ? "Hide public token" : "Show public token"}
              >
                {showPublicToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Starts with <code className="rounded bg-slate-100 px-1">pk.</code>. Powers Mapbox GL and static map URLs
              on the web; mobile apps read the same via platform config.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-700">
              <Palette className="h-4 w-4" />
            </span>
            Map appearance
          </CardTitle>
          <CardDescription>Optional custom style for all Mapbox GL views that read this config.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="style_url">Style URL</Label>
            <Input
              id="style_url"
              type="url"
              value={formData.style_url}
              onChange={(e) => setFormData({ ...formData, style_url: e.target.value })}
              placeholder="mapbox://styles/mapbox/streets-v12"
              className="font-mono text-sm h-11"
            />
            <p className="text-xs text-slate-500">
              Paste a <code className="rounded bg-slate-100 px-1">mapbox://styles/…</code> URL from Mapbox Studio.
              Leave empty to use the app default.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="submit" disabled={isSaving} size="lg" className="w-full sm:w-auto min-w-[160px]">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save changes
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left font-medium text-slate-800 hover:bg-slate-50"
          >
            <span>Setup checklist & tips</span>
            <ChevronDown
              className={`h-5 w-5 text-slate-500 transition-transform ${guideOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2 border-slate-200 border-t-0 rounded-t-none shadow-sm">
            <CardContent className="pt-4 pb-6">
              <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
                <li>
                  Create or open your{" "}
                  <a
                    href="https://www.mapbox.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline"
                  >
                    Mapbox account
                  </a>
                  .
                </li>
                <li>
                  Create a <strong>secret</strong> token with <strong>Geocoding API</strong> (and any other server scopes
                  you need). Paste it as the secret field above.
                </li>
                <li>
                  Create a separate <strong>public</strong> token (<code className="text-xs">pk.</code>) with{" "}
                  <strong>Styles and tiles</strong> scopes; restrict URLs to your domains in production.
                </li>
                <li>Turn on &quot;Enable Mapbox for clients&quot; and save so maps receive the public token.</li>
                <li>
                  Use <strong>Re-check</strong> in Live status to confirm{" "}
                  <code className="text-xs">directions-config</code> returns Mapbox + token.
                </li>
                <li>
                  For complex zones and publishing, use{" "}
                  <a href="/admin/service-zones" className="font-medium text-primary underline">
                    Service zones (control plane)
                  </a>
                  .
                </li>
              </ol>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </form>
  );
}
