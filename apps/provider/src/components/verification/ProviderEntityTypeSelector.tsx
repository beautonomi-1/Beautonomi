/**
 * Provider entity type selection — plain language, maps to payee_kind.
 */
import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { twStyle } from "@/lib/twStyle";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";

export type PayeeKind = "individual" | "business";

export type PayeeEntityData = {
  payee_kind: PayeeKind;
  registered_business_name: string | null;
  business_registration_number: string | null;
  business_registration_country: string | null;
  verified_person_role: "owner" | "authorized_representative" | null;
};

type Props = {
  initial: PayeeEntityData;
  onSaved?: (data: PayeeEntityData) => void;
  compact?: boolean;
};

const OPTIONS: Array<{
  kind: PayeeKind;
  title: string;
  subtitle: string;
}> = [
  {
    kind: "individual",
    title: "Just me (sole proprietor / freelancer)",
    subtitle: "I work under my own name. Bank account is usually in my personal name.",
  },
  {
    kind: "business",
    title: "Registered company / salon",
    subtitle: "I have a company registration number. Payouts may be in the business name.",
  },
];

export function ProviderEntityTypeSelector({ initial, onSaved, compact }: Props) {
  const [data, setData] = useState<PayeeEntityData>(initial);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (next: PayeeEntityData) => {
      setSaving(true);
      try {
        const res = await api.patch<PayeeEntityData>(
          "/api/provider/settings/payee-entity",
          next,
        );
        if (res.error) throw new Error(getApiErrorMessage(res.error));
        const saved = res.data ?? next;
        setData(saved);
        onSaved?.(saved);
      } catch (err) {
        Alert.alert("Could not save", getApiErrorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [onSaved],
  );

  const selectKind = (kind: PayeeKind) => {
    if (kind === data.payee_kind) return;
    Alert.alert(
      "Change how your business is set up?",
      kind === "individual"
        ? "You will only need to verify your personal identity."
        : "Enter your company details, then save.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            if (kind === "individual") {
              void save({
                ...data,
                payee_kind: "individual",
                registered_business_name: null,
                business_registration_number: null,
                business_registration_country: null,
                verified_person_role: null,
              });
              return;
            }
            setData({
              ...data,
              payee_kind: "business",
              verified_person_role: data.verified_person_role ?? "owner",
            });
          },
        },
      ],
    );
  };

  return (
    <View style={twStyle(compact ? "gap-3" : "gap-4")}>
      <View>
        <Text style={twStyle("text-base font-semibold text-slate-900")}>
          How is your business set up?
        </Text>
        {!compact && (
          <Text style={twStyle("mt-1 text-sm text-slate-600")}>
            This determines what we need to verify before you can go live.
          </Text>
        )}
      </View>

      {OPTIONS.map((opt) => {
        const selected = data.payee_kind === opt.kind;
        return (
          <TouchableOpacity
            key={opt.kind}
            onPress={() => selectKind(opt.kind)}
            disabled={saving}
            style={twStyle(
              selected
                ? "rounded-2xl border-2 p-4 border-[#FF0077] bg-pink-50"
                : "rounded-2xl border-2 p-4 border-slate-200 bg-white",
            )}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text style={twStyle("font-semibold text-slate-900")}>{opt.title}</Text>
            <Text style={twStyle("mt-1 text-sm text-slate-600")}>{opt.subtitle}</Text>
          </TouchableOpacity>
        );
      })}

      {data.payee_kind === "business" && (
        <View style={twStyle("gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-slate-800")}>Company details</Text>
          <TextInput
            value={data.registered_business_name ?? ""}
            onChangeText={(t) => setData((d) => ({ ...d, registered_business_name: t }))}
            placeholder="Registered business name"
            style={twStyle("rounded-xl border border-slate-200 bg-white px-4 py-3 text-base")}
          />
          <TextInput
            value={data.business_registration_number ?? ""}
            onChangeText={(t) => setData((d) => ({ ...d, business_registration_number: t }))}
            placeholder="Registration number (e.g. CIPC)"
            style={twStyle("rounded-xl border border-slate-200 bg-white px-4 py-3 text-base")}
          />
          <TextInput
            value={data.business_registration_country ?? ""}
            onChangeText={(t) => setData((d) => ({ ...d, business_registration_country: t }))}
            placeholder="Country of registration (e.g. ZA)"
            autoCapitalize="characters"
            style={twStyle("rounded-xl border border-slate-200 bg-white px-4 py-3 text-base")}
          />
          <View style={twStyle("flex-row flex-wrap gap-2")}>
            {(
              [
                ["owner", "I am the owner"],
                ["authorized_representative", "Authorized representative"],
              ] as const
            ).map(([role, label]) => {
              const on = data.verified_person_role === role;
              return (
                <TouchableOpacity
                  key={role}
                  onPress={() => setData((d) => ({ ...d, verified_person_role: role }))}
                  style={twStyle(
                    on
                      ? "rounded-full px-3 py-2 bg-[#FF0077]"
                      : "rounded-full px-3 py-2 bg-white border border-slate-200",
                  )}
                >
                  <Text
                    style={twStyle(
                      on ? "text-sm text-white font-semibold" : "text-sm text-slate-700",
                    )}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            onPress={() => {
              if (!data.registered_business_name?.trim()) {
                Alert.alert("Company details", "Registered business name is required.");
                return;
              }
              void save(data);
            }}
            disabled={saving}
            style={twStyle("mt-1 items-center rounded-xl bg-slate-900 py-3")}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={twStyle("font-semibold text-white")}>Save company details</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {saving && data.payee_kind === "individual" && (
        <ActivityIndicator style={twStyle("mt-2")} />
      )}
    </View>
  );
}
