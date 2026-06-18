<template>
  <div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-3 border-t border-gray-200">
    <!-- Pagination Controls -->
    <div class="flex items-center gap-0.5">
      <!-- First page -->
      <button
        :disabled="currentPage <= 1"
        class="w-8 h-8 flex items-center justify-center text-[#4B5565] hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition"
        :title="t('pagination.firstPage', { default: 'First page' })"
        @click="$emit('update:currentPage', 1)"
      >
        <ChevronDoubleLeftIcon class="w-4 h-4" />
      </button>

      <!-- Previous -->
      <button
        :disabled="currentPage <= 1"
        class="flex items-center gap-1 px-2 py-1.5 text-sm text-[#4B5565] hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition"
        @click="$emit('update:currentPage', currentPage - 1)"
      >
        <ChevronLeftIcon class="w-4 h-4" />
        <span class="hidden sm:inline">{{ t('pagination.previous', { default: 'Previous' }) }}</span>
      </button>

      <!-- Page numbers -->
      <template v-for="page in visiblePages" :key="page">
        <span v-if="page === '...'" class="px-1.5 py-1.5 text-sm text-[#9AA4B2] select-none">...</span>
        <button
          v-else
          class="min-w-[34px] h-8 px-1.5 text-sm font-medium rounded-lg transition"
          :class="page === currentPage
            ? 'bg-[#EFF4FF] text-[#3344ee] border border-[#3344ee]/20'
            : 'text-[#4B5565] hover:bg-gray-100'"
          @click="$emit('update:currentPage', page as number)"
        >
          {{ page }}
        </button>
      </template>

      <!-- Next -->
      <button
        :disabled="currentPage >= totalPages"
        class="flex items-center gap-1 px-2 py-1.5 text-sm text-[#4B5565] hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition"
        @click="$emit('update:currentPage', currentPage + 1)"
      >
        <span class="hidden sm:inline">{{ t('pagination.next', { default: 'Next' }) }}</span>
        <ChevronRightIcon class="w-4 h-4" />
      </button>

      <!-- Last page -->
      <button
        :disabled="currentPage >= totalPages"
        class="w-8 h-8 flex items-center justify-center text-[#4B5565] hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition"
        :title="t('pagination.lastPage', { default: 'Last page' })"
        @click="$emit('update:currentPage', totalPages)"
      >
        <ChevronDoubleRightIcon class="w-4 h-4" />
      </button>
    </div>

    <!-- Per Page + Total + Actions -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="text-xs text-[#9AA4B2]">{{ t('pagination.itemsPerPage', { default: 'Items per page' }) }}</span>
        <select
          :value="perPage"
          class="h-8 px-2 pr-7 text-sm border border-gray-200 rounded-lg bg-white text-[#364152] focus:outline-none focus:ring-1 focus:ring-[#3344ee] focus:border-[#3344ee] cursor-pointer"
          @change="$emit('update:perPage', Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="10">10</option>
          <option :value="15">15</option>
          <option :value="25">25</option>
          <option :value="50">50</option>
        </select>
      </div>

      <div class="h-4 w-px bg-gray-200"></div>

      <span class="text-sm text-[#4B5565] font-medium">
        {{ totalItems }} {{ t('pagination.results', { default: 'results' }) }}
      </span>

      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '@heroicons/vue/24/outline'
import { useTranslate } from '../adapters.js'

interface Props {
  currentPage: number
  totalPages: number
  perPage: number
  totalItems: number
}

const props = defineProps<Props>()

defineEmits<{
  'update:currentPage': [page: number]
  'update:perPage': [perPage: number]
}>()

const t = useTranslate()

const visiblePages = computed(() => {
  const total = props.totalPages
  const current = props.currentPage
  const pages: (number | string)[] = []

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
    return pages
  }

  pages.push(1)

  if (current > 3) {
    pages.push('...')
  }

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (current < total - 2) {
    pages.push('...')
  }

  if (total > 1) {
    pages.push(total)
  }

  return pages
})
</script>
