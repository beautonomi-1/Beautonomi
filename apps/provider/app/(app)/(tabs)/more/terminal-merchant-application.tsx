import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { getRuntimeMarketHost } from "@/config/public-env";
import {
  DOC_TYPE_LABELS,
  LEARN_ARTICLE_SLUGS,
  WIZARD_STEPS,
  requiredDocTypesForEntity,
  type TerminalMerchantApplication,
} from "@/features/terminal-merchant-application/types";
import {
  useTerminalMerchantApplication,
  useSaveTerminalMerchantApplication,
  useUploadTerminalMerchantDocument,
} from "@/features/terminal-merchant-application/useTerminalMerchantApplication";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/useApi";
import { getApiErrorMessage } from "@/lib/api-error";

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad";
  multiline?: boolean;
}) {
  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm text-gray-600")}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        style={twStyle("rounded-lg border border-gray-200 bg-white px-3 py-2 text-base")}
      />
    </View>
  );
}

function PickOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={twStyle(
        `mb-2 rounded-lg border px-3 py-2 ${
          selected ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white"
        }`,
      )}
    >
      <Text style={twStyle(selected ? "font-semibold text-indigo-900" : "text-gray-700")}>{label}</Text>
    </TouchableOpacity>
  );
}

function buildSectionPayload(stepId: string, form: Partial<TerminalMerchantApplication>, accountNumber: string) {
  switch (stepId) {
    case "personal":
      return {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        otp_phone: form.otp_phone,
        id_type: form.id_type,
        id_number: form.id_number,
      };
    case "business":
      return {
        entity_type: form.entity_type,
        legal_name: form.legal_name,
        trading_name: form.trading_name,
        registration_number: form.registration_number,
        vat_number: form.vat_number,
      };
    case "address":
      return {
        physical_line1: form.physical_line1,
        physical_suburb: form.physical_suburb,
        physical_city: form.physical_city,
        physical_province: form.physical_province,
        physical_postal_code: form.physical_postal_code,
        physical_country: form.physical_country,
        postal_same_as_physical: form.postal_same_as_physical,
        postal_line1: form.postal_line1,
        postal_suburb: form.postal_suburb,
        postal_city: form.postal_city,
        postal_province: form.postal_province,
        postal_postal_code: form.postal_postal_code,
        postal_country: form.postal_country,
      };
    case "banking": {
      const payload: Record<string, unknown> = {
        bank_code: form.bank_code,
        bank_name: form.bank_name,
        account_type: form.account_type,
        account_holder: form.account_holder,
      };
      if (accountNumber) payload.account_number = accountNumber;
      return payload;
    }
    case "fulfillment":
      return {
        fulfillment_method: form.fulfillment_method ?? "delivery",
        delivery_line1: form.delivery_line1,
        delivery_suburb: form.delivery_suburb,
        delivery_city: form.delivery_city,
        delivery_province: form.delivery_province,
        delivery_postal_code: form.delivery_postal_code,
        delivery_country: form.delivery_country,
        collection_location_id: form.collection_location_id,
      };
    default:
      return {};
  }
}

function StatusTracker({ app }: { app: TerminalMerchantApplication }) {
  const messages: Record<string, string> = {
    submitted: "We received your application and will review it shortly.",
    in_review: "Our team is reviewing your details.",
    info_required: app.info_required_reason ?? "We need a few updates — please fix the sections below.",
    sent_to_acquirer: "Your details were sent to our terminal partner.",
    awaiting_term_sheet: `Watch ${app.otp_phone ?? "your phone"} for an SMS from our terminal partner to accept your term sheet.`,
    approved: "Approved! Your terminal will be dispatched soon.",
    declined: "Your application could not be approved. Contact support if you have questions.",
  };
  return (
    <View style={twStyle("mb-4 rounded-xl bg-indigo-50 p-4")}>
      <Text style={twStyle("text-sm font-semibold text-indigo-900")}>{app.application_no}</Text>
      <Text style={twStyle("mt-1 text-sm text-indigo-800")}>
        {messages[app.status] ?? "Complete your application to get your card machine."}
      </Text>
    </View>
  );
}

