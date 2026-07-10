"use client";

import { useCallback, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PayeeKind = "individual" | "business";

export type PayeeEntityData = {
  payee_kind: PayeeKind;
  registered_business_name: string | null;
  business_registration_number: string | null;
  business_registration_country: string | null;
  verified_person_role: "owner" | "authorized_representative" | null;
};

const OPTIONS: Array<{ kind: PayeeKind; title: string; subtitle: string }> = [
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

type Props = {
  initial: PayeeEntityData;
  onSaved?: (data: PayeeEntityData) => void;
};

export function ProviderEntityTypeSelector({ initial, onSaved }: Props) {
  const [data, setData] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [onSaved],
  );

  const selectKind = (kind: PayeeKind) => {
    if (kind === data.payee_kind) return;
    const confirmed = window.confirm(
      kind === "individual"
        ? "Switch to sole proprietor? You will only verify your personal identity."
        : "Switch to registered company? Enter your company details, then save.",
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
    // Business: update local state only — persist after company name is filled.
    setData({
      ...data,
      payee_kind: "business",
      verified_person_role: data.verified_person_role ?? "owner",
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">How is your business set up?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This determines what we need to verify before you can go live.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const selected = data.payee_kind === opt.kind;
          return (
            <button
              key={opt.kind}
              type="button"
              onClick={() => selectKind(opt.kind)}
              disabled={saving}
              className={cn(
                "rounded-xl border-2 p-4 text-left transition-colors",
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
          <p className="text-sm font-semibold">Company details</p>
          <Input
            value={data.registered_business_name ?? ""}
            onChange={(e) => setData((d) => ({ ...d, registered_business_name: e.target.value }))}
            placeholder="Registered business name"
          />
          <Input
            value={data.business_registration_number ?? ""}
            onChange={(e) =>
              setData((d) => ({ ...d, business_registration_number: e.target.value }))
            }
            placeholder="Registration number (e.g. CIPC)"
          />
          <Input
            value={data.business_registration_country ?? ""}
            onChange={(e) =>
              setData((d) => ({ ...d, business_registration_country: e.target.value.toUpperCase() }))
            }
            placeholder="Country of registration (e.g. ZA)"
          />
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["owner", "I am the owner"],
                ["authorized_representative", "Authorized representative"],
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
                setError("Registered business name is required.");
                return;
              }
              void save(data);
            }}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save company details"}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
