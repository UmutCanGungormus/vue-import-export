<script setup lang="ts">
/**
 * ImportManager
 *
 * Self-contained orchestrator for the import workflow: file upload ->
 * column mapping -> processing (with live progress polling) -> a paginated,
 * filterable list of import sessions with per-row actions.
 *
 * Ported from competo-fe `src/views/FileManagementView.vue`. Decoupled from
 * the host app: no vue-router, no app SDK, no app i18n/toast singletons.
 *
 * - Navigation is the host's concern. This component is NOT a route view; it
 *   exposes a `navigate` event so the host decides where to go (e.g. back to
 *   a settings page). Optional `title` / `parents` props feed an optional
 *   header strip the host can drive.
 * - Data flows through the package's own Pinia store (`useImportStore`), which
 *   resolves its backend through the injected {@link ImportApiClient}.
 * - i18n via `useTranslate()`, notifications via `useNotify()` (adapters).
 * - Composes sibling components: UploadInput, ColumnMappingModal,
 *   ImportPagination, FileItem.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useImportStore } from '../stores/import.js'
import { useTranslate, useNotify } from '../adapters.js'
import type { APIImport } from '../types.js'
import UploadInput, { type UploadValue } from './UploadInput.vue'
import ColumnMappingModal from './ColumnMappingModal.vue'
import ImportPagination from './ImportPagination.vue'
import FileItem from './FileItem.vue'
import {
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
} from '@heroicons/vue/24/outline'
import { CloudArrowUpIcon, CheckCircleIcon } from '@heroicons/vue/24/solid'

// --- Props: initial state the host can seed the orchestrator with ---

interface NavigationParent {
  /** Display label for the breadcrumb/back target. */
  label: string
  /** Opaque navigation target handed back to the host via `navigate`. */
  route: string
}

const props = withDefaults(
  defineProps<{
    /** Optional title rendered in the header strip. */
    title?: string
    /** Optional breadcrumb parents; surfaced to the host via `navigate`. */
    parents?: NavigationParent[]
    /** Pre-select a module/model in the filter + upload selectors. */
    initialModel?: string
    /** Pre-set the status filter. */
    initialStatus?: string
    /** Pre-set the free-text search query. */
    initialSearch?: string
    /** Whether to fetch data on mount. Defaults to true. */
    autoFetch?: boolean
    /** Default model used for the "Export all" action when no filter is set. */
    defaultExportModel?: string
  }>(),
  {
    title: '',
    parents: () => [],
    initialModel: '',
    initialStatus: '',
    initialSearch: '',
    autoFetch: true,
    defaultExportModel: 'App\\Models\\User',
  },
)

// --- Events: the host owns navigation + side-effect notifications ---

const emit = defineEmits<{
  /** Host should navigate to `route` (e.g. breadcrumb home / back). */
  navigate: [payload: { route: string }]
  /** A file finished uploading + a session was created (mapping pending). */
  uploaded: [session: APIImport]
  /** An import session was deleted. */
  deleted: [id: number]
  /** An import session began processing. */
  started: [id: number]
  /** A recoverable error surfaced (also shown via notify). */
  error: [message: string]
}>()

const t = useTranslate()
const notify = useNotify()
const importStore = useImportStore()

// `selectedFile` can be a raw File or the UploadInput payload wrapper.
const selectedFile = ref<UploadValue>(null)
const selectedModule = ref<string>(props.initialModel)
const showMappingModal = ref(false)
const showDeleteModal = ref(false)
const deletingItem = ref<APIImport | null>(null)
const startingImport = ref(false)
const uploadInputRef = ref<InstanceType<typeof UploadInput> | null>(null)

let searchDebounce: ReturnType<typeof setTimeout> | null = null

