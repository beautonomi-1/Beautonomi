import { useCallback, useEffect, useRef, useState } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { readAdminScopeFromStorage } from "@beautonomi/admin-api-client";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminModal } from "@/components/admin/AdminModal";
import { cn } from "@/lib/cn";
import { AlertTriangle, Loader2, Mic, Phone, PhoneOff } from "lucide-react";

type DialerPhase =
  | "idle"
  | "initializing"
  | "ready"
  | "connecting"
  | "ringing"
  | "in-call"
  | "error";

interface LeadVoiceDialerProps {
  leadId: string;
  phoneE164: string | null | undefined;
  tenantId?: string | null;
  doNotContact?: boolean;
  phoneLookupStatus?: string | null;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function phaseLabel(phase: DialerPhase): string {
  switch (phase) {
    case "idle":
      return "Ready";
    case "initializing":
      return "Connecting to voice…";
    case "ready":
      return "Ready to call";
    case "connecting":
      return "Dialing…";
    case "ringing":
      return "Ringing…";
    case "in-call":
      return "On call";
    case "error":
      return "Error";
    default:
      return "";
  }
}

function resolveTenantId(explicit?: string | null): string {
  if (explicit?.trim()) return explicit.trim();
  return readAdminScopeFromStorage().tenantId.trim();
}

export function LeadVoiceDialer({
  leadId,
  phoneE164,
  tenantId: tenantIdProp,
  doNotContact,
  phoneLookupStatus,
}: LeadVoiceDialerProps) {
  const qc = useQueryClient();
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;
  const voiceCfgQ = useQuery({
    queryKey: adminQueryKeys.providerOps.voiceConfig(),
    queryFn: () =>
      adminApi.getJson<{ enabled: boolean; configured: boolean }>(
        "/api/admin/provider-ops/voice/config",
      ),
    staleTime: 60_000,
  });
  const voiceEnabled = voiceCfgQ.data?.enabled ?? false;
  const voiceConfigured = voiceCfgQ.data?.configured ?? false;

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const timerRef = useRef<number | null>(null);
  const callAttemptedRef = useRef(false);

  const [phase, setPhase] = useState<DialerPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micBlocked, setMicBlocked] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState("");

