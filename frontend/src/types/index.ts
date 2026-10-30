export interface UserProfile {
  id: string;
  name: string;
  role: "analyst" | "admin";
  roleLabel: string;
  avatar: string;
}

export interface Store {
  id: number;
  store_code: string;
  name: string;
  country_code: string;
  active: boolean;
  pricing_count?: number;
  created_at: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  active: boolean;
  created_at: string;
}

export interface AuditRecord {
  id: number;
  actor_id: string;
  action: string;
  entity_key: string;
  before_value: Record<string, any> | null;
  after_value: Record<string, any> | null;
  source: string;
  correlation_id: string | null;
  created_at: string;
}

export interface PricingItem {
  id: number;
  store_id: number;
  store_code: string;
  store_name: string;
  product_id: number;
  product_sku: string;
  product_name: string;
  country_code: string;
  currency_code: string;
  price: string;
  version: number;
  active: boolean;
  updated_at: string;
  updated_by: string;
  recent_audits?: AuditRecord[];
}

export interface ImportJob {
  id: string;
  original_filename: string;
  storage_key: string;
  status:
    | "UPLOADED"
    | "VALIDATING"
    | "AWAITING_CONFIRMATION"
    | "APPLYING"
    | "COMPLETED"
    | "COMPLETED_WITH_ERRORS"
    | "COMPLETED_WITH_CONFLICTS"
    | "FAILED"
    | "CANCELLED";
  created_by: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  applied_rows: number;
  conflicted_rows: number;
  failure_summary: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

export interface ImportErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export interface ImportRow {
  id: number;
  import_job_id: string;
  row_number: number;
  store_code: string | null;
  product_sku: string | null;
  country_code: string | null;
  currency_code: string | null;
  price: string | null;
  raw_data: Record<string, any>;
  status: "PENDING" | "VALID" | "INVALID" | "APPLIED" | "CONFLICT" | "SKIPPED";
  errors: ImportErrorDetail[] | null;
  expected_version: number | null;
  applied_at: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ConcurrencyConflictDetails {
  id: number;
  current_price: string;
  current_version: number;
  updated_at?: string;
  updated_by?: string;
}
