<script setup lang="ts">
import { ref, onMounted, computed, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/utils/api'
import StyledQRCode from '@/components/StyledQRCode.vue'
import QRCodeFrame from '@/components/QRCodeFrame.vue'
import { Chart, registerables } from 'chart.js'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CornerDotType, CornerSquareType, DotType, ErrorCorrectionLevel } from 'qr-code-styling'
import type { FrameStyle } from '@/utils/framePresets'
import { downloadPngElement, downloadJpgElement, downloadSvgElement } from '@/utils/convertToImage'

Chart.register(...registerables)

const route = useRoute()
const router = useRouter()

interface Scan {
  id: number; ip: string; user_agent: string
  country: string | null; city: string | null
  latitude: number | null; longitude: number | null; created_at: string
}
interface Analytics {
  campaign: {
    id: number; name: string; destination_url: string; short_code: string
    fg_color: string; bg_color: string; logo_url: string | null; qr_options: string | null
  }
  stats: { total: number; today: number; thisWeek: number; thisMonth: number }
  recentScans: Scan[]
  dailyScans: { day: string; count: number }[]
  topCountries: { country: string; count: number }[]
  coordinates: { latitude: number; longitude: number; country: string; city: string }[]
}

const data = ref<Analytics | null>(null)
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)
const chartCanvas = ref<HTMLCanvasElement | null>(null)
const countryChartCanvas = ref<HTMLCanvasElement | null>(null)
const mapDiv = ref<HTMLDivElement | null>(null)
let chartInstance: Chart | null = null
let countryChartInstance: Chart | null = null
let mapInstance: L.Map | null = null

// ── Full style edit form ──────────────────────────────────────────────────
const styleForm = ref({
  // Campaign meta
  name: '',
  destination_url: '',
  // QR dimensions (affects export/download size, not thumbnail)
  width: 300,
  height: 300,
  margin: 10,
  borderRadius: 0,
  // Background
  includeBackground: true,
  background: '#ffffff',
  // Logo
  image: null as string | null,   // base64 data URL
  imageMargin: 0,
  // Dots
  dotsColor: '#000000',
  dotsType: 'square' as DotType,
  // Corners square
  cornersSquareColor: '#000000',
  cornersSquareType: 'extra-rounded' as CornerSquareType,
  // Corners dot
  cornersDotColor: '#000000',
  cornersDotType: 'dot' as CornerDotType,
  // Error correction
  errorCorrectionLevel: 'Q' as ErrorCorrectionLevel,
  // Frame
  showFrame: false,
  frameText: 'Scan for more info',
  frameTextPosition: 'bottom' as 'top' | 'bottom' | 'left' | 'right',
  frameStyle: {
    textColor: '#000000',
    backgroundColor: '#ffffff',
    borderColor: '#000000',
    borderWidth: '1px',
    borderRadius: '8px',
    padding: '16px',
  } as FrameStyle,
})

const DOT_TYPES: DotType[] = ['square', 'dots', 'rounded', 'classy', 'classy-rounded', 'extra-rounded']
const CORNER_SQUARE_TYPES: CornerSquareType[] = ['square', 'extra-rounded', 'dot']
const CORNER_DOT_TYPES: CornerDotType[] = ['square', 'dot']
const ECL_LEVELS: ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H']

function loadLogoFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => { styleForm.value.image = (ev.target as FileReader).result as string }
  reader.readAsDataURL(file)
}

function clearLogo() { styleForm.value.image = null }

function downloadCampaignQR(format: 'png' | 'jpg' | 'svg') {
  const el = document.getElementById('campaign-qr-export')
  if (!el) return
  const name = (styleForm.value.name || 'qr-code').replace(/[^a-zA-Z0-9_-]/g, '_')

  // Use the element's actual rendered dimensions × quality multiplier
  // This handles both plain QR and framed QR correctly regardless of size
  const QUALITY = 3
  const naturalW = el.offsetWidth || styleForm.value.width
  const naturalH = el.offsetHeight || styleForm.value.height
  const size = { width: naturalW * QUALITY, height: naturalH * QUALITY }

  // Don't clip with QR border-radius when a frame is visible —
  // the frame has its own border-radius via inline styles
  const radius = styleForm.value.showFrame ? '0px' : `${styleForm.value.borderRadius}px`

  if (format === 'png') downloadPngElement(el, `${name}.png`, size, radius)
  else if (format === 'jpg') downloadJpgElement(el, `${name}.jpg`, { ...size, bgcolor: 'white' }, radius)
  else downloadSvgElement(el, `${name}.svg`, size, radius)
}

