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
      <span :class="selectedLabel ? 'text-[#364152] truncate' : 'text-[#9AA4B2] truncate'">
        {{ selectedLabel || placeholder || t('select', { default: 'Select' }) }}
      </span>
      <ChevronUpDownIcon class="w-4 h-4 text-[#9AA4B2] flex-shrink-0" />
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
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/vue/24/outline'
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
  }>(),
  {
    placeholder: '',
    searchable: false,
    disabled: false,
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

function select(value: string) {
  emit('update:modelValue', value)
  open.value = false
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
