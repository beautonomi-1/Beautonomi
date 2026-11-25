import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import type { CompletionBlocker } from "@beautonomi/provider-booking";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { twStyle } from "@/lib/twStyle";
import { useTranslation } from "@beautonomi/i18n";

export type HandoverActionId =
  | "collect_payment"
  | "mark_collected"
  | "manage_delivery"
  | "set_pickup"
  | "set_delivery"
  | "prepare_order"
  | "view_charges"
  | "complete_anyway";

type Props = {
  visible: boolean;
  onClose: () => void;
  blockers: CompletionBlocker[];
  busy?: boolean;
  onAction: (blocker: CompletionBlocker, actionId: HandoverActionId) => void;
  onCompleteAnyway: () => void;
  canCompleteAnyway?: boolean;
};

export function handoverPrimaryAction(blocker: CompletionBlocker): HandoverActionId | null {
  return primaryAction(blocker);
}

function primaryAction(blocker: CompletionBlocker): HandoverActionId | null {
  switch (blocker.code) {
    case "outstanding":
      return "collect_payment";
    case "additional_charges":
      return "view_charges";
    case "products_collection":
      return "mark_collected";
    case "products_delivery":
      return "manage_delivery";
    case "products_unspecified":
      return "set_pickup";
    case "products_unprepared":
      return "prepare_order";
    default:
      return null;
  }
}

export function BookingCompletionHandoverSheet({
  visible,
  onClose,
  blockers,
  busy = false,
  onAction,
  onCompleteAnyway,
  canCompleteAnyway = true,
}: Props) {
  const { t } = useTranslation();
  const bk = (key: string) => t(`provider.mobile.screens.bookingDetail.${key}`);
  const hp = (key: string) => t(`web.provider.bookings.detail.completion.${key}`);

  const labelFor = (id: HandoverActionId): string => {
    switch (id) {
      case "collect_payment":
        return bk("collectPaymentCta");
      case "mark_collected":
        return t("web.provider.bookings.detail.products.markCollected");
      case "manage_delivery":
        return hp("manageDelivery");
      case "set_pickup":
        return t("web.provider.bookings.detail.products.setPickup");
      case "set_delivery":
        return t("web.provider.bookings.detail.products.setDelivery");
      case "prepare_order":
        return hp("prepareOrder");
      case "view_charges":
        return hp("viewCharges");
      case "complete_anyway":
        return bk("completeAnywayCta");
      default:
        return "";
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={bk("beforeCompletingTitle")}>
      <Text style={twStyle("text-sm text-gray-600 mb-3")}>{hp("handoverIntro")}</Text>
      {blockers.map((blocker, idx) => {
        const primary = primaryAction(blocker);
        if (!primary) return null;
        return (
          <View
            key={`${blocker.code}-${blocker.orderId ?? idx}`}
            style={twStyle("mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3")}
          >
            <Text style={twStyle("text-sm text-amber-950 mb-2")}>{blocker.label}</Text>
            <View style={twStyle("flex-row flex-wrap gap-2")}>
              <TouchableOpacity
                disabled={busy}
                onPress={() => onAction(blocker, primary)}
                style={twStyle(`rounded-lg bg-gray-900 px-3 py-2.5${busy ? " opacity-60" : ""}`)}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={twStyle("text-sm font-semibold text-white")}>{labelFor(primary)}</Text>
                )}
              </TouchableOpacity>
              {blocker.code === "products_unspecified" && blocker.orderId ? (
                <TouchableOpacity
                  disabled={busy}
                  onPress={() => onAction(blocker, "set_delivery")}
                  style={twStyle("rounded-lg border border-amber-300 bg-white px-3 py-2.5")}
                >
                  <Text style={twStyle("text-sm font-semibold text-amber-900")}>
                    {t("web.provider.bookings.detail.products.setDelivery")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}
      {canCompleteAnyway ? (
        <TouchableOpacity
          disabled={busy}
          onPress={onCompleteAnyway}
          style={twStyle("mt-1 rounded-xl border border-gray-300 py-3 items-center")}
        >
          <Text style={twStyle("text-sm font-semibold text-gray-800")}>{labelFor("complete_anyway")}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity onPress={onClose} style={twStyle("mt-2 py-2 items-center")}>
        <Text style={twStyle("text-sm text-gray-500")}>{bk("dismissCta")}</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}