"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";

export type CustomFieldDefinition = {
  id: string;
  name: string;
  label: string;
  field_type: string;
  entity_type: string;
  is_required: boolean;
  placeholder: string | null;
  help_text: string | null;
  default_value: string | null;
  display_order: number;
  validation_rules: Record<string, unknown> | null;
};

export interface CustomFieldsFormProps {
  entityType: "user" | "provider" | "booking" | "service";
  entityId?: string | null;
  /** When entityId is not set (e.g. creating a booking), pass initial values and get updates via onChange */
  initialValues?: Record<string, string | number | boolean | null>;
  onChange?: (values: Record<string, string | number | boolean | null>) => void;
  /** If true, show a "Save" button and save to API when entityId is set */
  showSaveButton?: boolean;
  /** Compact layout (e.g. inline in a card) */
  compact?: boolean;
}

export function CustomFieldsForm({
  entityType,
  entityId,
  initialValues = {},
  onChange,
  showSaveButton = true,
  compact = false,
}: CustomFieldsFormProps) {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, string | number | boolean | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadDefinitions = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: { definitions: CustomFieldDefinition[] } }>(
        `/api/custom-fields/definitions?entity_type=${entityType}`
      );
      const list = (res as { data?: { definitions?: CustomFieldDefinition[] } }).data?.definitions ?? [];
      setDefinitions(list);
      return list;
    } catch (e) {
      console.error("Failed to load custom field definitions:", e);
      setDefinitions([]);
      return [];
    }
  }, [entityType]);

  const loadValuesForDefinitions = useCallback(
    async (defs: CustomFieldDefinition[]) => {
      if (!entityId) return;
      try {
        const res = await fetcher.get<{ data: { values: Record<string, string> } }>(
          `/api/custom-fields/values?entity_type=${entityType}&entity_id=${entityId}`
        );
        const raw = (res as { data?: { values?: Record<string, string> } }).data?.values ?? {};
        const normalized: Record<string, string | number | boolean | null> = {};
        defs.forEach((f) => {
          const v = raw[f.name];
          if (v !== undefined) {
            if (f.field_type === "number") normalized[f.name] = Number(v) || 0;
            else if (f.field_type === "checkbox") normalized[f.name] = v === "true" || v === "1";
            else normalized[f.name] = v;
          } else if (f.default_value !== null && f.default_value !== undefined) {
            normalized[f.name] = f.default_value;
          } else {
            normalized[f.name] = f.field_type === "checkbox" ? false : "";
          }
        });
        setValues(normalized);
      } catch {
        setValues(initialValues);
      } finally {
        setLoading(false);
      }
    },
    [entityType, entityId, initialValues]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadDefinitions().then((list) => {
      if (cancelled) return;
      setDefinitions(list);
      if (entityId) {
        loadValuesForDefinitions(list);
      } else {
        const start: Record<string, string | number | boolean | null> = {};
        list.forEach((f) => {
          if (initialValues[f.name] !== undefined) {
            start[f.name] = initialValues[f.name];
          } else if (f.default_value !== null && f.default_value !== undefined) {
            start[f.name] = f.default_value;
          } else {
            start[f.name] = f.field_type === "checkbox" ? false : "";
          }
        });
        setValues(start);
        onChange?.(start);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, loadDefinitions, loadValuesForDefinitions, initialValues]);

  const updateValue = (name: string, value: string | number | boolean | null) => {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      onChange?.(next);
      return next;
    });
  };

  const handleSave = async () => {
    if (!entityId) return;
    setSaving(true);
    try {
      await fetcher.put("/api/custom-fields/values", {
        entity_type: entityType,
        entity_id: entityId,
        values: values,
      });
      toast.success("Custom fields saved");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading && definitions.length === 0) {
    return null;
  }

  if (definitions.length === 0) {
    return null;
  }

  const optionsFromRules = (rules: Record<string, unknown> | null): string[] => {
    if (!rules) return [];
    const opts = rules.options;
    if (Array.isArray(opts)) return opts.map(String);
    if (typeof opts === "string") return opts.split(",").map((s) => s.trim());
    return [];
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {definitions.map((field) => (
        <div key={field.id} className={compact ? "space-y-1" : "space-y-2"}>
          <Label className={field.is_required ? "required" : ""}>
            {field.label}
            {field.is_required && " *"}
          </Label>
          {field.help_text && (
            <p className="text-xs text-muted-foreground">{field.help_text}</p>
          )}
          {field.field_type === "text" && (
            <Input
              value={String(values[field.name] ?? "")}
              onChange={(e) => updateValue(field.name, e.target.value)}
              placeholder={field.placeholder ?? undefined}
            />
          )}
          {field.field_type === "textarea" && (
            <Textarea
              value={String(values[field.name] ?? "")}
              onChange={(e) => updateValue(field.name, e.target.value)}
              placeholder={field.placeholder ?? undefined}
              rows={3}
            />
          )}
          {field.field_type === "number" && (
            <Input
              type="number"
              value={values[field.name] ?? ""}
              onChange={(e) =>
                updateValue(field.name, e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder={field.placeholder ?? undefined}
            />
          )}
          {field.field_type === "email" && (
            <Input
              type="email"
              value={String(values[field.name] ?? "")}
              onChange={(e) => updateValue(field.name, e.target.value)}
              placeholder={field.placeholder ?? undefined}
            />
          )}
          {field.field_type === "phone" && (
            <Input
              type="tel"
              value={String(values[field.name] ?? "")}
              onChange={(e) => updateValue(field.name, e.target.value)}
              placeholder={field.placeholder ?? undefined}
            />
          )}
          {field.field_type === "date" && (
            <Input
              type="date"
              value={String(values[field.name] ?? "")}
              onChange={(e) => updateValue(field.name, e.target.value)}
            />
          )}
          {field.field_type === "select" && (
            <Select
              value={String(values[field.name] ?? "")}
              onValueChange={(v) => updateValue(field.name, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder ?? "Select..."} />
              </SelectTrigger>
              <SelectContent>
                {optionsFromRules(field.validation_rules).map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {field.field_type === "checkbox" && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={Boolean(values[field.name])}
                onCheckedChange={(checked) =>
                  updateValue(field.name, checked === true)
                }
              />
              <span className="text-sm text-muted-foreground">
                {field.placeholder || field.help_text || "Yes"}
              </span>
            </div>
          )}
          {field.field_type === "radio" && (
            <RadioGroup
              value={String(values[field.name] ?? "")}
              onValueChange={(v) => updateValue(field.name, v)}
              className="flex flex-wrap gap-4"
            >
              {optionsFromRules(field.validation_rules).map((opt) => (
                <div key={opt} className="flex items-center gap-2" id={`${field.name}-${opt}`}>
                  <RadioGroupItem value={opt} id={`${field.name}-${opt}`} />
                  <Label htmlFor={`${field.name}-${opt}`} className="font-normal">
                    {opt}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
        </div>
      ))}
      {showSaveButton && entityId && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-medium text-[#FF0077] hover:underline disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save custom fields"}
        </button>
      )}
    </div>
  );
}
