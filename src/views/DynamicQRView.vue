<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import StyledQRCode from '@/components/StyledQRCode.vue'

const router = useRouter()
const auth = useAuthStore()

interface Campaign {
  id: number
  name: string
  destination_url: string
  short_code: string
  fg_color: string
  bg_color: string
  logo_url: string | null
  scan_count: number
  created_at: string
}

const campaigns = ref<Campaign[]>([])
const loading = ref(true)
const error = ref('')
const showCreate = ref(false)
const creating = ref(false)
const deleteId = ref<number | null>(null)

// Create form
const form = ref({
  name: '',
  destination_url: '',
  fg_color: '#000000',
  bg_color: '#ffffff',
  logo: null as File | null
})
const formError = ref('')

const redirectBase = computed(() => window.location.origin)

async function loadCampaigns() {
  try {
    campaigns.value = await api.get('/campaigns')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load campaigns'
  } finally {
    loading.value = false
  }
}

async function createCampaign() {
  formError.value = ''
  if (!form.value.name || !form.value.destination_url) {
    formError.value = 'Name and destination URL are required'
    return
  }
  creating.value = true
  try {
    const fd = new FormData()
    fd.append('name', form.value.name)
    fd.append('destination_url', form.value.destination_url)
    fd.append('fg_color', form.value.fg_color)
    fd.append('bg_color', form.value.bg_color)
    if (form.value.logo) fd.append('logo', form.value.logo)
    const campaign = await api.postForm('/campaigns', fd)
    campaigns.value.unshift({ ...campaign, scan_count: 0 })
    showCreate.value = false
    form.value = { name: '', destination_url: '', fg_color: '#000000', bg_color: '#ffffff', logo: null }
  } catch (e: unknown) {
    formError.value = e instanceof Error ? e.message : 'Failed to create'
  } finally {
    creating.value = false
  }
}

async function deleteCampaign(id: number) {
  try {
    await api.delete(`/campaigns/${id}`)
    campaigns.value = campaigns.value.filter(c => c.id !== id)
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Delete failed')
  } finally {
    deleteId.value = null
  }
}

function trackingUrl(code: string) {
  return `${redirectBase.value}/r/${code}`
}

onMounted(loadCampaigns)
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6">
    <!-- Header row -->
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Dynamic QR Codes</h2>
        <p class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          QR codes with changeable destinations and scan tracking
        </p>
      </div>
      <div class="flex gap-2">
        <RouterLink
          v-if="auth.isAdmin"
          to="/admin"
          class="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Admin Panel
        </RouterLink>
        <button
          @click="showCreate = true"
          class="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          + New Campaign
        </button>
      </div>
    </div>

    <!-- Error -->
    <p v-if="error" class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{{ error }}</p>

    <!-- Loading skeleton -->
    <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 3" :key="i" class="h-48 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
    </div>

    <!-- Empty state -->
    <div v-else-if="campaigns.length === 0" class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 py-16 dark:border-zinc-700">
      <svg xmlns="http://www.w3.org/2000/svg" class="mb-3 text-zinc-400" width="48" height="48" viewBox="0 0 24 24">
        <path fill="currentColor" d="M3 11h8V3H3zm2-6h4v4H5zM3 21h8v-8H3zm2-6h4v4H5zm8-12v8h8V3zm6 6h-4V5h4zm-6 12h8v-8h-8zm2-6h4v4h-4z"/>
      </svg>
      <p class="text-zinc-500 dark:text-zinc-400">No dynamic QR campaigns yet</p>
      <button @click="showCreate = true" class="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
        Create your first campaign
      </button>
    </div>

    <!-- Campaign grid -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="campaign in campaigns"
        :key="campaign.id"
        class="group relative flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800"
      >
        <!-- QR preview -->
        <div class="mb-3 flex justify-center">
          <div class="rounded-lg p-2" :style="{ backgroundColor: campaign.bg_color }">
            <StyledQRCode
              :data="trackingUrl(campaign.short_code)"
              :width="120"
              :height="120"
              :dots-options="{ color: campaign.fg_color, type: 'square' }"
              :background-options="{ color: campaign.bg_color }"
              :cornersSquareOptions="{ color: campaign.fg_color }"
              :cornersDotOptions="{ color: campaign.fg_color }"
            />
          </div>
        </div>

        <!-- Info -->
        <div class="flex-1">
          <h3 class="truncate font-semibold text-zinc-900 dark:text-zinc-100">{{ campaign.name }}</h3>
          <p class="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">→ {{ campaign.destination_url }}</p>
          <p class="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">{{ campaign.scan_count }}</span> scans
            &nbsp;·&nbsp;
            <span>{{ new Date(campaign.created_at).toLocaleDateString() }}</span>
          </p>
        </div>

        <!-- Actions -->
        <div class="mt-3 flex gap-2">
          <button
            @click="router.push(`/dynamic/${campaign.id}`)"
            class="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            View Analytics
          </button>
          <button
            @click="deleteId = campaign.id"
            class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Create Campaign Modal -->
    <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="showCreate = false">
      <div class="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-zinc-800">
        <div class="border-b border-zinc-200 p-5 dark:border-zinc-700">
          <h3 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">New Dynamic QR Campaign</h3>
        </div>
        <form @submit.prevent="createCampaign" class="space-y-4 p-5">
          <div>
            <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Campaign Name</label>
            <input v-model="form.name" type="text" required placeholder="My Campaign"
              class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Destination URL</label>
            <input v-model="form.destination_url" type="url" required placeholder="https://example.com"
              class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
            <p class="mt-1 text-xs text-zinc-400">Users will be redirected here when they scan the QR code</p>
          </div>
          <div class="flex gap-4">
            <div class="flex-1">
              <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">QR Color</label>
              <div class="flex items-center gap-2">
                <input v-model="form.fg_color" type="color"
                  class="h-8 w-12 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600" />
                <span class="text-sm text-zinc-500">{{ form.fg_color }}</span>
              </div>
            </div>
            <div class="flex-1">
              <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Background</label>
              <div class="flex items-center gap-2">
                <input v-model="form.bg_color" type="color"
                  class="h-8 w-12 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600" />
                <span class="text-sm text-zinc-500">{{ form.bg_color }}</span>
              </div>
            </div>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Logo (optional)</label>
            <input type="file" accept="image/*" @change="(e) => { form.logo = (e.target as HTMLInputElement).files?.[0] || null }"
              class="w-full text-sm text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:file:bg-zinc-700 dark:file:text-zinc-300" />
          </div>

          <p v-if="formError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{{ formError }}</p>

          <div class="flex justify-end gap-3 pt-2">
            <button type="button" @click="showCreate = false"
              class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700">
              Cancel
            </button>
            <button type="submit" :disabled="creating"
              class="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              {{ creating ? 'Creating…' : 'Create Campaign' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="deleteId !== null" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="deleteId = null">
      <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-800">
        <h3 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Delete Campaign?</h3>
        <p class="mt-2 text-sm text-zinc-500 dark:text-zinc-400">This will permanently delete the campaign and all its scan history.</p>
        <div class="mt-5 flex justify-end gap-3">
          <button @click="deleteId = null"
            class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">
            Cancel
          </button>
          <button @click="deleteCampaign(deleteId!)"
            class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
