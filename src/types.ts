/**
 * Import/Export domain types.
 *
 * Self-contained: no imports from any host application. These mirror the
 * payload/response shapes of the `umutcangungormus/laravel-import-export`
 * backend's `v1/imports` API. Ported from competo-fe `src/lib/sdk/types.ts`.
 */

// --- Generic API envelope ---

export interface PaginationMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface APIResponse<T = unknown> {
  status: number
  message: string
  data: T
  errors?: unknown
  meta?: PaginationMeta
}

// --- Status enums ---

/**
 * Lifecycle status of an import session. The backend returns a free-form
 * string; these are the known values. Kept as a union of string literals so
 * unknown future values still type-check via the fallback.
 */
export type ImportStatus =
  | 'pending'
  | 'mapping'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled'
  | (string & {})

/**
 * Statuses at which an import is finished. The backend can finalise to any of
 * these, so polling must stop — and the UI treat the row as done — on all of
 * them, not just `completed`/`failed`.
 */
export const TERMINAL_IMPORT_STATUSES = [
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
] as const

export function isTerminalImportStatus(status: string): boolean {
  return (TERMINAL_IMPORT_STATUSES as readonly string[]).includes(status)
}

/** How a column→field mapping was derived by the backend. */
export type MappingMatchMethod =
  | 'exact'
  | 'fuzzy'
  | 'alias'
  | 'manual'
  | 'none'
  | (string & {})

// --- Core resources ---

export interface APIImportMapping {
  id: number
  source_column: string
  target_field: string
  confidence_score: number
  match_method: MappingMatchMethod
  is_required: boolean
  is_confirmed: boolean
}

/**
 * An import session. Also referred to as `ImportSession`
 * (exported as an alias below) to match the backend nomenclature.
 */
export interface APIImport {
  id: number
  importable_type: string
  file_name: string
  status: ImportStatus
  total_rows: number
  processed_rows: number
  successful_rows: number
  failed_rows: number
  progress_percentage: number
  detected_headers: string[]
  started_at: string | null
  completed_at: string | null
  created_at: string
  mappings: APIImportMapping[]
}

/** Alias matching backend nomenclature. */
export type ImportSession = APIImport

export interface APIImportProgress {
  status: ImportStatus
  total_rows: string
  processed_rows: string
  successful_rows: string
  failed_rows: string
  progress_percentage: string
}

export interface APIImportTemplate {
  id: number
  importable_type: string
  template_name: string
  description: string
  is_default: boolean
  is_company_wide: boolean
  template_data: {
    mappings?: { source_column: string; target_field: string }[]
  } | null
  usage_count: number
  last_used_at: string | null
  created_at: string
}

export interface APIFailureSummary {
  total_failures: number
  error_types: string
}

export interface AllowedModel {
  model: string
  name: string
}

export interface MappingSuggestion {
  field: string
  label: string
  confidence: number
}

// --- Request params / payloads ---

export interface ImportListParams {
  page?: number
  per_page?: number
  model?: string
  status?: string
  search?: string
}

export interface InitializeImportPayload {
  model: string
  file: File
  options?: Record<string, unknown>
}

export interface UpdateMappingPayload {
  source_column: string
  target_field: string
  confirmed: boolean
}

export interface BatchUpdateMappingsPayload {
  columns: {
    source_column: string
    target_field: string
    confirmed: boolean
  }[]
}

export interface CreateImportTemplatePayload {
  model: string
  template_name: string
  description?: string
  is_default?: boolean
  is_company_wide?: boolean
  template_data: {
    mappings: { source_column: string; target_field: string }[]
  }
}

export interface UpdateImportTemplatePayload {
  template_name?: string
  description?: string
  is_default?: boolean
  is_company_wide?: boolean
}

export interface SaveTemplateFromSessionPayload {
  template_name: string
  description?: string
  is_default?: boolean
}

// --- Toast / notification contract (consumed by adapters) ---

export type NotifyType = 'success' | 'error' | 'info' | 'warning'

export interface NotifyPayload {
  type: NotifyType
  message: string
}
