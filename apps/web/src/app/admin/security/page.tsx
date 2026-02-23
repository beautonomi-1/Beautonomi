"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Save } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function AdminSecurity() {
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState({
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
      maxAge: 90, // days
    },
    twoFactor: {
      enabled: false,
      required: false,
    },
    rateLimiting: {
      enabled: true,
      maxAttempts: 5,
      windowMinutes: 15,
    },
    dataRetention: {
      enabled: false,
      retentionDays: 365,
    },
  });
  const [isSaving, setIsSaving] = useState(false);
  const [accountCopy, setAccountCopy] = useState({
    title: "Keeping your account secure",
    body: "We regularly review accounts to make sure they're as secure as possible. We'll also let you know if there's more we can do to increase the security of your account.",
    safety_tips_customer: { label: "Safety tips for customers", url: "/help#customer" },
    safety_tips_provider: { label: "Safety tips for providers", url: "/help#provider" },
  });
  const [accountCopySaving, setAccountCopySaving] = useState(false);
  const [paymentCopy, setPaymentCopy] = useState({
    title: "Make all payments through Beautonomi",
    body: "Always pay and communicate through Beautonomi to ensure you're protected under our Terms of Service, Payments Terms of Service, cancellation, and other safeguards.",
    learn_more_url: "/terms-and-condition",
    learn_more_label: "Learn more",
  });
  const [paymentCopySaving, setPaymentCopySaving] = useState(false);

  useEffect(() => {
    loadSettings();
    loadAccountCopy();
    loadPaymentCopy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const res = await fetcher.get<{
        data?: {
          password_policy?: { min_length?: number; require_uppercase?: boolean; require_lowercase?: boolean; require_numbers?: boolean; require_special_chars?: boolean; max_age_days?: number };
          two_factor?: { enabled?: boolean; required_for_admins?: boolean };
          rate_limiting?: { enabled?: boolean; max_attempts?: number; window_minutes?: number };
          data_retention?: { enabled?: boolean; retention_days?: number };
        };
      }>("/api/admin/security");
      const data = res?.data;
      setSettings({
        passwordPolicy: {
          minLength: data?.password_policy?.min_length ?? 8,
          requireUppercase: data?.password_policy?.require_uppercase ?? true,
          requireLowercase: data?.password_policy?.require_lowercase ?? true,
          requireNumbers: data?.password_policy?.require_numbers ?? true,
          requireSpecialChars: data?.password_policy?.require_special_chars ?? false,
          maxAge: data?.password_policy?.max_age_days ?? 90,
        },
        twoFactor: {
          enabled: data?.two_factor?.enabled ?? false,
          required: data?.two_factor?.required_for_admins ?? false,
        },
        rateLimiting: {
          enabled: data?.rate_limiting?.enabled ?? true,
          maxAttempts: data?.rate_limiting?.max_attempts ?? 5,
          windowMinutes: data?.rate_limiting?.window_minutes ?? 15,
        },
        dataRetention: {
          enabled: data?.data_retention?.enabled ?? false,
          retentionDays: data?.data_retention?.retention_days ?? 365,
        },
      });
    } catch {
      toast.error("Failed to load security settings");
    } finally {
      setIsLoading(false);
    }
  };

  const loadAccountCopy = async () => {
    try {
      const res = await fetcher.get<{ data?: typeof accountCopy }>("/api/admin/account-security-copy");
      if (res?.data) setAccountCopy(res.data);
    } catch {
      // use defaults
    }
  };

  const handleSaveAccountCopy = async () => {
    try {
      setAccountCopySaving(true);
      await fetcher.patch("/api/admin/account-security-copy", accountCopy);
      toast.success("Account security copy saved");
    } catch {
      toast.error("Failed to save account security copy");
    } finally {
      setAccountCopySaving(false);
    }
  };

  const loadPaymentCopy = async () => {
    try {
      const res = await fetcher.get<{ data?: typeof paymentCopy }>("/api/admin/payment-safety-copy");
      if (res?.data) setPaymentCopy(res.data);
    } catch {
      // keep defaults
    }
  };

  const handleSavePaymentCopy = async () => {
    try {
      setPaymentCopySaving(true);
      await fetcher.patch("/api/admin/payment-safety-copy", paymentCopy);
      toast.success("Payment safety copy saved");
    } catch {
      toast.error("Failed to save payment safety copy");
    } finally {
      setPaymentCopySaving(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await fetcher.patch("/api/admin/security", {
          password_policy: {
            min_length: settings.passwordPolicy.minLength,
            require_uppercase: settings.passwordPolicy.requireUppercase,
            require_lowercase: settings.passwordPolicy.requireLowercase,
            require_numbers: settings.passwordPolicy.requireNumbers,
            require_special_chars: settings.passwordPolicy.requireSpecialChars,
            max_age_days: settings.passwordPolicy.maxAge,
          },
          two_factor: {
            enabled: settings.twoFactor.enabled,
            required_for_admins: settings.twoFactor.required,
          },
          rate_limiting: {
            enabled: settings.rateLimiting.enabled,
            max_attempts: settings.rateLimiting.maxAttempts,
            window_minutes: settings.rateLimiting.windowMinutes,
          },
          data_retention: {
            enabled: settings.dataRetention.enabled,
            retention_days: settings.dataRetention.retentionDays,
          },
        });
      toast.success("Security settings saved successfully");
    } catch {
      toast.error("Failed to save security settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading security settings..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Security & Compliance</h1>
            <p className="text-gray-600 mt-1">Manage security policies and compliance settings</p>
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        <Tabs defaultValue="password" className="space-y-4">
          <TabsList>
            <TabsTrigger value="password">Password Policy</TabsTrigger>
            <TabsTrigger value="2fa">Two-Factor Authentication</TabsTrigger>
            <TabsTrigger value="rate-limiting">Rate Limiting</TabsTrigger>
            <TabsTrigger value="data-retention">Data Retention</TabsTrigger>
            <TabsTrigger value="account-copy">Account security copy</TabsTrigger>
            <TabsTrigger value="payment-copy">Payment safety copy</TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <Card>
              <CardHeader>
                <CardTitle>Password Policy</CardTitle>
                <CardDescription>
                  Configure password requirements for all users
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Minimum Length</Label>
                  <Input
                    type="number"
                    value={settings.passwordPolicy.minLength}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        passwordPolicy: {
                          ...settings.passwordPolicy,
                          minLength: parseInt(e.target.value) || 8,
                        },
                      })
                    }
                    min={6}
                    max={32}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require Uppercase</Label>
                    <p className="text-sm text-gray-500">At least one uppercase letter</p>
                  </div>
                  <Switch
                    checked={settings.passwordPolicy.requireUppercase}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        passwordPolicy: {
                          ...settings.passwordPolicy,
                          requireUppercase: checked,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require Lowercase</Label>
                    <p className="text-sm text-gray-500">At least one lowercase letter</p>
                  </div>
                  <Switch
                    checked={settings.passwordPolicy.requireLowercase}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        passwordPolicy: {
                          ...settings.passwordPolicy,
                          requireLowercase: checked,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require Numbers</Label>
                    <p className="text-sm text-gray-500">At least one number</p>
                  </div>
                  <Switch
                    checked={settings.passwordPolicy.requireNumbers}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        passwordPolicy: {
                          ...settings.passwordPolicy,
                          requireNumbers: checked,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require Special Characters</Label>
                    <p className="text-sm text-gray-500">At least one special character</p>
                  </div>
                  <Switch
                    checked={settings.passwordPolicy.requireSpecialChars}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        passwordPolicy: {
                          ...settings.passwordPolicy,
                          requireSpecialChars: checked,
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Maximum Password Age (days)</Label>
                  <Input
                    type="number"
                    value={settings.passwordPolicy.maxAge}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        passwordPolicy: {
                          ...settings.passwordPolicy,
                          maxAge: parseInt(e.target.value) || 90,
                        },
                      })
                    }
                    min={0}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Set to 0 to disable password expiration
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="2fa">
            <Card>
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Configure 2FA requirements for enhanced security
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable 2FA</Label>
                    <p className="text-sm text-gray-500">Allow users to enable 2FA</p>
                  </div>
                  <Switch
                    checked={settings.twoFactor.enabled}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        twoFactor: { ...settings.twoFactor, enabled: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require 2FA</Label>
                    <p className="text-sm text-gray-500">
                      Force all users to enable 2FA (requires 2FA to be enabled)
                    </p>
                  </div>
                  <Switch
                    checked={settings.twoFactor.required}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        twoFactor: { ...settings.twoFactor, required: checked },
                      })
                    }
                    disabled={!settings.twoFactor.enabled}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rate-limiting">
            <Card>
              <CardHeader>
                <CardTitle>Rate Limiting</CardTitle>
                <CardDescription>
                  Configure rate limiting to prevent abuse
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Rate Limiting</Label>
                    <p className="text-sm text-gray-500">Limit API requests per user</p>
                  </div>
                  <Switch
                    checked={settings.rateLimiting.enabled}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        rateLimiting: { ...settings.rateLimiting, enabled: checked },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Max Attempts</Label>
                  <Input
                    type="number"
                    value={settings.rateLimiting.maxAttempts}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        rateLimiting: {
                          ...settings.rateLimiting,
                          maxAttempts: parseInt(e.target.value) || 5,
                        },
                      })
                    }
                    min={1}
                    disabled={!settings.rateLimiting.enabled}
                  />
                </div>
                <div>
                  <Label>Time Window (minutes)</Label>
                  <Input
                    type="number"
                    value={settings.rateLimiting.windowMinutes}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        rateLimiting: {
                          ...settings.rateLimiting,
                          windowMinutes: parseInt(e.target.value) || 15,
                        },
                      })
                    }
                    min={1}
                    disabled={!settings.rateLimiting.enabled}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data-retention">
            <Card>
              <CardHeader>
                <CardTitle>Data Retention</CardTitle>
                <CardDescription>
                  Configure data retention policies for GDPR compliance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Data Retention</Label>
                    <p className="text-sm text-gray-500">
                      Automatically delete data after retention period
                    </p>
                  </div>
                  <Switch
                    checked={settings.dataRetention.enabled}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        dataRetention: { ...settings.dataRetention, enabled: checked },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Retention Period (days)</Label>
                  <Input
                    type="number"
                    value={settings.dataRetention.retentionDays}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        dataRetention: {
                          ...settings.dataRetention,
                          retentionDays: parseInt(e.target.value) || 365,
                        },
                      })
                    }
                    min={1}
                    disabled={!settings.dataRetention.enabled}
                  />
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    <strong>Warning:</strong> Enabling data retention will permanently delete user
                    data after the retention period. This action cannot be undone.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account-copy">
            <Card>
              <CardHeader>
                <CardTitle>Account security copy</CardTitle>
                <CardDescription>
                  Text shown on the Login & security page sidebar: &quot;Keeping your account secure&quot; and safety tips links. Shown to customers and providers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Sidebar title</Label>
                  <Input
                    value={accountCopy.title}
                    onChange={(e) =>
                      setAccountCopy((c) => ({ ...c, title: e.target.value }))
                    }
                    placeholder="Keeping your account secure"
                  />
                </div>
                <div>
                  <Label>Intro paragraph</Label>
                  <Textarea
                    value={accountCopy.body}
                    onChange={(e) =>
                      setAccountCopy((c) => ({ ...c, body: e.target.value }))
                    }
                    placeholder="We regularly review accounts..."
                    rows={3}
                    className="resize-none"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Safety tips for customers — label</Label>
                    <Input
                      value={accountCopy.safety_tips_customer?.label ?? ""}
                      onChange={(e) =>
                        setAccountCopy((c) => ({
                          ...c,
                          safety_tips_customer: {
                            ...c.safety_tips_customer,
                            label: e.target.value,
                          },
                        }))
                      }
                      placeholder="Safety tips for customers"
                    />
                    <Label className="text-xs text-muted-foreground">URL (path or full)</Label>
                    <Input
                      value={accountCopy.safety_tips_customer?.url ?? ""}
                      onChange={(e) =>
                        setAccountCopy((c) => ({
                          ...c,
                          safety_tips_customer: {
                            ...c.safety_tips_customer,
                            url: e.target.value,
                          },
                        }))
                      }
                      placeholder="/help#customer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Safety tips for providers — label</Label>
                    <Input
                      value={accountCopy.safety_tips_provider?.label ?? ""}
                      onChange={(e) =>
                        setAccountCopy((c) => ({
                          ...c,
                          safety_tips_provider: {
                            ...c.safety_tips_provider,
                            label: e.target.value,
                          },
                        }))
                      }
                      placeholder="Safety tips for providers"
                    />
                    <Label className="text-xs text-muted-foreground">URL (path or full)</Label>
                    <Input
                      value={accountCopy.safety_tips_provider?.url ?? ""}
                      onChange={(e) =>
                        setAccountCopy((c) => ({
                          ...c,
                          safety_tips_provider: {
                            ...c.safety_tips_provider,
                            url: e.target.value,
                          },
                        }))
                      }
                      placeholder="/help#provider"
                    />
                  </div>
                </div>
                <Button onClick={handleSaveAccountCopy} disabled={accountCopySaving}>
                  <Save className="w-4 h-4 mr-2" />
                  {accountCopySaving ? "Saving..." : "Save account security copy"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment-copy">
            <Card>
              <CardHeader>
                <CardTitle>Payment safety copy</CardTitle>
                <CardDescription>
                  Text shown on the Payments page sidebar: &quot;Make all payments through Beautonomi&quot; and Learn more link. Shown to customers and providers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Sidebar title</Label>
                  <Input
                    value={paymentCopy.title}
                    onChange={(e) =>
                      setPaymentCopy((c) => ({ ...c, title: e.target.value }))
                    }
                    placeholder="Make all payments through Beautonomi"
                  />
                </div>
                <div>
                  <Label>Intro paragraph</Label>
                  <Textarea
                    value={paymentCopy.body}
                    onChange={(e) =>
                      setPaymentCopy((c) => ({ ...c, body: e.target.value }))
                    }
                    placeholder="Always pay and communicate through Beautonomi..."
                    rows={3}
                    className="resize-none"
                  />
                </div>
                <div>
                  <Label>Learn more — label</Label>
                  <Input
                    value={paymentCopy.learn_more_label ?? ""}
                    onChange={(e) =>
                      setPaymentCopy((c) => ({ ...c, learn_more_label: e.target.value }))
                    }
                    placeholder="Learn more"
                  />
                </div>
                <div>
                  <Label>Learn more — URL (path or full)</Label>
                  <Input
                    value={paymentCopy.learn_more_url ?? ""}
                    onChange={(e) =>
                      setPaymentCopy((c) => ({ ...c, learn_more_url: e.target.value }))
                    }
                    placeholder="/terms-and-condition"
                  />
                </div>
                <Button onClick={handleSavePaymentCopy} disabled={paymentCopySaving}>
                  <Save className="w-4 h-4 mr-2" />
                  {paymentCopySaving ? "Saving..." : "Save payment safety copy"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}
