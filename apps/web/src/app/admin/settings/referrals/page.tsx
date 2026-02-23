"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Gift, HelpCircle, Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";

interface ReferralSettings {
  referral_amount: number;
  referral_message: string;
  referral_currency: string;
  is_enabled: boolean;
}

interface ReferralFAQ {
  id: string;
  question: string;
  answer: string | null;
  answer_type: "text" | "list";
  answer_list: string[] | null;
  display_order: number;
  is_active: boolean;
}

export default function ReferralSettingsPage() {
  const { user, role } = useAuth();
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [faqs, setFaqs] = useState<ReferralFAQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingFaq, setEditingFaq] = useState<ReferralFAQ | null>(null);
  const [faqForm, setFaqForm] = useState({
    question: "",
    answer: "",
    answer_type: "text" as "text" | "list",
    answer_list: [] as string[],
    display_order: 0,
    is_active: true,
  });

  useEffect(() => {
    if (user?.id && role === "superadmin") {
      loadSettings();
      loadFAQs();
    } else if (role != null && role !== "superadmin") {
      setIsLoading(false);
      setIsLoadingFaqs(false);
    }
  }, [user?.id, role]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: ReferralSettings }>(
        "/api/admin/referrals"
      );
      setSettings(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load referral settings";
      setError(errorMessage);
      console.error("Error loading referral settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setIsSaving(true);
      await fetcher.patch("/api/admin/referrals", settings);
      toast.success("Referral settings saved successfully");
    } catch (error) {
      toast.error("Failed to save referral settings");
      console.error("Error saving settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSettings = (updates: Partial<ReferralSettings>) => {
    setSettings((prev) => {
      if (!prev) return null;
      return { ...prev, ...updates };
    });
  };

  const loadFAQs = async () => {
    try {
      setIsLoadingFaqs(true);
      const response = await fetcher.get<{ data: ReferralFAQ[] }>("/api/admin/referrals/faqs");
      setFaqs(response.data || []);
    } catch (error) {
      console.error("Error loading FAQs:", error);
      // Don't show error toast, just use empty array
      setFaqs([]);
    } finally {
      setIsLoadingFaqs(false);
    }
  };

  const handleSaveFAQ = async () => {
    if (!faqForm.question.trim()) {
      toast.error("Please enter a question");
      return;
    }

    if (faqForm.answer_type === "text" && !faqForm.answer.trim()) {
      toast.error("Please enter an answer");
      return;
    }

    if (faqForm.answer_type === "list" && faqForm.answer_list.length === 0) {
      toast.error("Please add at least one list item");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        question: faqForm.question,
        answer: faqForm.answer_type === "text" ? faqForm.answer : null,
        answer_type: faqForm.answer_type,
        answer_list: faqForm.answer_type === "list" ? faqForm.answer_list : null,
        display_order: faqForm.display_order,
        is_active: faqForm.is_active,
      };

      if (editingFaq) {
        await fetcher.put(`/api/admin/referrals/faqs/${editingFaq.id}`, payload);
        toast.success("FAQ updated successfully");
      } else {
        await fetcher.post("/api/admin/referrals/faqs", payload);
        toast.success("FAQ created successfully");
      }

      setEditingFaq(null);
      setFaqForm({
        question: "",
        answer: "",
        answer_type: "text",
        answer_list: [],
        display_order: faqs.length,
        is_active: true,
      });
      await loadFAQs();
    } catch (error) {
      toast.error("Failed to save FAQ");
      console.error("Error saving FAQ:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditFAQ = (faq: ReferralFAQ) => {
    setEditingFaq(faq);
    setFaqForm({
      question: faq.question,
      answer: faq.answer || "",
      answer_type: faq.answer_type,
      answer_list: faq.answer_list || [],
      display_order: faq.display_order,
      is_active: faq.is_active,
    });
  };

  const handleDeleteFAQ = async (id: string) => {
    if (!confirm("Are you sure you want to delete this FAQ?")) return;
    try {
      await fetcher.delete(`/api/admin/referrals/faqs/${id}`);
      toast.success("FAQ deleted successfully");
      await loadFAQs();
    } catch {
      toast.error("Failed to delete FAQ");
    }
  };

  const addListItem = () => {
    setFaqForm((prev) => ({
      ...prev,
      answer_list: [...prev.answer_list, ""],
    }));
  };

  const updateListItem = (index: number, value: string) => {
    setFaqForm((prev) => ({
      ...prev,
      answer_list: prev.answer_list.map((item, i) => (i === index ? value : item)),
    }));
  };

  const removeListItem = (index: number) => {
    setFaqForm((prev) => ({
      ...prev,
      answer_list: prev.answer_list.filter((_, i) => i !== index),
    }));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading referral settings..." />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load referral settings"
          description={error || "Unable to load referral settings"}
          action={{
            label: "Retry",
            onClick: loadSettings,
          }}
        />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-xl">
                  <Gift className="w-8 h-8 text-[#FF0077]" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900">
                    Referral Program
                  </h1>
                  <p className="text-sm font-light text-gray-600 mt-1">
                    Configure referral settings and manage FAQs
                  </p>
                </div>
              </div>
            </div>

            <Tabs defaultValue="settings" className="space-y-6">
              <TabsList className="backdrop-blur-sm bg-white/60 border border-white/40">
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="faqs">Common Questions</TabsTrigger>
              </TabsList>

              <TabsContent value="settings" className="space-y-6">

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 space-y-6"
                >
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <Label htmlFor="is_enabled" className="text-sm sm:text-base">
                Enable Referral Program
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Allow customers to refer friends and earn credits
              </p>
            </div>
            <input
              type="checkbox"
              id="is_enabled"
              checked={settings.is_enabled}
              onChange={(e) => updateSettings({ is_enabled: e.target.checked })}
              className="w-5 h-5"
            />
          </div>

          {settings.is_enabled && (
            <>
              <div>
                <Label htmlFor="referral_amount" className="text-sm sm:text-base">
                  Referral Amount *
                </Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="referral_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.referral_amount}
                    onChange={(e) =>
                      updateSettings({ referral_amount: parseFloat(e.target.value) || 0 })
                    }
                    className="flex-1"
                    required
                  />
                  <select
                    value={settings.referral_currency}
                    onChange={(e) =>
                      updateSettings({ referral_currency: e.target.value })
                    }
                    className="p-2 border rounded-md"
                  >
                    <option value="ZAR">ZAR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Amount credited to the referrer&apos;s wallet when the referred user completes their first booking
                </p>
                <p className="text-xs text-amber-700 mt-2 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
                  <strong>Revenue impact:</strong> This is a platform cost. Each successful referral reduces platform revenue by this amount (paid from the platform; not deducted from the booking or the provider).
                </p>
              </div>

              <div>
                <Label htmlFor="referral_message" className="text-sm sm:text-base">
                  Referral Message *
                </Label>
                <Textarea
                  id="referral_message"
                  value={settings.referral_message}
                  onChange={(e) =>
                    updateSettings({ referral_message: e.target.value })
                  }
                  rows={4}
                  className="mt-1"
                  placeholder="Enter the default referral message that will be sent to referred users..."
                  required
                />
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  This message will be included when users share their referral link
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-xs sm:text-sm text-blue-800">
                  <strong>Note:</strong> The referral amount is credited only to the <strong>referrer</strong> (the person who shared the link) when the referred user completes their first booking. Each referred user can only trigger one reward. The referral message can be customized by users when sharing their link.
                </p>
              </div>
            </>
          )}

                <div className="flex justify-end">
                  <motion.button
                    onClick={handleSave}
                    disabled={isSaving}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        <span>Save Settings</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
              </TabsContent>

              <TabsContent value="faqs" className="space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-lg">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                          Common Questions
                        </h2>
                        <p className="text-sm font-light text-gray-600 mt-1">
                          Manage FAQs displayed on the customer referrals page
                        </p>
                      </div>
                    </div>
                    <motion.button
                      onClick={() => {
                        setEditingFaq(null);
                        setFaqForm({
                          question: "",
                          answer: "",
                          answer_type: "text",
                          answer_list: [],
                          display_order: faqs.length,
                          is_active: true,
                        });
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-4 py-2 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add FAQ</span>
                    </motion.button>
                  </div>

                  {/* FAQ Form */}
                  {(editingFaq || (!editingFaq && faqForm.question)) && (
                    <div className="mb-6 p-4 backdrop-blur-sm bg-white/40 border border-white/20 rounded-xl space-y-4">
                      <div>
                        <Label>Question *</Label>
                        <Input
                          value={faqForm.question}
                          onChange={(e) => setFaqForm((prev) => ({ ...prev, question: e.target.value }))}
                          placeholder="Enter question..."
                          className="backdrop-blur-sm bg-white/60 border-white/40"
                        />
                      </div>

                      <div>
                        <Label>Answer Type</Label>
                        <select
                          value={faqForm.answer_type}
                          onChange={(e) =>
                            setFaqForm((prev) => ({
                              ...prev,
                              answer_type: e.target.value as "text" | "list",
                            }))
                          }
                          className="w-full p-2 backdrop-blur-sm bg-white/60 border border-white/40 rounded-lg"
                        >
                          <option value="text">Text</option>
                          <option value="list">List</option>
                        </select>
                      </div>

                      {faqForm.answer_type === "text" ? (
                        <div>
                          <Label>Answer *</Label>
                          <Textarea
                            value={faqForm.answer}
                            onChange={(e) => setFaqForm((prev) => ({ ...prev, answer: e.target.value }))}
                            placeholder="Enter answer..."
                            rows={4}
                            className="backdrop-blur-sm bg-white/60 border-white/40"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Use {"${referral_amount}"} to insert the referral amount dynamically
                          </p>
                        </div>
                      ) : (
                        <div>
                          <Label>Answer List *</Label>
                          <div className="space-y-2">
                            {faqForm.answer_list.map((item, index) => (
                              <div key={index} className="flex gap-2">
                                <Input
                                  value={item}
                                  onChange={(e) => updateListItem(index, e.target.value)}
                                  placeholder={`List item ${index + 1}...`}
                                  className="backdrop-blur-sm bg-white/60 border-white/40"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeListItem(index)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={addListItem}
                              className="w-full"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Add List Item
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Display Order</Label>
                          <Input
                            type="number"
                            value={faqForm.display_order}
                            onChange={(e) =>
                              setFaqForm((prev) => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))
                            }
                            className="backdrop-blur-sm bg-white/60 border-white/40"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-8">
                          <input
                            type="checkbox"
                            id="faq_active"
                            checked={faqForm.is_active}
                            onChange={(e) => setFaqForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                            className="w-4 h-4"
                          />
                          <Label htmlFor="faq_active">Active</Label>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <motion.button
                          onClick={handleSaveFAQ}
                          disabled={isSaving}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="flex-1 bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-4 py-2 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>{editingFaq ? "Update FAQ" : "Create FAQ"}</span>
                            </>
                          )}
                        </motion.button>
                        {editingFaq && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingFaq(null);
                              setFaqForm({
                                question: "",
                                answer: "",
                                answer_type: "text",
                                answer_list: [],
                                display_order: faqs.length,
                                is_active: true,
                              });
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* FAQs List */}
                  {isLoadingFaqs ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-[#FF0077] animate-spin" />
                    </div>
                  ) : faqs.length === 0 ? (
                    <div className="p-8 text-center backdrop-blur-sm bg-white/40 border border-white/20 rounded-xl">
                      <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-600">No FAQs created yet</p>
                      <p className="text-xs text-gray-500 mt-1">Click &quot;Add FAQ&quot; to create your first FAQ</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {faqs.map((faq) => (
                        <motion.div
                          key={faq.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="p-4 backdrop-blur-sm bg-white/40 border border-white/20 rounded-xl hover:bg-white/60 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-gray-500">
                                  Order: {faq.display_order}
                                </span>
                                {!faq.is_active && (
                                  <span className="text-xs text-gray-400">(Inactive)</span>
                                )}
                              </div>
                              <p className="font-semibold text-gray-900 mb-1">{faq.question}</p>
                              <p className="text-sm text-gray-600">
                                {faq.answer_type === "text"
                                  ? faq.answer || "No answer"
                                  : `List with ${faq.answer_list?.length || 0} items`}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <motion.button
                                onClick={() => handleEditFAQ(faq)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="p-2 text-[#FF0077] hover:bg-[#FF0077]/10 rounded-lg transition-colors"
                                aria-label="Edit FAQ"
                              >
                                <Edit className="w-4 h-4" />
                              </motion.button>
                              <motion.button
                                onClick={() => handleDeleteFAQ(faq.id)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                aria-label="Delete FAQ"
                              >
                                <Trash2 className="w-4 h-4" />
                              </motion.button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </RoleGuard>
  );
}
