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
              <!-- Mapping summary -->
              <div class="flex items-center gap-4 mb-4 px-1">
                <div class="flex items-center gap-1.5 text-xs text-[#4B5565]">
                  <span class="w-2 h-2 rounded-full bg-green-500"></span>
                  {{ mappedCount }}/{{ dedupedMappings.length }} {{ t('mapped', { default: 'mapped' }) }}
                </div>
                <div
                  v-if="requiredUnmappedCount > 0"
                  class="flex items-center gap-1.5 text-xs text-red-500"
                >
                  <span class="w-2 h-2 rounded-full bg-red-400"></span>
                  {{ requiredUnmappedCount }} {{ t('requiredUnmapped', { default: 'required unmapped' }) }}
                </div>
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
                  <tr
                    v-for="mapping in dedupedMappings"
                    :key="mapping.id"
                    class="border-b border-gray-100 transition-colors"
                    :class="{ 'bg-red-50/30': mapping.is_required && !localMappings[mapping.target_field] }"
                  >
                    <!-- System Field -->
                    <td class="py-3.5 pr-4">
                      <div>
                        <span class="text-sm font-medium text-[#364152]">{{ getFieldLabel(mapping.target_field) }}</span>
                        <span class="block text-xs text-[#9AA4B2] mt-0.5">{{ mapping.target_field }}</span>
                        <span
                          v-if="mapping.is_required"
                          class="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded"
                        >{{ t('required', { default: 'Required' }) }}</span>
                      </div>
                    </td>

                    <!-- File Header Dropdown -->
                    <td class="py-3.5 pr-4">
                      <SelectInput
                        :modelValue="localMappings[mapping.target_field] || null"
                        :options="headerOptions"
                        :placeholder="t('selectColumnFromFile', { default: 'Select a column from file' })"
                        :searchable="true"
                        :clearable="true"
                        @update:modelValue="handleMappingChange(mapping.target_field, $event)"
                      />
                    </td>

                    <!-- Match Score -->
                    <td class="py-3.5 pr-4">
                      <div v-if="localMappings[mapping.target_field]" class="flex items-center gap-2">
                        <div class="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            class="h-full rounded-full transition-all duration-500 ease-out"
                            :class="getScoreColor(scores[mapping.target_field])"
                            :style="{ width: Math.max(scorePercent(scores[mapping.target_field]), 5) + '%' }"
                          ></div>
                        </div>
                        <span
                          class="text-xs font-semibold w-[40px] text-right"
                          :class="getScoreTextColor(scores[mapping.target_field])"
                        >%{{ scorePercent(scores[mapping.target_field]) }}</span>
                      </div>
                      <div v-else class="h-2.5"></div>
                    </td>

                    <!-- Status -->
                    <td class="py-3.5 text-center">
                      <div class="flex items-center justify-center">
                        <CheckCircleIcon
                          v-if="localMappings[mapping.target_field] && scores[mapping.target_field] >= 0.4"
                          class="w-5 h-5 text-green-500"
                        />
                        <ExclamationTriangleIcon
                          v-else-if="localMappings[mapping.target_field] && scores[mapping.target_field] < 0.4"
                          class="w-5 h-5 text-orange-400"
                        />
                        <ExclamationCircleIcon
                          v-else-if="mapping.is_required && !localMappings[mapping.target_field]"
                          class="w-5 h-5 text-red-400"
                        />
                        <MinusCircleIcon
                          v-else
                          class="w-5 h-5 text-gray-300"
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/50">
              <p v-if="!allRequiredMapped" class="text-xs text-red-500 flex items-center gap-1">
                <ExclamationCircleIcon class="w-4 h-4 flex-shrink-0" />
                {{ t('allRequiredFieldsMustBeMapped', { default: 'All required fields must be mapped.' }) }}
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
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
} from '@heroicons/vue/24/solid'
import SelectInput from './inputs/SelectInput.vue'
import { useTranslate } from '../adapters'
import { scoreColumnMatch } from '../utils/columnMatch'
import type { APIImportMapping } from '../types'

defineOptions({
  inheritAttrs: false,
})

interface Props {
  show: boolean
  importId: number | null
  mappings: APIImportMapping[]
  detectedHeaders: string[]
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  close: []
  start: [mappings: Record<string, string>]
}>()

const t = useTranslate()

const localMappings = ref<Record<string, string | null>>({})

const headerOptions = computed(() => {
  return props.detectedHeaders.map((header) => ({
    value: header,
    label: header,
  }))
})

