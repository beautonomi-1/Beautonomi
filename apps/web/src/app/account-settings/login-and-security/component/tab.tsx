"use client";
import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import { Shield, Lock, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import Breadcrumb from "../../components/breadcrumb";
import BackButton from "../../components/back-button";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { resetPassword } from "@/lib/supabase/auth";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const tabs = [
  { value: "step1", label: "LOGIN" },
  { value: "step2", label: "LOGIN REQUESTS" },
  { value: "step3", label: "SHARED ACCESS" },
];

const LoginAccount = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("step1");
  const [showPasswordUpdate, setShowPasswordUpdate] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordLastUpdated, setPasswordLastUpdated] = useState<string | null>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivateData, setDeactivateData] = useState({
    password: "",
    reason: "",
  });
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [securityCopy, setSecurityCopy] = useState<{
    title: string;
    body: string;
    safety_tips_customer: { label: string; url: string };
    safety_tips_provider: { label: string; url: string };
  } | null>(null);

  useEffect(() => {
    loadPasswordInfo();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps -- load when user changes

  useEffect(() => {
    fetcher.get<{ data: typeof securityCopy }>("/api/public/account-security-copy", { cache: "no-store" })
      .then((res: any) => {
        const data = res?.data ?? res;
        if (data && typeof data === "object" && data.title) setSecurityCopy(data);
      })
      .catch(() => {});
  }, []);

  const loadPasswordInfo = async () => {
    if (!user) return;
    try {
      const response = await fetcher.get<{ data: { password_changed_at?: string | null } }>("/api/me/profile", { cache: "no-store" });
      // Handle both response.data and direct response structure
      const profileData = response.data || (response as any);
      const passwordChangedAt = profileData?.password_changed_at;
      if (passwordChangedAt) {
        setPasswordLastUpdated(passwordChangedAt);
      }
    } catch (error) {
      console.error("Failed to load password info:", error);
      // Don't show error to user, just default to "Never"
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    return date.toLocaleDateString();
  };

  const handleUpdateClick = () => {
    setShowPasswordUpdate((prev) => !prev);
    if (!showPasswordUpdate) {
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast.error("All fields are required");
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New password and confirm password do not match");
      return;
    }

    try {
      setIsUpdatingPassword(true);
      await fetcher.put("/api/me/password", {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      toast.success("Password updated successfully");
      setShowPasswordUpdate(false);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      loadPasswordInfo();
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!user?.email) {
      toast.error("Email address not found");
      return;
    }
    try {
      await resetPassword(user.email);
      toast.success("Password reset email sent. Please check your inbox.");
    } catch (error: any) {
      toast.error(error.message || "Failed to send password reset email");
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateData.password) {
      toast.error("Password is required to deactivate your account");
      return;
    }

    try {
      setIsDeactivating(true);
      await fetcher.post("/api/me/deactivate", {
        password: deactivateData.password,
        reason: deactivateData.reason || null,
      });
      toast.success("Account deactivated successfully");
      // User will be signed out automatically
      window.location.href = "/";
    } catch (error: any) {
      toast.error(error.message || "Failed to deactivate account");
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <BackButton href="/account-settings" />
        <Breadcrumb 
          items={[
            { label: "Account", href: "/account-settings" },
            { label: "Login & security" }
          ]} 
        />
        
        {/* Page Header - Glass Card Style */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-6"
        >
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tighter mb-2 text-gray-900">Login & security</h1>
          <p className="text-sm md:text-base text-gray-600 font-light">
            Manage your password, account security, and login preferences
          </p>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto whitespace-nowrap mb-8" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            <TabsList className="flex gap-5 border-b bg-transparent">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={`py-2 font-light transition-colors ${
                    activeTab === tab.value
                      ? "border-b-2 border-[#FF0077] text-[#FF0077] text-sm font-semibold"
                      : "border-b-2 border-transparent text-sm text-gray-500 hover:text-[#FF0077]"
                  }`}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

        <TabsContent value="step1">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div className="w-full md:w-2/3">
              {/* Password Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">Password</h2>
                    <p className="text-sm text-gray-500 font-light">
                      Last updated {formatDate(passwordLastUpdated)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleUpdateClick}
                    className="text-[#FF0077] border-[#FF0077] hover:bg-[#FF0077] hover:text-white"
                  >
                    {showPasswordUpdate ? "Cancel" : "Update"}
                  </Button>
                </div>

                {/* Password Update Section */}
                {showPasswordUpdate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mt-6 pt-6 border-t border-white/40"
                  >
                    <form onSubmit={handlePasswordUpdate} className="flex flex-col space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Current Password
                        </label>
                        <Input
                          type="password"
                          value={passwordData.currentPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, currentPassword: e.target.value })
                          }
                          className="w-full backdrop-blur-sm bg-white/60 border-white/40"
                          required
                          placeholder="Enter your current password"
                        />
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          className="text-[#FF0077] hover:text-[#E6006A] underline text-sm font-medium mt-2 transition-colors"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          New Password
                        </label>
                        <Input
                          type="password"
                          value={passwordData.newPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, newPassword: e.target.value })
                          }
                          className="w-full backdrop-blur-sm bg-white/60 border-white/40"
                          required
                          minLength={8}
                          placeholder="Enter new password (min 8 characters)"
                        />
                        <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters long</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Confirm Password
                        </label>
                        <Input
                          type="password"
                          value={passwordData.confirmPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                          }
                          className="w-full backdrop-blur-sm bg-white/60 border-white/40"
                          required
                          placeholder="Confirm your new password"
                        />
                      </div>
                      <div className="flex justify-start">
                        <motion.button
                          type="submit"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          disabled={isUpdatingPassword}
                          className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isUpdatingPassword ? "Updating..." : "Update Password"}
                        </motion.button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </motion.div>

              {/* Social Accounts Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <h2 className="text-xl font-semibold tracking-tighter mb-4 text-gray-900">Social accounts</h2>
                <p className="text-sm text-gray-600 font-light">
                  Connect your social accounts for easier login. Coming soon.
                </p>
              </motion.div>

              {/* Account Deactivation Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">Account</h2>
                    <p className="text-sm text-gray-600 font-light">
                      Deactivate your account if you no longer want to use Beautonomi
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeactivateDialog(true)}
                    className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                  >
                    Deactivate
                  </Button>
                </div>
              </motion.div>
            </div>

            {/* Sidebar - Info Card */}
            <div className="w-full md:w-1/3">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 sticky top-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="w-6 h-6 text-[#FF0077]" />
                  <h2 className="text-lg font-semibold tracking-tighter text-gray-900">
                    {securityCopy?.title ?? "Keeping your account secure"}
                  </h2>
                </div>
                <p className="mb-4 text-sm font-light text-gray-600 leading-relaxed">
                  {securityCopy?.body ?? "We regularly review accounts to make sure they're as secure as possible. We'll also let you know if there's more we can do to increase the security of your account."}
                </p>
                <div className="space-y-3">
                  <Link 
                    href={securityCopy?.safety_tips_customer?.url ?? "/help#customer"}
                    className="text-[#FF0077] hover:text-[#E6006A] text-sm font-medium underline transition-colors flex items-center gap-1.5 group"
                  >
                    <span>{securityCopy?.safety_tips_customer?.label ?? "Safety tips for customers"}</span>
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <Link 
                    href={securityCopy?.safety_tips_provider?.url ?? "/help#provider"}
                    className="text-[#FF0077] hover:text-[#E6006A] text-sm font-medium underline transition-colors flex items-center gap-1.5 group"
                  >
                    <span>{securityCopy?.safety_tips_provider?.label ?? "Safety tips for providers"}</span>
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </motion.div>
            </div>
          </div>
        </TabsContent>

        {/* Login Requests Tab */}
        <TabsContent value="step2">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-6 h-6 text-[#FF0077]" />
              <h2 className="text-xl font-semibold tracking-tighter text-gray-900">Login Requests</h2>
            </div>
            <div className="text-center py-12">
              <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-light mb-2">This feature is coming soon.</p>
              <p className="text-sm text-gray-500">
                View and manage login requests from new devices and locations.
              </p>
            </div>
          </motion.div>
        </TabsContent>

        {/* Shared Access Tab */}
        <TabsContent value="step3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-6 h-6 text-[#FF0077]" />
              <h2 className="text-xl font-semibold tracking-tighter text-gray-900">Shared Access</h2>
            </div>
            <div className="text-center py-12">
              <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-light mb-2">This feature is coming soon.</p>
              <p className="text-sm text-gray-500">
                Manage shared access to your account with trusted family members or assistants.
              </p>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Deactivate Account Dialog */}
      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6 backdrop-blur-2xl bg-white/95 border border-white/40">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tighter text-gray-900">
              Deactivate Your Account
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 font-light">
              This will deactivate your account. You can reactivate it later by logging in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter your password to confirm
              </label>
              <Input
                type="password"
                value={deactivateData.password}
                onChange={(e) =>
                  setDeactivateData({ ...deactivateData, password: e.target.value })
                }
                placeholder="Your password"
                required
                className="backdrop-blur-sm bg-white/60 border-white/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason (optional)
              </label>
              <textarea
                value={deactivateData.reason}
                onChange={(e) =>
                  setDeactivateData({ ...deactivateData, reason: e.target.value })
                }
                className="w-full px-3 py-2 border border-white/40 rounded-lg backdrop-blur-sm bg-white/60 resize-none focus:outline-none focus:ring-2 focus:ring-[#FF0077]"
                rows={3}
                placeholder="Tell us why you're deactivating your account (optional)"
              />
            </div>
            <div className="bg-yellow-50/80 border border-yellow-200/60 rounded-lg p-3 backdrop-blur-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Your account will be deactivated immediately. You can reactivate it by logging in again.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeactivateDialog(false);
                setDeactivateData({ password: "", reason: "" });
              }}
              className="border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDeactivate}
              disabled={isDeactivating || !deactivateData.password}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeactivating ? "Deactivating..." : "Deactivate Account"}
            </motion.button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default LoginAccount;