// --- Module label localization ---------------------------------------------
// Translate a backend model identifier (e.g. "App\\Models\\User" or the
// human-ish "name" the API returns, like "User") into a localized label.
// Falls back to the original backend name when no translation key matches so
// that an unmapped module never renders blank.
function moduleI18nKey(raw: string): string {
  if (!raw) return ''
  const last = raw.split('\\').pop() || raw
  return last
    .replace(/[\s-]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

function moduleFriendlyLabel(model: string, fallback?: string): string {
  const key = `importModule.${moduleI18nKey(model)}`
  const localized = t(key)
  if (localized && localized !== key) return localized
  // Try the second variant key (the API's "name" field), so a backend that
  // returns "Smart Interview" still resolves via importModule.smart_interview.
  if (fallback) {
    const fbKey = `importModule.${moduleI18nKey(fallback)}`
    const fbLocalized = t(fbKey)
    if (fbLocalized && fbLocalized !== fbKey) return fbLocalized
    return fallback
  }
  return model
}

const moduleOptions = computed(() =>
  importStore.allowedModels.map((m) => ({
    value: m.model,
    label: moduleFriendlyLabel(m.model, m.name),
  })),
)

const statusOptions = computed(() => [
  { value: 'pending', label: t('pending', { default: 'Bekliyor' }) },
  { value: 'mapping', label: t('mapping', { default: 'Eşleştirme' }) },
  { value: 'processing', label: t('processing', { default: 'İşleniyor' }) },
  { value: 'completed', label: t('completed', { default: 'Tamamlandı' }) },
  {
    value: 'completed_with_errors',
    label: t('completedWithErrors', { default: 'Hatalarla tamamlandı' }),
  },
  { value: 'failed', label: t('failed', { default: 'Başarısız' }) },
  { value: 'cancelled', label: t('cancelled', { default: 'İptal edildi' }) },
])

const hasActiveFilters = computed(
  () =>
    !!importStore.filterModel ||
    !!importStore.filterStatus ||
    !!importStore.searchQuery,
)

const deleteConfirmMessage = computed(() => {
  if (deletingItem.value) {
    return `"${deletingItem.value.file_name}" ${t('deleteFileDesc', { default: 'kalıcı olarak silinecek.' })}`
  }
  return t('deleteFileConfirm', { default: 'Bu dosyayı silmek istediğinize emin misiniz?' })
})

// --- Uploading file display info --------------------------------------------

const uploadingFileName = computed(() => {
  const f = selectedFile.value as
    | File
    | { file?: File; name?: string }
    | null
  if (!f) return ''
  if (f instanceof File) return f.name
  return f.file?.name || f.name || ''
})

const uploadingFileSize = computed(() => {
  const f = selectedFile.value as
    | File
    | { file?: File; size?: number }
    | null
  let size = 0
  if (f instanceof File) size = f.size
  else if (f?.file) size = f.file.size
  else if (f?.size) size = f.size
  if (size === 0) return ''
  const mb = size / (1024 * 1024)
  return `${mb.toFixed(1)} MB of 16 MB`
})

const uploadingFileExt = computed(
  () => uploadingFileName.value?.split('.').pop()?.toUpperCase() || 'FILE',
)

const uploadingFileBadgeColor = computed(() =>
  getFileBadgeColor(uploadingFileName.value),
)

// --- Lifecycle ---------------------------------------------------------------

onMounted(async () => {
  // Seed filter state from props before the first fetch.
  if (props.initialModel) importStore.filterModel = props.initialModel
  if (props.initialStatus) importStore.filterStatus = props.initialStatus
  if (props.initialSearch) importStore.searchQuery = props.initialSearch

  if (!props.autoFetch) return

  importStore.fetchAllowedModels()
  await importStore.fetchImports()
  // Resume polling for any processing imports.
  const processingItem = importStore.imports.find(
    (i) => i.status === 'processing',
  )
  if (processingItem) {
    importStore.pollProgress(processingItem.id)
  }
})

onUnmounted(() => {
  importStore.stopPolling()
  if (searchDebounce) clearTimeout(searchDebounce)
})

// --- Navigation (delegated to host) -----------------------------------------

function onNavigate(route: string) {
  emit('navigate', { route })
}

// --- Upload flow -------------------------------------------------------------

async function handleUpload() {
  if (!selectedModule.value || !selectedFile.value) return

  const candidate = selectedFile.value as
    | File
    | { file?: File }
    | null
  const file =
    candidate instanceof File
      ? candidate
      : candidate?.file || (candidate as File)

  if (!file || !(file instanceof File)) return

  // Step 1: Initialize import (upload file).
  const result = await importStore.initializeImport(selectedModule.value, file)
  if (!result) {
    if (importStore.error) reportError(importStore.error)
    return
  }

  // Step 2: Fetch mappings if not already in response.
  if (!importStore.mappings.length && result.id) {
    await importStore.fetchMappings(result.id)
  }

  // Step 3: Open mapping modal.
  showMappingModal.value = true
  selectedFile.value = null
  emit('uploaded', result)
}

function cancelUpload() {
  importStore.resetUpload()
  selectedFile.value = null
}

async function handleStartImport(mappingsData: Record<string, string>) {
  const sessionId = importStore.currentImportSession?.id
  if (!sessionId) return

  startingImport.value = true
  try {
    // Step 1: Save confirmed mappings.
    const columns = Object.entries(mappingsData).map(
      ([target_field, source_column]) => ({
        source_column,
        target_field,
        confirmed: true,
      }),
    )
    await importStore.batchUpdateMappings(sessionId, { columns })

    // Step 2: Start import processing.
    await importStore.startImport(sessionId)
    notify({ type: 'success', message: t('importStarted', { default: 'Aktarım başlatıldı' }) })
    showMappingModal.value = false
    importStore.resetUpload()
    await importStore.fetchImports()
    emit('started', sessionId)
  } catch (e) {
    reportError(extractError(e))
  } finally {
    startingImport.value = false
  }
}

function handleCloseMappingModal() {
  showMappingModal.value = false
  importStore.resetUpload()
}

// --- Filters -----------------------------------------------------------------

function handleFilterChange() {
  importStore.currentPage = 1
  importStore.fetchImports()
}

function handleSearchChange() {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    importStore.currentPage = 1
    importStore.fetchImports()
  }, 400)
}