  const phone = phoneE164?.trim() || "";
  const tenantId = resolveTenantId(tenantIdProp);
  const invalidPhone = phoneLookupStatus === "invalid";
  const showWarnings = Boolean(doNotContact || invalidPhone);
  const inProgress = phase === "connecting" || phase === "ringing" || phase === "in-call";
  const canCall = Boolean(phone && tenantId && !inProgress && phase !== "initializing");

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setElapsedSec(0);
    timerRef.current = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
  }, [stopTimer]);

  const destroyDevice = useCallback(() => {
    stopTimer();
    callRef.current = null;
    if (deviceRef.current) {
      try {
        deviceRef.current.destroy();
      } catch {
        // ignore teardown errors
      }
      deviceRef.current = null;
    }
  }, [stopTimer]);

  useEffect(() => {
    return () => {
      destroyDevice();
    };
  }, [destroyDevice, leadId]);

  useEffect(() => {
    destroyDevice();
    setPhase("idle");
    setErrorMessage(null);
    setElapsedSec(0);
    setMicBlocked(false);
    setOutcomeOpen(false);
    setOutcomeNote("");
    callAttemptedRef.current = false;
  }, [leadId, destroyDevice]);

  const outcomeMut = useMutation({
    mutationFn: (description: string) =>
      adminApi.postJson(`/api/admin/provider-ops/leads/${leadId}/activities`, {
        activity_type: "call_logged",
        description,
        metadata: { source: "voice_dialer", direction: "outbound" },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(leadId) });
      void qc.invalidateQueries({
        queryKey: [...adminQueryKeys.providerOps.leadDetail(leadId), "communications"],
      });
      adminToast.success("Browser call logged");
      setOutcomeOpen(false);
      setOutcomeNote("");
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to save call outcome"),
  });

  const saveCallOutcome = useCallback(
    (note: string) => {
      const trimmed = note.trim();
      outcomeMut.mutate(trimmed ? `Call outcome: ${trimmed}` : "Phone call with lead");
    },
    [outcomeMut],
  );

  const promptOutcomeIfNeeded = useCallback(() => {
    if (callAttemptedRef.current) {
      setOutcomeOpen(true);
    }
    callAttemptedRef.current = false;
  }, []);

  const ensureMicAccess = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicBlocked(true);
      setErrorMessage("Microphone access is not supported in this browser.");
      setPhase("error");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicBlocked(false);
      return true;
    } catch {
      setMicBlocked(true);
      setErrorMessage("Microphone permission denied. Allow mic access to place calls.");
      setPhase("error");
      adminToast.error("Microphone permission is required to call");
      return false;
    }
  }, []);

  const attachCallHandlers = useCallback(
    (call: Call) => {
      call.on("accept", () => {
        setPhase("in-call");
        startTimer();
      });
      call.on("ringing", () => {
        setPhase("ringing");
      });
      call.on("disconnect", () => {
        stopTimer();
        callRef.current = null;
        setPhase("ready");
        promptOutcomeIfNeeded();
      });
      call.on("cancel", () => {
        stopTimer();
        callRef.current = null;
        setPhase("ready");
        promptOutcomeIfNeeded();
      });
      call.on("reject", () => {
        stopTimer();
        callRef.current = null;
        setPhase("ready");
        adminToast.info("Call was not answered");
        promptOutcomeIfNeeded();
      });
      call.on("error", (err) => {
        stopTimer();
        callRef.current = null;
        setPhase("error");
        setErrorMessage(err.message || "Call failed");
        adminToast.error(err.message || "Call failed");
      });
    },
    [promptOutcomeIfNeeded, startTimer, stopTimer],
  );

  const ensureDevice = useCallback(async (): Promise<Device> => {
    if (deviceRef.current) return deviceRef.current;

    setPhase("initializing");
    setErrorMessage(null);

    const tokenRes = await adminApi.postJson<{ token: string }>(
      "/api/admin/provider-ops/voice/token",
    );

    const device = new Device(tokenRes.token, {
      logLevel: "error",
      codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
    });

    device.on("error", (err) => {
      setPhase("error");
      setErrorMessage(err.message || "Voice device error");
    });

    device.on("tokenWillExpire", async () => {
      try {
        const refreshed = await adminApi.postJson<{ token: string }>(
          "/api/admin/provider-ops/voice/token",
        );
        device.updateToken(refreshed.token);
      } catch {
        adminToast.error("Voice session expired — try calling again");
      }
    });

    await device.register();
    deviceRef.current = device;
    setPhase("ready");
    return device;
  }, []);

  const handleCall = useCallback(async () => {
    if (!phone) {
      adminToast.error("Lead has no phone number");
      return;
    }
    if (!tenantId) {
      adminToast.error("Tenant context missing — select a tenant in the admin scope picker");
      return;
    }
    if (doNotContact) {
      const ok = window.confirm(
        "This lead is marked Do Not Contact. Place the call anyway?",
      );
      if (!ok) return;
    }
    if (invalidPhone) {
      const ok = window.confirm(
        "Phone lookup marked this number as invalid. Place the call anyway?",
      );
      if (!ok) return;
    }

    const micOk = await ensureMicAccess();
    if (!micOk) return;

    try {
      const device = await ensureDevice();
      setPhase("connecting");
      callAttemptedRef.current = true;
      const call = await device.connect({
        params: {
          To: phone,
          lead_id: leadId,
          tenant_id: tenantId,
        },
      });
      callRef.current = call;
      attachCallHandlers(call);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start call";
      setPhase("error");
      setErrorMessage(msg);
      adminToast.error(msg);
    }
  }, [
    attachCallHandlers,
    doNotContact,
    ensureDevice,
    ensureMicAccess,
    invalidPhone,
    leadId,
    phone,
    tenantId,
  ]);

  const handleHangUp = useCallback(() => {
    if (callRef.current) {
      callRef.current.disconnect();
      return;
    }
    deviceRef.current?.disconnectAll();
    stopTimer();
    setPhase(deviceRef.current ? "ready" : "idle");
  }, [stopTimer]);

  if (!phone) return null;
  if (voiceCfgQ.isLoading) return null;
  if (!voiceEnabled) return null;

  if (!voiceConfigured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
        <p className="font-medium">In-browser calling is enabled but not configured.</p>
        <p className="mt-1 text-amber-800">
          {isSuperadmin ? (
            <>
              Add Twilio Voice credentials in{" "}
              <Link
                to={adminSpaTo("/admin/integrations/calls")}
                className="font-medium underline hover:text-amber-950"
              >
                Integrations → Calls
              </Link>
              .
            </>
          ) : (
            "Ask a superadmin to configure Twilio Voice under Integrations → Calls."
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Browser call
            </p>
            <p className="mt-0.5 truncate font-mono text-sm text-gray-800">{phone}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                  phase === "in-call"
                    ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                    : phase === "error"
                      ? "bg-rose-100 text-rose-700 ring-rose-200"
                      : inProgress
                        ? "bg-amber-100 text-amber-700 ring-amber-200"
                        : "bg-white text-gray-600 ring-gray-200",
                )}
              >
                {phaseLabel(phase)}
                {phase === "in-call" ? ` · ${formatElapsed(elapsedSec)}` : null}
              </span>
              {micBlocked ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-rose-600">
                  <Mic className="h-3 w-3" />
                  Mic blocked
                </span>
              ) : null}
            </div>
            {errorMessage ? (
              <p className="mt-1 text-xs text-rose-600">{errorMessage}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 gap-1.5">
            {inProgress ? (
              <button
                type="button"
                onClick={handleHangUp}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                Hang up
              </button>
            ) : (
              <button
                type="button"
                disabled={!canCall}
                onClick={() => void handleCall()}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {phase === "initializing" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Phone className="h-3.5 w-3.5" />
                )}
                Call
              </button>
            )}
          </div>
        </div>

        {showWarnings ? (
          <div className="mt-2 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            {doNotContact ? (
              <p className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Lead is marked Do Not Contact — outbound calls may be blocked.
              </p>
            ) : null}
            {invalidPhone ? (
              <p className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Phone lookup reported this number as invalid.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <AdminModal
        open={outcomeOpen}
        onClose={() => {
          if (!outcomeMut.isPending) {
            setOutcomeOpen(false);
            setOutcomeNote("");
          }
        }}
        title="Browser call outcome"
        description="Optional notes about how the call went. Saving logs the call on the lead timeline."
        footer={
          <>
            <button
              type="button"
              disabled={outcomeMut.isPending}
              onClick={() => saveCallOutcome("")}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Skip
            </button>
            <button
              type="button"
              disabled={outcomeMut.isPending}
              onClick={() => saveCallOutcome(outcomeNote)}
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {outcomeMut.isPending ? "Saving…" : "Save outcome"}
            </button>
          </>
        }
      >
        <textarea
          value={outcomeNote}
          onChange={(e) => setOutcomeNote(e.target.value)}
          rows={4}
          placeholder="Spoke with owner, requested callback, no answer…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          autoFocus
        />
      </AdminModal>
    </>
  );
}
