import {
  PricingItem,
  ImportJob,
  ImportRow,
  PaginatedResponse,
  Store,
  Product,
  ConcurrencyConflictDetails,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  status: number;
  code: string;
  details: any;

  constructor(status: number, message: string, code: string = "API_ERROR", details: any = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ConcurrencyConflictException extends ApiError {
  conflictDetails: ConcurrencyConflictDetails;

  constructor(message: string, details: ConcurrencyConflictDetails) {
    super(409, message, "CONCURRENCY_CONFLICT", details);
    this.name = "ConcurrencyConflictException";
    this.conflictDetails = details;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // response wasn't json
    }

    const err = errorData?.error || {};
    const message = err.message || response.statusText || "Request failed";
    const code = err.code || "HTTP_ERROR";

    if (response.status === 409) {
      throw new ConcurrencyConflictException(message, err.details);
    }

    throw new ApiError(response.status, message, code, err.details);
  }

  return response.json();
}

export const api = {
  // Health
  getHealthLive: () => request<{ status: string; service: string }>("/api/v1/health/live"),
  getHealthReady: () => request<{ status: string; database: string; redis: string }>("/api/v1/health/ready"),

  // Stores & Products
  getStores: (includeInactive: boolean = true) =>
    request<Store[]>(`/api/v1/stores?include_inactive=${includeInactive}`),

  createStore: (
    data: { store_code: string; name: string; country_code: string; active?: boolean },
    actorId: string = "system-admin"
  ) =>
    request<Store>("/api/v1/stores", {
      method: "POST",
      headers: { "x-actor-id": actorId },
      body: JSON.stringify(data),
    }),

  updateStore: (
    id: number,
    data: { name?: string; country_code?: string; active?: boolean },
    actorId: string = "system-admin"
  ) =>
    request<Store>(`/api/v1/stores/${id}`, {
      method: "PATCH",
      headers: { "x-actor-id": actorId },
      body: JSON.stringify(data),
    }),

  getProducts: () => request<Product[]>("/api/v1/products"),

  // Pricing
  getPricing: (params: {
    q?: string;
    store_code?: string;
    sku?: string;
    country_code?: string;
    min_price?: number;
    max_price?: number;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.set("q", params.q);
    if (params.store_code) searchParams.set("store_code", params.store_code);
    if (params.sku) searchParams.set("sku", params.sku);
    if (params.country_code) searchParams.set("country_code", params.country_code);
    if (params.min_price !== undefined) searchParams.set("min_price", params.min_price.toString());
    if (params.max_price !== undefined) searchParams.set("max_price", params.max_price.toString());
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    return request<PaginatedResponse<PricingItem>>(`/api/v1/pricing?${searchParams.toString()}`);
  },

  getPricingById: (id: number) => request<PricingItem>(`/api/v1/pricing/${id}`),

  updatePricing: (id: number, price: number, expectedVersion: number) =>
    request<PricingItem>(`/api/v1/pricing/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        price,
        expected_version: expectedVersion,
      }),
    }),

  // Imports
  uploadCsv: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<ImportJob>("/api/v1/imports", {
      method: "POST",
      body: formData,
    });
  },

  getImportJobs: (params: { status?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set("status", params.status);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());
    return request<PaginatedResponse<ImportJob>>(`/api/v1/imports?${searchParams.toString()}`);
  },

  getImportJob: (id: string) => request<ImportJob>(`/api/v1/imports/${id}`),

  getImportRows: (
    jobId: string,
    params: { status?: string; page?: number; limit?: number }
  ) => {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set("status", params.status);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());
    return request<PaginatedResponse<ImportRow>>(`/api/v1/imports/${jobId}/rows?${searchParams.toString()}`);
  },

  confirmImport: (jobId: string, selectedRowIds?: number[]) =>
    request<{ job_id: string; status: string; message: string; selected_rows_count?: number }>(`/api/v1/imports/${jobId}/confirm`, {
      method: "POST",
      body: JSON.stringify(selectedRowIds && selectedRowIds.length > 0 ? { selected_row_ids: selectedRowIds } : {}),
    }),

  cancelImport: (jobId: string) =>
    request<{ job_id: string; status: string; message: string }>(`/api/v1/imports/${jobId}/cancel`, {
      method: "POST",
    }),
};
