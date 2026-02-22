"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { ProductItem, FilterParams, PaginationParams } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { DataTableShell } from "@/components/provider/DataTableShell";
import { SectionCard } from "@/components/provider/SectionCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/provider-portal/Money";
import { Plus, MoreVertical, Upload, Edit, Copy, Archive, Trash2, Package, AlertTriangle, TrendingUp, TrendingDown, Search } from "lucide-react";
import Pagination from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ProductCreateEditDialog } from "./components/ProductCreateEditDialog";
import { ProductFiltersSheet } from "./components/ProductFiltersSheet";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import Breadcrumb from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export default function ProviderProducts() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
  const [stockAction, setStockAction] = useState<"add" | "remove">("add");

  const [metrics, setMetrics] = useState({
    totalProducts: 0,
    lowStockProducts: 0,
    outOfStockProducts: 0,
    totalInventoryValue: 0,
  });

  // Inventory stats - use metrics from API
  const { totalProducts, lowStockProducts, outOfStockProducts, totalInventoryValue } = metrics;
  const productsArray = Array.isArray(products) ? products : [];

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load products when debounced search query or page changes
  useEffect(() => {
    loadProducts();
    loadMetrics();
  }, [page, debouncedSearchQuery]);

  // Generate search suggestions from products
  useEffect(() => {
    if (searchQuery.trim().length > 0 && productsArray.length > 0) {
      const query = searchQuery.toLowerCase();
      const suggestions = productsArray
        .filter(product => 
          product.name.toLowerCase().includes(query) ||
          product.sku?.toLowerCase().includes(query) ||
          product.barcode?.toLowerCase().includes(query) ||
          product.category?.toLowerCase().includes(query)
        )
        .slice(0, 5)
        .map(product => product.name);
      setSearchSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } else {
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
  }, [searchQuery, productsArray]);

  const loadMetrics = async () => {
    try {
      const data = await fetcher.get<{ data?: any }>("/api/provider/products/metrics");
      setMetrics(data.data || {
        totalProducts: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
        totalInventoryValue: 0,
      });
    } catch (error) {
      console.error("Failed to load metrics:", error);
    }
  };

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      const filters: FilterParams = {
        search: debouncedSearchQuery || undefined,
      };
      const pagination: PaginationParams = { page, limit: 20 };
      const response = await providerApi.listProducts(filters, pagination);
      
      const productsList = Array.isArray(response.data) ? response.data : [];
      setProducts(productsList);
      setTotalPages(response.total_pages || 1);
    } catch (error) {
      console.error("Failed to load products:", error);
      toast.error("Failed to load products");
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedProduct(null);
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (product: ProductItem) => {
    setSelectedProduct(product);
    setIsCreateDialogOpen(true);
  };

  const handleDelete = async (product: ProductItem) => {
    if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
      try {
        await providerApi.deleteProduct(product.id);
        toast.success("Product deleted");
        loadProducts();
      } catch {
        toast.error("Failed to delete product");
      }
    }
  };

  const handleSave = () => {
    setIsCreateDialogOpen(false);
    const wasEdit = !!selectedProduct;
    setSelectedProduct(null);
    
    // Reload products and metrics after a short delay to ensure backend has processed
    setTimeout(() => {
      loadProducts();
      loadMetrics();
    }, 500);
    
    toast.success(wasEdit ? "Product updated" : "Product created");
  };

  const handleAdjustStock = (product: ProductItem, action: "add" | "remove") => {
    setSelectedProduct(product);
    setStockAction(action);
    setIsStockDialogOpen(true);
  };

  const handleStockAdjustment = async (quantity: number, _reason: string) => {
    if (!selectedProduct) return;
    
    try {
      const newQuantity = stockAction === "add" 
        ? selectedProduct.quantity + quantity 
        : Math.max(0, selectedProduct.quantity - quantity);
      
      await providerApi.updateProduct(selectedProduct.id, { quantity: newQuantity });
      toast.success(`Stock ${stockAction === "add" ? "added" : "removed"} successfully`);
      setIsStockDialogOpen(false);
      
      // Reload both products and metrics immediately
      await Promise.all([loadProducts(), loadMetrics()]);
    } catch {
      toast.error("Failed to update stock");
    }
  };

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/provider/dashboard" },
          { label: "Catalogue", href: "/provider/catalogue" },
          { label: "Products" },
        ]}
      />
        <PageHeader
          title="Product list"
          subtitle="Manage your inventory with Beautonomi product list"
          primaryAction={{
            label: "Add Product",
            onClick: handleCreate,
            icon: <Plus className="w-4 h-4 mr-2" />,
          }}
          actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* Inventory Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-semibold truncate">{totalProducts}</p>
              <p className="text-xs sm:text-sm text-gray-600 truncate">Total Products</p>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg flex-shrink-0">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-semibold truncate">{lowStockProducts}</p>
              <p className="text-xs sm:text-sm text-gray-600 truncate">Low Stock</p>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 bg-red-100 rounded-lg flex-shrink-0">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-semibold truncate">{outOfStockProducts}</p>
              <p className="text-xs sm:text-sm text-gray-600 truncate">Out of Stock</p>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-semibold truncate">
                <Money amount={totalInventoryValue} />
              </p>
              <p className="text-xs sm:text-sm text-gray-600 truncate">Inventory Value</p>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="relative">
        <DataTableShell
          searchPlaceholder="Search products..."
          searchValue={searchQuery}
          onSearchChange={(value) => {
            setSearchQuery(value);
            setShowSuggestions(value.trim().length > 0);
          }}
          filterButton={{
            label: "Filter",
            onClick: () => setIsFiltersOpen(true),
          }}
          addButton={{
            label: "Add",
            onClick: handleCreate,
          }}
        >
        {isLoading ? (
          <SectionCard>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </SectionCard>
        ) : productsArray.length === 0 ? (
          <SectionCard className="p-4 sm:p-6 lg:p-8">
            <div className="text-center max-w-md mx-auto">
              <div className="mb-4 sm:mb-6 flex justify-center">
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Package className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-600" />
                </div>
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2 sm:mb-3 px-2">
                Manage your inventory with Beautonomi product list
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 px-2">
                Organize and manage your products and services efficiently
              </p>
              <ul className="text-left space-y-2 mb-6 sm:mb-8 text-gray-600 text-sm sm:text-base px-4">
                <li className="flex items-start gap-2">
                  <span className="text-[#FF0077] mt-1 flex-shrink-0">•</span>
                  <span>Start with a single product or import many at once</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#FF0077] mt-1 flex-shrink-0">•</span>
                  <span>Organise your list by adding brands and categories</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#FF0077] mt-1 flex-shrink-0">•</span>
                  <span>Set pricing and manage inventory levels</span>
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-3 justify-center px-4">
                <button
                  onClick={handleCreate}
                  className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-[#FF0077] text-white rounded-lg font-medium hover:bg-[#D60565] active:bg-[#C00454] transition-colors min-h-[44px] touch-manipulation"
                >
                  Start now
                </button>
                <button className="w-full sm:w-auto px-6 py-3 sm:py-2.5 text-[#FF0077] font-medium hover:underline active:opacity-70 min-h-[44px] touch-manipulation">
                  Learn more
                </button>
              </div>
            </div>
          </SectionCard>
        ) : (
          <SectionCard className="p-0 overflow-hidden">
            {/* Mobile Card View */}
            <div className="block lg:hidden divide-y divide-gray-200">
              {productsArray.map((product) => (
                <div key={product.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {product.image_url && (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">SKU: {product.sku || "N/A"}</p>
                        {product.barcode && (
                          <p className="text-xs text-gray-500">Barcode: {product.barcode}</p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(product)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAdjustStock(product, "add")}>
                          <TrendingUp className="w-4 h-4 mr-2" />
                          Add Stock
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAdjustStock(product, "remove")}>
                          <TrendingDown className="w-4 h-4 mr-2" />
                          Remove Stock
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(product)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Category</p>
                      <p className="font-medium">{product.category || "-"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Quantity</p>
                      <p className={cn(
                        "font-medium",
                        product.quantity === 0 && "text-red-600",
                        product.quantity > 0 && product.quantity <= 5 && "text-yellow-600"
                      )}>
                        {product.quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Supplier</p>
                      <p className="font-medium">{product.supplier || "-"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Price</p>
                      <p className="font-medium"><Money amount={product.retail_price} /></p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead className="text-right">Retail Price</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productsArray.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                              <span className="text-xs text-gray-500">
                                {product.name.charAt(0)}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-gray-500">
                              {product.barcode && `Barcode: ${product.barcode}`}
                              {product.barcode && product.sku && ` `}
                              {product.sku && `SKU: ${product.sku}`}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell>{product.supplier || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={
                            product.quantity === 0 
                              ? "text-red-600 font-medium" 
                              : product.quantity <= (product.low_stock_level || 5)
                                ? "text-yellow-600 font-medium" 
                                : ""
                          }>
                            {product.quantity}
                          </span>
                          {product.quantity === 0 && (
                            <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                              Out
                            </span>
                          )}
                          {product.quantity > 0 && product.quantity <= (product.low_stock_level || 5) && (
                            <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                              Low
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <Money amount={product.retail_price} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(product)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAdjustStock(product, "add")}>
                              <TrendingUp className="w-4 h-4 mr-2" />
                              Add Stock
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAdjustStock(product, "remove")}>
                              <TrendingDown className="w-4 h-4 mr-2" />
                              Remove Stock
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Copy className="w-4 h-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Archive className="w-4 h-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(product)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="p-3 sm:p-4 border-t">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </SectionCard>
        )}
        </DataTableShell>
        
        {/* Search Suggestions Dropdown */}
        {showSuggestions && searchSuggestions.length > 0 && (
          <div className="absolute z-50 top-16 left-0 w-full md:max-w-md bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {searchSuggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => {
                  setSearchQuery(suggestion);
                  setShowSuggestions(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{suggestion}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <ProductCreateEditDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        product={selectedProduct}
        onSave={handleSave}
      />

      <ProductFiltersSheet
        open={isFiltersOpen}
        onOpenChange={setIsFiltersOpen}
      />

      {/* Stock Adjustment Dialog */}
      <StockAdjustmentDialog
        open={isStockDialogOpen}
        onOpenChange={setIsStockDialogOpen}
        product={selectedProduct}
        action={stockAction}
        onSubmit={handleStockAdjustment}
      />
    </div>
  );
}

// Stock Adjustment Dialog Component
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function StockAdjustmentDialog({
  open,
  onOpenChange,
  product,
  action,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductItem | null;
  action: "add" | "remove";
  onSubmit: (quantity: number, reason: string) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setQuantity(1);
      setReason("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }
    setIsLoading(true);
    try {
      await onSubmit(quantity, reason);
    } finally {
      setIsLoading(false);
    }
  };

  if (!product) return null;

  const stockReasons = action === "add"
    ? ["Purchase Order", "Return", "Correction", "Other"]
    : ["Sale", "Damaged", "Expired", "Lost", "Other"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {action === "add" ? "Add Stock" : "Remove Stock"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center gap-3">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-12 h-12 rounded object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center">
                  <Package className="w-6 h-6 text-gray-400" />
                </div>
              )}
              <div>
                <p className="font-medium">{product.name}</p>
                <p className="text-sm text-gray-600">
                  Current stock: <span className="font-medium">{product.quantity}</span>
                </p>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              max={action === "remove" ? product.quantity : undefined}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              New stock will be: {action === "add" 
                ? product.quantity + quantity 
                : Math.max(0, product.quantity - quantity)}
            </p>
          </div>

          <div>
            <Label htmlFor="reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {stockReasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className={action === "add" 
                ? "bg-green-600 hover:bg-green-700" 
                : "bg-red-600 hover:bg-red-700"}
            >
              {isLoading ? "Updating..." : action === "add" ? "Add Stock" : "Remove Stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
