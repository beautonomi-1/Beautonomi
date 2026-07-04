"use client";

/**
 * /provider/settings/sales/terminal-integrations
 *
 * Hub page listing all available terminal vendor integrations.
 * Hidden by the terminal_integrations_enabled feature flag.
 *
 * Per-vendor feature flags gate which vendors are "available to connect" vs
 * "coming soon" — providers can always see the hub but cannot connect a vendor
 * until both its config and feature flag are enabled by Superadmin.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Terminal, CheckCircle2, Clock, ExternalLink, AlertTriangle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/provider/SectionCard";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

type VendorEntry = {
  vendor: string;
  display_name: string;
  description: string | null;
  logo_url: string | null;
  help_url: string | null;
  credential_modes: string[];
  requires_merchant_id: boolean;
  setup_instructions_text: string | null;
  api_docs_url: string | null;
  available: boolean;
  config_enabled: boolean;
  flag_enabled: boolean;
  connected: boolean;
  status: string;
  credential_mode: string;
  is_enabled: boolean;
  connected_at: string | null;
  merchant_id: string | null;
  business_name: string | null;
};

function StatusBadge({ status, connected }: { status: string; connected: boolean }) {
  if (connected) {
    return (
      <Badge className="bg-green-100 text-green-800 border-0 gap-1 font-medium">
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </Badge>
    );
  }
  if (status === "pending_verification") {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-0 gap-1 font-medium">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge className="bg-red-100 text-red-800 border-0 gap-1 font-medium">
        <AlertTriangle className="h-3 w-3" />
        Error
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-slate-500 border-slate-200 font-medium">
      Not connected
    </Badge>
  );
}

export default function TerminalIntegrationsPage() {
  const router = useRouter();
  const { bundle, isLoading: isConfigLoading } = useConfigBundle();
  const hubEnabled = bundle?.flags?.terminal_integrations_enabled?.enabled === true;

  const [vendors, setVendors] = useState<VendorEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadVendors = useCallback(async () => {
    if (!hubEnabled) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const res = await fetch("/api/provider/terminal-integrations/vendors");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to load");
      setVendors(json.data?.vendors ?? []);
    } catch (err: any) {
      toast.error(err.message ?? "Could not load terminal integrations");
    } finally {
      setIsLoading(false);
    }
  }, [hubEnabled]);

  useEffect(() => { loadVendors(); }, [loadVendors]);

  // Redirect back if flag not enabled (or still loading)
  if (!isConfigLoading && !hubEnabled) {
    router.replace("/provider/settings");
    return null;
  }

  const connectedVendors = vendors.filter((v) => v.connected);
  const availableVendors = vendors.filter((v) => !v.connected && v.available);
  const comingSoonVendors = vendors.filter((v) => !v.available);

  return (
    <SettingsDetailLayout
      title="Terminal Integrations"
      description="Connect your existing card machines and payment terminals to track transactions and unlock platform features."
      backHref="/provider/settings"
    >
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Connected */}
          {connectedVendors.length > 0 && (
            <SectionCard title="Connected terminals" className="divide-y divide-slate-100">
              {connectedVendors.map((v) => (
                <VendorRow key={v.vendor} vendor={v} />
              ))}
            </SectionCard>
          )}

          {/* Available to connect */}
          {availableVendors.length > 0 && (
            <SectionCard
              title="Connect a terminal"
              description="Link your existing card machine or payment terminal to your Beautonomi account."
              className="divide-y divide-slate-100"
            >
              {availableVendors.map((v) => (
                <VendorRow key={v.vendor} vendor={v} />
              ))}
            </SectionCard>
          )}

          {/* Nothing available */}
          {connectedVendors.length === 0 && availableVendors.length === 0 && (
            <SectionCard title="No integrations available yet">
              <p className="text-sm text-slate-500 py-2">
                Terminal integrations are coming soon. Check back shortly or contact support for early access.
              </p>
            </SectionCard>
          )}

          {/* Coming soon */}
          {comingSoonVendors.length > 0 && (
            <SectionCard
              title="Coming soon"
              description="These integrations are in development. We'll notify you when they become available."
              className="divide-y divide-slate-100"
            >
              {comingSoonVendors.map((v) => (
                <div
                  key={v.vendor}
                  className="flex items-center justify-between py-4 px-1 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    {v.logo_url ? (
                      <img src={v.logo_url} alt={v.display_name} className="h-8 w-8 rounded-lg object-contain" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                        <Terminal className="h-4 w-4 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-700">{v.display_name}</p>
                      {v.description && (
                        <p className="text-xs text-slate-500 line-clamp-1">{v.description}</p>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-slate-400 border-slate-200 text-xs">
                    Coming soon
                  </Badge>
                </div>
              ))}
            </SectionCard>
          )}

          {/* Note about Yoco */}
          <SectionCard>
            <div className="flex items-start gap-3 text-sm text-slate-600">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p>
                <span className="font-medium">Looking for Yoco?</span>{" "}
                Yoco has its own dedicated integration.{" "}
                <Link
                  href="/provider/settings/sales/yoco-integration"
                  className="text-pink-600 underline underline-offset-2 font-medium"
                >
                  Manage Yoco here →
                </Link>
              </p>
            </div>
          </SectionCard>
        </div>
      )}
    </SettingsDetailLayout>
  );
}

function VendorRow({ vendor: v }: { vendor: VendorEntry }) {
  return (
    <Link
      href={`/provider/settings/sales/terminal-integrations/${v.vendor}`}
      className="flex items-center justify-between py-4 px-1 group hover:bg-slate-50 transition-colors rounded-xl -mx-1 px-2"
    >
      <div className="flex items-center gap-3">
        {v.logo_url ? (
          <img src={v.logo_url} alt={v.display_name} className="h-8 w-8 rounded-lg object-contain border border-slate-100" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
            <Terminal className="h-4 w-4 text-slate-500" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-900">{v.display_name}</p>
            <StatusBadge status={v.status} connected={v.connected} />
          </div>
          {v.connected && v.business_name && (
            <p className="text-xs text-slate-500 mt-0.5">{v.business_name}</p>
          )}
          {!v.connected && v.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{v.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 text-slate-400 group-hover:text-slate-600 transition-colors">
        {v.help_url && (
          <a
            href={v.help_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1 hover:text-pink-600 rounded"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <ChevronRight className="h-4 w-4" />
      </div>
    </Link>
  );
}
