<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/utils/api'
import StyledQRCode from '@/components/StyledQRCode.vue'
import { Chart, registerables } from 'chart.js'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

Chart.register(...registerables)

const route = useRoute()
const router = useRouter()

interface Scan {
  id: number
  ip: string
  user_agent: string
  country: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  created_at: string
}

interface Analytics {
  campaign: {
    id: number
    name: string
    destination_url: string
    short_code: string
    fg_color: string
    bg_color: string
    logo_url: string | null
    qr_options: string | null
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

// Edit form
const editForm = ref({
  name: '',
  destination_url: '',
  fg_color: '#000000',
  bg_color: '#ffffff',
  logo: null as File | null
})

const trackingUrl = computed(() =>
  data.value ? `${window.location.origin}/r/${data.value.campaign.short_code}` : ''
)

const parsedQrOptions = computed(() => {
  if (!data.value?.campaign.qr_options) return null
  try { return JSON.parse(data.value.campaign.qr_options) } catch { return null }
})

const qrPreviewStyle = computed(() => {
  if (parsedQrOptions.value?.style) return parsedQrOptions.value.style
  return { background: editForm.value.bg_color }
})

const qrPreviewProps = computed(() => {
  if (parsedQrOptions.value) {
    const { style: _s, includeBackground: _ib, ...rest } = parsedQrOptions.value
    return { ...rest, data: trackingUrl.value, width: 140, height: 140 }
  }
  return {
    data: trackingUrl.value, width: 140, height: 140,
    dotsOptions: { color: editForm.value.fg_color, type: 'square' },
    cornersSquareOptions: { color: editForm.value.fg_color },
    cornersDotOptions: { color: editForm.value.fg_color }
  }
})

async function load() {
  try {
    data.value = await api.get(`/campaigns/${route.params.id}/analytics`)
    const c = data.value!.campaign
    editForm.value = {
      name: c.name,
      destination_url: c.destination_url,
      fg_color: c.fg_color,
      bg_color: c.bg_color,
      logo: null
    }
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
    const fd = new FormData()
    fd.append('name', editForm.value.name)
    fd.append('destination_url', editForm.value.destination_url)
    fd.append('fg_color', editForm.value.fg_color)
    fd.append('bg_color', editForm.value.bg_color)
    if (editForm.value.logo) fd.append('logo', editForm.value.logo)
    const updated = await api.putForm(`/campaigns/${route.params.id}`, fd)
    data.value!.campaign = updated
    saveSuccess.value = true
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

          <div class="mb-4 flex justify-center">
            <div class="grid place-items-center overflow-hidden rounded-xl" :style="qrPreviewStyle">
              <StyledQRCode v-bind="qrPreviewProps" />
            </div>
          </div>

          <form @submit.prevent="saveCampaign" class="space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Name</label>
              <input v-model="editForm.name" type="text" required
                class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Destination URL</label>
              <input v-model="editForm.destination_url" type="url" required
                class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
              <p class="mt-0.5 text-xs text-zinc-400">Change this to redirect the existing QR code to a new destination</p>
            </div>
            <div class="flex gap-4">
              <div class="flex-1">
                <label class="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">QR Color</label>
                <input v-model="editForm.fg_color" type="color" class="h-8 w-16 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600" />
              </div>
              <div class="flex-1">
                <label class="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Background</label>
                <input v-model="editForm.bg_color" type="color" class="h-8 w-16 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600" />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Logo (optional)</label>
              <input type="file" accept="image/*" @change="(e) => { editForm.logo = (e.target as HTMLInputElement).files?.[0] || null }"
                class="w-full text-xs text-zinc-500 file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-xs dark:file:bg-zinc-700" />
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
