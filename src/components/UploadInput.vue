<template>
  <div class="w-full ">
    <h2 v-if="title" class="text-md font-semibold text-[#364152] mb-4">
      {{ title }}
    </h2>

    <div
      v-if="!file"
      class="h-full border border-[#E3E8EF] rounded-2xl flex flex-col justify-center items-center text-center px-6 cursor-pointer transition-all duration-200 focus-within:border-[2px] focus-within:border-[#4F74E3]"
      :class="[isDragging ? 'border-2 border-[#4F74E3]' : '']"
      @click="triggerUpload"
      @dragenter.prevent="isDragging = true"
      @dragover.prevent
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
      :style="{ height: height }"
      tabindex="0"
    >
      <div
        class="w-10 h-10 mb-4 mt-4 border border-[#CDD5DF] rounded-xl shadow-[0_1px_2px_0_rgba(10,13,18,0.05)] flex items-center justify-center"
      >
        <CloudArrowUpIcon class="w-5 h-5 text-[#364152]" />
      </div>

      <div class="text-sm">
        <button
          type="button"
          class="text-[#3344ee] font-semibold cursor-pointer hover:underline mr-1"
          @click.stop="triggerUpload"
        >
          {{ t("cvUploadClickToUpload") }}
        </button>
        <span class="text-[#4B5565] font-normal">
          {{ t("cvUploadDDragDrop") }}
        </span>
      </div>
      <p class="text-sm text-[#667085] mt-2 mb-4">
        {{ formatInfoText }}
      </p>
    </div>

    <div v-else class="w-full p-3 bg-white rounded-xl border border-[#E5E7EB]">
      <div class="flex justify-between items-start">
        <div class="flex gap-3 flex-1">
          <div class="w-10 h-12 flex items-center justify-center">
            <img
              v-if="previewUrl"
              :src="previewUrl"
              class="h-10 w-10 object-cover rounded-md"
            />
            <span
              v-else
              :class="[
                badgeColor,
                'text-white text-[10px] font-semibold px-2 py-[2px] rounded-md',
              ]"
            >
              {{ fileTypeBadge }}
            </span>
          </div>

          <div class="flex flex-col w-full">
            <div v-if="typeof file === 'string'" class="mb-2">
              <img :src="file" class="h-10 rounded-md" />
            </div>
            <p class="text-[#364152] text-sm font-medium text-left truncate max-w-0 flex-1">
              {{ displayName }}
            </p>
            <p class="text-xs text-[#4B5565] flex items-center gap-1">
              {{ displaySizeText }}

              <span
                v-if="fileObj && !fileObj.url"
                class="mx-1 w-px h-3 bg-[#D0D5DD] inline-block"
              ></span>

                              <span
                  v-if="uploadProgress < 100"
                  class="text-[#98A2B3] flex items-center gap-1"
                >
                  <CloudArrowUpIcon class="w-4 h-4" />
                  {{ t("cvUploadUploading") }}
                </span>

                              <span
                  v-else
                  class="text-[#079455] font-medium flex items-center gap-1"
                >
                  <span
                    class="w-3 h-3 rounded-full border border-[#079455] flex items-center justify-center bg-white"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-3 h-3 text-[#079455]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="3"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </span>
                  {{ t("cvUploadUploaded") }}
                </span>
            </p>

            <div class="flex items-center gap-2 mt-2 w-full">
              <div class="flex-1 h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  class="h-full bg-[#4F74E3] transition-all duration-300 rounded-full"
                  :style="{ width: uploadProgress + '%' }"
                ></div>
              </div>
              <p class="text-sm text-[#364152] w-[35px] text-right">
                {{ uploadProgress }}%
              </p>
            </div>
          </div>
        </div>

        <button @click.stop="resetUpload" class="text-[#98A2B3] ml-3">
          <TrashIcon class="w-4 h-4" />
        </button>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      :accept="accept || '.pdf,.doc,.docx'"
      class="hidden"
      @change="handleFile"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { CloudArrowUpIcon, TrashIcon } from "@heroicons/vue/24/solid";
import { useTranslate, useNotify } from "../adapters";

/**
 * The value the component holds / emits. Mirrors the host-app behavior:
 *  - a raw `File` (non-image/video uploads),
 *  - an object-URL string (image/video previews emitted via update:modelValue),
 *  - a `{ url, file }` pair (internal preview state for image/video),
 *  - a pre-existing remote value (`{ name, size, url? }`) supplied by the host,
 *  - or `null` / `""` when empty.
 *
 * Kept intentionally permissive (`UploadValue`) to preserve the original
 * untyped contract while still avoiding `any` at the public boundary.
 */
type UploadFileLike = {
  url?: string;
  file?: File;
  name?: string;
  size?: number;
  type?: string;
};
export type UploadValue = File | string | UploadFileLike | null;

const props = defineProps<{
  title?: string;
  formatInfo?: string;
  accept?: string;
  modelValue?: UploadValue;
  instantUpload?: boolean;
  height?: string;
}>();

const emit = defineEmits<{
  (e: "progress", value: number): void;
  (e: "change", value: UploadValue): void;
  (e: "update:modelValue", value: UploadValue): void;
}>();

// Injected seams (replace host-app vue-i18n + toast).
const t = useTranslate();
const notify = useNotify();

const file = ref<UploadValue>(
  props.modelValue && props.modelValue !== "" ? props.modelValue : null,
);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const uploadProgress = ref(0);

// Watch for modelValue changes
watch(
  () => props.modelValue,
  (newValue) => {
    // Empty string or null/undefined -> reset file to null
    if (!newValue || newValue === "") {
      file.value = null;
    } else {
      file.value = newValue;
    }
  },
  { immediate: true },
);

// Default accept types for different use cases
const defaultAcceptTypes = {
  ".pdf,.doc,.docx": [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ],
  ".pdf,.docx,.xlsx,.csv": [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
  ],
  ".jpg,.jpeg,.png,.svg": [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/svg+xml",
  ],
  ".jpg,.jpeg,.png,.svg,.gif": [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/svg+xml",
    "image/gif",
  ],
  ".mp4,.avi,.mov": ["video/mp4", "video/avi", "video/quicktime"],
  ".jpg,.jpeg,.png,.svg,.mp4,.avi,.mov": [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/svg+xml",
    "video/mp4",
    "video/avi",
    "video/quicktime",
  ],
  // For AboutModal - images and videos
  ".jpg,.jpeg,.png,.svg,.mp4,.avi,.mov,.gif,.webp,.webm": [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/svg+xml",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/avi",
    "video/quicktime",
    "video/webm",
  ],
};

const acceptedTypes = computed(() => {
  const acceptKey = props.accept || ".pdf,.doc,.docx";
  return (
    defaultAcceptTypes[acceptKey as keyof typeof defaultAcceptTypes] ||
    defaultAcceptTypes[".pdf,.doc,.docx"]
  );
});

const formatInfoText = computed(() => {
  // Show a dedicated format hint when video files are accepted
  if (
    props.accept &&
    (props.accept.includes(".mp4") ||
      props.accept.includes(".mov") ||
      props.accept.includes(".gif"))
  ) {
    return props.formatInfo || "MP4, MOV veya GIF (max. 10MB)";
  }
  return props.formatInfo || t("cvUploadFormatInfo");
});

// --- typed view helpers (keep the permissive UploadValue safe in template) ---
/** The current value as the object-shaped view, or null for File/string/empty. */
const fileObj = computed<UploadFileLike | null>(() => {
  const f = file.value;
  if (!f || typeof f === "string" || f instanceof File) return null;
  return f;
});

/** Preview/object URL when the value carries one. */
const previewUrl = computed<string | null>(() => fileObj.value?.url ?? null);

/** Display file name across all value shapes. */
const displayName = computed<string>(() => {
  const f = file.value;
  if (!f || typeof f === "string") return "";
  if (f instanceof File) return f.name;
  const obj = fileObj.value;
  return obj?.file?.name ?? obj?.name ?? "";
});

/** Display size text (in MB), or empty string when unknown. */
const displaySizeText = computed<string>(() => {
  const f = file.value;
  let size: number | undefined;
  if (f instanceof File) size = f.size;
  else {
    const obj = fileObj.value;
    size = obj?.file?.size ?? obj?.size;
  }
  if (size === undefined) return "";
  return formatSize(size) + " of 16 MB";
});

// --- computed section ---
const fileTypeBadge = computed(() => {
  const f = file.value;
  if (!f) return "PDF";
  const obj = fileObj.value;
  if (obj && obj.url && obj.file) return "IMG";
  if (typeof f === "string") return "IMG";
  if (typeof f !== "string" && f.type) {
    const type = f.type;
    if (type.includes("pdf")) return "PDF";
    if (type.includes("word") || type.includes("document")) return "DOC";
    if (type.includes("image")) return "IMG";
    if (type.includes("video")) return "VID";
  }
  return "FILE";
});

const badgeColor = computed(() => {
  const type = fileTypeBadge.value;
  switch (type) {
    case "PDF":
      return "bg-[#EF4444]";
    case "DOC":
      return "bg-[#3B82F6]";
    case "IMG":
      return "bg-[#10B981]";
    case "VID":
      return "bg-[#8B5CF6]";
    default:
      return "bg-[#6B7280]";
  }
});

function triggerUpload() {
  fileInputRef.value?.click();
}

function formatSize(size: number) {
  const mb = size / (1024 * 1024);
  return mb.toFixed(1) + " MB";
}

function handleFile(e: Event | DragEvent) {
  let selectedFile: File | null = null;

  if ("dataTransfer" in e) {
    selectedFile = e.dataTransfer?.files?.[0] || null;
  } else {
    selectedFile = (e.target as HTMLInputElement).files?.[0] || null;
  }

  if (!selectedFile || !acceptedTypes.value.includes(selectedFile.type)) {
    notify({ type: "error", message: t("cvUploadInvalidFileType") });
    if (fileInputRef.value) {
      fileInputRef.value.value = "";
    }
    return;
  }

  // For image/video keep both the preview url and the file object
  const isImage = selectedFile.type.startsWith("image/");
  const isVideo = selectedFile.type.startsWith("video/");
  if (isImage || isVideo) {
    const url = URL.createObjectURL(selectedFile);
    file.value = { url, file: selectedFile };
    uploadProgress.value = 0;
    simulateUpload();
    isDragging.value = false;
    emit("change", url);
    emit("update:modelValue", url);
  } else {
    file.value = selectedFile;
    uploadProgress.value = 0;
    simulateUpload();
    isDragging.value = false;
    emit("change", selectedFile);
    emit("update:modelValue", selectedFile);
  }
}

function simulateUpload() {
  if (props.instantUpload) {
    // Instant upload - immediately set to 100%
    uploadProgress.value = 100;
    emit("progress", uploadProgress.value);
    return;
  }

  const interval = setInterval(() => {
    if (uploadProgress.value >= 100) {
      clearInterval(interval);
    } else {
      uploadProgress.value += 10;
      emit("progress", uploadProgress.value);
    }
  }, 400);
}

function resetUpload() {
  file.value = null;
  uploadProgress.value = 0;
  if (fileInputRef.value) {
    fileInputRef.value.value = "";
  }
  emit("change", null);
  emit("update:modelValue", null);
}

function handleDrop(e: DragEvent) {
  handleFile(e);
  isDragging.value = false;
}

// Expose resetUpload function for parent components
defineExpose({
  resetUpload,
});
</script>
