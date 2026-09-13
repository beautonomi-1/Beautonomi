"use client";

import { useState } from "react";
import { toast } from "sonner";
import { providerPortalFetch } from "@/lib/http/fetcher";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { BookingActionButton } from "../ui";
import { useTranslation } from "@beautonomi/i18n";

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (client: { id: string; full_name: string; email?: string; phone?: string }) => void;
}

export function NewClientDialog({ open, onOpenChange, onCreated }: NewClientDialogProps) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneValid, setPhoneValid] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setPhoneValid(true);
  };

  const handleCreate = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error(t("web.provider.bookings.newClient.nameRequired"));
      return;
    }
    const phoneTrim = phone.trim();
    if (phoneTrim && !phoneValid) {
      toast.error(t("web.provider.bookings.newClient.invalidPhone"));
      return;
    }
    setSaving(true);
    try {
      const res = await providerPortalFetch("/api/provider/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email: email.trim() || undefined,
          phone: phoneTrim || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        data?: { customer?: { id: string; full_name?: string; email?: string; phone?: string } };
        error?: { message?: string };
        message?: string;
      } | null;
      if (!res.ok) {
        toast.error(formatApiErrorMessage(body, t("web.provider.bookings.newClient.createFailed")));
        return;
      }
      const customer = body?.data?.customer;
      const id = customer?.id;
      if (!id) {
        toast.error(t("web.provider.bookings.newClient.idMissing"));
        return;
      }
      onCreated({
        id,
        full_name: customer.full_name || `${firstName} ${lastName}`.trim(),
        email: customer.email,
        phone: customer.phone,
      });
      toast.success(t("web.provider.bookings.newClient.created"));
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorMessage(err, t("web.provider.bookings.newClient.createFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md" data-testid="new-client-dialog">
        <DialogHeader>
          <DialogTitle>{t("web.provider.bookings.newClient.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="nc-first">{t("web.provider.bookings.newClient.firstName")}</Label>
              <Input
                id="nc-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rounded-xl min-h-[44px]"
                autoComplete="given-name"
              />
            </div>
            <div>
              <Label htmlFor="nc-last">{t("web.provider.bookings.newClient.lastName")}</Label>
              <Input
                id="nc-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rounded-xl min-h-[44px]"
                autoComplete="family-name"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="nc-email">{t("web.provider.bookings.newClient.email")}</Label>
            <Input
              id="nc-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl min-h-[44px]"
              autoComplete="email"
            />
          </div>
          <div>
            <PhoneInput
              label={t("web.provider.bookings.newClient.phone")}
              value={phone}
              onChange={setPhone}
              onValidationChange={(valid) => setPhoneValid(valid)}
              inputId="nc-phone"
              placeholder={t("web.provider.bookings.newClient.phonePlaceholder")}
              className="w-full"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <BookingActionButton
            fullWidth={false}
            disabled={saving}
            onClick={() => void handleCreate()}
            data-testid="new-client-create"
          >
            {saving ? t("web.provider.bookings.newClient.creating") : t("web.provider.bookings.newClient.createClient")}
          </BookingActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