// ── Live QR preview built from styleForm ─────────────────────────────────
const PREVIEW_SIZE = 200

const liveQrStyle = computed(() => ({
  background: styleForm.value.includeBackground ? styleForm.value.background : 'transparent',
  borderRadius: `${styleForm.value.borderRadius}px`,
}))

const liveQrProps = computed(() => ({
  data: trackingUrl.value || 'https://example.com',
  width: PREVIEW_SIZE,
  height: PREVIEW_SIZE,
  margin: styleForm.value.margin,
  image: styleForm.value.image ?? undefined,
  imageOptions: { margin: styleForm.value.imageMargin, crossOrigin: 'anonymous' },
  dotsOptions: { color: styleForm.value.dotsColor, type: styleForm.value.dotsType },
  cornersSquareOptions: { color: styleForm.value.cornersSquareColor, type: styleForm.value.cornersSquareType },
  cornersDotOptions: { color: styleForm.value.cornersDotColor, type: styleForm.value.cornersDotType },
  backgroundOptions: { color: styleForm.value.includeBackground ? styleForm.value.background : 'transparent' },
  qrOptions: { errorCorrectionLevel: styleForm.value.errorCorrectionLevel },
}))

// ── helpers ───────────────────────────────────────────────────────────────
const trackingUrl = computed(() =>
  data.value ? `${window.location.origin}/r/${data.value.campaign.short_code}` : ''
)

function populateFormFromCampaign() {
  const c = data.value!.campaign
  let opts: Record<string, unknown> | null = null
  try { opts = c.qr_options ? JSON.parse(c.qr_options) : null } catch { opts = null }

  styleForm.value = {
    name: c.name,
    destination_url: c.destination_url,
    width: (opts?.width as number) ?? 300,
    height: (opts?.height as number) ?? 300,
    margin: (opts?.margin as number) ?? 10,
    borderRadius: parseInt((opts?.style as Record<string,string>)?.borderRadius ?? '0') || 0,
    includeBackground: (opts?.includeBackground as boolean) ?? true,
    background: (opts?.style as Record<string,string>)?.background ?? c.bg_color ?? '#ffffff',
    image: (opts?.image as string) ?? null,
    imageMargin: (opts?.imageOptions as Record<string,number>)?.margin ?? 0,
    dotsColor: (opts?.dotsOptions as Record<string,string>)?.color ?? c.fg_color ?? '#000000',
    dotsType: ((opts?.dotsOptions as Record<string,string>)?.type ?? 'square') as DotType,
    cornersSquareColor: (opts?.cornersSquareOptions as Record<string,string>)?.color ?? c.fg_color ?? '#000000',
    cornersSquareType: ((opts?.cornersSquareOptions as Record<string,string>)?.type ?? 'extra-rounded') as CornerSquareType,
    cornersDotColor: (opts?.cornersDotOptions as Record<string,string>)?.color ?? c.fg_color ?? '#000000',
    cornersDotType: ((opts?.cornersDotOptions as Record<string,string>)?.type ?? 'dot') as CornerDotType,
    errorCorrectionLevel: ((opts?.qrOptions as Record<string,string>)?.errorCorrectionLevel ?? 'Q') as ErrorCorrectionLevel,
    // Frame
    showFrame: !!(opts?.frame),
    frameText: (opts?.frame as Record<string,string>)?.text ?? 'Scan for more info',
    frameTextPosition: ((opts?.frame as Record<string,string>)?.position ?? 'bottom') as 'top' | 'bottom' | 'left' | 'right',
    frameStyle: {
      textColor: (opts?.frame as Record<string,Record<string,string>>)?.style?.textColor ?? '#000000',
      backgroundColor: (opts?.frame as Record<string,Record<string,string>>)?.style?.backgroundColor ?? '#ffffff',
      borderColor: (opts?.frame as Record<string,Record<string,string>>)?.style?.borderColor ?? '#000000',
      borderWidth: (opts?.frame as Record<string,Record<string,string>>)?.style?.borderWidth ?? '1px',
      borderRadius: (opts?.frame as Record<string,Record<string,string>>)?.style?.borderRadius ?? '8px',
      padding: (opts?.frame as Record<string,Record<string,string>>)?.style?.padding ?? '16px',
    } as FrameStyle,
  }
}

