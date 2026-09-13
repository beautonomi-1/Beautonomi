"use client";
import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { providerApi } from "@/lib/provider-portal/api";
import type { Sale, FilterParams, PaginationParams } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/provider-portal/Money";
import { YocoPaymentDialog } from "@/components/provider-portal/YocoPaymentDialog";
import { PayCloudPaymentDialog } from "@/components/provider-portal/PayCloudPaymentDialog";
import { PaycloudCollectButton } from "@/components/provider-portal/PaycloudCollectButton";
import { NewSaleDialog } from "@/components/provider-portal/NewSaleDialog";
import { toast } from "sonner";
import { Search, Plus, CreditCard, Calendar, User, ShoppingBag } from "lucide-react";
import Pagination from "@/components/ui/pagination";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import type { YocoPayment } from "@/lib/provider-portal/types";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { ProtectedPage } from "@/components/provider/ProtectedPage";
import { useConfigBundle, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { getDefaultMoneyLocale } from "@beautonomi/utils";

function ProviderSalesContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const { currencyCode } = useReportCurrency();
  const { isLoading: configLoading } = useConfigBundle();
  const unifiedPosEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS);
  const { selectedLocationId } = useProviderPortal();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<string>("month");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [yocoDialogOpen, setYocoDialogOpen] = useState(false);
  const [paycloudDialogOpen, setPaycloudDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isNewSaleDialogOpen, setIsNewSaleDialogOpen] = useState(false);

  useEffect(() => {
    if (!configLoading && !unifiedPosEnabled) {
      router.replace("/provider/dashboard");
    }
  }, [configLoading, unifiedPosEnabled, router]);

  useEffect(() => {
    loadSales();
  }, [page, dateRange, selectedLocationId]);

  // Optimized debounced search
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

      const now = new Date();
      if (dateRange === "today") {
        const today = now.toISOString().split("T")[0];
        filters.date_from = today;
        filters.date_to = today;
      } else if (dateRange === "week") {
        const day = now.getDay();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - day);
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() + (6 - day));
        filters.date_from = weekStart.toISOString().split("T")[0];
        filters.date_to = weekEnd.toISOString().split("T")[0];
      } else if (dateRange === "month") {
        filters.date_from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        filters.date_to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      }
      // "all" / "custom" send no date range — API returns all records

      const pagination: PaginationParams = { page, limit: 20 };
      const response = await providerApi.listSales(filters, pagination);
      setSales(response.data);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error("Failed to load sales:", error);
      toast.error(t("web.provider.pages.sales.failedToLoad"));
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

  const handlePaycloudPayment = (sale: Sale) => {
    setSelectedSale(sale);
    setPaycloudDialogOpen(true);
  };

  /**
   * `sales.payment_status` is constrained to pending | completed | failed |
   * refunded (migration 129) and defaults to 'completed'. Only the two unsettled
   * states are collectable — offering a charge on a completed sale invites a
   * duplicate payment.
   */
  const isSaleCollectable = (sale: Sale) => {
    if (Number(sale.total ?? 0) <= 0) return false;
    const status = (sale.payment_status || "").toLowerCase();
    return status === "pending" || status === "failed";
  };

  const handlePaymentSuccess = (_payment: YocoPayment) => {
    // Reload sales to reflect payment status
    loadSales();
  };

  if (configLoading || !unifiedPosEnabled) {
    return <LoadingTimeout loadingMessage={t("web.provider.pages.sales.loading")} />;
  }

  if (isLoading) {
    return <LoadingTimeout loadingMessage={t("web.provider.pages.sales.loading")} />;
  }

  return (
    <div className="pb-4 md:pb-0">
      {/* Mobile-first header */}
      <div className="sticky top-0 z-10 bg-white border-b md:border-none md:bg-transparent mb-4 md:mb-6">
        <div className="flex items-center justify-between p-4 md:p-0">
          <div>
            <h1 className="text-2xl font-bold md:hidden">{t("web.provider.sidebar.items.sales")}</h1>
            <div className="hidden md:block">
              <PageHeader
                title={t("web.provider.sidebar.items.sales")}
                subtitle={t("web.provider.pages.sales.subtitle")}
                primaryAction={{
                label: t("web.provider.sidebar.items.newSale"),
                onClick: handleCreateSale,
                icon: <Plus className="w-4 h-4 me-2" />,
              }}
              />
            </div>
          </div>
          <Button
            onClick={handleCreateSale}
            className="md:hidden bg-primary hover:bg-primary-hover h-11 px-4 rounded-full shadow-lg active:scale-95 transition-transform"
            size="lg"
          >
            <Plus className="w-5 h-5 me-2" />
            {t("web.provider.sidebar.items.newSale")}
          </Button>
        </div>
      </div>

      {/* Mobile-optimized filters */}
      <div className="px-4 md:px-0 mb-4 md:mb-6 space-y-3 md:space-y-0 md:flex md:flex-row md:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            placeholder={t("web.provider.pages.sales.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ps-11 h-12 text-base md:ps-10 md:h-10 md:text-sm"
          />
        </div>
        <div className="flex gap-2 md:block">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-full h-12 text-base md:h-10 md:w-48 md:text-sm">
              <Calendar className="w-4 h-4 me-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t("web.provider.common.statsRange.today")}</SelectItem>
              <SelectItem value="week">{t("web.provider.common.statsRange.thisWeek")}</SelectItem>
              <SelectItem value="month">{t("web.provider.common.statsRange.thisMonth")}</SelectItem>
              <SelectItem value="all">{t("web.provider.common.statsRange.allTime")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sales List - Mobile Cards / Desktop Table */}
      {sales.length === 0 ? (
        <SectionCard className="p-8 md:p-12 text-center mx-4 md:mx-0">
          <EmptyState
            title={t("web.provider.pages.sales.emptyTitle")}
            description={t("web.provider.pages.sales.emptyDesc")}
            action={{
              label: t("web.provider.sidebar.items.newSale"),
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
                      <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
                        {sale.ref_number}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(sale.date).toLocaleDateString(getDefaultMoneyLocale(), { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-sm">{sale.client_name || t("web.provider.pages.sales.walkIn")}</span>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-lg font-bold text-primary">
                      <Money amount={sale.total} />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{sale.payment_method}</div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3" />
                      <span>{t("web.provider.pages.sales.itemsCount", { count: sale.items.length })}</span>
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
                    <CreditCard className="w-3 h-3 me-1" />
                    {t("web.provider.pages.sales.pay")}
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
                  <TableHead>{t("web.provider.pages.sales.ref")}</TableHead>
                  <TableHead>{t("web.provider.pages.sales.client")}</TableHead>
                  <TableHead>{t("web.provider.common.date")}</TableHead>
                  <TableHead>{t("web.provider.pages.sales.items")}</TableHead>
                  <TableHead>{t("web.provider.pages.sales.subtotal")}</TableHead>
                  <TableHead>{t("web.provider.pages.sales.tax")}</TableHead>
                  <TableHead>{t("web.provider.pages.sales.total")}</TableHead>
                  <TableHead>{t("web.provider.pages.sales.paymentMethod")}</TableHead>
                  <TableHead>{t("web.provider.pages.sales.teamMember")}</TableHead>
                  <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell className="font-medium">{sale.ref_number}</TableCell>
                    <TableCell>{sale.client_name || t("web.provider.pages.sales.walkIn")}</TableCell>
                    <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                    <TableCell>{t("web.provider.pages.sales.itemsCount", { count: sale.items.length })}</TableCell>
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
                    <TableCell>{sale.team_member_name || t("web.provider.common.hyphen")}</TableCell>
                    <TableCell className="text-end">
                      {isSaleCollectable(sale) ? (
                        <>
                          <PaycloudCollectButton
                            amount={sale.total}
                            currency={currencyCode}
                            context="sale"
                            onClick={() => handlePaycloudPayment(sale)}
                            className="gap-2"
                          />
                          {yocoEnabled && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleYocoPayment(sale)}
                              className="gap-2"
                            >
                              <CreditCard className="w-3 h-3" />
                              {t("web.provider.pages.sales.pay")}
                            </Button>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 capitalize">
                          {sale.payment_status || t("web.provider.common.status.completed")}
                        </span>
                      )}
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
        <PayCloudPaymentDialog
          open={paycloudDialogOpen}
          onOpenChange={setPaycloudDialogOpen}
          amount={selectedSale.total}
          entityType="sale"
          entityId={selectedSale.id}
          saleId={selectedSale.id}
          bookingLocationId={selectedLocationId}
          onSuccess={() => {
            loadSales();
            setPaycloudDialogOpen(false);
          }}
        />
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
  const { t } = useTranslation();
  return (
    <ProtectedPage
      permission="view_sales"
      message={t("web.provider.pages.sales.permission")}
    >
      <ProviderSalesContent />
    </ProtectedPage>
  );
}
