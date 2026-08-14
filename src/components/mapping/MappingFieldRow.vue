<template>
  <tr
    class="border-b border-gray-100 transition-colors"
    :class="{ 'bg-red-50/30': row.required && !selected }"
    :data-target="row.target"
  >
    <!-- System field -->
    <td class="py-3.5 pr-4">
      <div>
        <span class="text-sm font-medium text-[#364152]">{{ row.label }}</span>
        <span class="block text-xs text-[#9AA4B2] mt-0.5">{{ row.target }}</span>
        <span
          v-if="row.required"
          class="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded"
        >{{ t('required', { default: 'Required' }) }}</span>
      </div>
    </td>

    <!-- File header dropdown -->
    <td class="py-3.5 pr-4">
      <SelectInput
        :modelValue="selected"
        :options="options"
        :placeholder="t('selectColumnFromFile', { default: 'Select a column from file' })"
        :searchable="true"
        :clearable="true"
        @update:modelValue="emit('assign', row.target, $event ?? null)"
      />
    </td>

    <!-- Match score -->
    <td class="py-3.5 pr-4">
      <div v-if="selected" class="flex items-center gap-2">
        <div class="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500 ease-out"
            :class="scoreColor"
            :style="{ width: Math.max(scorePercent, 5) + '%' }"
          ></div>
        </div>
        <span class="text-xs font-semibold w-[40px] text-right" :class="scoreTextColor">
          %{{ scorePercent }}
        </span>
      </div>
      <div v-else class="h-2.5"></div>
    </td>

    <!-- Status -->
    <td class="py-3.5 text-center">
      <div class="flex items-center justify-center">
        <CheckCircleIcon v-if="selected && score >= 0.4" class="w-5 h-5 text-green-500" />
        <ExclamationTriangleIcon
          v-else-if="selected && score < 0.4"
          class="w-5 h-5 text-orange-400"
        />
        <ExclamationCircleIcon
          v-else-if="row.required && !selected"
          class="w-5 h-5 text-red-400"
        />
        <MinusCircleIcon v-else class="w-5 h-5 text-gray-300" />
      </div>
    </td>
  </tr>
</template>

<script setup lang="ts">
/**
 * One row of the column-mapping editor: a target field, the file header mapped
 * onto it, the match score and a status glyph.
 *
 * A catalogue can run to a couple of hundred targets, so the option list is
 * derived per row rather than passed in ready-made: `takenBy` changes on every
 * pick, and rebuilding one array here beats rebuilding the shared one for every
 * row on every keystroke.
 */
import { computed } from 'vue'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
} from '@heroicons/vue/24/solid'
import SelectInput, { type SelectOption } from '../inputs/SelectInput.vue'
import { useTranslate } from '../../adapters.js'
import { fillPlaceholders } from '../../utils/i18n.js'
import type { MappingRowModel } from '../../composables/useColumnMapping.js'

const props = defineProps<{
  row: MappingRowModel
  selected: string | null
  score: number
  /** File headers offered to every row. */
  headerOptions: SelectOption[]
  /** Header => label of the field currently holding it. */
  takenBy: Record<string, string>
}>()

const emit = defineEmits<{
  assign: [target: string, header: string | null]
}>()

const t = useTranslate()

/**
 * The row's picker options, annotating headers another field already holds.
 *
 * Picking one is allowed — it moves the header — so the annotation is a warning,
 * not a barrier: in a list this long, a disabled option would leave the user
 * hunting for the owner with no way to act from here.
 */
const options = computed<SelectOption[]>(() =>
  props.headerOptions.map((option) => {
    const owner = props.takenBy[option.value]

    if (!owner || option.value === props.selected) return option

    return {
      value: option.value,
      label: `${option.label} — ${fillPlaceholders(
        t('alreadyMappedToField', { field: owner, default: 'already mapped to {field}' }),
        { field: owner },
      )}`,
    }
  }),
)

const scorePercent = computed(() => Math.round(props.score * 100))

const scoreColor = computed(() => {
  if (props.score >= 0.8) return 'bg-green-500'
  if (props.score >= 0.4) return 'bg-orange-400'
  return 'bg-red-400'
})

const scoreTextColor = computed(() => {
  if (props.score >= 0.8) return 'text-green-600'
  if (props.score >= 0.4) return 'text-orange-500'
  return 'text-red-500'
})
</script>