const allRequiredMapped = computed(() => {
  return dedupedMappings.value
    .filter((m) => m.is_required)
    .every((m) => !!localMappings.value[m.target_field])
})

const mappedCount = computed(() => {
  return dedupedMappings.value.filter((m) => !!localMappings.value[m.target_field]).length
})

const requiredUnmappedCount = computed(() => {
  return dedupedMappings.value
    .filter((m) => m.is_required && !localMappings.value[m.target_field])
    .length
})

// Deduplicated mappings: filter null target_fields and pick best match per target
const dedupedMappings = computed(() => {
  const byTarget = new Map<string, APIImportMapping>()
  for (const m of props.mappings) {
    if (!m.target_field) continue
    const existing = byTarget.get(m.target_field)
    if (!existing) {
      byTarget.set(m.target_field, m)
    } else {
      // Prefer confirmed, then higher confidence
      if (m.is_confirmed && !existing.is_confirmed) {
        byTarget.set(m.target_field, m)
      } else if (m.is_confirmed === existing.is_confirmed && m.confidence_score > existing.confidence_score) {
        byTarget.set(m.target_field, m)
      }
    }
  }
  return Array.from(byTarget.values())
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

function getFieldLabel(field: string): string {
  // Allow host i18n to override per-field labels via `field.<target_field>`,
  // falling back to the bundled Turkish defaults, then the raw field key.
  return t(`field.${field}`, { default: fieldLabels[field] || field })
}

/**
 * Composite key for the score lookup below.
 *
 * The unit separator cannot occur in a spreadsheet header or a field key, so no
 * pair of values can collide on it.
 *
 * @param sourceColumn File header
 * @param targetField  Target field key
 * @return The map key for that pair
 */
function pairKey(sourceColumn: string, targetField: string): string {
  return `${sourceColumn}\u001f${targetField}`
}

/**
 * Backend confidence per (source column, target field) pair.
 *
 * The session carries one mapping per detected header, so the score the backend
 * computed is recoverable for any pair it actually looked at — not just for the
 * column it ended up choosing.
 */
const backendScores = computed(() => {
  const byPair = new Map<string, number>()
  for (const m of props.mappings) {
    if (!m.target_field || !m.source_column) continue
    byPair.set(pairKey(m.source_column, m.target_field), m.confidence_score)
  }
  return byPair
})

/**
 * Match score of what is currently selected, per target field.
 *
 * The stored `confidence_score` describes the column the backend picked, so it
 * goes stale the moment the user points a field somewhere else — leaving a
 * deliberate manual mapping wearing the old column's percentage. Pairs the
 * backend already scored keep its number verbatim (it knows the field's aliases,
 * which the client does not); anything else is scored locally with the same
 * formula. See {@link scoreColumnMatch}.
 */
const scores = computed<Record<string, number>>(() => {
  const result: Record<string, number> = {}

  for (const mapping of dedupedMappings.value) {
    const selected = localMappings.value[mapping.target_field]
    if (!selected) {
      result[mapping.target_field] = 0
      continue
    }

    const known = backendScores.value.get(pairKey(selected, mapping.target_field))
    result[mapping.target_field] =
      known ??
      scoreColumnMatch(selected, mapping.target_field, {
        label: getFieldLabel(mapping.target_field),
      }).score
  }

  return result
})

function scorePercent(score: number): number {
  return Math.round(score * 100)
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return 'bg-green-500'
  if (score >= 0.4) return 'bg-orange-400'
  return 'bg-red-400'
}

function getScoreTextColor(score: number): string {
  if (score >= 0.8) return 'text-green-600'
  if (score >= 0.4) return 'text-orange-500'
  return 'text-red-500'
}

function handleMappingChange(targetField: string, value: string | null | undefined) {
  localMappings.value[targetField] = value || null
}

function handleStartImport() {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(localMappings.value)) {
    if (value) result[key] = value
  }
  emit('start', result)
}

function buildLocalMappings() {
  const mapped: Record<string, string | null> = {}
  for (const m of dedupedMappings.value) {
    if (m.is_confirmed || m.confidence_score >= 0.8) {
      mapped[m.target_field] = m.source_column || null
    } else {
      mapped[m.target_field] = null
    }
  }
  localMappings.value = mapped
}

// Populate localMappings from props when modal opens
watch(
  () => props.show,
  (newVal) => {
    if (newVal && props.mappings.length > 0) {
      buildLocalMappings()
    }
  },
  { immediate: true },
)

watch(
  () => props.mappings,
  (newMappings) => {
    if (props.show && newMappings.length > 0) {
      buildLocalMappings()
    }
  },
)

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