// --- Row actions -------------------------------------------------------------

function handleDownload(item: APIImport) {
  importStore.exportFailures(item.id)
}

function confirmDelete(item: APIImport) {
  deletingItem.value = item
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
  deletingItem.value = null
}

async function handleDelete() {
  if (!deletingItem.value) return
  const id = deletingItem.value.id
  try {
    await importStore.deleteImport(id)
    notify({ type: 'success', message: t('fileDeleted', { default: 'Dosya silindi' }) })
    emit('deleted', id)
  } catch (e) {
    reportError(extractError(e))
  } finally {
    closeDeleteModal()
  }
}

/** Guards against a second export while the first download is still resolving. */
const exporting = ref(false)

async function handleExport() {
  if (exporting.value) return

  exporting.value = true
  try {
    const model = importStore.filterModel || props.defaultExportModel
    await importStore.exportData(model)
    notify({ type: 'success', message: t('exportStarted', { default: 'Dışa aktarma başlatıldı' }) })
  } finally {
    exporting.value = false
  }
}

// --- Error helpers -----------------------------------------------------------

function extractError(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } }; message?: string }
  return (
    err?.response?.data?.message ||
    err?.message ||
    t('error', { default: 'Bir hata oluştu' })
  )
}

function reportError(message: string) {
  notify({ type: 'error', message })
  emit('error', message)
}

// --- Presentation helpers ----------------------------------------------------

function getFileBadgeColor(filename: string): string {
  const ext = filename?.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
      return 'bg-[#EF4444]'
    case 'xlsx':
    case 'xls':
      return 'bg-[#10B981]'
    case 'docx':
    case 'doc':
      return 'bg-[#3B82F6]'
    case 'png':
    case 'jpg':
    case 'jpeg':
      return 'bg-[#8B5CF6]'
    default:
      return 'bg-[#6B7280]'
  }
}

function getModuleLabel(importableType: string): string {
  // Prefer the localized label from moduleOptions (already cooked for known
  // backend models); fall back to a direct translation lookup so historical
  // rows whose model is no longer in allowedModels still render localized.
  const found = moduleOptions.value.find((o) => o.value === importableType)
  if (found) return found.label
  return moduleFriendlyLabel(importableType)
}

function getStatusLabel(status: string): string {
  const found = statusOptions.value.find((o) => o.value === status)
  return found?.label || status
}
</script>

