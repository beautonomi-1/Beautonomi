import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminModal } from "@/components/admin/AdminModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { Loader2, Plus, Wifi, WifiOff, QrCode, Trash2, RotateCcw, Pause, Play, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

interface Session {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  is_active: boolean;
  is_paused: boolean;
  pause_reason: string | null;
  paused_at: string | null;
  daily_send_count: number;
  hourly_send_count: number;
  wasender_session_id: string;
  created_at: string;
}

function StatusBadge({ status, isPaused }: { status: string; isPaused: boolean }) {
  if (isPaused) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <Pause className="h-3 w-3" /> Paused
      </span>
    );
  }
  switch (status) {
    case "connected":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Connected
        </span>
      );
    case "qr_required":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          <QrCode className="h-3 w-3" /> Scan Required
        </span>
      );
    case "connecting":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" /> Connecting…
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Disconnected
        </span>
      );
  }
}

export function WhatsAppSessionsPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations & dev access is required for WhatsApp sessions."
  );
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhoneE164, setNewPhoneE164] = useState("");
  const [createStep, setCreateStep] = useState<"name" | "qr" | "done">("name");
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: adminQueryKeys.whatsapp.sessions(),
    queryFn: () => adminApi.getJson<Session[]>("/api/admin/whatsapp/sessions"),
    enabled: allowed,
  });

  const phoneValid = /^\+[1-9]\d{7,14}$/.test(newPhoneE164.replace(/\s/g, ""));

  const createMutation = useMutation({
    mutationFn: ({ name, phone_number }: { name: string; phone_number: string }) =>
      adminApi.postJson<Session>("/api/admin/whatsapp/sessions", { name, phone_number }),
    onSuccess: (session) => {
      setCreatedSessionId(session.id);
      setCreateStep("qr");
      adminToast.success("Session created — scan QR to connect.");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.sessions() });
      startQrPolling(session.id);
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/whatsapp/sessions/${id}`),
    onSuccess: () => {
      adminToast.success("Session deleted.");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.sessions() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const connectMutation = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/whatsapp/sessions/${id}/connect`),
    onSuccess: (_d, id) => {
      adminToast.success("Connecting…");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.sessions() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/whatsapp/sessions/${id}/disconnect`),
    onSuccess: () => {
      adminToast.success("Disconnected.");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.sessions() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const startQrPolling = useCallback((sessionId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    const fetchQr = async () => {
      setQrLoading(true);
      try {
        // First trigger connect
        await adminApi.postJson(`/api/admin/whatsapp/sessions/${sessionId}/connect`).catch(() => {});
        const data = await adminApi.getJson<{ qrCode?: string; qr_code?: string }>(`/api/admin/whatsapp/sessions/${sessionId}/qr`);
        setQrData(data?.qrCode || data?.qr_code || null);
      } catch {
        // QR not ready yet
      }
      setQrLoading(false);
    };

    void fetchQr();

    pollRef.current = setInterval(async () => {
      const session = await adminApi.getJson<Session>(`/api/admin/whatsapp/sessions/${sessionId}`).catch(() => null);
      if (session?.status === "connected") {
        if (pollRef.current) clearInterval(pollRef.current);
        setCreateStep("done");
        adminToast.success("WhatsApp connected!");
        void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.sessions() });
        return;
      }
      void fetchQr();
    }, 5000);
  }, [qc]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const closeCreateModal = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setShowCreate(false);
    setCreateStep("name");
    setNewName("");
    setNewPhoneE164("");
    setQrData(null);
    setCreatedSessionId(null);
  };

  const sessions = sessionsQuery.data || [];

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="WhatsApp Sessions"
        description="Manage connected WhatsApp numbers for lead outreach."
        actions={
          <button
            className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4" /> Add Session
          </button>
        }
      />

      {sessionsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No WhatsApp sessions yet"
          description="Connect your first WhatsApp number to start messaging leads."
          action={
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4" /> Connect WhatsApp
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
            <AdminPanel key={s.id} className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{s.name}</h3>
                  {s.phone_number && <p className="text-xs text-gray-500">{s.phone_number}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} isPaused={s.is_paused} />
                  <div className="relative">
                    <button
                      className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      onClick={() => setOpenMenu(openMenu === s.id ? null : s.id)}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {openMenu === s.id && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setOpenMenu(null)} />
                        <div className="absolute right-0 top-8 z-40 w-40 rounded-xl border bg-white py-1 shadow-lg">
                          {s.status !== "connected" && (
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={() => { connectMutation.mutate(s.id); setOpenMenu(null); }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Reconnect
                            </button>
                          )}
                          {s.status === "connected" && (
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={() => { disconnectMutation.mutate(s.id); setOpenMenu(null); }}
                            >
                              <WifiOff className="h-3.5 w-3.5" /> Disconnect
                            </button>
                          )}
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            onClick={() => { deleteMutation.mutate(s.id); setOpenMenu(null); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex gap-4 text-xs text-gray-500">
                <span>Today: {s.daily_send_count}/200</span>
                <span>This hour: {s.hourly_send_count}/30</span>
              </div>

              {s.is_paused && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
                  <Pause className="h-3.5 w-3.5 shrink-0" />
                  <span>{s.pause_reason || "Session paused"}</span>
                </div>
              )}
            </AdminPanel>
          ))}
        </div>
      )}

      {/* Create Session Modal */}
      <AdminModal
        open={showCreate}
        onClose={closeCreateModal}
        title={createStep === "done" ? "Connected!" : createStep === "qr" ? "Scan QR Code" : "Add WhatsApp Session"}
        size="lg"
        footer={
          createStep === "done" ? (
            <button
              className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white"
              onClick={closeCreateModal}
            >
              Done
            </button>
          ) : createStep === "qr" ? (
            <button className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm" onClick={closeCreateModal}>
              Cancel
            </button>
          ) : (
            <div className="flex gap-3">
              <button className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm" onClick={closeCreateModal}>
                Cancel
              </button>
              <button
                className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={!newName.trim() || !phoneValid || createMutation.isPending}
                onClick={() =>
                  createMutation.mutate({
                    name: newName.trim(),
                    phone_number: newPhoneE164.replace(/\s/g, ""),
                  })
                }
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          )
        }
      >
        {createStep === "name" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Session name</label>
              <input
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400/30"
                placeholder='e.g. "Main Line" or "Support"'
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">WhatsApp number (E.164)</label>
              <input
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 font-mono text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400/30"
                placeholder="+27123456789"
                value={newPhoneE164}
                onChange={(e) => setNewPhoneE164(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
              />
              <p className="text-xs text-gray-500">
                Required by{" "}
                <a
                  href="https://wasenderapi.com/api-docs/sessions/create-whatsapp-session"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 underline"
                >
                  WasenderAPI
                </a>{" "}
                when creating a session — use the number you will link via QR.
              </p>
            </div>
          </div>
        )}

        {createStep === "qr" && (
          <div className="flex flex-col items-center gap-4 py-4">
            {qrLoading && !qrData ? (
              <div className="flex h-48 w-48 items-center justify-center rounded-2xl border bg-gray-50">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : qrData ? (
              <div className="rounded-2xl border bg-white p-6">
                <img
                  src={qrData.startsWith("data:") ? qrData : `data:image/png;base64,${qrData}`}
                  alt="WhatsApp QR code"
                  className="h-48 w-48"
                />
              </div>
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-2xl border bg-gray-50 text-sm text-gray-400">
                Waiting for QR…
              </div>
            )}
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium text-gray-900">Scan with WhatsApp</p>
              <p className="text-xs text-gray-500">
                Open WhatsApp → Settings → Linked Devices → Link a Device → Scan this QR code
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Waiting for connection…
            </div>
          </div>
        )}

        {createStep === "done" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Wifi className="h-8 w-8 text-green-600" />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-base font-semibold text-gray-900">WhatsApp Connected</p>
              <p className="text-sm text-gray-500">Your session is ready. You can now send messages to leads.</p>
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  );
}
