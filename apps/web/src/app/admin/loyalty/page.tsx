"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { Gift, Award, TrendingUp, Save, Edit, Trash2, RefreshCw, Loader2 } from "lucide-react";

type LoyaltyRule = {
  id: string;
  points_per_currency_unit: number;
  currency: string;
  redemption_rate: number;
  is_active: boolean;
  effective_from: string;
};

type LoyaltyMilestone = {
  id: string;
  name: string;
  description?: string | null;
  points_threshold: number;
  reward_type: "wallet_credit";
  reward_amount: number;
  reward_currency: string;
  is_active: boolean;
};

export default function AdminLoyaltyPage() {
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [milestones, setMilestones] = useState<LoyaltyMilestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRule = useMemo(() => rules.find((r) => r.is_active) || rules[0] || null, [rules]);

  const [newRule, setNewRule] = useState({
    points_per_currency_unit: 1,
    currency: "ZAR",
    redemption_rate: 100,
  });

  const [milestoneForm, setMilestoneForm] = useState<Partial<LoyaltyMilestone>>({
    name: "",
    description: "",
    points_threshold: 100,
    reward_amount: 10,
    reward_currency: "ZAR",
    is_active: true,
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [rulesRes, milestonesRes] = await Promise.all([
        fetcher.get<{ data: LoyaltyRule[] }>("/api/admin/loyalty/rules"),
        fetcher.get<{ data: LoyaltyMilestone[] }>("/api/admin/loyalty/milestones"),
      ]);
      setRules(rulesRes.data || []);
      setMilestones(milestonesRes.data || []);
    } catch (err) {
      const msg =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load loyalty settings";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createRule = async () => {
    try {
      setIsSaving(true);
      await fetcher.post("/api/admin/loyalty/rules", newRule);
      toast.success("Loyalty rule created successfully");
      await load();
      setNewRule({ points_per_currency_unit: 1, currency: "ZAR", redemption_rate: 100 });
    } catch (err: any) {
      toast.error(err.message || "Failed to create loyalty rule");
    } finally {
      setIsSaving(false);
    }
  };

  const saveMilestone = async () => {
    if (!milestoneForm.name || !milestoneForm.points_threshold) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        name: milestoneForm.name,
        description: milestoneForm.description || null,
        points_threshold: Number(milestoneForm.points_threshold),
        reward_type: "wallet_credit" as const,
        reward_amount: Number(milestoneForm.reward_amount),
        reward_currency: milestoneForm.reward_currency || "ZAR",
        is_active: Boolean(milestoneForm.is_active),
      };

      if (editingId) {
        await fetcher.put(`/api/admin/loyalty/milestones/${editingId}`, payload);
        toast.success("Milestone updated successfully");
      } else {
        await fetcher.post("/api/admin/loyalty/milestones", payload);
        toast.success("Milestone created successfully");
      }
      setEditingId(null);
      setMilestoneForm({
        name: "",
        description: "",
        points_threshold: 100,
        reward_amount: 10,
        reward_currency: "ZAR",
        is_active: true,
      });
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save milestone");
    } finally {
      setIsSaving(false);
    }
  };

  const editMilestone = (m: LoyaltyMilestone) => {
    setEditingId(m.id);
    setMilestoneForm({ ...m });
  };

  const deleteMilestone = async (id: string) => {
    if (!confirm("Are you sure you want to delete this milestone? This action cannot be undone.")) return;
    try {
      await fetcher.delete(`/api/admin/loyalty/milestones/${id}`);
      toast.success("Milestone deleted successfully");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete milestone");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#FF0077] animate-spin" />
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
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-xl">
                <Gift className="w-8 h-8 text-[#FF0077]" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900">
                  Loyalty Program
                </h1>
                <p className="text-sm font-light text-gray-600 mt-1">
                  Manage loyalty rules and milestone rewards
                </p>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <EmptyState
                  title="Failed to load loyalty settings"
                  description={error}
                  action={{ label: "Retry", onClick: load }}
                />
              </motion.div>
            )}

            {!error && (
              <div className="space-y-6">
                {/* Loyalty Rules Card */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                          Loyalty Rules
                        </h2>
                        <p className="text-sm font-light text-gray-600 mt-1">
                          Configure how points are earned and redeemed
                        </p>
                      </div>
                    </div>
                  </div>

                  {activeRule && (
                    <div className="mb-6 p-4 backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl">
                      <p className="text-xs font-medium text-gray-500 mb-1">Current Active Rule</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {activeRule.points_per_currency_unit} point{activeRule.points_per_currency_unit !== 1 ? "s" : ""} per {activeRule.currency} • 
                        {" "}Redemption: {activeRule.redemption_rate} points = 1 {activeRule.currency}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Effective from {new Date(activeRule.effective_from).toLocaleDateString()}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <Label htmlFor="points_per_unit" className="text-sm font-medium text-gray-700 mb-2 block">
                        Points per currency unit
                      </Label>
                      <Input
                        id="points_per_unit"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={newRule.points_per_currency_unit}
                        onChange={(e) => setNewRule((s) => ({ ...s, points_per_currency_unit: Number(e.target.value) }))}
                        className="backdrop-blur-sm bg-white/60 border-white/40"
                        placeholder="1"
                      />
                      <p className="text-xs text-gray-500 mt-1">e.g., 1 point per 1 ZAR spent</p>
                    </div>
                    <div>
                      <Label htmlFor="currency" className="text-sm font-medium text-gray-700 mb-2 block">
                        Currency
                      </Label>
                      <Input
                        id="currency"
                        value={newRule.currency}
                        onChange={(e) => setNewRule((s) => ({ ...s, currency: e.target.value.toUpperCase() }))}
                        className="backdrop-blur-sm bg-white/60 border-white/40"
                        placeholder="ZAR"
                        maxLength={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="redemption_rate" className="text-sm font-medium text-gray-700 mb-2 block">
                        Redemption rate
                      </Label>
                      <Input
                        id="redemption_rate"
                        type="number"
                        min="1"
                        step="1"
                        value={newRule.redemption_rate}
                        onChange={(e) => setNewRule((s) => ({ ...s, redemption_rate: Number(e.target.value) }))}
                        className="backdrop-blur-sm bg-white/60 border-white/40"
                        placeholder="100"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {newRule.redemption_rate} points = 1 {newRule.currency}
                      </p>
                    </div>
                  </div>

                  <motion.button
                    onClick={createRule}
                    disabled={isSaving}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        <span>Create New Rule</span>
                      </>
                    )}
                  </motion.button>
                </motion.div>

                {/* Milestone Rewards Card */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-lg">
                        <Award className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                          Milestone Rewards
                        </h2>
                        <p className="text-sm font-light text-gray-600 mt-1">
                          Set reward thresholds that users unlock when they reach certain point levels
                        </p>
                      </div>
                    </div>
                    <motion.button
                      onClick={load}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2 hover:bg-white/40 rounded-lg transition-colors"
                      aria-label="Refresh"
                    >
                      <RefreshCw className="w-5 h-5 text-gray-600" />
                    </motion.button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                    <div className="md:col-span-2">
                      <Label htmlFor="milestone_name" className="text-sm font-medium text-gray-700 mb-2 block">
                        Milestone Name *
                      </Label>
                      <Input
                        id="milestone_name"
                        value={milestoneForm.name || ""}
                        onChange={(e) => setMilestoneForm((s) => ({ ...s, name: e.target.value }))}
                        className="backdrop-blur-sm bg-white/60 border-white/40"
                        placeholder="e.g., Bronze Member"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="points_threshold" className="text-sm font-medium text-gray-700 mb-2 block">
                        Points Threshold *
                      </Label>
                      <Input
                        id="points_threshold"
                        type="number"
                        min="1"
                        step="1"
                        value={milestoneForm.points_threshold ?? 0}
                        onChange={(e) => setMilestoneForm((s) => ({ ...s, points_threshold: Number(e.target.value) }))}
                        className="backdrop-blur-sm bg-white/60 border-white/40"
                        placeholder="100"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="reward_amount" className="text-sm font-medium text-gray-700 mb-2 block">
                        Reward Amount *
                      </Label>
                      <Input
                        id="reward_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={milestoneForm.reward_amount ?? 0}
                        onChange={(e) => setMilestoneForm((s) => ({ ...s, reward_amount: Number(e.target.value) }))}
                        className="backdrop-blur-sm bg-white/60 border-white/40"
                        placeholder="10.00"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="reward_currency" className="text-sm font-medium text-gray-700 mb-2 block">
                        Currency
                      </Label>
                      <Input
                        id="reward_currency"
                        value={milestoneForm.reward_currency || "ZAR"}
                        onChange={(e) => setMilestoneForm((s) => ({ ...s, reward_currency: e.target.value.toUpperCase() }))}
                        className="backdrop-blur-sm bg-white/60 border-white/40"
                        placeholder="ZAR"
                        maxLength={3}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <Label htmlFor="milestone_description" className="text-sm font-medium text-gray-700 mb-2 block">
                      Description
                    </Label>
                    <Textarea
                      id="milestone_description"
                      value={milestoneForm.description || ""}
                      onChange={(e) => setMilestoneForm((s) => ({ ...s, description: e.target.value }))}
                      className="backdrop-blur-sm bg-white/60 border-white/40"
                      placeholder="Optional description for this milestone..."
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center gap-4 mb-6">
                    <motion.button
                      onClick={saveMilestone}
                      disabled={isSaving || !milestoneForm.name || !milestoneForm.points_threshold}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>{editingId ? "Updating..." : "Creating..."}</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          <span>{editingId ? "Update Milestone" : "Create Milestone"}</span>
                        </>
                      )}
                    </motion.button>
                    {editingId && (
                      <motion.button
                        onClick={() => {
                          setEditingId(null);
                          setMilestoneForm({
                            name: "",
                            description: "",
                            points_threshold: 100,
                            reward_amount: 10,
                            reward_currency: "ZAR",
                            is_active: true,
                          });
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="px-6 py-3 backdrop-blur-sm bg-white/60 border border-white/40 hover:bg-white/80 text-gray-700 rounded-xl font-semibold transition-all"
                      >
                        Cancel
                      </motion.button>
                    )}
                  </div>

                  {/* Milestones List */}
                  <div className="space-y-3">
                    {milestones.length === 0 ? (
                      <div className="p-8 text-center backdrop-blur-sm bg-white/40 border border-white/20 rounded-xl">
                        <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-600">No milestones created yet</p>
                        <p className="text-xs text-gray-500 mt-1">Create your first milestone above</p>
                      </div>
                    ) : (
                      milestones.map((m) => (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="p-4 backdrop-blur-sm bg-white/40 border border-white/20 rounded-xl hover:bg-white/60 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <Award className={`w-5 h-5 ${m.is_active ? "text-[#FF0077]" : "text-gray-400"}`} />
                                <div>
                                  <p className="font-semibold text-gray-900">
                                    {m.name}
                                    {!m.is_active && (
                                      <span className="ml-2 text-xs text-gray-500 font-normal">(Inactive)</span>
                                    )}
                                  </p>
                                  <p className="text-sm text-gray-600">
                                    {m.points_threshold.toLocaleString()} points → {m.reward_currency} {m.reward_amount.toLocaleString()}
                                  </p>
                                  {m.description && (
                                    <p className="text-xs text-gray-500 mt-1">{m.description}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <motion.button
                                onClick={() => editMilestone(m)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="p-2 text-[#FF0077] hover:bg-[#FF0077]/10 rounded-lg transition-colors"
                                aria-label="Edit milestone"
                              >
                                <Edit className="w-4 h-4" />
                              </motion.button>
                              <motion.button
                                onClick={() => deleteMilestone(m.id)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                aria-label="Delete milestone"
                              >
                                <Trash2 className="w-4 h-4" />
                              </motion.button>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </RoleGuard>
  );
}
