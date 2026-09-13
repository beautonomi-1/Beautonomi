"use client";

import { useCallback, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslation } from "@beautonomi/i18n";

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
};

export function ProviderEntityTypeSelector({ initial, onSaved }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: Array<{ kind: PayeeKind; title: string; subtitle: string }> = [
    {
      kind: "individual",
      title: t("web.provider.entityTypeSelector.individualTitle"),
      subtitle: t("web.provider.entityTypeSelector.individualSubtitle"),
    },
    {
      kind: "business",
      title: t("web.provider.entityTypeSelector.businessTitle"),
      subtitle: t("web.provider.entityTypeSelector.businessSubtitle"),
    },
  ];

  const save = useCallback(
    async (next: PayeeEntityData) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetcher.patch<{ data: PayeeEntityData }>(
          "/api/provider/settings/payee-entity",
          next,
        );
        const saved = res.data ?? next;
        setData(saved);
        onSaved?.(saved);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("web.provider.entityTypeSelector.saveFailed"));
      } finally {
        setSaving(false);
      }
    },
    [onSaved, t],
  );

  const selectKind = (kind: PayeeKind) => {
    if (kind === data.payee_kind) return;
    const confirmed = window.confirm(
      kind === "individual"
        ? t("web.provider.entityTypeSelector.confirmIndividual")
        : t("web.provider.entityTypeSelector.confirmBusiness"),
    );
    if (!confirmed) return;
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
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t("web.provider.entityTypeSelector.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("web.provider.entityTypeSelector.subtitle")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((opt) => {
          const selected = data.payee_kind === opt.kind;
          return (
            <button
              key={opt.kind}
              type="button"
              onClick={() => selectKind(opt.kind)}
              disabled={saving}
              className={cn(
                "rounded-xl border-2 p-4 text-start transition-colors",
                selected ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300",
              )}
            >
              <p className="font-semibold text-gray-900">{opt.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{opt.subtitle}</p>
            </button>
          );
        })}
      </div>

      {data.payee_kind === "business" && (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm font-semibold">{t("web.provider.entityTypeSelector.companyDetails")}</p>
          <Input
            value={data.registered_business_name ?? ""}
            onChange={(e) => setData((d) => ({ ...d, registered_business_name: e.target.value }))}
            placeholder={t("web.provider.entityTypeSelector.registeredNamePlaceholder")}
          />
          <Input
            value={data.business_registration_number ?? ""}
            onChange={(e) =>
              setData((d) => ({ ...d, business_registration_number: e.target.value }))
            }
            placeholder={t("web.provider.entityTypeSelector.registrationNumberPlaceholder")}
          />
          <Input
            value={data.business_registration_country ?? ""}
            onChange={(e) =>
              setData((d) => ({ ...d, business_registration_country: e.target.value.toUpperCase() }))
            }
            placeholder={t("web.provider.entityTypeSelector.registrationCountryPlaceholder")}
          />
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["owner", t("web.provider.entityTypeSelector.owner")],
                ["authorized_representative", t("web.provider.entityTypeSelector.authorizedRep")],
              ] as const
            ).map(([role, label]) => (
              <Button
                key={role}
                type="button"
                variant={data.verified_person_role === role ? "default" : "outline"}
                size="sm"
                onClick={() => setData((d) => ({ ...d, verified_person_role: role }))}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            onClick={() => {
              if (!data.registered_business_name?.trim()) {
                setError(t("web.provider.entityTypeSelector.nameRequired"));
                return;
              }
              void save(data);
            }}
            disabled={saving}
          >
            {saving ? t("web.provider.entityTypeSelector.saving") : t("web.provider.entityTypeSelector.saveCompany")}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
