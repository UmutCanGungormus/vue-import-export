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

      <!-- Additional columns, for the free-text targets that accept them -->
      <template v-if="row.multi">
        <SelectInput
          v-for="(extra, index) in extras"
          :key="index"
          class="mt-2"
          :modelValue="extra"
          :options="optionsFor(extra)"
          :placeholder="t('selectAnotherColumn', { default: 'Select another column' })"
          :searchable="true"
          :clearable="true"
          @update:modelValue="emit('assignExtra', row.target, index, $event ?? null)"
        />

        <button
          v-if="canAddColumn"
          type="button"
          class="mt-2 text-xs font-medium text-[#155EEF] hover:underline"
          @click="emit('addColumn', row.target)"
        >
          + {{ t('addAnotherColumn', { default: 'Add another column' }) }}
        </button>

        <div v-if="strategy" class="mt-2 flex items-center gap-1">
          <span class="text-[11px] text-[#9AA4B2]">
            {{ t('combineColumns', { default: 'Combine as' }) }}
          </span>
          <button
            v-for="option in STRATEGIES"
            :key="option.value"
            type="button"
            class="px-2 py-0.5 text-[11px] rounded border transition-colors"
            :class="strategy === option.value
              ? 'border-[#155EEF] bg-[#EFF4FF] text-[#155EEF] font-medium'
              : 'border-gray-200 text-[#697586] hover:border-gray-300'"
            @click="emit('setStrategy', row.target, option.value)"
          >
            {{ t(option.key, { default: option.fallback }) }}
          </button>
        </div>
      </template>
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
import type { MultiColumnStrategy } from '../../types.js'

const props = defineProps<{
  row: MappingRowModel
  selected: string | null
  score: number
  /** File headers offered to every row. */
  headerOptions: SelectOption[]
  /** Header => label of the field currently holding it. */
  takenBy: Record<string, string>
  /** The columns beyond the first, for a target that accepts several. */
  extras?: (string | null)[]
  /** How this target's columns combine, or null while it has only one. */
  strategy?: MultiColumnStrategy | null
}>()

const emit = defineEmits<{
  assign: [target: string, header: string | null]
  assignExtra: [target: string, index: number, header: string | null]
  addColumn: [target: string]
  setStrategy: [target: string, strategy: MultiColumnStrategy]
}>()

const t = useTranslate()

/** The combine strategies offered, with the labels a host may translate. */
const STRATEGIES: { value: MultiColumnStrategy; key: string; fallback: string }[] = [
  { value: 'merge', key: 'combineMerge', fallback: 'Merged text' },
  { value: 'json', key: 'combineJson', fallback: 'JSON' },
]

const extras = computed(() => props.extras ?? [])

/**
 * Whether one more column may be added.
 *
 * A row with nothing in its first picker has nothing to combine yet, and a
 * trailing empty picker is the one already waiting to be filled.
 */
const canAddColumn = computed(
  () => !!props.selected && !extras.value.some((column) => !column),
)

/** Every header this row is already feeding its target with. */
const ownColumns = computed(() =>
  [props.selected, ...extras.value].filter((column): column is string => !!column),
)

/**
 * The row's picker options, annotating headers another field already holds.
 *
 * Picking one is allowed — it moves the header — so the annotation is a warning,
 * not a barrier: in a list this long, a disabled option would leave the user
 * hunting for the owner with no way to act from here.
 */
const options = computed<SelectOption[]>(() => optionsFor(props.selected))

/**
 * The picker options for one of the row's columns.
 *
 * @param current The header that picker currently holds, which is never annotated
 */
function optionsFor(current: string | null): SelectOption[] {
  const own = new Set(ownColumns.value)

  return props.headerOptions.flatMap((option) => {
    // A column this row already feeds the target with cannot be picked twice,
    // and annotating it as "taken" by the row you are looking at reads as a
    // clash rather than as what it is.
    if (option.value !== current && own.has(option.value)) return []

    const owner = props.takenBy[option.value]

    if (!owner || option.value === current) return option

    return {
      value: option.value,
      label: `${option.label} — ${fillPlaceholders(
        t('alreadyMappedToField', { field: owner, default: 'already mapped to {field}' }),
        { field: owner },
      )}`,
    }
  })
}

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
