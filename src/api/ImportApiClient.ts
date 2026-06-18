/**
 * The contract between this UI library and any backend implementation.
 *
 * The library's components/store depend ONLY on this interface, never on a
 * concrete HTTP client. A consumer may use {@link createAxiosImportClient}
 * (the default), or supply their own implementation (e.g. fetch-based, mocked
 * for tests, or an existing app SDK adapter).
 *
 * Derived from competo-fe `src/lib/sdk/import.ts` (`ImportAPI`).
 */
import type {
  APIResponse,
  APIImport,
  APIImportMapping,
  APIImportProgress,
  APIImportTemplate,
  APIFailureSummary,
  AllowedModel,
  MappingSuggestion,
  ImportListParams,
  UpdateMappingPayload,
  BatchUpdateMappingsPayload,
  CreateImportTemplatePayload,
  UpdateImportTemplatePayload,
  SaveTemplateFromSessionPayload,
} from '../types.js'

export interface ImportApiClient {
  /** Set/clear the bearer token used for authenticated requests. */
  setAuthToken?(token: string | null): void

  // --- Allowed models ---

  /** Models the backend permits importing/exporting. */
  getAllowedModels(): Promise<APIResponse<AllowedModel[]>>

  // --- Import sessions ---

  /** Paginated list of import sessions. */
  listImports(params?: ImportListParams): Promise<APIResponse<APIImport[]>>

  /**
   * Create a new import session by uploading a file. `formData` must contain
   * at least `model` and `file`. `config` carries transport options such as
   * upload-progress callbacks.
   */
  initializeImport(
    formData: FormData,
    config?: RequestConfig,
  ): Promise<APIResponse<APIImport>>

  /** Fetch a single import session. */
  getImport(id: number): Promise<APIResponse<APIImport>>

  /** Delete an import session. */
  deleteImport(id: number): Promise<APIResponse<null>>

  /** Begin processing a (mapped) import session. */
  startImport(id: number): Promise<APIResponse<null>>

  /** Cancel an in-flight import session. */
  cancelImport(id: number): Promise<APIResponse<null>>

  /** Poll processing progress for a session. */
  getProgress(id: number): Promise<APIResponse<APIImportProgress>>

  // --- Mappings ---

  /** List column→field mappings for a session. */
  listMappings(id: number): Promise<APIResponse<APIImportMapping[]>>

  /** Update a single mapping. */
  updateMapping(
    id: number,
    payload: UpdateMappingPayload,
  ): Promise<APIResponse<unknown>>

  /** Update many mappings in one request. */
  updateMappingsBatch(
    id: number,
    payload: BatchUpdateMappingsPayload,
  ): Promise<APIResponse<unknown>>

  /** Backend-suggested mappings (auto-detect). */
  mappingSuggestions(id: number): Promise<APIResponse<MappingSuggestion[]>>

  // --- Failures ---

  /** Aggregate failure stats for a completed/failed session. */
  failuresSummary(id: number): Promise<APIResponse<APIFailureSummary>>

  /** Download failed rows as a file (blob). */
  exportFailures(id: number): Promise<BlobResponse>

  // --- Export ---

  /** Export all records of a model as a file (blob). */
  exportModel(model: string): Promise<BlobResponse>

  // --- Templates ---

  /** List saved mapping templates. */
  listTemplates(): Promise<APIResponse<APIImportTemplate[]>>

  /** Create a template. */
  createTemplate(
    payload: CreateImportTemplatePayload,
  ): Promise<APIResponse<APIImportTemplate>>

  /** Fetch a single template. */
  getTemplate(id: number): Promise<APIResponse<APIImportTemplate>>

  /** Update a template. */
  updateTemplate(
    id: number,
    payload: UpdateImportTemplatePayload,
  ): Promise<APIResponse<APIImportTemplate>>

  /** Delete a template. */
  deleteTemplate(id: number): Promise<APIResponse<null>>

  /** Mark a template as the default for its model. */
  setDefaultTemplate(id: number): Promise<APIResponse<APIImportTemplate>>

  /** Persist the current session's mappings as a reusable template. */
  saveTemplate(
    sessionId: number,
    payload: SaveTemplateFromSessionPayload,
  ): Promise<APIResponse<APIImportTemplate>>

  /** Apply a saved template's mappings onto a session. */
  applyTemplate(
    sessionId: number,
    templateId: number,
  ): Promise<APIResponse<APIImport>>
}

/**
 * Transport-agnostic per-request options. Mirrors the subset of
 * `AxiosRequestConfig` the UI needs, without leaking axios into the contract.
 */
export interface RequestConfig {
  headers?: Record<string, string>
  params?: Record<string, unknown>
  signal?: AbortSignal
  onUploadProgress?: (event: {
    loaded: number
    total?: number
  }) => void
}

/** Result of a blob (file download) request. */
export interface BlobResponse {
  data: Blob
  status: number
  headers?: Record<string, string>
}
