/**
 * Mobile: unified card-machine collect (Yoco + PayCloud) with saved defaults.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { YocoPaymentSheet } from "@/components/YocoPaymentSheet";
import { PayCloudPaymentSheet } from "@/components/payments/PayCloudPaymentSheet";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";
import { selectDefaultMachine, type CardMachine } from "@beautonomi/utils";
import type { PayCloudEntityType } from "@/hooks/usePayCloud";

export type CardMachineCollectSheetProps = {
  visible: boolean;
  onClose: () => void;
  amount: number;
  currency: string;
  provider?: "yoco" | "paycloud";
  initialProvider?: "yoco" | "paycloud";
  bookingId?: string;
  bookingLocationId?: string | null;
  saleId?: string;
  productOrderId?: string;
  groupBookingId?: string;
  additionalChargeId?: string;
  entityType?: PayCloudEntityType;
  entityId?: string;
  tipIncludedInAmount?: boolean;
  description?: string;
  onSuccess?: () => void;
  onYocoSuccess?: (result: { reference: string }) => void;
};

export function CardMachineCollectSheet({
  visible,
  onClose,
  amount,
  currency,
  provider,
  initialProvider,
  bookingId,
  bookingLocationId = null,
  saleId,
  productOrderId,
  groupBookingId,
  additionalChargeId,
  entityType,
  entityId,
  tipIncludedInAmount,
  description,
  onSuccess,
  onYocoSuccess,
}: CardMachineCollectSheetProps) {
  const { t } = useTranslation();
  const cm = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.cardMachineCollect.${key}`, opts) as string;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [machines, setMachines] = useState<CardMachine[]>([]);
  const [selected, setSelected] = useState<CardMachine | null>(null);
  const [active, setActive] = useState<"yoco" | "paycloud" | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setActive(null);
      setSelected(null);
      completedRef.current = false;
      return;
    }
    if (provider || initialProvider) {
      setActive(provider ?? initialProvider ?? null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    void api
      .get<{
        machines?: CardMachine[];
        defaults?: Array<{
          location_id?: string | null;
          staff_user_id?: string | null;
          machine_provider?: string;
          machine_id?: string;
        }>;
      }>("/api/provider/card-machines")
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setLoadFailed(true);
          setMachines([]);
          return;
        }
        const payload = (res.data ?? {}) as {
          machines?: CardMachine[];
          defaults?: Array<{
            location_id?: string | null;
            staff_user_id?: string | null;
            machine_provider?: string;
            machine_id?: string;
          }>;
        };
        const list = (payload.machines ?? []).filter(
          (m) => m.isActive && m.kind !== "virtual_checkout",
        );
        setMachines(list);
        const defaults = payload.defaults ?? [];
        const locDefault = defaults.find(
          (d) => d.location_id && bookingLocationId && d.location_id === bookingLocationId,
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
        const { machine } = selectDefaultMachine({
          machines: list,
          bookingLocationId,
          defaultMachineId: savedMachine?.id ?? null,
        });
        const pick = savedMachine ?? machine;
        setSelected(pick);
        if (pick) setActive(pick.provider);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          setMachines([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, provider, initialProvider, bookingLocationId, reloadKey]);

  const finish = useCallback(() => {
    completedRef.current = true;
    onSuccess?.();
    onClose();
  }, [onSuccess, onClose]);

  /** Back to the machine list when there is something else to pick; otherwise cancel the collect. */
  const closeMachine = useCallback(() => {
    if (completedRef.current) return;
    const lockedProvider = Boolean(provider || initialProvider);
    if (!lockedProvider && machines.length > 1) {
      setActive(null);
      return;
    }
    setActive(null);
    onClose();
  }, [provider, initialProvider, machines.length, onClose]);

  const resolvedEntityType: PayCloudEntityType =
    entityType ??
    (productOrderId
      ? "product_order"
      : additionalChargeId
        ? "additional_charge"
        : groupBookingId
          ? "group_booking"
          : saleId
            ? "sale"
            : "booking");
  const resolvedEntityId =
    entityId ?? productOrderId ?? additionalChargeId ?? groupBookingId ?? saleId ?? bookingId ?? "";

  if (!visible) return null;

  const current = active ?? provider ?? initialProvider ?? null;

  if (current === "yoco") {
    return (
      <YocoPaymentSheet
        visible
        onClose={closeMachine}
        amountCents={Math.round(amount * 100)}
        currency={currency}
        bookingId={bookingId}
        saleId={saleId}
        groupBookingId={groupBookingId}
        productOrderId={productOrderId}
        additionalChargeId={additionalChargeId}
        preferredDeviceId={selected?.provider === "yoco" ? selected.id : null}
        bookingLocationId={bookingLocationId ?? undefined}
        description={description}
        onPaymentSuccess={(result) => {
          if (result.status !== "successful") return;
          onYocoSuccess?.(result);
          finish();
        }}
      />
    );
  }

  if (current === "paycloud") {
    return (
      <PayCloudPaymentSheet
        visible
        onClose={closeMachine}
        amount={amount}
        currency={currency}
        entityType={resolvedEntityType}
        entityId={resolvedEntityId}
        bookingId={bookingId}
        bookingLocationId={bookingLocationId}
        tipIncludedInAmount={tipIncludedInAmount}
        onPaymentSuccess={finish}
      />
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={cm("title")}>
      {loading ? (
        <ActivityIndicator style={twStyle("my-6")} />
      ) : loadFailed ? (
        <View style={twStyle("pb-4")}>
          <Text style={twStyle("text-sm text-gray-600 mb-3")}>{cm("loadFailed")}</Text>
          <Pressable
            style={twStyle("py-3 rounded-xl bg-gray-100 items-center")}
            onPress={() => setReloadKey((k) => k + 1)}
          >
            <Text style={twStyle("font-medium text-gray-900")}>{cm("retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={twStyle("pb-4")}>
          {machines.length > 0 ? (
            <Text style={twStyle("text-sm text-gray-600 mb-3")}>
              {selected ? cm("collectOn", { name: selected.name }) : cm("chooseMachine")}
            </Text>
          ) : null}
          {machines.map((m) => {
            const isDefault = selected?.provider === m.provider && selected.id === m.id;
            return (
              <Pressable
                key={`${m.provider}:${m.id}`}
                style={twStyle("py-3 border-b border-gray-200 flex-row items-center justify-between")}
                onPress={() => {
                  setSelected(m);
                  setActive(m.provider);
                }}
              >
                <Text style={twStyle("font-medium text-gray-900")}>
                  {m.name} · {m.provider === "paycloud" ? cm("beautonomi") : cm("yoco")}
                </Text>
                {isDefault ? (
                  <Text style={twStyle("text-xs font-semibold text-emerald-700")}>{cm("defaultBadge")}</Text>
                ) : null}
              </Pressable>
            );
          })}
          {machines.length === 0 ? (
            <View>
              <Text style={twStyle("text-sm text-gray-500 mb-3")}>{cm("noMachines")}</Text>
              <Pressable
                style={twStyle("py-3 rounded-xl bg-gray-900 items-center")}
                onPress={() => {
                  onClose();
                  router.push("/(app)/(tabs)/more/card-machines" as never);
                }}
              >
                <Text style={twStyle("font-medium text-white")}>{cm("setUp")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}
