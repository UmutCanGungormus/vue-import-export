<template>
  <div class="mt-5 rounded-xl border border-gray-200 bg-gray-50/60 p-3" data-testid="unmapped-columns">
    <template v-if="headers.length">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-semibold text-[#364152]">
          {{ t('unmappedColumnsTitle', { default: 'Unmapped file columns' }) }}
        </p>
        <span class="text-[11px] text-[#697586] whitespace-nowrap">
          {{ headers.length }} {{ t('columnsUnused', { default: 'columns unused' }) }}
        </span>
      </div>
      <p class="mt-0.5 text-[11px] text-[#697586]">
        {{ t('unmappedColumnsDesc', { default: 'These columns will not be imported.' }) }}
      </p>
      <ul class="mt-2 flex flex-wrap gap-1.5">
        <li
          v-for="header in headers"
          :key="header"
          class="px-2 py-0.5 text-[11px] rounded-full bg-white border border-gray-200 text-[#4B5565]"
        >
          {{ header }}
        </li>
      </ul>
    </template>

    <p v-else class="text-xs text-[#4B5565]">
      {{ t('allColumnsMapped', { default: 'Every column in the file is mapped.' }) }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * The file's leftover columns.
 *
 * A field-oriented editor shows what the *fields* got, which leaves the opposite
 * question — what in the file is being dropped — invisible. Since a column the
 * user never notices is silently discarded on import, the leftovers are named
 * explicitly.
 */
import { useTranslate } from '../../adapters.js'

defineProps<{
  /** File headers no field is mapped to. */
  headers: string[]
}>()

const t = useTranslate()
</script>
