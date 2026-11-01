import { View, Text, Switch } from "react-native";
import Slider from "@react-native-community/slider";
import { twStyle } from "@/lib/twStyle";
import { useTranslation } from "@beautonomi/i18n";

type Props = {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  percent: number;
  onPercentChange: (v: number) => void;
  splitRatesEqual: boolean;
  serviceRate: number | null;
  productRate: number | null;
  onOpenCommissions?: () => void;
};

export function StaffCommissionEditor({
  enabled,
  onEnabledChange,
  percent,
  onPercentChange,
  splitRatesEqual,
  serviceRate,
  productRate,
  onOpenCommissions,
}: Props) {
  const { t } = useTranslation();
  const ce = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.components.staffCommissionEditor.${key}`, opts) as string;

  return (
    <View style={twStyle("mb-3")}>
      <View style={twStyle("mb-2 flex-row items-center justify-between")}>
        <Text style={twStyle("text-sm font-medium text-gray-700")}>{ce("paysCommission")}</Text>
        <Switch value={enabled} onValueChange={onEnabledChange} />
      </View>
      {splitRatesEqual ? (
        <>
          <Text style={twStyle("mb-1 text-sm text-gray-600")}>
            {ce("percentValue", { rate: enabled ? Math.round(percent) : 0 })}
          </Text>
          <Slider
            value={percent}
            onValueChange={(v) => onPercentChange(Math.round(v))}
            minimumValue={0}
            maximumValue={100}
            step={1}
            disabled={!enabled}
            minimumTrackTintColor="#111827"
            maximumTrackTintColor="#e5e7eb"
          />
        </>
      ) : (
        <Text style={twStyle("text-sm text-gray-600")}>
          {ce("splitRates", {
            service: serviceRate ?? "—",
            product: productRate ?? "—",
          })}
        </Text>
      )}
      {onOpenCommissions ? (
        <Text style={twStyle("mt-2 text-xs text-indigo-600")} onPress={onOpenCommissions}>
          {ce("openTeamCommissions")}
        </Text>
      ) : null}
    </View>
  );
}