export default function TerminalMerchantApplicationScreen() {
  const router = useRouter();
  const handleBack = useProviderStackBack();
  const { order_id: orderIdParam } = useLocalSearchParams<{ order_id?: string }>();
  const { data, loading, error, refetch } = useTerminalMerchantApplication();
  const saveMutation = useSaveTerminalMerchantApplication();
  const uploadDocument = useUploadTerminalMerchantDocument();
  const { data: collectionLocationsData } = useApi<{ locations: Array<{ id: string; name: string }> }>(
    "/api/provider/terminal-collection-locations",
  );
  const collectionLocations = collectionLocationsData?.locations ?? [];

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<Partial<TerminalMerchantApplication>>({});
  const [accountNumber, setAccountNumber] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const app = data?.application;
  const prefill = data?.prefill ?? {};
  const documents = data?.documents ?? [];
  const identityVerified = prefill.identity_verified === true;
  const editable = app && ["draft", "info_required"].includes(app.status);

  useEffect(() => {
    if (loading || app) return;
    void (async () => {
      const { api } = await import("@/lib/api-client");
      await api.post("/api/provider/terminal-merchant-application");
      await refetch();
    })();
  }, [loading, app, refetch]);

  useEffect(() => {
    if (!app) return;
    setForm((prev) => ({
      ...prev,
      ...app,
      first_name: app.first_name ?? (prefill.first_name as string) ?? "",
      last_name: app.last_name ?? (prefill.last_name as string) ?? "",
      email: app.email ?? (prefill.email as string) ?? "",
      phone: app.phone ?? (prefill.phone as string) ?? "",
      otp_phone: app.otp_phone ?? (prefill.otp_phone as string) ?? "",
      id_type: app.id_type ?? (prefill.id_type as TerminalMerchantApplication["id_type"]) ?? "national_id",
      id_number: app.id_number ?? (prefill.id_number as string) ?? "",
      entity_type: app.entity_type ?? "sole_proprietor",
      legal_name: app.legal_name ?? (prefill.legal_name as string) ?? "",
      trading_name: app.trading_name ?? (prefill.trading_name as string) ?? "",
      physical_line1: app.physical_line1 ?? (prefill.physical_line1 as string) ?? "",
      physical_suburb: app.physical_suburb ?? (prefill.physical_suburb as string) ?? "",
      physical_city: app.physical_city ?? (prefill.physical_city as string) ?? "",
      physical_province: app.physical_province ?? (prefill.physical_province as string) ?? "",
      physical_postal_code: app.physical_postal_code ?? (prefill.physical_postal_code as string) ?? "",
      bank_name: app.bank_name ?? (prefill.bank_name as string) ?? "",
      bank_code: app.bank_code ?? (prefill.bank_code as string) ?? "",
      account_holder: app.account_holder ?? (prefill.account_holder as string) ?? "",
      account_type: app.account_type ?? "cheque_current",
      fulfillment_method: app.fulfillment_method ?? "delivery",
      delivery_line1: app.delivery_line1 ?? app.physical_line1 ?? (prefill.physical_line1 as string) ?? "",
      delivery_city: app.delivery_city ?? app.physical_city ?? (prefill.physical_city as string) ?? "",
    }));
  }, [app?.id]);

  useEffect(() => {
    if (!app || app.status !== "info_required") return;
    const sections = app.info_required_sections ?? [];
    if (sections.length === 0) return;
    const idx = WIZARD_STEPS.findIndex((s) => sections.includes(s.id));
    if (idx >= 0) setStepIndex(idx);
  }, [app?.id, app?.status, app?.info_required_sections]);

  const acquisitionBanner = useMemo(() => {
    const order = data?.linked_orders?.[0];
    if (orderIdParam || order?.commercial_model === "once_off_purchase") {
      return "For your purchased terminal — one more step before we can ship it.";
    }
    if (order?.commercial_model === "subscription_bundle") {
      return "Included with your plan — complete this to receive your machine.";
    }
    return "Complete this application to receive your card machine.";
  }, [data?.linked_orders, orderIdParam]);

  const openHelp = useCallback((slug: string) => {
    const host = getRuntimeMarketHost();
    pushInAppBrowser(router, `${host}/learn/article/${slug}`, "Help");
  }, [router]);

  const patch = useCallback(
    async (section: string, payload: Record<string, unknown>) => {
      const result = await saveMutation.mutateAsync({ section, ...payload });
      if (result.error) {
        Alert.alert("Save failed", result.error);
        return;
      }
      await refetch();
    },
    [saveMutation, refetch],
  );

  const pickAndUpload = useCallback(
    async (docType: string, fromCamera: boolean) => {
      try {
        setUploadingDoc(docType);
        let base64 = "";
        let fileName = "upload.jpg";
        let mimeType = "image/jpeg";

        if (fromCamera) {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert("Camera permission required");
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
          if (result.canceled || !result.assets[0]?.base64) return;
          base64 = result.assets[0].base64;
          fileName = result.assets[0].fileName ?? fileName;
          mimeType = result.assets[0].mimeType ?? mimeType;
        } else {
          const pick = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
          if (pick.canceled || !pick.assets[0]?.base64) return;
          base64 = pick.assets[0].base64;
          fileName = pick.assets[0].fileName ?? fileName;
          mimeType = pick.assets[0].mimeType ?? mimeType;
        }

        const uploadResult = await uploadDocument({
          doc_type: docType as any,
          content_base64: base64,
          file_name: fileName,
          mime_type: mimeType,
        });
        if (uploadResult.error) {
          Alert.alert("Upload failed", getApiErrorMessage(uploadResult.error, "Try again"));
          return;
        }
        await refetch();
      } catch (e) {
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
      } finally {
        setUploadingDoc(null);
      }
    },
    [uploadDocument, refetch],
  );

  const handleSubmit = useCallback(async () => {
    const result = await api.post<{ application: TerminalMerchantApplication }>(
      "/api/provider/terminal-merchant-application/submit",
    );
    if (result.error) {
      const details = result.error.details as { issues?: Array<{ section: string; message: string }> } | undefined;
      const issues = details?.issues ?? [];
      if (issues.length > 0) {
        const idx = WIZARD_STEPS.findIndex((s) => s.id === issues[0]?.section);
        if (idx >= 0) setStepIndex(idx);
        Alert.alert(
          "Application incomplete",
          issues.map((i) => i.message).join("\n"),
        );
        return;
      }
      Alert.alert("Could not submit", result.error.message ?? "Please complete all required fields.");
      return;
    }
    await refetch();
    Alert.alert("Submitted", "We will review your application and keep you updated.");
  }, [refetch]);

  if (loading && !data) return <LoadingState message="Loading application…" />;
  if (error) return <ErrorState message="Could not load application" onRetry={refetch} />;
  if (!app) return <ErrorState message="Application unavailable" onRetry={refetch} />;

  if (!editable) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Card machine application" onBack={handleBack} />
        <ScrollView contentContainerStyle={twStyle("p-4")}>
          <StatusTracker app={app} />
          <TouchableOpacity onPress={() => openHelp(LEARN_ARTICLE_SLUGS.next)}>
            <Text style={twStyle("text-indigo-600 underline")}>What happens next?</Text>
          </TouchableOpacity>
          <ActionButton label="Back to card machines" onPress={() => router.push("/(app)/(tabs)/more/card-machines")} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  const step = WIZARD_STEPS[stepIndex];
  const requiredDocs = requiredDocTypesForEntity(form.entity_type as any);

  return (
    <ScreenContainer>
      <ScreenHeader title="Card machine application" onBack={handleBack} />
      <ScrollView contentContainerStyle={twStyle("p-4 pb-24")}>
        <Text style={twStyle("mb-2 text-sm text-gray-600")}>{acquisitionBanner}</Text>
        <Text style={twStyle("mb-4 text-xs text-gray-500")}>
          Step {stepIndex + 1} of {WIZARD_STEPS.length}: {step.title}
        </Text>

        {step.id === "personal" && (
          <>
            <Field label="First name" value={String(form.first_name ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, first_name: v }))} />
            <Field label="Last name" value={String(form.last_name ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, last_name: v }))} />
            <Field label="Email" value={String(form.email ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} keyboardType="email-address" />
            <Field label="Phone" value={String(form.phone ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
            <Field label="Term sheet SMS phone" value={String(form.otp_phone ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, otp_phone: v }))} keyboardType="phone-pad" />
            <Field label="ID number" value={String(form.id_number ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, id_number: v }))} />
            <Text style={twStyle("mb-1 text-sm text-gray-600")}>ID type</Text>
            {(["national_id", "passport", "foreign_id"] as const).map((t) => (
              <PickOption
                key={t}
                label={t.replace(/_/g, " ")}
                selected={form.id_type === t}
                onPress={() => setForm((f) => ({ ...f, id_type: t }))}
              />
            ))}
            <TouchableOpacity onPress={() => openHelp(LEARN_ARTICLE_SLUGS.application)}>
              <Text style={twStyle("text-sm text-indigo-600 underline")}>Need help?</Text>
            </TouchableOpacity>
          </>
        )}

        {step.id === "business" && (
          <>
            <Text style={twStyle("mb-1 text-sm text-gray-600")}>Business type</Text>
            {(
              [
                ["sole_proprietor", "Sole proprietor"],
                ["private_company", "Private company"],
                ["close_corporation", "Close corporation"],
                ["partnership", "Partnership"],
                ["trust", "Trust"],
                ["npo", "NPO"],
              ] as const
            ).map(([value, label]) => (
              <PickOption
                key={value}
                label={label}
                selected={form.entity_type === value}
                onPress={() => setForm((f) => ({ ...f, entity_type: value }))}
              />
            ))}
            <Field label="Legal name" value={String(form.legal_name ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, legal_name: v }))} />
            <Field label="Trading name" value={String(form.trading_name ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, trading_name: v }))} />
            <Field label="Registration number" value={String(form.registration_number ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, registration_number: v }))} />
            <Field label="VAT number" value={String(form.vat_number ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, vat_number: v }))} />
          </>
        )}

        {step.id === "address" && (
          <>
            <Field label="Physical address" value={String(form.physical_line1 ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, physical_line1: v }))} />
            <Field label="Suburb" value={String(form.physical_suburb ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, physical_suburb: v }))} />
            <Field label="City" value={String(form.physical_city ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, physical_city: v }))} />
            <Field label="Province" value={String(form.physical_province ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, physical_province: v }))} />
            <Field label="Postal code" value={String(form.physical_postal_code ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, physical_postal_code: v }))} />
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm text-gray-700")}>Postal same as physical</Text>
              <Switch
                value={form.postal_same_as_physical !== false}
                onValueChange={(v) => setForm((f) => ({ ...f, postal_same_as_physical: v }))}
              />
            </View>
          </>
        )}

        {step.id === "banking" && (
          <>
            <Field label="Bank name" value={String(form.bank_name ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, bank_name: v }))} />
            <Text style={twStyle("mb-1 text-sm text-gray-600")}>Account type</Text>
            {(
              [
                ["cheque_current", "Cheque / current"],
                ["savings", "Savings"],
                ["transmission", "Transmission"],
              ] as const
            ).map(([value, label]) => (
              <PickOption
                key={value}
                label={label}
                selected={form.account_type === value}
                onPress={() => setForm((f) => ({ ...f, account_type: value }))}
              />
            ))}
            <Field label="Account holder" value={String(form.account_holder ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, account_holder: v }))} />
            <Field label="Account number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="phone-pad" />
            {form.account_number_last4 ? (
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>Saved ending ••••{form.account_number_last4}</Text>
            ) : null}
          </>
        )}

        {step.id === "documents" && (
          <>
            <Text style={twStyle("mb-2 text-sm text-gray-700")}>
              South African law requires us to confirm who you are before we can give you a card machine. Most people finish this in under 5 minutes.
            </Text>
            {requiredDocs.map((docType) => {
              const doc = documents.find((d) => d.doc_type === docType);
              const meta = DOC_TYPE_LABELS[docType];
              if (docType === "id_document" && identityVerified && !doc) {
                return (
                  <View key={docType} style={twStyle("mb-3 rounded-lg border border-green-200 bg-green-50 p-3")}>
                    <Text style={twStyle("font-medium text-green-800")}>{meta.title} — Already verified ✓</Text>
                  </View>
                );
              }
              return (
                <View key={docType} style={twStyle("mb-3 rounded-lg border border-gray-200 p-3")}>
                  <Text style={twStyle("font-medium")}>{meta.title}</Text>
                  <Text style={twStyle("text-sm text-gray-600")}>{meta.hint}</Text>
                  <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                    {doc ? doc.status : "Not added"}
                    {doc?.rejection_reason ? ` — ${doc.rejection_reason}` : ""}
                  </Text>
                  <View style={twStyle("mt-2 flex-row gap-2")}>
                    <TouchableOpacity
                      style={twStyle("rounded bg-gray-100 px-3 py-2")}
                      onPress={() => pickAndUpload(docType, true)}
                      disabled={uploadingDoc === docType}
                    >
                      <Text>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={twStyle("rounded bg-gray-100 px-3 py-2")}
                      onPress={() => pickAndUpload(docType, false)}
                      disabled={uploadingDoc === docType}
                    >
                      <Text>File</Text>
                    </TouchableOpacity>
                  </View>
                  {uploadingDoc === docType ? <ActivityIndicator style={twStyle("mt-2")} /> : null}
                </View>
              );
            })}
            <TouchableOpacity
              style={twStyle("mt-2 rounded-lg border border-dashed border-gray-300 p-3")}
              onPress={() => router.push("/(app)/(tabs)/more/support-tickets/new")}
            >
              <Text style={twStyle("text-sm text-gray-700")}>Stuck? Message our team and we will attach documents for you.</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openHelp(LEARN_ARTICLE_SLUGS.documents)}>
              <Text style={twStyle("mt-2 text-sm text-indigo-600 underline")}>What documents do I need?</Text>
            </TouchableOpacity>
          </>
        )}

        {step.id === "fulfillment" && (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>How should we get your machine to you?</Text>
            <PickOption
              label="Deliver to my address"
              selected={form.fulfillment_method !== "collection"}
              onPress={() => setForm((f) => ({ ...f, fulfillment_method: "delivery" }))}
            />
            <PickOption
              label="Collect from a pickup point"
              selected={form.fulfillment_method === "collection"}
              onPress={() => setForm((f) => ({ ...f, fulfillment_method: "collection" }))}
            />
            {form.fulfillment_method === "collection" ? (
              <>
                {(collectionLocations ?? []).length === 0 ? (
                  <Text style={twStyle("mb-2 text-sm text-amber-700")}>
                    No pickup locations are configured yet — choose delivery or contact support.
                  </Text>
                ) : (
                  (collectionLocations ?? []).map((loc) => (
                    <PickOption
                      key={loc.id}
                      label={loc.name}
                      selected={form.collection_location_id === loc.id}
                      onPress={() =>
                        setForm((f) => ({
                          ...f,
                          collection_location_id: loc.id,
                          fulfillment_method: "collection",
                        }))
                      }
                    />
                  ))
                )}
              </>
            ) : (
              <>
                <Field
                  label="Delivery address line 1"
                  value={String(form.delivery_line1 ?? form.physical_line1 ?? "")}
                  onChangeText={(v) => setForm((f) => ({ ...f, delivery_line1: v, fulfillment_method: "delivery" }))}
                />
                <Field
                  label="Delivery city"
                  value={String(form.delivery_city ?? form.physical_city ?? "")}
                  onChangeText={(v) => setForm((f) => ({ ...f, delivery_city: v, fulfillment_method: "delivery" }))}
                />
                <Text style={twStyle("text-sm text-gray-600")}>
                  We will deliver to this address once your application is approved.
                </Text>
              </>
            )}
          </>
        )}

        {step.id === "review" && (
          <>
            <Text style={twStyle("mb-2 text-sm text-gray-700")}>
              After review, a term sheet will be sent to {form.otp_phone ?? "your phone"} by our terminal partner. Accept it there via SMS.
            </Text>
            <TouchableOpacity onPress={() => openHelp(LEARN_ARTICLE_SLUGS.termSheet)}>
              <Text style={twStyle("text-sm text-indigo-600 underline")}>What is the term sheet?</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={twStyle("mt-6 flex-row gap-2")}>
          {stepIndex > 0 ? (
            <ActionButton label="Back" variant="secondary" onPress={() => setStepIndex((i) => i - 1)} />
          ) : null}
          {stepIndex < WIZARD_STEPS.length - 1 ? (
            <ActionButton
              label="Save & continue"
              onPress={async () => {
                const payload = buildSectionPayload(step.id, form, accountNumber);
                await patch(step.id, payload);
                setStepIndex((i) => i + 1);
              }}
            />
          ) : (
            <ActionButton label="Submit application" onPress={handleSubmit} />
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
