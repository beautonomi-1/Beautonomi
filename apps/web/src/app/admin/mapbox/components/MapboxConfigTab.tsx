"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";
import { Save, Eye, EyeOff } from "lucide-react";

interface MapboxConfig {
  access_token: string;
  public_access_token: string;
  style_url?: string | null;
  is_enabled: boolean;
}

export default function MapboxConfigTab() {
  const [, setConfig] = useState<MapboxConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showPublicToken, setShowPublicToken] = useState(false);
  const [formData, setFormData] = useState({
    access_token: "",
    public_access_token: "",
    style_url: "",
    is_enabled: true,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: MapboxConfig | null }>("/api/admin/mapbox/config");
      if (response.data) {
        setConfig(response.data);
        setFormData({
          access_token: response.data.access_token || "",
          public_access_token: response.data.public_access_token || "",
          style_url: response.data.style_url || "",
          is_enabled: response.data.is_enabled,
        });
      }
    } catch (error) {
      console.error("Error loading config:", error);
      toast.error("Failed to load Mapbox configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await fetcher.put("/api/admin/mapbox/config", formData);
      toast.success("Mapbox configuration saved successfully");
      await loadConfig();
    } catch (error: any) {
      toast.error(error.message || "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading Mapbox configuration..." />;
  }

  return (
    <div className="bg-white border rounded-lg p-6">
      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <Label htmlFor="is_enabled">Enable Mapbox</Label>
          <div className="flex items-center gap-4 mt-2">
            <input
              type="checkbox"
              id="is_enabled"
              checked={formData.is_enabled}
              onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked })}
              className="w-5 h-5"
            />
            <span className="text-sm text-gray-600">
              Enable Mapbox services across the platform
            </span>
          </div>
        </div>

        <div>
          <Label htmlFor="access_token">Server Access Token *</Label>
          <div className="relative mt-1">
            <Input
              id="access_token"
              type={showAccessToken ? "text" : "password"}
              value={formData.access_token}
              onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
              placeholder="pk.eyJ1Ijoi..."
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowAccessToken(!showAccessToken)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Server-side token for geocoding, routing, and distance calculations. Keep this secret.
          </p>
        </div>

        <div>
          <Label htmlFor="public_access_token">Public Access Token *</Label>
          <div className="relative mt-1">
            <Input
              id="public_access_token"
              type={showPublicToken ? "text" : "password"}
              value={formData.public_access_token}
              onChange={(e) => setFormData({ ...formData, public_access_token: e.target.value })}
              placeholder="pk.eyJ1Ijoi..."
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPublicToken(!showPublicToken)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showPublicToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Public token for client-side map rendering. Can be exposed in frontend code.
          </p>
        </div>

        <div>
          <Label htmlFor="style_url">Map Style URL (Optional)</Label>
          <Input
            id="style_url"
            type="url"
            value={formData.style_url}
            onChange={(e) => setFormData({ ...formData, style_url: e.target.value })}
            placeholder="mapbox://styles/mapbox/streets-v12"
            className="mt-1"
          />
          <p className="text-xs text-gray-500 mt-1">
            Custom Mapbox style URL. Defaults to Mapbox Streets if not provided.
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </form>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Getting Started</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
          <li>Sign up for a Mapbox account at <a href="https://www.mapbox.com" target="_blank" rel="noopener noreferrer" className="underline">mapbox.com</a></li>
          <li>Create an access token in your Mapbox account dashboard</li>
          <li>Use the same token for both server and public access, or create separate tokens with appropriate scopes</li>
          <li>For custom styles, create a style in Mapbox Studio and use its URL</li>
          <li>Reference: <a href="https://docs.mapbox.com/api/" target="_blank" rel="noopener noreferrer" className="underline">Mapbox API Documentation</a></li>
        </ol>
      </div>
    </div>
  );
}
