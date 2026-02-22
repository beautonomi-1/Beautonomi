"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Copy, Webhook, TestTube, Eye, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  retry_count: number;
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  status: string;
  response_status: number | null;
  error_message: string | null;
  attempt_count: number;
  created_at: string;
  sent_at: string | null;
}

const availableEvents = [
  "booking.created",
  "booking.updated",
  "booking.cancelled",
  "booking.completed",
  "payment.received",
  "payment.refunded",
  "provider.approved",
  "provider.suspended",
  "user.created",
  "user.updated",
  "review.created",
  "review.updated",
];

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewingEndpoint, setViewingEndpoint] = useState<WebhookEndpoint | null>(null);
  const [viewingEvents, setViewingEvents] = useState<WebhookEvent[]>([]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [testingEndpoint, setTestingEndpoint] = useState<WebhookEndpoint | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [editingEndpoint, setEditingEndpoint] = useState<WebhookEndpoint | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    events: [] as string[],
    is_active: true,
    retry_count: 3,
    timeout_seconds: 30,
    headers: "{}",
  });

  useEffect(() => {
    loadEndpoints();
  }, []);

  const loadEndpoints = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ endpoints: WebhookEndpoint[] }>(
        "/api/admin/webhooks/endpoints"
      );
      setEndpoints(response.endpoints || []);
    } catch (error) {
      console.error("Failed to load webhook endpoints:", error);
      toast.error("Failed to load webhook endpoints");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingEndpoint(null);
    setNewSecret(null);
    setFormData({
      name: "",
      url: "",
      events: [],
      is_active: true,
      retry_count: 3,
      timeout_seconds: 30,
      headers: "{}",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (endpoint: WebhookEndpoint) => {
    setEditingEndpoint(endpoint);
    setNewSecret(null);
    setFormData({
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.events || [],
      is_active: endpoint.is_active,
      retry_count: endpoint.retry_count,
      timeout_seconds: endpoint.timeout_seconds,
      headers: "{}",
    });
    setIsDialogOpen(true);
  };

  const handleView = async (endpoint: WebhookEndpoint) => {
    setViewingEndpoint(endpoint);
    try {
      const response = await fetcher.get<{
        endpoint: WebhookEndpoint;
        events: WebhookEvent[];
      }>(`/api/admin/webhooks/endpoints/${endpoint.id}`);
      setViewingEvents(response.events || []);
      setIsViewDialogOpen(true);
    } catch (error) {
      console.error("Failed to load endpoint details:", error);
      toast.error("Failed to load endpoint details");
    }
  };

  const handleTest = (endpoint: WebhookEndpoint) => {
    setTestingEndpoint(endpoint);
    setTestResult(null);
    setIsTestDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this webhook endpoint?")) return;

    try {
      await fetcher.delete(`/api/admin/webhooks/endpoints/${id}`);
      toast.success("Webhook endpoint deleted successfully");
      loadEndpoints();
    } catch (error) {
      console.error("Failed to delete endpoint:", error);
      toast.error("Failed to delete webhook endpoint");
    }
  };

  const handleSave = async () => {
    try {
      let headersObj = {};
      try {
        headersObj = JSON.parse(formData.headers);
      } catch {
        toast.error("Invalid JSON in headers field");
        return;
      }

      if (editingEndpoint) {
        await fetcher.patch(`/api/admin/webhooks/endpoints/${editingEndpoint.id}`, {
          ...formData,
          headers: headersObj,
        });
        toast.success("Webhook endpoint updated successfully");
      } else {
        const response = await fetcher.post<{ endpoint: WebhookEndpoint & { secret?: string } }>(
          "/api/admin/webhooks/endpoints",
          {
            ...formData,
            headers: headersObj,
          }
        );
        if (response.endpoint.secret) {
          setNewSecret(response.endpoint.secret);
          toast.success("Webhook endpoint created successfully");
        }
      }
      setIsDialogOpen(false);
      loadEndpoints();
    } catch (error) {
      console.error("Failed to save endpoint:", error);
      toast.error(error instanceof FetchError ? error.message : "Failed to save webhook endpoint");
    }
  };

  const handleRunTest = async () => {
    if (!testingEndpoint) return;

    try {
      const response = await fetcher.post<{
        success: boolean;
        status: number;
        response: string;
        timestamp: number;
        signature: string;
      }>(`/api/admin/webhooks/endpoints/${testingEndpoint.id}/test`, {
        test_payload: { test: true, message: "Test webhook from admin panel" },
      });

      setTestResult(response);
      toast.success("Test webhook sent");
      loadEndpoints(); // Refresh to see the test event
    } catch (error) {
      console.error("Failed to test webhook:", error);
      toast.error(error instanceof FetchError ? error.message : "Failed to test webhook");
      setTestResult({
        success: false,
        error: error instanceof FetchError ? error.message : "Test failed",
      });
    }
  };

  const handleCopySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast.success("Secret copied to clipboard");
  };

  const toggleEvent = (event: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-4 h-4" />;
      case "failed":
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading webhook endpoints..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Webhooks Management</h1>
            <p className="text-gray-600 mt-1">Configure webhook endpoints for external integrations</p>
          </div>
          <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
            <Plus className="w-4 h-4 mr-2" />
            Create Webhook
          </Button>
        </div>

        {newSecret && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <h3 className="font-semibold text-yellow-900">Webhook Secret</h3>
                </div>
                <p className="text-sm text-yellow-800 mb-3">
                  Please copy this secret now. You won't be able to see it again!
                </p>
                <div className="flex items-center gap-2">
                  <Input value={newSecret} readOnly className="font-mono text-sm" />
                  <Button variant="outline" size="sm" onClick={() => handleCopySecret(newSecret)}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNewSecret(null)}>
                ×
              </Button>
            </div>
          </div>
        )}

        <Tabs defaultValue="endpoints" className="space-y-4">
          <TabsList>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="failures">Failed Events</TabsTrigger>
          </TabsList>

          <TabsContent value="endpoints" className="space-y-4">
            {endpoints.length === 0 ? (
              <EmptyState
                icon={Webhook}
                title="No webhook endpoints"
                description="Create your first webhook endpoint to get started"
                action={{
                  label: "Create Webhook",
                  onClick: handleCreate,
                }}
              />
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Retries</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {endpoints.map((endpoint) => (
                      <TableRow key={endpoint.id}>
                        <TableCell className="font-medium">{endpoint.name}</TableCell>
                        <TableCell>
                          <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                            {endpoint.url.length > 50
                              ? `${endpoint.url.substring(0, 50)}...`
                              : endpoint.url}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {endpoint.events.slice(0, 2).map((e) => (
                              <Badge key={e} variant="secondary" className="text-xs">
                                {e}
                              </Badge>
                            ))}
                            {endpoint.events.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{endpoint.events.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {endpoint.is_active ? (
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>{endpoint.retry_count}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleView(endpoint)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTest(endpoint)}
                            >
                              <TestTube className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(endpoint)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(endpoint.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="failures" className="space-y-4">
            <WebhookFailuresTab />
          </TabsContent>
        </Tabs>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingEndpoint ? "Edit Webhook Endpoint" : "Create Webhook Endpoint"}
              </DialogTitle>
              <DialogDescription>
                {editingEndpoint
                  ? "Update webhook endpoint configuration"
                  : "Create a new webhook endpoint for external integrations"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Production Webhook"
                  required
                />
              </div>

              <div>
                <Label htmlFor="url">Webhook URL *</Label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://example.com/webhook"
                  required
                />
              </div>

              <div>
                <Label>Subscribe to Events *</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-64 overflow-y-auto p-2 border rounded">
                  {availableEvents.map((event) => (
                    <div
                      key={event}
                      className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleEvent(event)}
                    >
                      <Checkbox
                        checked={formData.events.includes(event)}
                        onCheckedChange={() => toggleEvent(event)}
                      />
                      <span className="text-sm">{event}</span>
                    </div>
                  ))}
                </div>
                {formData.events.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">Please select at least one event</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="retry_count">Retry Count</Label>
                  <Input
                    id="retry_count"
                    type="number"
                    value={formData.retry_count}
                    onChange={(e) =>
                      setFormData({ ...formData, retry_count: parseInt(e.target.value) || 3 })
                    }
                    min={0}
                    max={10}
                  />
                </div>
                <div>
                  <Label htmlFor="timeout_seconds">Timeout (seconds)</Label>
                  <Input
                    id="timeout_seconds"
                    type="number"
                    value={formData.timeout_seconds}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        timeout_seconds: parseInt(e.target.value) || 30,
                      })
                    }
                    min={1}
                    max={300}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="headers">Custom Headers (JSON)</Label>
                <Textarea
                  id="headers"
                  value={formData.headers}
                  onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                  rows={3}
                  placeholder='{"Authorization": "Bearer token"}'
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional custom headers to include with webhook requests
                </p>
              </div>

              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <div>
                  <Label>Active</Label>
                  <p className="text-xs text-gray-500">Enable this webhook endpoint</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={formData.events.length === 0}
                className="bg-[#FF0077] hover:bg-[#D60565]"
              >
                {editingEndpoint ? "Update" : "Create"} Webhook
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Test Dialog */}
        <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Test Webhook: {testingEndpoint?.name}</DialogTitle>
              <DialogDescription>
                Send a test webhook to verify the endpoint is working
              </DialogDescription>
            </DialogHeader>

            {testResult && (
              <div
                className={`p-4 rounded-lg mb-4 ${
                  testResult.success
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <h3 className="font-semibold">
                    {testResult.success ? "Test Successful" : "Test Failed"}
                  </h3>
                </div>
                {testResult.status && (
                  <p className="text-sm">HTTP Status: {testResult.status}</p>
                )}
                {testResult.response && (
                  <div className="mt-2">
                    <p className="text-sm font-medium mb-1">Response:</p>
                    <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-32">
                      {testResult.response}
                    </pre>
                  </div>
                )}
                {testResult.error && (
                  <p className="text-sm text-red-600 mt-2">{testResult.error}</p>
                )}
              </div>
            )}

            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Click the button below to send a test webhook to this endpoint.
              </p>
              <Button onClick={handleRunTest} className="bg-[#FF0077] hover:bg-[#D60565]">
                <TestTube className="w-4 h-4 mr-2" />
                Send Test Webhook
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* View Details Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Webhook Details: {viewingEndpoint?.name}</DialogTitle>
              <DialogDescription>View endpoint details and recent events</DialogDescription>
            </DialogHeader>

            {viewingEndpoint && (
              <div className="space-y-6">
                <div>
                  <Label className="text-sm font-medium text-gray-500">URL</Label>
                  <p className="text-sm font-mono bg-gray-100 p-2 rounded">{viewingEndpoint.url}</p>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-500">Subscribed Events</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {viewingEndpoint.events.map((event) => (
                      <Badge key={event} variant="secondary">
                        {event}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-500 mb-2 block">
                    Recent Events
                  </Label>
                  {viewingEvents.length === 0 ? (
                    <p className="text-sm text-gray-500">No events yet</p>
                  ) : (
                    <div className="space-y-2">
                      {viewingEvents.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-center justify-between p-3 border rounded"
                        >
                          <div className="flex items-center gap-3">
                            {getStatusIcon(event.status)}
                            <div>
                              <p className="text-sm font-medium">{event.event_type}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(event.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getStatusColor(event.status)}>
                              {event.status}
                            </Badge>
                            {event.response_status && (
                              <Badge variant="outline">{event.response_status}</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}

function WebhookFailuresTab() {
  const [failures, setFailures] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFailures();
  }, []);

  const loadFailures = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: any[] }>("/api/admin/webhooks/failures");
      setFailures(response.data || []);
    } catch (error) {
      console.error("Failed to load webhook failures:", error);
      toast.error("Failed to load webhook failures");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading webhook failures..." />;
  }

  return (
    <div>
      {failures.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No webhook failures"
          description="All webhooks are working correctly"
        />
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event Type</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.map((failure) => (
                <TableRow key={failure.id}>
                  <TableCell className="font-medium">{failure.event_type}</TableCell>
                  <TableCell>
                    <code className="text-xs">{failure.endpoint_id?.substring(0, 8)}...</code>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-red-100 text-red-800">Failed</Badge>
                  </TableCell>
                  <TableCell>{failure.attempt_count}</TableCell>
                  <TableCell>
                    {new Date(failure.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
