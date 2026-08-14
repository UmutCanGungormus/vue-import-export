/**
 * @umut-can-gungormus/vue-import-export
 *
 * Public entry point. Re-exports the contract layer (types, API interface +
 * default factory, adapters/composables, plugin), the Vue components, and the
 * Pinia store.
 */

// --- Domain types ---
export type {
  PaginationMeta,
  APIResponse,
  ImportStatus,
  MappingMatchMethod,
  APIImportMapping,
  APIImportField,
  APIImport,
  ImportSession,
  ImportSessionMeta,
  APIImportProgress,
  APIImportTemplate,
  APIFailureSummary,
  AllowedModel,
  MappingSuggestion,
  ImportListParams,
  InitializeImportPayload,
  UpdateMappingPayload,
  MappingColumnUpdate,
  BatchUpdateMappingsPayload,
  CreateImportTemplatePayload,
  UpdateImportTemplatePayload,
  SaveTemplateFromSessionPayload,
  NotifyType,
  NotifyPayload,
} from './types.js'

// --- API contract + default implementation ---
export type {
  ImportApiClient,
  RequestConfig,
  BlobResponse,
} from './api/ImportApiClient.js'
export {
  createAxiosImportClient,
  type CreateAxiosImportClientOptions,
} from './api/createAxiosImportClient.js'

// --- Adapters / composables ---
export {
  IMPORT_API_KEY,
  TRANSLATE_KEY,
  NOTIFY_KEY,
  defaultTranslate,
  defaultNotify,
  useImportApi,
  useTranslate,
  useNotify,
  type TranslateFn,
  type NotifyFn,
} from './adapters.js'

// --- Plugin ---
export {
  createImportExport,
  resolveImportApi,
  type CreateImportExportOptions,
} from './plugin.js'

// --- Components ---
export {
  UploadInput,
  LogoUploadInput,
  FileItem,
  ImportPagination,
  ColumnMappingModal,
  ImportManager,
} from './components/index.js'

// --- Store ---
export { useImportStore } from './stores/index.js'
