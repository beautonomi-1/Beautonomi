"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Save, Eye, EyeOff, BarChart3 } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface AmplitudeConfig {
  id?: string;
  api_key_public: string;
  api_key_server?: string;
  ingestion_endpoint: string;
  environment: "production" | "staging" | "development";
  enabled_client_portal: boolean;
  enabled_provider_portal: boolean;
  enabled_admin_portal: boolean;
  guides_enabled: boolean;
  surveys_enabled: boolean;
  sampling_rate: number;
  debug_mode: boolean;
}

export default function AmplitudeIntegrationPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPublicKey, setShowPublicKey] = useState(false);
  const [showServerKey, setShowServerKey] = useState(false);
  const [config, setConfig] = useState<AmplitudeConfig>({
    api_key_public: "",
    api_key_server: "",
    ingestion_endpoint: "https://api2.amplitude.com/2/httpapi",
    environment: "production",
    enabled_client_portal: true,
    enabled_provider_portal: true,
    enabled_admin_portal: true,
    guides_enabled: false,
    surveys_enabled: false,
    sampling_rate: 1.0,
    debug_mode: false,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<AmplitudeConfig>("/api/admin/integrations/amplitude?environment=production");
      if (response) {
        setConfig(response);
      }
    } catch (error) {
      if (error instanceof FetchError && error.status === 404) {
        // No config exists yet, use defaults
        console.log("No Amplitude config found, using defaults");
      } else {
        console.error("Failed to load Amplitude config:", error);
        toast.error("Failed to load Amplitude configuration");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!config.api_key_public) {
        toast.error("Public API key is required");
        return;
      }

      setIsSaving(true);
      await fetcher.put("/api/admin/integrations/amplitude", config);
      toast.success("Amplitude configuration saved successfully");
      await loadConfig(); // Reload to get updated data
    } catch (error) {
      console.error("Failed to save Amplitude config:", error);
      toast.error(error instanceof FetchError ? error.message : "Failed to save Amplitude configuration");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading Amplitude configuration..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6" />
              Amplitude Integration
            </h1>
            <p className="text-gray-600 mt-1">Configure Amplitude Analytics, Guides, and Surveys</p>
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="bg-[#FF0077] hover:bg-[#D60565]">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Configuration"}
          </Button>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* API Keys Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">API Keys</h2>
            
            <div>
              <Label htmlFor="api_key_public">Public API Key *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="api_key_public"
                  type={showPublicKey ? "text" : "password"}
                  value={config.api_key_public}
                  onChange={(e) => setConfig({ ...config, api_key_public: e.target.value })}
                  placeholder="Enter Amplitude public API key"
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPublicKey(!showPublicKey)}
                >
                  {showPublicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-sm text-gray-500 mt-1">Safe for browser use</p>
            </div>

            <div>
              <Label htmlFor="api_key_server">Server API Key (Optional)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="api_key_server"
                  type={showServerKey ? "text" : "password"}
                  value={config.api_key_server || ""}
                  onChange={(e) => setConfig({ ...config, api_key_server: e.target.value })}
                  placeholder="Enter Amplitude server API key (optional)"
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowServerKey(!showServerKey)}
                >
                  {showServerKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-sm text-gray-500 mt-1">For server-side tracking (optional)</p>
            </div>

            <div>
              <Label htmlFor="ingestion_endpoint">Ingestion Endpoint</Label>
              <Input
                id="ingestion_endpoint"
                value={config.ingestion_endpoint}
                onChange={(e) => setConfig({ ...config, ingestion_endpoint: e.target.value })}
                placeholder="https://api2.amplitude.com/2/httpapi"
              />
            </div>

            <div>
              <Label htmlFor="environment">Environment</Label>
              <Select
                value={config.environment}
                onValueChange={(value: "production" | "staging" | "development") =>
                  setConfig({ ...config, environment: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Portal Toggles */}
          <div className="space-y-4 border-t pt-6">
            <h2 className="text-lg font-semibold">Portal Enablement</h2>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enabled_client_portal">Client Portal</Label>
                <p className="text-sm text-gray-500">Enable analytics for client portal</p>
              </div>
              <Switch
                id="enabled_client_portal"
                checked={config.enabled_client_portal}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, enabled_client_portal: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enabled_provider_portal">Provider Portal</Label>
                <p className="text-sm text-gray-500">Enable analytics for provider portal</p>
              </div>
              <Switch
                id="enabled_provider_portal"
                checked={config.enabled_provider_portal}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, enabled_provider_portal: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enabled_admin_portal">Admin Portal</Label>
                <p className="text-sm text-gray-500">Enable analytics for admin portal</p>
              </div>
              <Switch
                id="enabled_admin_portal"
                checked={config.enabled_admin_portal}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, enabled_admin_portal: checked })
                }
              />
            </div>
          </div>

          {/* Guides & Surveys */}
          <div className="space-y-4 border-t pt-6">
            <h2 className="text-lg font-semibold">Guides & Surveys</h2>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="guides_enabled">Guides Enabled</Label>
                <p className="text-sm text-gray-500">Enable Amplitude Guides</p>
              </div>
              <Switch
                id="guides_enabled"
                checked={config.guides_enabled}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, guides_enabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="surveys_enabled">Surveys Enabled</Label>
                <p className="text-sm text-gray-500">Enable Amplitude Surveys</p>
              </div>
              <Switch
                id="surveys_enabled"
                checked={config.surveys_enabled}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, surveys_enabled: checked })
                }
              />
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-4 border-t pt-6">
            <h2 className="text-lg font-semibold">Configuration</h2>
            
            <div>
              <Label htmlFor="sampling_rate">
                Sampling Rate: {Math.round(config.sampling_rate * 100)}%
              </Label>
              <Slider
                id="sampling_rate"
                min={0}
                max={1}
                step={0.01}
                value={[config.sampling_rate]}
                onValueChange={([value]) =>
                  setConfig({ ...config, sampling_rate: value })
                }
                className="mt-2"
              />
              <p className="text-sm text-gray-500 mt-1">
                Percentage of events to track (0% = none, 100% = all)
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="debug_mode">Debug Mode</Label>
                <p className="text-sm text-gray-500">Enable console logging for debugging</p>
              </div>
              <Switch
                id="debug_mode"
                checked={config.debug_mode}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, debug_mode: checked })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
