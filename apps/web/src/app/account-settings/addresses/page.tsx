"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useSavedAddresses } from "@/hooks/useSavedAddresses";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, MapPin, Star, Sparkles } from "lucide-react";
import { toast } from "sonner";
import AddressForm from "@/components/mapbox/AddressForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "../components/back-button";
import AuthGuard from "@/components/auth/auth-guard";
import LoadingTimeout from "@/components/ui/loading-timeout";

export default function SavedAddressesPage() {
  const { addresses, isLoading, saveAddress, updateAddress, deleteAddress } =
    useSavedAddresses();
  const [showDialog, setShowDialog] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any>(null);

  const handleCreate = () => {
    setEditingAddress(null);
    setShowDialog(true);
  };

  const handleEdit = (address: any) => {
    setEditingAddress(address);
    setShowDialog(true);
  };

  const handleDelete = async (address: any) => {
    if (!confirm(`Are you sure you want to delete "${address.label || address.address_line1}"?`))
      return;

    try {
      await deleteAddress(address.id);
      toast.success("Address deleted");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete address");
    }
  };

  const handleSave = async (addressData: any) => {
    try {
      if (editingAddress) {
        await updateAddress(editingAddress.id, addressData);
        toast.success("Address updated");
      } else {
        await saveAddress(addressData);
        toast.success("Address saved");
      }
      setShowDialog(false);
      setEditingAddress(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to save address");
    }
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-50/50">
          <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            <LoadingTimeout loadingMessage="Loading saved addresses..." />
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
                { label: "Saved Addresses" },
              ]}
            />

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 mt-4 md:mt-6">
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
                className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900"
              >
                Saved Addresses
              </motion.h1>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={handleCreate}
                  className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white font-medium px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Address
                </Button>
              </motion.div>
            </div>

            {addresses.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-12 text-center"
              >
                <div className="flex justify-center mb-6">
                  <div className="p-4 bg-gradient-to-br from-pink-50 to-purple-50 rounded-full border border-pink-100">
                    <Sparkles className="w-12 h-12 text-[#FF0077]" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold mb-2 text-gray-900">No saved addresses</h2>
                <p className="text-gray-600 mb-6 font-light">
                  Save addresses for faster checkout
                </p>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={handleCreate}
                    className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white font-medium px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Address
                  </Button>
                </motion.div>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {addresses.map((address, index) => (
                  <motion.div
                    key={address.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * index, duration: 0.4, ease: "easeOut" }}
                    whileHover={{ scale: 1.01, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="backdrop-blur-xl bg-white/80 border border-white/40 shadow-lg rounded-xl p-5 md:p-6 hover:shadow-xl transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="p-1.5 bg-pink-50 rounded-full border border-pink-100">
                            <MapPin className="w-4 h-4 text-[#FF0077]" />
                          </div>
                          <h3 className="font-semibold text-lg text-gray-900">
                            {address.label || "Address"}
                          </h3>
                          {address.is_default && (
                            <Badge
                              variant="default"
                              className="bg-gradient-to-r from-pink-100 to-purple-100 text-[#FF0077] border border-pink-200"
                            >
                              <Star className="w-3 h-3 mr-1 fill-[#FF0077]" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <div className="text-gray-600 space-y-1 ml-7">
                          <p className="text-sm md:text-base">{address.address_line1}</p>
                          {address.address_line2 && (
                            <p className="text-sm md:text-base">{address.address_line2}</p>
                          )}
                          {address.apartment_unit && (
                            <p className="text-sm md:text-base text-gray-500">Unit: {address.apartment_unit}</p>
                          )}
                          {address.building_name && (
                            <p className="text-sm md:text-base text-gray-500">Building: {address.building_name}</p>
                          )}
                          {address.floor_number && (
                            <p className="text-sm md:text-base text-gray-500">Floor: {address.floor_number}</p>
                          )}
                          <p className="text-sm md:text-base">
                            {address.city}
                            {address.state && `, ${address.state}`}
                            {address.postal_code && ` ${address.postal_code}`}
                          </p>
                          <p className="text-sm md:text-base">{address.country}</p>
                          {(address.parking_instructions || address.location_landmarks) && (
                            <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                              {address.parking_instructions && (
                                <p className="text-xs text-gray-500">
                                  <span className="font-medium">Parking:</span> {address.parking_instructions}
                                </p>
                              )}
                              {address.location_landmarks && (
                                <p className="text-xs text-gray-500">
                                  <span className="font-medium">Landmarks:</span> {address.location_landmarks}
                                </p>
                              )}
                            </div>
                          )}
                          {address.latitude && address.longitude && (
                            <p className="text-xs text-gray-400 mt-2">
                              Coordinates: {address.latitude.toFixed(6)},{" "}
                              {address.longitude.toFixed(6)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(address)}
                          className="text-[#FF0077] hover:text-[#D60565] hover:bg-pink-50"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(address)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {showDialog && (
              <Dialog
                open={true}
                onOpenChange={() => {
                  setShowDialog(false);
                  setEditingAddress(null);
                }}
              >
                <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
                  <DialogHeader>
                    <DialogTitle>
                      {editingAddress ? "Edit Address" : "Add Address"}
                    </DialogTitle>
                    <DialogDescription>
                      {editingAddress
                        ? "Update your saved address"
                        : "Save an address for faster checkout"}
                    </DialogDescription>
                  </DialogHeader>
                  <AddressForm
                    initialAddress={editingAddress}
                    onSave={handleSave}
                    onCancel={() => {
                      setShowDialog(false);
                      setEditingAddress(null);
                    }}
                    asForm={false}
                  />
                </DialogContent>
              </Dialog>
            )}
          </motion.div>
        </div>
      </div>
    </AuthGuard>
  );
}
