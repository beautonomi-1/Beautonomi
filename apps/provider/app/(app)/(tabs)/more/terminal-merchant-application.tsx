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
import { useTranslation } from "@beautonomi/i18n";
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
  LEARN_ARTICLE_SLUGS,
  WIZARD_STEPS,
  requiredDocTypesForEntity,
  type TerminalMerchantApplication,
  type TerminalMerchantDocType,
} from "@/features/terminal-merchant-application/types";
import {
  useTerminalMerchantApplication,
  useSaveTerminalMerchantApplication,
  useUploadTerminalMerchantDocument,
} from "@/features/terminal-merchant-application/useTerminalMerchantApplication";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/useApi";
import { getApiErrorMessage } from "@/lib/api-error";

const STEP_KEYS: Record<string, string> = {
  personal: "stepPersonal",
  business: "stepBusiness",
  address: "stepAddress",
  banking: "stepBanking",
  documents: "stepDocuments",
  fulfillment: "stepFulfillment",
  review: "stepReview",
};

const DOC_KEYS: Record<TerminalMerchantDocType, { title: string; hint: string }> = {
  id_document: { title: "docIdTitle", hint: "docIdHint" },
  proof_of_address: { title: "docAddressTitle", hint: "docAddressHint" },
  bank_confirmation_letter: { title: "docBankTitle", hint: "docBankHint" },
  company_registration: { title: "docCompanyTitle", hint: "docCompanyHint" },
  trust_deed: { title: "docTrustTitle", hint: "docTrustHint" },
  resolution_letter: { title: "docResolutionTitle", hint: "docResolutionHint" },
  other: { title: "docOtherTitle", hint: "docOtherHint" },
};

const ID_TYPE_KEYS = {
  national_id: "idNational",
  passport: "idPassport",
  foreign_id: "idForeign",
} as const;

const ENTITY_KEYS = {
  sole_proprietor: "entitySole",
  private_company: "entityPrivate",
  close_corporation: "entityCc",
  partnership: "entityPartnership",
  trust: "entityTrust",
  npo: "entityNpo",
} as const;

