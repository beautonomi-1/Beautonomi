"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { Sale, FilterParams, PaginationParams } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/provider-portal/Money";
import { YocoPaymentDialog } from "@/components/provider-portal/YocoPaymentDialog";
import { NewSaleDialog } from "@/components/provider-portal/NewSaleDialog";
import { Search, Filter, Plus, CreditCard, Calendar, User, ShoppingBag } from "lucide-react";
import Pagination from "@/components/ui/pagination";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import type { YocoPayment } from "@/lib/provider-portal/types";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { ProtectedPage } from "@/components/provider/ProtectedPage";

function ProviderSalesContent() {
  const { selectedLocationId } = useProviderPortal();
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<string>("month");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [yocoDialogOpen, setYocoDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isNewSaleDialogOpen, setIsNewSaleDialogOpen] = useState(false);

  useEffect(() => {
    loadSales();
  }, [page, dateRange, selectedLocationId]);

  // Optimized debounced search (reduced from 500ms to 300ms for faster response)
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (page === 1) {
        loadSales();
      } else {
        setPage(1); // Reset to first page when searching
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const loadSales = async () => {
    try {
      setIsLoading(true);
      const filters: FilterParams = {
        search: searchQuery || undefined,
        location_id: selectedLocationId || undefined,
      };

      if (dateRange === "month") {
        const now = new Date();
        filters.date_from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        filters.date_to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      }

      const pagination: PaginationParams = { page, limit: 20 };
      const response = await providerApi.listSales(filters, pagination);
      setSales(response.data);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error("Failed to load sales:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSale = () => {
    setIsNewSaleDialogOpen(true);
  };

  const handleSaleSuccess = () => {
    setIsNewSaleDialogOpen(false);
    loadSales();
  };

  const handleYocoPayment = (sale: Sale) => {
    setSelectedSale(sale);
    setYocoDialogOpen(true);
  };

  const handlePaymentSuccess = (_payment: YocoPayment) => {
    // Reload sales to reflect payment status
    loadSales();
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading sales..." />;
  }

  return (
    <div className="pb-4 md:pb-0">
      {/* Mobile-first header */}
      <div className="sticky top-0 z-10 bg-white border-b md:border-none md:bg-transparent mb-4 md:mb-6">
        <div className="flex items-center justify-between p-4 md:p-0">
          <div>
            <h1 className="text-2xl font-bold md:hidden">Sales</h1>
            <div className="hidden md:block">
              <PageHeader
                title="Sales"
                subtitle="Track your sales and transactions"
                primaryAction={{
                label: "New Sale",
                onClick: handleCreateSale,
                icon: <Plus className="w-4 h-4 mr-2" />,
              }}
              />
            </div>
          </div>
          <Button
            onClick={handleCreateSale}
            className="md:hidden bg-[#FF0077] hover:bg-[#D60565] h-11 px-4 rounded-full shadow-lg active:scale-95 transition-transform"
            size="lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Sale
          </Button>
        </div>
      </div>

      {/* Mobile-optimized filters */}
      <div className="px-4 md:px-0 mb-4 md:mb-6 space-y-3 md:space-y-0 md:flex md:flex-row md:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            placeholder="Search sales..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 text-base md:pl-10 md:h-10 md:text-sm"
          />
        </div>
        <div className="flex gap-2 md:block">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-full h-12 text-base md:h-10 md:w-48 md:text-sm">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">Month to Date</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-12 px-4 md:h-10 md:px-3 active:scale-95 transition-transform">
            <Filter className="w-5 h-5 md:w-4 md:h-4" />
            <span className="ml-2 md:ml-2 md:hidden">Filter</span>
          </Button>
        </div>
      </div>

      {/* Sales List - Mobile Cards / Desktop Table */}
      {sales.length === 0 ? (
        <SectionCard className="p-8 md:p-12 text-center mx-4 md:mx-0">
          <EmptyState
            title="No Sales yet"
            description="Click here to make a new sale"
            action={{
              label: "New Sale",
              onClick: handleCreateSale,
            }}
          />
        </SectionCard>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden px-4 space-y-3">
            {sales.map((sale) => (
              <div
                key={sale.id}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-[#FF0077] bg-[#FF0077]/10 px-2 py-1 rounded">
                        {sale.ref_number}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(sale.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-sm">{sale.client_name || "Walk-in"}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-[#FF0077]">
                      <Money amount={sale.total} />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{sale.payment_method}</div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3" />
                      <span>{sale.items.length} items</span>
                    </div>
                    {sale.team_member_name && (
                      <span className="text-gray-500">{sale.team_member_name}</span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleYocoPayment(sale)}
                    className="h-8 px-3 text-xs active:scale-95 transition-transform"
                  >
                    <CreditCard className="w-3 h-3 mr-1" />
                    Pay
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Team Member</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell className="font-medium">{sale.ref_number}</TableCell>
                    <TableCell>{sale.client_name || "Walk-in"}</TableCell>
                    <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                    <TableCell>{sale.items.length} items</TableCell>
                    <TableCell>
                      <Money amount={sale.subtotal} />
                    </TableCell>
                    <TableCell>
                      <Money amount={sale.tax} />
                    </TableCell>
                    <TableCell className="font-semibold">
                      <Money amount={sale.total} />
                    </TableCell>
                    <TableCell>{sale.payment_method}</TableCell>
                    <TableCell>{sale.team_member_name || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleYocoPayment(sale)}
                        className="gap-2"
                      >
                        <CreditCard className="w-3 h-3" />
                        Pay
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-6 px-4 md:px-0">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {selectedSale && (
        <YocoPaymentDialog
          open={yocoDialogOpen}
          onOpenChange={setYocoDialogOpen}
          amount={selectedSale.total}
          saleId={selectedSale.id}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <NewSaleDialog
        open={isNewSaleDialogOpen}
        onOpenChange={setIsNewSaleDialogOpen}
        onSuccess={handleSaleSuccess}
      />
    </div>
  );
}

export default function ProviderSales() {
  return (
    <ProtectedPage
      permission="view_sales"
      message="You don't have permission to view sales. Contact your administrator to request access."
    >
      <ProviderSalesContent />
    </ProtectedPage>
  );
}
