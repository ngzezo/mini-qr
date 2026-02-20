<script setup lang="ts">
import QRCodeCreate from '@/components/QRCodeCreate.vue'
import QRCodeScan from '@/components/QRCodeScan.vue'
import { ref, computed } from 'vue'

enum AppMode {
  Create = 'create',
  Scan = 'scan'
}

const capturedData = ref<string>('')
const qrCodeScanRef = ref<InstanceType<typeof QRCodeScan> | null>(null)

const appMode = ref<AppMode>(AppMode.Create)
const setAppMode = (mode: AppMode) => {
  if (
    appMode.value === AppMode.Scan &&
    mode === AppMode.Create &&
    qrCodeScanRef.value?.capturedData
  ) {
    capturedData.value = qrCodeScanRef.value.capturedData
  }
  appMode.value = mode
}

const isModeToggleDisabled = computed(() => {
  return appMode.value === AppMode.Scan && !!qrCodeScanRef.value && !!qrCodeScanRef.value.isLoading
})

const useCapturedDataInCreateMode = (data: string) => {
  capturedData.value = data
  appMode.value = AppMode.Create
}

defineExpose({ appMode, setAppMode, isModeToggleDisabled, AppMode })
</script>

<template>
  <div class="w-full lg:w-5/6">
    <!-- Inner mode toggle (mobile sub-bar) -->
    <div class="mb-4 flex justify-center md:hidden">
      <div class="flex gap-1 rounded-lg border border-zinc-300 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
        <button
          :class="[
            'flex items-center gap-1 rounded-md px-3 py-1.5 text-sm outline-none transition-colors',
            appMode === AppMode.Create
              ? 'bg-white text-zinc-900 shadow dark:bg-zinc-700 dark:text-zinc-100'
              : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
          ]"
          @click="setAppMode(AppMode.Create)"
          :disabled="isModeToggleDisabled"
        >
          Create
        </button>
        <button
          :class="[
            'flex items-center gap-1 rounded-md px-3 py-1.5 text-sm outline-none transition-colors',
            appMode === AppMode.Scan
              ? 'bg-white text-zinc-900 shadow dark:bg-zinc-700 dark:text-zinc-100'
              : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
          ]"
          @click="setAppMode(AppMode.Scan)"
          :disabled="isModeToggleDisabled"
        >
          Scan
        </button>
      </div>
    </div>

    <div v-if="appMode === AppMode.Create">
      <QRCodeCreate :initial-data="capturedData" />
    </div>
    <div v-else class="flex flex-col items-center justify-center py-8">
      <QRCodeScan ref="qrCodeScanRef" @create-qr="useCapturedDataInCreateMode" />
    </div>
  </div>
</template>
