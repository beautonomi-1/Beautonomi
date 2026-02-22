"use client";

import { useState, useEffect } from "react";
import { ShoppingBag, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import type { BookingState } from "../booking-flow";

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  inStock: boolean;
  quantity: number;
  track_stock_quantity: boolean;
}

interface BookingProductsProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  providerSlug: string;
}

export default function BookingProducts({
  bookingState,
  updateBookingState,
  providerSlug,
}: BookingProductsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, [providerSlug]);

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/public/providers/${encodeURIComponent(providerSlug)}/products`);
      const data = await response.json();
      if (data.data) {
        setProducts(data.data);
      }
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateProductQuantity = (productId: string, delta: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const currentSelection = bookingState.selectedProducts.find((p) => p.id === productId);
    const currentQuantity = currentSelection?.quantity || 0;
    const newQuantity = Math.max(0, currentQuantity + delta);

    // Check stock availability
    if (product.track_stock_quantity && newQuantity > product.quantity) {
      return; // Can't add more than available
    }

    if (newQuantity === 0) {
      // Remove product
      updateBookingState({
        selectedProducts: bookingState.selectedProducts.filter((p) => p.id !== productId),
      });
    } else if (currentSelection) {
      // Update quantity
      updateBookingState({
        selectedProducts: bookingState.selectedProducts.map((p) =>
          p.id === productId
            ? { ...p, quantity: newQuantity }
            : p
        ),
      });
    } else {
      // Add product
      updateBookingState({
        selectedProducts: [
          ...bookingState.selectedProducts,
          {
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: newQuantity,
            currency: product.currency,
          },
        ],
      });
    }
  };

  const getProductQuantity = (productId: string): number => {
    const selected = bookingState.selectedProducts.find((p) => p.id === productId);
    return selected?.quantity || 0;
  };

  const formatCurrency = (amount: number, currency: string = "ZAR") => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Loading products...</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>No products available for purchase</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Add Products</h2>
        <p className="text-sm text-gray-600">
          Purchase products to take home with your service
        </p>
      </div>

      <div className="space-y-3">
        {products.map((product) => {
          const quantity = getProductQuantity(product.id);
          const isSelected = quantity > 0;
          const isOutOfStock = product.track_stock_quantity && product.quantity === 0;

          return (
            <div
              key={product.id}
              className={`border rounded-lg p-4 transition-colors ${
                isSelected ? "border-[#FF0077] bg-pink-50" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex gap-4">
                {/* Product Image */}
                {product.imageUrl && (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                )}

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 mb-1">{product.name}</h3>
                  {product.description && (
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                      {product.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {formatCurrency(product.price, product.currency)}
                      </p>
                      {product.track_stock_quantity && (
                        <p className="text-xs text-gray-500 mt-1">
                          {product.quantity > 0
                            ? `${product.quantity} in stock`
                            : "Out of stock"}
                        </p>
                      )}
                    </div>

                    {/* Quantity Controls */}
                    {isOutOfStock ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        className="text-gray-400"
                      >
                        Out of Stock
                      </Button>
                    ) : isSelected ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateProductQuantity(product.id, -1)}
                          className="h-8 w-8 p-0"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="font-medium text-gray-900 w-8 text-center">
                          {quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateProductQuantity(product.id, 1)}
                          disabled={
                            product.track_stock_quantity &&
                            quantity >= product.quantity
                          }
                          className="h-8 w-8 p-0"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateProductQuantity(product.id, 1)}
                        className="text-[#FF0077] border-[#FF0077] hover:bg-[#FF0077] hover:text-white"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Products Summary */}
      {bookingState.selectedProducts.length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-medium text-gray-900 mb-2">Selected Products</h3>
          <div className="space-y-1">
            {bookingState.selectedProducts.map((product) => (
              <div
                key={product.id}
                className="flex justify-between text-sm text-gray-600"
              >
                <span>
                  {product.name} × {product.quantity}
                </span>
                <span className="font-medium">
                  {formatCurrency(product.price * product.quantity, product.currency)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between font-semibold text-gray-900">
            <span>Total</span>
            <span>
              {formatCurrency(
                bookingState.selectedProducts.reduce(
                  (sum, p) => sum + p.price * p.quantity,
                  0
                ),
                bookingState.selectedProducts[0]?.currency || "ZAR"
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
