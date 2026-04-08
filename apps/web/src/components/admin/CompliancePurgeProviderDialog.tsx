"use client";

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";

const PHRASE = "PURGE PROVIDER ORG";

type PurgeSuccessPayload = {
  report?: unknown;
  compliance_audit_id?: string | null;
  compliance_audit_write_error?: string | null;
};

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

export function CompliancePurgeProviderDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  /** Business email on the provider record (shown for confirmation typing). */
  providerEmail: string;
  /** Owner account email (must match typed confirmation if used instead of provider email). */
  ownerEmail: string;
  onComplete?: () => void;
}) {
  const { open, onOpenChange, providerId, providerEmail, ownerEmail, onComplete } = props;
  const [reason, setReason] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [phrase, setPhrase] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PurgeSuccessPayload | null>(null);

  const reset = useCallback(() => {
    setReason("");
    setEmailConfirm("");
    setPhrase("");
    setAck(false);
    setBusy(false);
    setDone(null);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    if (reason.trim().length < 20) {
      toast.error("Enter a reason with at least 20 characters (audit requirement).");
      return;
    }
    if (!ack) {
      toast.error("Confirm that you understand this action is irreversible.");
      return;
    }
    if (phrase.trim() !== PHRASE) {
      toast.error(`Type exactly: ${PHRASE}`);
      return;
    }

    const allowed = [providerEmail, ownerEmail].filter((e) => e && e.trim());
    const typed = normalizeEmail(emailConfirm);
    const ok = allowed.some((e) => normalizeEmail(e) === typed);
    if (!ok) {
      toast.error("Typed email must match the provider business email or the owner account email.");
      return;
    }

    try {
      setBusy(true);
      const res = (await fetcher.post("/api/admin/compliance/purge-provider", {
        provider_id: providerId,
        reason: reason.trim(),
        confirmation_phrase: PHRASE,
        typed_email_confirmation: emailConfirm.trim(),
        acknowledge_irreversible: true,
      })) as { data?: PurgeSuccessPayload };
      const payload = res.data;
      setDone({
        report: payload?.report,
        compliance_audit_id: payload?.compliance_audit_id ?? null,
        compliance_audit_write_error: payload?.compliance_audit_write_error ?? null,
      });
      toast.success("Organization purged. Save the confirmation report if required.");
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : "Purge failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {!done ? (
          <>
            <DialogHeader>
              <DialogTitle>Purge provider organization (compliance)</DialogTitle>
              <DialogDescription className="text-left space-y-2">
                <span className="block">
                  Permanently deletes this provider&apos;s data, linked staff logins, and the owner
                  account. For regulatory or verified erasure requests only.
                </span>
                <span className="block font-medium text-red-700">This cannot be undone.</span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="prov-purge-reason">Reason (min. 20 characters)</Label>
                <Textarea
                  id="prov-purge-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  className="mt-1.5"
                  placeholder="Reference: ticket ID, DSAR reference, or legal basis…"
                />
                <p className="mt-1 text-xs text-muted-foreground">{reason.trim().length}/5000</p>
              </div>
              <div>
                <Label htmlFor="prov-purge-email">Type provider or owner email to confirm</Label>
                <Input
                  id="prov-purge-email"
                  value={emailConfirm}
                  onChange={(e) => setEmailConfirm(e.target.value)}
                  autoComplete="off"
                  className="mt-1.5"
                  placeholder={providerEmail || ownerEmail}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Must match:{" "}
                  {[...new Set([providerEmail, ownerEmail].filter((e) => e?.trim()))].join(" · ") ||
                    "—"}
                </p>
              </div>
              <div>
                <Label htmlFor="prov-purge-phrase">Confirmation phrase</Label>
                <Input
                  id="prov-purge-phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  autoComplete="off"
                  className="mt-1.5"
                  placeholder={PHRASE}
                />
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="prov-purge-ack" checked={ack} onCheckedChange={(c) => setAck(c === true)} />
                <label htmlFor="prov-purge-ack" className="text-sm leading-tight text-muted-foreground">
                  I understand this permanently removes the organization and associated accounts, and I am
                  authorised to perform this erasure.
                </label>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={busy} onClick={submit}>
                {busy ? "Purging…" : "Purge organization"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Purge confirmation report</DialogTitle>
              <DialogDescription>
                Store this record with your compliance files. A copy is also written to the platform audit
                log
                {done.compliance_audit_id ? ` (id: ${done.compliance_audit_id})` : ""}.
                {done.compliance_audit_write_error ? (
                  <span className="mt-2 block text-amber-700">
                    Warning: audit row write failed — {done.compliance_audit_write_error}
                  </span>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
              {JSON.stringify(done.report, null, 2)}
            </pre>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(JSON.stringify(done.report, null, 2));
                  toast.success("Report copied");
                }}
              >
                Copy report JSON
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onComplete?.();
                  handleOpenChange(false);
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
