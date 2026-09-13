"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingSectionCard,
  BookingSectionLabel,
} from "../ui";
import { useTranslation } from "@beautonomi/i18n";

interface ResourceOption {
  id: string;
  name: string;
}

interface ResourceAssignSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  onSuccess?: () => void;
}

export function ResourceAssignSheet({
  open,
  onOpenChange,
  bookingId,
  onSuccess,
}: ResourceAssignSheetProps) {
  const { t } = useTranslation();
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data?: ResourceOption[] }>("/api/provider/resources");
        if (!cancelled) setResources(res?.data ?? []);
      } catch {
        if (!cancelled) setResources([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleAssign = async () => {
    if (!resourceId) return;
    setSaving(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/resources`, {
        resource_id: resourceId,
      });
      toast.success(t("web.provider.bookings.resourceAssign.assigned"));
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(formatApiErrorMessage(error, t("web.provider.bookings.resourceAssign.assignFailed")));
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <BookingActionButton disabled={saving || !resourceId} onClick={handleAssign}>
      {saving ? (
        <>
          <Loader2 className="me-2 h-4 w-4 animate-spin" />
          {t("web.provider.bookings.resourceAssign.assigning")}
        </>
      ) : (
        t("web.provider.bookings.resourceAssign.assignResource")
      )}
    </BookingActionButton>
  );

  return (
    <BookingBottomSheet open={open} onOpenChange={onOpenChange} mode="edit" title={t("web.provider.bookings.resourceAssign.title")} footer={footer}>
      <BookingSectionCard>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <BookingSectionLabel className="mb-2">{t("web.provider.bookings.resourceAssign.resource")}</BookingSectionLabel>
            <Select value={resourceId} onValueChange={setResourceId}>
              <SelectTrigger className="rounded-xl min-h-[44px]">
                <SelectValue placeholder={t("web.provider.bookings.resourceAssign.selectResource")} />
              </SelectTrigger>
              <SelectContent>
                {resources.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </BookingSectionCard>
    </BookingBottomSheet>
  );
}
