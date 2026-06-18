<template>
  <div class="w-full">
    <div class="flex items-center gap-4 py-4 rounded-xl">
      <!-- Logo Placeholder/Image -->
      <div
        class="w-15 h-15 bg-[#F0F2F5] rounded-2xl flex items-center justify-center border-2 border-[#E3E8EF] overflow-hidden"
      >
        <img
          v-if="logoUrl"
          :src="logoUrl"
          :alt="title || t('logo', { default: 'Logo' })"
          class="w-full h-full object-cover"
        />
        <div v-else class="w-8 h-8 text-[#A0A4A8]">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M21 19V5C21 3.9 20.1 3 19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19ZM8.5 13.5L11 16.51L14.5 12L19 18H5L8.5 13.5Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </div>

      <!-- Text Content -->
      <div class="flex flex-col">
        <h3 class="text-base text-[#364152] mb-1">
          {{ title || t('logo', { default: 'Logo' }) }}
        </h3>
        <p class="text-xs text-[#6B7280]">
          {{ formatInfo || t('pngOrJpgMax1024x1024', { default: 'PNG or JPG, max 1024x1024' }) }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTranslate } from '../adapters'

const t = useTranslate()

defineProps<{
  title?: string
  formatInfo?: string
  logoUrl?: string | null
}>()
</script>
