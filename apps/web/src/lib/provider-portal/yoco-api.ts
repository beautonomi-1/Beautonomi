/**
 * Yoco API Client for Provider Portal
 * 
 * Real API implementation for Yoco Web POS integration
 * Replaces mock implementation with actual API calls
 */

import { fetcher } from "@/lib/http/fetcher";
import type { YocoDevice, YocoPayment, YocoIntegration } from "./types";

export class YocoApi {
  /**
   * Get Yoco integration settings
   */
  async getIntegration(): Promise<YocoIntegration> {
    const response = await fetcher.get<{ data: YocoIntegration }>(
      "/api/provider/yoco/integration"
    );
    return response.data;
  }

  /**
   * Update Yoco integration settings
   */
  async updateIntegration(data: Partial<YocoIntegration>): Promise<YocoIntegration> {
    const response = await fetcher.put<{ data: YocoIntegration }>(
      "/api/provider/yoco/integration",
      data
    );
    return response.data;
  }

  /**
   * List Yoco devices
   */
  async listDevices(): Promise<YocoDevice[]> {
    const response = await fetcher.get<{ data: YocoDevice[] }>(
      "/api/provider/yoco/devices"
    );
    return response.data || [];
  }

  /**
   * Create Yoco device
   */
  async createDevice(data: Partial<YocoDevice>): Promise<YocoDevice> {
    const response = await fetcher.post<{ data: YocoDevice }>(
      "/api/provider/yoco/devices",
      {
        name: data.name,
        device_id: data.device_id,
        location_id: data.location_id,
        is_active: data.is_active ?? true,
      }
    );
    return response.data;
  }

  /**
   * Get Yoco device
   */
  async getDevice(id: string): Promise<YocoDevice> {
    const response = await fetcher.get<{ data: YocoDevice }>(
      `/api/provider/yoco/devices/${id}`
    );
    return response.data;
  }

  /**
   * Update Yoco device
   */
  async updateDevice(id: string, data: Partial<YocoDevice>): Promise<YocoDevice> {
    const response = await fetcher.put<{ data: YocoDevice }>(
      `/api/provider/yoco/devices/${id}`,
      {
        name: data.name,
        location_id: data.location_id,
        is_active: data.is_active,
      }
    );
    return response.data;
  }

  /**
   * Delete Yoco device
   */
  async deleteDevice(id: string): Promise<void> {
    await fetcher.delete(`/api/provider/yoco/devices/${id}`);
  }

  /**
   * List Yoco payments
   */
  async listPayments(filters?: {
    status?: string;
    device_id?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: YocoPayment[]; total: number; page: number; limit: number }> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.device_id) params.set("device_id", filters.device_id);
    if (filters?.start_date) params.set("start_date", filters.start_date);
    if (filters?.end_date) params.set("end_date", filters.end_date);
    if (filters?.page) params.set("page", filters.page.toString());
    if (filters?.limit) params.set("limit", filters.limit.toString());

    const response = await fetcher.get<{
      data: YocoPayment[];
      meta: { total: number; page: number; limit: number };
    }>(`/api/provider/yoco/payments?${params.toString()}`);

    return {
      data: response.data || [],
      total: response.meta?.total || 0,
      page: response.meta?.page || 1,
      limit: response.meta?.limit || 50,
    };
  }

  /**
   * Create Yoco payment
   * 
   * Processes payment through physical Yoco terminal
   */
  async createPayment(data: {
    device_id: string;
    amount: number; // Amount in Rands (will be converted to cents)
    currency?: string;
    appointment_id?: string;
    sale_id?: string;
    metadata?: Record<string, any>;
  }): Promise<YocoPayment> {
    const response = await fetcher.post<{ data: YocoPayment }>(
      "/api/provider/yoco/payments",
      {
        device_id: data.device_id,
        amount: data.amount, // API will convert to cents
        currency: data.currency || "ZAR",
        appointment_id: data.appointment_id,
        sale_id: data.sale_id,
        metadata: data.metadata,
      }
    );
    return response.data;
  }

  /**
   * Get Yoco payment
   */
  async getPayment(id: string): Promise<YocoPayment> {
    const response = await fetcher.get<{ data: YocoPayment }>(
      `/api/provider/yoco/payments/${id}`
    );
    return response.data;
  }
}

export const yocoApi = new YocoApi();
