/**
 * Pinia store for the import/export feature.
 *
 * Ported from competo-fe `src/stores/import.ts`. Decoupled from the host app:
 * the concrete HTTP client is resolved through the {@link useImportApi}
 * adapter (the injected {@link ImportApiClient}) instead of a hardcoded SDK
 * singleton. All types come from `../types`; the API contract from `../api`.
 *
 * Behavior (state shape, polling cadence, blob download, error fallbacks) is
 * preserved 1:1 with the source. Contract method names differ from the source
 * SDK and are mapped accordingly:
 *   - `getMappings`         -> `listMappings`
 *   - `batchUpdateMappings` -> `updateMappingsBatch`
 *   - `exportData`          -> `exportModel`
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useImportApi } from '../adapters.js'
import type {
  APIImport,
  APIImportMapping,
  AllowedModel,
  ImportListParams,
  UpdateMappingPayload,
  BatchUpdateMappingsPayload,
} from '../types.js'
import { isTerminalImportStatus } from '../types.js'

export const useImportStore = defineStore('import', () => {
  // The injected API client (replaces the hardcoded `sdk.importAPI`).
  const api = useImportApi()

  // List state
  const imports = ref<APIImport[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const fetched = ref(false)
  const deleting = ref(false)

  // Pagination
  const currentPage = ref(1)
  const totalPages = ref(1)
  const perPage = ref(10)
  const totalItems = ref(0)

  // Filters
  const filterModel = ref('')
  const filterStatus = ref('')
  const searchQuery = ref('')

  // Allowed models
  const allowedModels = ref<AllowedModel[]>([])

  // Upload state
  const uploadProgress = ref(0)
  const uploading = ref(false)
  const currentImportSession = ref<APIImport | null>(null)

  // Mapping state
  const mappings = ref<APIImportMapping[]>([])
  const mappingsLoading = ref(false)

  // Polling
  let progressInterval: ReturnType<typeof setInterval> | null = null

  async function fetchAllowedModels() {
    try {
      const response = await api.getAllowedModels()
      allowedModels.value = Array.isArray(response.data) ? response.data : []
    } catch (e: any) {
      console.error('Failed to fetch allowed models:', e)
    }
  }

  async function fetchImports() {
    loading.value = true
    error.value = null
    try {
      const params: ImportListParams = {
        page: currentPage.value,
        per_page: perPage.value,
      }
      if (filterModel.value) params.model = filterModel.value
      if (filterStatus.value) params.status = filterStatus.value
      if (searchQuery.value) params.search = searchQuery.value

      const response = await api.listImports(params)
      imports.value = Array.isArray(response.data) ? response.data : []
      if (response.meta) {
        currentPage.value = response.meta.current_page
        totalPages.value = response.meta.last_page
        perPage.value = response.meta.per_page
        totalItems.value = response.meta.total
      }
      fetched.value = true
    } catch (e: any) {
      error.value = e?.response?.data?.message || e?.message || 'Dosyalar yüklenemedi'
      console.error('Failed to fetch imports:', e)
    } finally {
      loading.value = false
    }
  }

  async function initializeImport(model: string, file: File): Promise<APIImport | null> {
    uploading.value = true
    uploadProgress.value = 0
    error.value = null
    try {
      const formData = new FormData()
      formData.append('model', model)
      formData.append('file', file)

      const response = await api.initializeImport(formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            uploadProgress.value = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          }
        },
      })
      currentImportSession.value = response.data
      if (response.data?.mappings) {
        mappings.value = response.data.mappings
      }
      return response.data
    } catch (e: any) {
      error.value = e?.response?.data?.message || e?.message || 'Dosya yüklenemedi'
      console.error('Failed to initialize import:', e)
      return null
    } finally {
      uploading.value = false
    }
  }

  async function deleteImport(id: number): Promise<void> {
    deleting.value = true
    try {
      await api.deleteImport(id)
      imports.value = imports.value.filter((i) => i.id !== id)
      if (totalItems.value > 0) totalItems.value--
    } finally {
      deleting.value = false
    }
  }

  async function startImport(id: number): Promise<void> {
    try {
      await api.startImport(id)
      pollProgress(id)
    } catch (e: any) {
      error.value = e?.response?.data?.message || e?.message || 'Aktarım başlatılamadı'
      console.error('Failed to start import:', e)
    }
  }

  function pollProgress(id: number) {
    stopPolling()
    progressInterval = setInterval(async () => {
      try {
        const response = await api.getProgress(id)
        const progress = response.data
        if (currentImportSession.value && currentImportSession.value.id === id) {
          currentImportSession.value.status = progress.status
          currentImportSession.value.progress_percentage = Number(progress.progress_percentage) || 0
          currentImportSession.value.processed_rows = Number(progress.processed_rows) || 0
          currentImportSession.value.successful_rows = Number(progress.successful_rows) || 0
          currentImportSession.value.failed_rows = Number(progress.failed_rows) || 0
        }
        // Also update in the imports list
        const idx = imports.value.findIndex((i) => i.id === id)
        if (idx >= 0) {
          imports.value[idx] = {
            ...imports.value[idx],
            status: progress.status,
            progress_percentage: Number(progress.progress_percentage) || 0,
            processed_rows: Number(progress.processed_rows) || 0,
            successful_rows: Number(progress.successful_rows) || 0,
            failed_rows: Number(progress.failed_rows) || 0,
          }
        }
        // Stop on ANY terminal status — the backend also finalises to
        // `completed_with_errors` (rows failed) and `cancelled`; treating only
        // `completed`/`failed` as done left the row stuck on "processing" and
        // polling forever.
        if (isTerminalImportStatus(progress.status)) {
          stopPolling()
          await fetchImports()
        }
      } catch (e) {
        console.error('Failed to poll progress:', e)
        stopPolling()
      }
    }, 2000)
  }

  function stopPolling() {
    if (progressInterval) {
      clearInterval(progressInterval)
      progressInterval = null
    }
  }

  async function fetchMappings(id: number) {
    mappingsLoading.value = true
    try {
      const response = await api.listMappings(id)
      mappings.value = Array.isArray(response.data) ? response.data : []
    } catch (e: any) {
      console.error('Failed to fetch mappings:', e)
    } finally {
      mappingsLoading.value = false
    }
  }

  async function updateMapping(id: number, payload: UpdateMappingPayload) {
    try {
      await api.updateMapping(id, payload)
    } catch (e: any) {
      console.error('Failed to update mapping:', e)
    }
  }

  async function batchUpdateMappings(id: number, payload: BatchUpdateMappingsPayload) {
    try {
      await api.updateMappingsBatch(id, payload)
    } catch (e: any) {
      console.error('Failed to batch update mappings:', e)
    }
  }

  async function exportData(model: string) {
    try {
      const response = await api.exportModel(model)
      const blob = new Blob([response.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${model}-export.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      error.value = e?.response?.data?.message || e?.message || 'Dışa aktarma başarısız'
      console.error('Failed to export data:', e)
    }
  }

  async function exportFailures(id: number) {
    try {
      const response = await api.exportFailures(id)
      const blob = new Blob([response.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `import-${id}-failures.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      console.error('Failed to export failures:', e)
    }
  }

  function setPage(page: number) {
    currentPage.value = page
    fetchImports()
  }

  function setPerPage(count: number) {
    perPage.value = count
    currentPage.value = 1
    fetchImports()
  }

  function resetUpload() {
    uploadProgress.value = 0
    uploading.value = false
    currentImportSession.value = null
    mappings.value = []
  }

  return {
    imports,
    loading,
    error,
    fetched,
    deleting,
    allowedModels,
    currentPage,
    totalPages,
    perPage,
    totalItems,
    filterModel,
    filterStatus,
    searchQuery,
    uploadProgress,
    uploading,
    currentImportSession,
    mappings,
    mappingsLoading,
    fetchAllowedModels,
    fetchImports,
    initializeImport,
    deleteImport,
    startImport,
    pollProgress,
    stopPolling,
    fetchMappings,
    updateMapping,
    batchUpdateMappings,
    exportData,
    exportFailures,
    setPage,
    setPerPage,
    resetUpload,
  }
})
