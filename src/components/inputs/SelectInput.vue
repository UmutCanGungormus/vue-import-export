<template>
  <div ref="rootRef" class="relative w-full">
    <button
      type="button"
      class="w-full h-10 flex items-center justify-between gap-2 px-3 text-sm text-left border border-gray-200 rounded-lg bg-white text-[#364152] focus:outline-none focus:ring-1 focus:ring-[#3344ee] focus:border-[#3344ee] disabled:opacity-50 disabled:cursor-not-allowed transition"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <!-- Right padding reserves the strip the overlaid clear button sits in. -->
      <span
        class="truncate"
        :class="[selectedLabel ? 'text-[#364152]' : 'text-[#9AA4B2]', { 'pr-6': showClear }]"
      >
        {{ selectedLabel || placeholder || t('select', { default: 'Select' }) }}
      </span>
      <ChevronUpDownIcon class="w-4 h-4 text-[#9AA4B2] flex-shrink-0" />
    </button>

    <!-- Sibling of the trigger, not a child: a button may not nest another. -->
    <button
      v-if="showClear"
      type="button"
      class="absolute right-8 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded text-[#9AA4B2] hover:text-[#364152] hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-[#3344ee] transition"
      :aria-label="t('clearSelection', { default: 'Clear selection' })"
      data-testid="select-clear"
      @click.stop="clear"
    >
      <XMarkIcon class="w-3.5 h-3.5" />
    </button>

    <div
      v-if="open"
      class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
      role="listbox"
    >
      <div v-if="searchable" class="p-2 border-b border-gray-100">
        <input
          ref="searchRef"
          v-model="query"
          type="text"
          class="w-full h-8 px-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#3344ee] focus:border-[#3344ee]"
          :placeholder="t('search', { default: 'Search' })"
          @click.stop
        />
      </div>

      <ul class="py-1">
        <li
          v-if="showClear"
          class="px-3 py-2 text-sm cursor-pointer flex items-center gap-2 text-[#4B5565] hover:bg-gray-50 border-b border-gray-100"
          role="option"
          :aria-selected="false"
          data-testid="select-clear-option"
          @click="clear"
        >
          <XMarkIcon class="w-3.5 h-3.5 flex-shrink-0 text-[#9AA4B2]" />
          <span class="truncate">{{ t('clearSelection', { default: 'Clear selection' }) }}</span>
        </li>
        <li v-if="filteredOptions.length === 0" class="px-3 py-2 text-sm text-[#9AA4B2] select-none">
          {{ t('noOptions', { default: 'No options' }) }}
        </li>
        <li
          v-for="option in filteredOptions"
          :key="option.value"
          class="px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-gray-50"
          :class="option.value === modelValue ? 'text-[#3344ee] font-medium bg-[#EFF4FF]' : 'text-[#364152]'"
          role="option"
          :aria-selected="option.value === modelValue"
          @click="select(option.value)"
        >
          <span class="truncate">{{ option.label }}</span>
          <CheckIcon v-if="option.value === modelValue" class="w-4 h-4 text-[#3344ee] flex-shrink-0" />
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SelectInput: a lightweight, accessible single-select dropdown with optional
 * inline search. Self-contained (no app-specific select component) and
 * decoupled from the host via the package's {@link useTranslate} adapter.
 *
 * Consumed by {@link ColumnMappingModal} for the per-row file-header picker.
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ChevronUpDownIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { useTranslate } from '../../adapters.js'

export interface SelectOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string | null
    options: SelectOption[]
    placeholder?: string
    searchable?: boolean
    disabled?: boolean
    /**
     * Offer a way back to "nothing selected": an ✕ on the trigger and a clear
     * entry at the top of the list. Without it a value, once picked, can only
     * ever be swapped for another one.
     */
    clearable?: boolean
  }>(),
  {
    placeholder: '',
    searchable: false,
    disabled: false,
    clearable: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const t = useTranslate()

const open = ref(false)
const query = ref('')
const rootRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)

const selectedLabel = computed(() => {
  const found = props.options.find((o) => o.value === props.modelValue)
  return found?.label ?? ''
})

const filteredOptions = computed(() => {
  if (!props.searchable || !query.value.trim()) return props.options
  const q = query.value.trim().toLowerCase()
  return props.options.filter((o) => o.label.toLowerCase().includes(q))
})

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

/** Whether a clear affordance applies: enabled, and something to clear. */
const showClear = computed(
  () => props.clearable && !props.disabled && props.modelValue !== null && props.modelValue !== '',
)

function select(value: string | null) {
  emit('update:modelValue', value)
  open.value = false
}

/** Return the input to its unselected state. */
function clear() {
  select(null)
}

watch(open, async (isOpen) => {
  if (isOpen) {
    query.value = ''
    if (props.searchable) {
      await nextTick()
      searchRef.value?.focus()
    }
  }
})

function onDocumentClick(event: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>
