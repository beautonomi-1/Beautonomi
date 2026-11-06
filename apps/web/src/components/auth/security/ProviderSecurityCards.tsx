"use client";

import { useCallback, useEffect, useState } from "react";
import {
  generateRecoveryCodes,
  getRecoveryCodeCount,
  listTrustedDevices,
  listVerifiedTotpFactors,
  notifyMfaChanged,
  revokeTrustedDevice,
  securityErrorMessage,
  startTotpChallenge,
  startTotpEnrollment,
  unenrollTotpFactor,
  verifyMfaTotp,
  type TotpEnrollment,
  type TrustedDevice,
} from "@beautonomi/auth-security";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseClient } from "@/lib/supabase/client";
import { webSecurityApi } from "@/lib/auth/security-api";

const CARD = "backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6";

function supabaseClient(): SupabaseClient | null {
  return getSupabaseClient() as unknown as SupabaseClient | null;
}

function RecoveryCodesDialog({ codes, onClose }: { codes: string[] | null; onClose: () => void }) {
  const text = codes?.join("\n") ?? "";
  return (
    <Dialog open={codes !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save your recovery codes</DialogTitle>
          <DialogDescription>
            If you lose your phone, each code lets you sign in once. They won&apos;t be shown again.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-4 font-mono text-sm" aria-label="Recovery codes">
          {codes?.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(text).then(
                () => toast.success("Recovery codes copied"),
                () => toast.error("Couldn't copy. Write them down instead."),
              );
            }}
          >
            Copy
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = "beautonomi-recovery-codes.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download
          </Button>
          <Button onClick={onClose}>I&apos;ve saved them</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TwoStepCard() {
  const [loading, setLoading] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = supabaseClient();
    if (!supabase) return;
    setLoading(true);
    try {
      const factors = await listVerifiedTotpFactors(supabase);
      setFactorId(factors[0]?.id ?? null);
      if (factors[0]) {
        const res = await getRecoveryCodeCount(webSecurityApi);
        setRemaining(res.data?.remaining ?? null);
      } else {
        setRemaining(null);
      }
    } catch {
      setError("We couldn't load your two-step settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const beginEnroll = async () => {
    const supabase = supabaseClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data, error: enrollError } = await startTotpEnrollment(supabase, "Beautonomi");
    setBusy(false);
    if (enrollError || !data) {
      setError(enrollError?.message ?? "Couldn't start setup.");
      return;
    }
    setCode("");
    setEnrollment(data);
  };

  const confirmCode = async (targetFactorId: string, value: string): Promise<boolean> => {
    const supabase = supabaseClient();
    if (!supabase) return false;
    const { challengeId, error: chError } = await startTotpChallenge(supabase, targetFactorId);
    if (chError || !challengeId) {
      setError(chError?.message ?? "Couldn't verify the code.");
      return false;
    }
    const { error: verifyError } = await verifyMfaTotp(supabase, targetFactorId, challengeId, value);
    if (verifyError) {
      setError("That code isn't right. Use the current code from your authenticator app.");
      setCode("");
      return false;
    }
    return true;
  };

  const finishEnroll = async (value: string) => {
    if (!enrollment || busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    if (!(await confirmCode(enrollment.factorId, value))) {
      setBusy(false);
      return;
    }
    await notifyMfaChanged(webSecurityApi, "enrolled");
    const gen = await generateRecoveryCodes(webSecurityApi);
    setEnrollment(null);
    setBusy(false);
    toast.success("Two-step verification is on");
    if (gen.data?.codes?.length) setCodes(gen.data.codes);
    else toast.error("Couldn't create recovery codes. Generate them below.");
    await load();
  };

  const finishDisable = async (value: string) => {
    if (!factorId || busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    if (!(await confirmCode(factorId, value))) {
      setBusy(false);
      return;
    }
    const supabase = supabaseClient();
    const { error: unenrollError } = supabase
      ? await unenrollTotpFactor(supabase, factorId)
      : { error: new Error("Unavailable") };
    if (unenrollError) {
      setError(unenrollError.message);
      setBusy(false);
      return;
    }
    await notifyMfaChanged(webSecurityApi, "unenrolled");
    setDisabling(false);
    setBusy(false);
    toast.success("Two-step verification is off");
    await load();
  };

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    const res = await generateRecoveryCodes(webSecurityApi);
    setBusy(false);
    if (res.error || !res.data?.codes) {
      setError(securityErrorMessage(res.error, "Couldn't create new recovery codes."));
      return;
    }
    setCodes(res.data.codes);
    setRemaining(res.data.codes.length);
  };

  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tighter text-gray-900">Two-step verification</h2>
          <p className="mt-1 text-sm font-light text-gray-600">
            {factorId
              ? "On. You'll enter a code from your authenticator app when you sign in on a new device or make sensitive changes."
              : "Add a code from an authenticator app (Google Authenticator, 1Password, Authy) when you sign in."}
          </p>
          {factorId && remaining !== null ? (
            <p className={`mt-1 text-xs ${remaining <= 2 ? "text-amber-700" : "text-gray-500"}`}>
              {remaining} recovery {remaining === 1 ? "code" : "codes"} left
            </p>
          ) : null}
        </div>
        {!loading && !enrollment && !disabling ? (
          factorId ? (
            <Button variant="outline" onClick={() => { setCode(""); setError(null); setDisabling(true); }}>
              Turn off
            </Button>
          ) : (
            <Button onClick={() => void beginEnroll()} disabled={busy}>
              {busy ? "Starting…" : "Set up"}
            </Button>
          )
        ) : null}
      </div>

      {enrollment ? (
        <div className="mt-4 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
            <li>Scan this QR code with your authenticator app.</li>
            <li>Enter the 6-digit code it shows.</li>
          </ol>
          {enrollment.qrCode ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={enrollment.qrCode} alt="Authenticator QR code" className="h-44 w-44 rounded-lg border bg-white p-2" />
          ) : null}
          <p className="text-xs text-gray-500">
            Can&apos;t scan? Enter this key: <code className="break-all font-mono">{enrollment.secret}</code>
          </p>
          <OtpDigitInput
            value={code}
            onChange={setCode}
            onComplete={(v) => void finishEnroll(v)}
            disabled={busy}
            autoFocus
            label="Authenticator code"
          />
          <Button variant="outline" onClick={() => setEnrollment(null)} disabled={busy}>
            Cancel
          </Button>
        </div>
      ) : null}

      {disabling ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-gray-700">
            Enter a code from your authenticator app to turn off two-step verification.
          </p>
          <OtpDigitInput
            value={code}
            onChange={setCode}
            onComplete={(v) => void finishDisable(v)}
            disabled={busy}
            autoFocus
            label="Authenticator code"
          />
          <Button variant="outline" onClick={() => setDisabling(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      ) : null}

      {factorId && !enrollment && !disabling ? (
        <button
          type="button"
          className="mt-3 text-sm font-medium text-gray-700 underline"
          onClick={() => void regenerate()}
          disabled={busy}
        >
          Generate new recovery codes
        </button>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}
      <RecoveryCodesDialog codes={codes} onClose={() => setCodes(null)} />
    </div>
  );
}

function formatSeen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `Last active ${d.toLocaleDateString(undefined, { dateStyle: "medium" })}`;
}

export function TrustedDevicesCard() {
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TrustedDevice | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listTrustedDevices(webSecurityApi);
    if (res.error) {
      setError(securityErrorMessage(res.error, "We couldn't load your devices."));
      setDevices([]);
      return;
    }
    setDevices(res.data?.devices ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async () => {
    if (!confirm) return;
    setBusy(true);
    const res = await revokeTrustedDevice(webSecurityApi, confirm.id);
    setBusy(false);
    if (res.error) {
      toast.error(securityErrorMessage(res.error));
      return;
    }
    toast.success("Device removed");
    setConfirm(null);
    await load();
  };

  return (
    <div className={CARD}>
      <h2 className="text-xl font-semibold tracking-tighter text-gray-900">Trusted devices</h2>
      <p className="mt-1 text-sm font-light text-gray-600">
        Devices you&apos;ve confirmed for your business account. Remove any you don&apos;t recognise.
      </p>
      {devices === null ? (
        <p className="mt-3 text-sm text-gray-500" role="status">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No trusted devices yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {d.label || d.platform || "Unknown device"}
                  {d.is_current ? <span className="ml-2 text-xs font-normal text-green-700">This device</span> : null}
                </p>
                <p className="text-xs text-gray-500">{formatSeen(d.last_seen_at)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setConfirm(d)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}

      <Dialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this device?</DialogTitle>
            <DialogDescription>
              {confirm?.is_current
                ? "You'll need to confirm this device again next time."
                : "It will be signed out and will need a new verification code to get back in."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void revoke()} disabled={busy}>
              {busy ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
