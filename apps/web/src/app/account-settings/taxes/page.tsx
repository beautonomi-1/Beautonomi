"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, Receipt, Plus, Edit, Download, HelpCircle } from "lucide-react";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "../components/back-button";
import AuthGuard from "@/components/auth/auth-guard";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import TaxInfoModal from "./components/tax-info-modal";
import VatIdModal from "./components/vat-id-modal";

interface TaxInfo {
  country?: string;
  tax_id?: string;
  full_name?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  updated_at?: string;
}

interface TaxDocument {
  year: number;
  document_url: string | null;
  issued_at: string | null;
  status: "issued" | "not_issued";
}

const TaxesPage = () => {
  const [activeTab, setActiveTab] = useState("taxpayers");
  const [isTaxInfoModalOpen, setTaxInfoModalOpen] = useState(false);
  const [isVatModalOpen, setVatModalOpen] = useState(false);
  const [taxInfo, setTaxInfo] = useState<TaxInfo | null>(null);
  const [vatId, setVatId] = useState<string | null>(null);
  const [taxDocuments, setTaxDocuments] = useState<TaxDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTaxData();
  }, []);

  const loadTaxData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [taxInfoResponse, documentsResponse] = await Promise.all([
        fetcher.get<{ data: { tax_info: TaxInfo | null; vat_id: string | null } }>("/api/me/tax-info", { cache: "no-store" }),
        fetcher.get<{ data: TaxDocument[] }>("/api/me/tax-documents", { cache: "no-store" }),
      ]);

      setTaxInfo(taxInfoResponse.data.tax_info);
      setVatId(taxInfoResponse.data.vat_id);
      setTaxDocuments(documentsResponse.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load tax information";
      setError(errorMessage);
      console.error("Error loading tax data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTaxInfoSave = async (data: any) => {
    try {
      await fetcher.post("/api/me/tax-info", data);
      toast.success("Tax information saved successfully");
      await loadTaxData();
      setTaxInfoModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save tax information");
      throw err;
    }
  };

  const handleVatIdSave = async (vatId: string) => {
    try {
      await fetcher.patch("/api/me/tax-info/vat-id", { vat_id: vatId });
      toast.success("VAT ID saved successfully");
      await loadTaxData();
      setVatModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save VAT ID");
      throw err;
    }
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-50/50">
          <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            <LoadingTimeout loadingMessage="Loading tax information..." />
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-50/50">
          <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            <EmptyState
              title="Unable to load tax information"
              description={error}
              action={{ label: "Try Again", onClick: () => loadTaxData() }}
            />
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mt-8 mb-12"
          >
            <BackButton href="/account-settings" />
            <Breadcrumb
              items={[
                { label: "Account", href: "/account-settings" },
                { label: "Taxes" },
              ]}
            />

            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
              className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900 border-b border-gray-200 mb-6 pb-4 mt-4 md:mt-6"
            >
              Taxes
            </motion.h1>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-6 grid grid-cols-2 w-full h-auto p-1 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
                <TabsTrigger
                  value="taxpayers"
                  className="text-sm md:text-base font-medium text-gray-700 data-[state=active]:bg-white data-[state=active]:text-[#FF0077] data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-white/40 data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-gray-200 rounded-lg transition-all duration-200"
                >
                  Taxpayers
                </TabsTrigger>
                <TabsTrigger
                  value="taxDocuments"
                  className="text-sm md:text-base font-medium text-gray-700 data-[state=active]:bg-white data-[state=active]:text-[#FF0077] data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-white/40 data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-gray-200 rounded-lg transition-all duration-200"
                >
                  Tax Documents
                </TabsTrigger>
              </TabsList>

              <TabsContent value="taxpayers">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8"
                >
                  <div className="space-y-8">
                    {/* Taxpayer Information */}
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                        Taxpayer information
                      </h2>
                      <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                        Tax info is required for most countries/regions.
                      </p>

                      {taxInfo ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
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
                                    <span className="font-medium">Country:</span> {taxInfo.country}
                                  </span>
                                </div>
                              )}
                              {taxInfo.tax_id && (
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-pink-50 rounded-full border border-pink-100">
                                    <Receipt className="w-4 h-4 text-[#FF0077]" />
                                  </div>
                                  <span className="text-sm md:text-base text-gray-700">
                                    <span className="font-medium">Tax ID:</span> {taxInfo.tax_id}
                                  </span>
                                </div>
                              )}
                              {taxInfo.full_name && (
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-pink-50 rounded-full border border-pink-100">
                                    <FileText className="w-4 h-4 text-[#FF0077]" />
                                  </div>
                                  <span className="text-sm md:text-base text-gray-700">
                                    <span className="font-medium">Full Name:</span> {taxInfo.full_name}
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
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </Button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Button
                            onClick={() => setTaxInfoModalOpen(true)}
                            className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white font-medium px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add tax info
                          </Button>
                        </motion.div>
                      )}
                    </div>

                    {/* VAT ID */}
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                        Value Added Tax (VAT)
                      </h2>
                      <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                        If you are VAT-registered, please add your VAT ID.
                      </p>

                      {vatId ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5 mb-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-pink-50 rounded-full border border-pink-100">
                                <Receipt className="w-4 h-4 text-[#FF0077]" />
                              </div>
                              <span className="text-sm md:text-base text-gray-700 font-medium">
                                VAT ID: {vatId}
                              </span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setVatModalOpen(true)}
                              className="text-[#FF0077] border-[#FF0077] hover:bg-pink-50"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </Button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Button
                            onClick={() => setVatModalOpen(true)}
                            className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white font-medium px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add VAT ID Number
                          </Button>
                        </motion.div>
                      )}
                    </div>
                  </div>

                  {/* Help Section */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                    className="mt-8 pt-6 border-t border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">Need help?</h3>
                        <p className="text-sm font-light text-gray-600 mb-3">
                          Get answers to questions about taxes in our Help Center.
                        </p>
                        <a
                          href="/help-center"
                          className="text-sm font-medium text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                        >
                          Visit Help Center
                        </a>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </TabsContent>

              <TabsContent value="taxDocuments">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8"
                >
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                    Tax documents
                  </h2>
                  <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                    Tax documents required for filing taxes are available to review and download here.
                  </p>
                  <p className="text-sm md:text-base font-light text-gray-500 mb-8">
                    You can also file taxes using detailed earnings info, available in the earnings summary.
                  </p>

                  <div className="space-y-6">
                    {taxDocuments.map((doc, index) => (
                      <motion.div
                        key={doc.year}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 * index, duration: 0.4, ease: "easeOut" }}
                        className="border-b border-gray-200 pb-6 last:border-0"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">{doc.year}</h3>
                            <p className="text-sm font-light text-gray-500">
                              {doc.status === "issued" && doc.document_url
                                ? `Issued on ${new Date(doc.issued_at!).toLocaleDateString()}`
                                : "No tax document issued"}
                            </p>
                          </div>
                          {doc.status === "issued" && doc.document_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(doc.document_url!, "_blank")}
                              className="text-[#FF0077] border-[#FF0077] hover:bg-pink-50"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <p className="text-sm font-light text-gray-600 mt-8">
                    For tax documents issued prior to {new Date().getFullYear() - 4}, contact us.
                  </p>

                  {/* Help Section */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                    className="mt-8 pt-6 border-t border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">Need help?</h3>
                        <p className="text-sm font-light text-gray-600 mb-3">
                          Get answers to questions about taxes in our Help Center.
                        </p>
                        <a
                          href="/help-center"
                          className="text-sm font-medium text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                        >
                          Visit Help Center
                        </a>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>

        {/* Modals */}
        <TaxInfoModal
          isOpen={isTaxInfoModalOpen}
          onClose={() => setTaxInfoModalOpen(false)}
          onSave={handleTaxInfoSave}
          initialData={taxInfo}
        />
        <VatIdModal
          isOpen={isVatModalOpen}
          onClose={() => setVatModalOpen(false)}
          onSave={handleVatIdSave}
          initialData={vatId}
        />
      </div>
    </AuthGuard>
  );
};

export default TaxesPage;