const ACCOUNT_TYPE_KEYS = {
  cheque_current: "accountCheque",
  savings: "accountSavings",
  transmission: "accountTransmission",
} as const;

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
  const { t } = useTranslation();
  const tm = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.terminalMerchantApplication.${key}`, opts) as string;
  const messages: Record<string, string> = {
    submitted: tm("statusSubmitted"),
    in_review: tm("statusInReview"),
    info_required: app.info_required_reason ?? tm("statusInfoRequired"),
    sent_to_acquirer: tm("statusSentToAcquirer"),
    awaiting_term_sheet: tm("statusAwaitingTermSheet", { phone: app.otp_phone ?? tm("yourPhone") }),
    approved: tm("statusApproved"),
    declined: tm("statusDeclined"),
  };
  return (
    <View style={twStyle("mb-4 rounded-xl bg-indigo-50 p-4")}>
      <Text style={twStyle("text-sm font-semibold text-indigo-900")}>{app.application_no}</Text>
      <Text style={twStyle("mt-1 text-sm text-indigo-800")}>
        {messages[app.status] ?? tm("statusDefault")}
      </Text>
    </View>
  );
}

export default function TerminalMerchantApplicationScreen() {
  const { t } = useTranslation();
  const tm = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.terminalMerchantApplication.${key}`, opts) as string,
    [t],
  );
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
      return tm("bannerPurchase");
    }
    if (order?.commercial_model === "subscription_bundle") {
      return tm("bannerSubscription");
    }
    return tm("bannerDefault");
  }, [data?.linked_orders, orderIdParam, tm]);

  const openHelp = useCallback((slug: string) => {
    const host = getRuntimeMarketHost();
    pushInAppBrowser(router, `${host}/learn/article/${slug}`, tm("helpTitle"));
  }, [router, tm]);

  const patch = useCallback(
    async (section: string, payload: Record<string, unknown>) => {
      const result = await saveMutation.mutateAsync({ section, ...payload });
      if (result.error) {
        Alert.alert(tm("saveFailed"), result.error);
        return;
      }
      await refetch();
    },
    [saveMutation, refetch, tm],
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
            Alert.alert(tm("cameraPermission"));
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
          Alert.alert(tm("uploadFailed"), getApiErrorMessage(uploadResult.error, tm("tryAgain")));
          return;
        }
        await refetch();
      } catch (e) {
        Alert.alert(tm("uploadFailed"), e instanceof Error ? e.message : tm("tryAgain"));
      } finally {
        setUploadingDoc(null);
      }
    },
    [uploadDocument, refetch, tm],
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
          tm("incompleteTitle"),
          issues.map((i) => i.message).join("\n"),
        );
        return;
      }
      Alert.alert(tm("couldNotSubmit"), result.error.message ?? tm("completeRequired"));
      return;
    }
    await refetch();
    Alert.alert(tm("submittedTitle"), tm("submittedBody"));
  }, [refetch, tm]);

  if (loading && !data) return <LoadingState message={tm("loading")} />;
  if (error) return <ErrorState message={tm("loadError")} onRetry={refetch} />;
  if (!app) return <ErrorState message={tm("unavailable")} onRetry={refetch} />;

  if (!editable) {
    return (
      <ScreenContainer>
        <ScreenHeader title={tm("title")} onBack={handleBack} />
        <ScrollView contentContainerStyle={twStyle("p-4")}>
          <StatusTracker app={app} />
          <TouchableOpacity onPress={() => openHelp(LEARN_ARTICLE_SLUGS.next)}>
            <Text style={twStyle("text-indigo-600 underline")}>{tm("whatHappensNext")}</Text>
          </TouchableOpacity>
          <ActionButton label={tm("backToCardMachines")} onPress={() => router.push("/(app)/(tabs)/more/card-machines")} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  const step = WIZARD_STEPS[stepIndex];
  const requiredDocs = requiredDocTypesForEntity(form.entity_type as any);
  const stepTitle = STEP_KEYS[step.id] ? tm(STEP_KEYS[step.id]) : step.title;

  return (
    <ScreenContainer>
      <ScreenHeader title={tm("title")} onBack={handleBack} />
      <ScrollView contentContainerStyle={twStyle("p-4 pb-24")}>
        <Text style={twStyle("mb-2 text-sm text-gray-600")}>{acquisitionBanner}</Text>
        <Text style={twStyle("mb-4 text-xs text-gray-500")}>
          {tm("stepProgress", { current: stepIndex + 1, total: WIZARD_STEPS.length, title: stepTitle })}
        </Text>

        {step.id === "personal" && (
          <>
            <Field label={tm("firstName")} value={String(form.first_name ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, first_name: v }))} />
            <Field label={tm("lastName")} value={String(form.last_name ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, last_name: v }))} />
            <Field label={tm("email")} value={String(form.email ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} keyboardType="email-address" />
            <Field label={tm("phone")} value={String(form.phone ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
            <Field label={tm("otpPhone")} value={String(form.otp_phone ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, otp_phone: v }))} keyboardType="phone-pad" />
            <Field label={tm("idNumber")} value={String(form.id_number ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, id_number: v }))} />
            <Text style={twStyle("mb-1 text-sm text-gray-600")}>{tm("idType")}</Text>
            {(["national_id", "passport", "foreign_id"] as const).map((idType) => (
              <PickOption
                key={idType}
                label={tm(ID_TYPE_KEYS[idType])}
                selected={form.id_type === idType}
                onPress={() => setForm((f) => ({ ...f, id_type: idType }))}
              />
            ))}
            <TouchableOpacity onPress={() => openHelp(LEARN_ARTICLE_SLUGS.application)}>
              <Text style={twStyle("text-sm text-indigo-600 underline")}>{tm("needHelp")}</Text>
            </TouchableOpacity>
          </>
        )}

        {step.id === "business" && (
          <>
            <Text style={twStyle("mb-1 text-sm text-gray-600")}>{tm("businessType")}</Text>
            {(Object.entries(ENTITY_KEYS) as Array<[keyof typeof ENTITY_KEYS, string]>).map(([value, key]) => (
              <PickOption
                key={value}
                label={tm(key)}
                selected={form.entity_type === value}
                onPress={() => setForm((f) => ({ ...f, entity_type: value }))}
              />
            ))}
            <Field label={tm("legalName")} value={String(form.legal_name ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, legal_name: v }))} />
            <Field label={tm("tradingName")} value={String(form.trading_name ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, trading_name: v }))} />
            <Field label={tm("registrationNumber")} value={String(form.registration_number ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, registration_number: v }))} />
            <Field label={tm("vatNumber")} value={String(form.vat_number ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, vat_number: v }))} />
          </>
        )}

        {step.id === "address" && (
          <>
            <Field label={tm("physicalAddress")} value={String(form.physical_line1 ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, physical_line1: v }))} />
            <Field label={tm("suburb")} value={String(form.physical_suburb ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, physical_suburb: v }))} />
            <Field label={tm("city")} value={String(form.physical_city ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, physical_city: v }))} />
            <Field label={tm("province")} value={String(form.physical_province ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, physical_province: v }))} />
            <Field label={tm("postalCode")} value={String(form.physical_postal_code ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, physical_postal_code: v }))} />
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm text-gray-700")}>{tm("postalSameAsPhysical")}</Text>
              <Switch
                value={form.postal_same_as_physical !== false}
                onValueChange={(v) => setForm((f) => ({ ...f, postal_same_as_physical: v }))}
              />
            </View>
          </>
        )}

        {step.id === "banking" && (
          <>
            <Field label={tm("bankName")} value={String(form.bank_name ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, bank_name: v }))} />
            <Text style={twStyle("mb-1 text-sm text-gray-600")}>{tm("accountType")}</Text>
            {(Object.entries(ACCOUNT_TYPE_KEYS) as Array<[keyof typeof ACCOUNT_TYPE_KEYS, string]>).map(([value, key]) => (
              <PickOption
                key={value}
                label={tm(key)}
                selected={form.account_type === value}
                onPress={() => setForm((f) => ({ ...f, account_type: value }))}
              />
            ))}
            <Field label={tm("accountHolder")} value={String(form.account_holder ?? "")} onChangeText={(v) => setForm((f) => ({ ...f, account_holder: v }))} />
            <Field label={tm("accountNumber")} value={accountNumber} onChangeText={setAccountNumber} keyboardType="phone-pad" />
            {form.account_number_last4 ? (
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>{tm("savedEnding", { last4: form.account_number_last4 })}</Text>
            ) : null}
          </>
        )}

        {step.id === "documents" && (
          <>
            <Text style={twStyle("mb-2 text-sm text-gray-700")}>
              {tm("documentsIntro")}
            </Text>
            {requiredDocs.map((docType) => {
              const doc = documents.find((d) => d.doc_type === docType);
              const meta = DOC_KEYS[docType];
              if (docType === "id_document" && identityVerified && !doc) {
                return (
                  <View key={docType} style={twStyle("mb-3 rounded-lg border border-green-200 bg-green-50 p-3")}>
                    <Text style={twStyle("font-medium text-green-800")}>{tm("alreadyVerified", { title: tm(meta.title) })}</Text>
                  </View>
                );
              }
              return (
                <View key={docType} style={twStyle("mb-3 rounded-lg border border-gray-200 p-3")}>
                  <Text style={twStyle("font-medium")}>{tm(meta.title)}</Text>
                  <Text style={twStyle("text-sm text-gray-600")}>{tm(meta.hint)}</Text>
                  <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                    {doc ? doc.status : tm("notAdded")}
                    {doc?.rejection_reason ? ` — ${doc.rejection_reason}` : ""}
                  </Text>
                  <View style={twStyle("mt-2 flex-row gap-2")}>
                    <TouchableOpacity
                      style={twStyle("rounded bg-gray-100 px-3 py-2")}
                      onPress={() => pickAndUpload(docType, true)}
                      disabled={uploadingDoc === docType}
                    >
                      <Text>{tm("camera")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={twStyle("rounded bg-gray-100 px-3 py-2")}
                      onPress={() => pickAndUpload(docType, false)}
                      disabled={uploadingDoc === docType}
                    >
                      <Text>{tm("file")}</Text>
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
              <Text style={twStyle("text-sm text-gray-700")}>{tm("stuckSupport")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openHelp(LEARN_ARTICLE_SLUGS.documents)}>
              <Text style={twStyle("mt-2 text-sm text-indigo-600 underline")}>{tm("whatDocuments")}</Text>
            </TouchableOpacity>
          </>
        )}

        {step.id === "fulfillment" && (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{tm("fulfillmentQuestion")}</Text>
            <PickOption
              label={tm("deliverToAddress")}
              selected={form.fulfillment_method !== "collection"}
              onPress={() => setForm((f) => ({ ...f, fulfillment_method: "delivery" }))}
            />
            <PickOption
              label={tm("collectPickup")}
              selected={form.fulfillment_method === "collection"}
              onPress={() => setForm((f) => ({ ...f, fulfillment_method: "collection" }))}
            />
            {form.fulfillment_method === "collection" ? (
              <>
                {(collectionLocations ?? []).length === 0 ? (
                  <Text style={twStyle("mb-2 text-sm text-amber-700")}>
                    {tm("noPickupLocations")}
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
                  label={tm("deliveryLine1")}
                  value={String(form.delivery_line1 ?? form.physical_line1 ?? "")}
                  onChangeText={(v) => setForm((f) => ({ ...f, delivery_line1: v, fulfillment_method: "delivery" }))}
                />
                <Field
                  label={tm("deliveryCity")}
                  value={String(form.delivery_city ?? form.physical_city ?? "")}
                  onChangeText={(v) => setForm((f) => ({ ...f, delivery_city: v, fulfillment_method: "delivery" }))}
                />
                <Text style={twStyle("text-sm text-gray-600")}>
                  {tm("deliveryHint")}
                </Text>
              </>
            )}
          </>
        )}

        {step.id === "review" && (
          <>
            <Text style={twStyle("mb-2 text-sm text-gray-700")}>
              {tm("reviewHint", { phone: form.otp_phone ?? tm("yourPhone") })}
            </Text>
            <TouchableOpacity onPress={() => openHelp(LEARN_ARTICLE_SLUGS.termSheet)}>
              <Text style={twStyle("text-sm text-indigo-600 underline")}>{tm("whatIsTermSheet")}</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={twStyle("mt-6 flex-row gap-2")}>
          {stepIndex > 0 ? (
            <ActionButton label={tm("back")} variant="secondary" onPress={() => setStepIndex((i) => i - 1)} />
          ) : null}
          {stepIndex < WIZARD_STEPS.length - 1 ? (
            <ActionButton
              label={tm("saveContinue")}
              onPress={async () => {
                const payload = buildSectionPayload(step.id, form, accountNumber);
                await patch(step.id, payload);
                setStepIndex((i) => i + 1);
              }}
            />
          ) : (
            <ActionButton label={tm("submit")} onPress={handleSubmit} />
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