<template>
  <div class="vie-import-manager">
    <!-- Optional header strip. Navigation is delegated to the host via the
         `navigate` event; this component never imports a router. -->
    <div v-if="title || parents.length" class="mb-8">
      <nav
        v-if="parents.length"
        class="flex items-center gap-1.5 text-sm text-[#9AA4B2] mb-2"
        :aria-label="t('breadcrumb', { default: 'Breadcrumb' })"
      >
        <template v-for="(parent, idx) in parents" :key="parent.route">
          <button
            class="hover:text-[#3344ee] transition"
            type="button"
            @click="onNavigate(parent.route)"
          >
            {{ parent.label }}
          </button>
          <span v-if="idx < parents.length - 1" aria-hidden="true">/</span>
        </template>
        <span v-if="title" aria-hidden="true">/</span>
        <span v-if="title" class="text-[#364152] font-medium">{{ title }}</span>
      </nav>
      <h1 v-if="title" class="text-xl font-semibold text-[#101828]">{{ title }}</h1>
    </div>

    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <!-- Upload Section -->
      <div class="px-6 py-5 border-b border-gray-200">
        <div class="flex flex-col lg:flex-row gap-6">
          <!-- Upload Input -->
          <div class="flex-1">
            <!-- Uploading State -->
            <div
              v-if="importStore.uploading"
              class="w-full p-4 bg-white rounded-xl border border-[#E5E7EB]"
            >
              <div class="flex justify-between items-start">
                <div class="flex gap-3 flex-1">
                  <div class="w-10 h-12 flex items-center justify-center flex-shrink-0">
                    <span
                      :class="[
                        uploadingFileBadgeColor,
                        'text-white text-[10px] font-semibold px-2 py-[2px] rounded-md',
                      ]"
                    >
                      {{ uploadingFileExt }}
                    </span>
                  </div>
                  <div class="flex flex-col w-full min-w-0">
                    <p class="text-[#364152] text-sm font-medium text-left truncate">
                      {{ uploadingFileName }}
                    </p>
                    <p class="text-xs text-[#4B5565] flex items-center gap-1 mt-0.5">
                      {{ uploadingFileSize }}
                      <span class="mx-1 w-px h-3 bg-[#D0D5DD] inline-block"></span>
                      <span
                        v-if="importStore.uploadProgress < 100"
                        class="text-[#98A2B3] flex items-center gap-1"
                      >
                        <CloudArrowUpIcon class="w-4 h-4" />
                        {{ t('uploadingFile', { default: 'Yükleniyor' }) }}
                      </span>
                      <span
                        v-else
                        class="text-[#079455] font-medium flex items-center gap-1"
                      >
                        <CheckCircleIcon class="w-4 h-4" />
                        {{ t('uploadComplete', { default: 'Yükleme tamamlandı' }) }}
                      </span>
                    </p>
                    <div class="flex items-center gap-2 mt-2 w-full">
                      <div class="flex-1 h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
                        <div
                          class="h-full bg-[#4F74E3] transition-all duration-300 rounded-full"
                          :style="{ width: importStore.uploadProgress + '%' }"
                        ></div>
                      </div>
                      <p class="text-sm text-[#364152] w-[35px] text-right">
                        {{ importStore.uploadProgress }}%
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  class="text-[#98A2B3] hover:text-red-500 transition ml-3 mt-1"
                  :aria-label="t('cancel', { default: 'İptal' })"
                  @click="cancelUpload"
                >
                  <TrashIcon class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Normal Upload Input -->
            <UploadInput
              v-else
              ref="uploadInputRef"
              v-model="selectedFile"
              :accept="'.pdf,.docx,.xlsx,.csv'"
              :formatInfo="'.pdf .docx .xlsx .csv - Max 16MB'"
              :instantUpload="true"
              height="160px"
            />
          </div>

          <!-- Module Selector + Upload Button -->
          <div class="w-full lg:w-64 flex flex-col gap-4">
            <select
              v-model="selectedModule"
              class="h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white text-[#364152] focus:outline-none focus:ring-1 focus:ring-[#3344ee] focus:border-[#3344ee] cursor-pointer"
              :aria-label="t('selectModule', { default: 'Modül seçin' })"
            >
              <option value="" disabled>
                {{ t('selectModule', { default: 'Modül seçin' }) }}
              </option>
              <option v-for="opt in moduleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium rounded-lg transition"
              :class="[
                !selectedModule || !selectedFile || importStore.uploading
                  ? 'border border-gray-200 text-[#9AA4B2] cursor-not-allowed opacity-50'
                  : 'bg-[#3344ee] text-white hover:bg-[#2a37c4]',
              ]"
              :disabled="!selectedModule || !selectedFile || importStore.uploading"
              @click="handleUpload"
            >
              <ArrowUpTrayIcon class="w-4 h-4" />
              {{
                importStore.uploading
                  ? t('uploadingFile', { default: 'Yükleniyor' })
                  : t('upload', { default: 'Yükle' })
              }}
            </button>

            <!--
              Exporting reads model data, which has nothing to do with how many
              import sessions the table below happens to list. Kept in this
              always-rendered column so no row count or filter can hide it.
            -->
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium text-[#4B5565] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              :disabled="exporting"
              @click="handleExport"
            >
              <ArrowDownTrayIcon class="w-4 h-4" />
              {{
                exporting
                  ? t('exportingData', { default: 'Dışa aktarılıyor' })
                  : t('export', { default: 'Dışa aktar' })
              }}
            </button>
          </div>
        </div>
      </div>

      <!-- Initial Loading -->
      <div v-if="importStore.loading && !importStore.fetched" class="px-6 py-8">
        <div class="space-y-3 animate-pulse">
          <div v-for="n in 5" :key="n" class="h-10 bg-gray-100 rounded"></div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="importStore.fetched && importStore.imports.length === 0 && !hasActiveFilters"
        class="py-16 text-center"
      >
        <!-- Dotted circle illustration -->
        <div class="relative w-24 h-24 mx-auto mb-6">
          <svg class="w-24 h-24 text-gray-200" viewBox="0 0 96 96" fill="none">
            <circle
              cx="48"
              cy="48"
              r="44"
              stroke="currentColor"
              stroke-width="2"
              stroke-dasharray="6 4"
            />
            <circle
              cx="48"
              cy="48"
              r="32"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-dasharray="4 4"
            />
            <circle
              cx="48"
              cy="48"
              r="20"
              stroke="currentColor"
              stroke-width="1"
              stroke-dasharray="3 3"
            />
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <MagnifyingGlassIcon class="w-6 h-6 text-gray-400" />
            </div>
          </div>
        </div>
        <h3 class="text-base font-semibold text-[#364152] mb-2">
          {{ t('noFilesUploaded', { default: 'Henüz dosya yüklenmedi' }) }}
        </h3>
        <p class="text-sm text-[#9AA4B2] max-w-sm mx-auto leading-relaxed">
          {{ t('noFilesUploadedDesc', { default: 'Başlamak için bir dosya yükleyin.' }) }}
        </p>
      </div>

      <!-- Content: Filters + Table (show filters even with empty filtered results) -->
      <template
        v-if="importStore.fetched && (importStore.imports.length > 0 || hasActiveFilters)"
      >
        <!-- Filter Bar -->
        <div class="px-6 py-3 border-b border-gray-200 flex flex-col sm:flex-row gap-3">
          <div class="w-full sm:w-48">
            <select
              v-model="importStore.filterModel"
              class="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white text-[#364152] focus:outline-none focus:ring-1 focus:ring-[#3344ee] focus:border-[#3344ee] cursor-pointer"
              :aria-label="t('module', { default: 'Modül' })"
              @change="handleFilterChange"
            >
              <option value="">{{ t('module', { default: 'Modül' }) }}</option>
              <option v-for="opt in moduleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="w-full sm:w-48">
            <select
              v-model="importStore.filterStatus"
              class="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white text-[#364152] focus:outline-none focus:ring-1 focus:ring-[#3344ee] focus:border-[#3344ee] cursor-pointer"
              :aria-label="t('status', { default: 'Durum' })"
              @change="handleFilterChange"
            >
              <option value="">{{ t('status', { default: 'Durum' }) }}</option>
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="flex-1 relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <MagnifyingGlassIcon class="w-4 h-4 text-[#9AA4B2]" />
            </span>
            <input
              v-model="importStore.searchQuery"
              type="text"
              class="w-full h-10 pl-9 pr-9 text-sm border border-gray-200 rounded-lg bg-white text-[#364152] placeholder-[#9AA4B2] focus:outline-none focus:ring-1 focus:ring-[#3344ee] focus:border-[#3344ee]"
              :placeholder="t('searchFiles', { default: 'Dosya ara' })"
              :aria-label="t('searchFiles', { default: 'Dosya ara' })"
              @input="handleSearchChange"
            />
            <button
              v-if="importStore.searchQuery"
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-[#9AA4B2] hover:text-[#364152]"
              :aria-label="t('clear', { default: 'Temizle' })"
              @click="
                importStore.searchQuery = '';
                handleSearchChange()
              "
            >
              ×
            </button>
          </div>
        </div>

        <!-- Table Header -->
        <div class="px-6 py-3 border-b border-gray-200">
          <h3 class="text-sm font-semibold text-[#364152]">
            {{ t('uploadedFiles', { default: 'Yüklenen dosyalar' }) }}
          </h3>
        </div>

        <!-- Loading -->
        <div v-if="importStore.loading" class="px-6 py-8">
          <div class="space-y-3 animate-pulse">
            <div v-for="n in 5" :key="n" class="h-10 bg-gray-100 rounded"></div>
          </div>
        </div>

        <!-- No results after filtering -->
        <div v-else-if="importStore.imports.length === 0" class="py-12 text-center">
          <MagnifyingGlassIcon class="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p class="text-sm text-[#9AA4B2]">
            {{ t('noResultsFound', { default: 'Sonuç bulunamadı' }) }}
          </p>
        </div>

        <!-- Table -->
        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-[#4B5565] uppercase tracking-wider"
                >
                  {{ t('fileName', { default: 'Dosya adı' }) }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-[#4B5565] uppercase tracking-wider"
                >
                  {{ t('module', { default: 'Modül' }) }}
                  <ChevronDownIcon class="w-3 h-3 inline-block ml-0.5 text-[#9AA4B2]" />
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-[#4B5565] uppercase tracking-wider"
                >
                  {{ t('uploader', { default: 'Yükleyen' }) }}
                  <ChevronDownIcon class="w-3 h-3 inline-block ml-0.5 text-[#9AA4B2]" />
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-[#4B5565] uppercase tracking-wider"
                >
                  {{ t('date', { default: 'Tarih' }) }}
                  <ChevronDownIcon class="w-3 h-3 inline-block ml-0.5 text-[#9AA4B2]" />
                </th>
                <th
                  class="px-6 py-3 text-right text-xs font-medium text-[#4B5565] uppercase tracking-wider w-[100px]"
                ></th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-100">
              <FileItem
                v-for="item in importStore.imports"
                :key="item.id"
                :item="item"
                :module-label="getModuleLabel(item.importable_type)"
                :status-label="getStatusLabel(item.status)"
                @download="handleDownload"
                @delete="confirmDelete"
              />
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <ImportPagination
          v-if="importStore.imports.length > 0"
          :current-page="importStore.currentPage"
          :total-pages="importStore.totalPages"
          :per-page="importStore.perPage"
          :total-items="importStore.totalItems"
          @update:current-page="importStore.setPage"
          @update:per-page="importStore.setPerPage"
        />
      </template>
    </div>

    <!-- Column Mapping Modal -->
    <ColumnMappingModal
      :show="showMappingModal"
      :import-id="importStore.currentImportSession?.id ?? null"
      :mappings="importStore.mappings"
      :detected-headers="importStore.currentImportSession?.detected_headers ?? []"
      :loading="startingImport"
      @close="handleCloseMappingModal"
      @start="handleStartImport"
    />

    <!-- Delete Confirmation Modal -->
    <div
      v-if="showDeleteModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
        <h3 class="text-base font-semibold text-[#101828] mb-2">
          {{ t('delete', { default: 'Sil' }) }}
        </h3>
        <p class="text-sm text-[#4B5565] mb-6">{{ deleteConfirmMessage }}</p>
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="h-10 px-4 text-sm font-medium text-[#4B5565] border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            :disabled="importStore.deleting"
            @click="closeDeleteModal"
          >
            {{ t('cancel', { default: 'İptal' }) }}
          </button>
          <button
            type="button"
            class="h-10 px-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-60"
            :disabled="importStore.deleting"
            @click="handleDelete"
          >
            {{ t('delete', { default: 'Sil' }) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
