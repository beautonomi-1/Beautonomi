"use client";

import React, { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, Receipt, Plus, Edit, Download, HelpCircle, Info } from "lucide-react";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "../components/back-button";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import TaxInfoModal from "./components/tax-info-modal";
import type { TaxInfoFormData } from "./components/tax-info-modal";
import VatIdModal from "./components/vat-id-modal";
import type { TaxDocumentPayload, TaxInfoPayload, TaxesPageInitial } from "./taxes-initial-types";

type TaxInfo = TaxInfoPayload;
type TaxDocument = TaxDocumentPayload;

const TaxesPage = ({ initial }: { initial: TaxesPageInitial | null }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("taxpayers");
  const [isTaxInfoModalOpen, setTaxInfoModalOpen] = useState(false);
  const [isVatModalOpen, setVatModalOpen] = useState(false);
  const [taxInfo, setTaxInfo] = useState<TaxInfo | null>(() => initial?.tax_info ?? null);
  const [vatId, setVatId] = useState<string | null>(() => initial?.vat_id ?? null);
  const [taxDocuments, setTaxDocuments] = useState<TaxDocument[]>(() => initial?.tax_documents ?? []);
  const [isLoading, setIsLoading] = useState(() => !initial);
  const [error, setError] = useState<string | null>(null);
  const skipHydrateLoadOnce = useRef(!!initial);

  useEffect(() => {
    if (skipHydrateLoadOnce.current && initial) {
      skipHydrateLoadOnce.current = false;
      return;
    }
    void loadTaxData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` is fixed for this navigation
  }, []);

  const loadTaxData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [taxInfoResponse, documentsResponse] = await Promise.all([
        fetcher.get<{ data: { tax_info: TaxInfo | null; vat_id: string | null } }>("/api/me/tax-info", { staleTimeMs: 30_000 }),
        fetcher.get<{ data: TaxDocument[] }>("/api/me/tax-documents", { staleTimeMs: 30_000 }),
      ]);

      setTaxInfo(taxInfoResponse.data.tax_info);
      setVatId(taxInfoResponse.data.vat_id);
      setTaxDocuments(documentsResponse.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? t("web.accountSettings.taxes.requestTimeout")
          : err instanceof FetchError
          ? err.message
          : t("web.accountSettings.taxes.loadFailed");
      setError(errorMessage);
      console.error("Error loading tax data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTaxInfoSave = async (data: TaxInfoFormData) => {
    try {
      await fetcher.post("/api/me/tax-info", data);
      toast.success(t("web.accountSettings.taxes.saved"));
      await loadTaxData();
      setTaxInfoModalOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("web.accountSettings.taxes.saveFailed");
      toast.error(message);
      throw err;
    }
  };

  const handleVatIdSave = async (vatId: string) => {
    try {
      await fetcher.patch("/api/me/tax-info/vat-id", { vat_id: vatId });
      toast.success(t("web.accountSettings.taxes.vatSaved"));
      await loadTaxData();
      setVatModalOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("web.accountSettings.taxes.vatSaveFailed");
      toast.error(message);
      throw err;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
          <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            <LoadingTimeout loadingMessage={t("web.accountSettings.taxes.loading")} />
          </div>
        </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
          <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            <EmptyState
              title={t("web.accountSettings.unableLoadTaxes")}
              description={error}
              action={{ label: t("web.accountSettings.taxes.tryAgain"), onClick: () => loadTaxData() }}
            />
          </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <div
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mt-8 mb-12"
          >
            <BackButton href="/account-settings" />
            <Breadcrumb
              items={[
                { label: t("web.accountSettings.account"), href: "/account-settings" },
                { label: t("web.accountSettings.taxes.title") },
              ]}
            />

            <h1
              className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900 border-b border-gray-200 mb-6 pb-4 mt-4 md:mt-6"
            >
              {t("web.accountSettings.taxes.title")}
            </h1>

            <div
              className="mb-6 flex gap-3 rounded-xl border border-sky-200/80 bg-sky-50/90 px-4 py-3 text-sm text-sky-950 backdrop-blur-sm"
              role="status"
            >
              <Info className="h-5 w-5 shrink-0 text-sky-600 mt-0.5" aria-hidden />
              <p className="font-light leading-relaxed">
                <span className="font-medium">{t("web.accountSettings.taxes.comingSoon")}</span>{" "}
                {t("web.accountSettings.taxes.comingSoonBody")}
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-6 grid grid-cols-2 w-full h-auto p-1 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
                <TabsTrigger
                  value="taxpayers"
                  className="text-sm md:text-base font-medium text-gray-700 data-[state=active]:bg-white data-[state=active]:text-[#FF0077] data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-white/40 data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-gray-200 rounded-lg transition-all duration-200"
                >
                  {t("web.accountSettings.taxes.taxpayers")}
                </TabsTrigger>
                <TabsTrigger
                  value="taxDocuments"
                  className="text-sm md:text-base font-medium text-gray-700 data-[state=active]:bg-white data-[state=active]:text-[#FF0077] data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-white/40 data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-gray-200 rounded-lg transition-all duration-200"
                >
                  {t("web.accountSettings.taxes.taxDocuments")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="taxpayers">
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8"
                >
                  <div className="space-y-8">
                    {/* Taxpayer Information */}
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                        {t("web.accountSettings.taxes.taxpayerInfo")}
                      </h2>
                      <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                        {t("web.accountSettings.taxes.taxpayerInfoHint")}
                      </p>

                      {taxInfo ? (
                        <div
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5 mb-4"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-2">
                              {taxInfo.country && (
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-pink-50 rounded-full border border-pink-100">
                                    <FileText className="w-4 h-4 text-[#FF0077]" />
                                  </div>
                                  <span className="text-sm md:text-base text-gray-700">
                                    <span className="font-medium">{t("web.accountSettings.taxes.country")}</span> {taxInfo.country}
                                  </span>
                                </div>
                              )}
                              {taxInfo.tax_id && (
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-pink-50 rounded-full border border-pink-100">
                                    <Receipt className="w-4 h-4 text-[#FF0077]" />
                                  </div>
                                  <span className="text-sm md:text-base text-gray-700">
                                    <span className="font-medium">{t("web.accountSettings.taxes.taxId")}</span> {taxInfo.tax_id}
                                  </span>
                                </div>
                              )}
                              {taxInfo.full_name && (
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-pink-50 rounded-full border border-pink-100">
                                    <FileText className="w-4 h-4 text-[#FF0077]" />
                                  </div>
                                  <span className="text-sm md:text-base text-gray-700">
                                    <span className="font-medium">{t("web.accountSettings.taxes.fullName")}</span> {taxInfo.full_name}
                                  </span>
                                </div>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTaxInfoModalOpen(true)}
                              className="text-[#FF0077] border-[#FF0077] hover:bg-pink-50"
                            >
                              <Edit className="w-4 h-4 me-2" />
                              {t("web.accountSettings.taxes.edit")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                        >
                          <Button
                            onClick={() => setTaxInfoModalOpen(true)}
                            className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white font-medium px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all"
                          >
                            <Plus className="w-4 h-4 me-2" />
                            {t("web.accountSettings.taxes.addTaxInfo")}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* VAT ID */}
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                        {t("web.accountSettings.taxes.vatTitle")}
                      </h2>
                      <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                        {t("web.accountSettings.taxes.vatHint")}
                      </p>

                      {vatId ? (
                        <div
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5 mb-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-pink-50 rounded-full border border-pink-100">
                                <Receipt className="w-4 h-4 text-[#FF0077]" />
                              </div>
                              <span className="text-sm md:text-base text-gray-700 font-medium">
                                {t("web.accountSettings.taxes.vatId", { id: vatId })}
                              </span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setVatModalOpen(true)}
                              className="text-[#FF0077] border-[#FF0077] hover:bg-pink-50"
                            >
                              <Edit className="w-4 h-4 me-2" />
                              {t("web.accountSettings.taxes.edit")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                        >
                          <Button
                            onClick={() => setVatModalOpen(true)}
                            className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white font-medium px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all"
                          >
                            <Plus className="w-4 h-4 me-2" />
                            {t("web.accountSettings.taxes.addVatId")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Help Section */}
                  <div
                    className="mt-8 pt-6 border-t border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">{t("web.accountSettings.taxes.needHelp")}</h3>
                        <p className="text-sm font-light text-gray-600 mb-3">
                          {t("web.accountSettings.taxes.helpBody")}
                        </p>
                        <a
                          href="/help-center"
                          className="text-sm font-medium text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                        >
                          {t("web.accountSettings.taxes.visitHelpCenter")}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="taxDocuments">
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8"
                >
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                    {t("web.accountSettings.taxes.documentsTitle")}
                  </h2>
                  <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                    {t("web.accountSettings.taxes.documentsHint")}
                  </p>
                  <p className="text-sm md:text-base font-light text-gray-500 mb-8">
                    {t("web.accountSettings.taxes.documentsSecondary")}
                  </p>

                  <div className="space-y-6">
                    {taxDocuments.map((doc) => (
                      <div
                        key={doc.year}
                        className="border-b border-gray-200 pb-6 last:border-0"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">{doc.year}</h3>
                            <p className="text-sm font-light text-gray-500">
                              {doc.status === "issued" && doc.document_url
                                ? t("web.accountSettings.taxes.issuedOn", {
                                    date: new Date(doc.issued_at!).toLocaleDateString(),
                                  })
                                : t("web.accountSettings.taxes.noDocumentIssued")}
                            </p>
                          </div>
                          {doc.status === "issued" && doc.document_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(doc.document_url!, "_blank")}
                              className="text-[#FF0077] border-[#FF0077] hover:bg-pink-50"
                            >
                              <Download className="w-4 h-4 me-2" />
                              {t("web.accountSettings.taxes.download")}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-sm font-light text-gray-600 mt-8">
                    {t("web.accountSettings.taxes.priorYearsContact", {
                      year: new Date().getFullYear() - 4,
                    })}
                  </p>

                  {/* Help Section */}
                  <div
                    className="mt-8 pt-6 border-t border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">{t("web.accountSettings.taxes.needHelp")}</h3>
                        <p className="text-sm font-light text-gray-600 mb-3">
                          {t("web.accountSettings.taxes.helpBody")}
                        </p>
                        <a
                          href="/help-center"
                          className="text-sm font-medium text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                        >
                          {t("web.accountSettings.taxes.visitHelpCenter")}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Modals */}
        <TaxInfoModal
          isOpen={isTaxInfoModalOpen}
          onClose={() => setTaxInfoModalOpen(false)}
          onSave={handleTaxInfoSave}
          initialData={taxInfo as Partial<TaxInfoFormData>}
        />
        <VatIdModal
          isOpen={isVatModalOpen}
          onClose={() => setVatModalOpen(false)}
          onSave={handleVatIdSave}
          initialData={vatId}
        />
      </div>
  );
};

export default TaxesPage;
