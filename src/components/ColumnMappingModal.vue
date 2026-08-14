<template>
  <!-- Backdrop -->
  <Transition name="vie-modal-overlay" appear>
    <div
      v-if="show"
      class="fixed inset-0 z-50"
      style="background: rgba(30, 41, 59, 0.1)"
      @mousedown="onBackdropMousedown"
      @click="onBackdropClick"
    ></div>
  </Transition>

  <!-- Content -->
  <Transition name="vie-modal-content" appear>
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      :aria-label="t('columnMapping', { default: 'Column mapping' })"
      @mousedown="onBackdropMousedown"
      @click="onBackdropClick"
    >
      <!--
        Propagation is deliberately not stopped here: SelectInput closes itself
        from a document-level click listener, so a `.stop` on this wrapper left
        every row's dropdown open at once, stacked on top of each other. The
        backdrop still only closes on a press that both started and ended on it
        (see onBackdropMousedown / onBackdropClick), so letting clicks bubble
        does not close the modal.
      -->
      <div class="w-full max-w-4xl">
        <div
          ref="modalContentRef"
          class="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]"
        >
          <!-- Header -->
          <div class="flex-shrink-0">
            <div class="relative px-4 pt-4 pb-2">
              <button
                type="button"
                class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
                :aria-label="t('close', { default: 'Close' })"
                @click="emit('close')"
              >
                <span class="text-2xl leading-none">&times;</span>
              </button>
            </div>
            <div class="px-4 text-start flex flex-col gap-2">
              <p class="text-[#111927] text-sm font-semibold leading-5">
                {{ t('columnMapping', { default: 'Column mapping' }) }}
              </p>
              <p class="text-[#4B5565] text-sm leading-5">
                {{ t('columnMappingDesc', { default: 'Match the columns in your file to the system fields.' }) }}
              </p>
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 flex flex-col overflow-y-auto min-h-0">
            <div class="px-6 py-4 overflow-y-auto max-h-[60vh]">
              <!-- Search + scope -->
              <div class="flex flex-wrap items-center gap-2 mb-3">
                <div class="relative flex-1 min-w-[180px]">
                  <MagnifyingGlassIcon
                    class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9AA4B2]"
                  />
                  <input
                    v-model="search"
                    type="text"
                    class="w-full h-9 pl-8 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#3344ee] focus:border-[#3344ee]"
                    :placeholder="t('searchFields', { default: 'Search fields' })"
                    data-testid="field-search"
                  />
                </div>
                <div class="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                  <button
                    type="button"
                    class="px-2.5 py-2 transition"
                    :class="filterMode === 'relevant' ? 'bg-[#EFF4FF] text-[#3344ee] font-semibold' : 'bg-white text-[#4B5565]'"
                    data-testid="filter-relevant"
                    @click="filterMode = 'relevant'"
                  >
                    {{ t('relevantFields', { default: 'Mapped + required' }) }}
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-2 border-l border-gray-200 transition"
                    :class="filterMode === 'all' ? 'bg-[#EFF4FF] text-[#3344ee] font-semibold' : 'bg-white text-[#4B5565]'"
                    data-testid="filter-all"
                    @click="filterMode = 'all'"
                  >
                    {{ t('allFields', { default: 'All fields' }) }}
                  </button>
                </div>
              </div>

              <!-- Mapping summary -->
              <div class="flex items-center gap-4 mb-4 px-1">
                <div class="flex items-center gap-1.5 text-xs text-[#4B5565]">
                  <span class="w-2 h-2 rounded-full bg-green-500"></span>
                  {{ mappedCount }}/{{ rows.length }} {{ t('mapped', { default: 'mapped' }) }}
                </div>
                <div
                  v-if="requiredUnmappedCount > 0"
                  class="flex items-center gap-1.5 text-xs text-red-500"
                >
                  <span class="w-2 h-2 rounded-full bg-red-400"></span>
                  {{ requiredUnmappedCount }} {{ t('requiredUnmapped', { default: 'required unmapped' }) }}
                </div>
              </div>

              <!-- A header that changed owner says so, and can be put back -->
              <div
                v-if="lastMove"
                class="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50"
                data-testid="header-moved"
              >
                <p class="text-xs text-amber-800">{{ moveNotice }}</p>
                <button
                  type="button"
                  class="text-xs font-semibold text-amber-900 hover:underline whitespace-nowrap"
                  data-testid="undo-move"
                  @click="undoMove"
                >
                  {{ t('undoMove', { default: 'Undo' }) }}
                </button>
              </div>

              <table class="w-full">
                <thead>
                  <tr class="border-b border-gray-200">
                    <th class="text-left text-xs font-semibold text-[#4B5565] pb-3 pr-4 w-[200px]">
                      {{ t('systemField', { default: 'System field' }) }}
                    </th>
                    <th class="text-left text-xs font-semibold text-[#4B5565] pb-3 pr-4">
                      {{ t('fileHeader', { default: 'File header' }) }}
                    </th>
                    <th class="text-left text-xs font-semibold text-[#4B5565] pb-3 pr-4 w-[160px]">
                      {{ t('matchScore', { default: 'Match score' }) }}
                    </th>
                    <th class="text-center text-xs font-semibold text-[#4B5565] pb-3 w-[60px]">
                      {{ t('status', { default: 'Status' }) }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="section in sections" :key="section.key || 'flat'">
                    <!-- Section header: a repeating group, foldable -->
                    <tr v-if="section.collapsible" class="border-b border-gray-100 bg-gray-50/60">
                      <td colspan="4" class="py-2">
                        <button
                          type="button"
                          class="w-full flex items-center gap-2 text-left"
                          :aria-expanded="isExpanded(section.key)"
                          :aria-label="isExpanded(section.key)
                            ? t('collapseSection', { default: 'Collapse' })
                            : t('expandSection', { default: 'Expand' })"
                          :data-testid="`section-toggle-${section.key}`"
                          @click="toggleGroup(section.key)"
                        >
                          <ChevronDownIcon
                            class="w-4 h-4 text-[#697586] transition-transform"
                            :class="{ '-rotate-90': !isExpanded(section.key) }"
                          />
                          <span class="text-sm font-semibold text-[#364152]">{{ section.label }}</span>
                          <span class="text-[11px] text-[#697586]">
                            {{ section.slotCount }} {{ t('slots', { default: 'slots' }) }} ·
                            {{ section.mappedCount }} {{ t('mapped', { default: 'mapped' }) }}
                          </span>
                          <span
                            v-if="section.requiredUnmappedCount"
                            class="text-[11px] font-semibold text-red-500"
                          >
                            · {{ section.requiredUnmappedCount }}
                            {{ t('requiredUnmapped', { default: 'required unmapped' }) }}
                          </span>
                        </button>
                      </td>
                    </tr>

                    <template v-if="isExpanded(section.key)">
                      <template v-for="slot in section.slots" :key="`${section.key}-${slot.index}`">
                        <!-- Slot divider: "2. Work experience" -->
                        <tr v-if="section.collapsible" class="border-b border-gray-100">
                          <td colspan="4" class="pt-3 pb-1">
                            <span class="text-[11px] font-semibold uppercase tracking-wide text-[#9AA4B2]">
                              {{ slot.index + 1 }}. {{ section.label }}
                            </span>
                          </td>
                        </tr>

                        <MappingFieldRow
                          v-for="row in slot.rows"
                          :key="row.target"
                          :row="row"
                          :selected="localMappings[row.target] || null"
                          :score="scores[row.target] ?? 0"
                          :header-options="headerOptions"
                          :taken-by="takenBy"
                          @assign="assignHeader"
                        />
                      </template>
                    </template>
                  </template>

                  <tr v-if="!visibleRows.length">
                    <td colspan="4" class="py-6 text-center text-sm text-[#9AA4B2]">
                      {{ t('noFieldsMatchSearch', { default: 'No field matches your search.' }) }}
                    </td>
                  </tr>
                </tbody>
              </table>

              <UnmappedColumnsPanel :headers="unmappedHeaders" />
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/50">
              <p v-if="!allRequiredMapped" class="text-xs text-red-500 flex items-center gap-1">
                <ExclamationCircleIcon class="w-4 h-4 flex-shrink-0" />
                {{ t('allRequiredFieldsMustBeMapped', { default: 'All required fields must be mapped.' }) }}
                <button
                  type="button"
                  class="font-semibold underline"
                  data-testid="reveal-required"
                  @click="revealRequiredUnmapped"
                >
                  {{ t('showRequiredUnmapped', { default: 'Show missing required fields' }) }}
                </button>
              </p>
              <p v-else class="text-xs text-green-600 flex items-center gap-1">
                <CheckCircleIcon class="w-4 h-4 flex-shrink-0" />
                {{ t('allRequiredFieldsMapped', { default: 'All required fields are mapped.' }) }}
              </p>
              <div class="flex gap-3">
                <button
                  type="button"
                  class="vie-btn vie-btn--outline vie-btn--md"
                  @click="emit('close')"
                >
                  {{ t('cancelImport', { default: 'Cancel' }) }}
                </button>
                <button
                  type="button"
                  class="vie-btn vie-btn--primary vie-btn--md"
                  :class="{ 'vie-btn--disabled': !allRequiredMapped || loading, 'vie-btn--loading': loading }"
                  :disabled="!allRequiredMapped || loading"
                  @click="handleStartImport"
                >
                  <span v-if="loading" class="vie-btn-spinner" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-dasharray="31.416"
                        stroke-dashoffset="31.416"
                      >
                        <animate
                          attributeName="stroke-dasharray"
                          dur="2s"
                          values="0 31.416;15.708 15.708;0 31.416"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="stroke-dashoffset"
                          dur="2s"
                          values="0;-15.708;-31.416"
                          repeatCount="indefinite"
                        />
                      </circle>
                    </svg>
                  </span>
                  <span>{{ t('startImport', { default: 'Start import' }) }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted, nextTick } from 'vue'
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/vue/24/solid'
import { ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import MappingFieldRow from './mapping/MappingFieldRow.vue'
import UnmappedColumnsPanel from './mapping/UnmappedColumnsPanel.vue'
import { useTranslate } from '../adapters'
import { useColumnMapping } from '../composables/useColumnMapping'
import { fillPlaceholders } from '../utils/i18n'
import type { APIImportField, APIImportMapping, MappingColumnUpdate } from '../types'

defineOptions({
  inheritAttrs: false,
})

interface Props {
  show: boolean
  importId: number | null
  mappings: APIImportMapping[]
  detectedHeaders: string[]
  /**
   * Every importable target field of the model.
   *
   * Left empty (a backend that does not send a catalogue), the editor falls back
   * to the fields the session already maps — the earlier behaviour, which cannot
   * offer anything the uploaded file does not mention.
   */
  fields?: APIImportField[]
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  fields: () => [],
  loading: false,
})

const emit = defineEmits<{
  close: []
  start: [mappings: Record<string, string>, columns: MappingColumnUpdate[]]
}>()

const t = useTranslate()

const {
  localMappings,
  rows,
  visibleRows,
  sections,
  mappedCount,
  requiredUnmappedCount,
  allRequiredMapped,
  scores,
  search,
  filterMode,
  isExpanded,
  toggleGroup,
  headerOptions,
  takenBy,
  unmappedHeaders,
  lastMove,
  assignHeader,
  undoMove,
  revealRequiredUnmapped,
  buildLocalMappings,
  buildStartPayload,
} = useColumnMapping({
  mappings: () => props.mappings,
  fields: () => catalogue.value,
  detectedHeaders: () => props.detectedHeaders,
  label: (field, fallback) => getFieldLabel(field, fallback),
  sectionLabel: (group, fallback) => t(`group.${group}`, { default: fallback }),
})

/**
 * The field catalogue to render rows from.
 *
 * With no catalogue the editor derives its rows from the session's mappings, so
 * a host on an older backend keeps the list it has always had instead of an
 * empty table.
 */
const catalogue = computed<APIImportField[]>(() => {
  if (props.fields.length) return props.fields

  return props.mappings
    .filter((mapping) => !!mapping.target_field)
    .map((mapping) => ({
      field: mapping.target_field,
      label: mapping.target_field,
      required: mapping.is_required,
      type: 'string',
      aliases: [],
      group: null,
      group_label: null,
      group_index: null,
      group_field: null,
    }))
})

/** The "header moved" notice, with its placeholders filled in. */
const moveNotice = computed(() => {
  const move = lastMove.value
  if (!move) return ''

  const params = { header: move.header, field: getFieldLabel(move.from, move.from) }

  return fillPlaceholders(
    t('headerMovedFromField', { ...params, default: '"{header}" moved from {field}.' }),
    params,
  )
})

const fieldLabels: Record<string, string> = {
  name: 'Ad Soyad',
  email: 'E-posta',
  sicil_no: 'Sicil Numarası',
  manager_sicil: 'Yönetici Sicil No',
  department_name: 'Departman',
  division_name: 'Bölüm',
  title: 'Başlık',
  position_name: 'Pozisyon',
  _company_id: 'Şirket',
  start_date: 'Başlangıç Tarihi',
  end_date: 'Bitiş Tarihi',
  user_name: 'Ad Soyad',
  personnel_number: 'Sicil Numarası',
  manager_personnel_number: 'Yönetici Sicil Numarası',
  company_name: 'Şirket Adı',
  position_id: 'Pozisyon ID',
  competency_id: 'Yetkinlik ID',
  competency_title: 'Yetkinlik Adı',
  required_level_id: 'Gerekli Seviye ID',
  level_name: 'Gerekli Seviye Adı',
}

/**
 * A target field's display label.
 *
 * Host i18n wins via `field.<target_field>`; failing that the backend's own
 * label (handed in as the fallback), then the bundled Turkish defaults, then the
 * raw field key.
 *
 * @param field    Target field key
 * @param fallback Label to use when the host has no entry for the key
 * @return The label to render
 */
function getFieldLabel(field: string, fallback?: string): string {
  return t(`field.${field}`, { default: fallback || fieldLabels[field] || field })
}

function handleStartImport() {
  const payload = buildStartPayload()
  emit('start', payload.mappings, payload.columns)
}

// Seed the selections when the modal opens. One component instance serves every
// session, so the search box and the scope toggle start clean too.
watch(
  () => props.show,
  (isOpen) => {
    if (!isOpen) return

    search.value = ''
    filterMode.value = 'relevant'
    buildLocalMappings()
  },
  { immediate: true },
)

// New mappings mean the session's proposals changed — applying a template
// rewrites them — and a template has to win over what is on screen, so the
// selections are rebuilt wholesale rather than merged. A catalogue that arrives
// after the upload (fetched separately) lands here too.
watch([() => props.mappings, () => props.fields], () => {
  if (props.show) buildLocalMappings()
})

// ── Accessibility: focus trap + scroll lock ──────────────────────────────────
// Self-contained port of the host BaseModal behavior so the library does not
// depend on app-specific modal/button components.

const modalContentRef = ref<HTMLElement | null>(null)
const pressStartedOnBackdrop = ref(false)
let previousActiveElement: HTMLElement | null = null

const onBackdropMousedown = (event: MouseEvent) => {
  pressStartedOnBackdrop.value = event.target === event.currentTarget
}

const onBackdropClick = (event: MouseEvent) => {
  if (pressStartedOnBackdrop.value && event.target === event.currentTarget) {
    emit('close')
  }
  pressStartedOnBackdrop.value = false
}

const isMobile = () =>
  typeof window !== 'undefined' && window.innerWidth <= 768

const getFocusableElements = (): HTMLElement[] => {
  if (!modalContentRef.value) return []
  const focusableSelectors =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  return Array.from(
    modalContentRef.value.querySelectorAll(focusableSelectors),
  ) as HTMLElement[]
}

const handleFocusTrap = (e: KeyboardEvent) => {
  if (e.key !== 'Tab' || !props.show) return

  const focusableElements = getFocusableElements()
  if (focusableElements.length === 0) return

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]

  if (e.shiftKey) {
    if (document.activeElement === firstElement) {
      e.preventDefault()
      lastElement.focus()
    }
  } else {
    if (document.activeElement === lastElement) {
      e.preventDefault()
      firstElement.focus()
    }
  }
}

const handleEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.show) {
    emit('close')
  }
}

watch(
  () => props.show,
  async (newValue) => {
    if (newValue) {
      previousActiveElement = document.activeElement as HTMLElement

      document.addEventListener('keydown', handleFocusTrap)
      document.addEventListener('keydown', handleEscape)

      await nextTick()
      const focusableElements = getFocusableElements()
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      }

      if (isMobile()) {
        document.body.style.overflow = 'hidden'
      }
    } else {
      document.removeEventListener('keydown', handleFocusTrap)
      document.removeEventListener('keydown', handleEscape)

      if (previousActiveElement) {
        previousActiveElement.focus()
        previousActiveElement = null
      }

      if (isMobile()) {
        document.body.style.overflow = ''
      }
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  document.removeEventListener('keydown', handleFocusTrap)
  document.removeEventListener('keydown', handleEscape)
  if (isMobile()) {
    document.body.style.overflow = ''
  }
})
</script>

<style scoped>
/* Overlay transition */
.vie-modal-overlay-enter-active,
.vie-modal-overlay-leave-active {
  transition: all 0.3s ease;
}
.vie-modal-overlay-enter-from,
.vie-modal-overlay-leave-to {
  opacity: 0;
}

/* Content transition */
.vie-modal-content-enter-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.vie-modal-content-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.vie-modal-content-enter-from,
.vie-modal-content-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Self-contained button (ported from host BaseButton: primary + outline, md) */
.vie-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-family: inherit;
  font-weight: 700;
  text-align: center;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  outline: none;
  position: relative;
  overflow: hidden;
  padding: 0.6rem 1rem;
  font-size: 1rem;
  border-radius: 0.5rem;
}

.vie-btn:focus {
  outline: 2px solid rgba(65, 105, 225, 0.4);
  outline-offset: 2px;
}

.vie-btn--primary {
  background-color: #3344ee;
  color: white;
  border-color: #3344ee;
}
.vie-btn--primary:hover:not(:disabled) {
  background-color: #4433ee;
  border-color: #4433ee;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(65, 105, 225, 0.3);
}
.vie-btn--primary:active:not(:disabled) {
  background-color: #2244bb;
  border-color: #2244bb;
  transform: translateY(0);
}

.vie-btn--outline {
  background-color: transparent;
  color: #3344ee;
  border-color: #3344ee;
}
.vie-btn--outline:hover:not(:disabled) {
  background-color: #3344ee;
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(65, 105, 225, 0.2);
}

.vie-btn--disabled,
.vie-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.vie-btn--loading {
  cursor: wait;
}

.vie-btn-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
}
.vie-btn-spinner svg {
  animation: vie-spin 1s linear infinite;
}

@keyframes vie-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
