"use client";

import React, { useEffect, useMemo, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import {
  selectDefaultMachine,
  beautonomiCardMachineLabel,
  yocoCardMachineLabel,
  type CardMachine,
} from "@beautonomi/utils";
import { YocoPaymentDialog } from "./YocoPaymentDialog";
import type { YocoPayment } from "@/lib/provider-portal/types";
import { PayCloudPaymentDialog } from "./PayCloudPaymentDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";

export type CardMachineCollectEntity = {
  entityType: "booking" | "group_booking" | "sale" | "product_order" | "additional_charge";
  entityId: string;
  bookingId?: string;
  bookingLocationId?: string | null;
  groupBookingId?: string;
  saleId?: string;
  /** When Yoco booking collect uses a pending POS sale row */
  yocoSaleId?: string;
  productOrderId?: string;
  additionalChargeId?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  entity: CardMachineCollectEntity;
  tipIncludedInAmount?: boolean;
  /** Deep-link from ?collectYoco=1 / ?collectPaycloud=1 */
  initialProvider?: "yoco" | "paycloud";
  /** Skip chooser and open the default/selected machine dialog once machines load */
  autoStart?: boolean;
  onSuccess?: (info?: { provider: "yoco" | "paycloud"; yocoPayment?: YocoPayment }) => void;
};

function machineLabel(m: CardMachine): string {
  return m.provider === "paycloud" ? beautonomiCardMachineLabel() : yocoCardMachineLabel();
}

/**
 * Single entry point for integrated card-machine collection (Yoco + PayCloud).
 */
export function CardMachineCollectDialog({
  open,
  onOpenChange,
  amount,
  entity,
  tipIncludedInAmount,
  initialProvider,
  autoStart = false,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const ns = "web.provider.portal.cardMachineCollect";
  const [machines, setMachines] = useState<CardMachine[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<CardMachine | null>(null);
  const [yocoOpen, setYocoOpen] = useState(false);
  const [paycloudOpen, setPaycloudOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetcher
      .get<{
        data?: {
          machines?: CardMachine[];
          defaults?: Array<{
            location_id?: string | null;
            staff_user_id?: string | null;
            machine_provider?: string;
            machine_id?: string;
          }>;
        };
      }>("/api/provider/card-machines")
      .then((res) => {
        if (cancelled) return;
        const list = (res.data?.machines ?? []).filter(
          (m) => m.isActive && m.kind !== "virtual_checkout",
        );
        setMachines(list);
        const defaults = res.data?.defaults ?? [];
        const locId = entity.bookingLocationId ?? null;
        const locDefault = defaults.find(
          (d) => d.location_id && locId && d.location_id === locId,
        );
        const globalDefault = defaults.find((d) => !d.location_id && !d.staff_user_id);
        const saved = locDefault ?? globalDefault;
        let savedMachine: CardMachine | null = null;
        if (saved?.machine_id && saved.machine_provider) {
          savedMachine =
            list.find(
              (m) => m.id === saved.machine_id && m.provider === saved.machine_provider,
            ) ?? null;
        }
        if (initialProvider) {
          const fromProvider =
            list.find((m) => m.provider === initialProvider) ?? savedMachine;
          setSelected(fromProvider ?? list[0] ?? null);
          return;
        }
        const { machine } = selectDefaultMachine({
          machines: list,
          bookingLocationId: entity.bookingLocationId,
          defaultMachineId: savedMachine?.id ?? null,
        });
        setSelected(savedMachine ?? machine);
      })
      .catch(() => {
        if (!cancelled) setMachines([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, entity.bookingLocationId, initialProvider]);

  const activeMachines = useMemo(
    () => machines.filter((m) => m.isActive && m.kind !== "virtual_checkout"),
    [machines],
  );

  useEffect(() => {
    if (!open) {
      setYocoOpen(false);
      setPaycloudOpen(false);
      setPickerOpen(false);
      return;
    }
    if (!selected || !initialProvider) return;
    if (selected.provider !== initialProvider) return;
    if (initialProvider === "yoco") setYocoOpen(true);
    else setPaycloudOpen(true);
  }, [open, selected, initialProvider]);

  useEffect(() => {
    if (!open || !autoStart || loading || !selected) return;
    if (yocoOpen || paycloudOpen) return;
    if (selected.provider === "yoco") setYocoOpen(true);
    else setPaycloudOpen(true);
  }, [open, autoStart, loading, selected, yocoOpen, paycloudOpen]);

  const startCollect = () => {
    if (!selected) {
      setPickerOpen(true);
      return;
    }
    if (selected.provider === "yoco") setYocoOpen(true);
    else setPaycloudOpen(true);
  };

  const handleDone = (provider: "yoco" | "paycloud", yocoPayment?: YocoPayment) => {
    onSuccess?.({ provider, yocoPayment });
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <>
      <Dialog open={open && !yocoOpen && !paycloudOpen} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(`${ns}.title`)}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {selected
              ? t(`${ns}.collectOnNamed`, {
                  name: selected.name,
                  provider: machineLabel(selected),
                })
              : loading
                ? t(`${ns}.loadingMachines`)
                : t(`${ns}.chooseMachine`)}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" disabled={loading || activeMachines.length === 0} onClick={startCollect}>
              {selected ? t(`${ns}.chargeNamed`, { name: selected.name }) : t(`${ns}.selectMachine`)}
            </Button>
            {activeMachines.length > 1 ? (
              <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
                {t(`${ns}.switchMachine`)}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(`${ns}.switchMachine`)}</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2">
            {activeMachines.map((m) => (
              <li key={`${m.provider}:${m.id}`}>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    setSelected(m);
                    setPickerOpen(false);
                  }}
                >
                  {m.name} · {machineLabel(m)}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {selected?.provider === "yoco" ? (
        <YocoPaymentDialog
          open={yocoOpen}
          onOpenChange={setYocoOpen}
          amount={amount}
          bookingId={entity.bookingId ?? (entity.entityType === "booking" ? entity.entityId : undefined)}
          bookingLocationId={entity.bookingLocationId}
          groupBookingId={entity.groupBookingId}
          saleId={entity.saleId ?? entity.yocoSaleId}
          productOrderId={entity.productOrderId}
          additionalChargeId={entity.additionalChargeId}
          onSuccess={(payment) => handleDone("yoco", payment)}
        />
      ) : null}

      {selected?.provider === "paycloud" ? (
        <PayCloudPaymentDialog
          open={paycloudOpen}
          onOpenChange={setPaycloudOpen}
          amount={amount}
          entityType={entity.entityType}
          entityId={entity.entityId}
          bookingId={entity.bookingId}
          bookingLocationId={entity.bookingLocationId}
          tipIncludedInAmount={tipIncludedInAmount}
          onSuccess={() => handleDone("paycloud")}
        />
      ) : null}
    </>
  );
}