async function load() {
  try {
    data.value = await api.get(`/campaigns/${route.params.id}/analytics`)
    populateFormFromCampaign()
    await nextTick()
    renderCharts()
    renderMap()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    loading.value = false
  }
}

function renderCharts() {
  if (!data.value) return

  // Daily scans line chart
  if (chartCanvas.value) {
    chartInstance?.destroy()
    chartInstance = new Chart(chartCanvas.value, {
      type: 'line',
      data: {
        labels: data.value.dailyScans.map(d => d.day),
        datasets: [{
          label: 'Scans',
          data: data.value.dailyScans.map(d => d.count),
          borderColor: data.value.campaign.fg_color || '#4ade80',
          backgroundColor: `${data.value.campaign.fg_color || '#4ade80'}22`,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    })
  }

  // Top countries bar chart
  if (countryChartCanvas.value && data.value.topCountries.length > 0) {
    countryChartInstance?.destroy()
    countryChartInstance = new Chart(countryChartCanvas.value, {
      type: 'bar',
      data: {
        labels: data.value.topCountries.map(c => c.country),
        datasets: [{
          label: 'Scans',
          data: data.value.topCountries.map(c => c.count),
          backgroundColor: data.value.campaign.fg_color || '#4ade80'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    })
  }
}

function renderMap() {
  if (!mapDiv.value || !data.value) return
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
  }
  mapInstance = L.map(mapDiv.value).setView([20, 0], 2)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(mapInstance)

  for (const coord of data.value.coordinates) {
    if (coord.latitude && coord.longitude) {
      L.circleMarker([coord.latitude, coord.longitude], {
        radius: 6,
        fillColor: data.value.campaign.fg_color || '#4ade80',
        color: '#fff',
        weight: 1,
        fillOpacity: 0.8
      })
        .addTo(mapInstance)
        .bindPopup(`${coord.city || ''} ${coord.country || ''}`.trim() || 'Unknown')
    }
  }
}

async function saveCampaign() {
  saveError.value = ''
  saveSuccess.value = false
  saving.value = true
  try {
    // Build the full qr_options snapshot from the edit form
    const snapshot = {
      image: styleForm.value.image ?? null,
      width: styleForm.value.width,
      height: styleForm.value.height,
      margin: styleForm.value.margin,
      imageOptions: { margin: styleForm.value.imageMargin, crossOrigin: 'anonymous' },
      dotsOptions: { color: styleForm.value.dotsColor, type: styleForm.value.dotsType },
      cornersSquareOptions: { color: styleForm.value.cornersSquareColor, type: styleForm.value.cornersSquareType },
      cornersDotOptions: { color: styleForm.value.cornersDotColor, type: styleForm.value.cornersDotType },
      backgroundOptions: { color: styleForm.value.includeBackground ? styleForm.value.background : 'transparent' },
      qrOptions: { errorCorrectionLevel: styleForm.value.errorCorrectionLevel },
      style: {
        background: styleForm.value.includeBackground ? styleForm.value.background : 'transparent',
        borderRadius: `${styleForm.value.borderRadius}px`,
      },
      includeBackground: styleForm.value.includeBackground,
      frame: styleForm.value.showFrame ? {
        text: styleForm.value.frameText,
        position: styleForm.value.frameTextPosition,
        style: styleForm.value.frameStyle,
      } : null,
    }
    const updated = await api.put(`/campaigns/${route.params.id}`, {
      name: styleForm.value.name,
      destination_url: styleForm.value.destination_url,
      fg_color: styleForm.value.dotsColor,
      bg_color: styleForm.value.includeBackground ? styleForm.value.background : '#ffffff',
      qr_options: JSON.stringify(snapshot),
    })
    data.value!.campaign = updated
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
    await nextTick()
    renderCharts()
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Save failed'
  } finally {
    saving.value = false
  }
}

function copyTrackingUrl() {
  navigator.clipboard.writeText(trackingUrl.value)
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6">
    <!-- Back -->
    <button @click="router.push('/dynamic')" class="mb-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8l8 8l1.41-1.41L7.83 13H20z"/></svg>
      All Campaigns
    </button>

    <div v-if="loading" class="space-y-4">
      <div class="h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      <div class="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
    </div>

    <div v-else-if="error" class="rounded-xl bg-red-50 p-6 text-red-600 dark:bg-red-900/20 dark:text-red-400">{{ error }}</div>

    <template v-else-if="data">
      <div class="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{{ data.campaign.name }}</h2>
          <div class="mt-1 flex items-center gap-2">
            <span class="max-w-xs truncate text-sm text-zinc-500 dark:text-zinc-400">{{ trackingUrl }}</span>
            <button @click="copyTrackingUrl" class="shrink-0 rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400">
              Copy
            </button>
          </div>
        </div>
      </div>

      <!-- Stats row -->
      <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div v-for="(label, key) in { total: 'Total Scans', today: 'Today', thisWeek: 'This Week', thisMonth: 'This Month' }" :key="key"
          class="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ label }}</p>
          <p class="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{{ (data.stats as Record<string, number>)[key] }}</p>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- QR Code + Edit -->
        <div class="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <h3 class="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">Campaign Settings</h3>

          <!-- Live preview -->
          <div class="mb-3 flex flex-col items-center gap-2">
            <div id="campaign-qr-export" class="grid place-items-center">
              <QRCodeFrame v-if="styleForm.showFrame"
                :frame-text="styleForm.frameText"
                :text-position="styleForm.frameTextPosition"
                :frame-style="styleForm.frameStyle"
              >
                <template #qr-code>
                  <div class="overflow-hidden rounded-xl" :style="liveQrStyle">
                    <StyledQRCode v-bind="liveQrProps" />
                  </div>
                </template>
              </QRCodeFrame>
              <div v-else class="overflow-hidden rounded-xl" :style="liveQrStyle">
                <StyledQRCode v-bind="liveQrProps" />
              </div>
            </div>
            <div class="flex gap-2">
              <button type="button" @click="downloadCampaignQR('png')"
                class="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600">PNG</button>
              <button type="button" @click="downloadCampaignQR('jpg')"
                class="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600">JPG</button>
              <button type="button" @click="downloadCampaignQR('svg')"
                class="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600">SVG</button>
            </div>
          </div>

          <form @submit.prevent="saveCampaign" class="space-y-3">
            <!-- 1. Name -->
            <div>
              <label class="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Name</label>
              <input v-model="styleForm.name" type="text" required
                class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
            </div>
            <!-- Destination URL -->
            <div>
              <label class="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Destination URL</label>
              <input v-model="styleForm.destination_url" type="url" required
                class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
              <p class="mt-0.5 text-xs text-zinc-400">Change this to redirect the existing QR code to a new destination</p>
            </div>

            <!-- 2. Background -->
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p class="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Background</p>
              <div class="flex flex-wrap items-center gap-3">
                <label class="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  <input type="checkbox" v-model="styleForm.includeBackground" class="rounded" />
                  Enable background
                </label>
                <div v-if="styleForm.includeBackground" class="flex items-center gap-2">
                  <input v-model="styleForm.background" type="color"
                    class="h-7 w-12 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600" />
                  <span class="text-xs text-zinc-500">{{ styleForm.background }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <label class="text-xs text-zinc-600 dark:text-zinc-400">Border Radius</label>
                  <input v-model.number="styleForm.borderRadius" type="number" min="0" max="50"
                    class="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
                  <span class="text-xs text-zinc-400">px</span>
                </div>
              </div>
            </div>

            <!-- 3. Width / Height / Margin -->
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p class="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Size &amp; Margin</p>
              <div class="flex flex-wrap gap-3">
                <div class="flex items-center gap-1.5">
                  <label class="text-xs text-zinc-600 dark:text-zinc-400">W</label>
                  <input v-model.number="styleForm.width" type="number" min="100" max="2000"
                    class="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
                </div>
                <div class="flex items-center gap-1.5">
                  <label class="text-xs text-zinc-600 dark:text-zinc-400">H</label>
                  <input v-model.number="styleForm.height" type="number" min="100" max="2000"
                    class="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
                </div>
                <div class="flex items-center gap-1.5">
                  <label class="text-xs text-zinc-600 dark:text-zinc-400">Margin</label>
                  <input v-model.number="styleForm.margin" type="number" min="0" max="100"
                    class="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
                </div>
              </div>
            </div>

            <!-- 1. Logo -->
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p class="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Logo</p>
              <div v-if="styleForm.image" class="mb-2 flex items-center gap-2">
                <img :src="styleForm.image" class="h-10 w-10 rounded object-contain" alt="Logo preview" />
                <button type="button" @click="clearLogo"
                  class="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
              <input type="file" accept="image/*" @change="loadLogoFile"
                class="w-full text-xs text-zinc-500 file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-xs dark:file:bg-zinc-700" />
              <div class="mt-2 flex items-center gap-2">
                <label class="text-xs text-zinc-600 dark:text-zinc-400">Image Margin</label>
                <input v-model.number="styleForm.imageMargin" type="number" min="0" max="40"
                  class="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
              </div>
            </div>

            <!-- 5. Dots -->
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p class="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Dots</p>
              <div class="flex flex-wrap items-center gap-3">
                <div class="flex items-center gap-2">
                  <label class="text-xs text-zinc-600 dark:text-zinc-400">Color</label>
                  <input v-model="styleForm.dotsColor" type="color"
                    class="h-7 w-12 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600" />
                </div>
                <div class="flex items-center gap-2">
                  <label class="text-xs text-zinc-600 dark:text-zinc-400">Type</label>
                  <select v-model="styleForm.dotsType"
                    class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100">
                    <option v-for="t in DOT_TYPES" :key="t" :value="t">{{ t }}</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- 6. Corners Square -->
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p class="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Corners Square</p>
              <div class="flex flex-wrap items-center gap-3">
                <div class="flex items-center gap-2">
                  <label class="text-xs text-zinc-600 dark:text-zinc-400">Color</label>
                  <input v-model="styleForm.cornersSquareColor" type="color"
                    class="h-7 w-12 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600" />
                </div>
                <div class="flex items-center gap-2">
                  <label class="text-xs text-zinc-600 dark:text-zinc-400">Type</label>
                  <select v-model="styleForm.cornersSquareType"
                    class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100">
                    <option v-for="t in CORNER_SQUARE_TYPES" :key="t" :value="t">{{ t }}</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- 7. Corners Dot -->
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p class="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Corners Dot</p>
              <div class="flex flex-wrap items-center gap-3">
                <div class="flex items-center gap-2">
                  <label class="text-xs text-zinc-600 dark:text-zinc-400">Color</label>
                  <input v-model="styleForm.cornersDotColor" type="color"
                    class="h-7 w-12 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600" />
                </div>
                <div class="flex items-center gap-2">
                  <label class="text-xs text-zinc-600 dark:text-zinc-400">Type</label>
                  <select v-model="styleForm.cornersDotType"
                    class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100">
                    <option v-for="t in CORNER_DOT_TYPES" :key="t" :value="t">{{ t }}</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- 8. Error Correction Level -->
            <div class="flex items-center gap-3">
              <label class="text-xs font-medium text-zinc-600 dark:text-zinc-400">Error Correction</label>
              <select v-model="styleForm.errorCorrectionLevel"
                class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100">
                <option v-for="lvl in ECL_LEVELS" :key="lvl" :value="lvl">{{ lvl }}</option>
              </select>
            </div>

            <!-- 9. Frame -->
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div class="mb-2 flex items-center gap-2">
                <input id="show-frame-analytics" type="checkbox" v-model="styleForm.showFrame" class="rounded" />
                <label for="show-frame-analytics" class="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Add Frame</label>
              </div>
              <template v-if="styleForm.showFrame">
                <div class="mb-3">
                  <label class="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Frame Text</label>
                  <input v-model="styleForm.frameText" type="text"
                    class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
                </div>
                <div class="mb-3">
                  <label class="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Text Position</label>
                  <div class="flex gap-3">
                    <label v-for="pos in ['top','bottom','left','right']" :key="pos" class="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                      <input type="radio" v-model="styleForm.frameTextPosition" :value="pos" /> {{ pos }}
                    </label>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="mb-1 block text-xs text-zinc-500">Text Color</label>
                    <input type="color" v-model="styleForm.frameStyle.textColor" class="h-7 w-12 cursor-pointer rounded border border-zinc-300" />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-zinc-500">Background</label>
                    <input type="color" v-model="styleForm.frameStyle.backgroundColor" class="h-7 w-12 cursor-pointer rounded border border-zinc-300" />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-zinc-500">Border Color</label>
                    <input type="color" v-model="styleForm.frameStyle.borderColor" class="h-7 w-12 cursor-pointer rounded border border-zinc-300" />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-zinc-500">Border Width</label>
                    <input v-model="styleForm.frameStyle.borderWidth" type="text" placeholder="1px"
                      class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-zinc-500">Border Radius</label>
                    <input v-model="styleForm.frameStyle.borderRadius" type="text" placeholder="8px"
                      class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-zinc-500">Padding</label>
                    <input v-model="styleForm.frameStyle.padding" type="text" placeholder="16px"
                      class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
                  </div>
                </div>
              </template>
            </div>

            <p v-if="saveError" class="text-xs text-red-600 dark:text-red-400">{{ saveError }}</p>
            <p v-if="saveSuccess" class="text-xs text-green-600 dark:text-green-400">Saved successfully!</p>

            <button type="submit" :disabled="saving"
              class="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              {{ saving ? 'Saving…' : 'Save Changes' }}
            </button>
          </form>
        </div>

        <!-- Daily scans chart -->
        <div class="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <h3 class="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">Scans (last 30 days)</h3>
          <canvas ref="chartCanvas" class="max-h-64 w-full" />
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <!-- Map -->
        <div class="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <h3 class="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">Scan Locations</h3>
          <div ref="mapDiv" class="h-64 w-full overflow-hidden rounded-lg" />
        </div>

        <!-- Top countries -->
        <div class="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <h3 class="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">Top Countries</h3>
          <div v-if="data.topCountries.length === 0" class="flex h-40 items-center justify-center text-sm text-zinc-400">No data yet</div>
          <canvas v-else ref="countryChartCanvas" class="max-h-64 w-full" />
        </div>
      </div>

      <!-- Recent scans table -->
      <div class="mt-6 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div class="border-b border-zinc-200 p-5 dark:border-zinc-700">
          <h3 class="font-semibold text-zinc-900 dark:text-zinc-100">Recent Scans</h3>
        </div>
        <div v-if="data.recentScans.length === 0" class="px-5 py-8 text-center text-sm text-zinc-400">No scans recorded yet</div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="dark:bg-zinc-750 bg-zinc-50">
              <tr class="text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                <th class="px-4 py-3">Location</th>
                <th class="px-4 py-3">Browser</th>
                <th class="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-700">
              <tr v-for="scan in data.recentScans" :key="scan.id" class="dark:hover:bg-zinc-750 hover:bg-zinc-50">
                <td class="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {{ [scan.city, scan.country].filter(Boolean).join(', ') || 'Unknown' }}
                </td>
                <td class="max-w-xs truncate px-4 py-3 text-zinc-500 dark:text-zinc-400" :title="scan.user_agent">
                  {{ scan.user_agent?.split(' ').slice(-1)[0] || '—' }}
                </td>
                <td class="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                  {{ new Date(scan.created_at).toLocaleString() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
