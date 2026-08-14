<template>
  <tr class="hover:bg-gray-50 transition-colors" :class="customClass">
    <!-- File name -->
    <td class="px-6 py-4 whitespace-nowrap">
      <div class="flex items-center gap-3">
        <span
          :class="[
            badgeColor,
            'text-white text-[10px] font-semibold px-2 py-[2px] rounded-md flex-shrink-0',
          ]"
        >
          {{ fileExt }}
        </span>
        <span class="font-medium text-[#111927] text-sm truncate max-w-xs">
          {{ item.file_name }}
        </span>
        <slot name="badge" :item="item" />
      </div>
    </td>

    <!-- Module -->
    <td class="px-6 py-4 whitespace-nowrap text-sm text-[#4B5565]">
      {{ moduleLabel }}
    </td>

    <!-- Status -->
    <td class="px-6 py-4 whitespace-nowrap">
      <span
        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
        :class="statusClass"
      >
        {{ statusLabel }}
      </span>
    </td>

    <!-- Date -->
    <td class="px-6 py-4 whitespace-nowrap text-sm text-[#4B5565]">
      {{ formattedDate }}
    </td>

    <!-- Actions -->
    <td class="px-6 py-4 whitespace-nowrap text-right">
      <div class="flex items-center justify-end gap-1">
        <button
          v-if="item.failed_rows > 0"
          type="button"
          class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#4B5565] hover:bg-gray-100 transition"
          :title="t('downloadFailures', { default: 'Download failures' })"
          @click="emit('download', item)"
        >
          <ArrowDownTrayIcon class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#4B5565] hover:bg-red-50 hover:text-red-500 transition"
          :title="t('delete', { default: 'Delete' })"
          @click="emit('delete', item)"
        >
          <TrashIcon class="w-4 h-4" />
        </button>
      </div>
    </td>
  </tr>
</template>

<script setup lang="ts">
/**
 * FileItem: a single import-session table row, rendered by {@link ImportManager}
 * inside the sessions table `<tbody>`. Shows the file name (with a type badge),
 * the localized module + status labels, the created date, and per-row download
 * (failures) / delete actions.
 *
 * Ported from competo-fe `src/components/content/CVFileItem.vue`, generalized
 * and decoupled from the host app:
 *   - i18n via the package's {@link useTranslate} adapter (no `vue-i18n` import).
 *   - The app's `BaseButton` is replaced by native `<button>` elements.
 *   - `@heroicons/vue` is kept (peer dependency, decided).
 */
import { computed } from 'vue'
import { ArrowDownTrayIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { useTranslate } from '../adapters.js'
import type { APIImport } from '../types.js'

const props = defineProps<{
  /** The import session this row represents. */
  item: APIImport
  /** Localized module/model label (resolved by the parent). */
  moduleLabel: string
  /** Localized status label (resolved by the parent). */
  statusLabel: string
  /** Optional extra classes applied to the row. */
  customClass?: string
}>()

const emit = defineEmits<{
  /** Request to download this session's failed rows. */
  download: [item: APIImport]
  /** Request to delete this session. */
  delete: [item: APIImport]
}>()

defineSlots<{
  /** Rendered inline after the file name — e.g. a custom status badge. */
  badge?: (props: { item: APIImport }) => unknown
}>()

const t = useTranslate()

const fileExt = computed(
  () => props.item.file_name?.split('.').pop()?.toUpperCase() || 'FILE',
)

const badgeColor = computed(() => {
  const ext = props.item.file_name?.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
      return 'bg-[#EF4444]'
    case 'xlsx':
    case 'xls':
    case 'csv':
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
})

const statusClass = computed(() => {
  switch (props.item.status) {
    case 'completed':
      return 'bg-green-50 text-green-700'
    case 'completed_with_errors':
      return 'bg-amber-50 text-amber-700'
    case 'failed':
      return 'bg-red-50 text-red-700'
    case 'processing':
      return 'bg-blue-50 text-blue-700'
    case 'cancelled':
      return 'bg-gray-100 text-gray-600'
    default:
      return 'bg-yellow-50 text-yellow-700'
  }
})

const formattedDate = computed(() => {
  const raw = props.item.created_at
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString()
})
</script>
