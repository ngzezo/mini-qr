<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/utils/api'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const router = useRouter()

interface User {
  id: number; name: string; email: string; role: string; locked: number; created_at: string
}
interface Campaign {
  id: number; name: string; destination_url: string; short_code: string;
  user_name: string; user_email: string; scan_count: number; created_at: string
}
interface Stats {
  totalUsers: number; totalCampaigns: number; totalScans: number
  qrCreatedDaily: { day: string; count: number }[]
  scansDaily: { day: string; count: number }[]
  scansByCampaign: { name: string; count: number }[]
}

const activeTab = ref<'dashboard' | 'users' | 'campaigns' | 'settings'>('dashboard')
const stats = ref<Stats | null>(null)
const users = ref<User[]>([])
const campaigns = ref<Campaign[]>([])
const loading = ref(true)
const error = ref('')

// Settings tab
const currentLogo = ref<string | null>(null)
const currentFavicon = ref<string | null>(null)
const logoFile = ref<File | null>(null)
const faviconFile = ref<File | null>(null)
const settingsSaving = ref(false)
const settingsSuccess = ref('')
const settingsError = ref('')

async function loadSiteSettings() {
  try {
    const data = await api.get('/settings')
    currentLogo.value = (data as Record<string,string>).logo ?? null
    currentFavicon.value = (data as Record<string,string>).favicon ?? null
  } catch { /* ignore */ }
}

async function uploadSetting(type: 'logo' | 'favicon') {
  const file = type === 'logo' ? logoFile.value : faviconFile.value
  if (!file) return
  settingsSaving.value = true
  settingsError.value = ''
  settingsSuccess.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.postForm(`/settings/upload/${type}`, fd)
    if (type === 'logo') {
      currentLogo.value = (res as Record<string,string>).url
      // Update header logo immediately
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (type === 'favicon' && link) link.href = currentFavicon.value!
    } else {
      currentFavicon.value = (res as Record<string,string>).url
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (link) link.href = currentFavicon.value!
    }
    settingsSuccess.value = `${type === 'logo' ? 'Logo' : 'Favicon'} updated! Reload the page to see it in the header.`
    setTimeout(() => { settingsSuccess.value = '' }, 5000)
  } catch (e: unknown) {
    settingsError.value = e instanceof Error ? e.message : 'Upload failed'
  } finally {
    settingsSaving.value = false
  }
}

// User edit modal
const showUserModal = ref(false)
const editUser = ref<Partial<User & { password: string }>>({})
const savingUser = ref(false)
const userError = ref('')

const qrChartCanvas = ref<HTMLCanvasElement | null>(null)
const scanChartCanvas = ref<HTMLCanvasElement | null>(null)
const campaignChartCanvas = ref<HTMLCanvasElement | null>(null)
let qrChart: Chart | null = null
let scanChart: Chart | null = null
let campaignChart: Chart | null = null

async function loadDashboard() {
  try {
    const [s, u, c] = await Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/users'),
      api.get('/admin/campaigns')
    ])
    stats.value = s as Stats
    users.value = u as User[]
    campaigns.value = c as Campaign[]
    setTimeout(renderCharts, 100)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    loading.value = false
  }
}

function renderCharts() {
  if (!stats.value) return
  const s = stats.value

  if (qrChartCanvas.value) {
    qrChart?.destroy()
    qrChart = new Chart(qrChartCanvas.value, {
      type: 'line',
      data: {
        labels: s.qrCreatedDaily.map(d => d.day),
        datasets: [{ label: 'QR Created', data: s.qrCreatedDaily.map(d => d.count), borderColor: '#6366f1', backgroundColor: '#6366f122', fill: true, tension: 0.4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    })
  }

  if (scanChartCanvas.value) {
    scanChart?.destroy()
    scanChart = new Chart(scanChartCanvas.value, {
      type: 'line',
      data: {
        labels: s.scansDaily.map(d => d.day),
        datasets: [{ label: 'Scans', data: s.scansDaily.map(d => d.count), borderColor: '#f59e0b', backgroundColor: '#f59e0b22', fill: true, tension: 0.4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    })
  }

  if (campaignChartCanvas.value && s.scansByCampaign.length > 0) {
    campaignChart?.destroy()
    campaignChart = new Chart(campaignChartCanvas.value, {
      type: 'bar',
      data: {
        labels: s.scansByCampaign.map(c => c.name),
        datasets: [{ label: 'Scans', data: s.scansByCampaign.map(c => c.count), backgroundColor: '#6366f1' }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    })
  }
}

async function toggleLock(userId: number) {
  try {
    const res = await api.put(`/admin/users/${userId}/lock`, {})
    const user = users.value.find(u => u.id === userId)
    if (user) user.locked = res.locked ? 1 : 0
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed')
  }
}

async function deleteUser(userId: number) {
  if (!confirm('Delete this user and all their campaigns?')) return
  try {
    await api.delete(`/admin/users/${userId}`)
    users.value = users.value.filter(u => u.id !== userId)
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed')
  }
}

async function deleteCampaign(id: number) {
  if (!confirm('Delete this campaign?')) return
  try {
    await api.delete(`/admin/campaigns/${id}`)
    campaigns.value = campaigns.value.filter(c => c.id !== id)
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed')
  }
}

function openCreateUser() {
  editUser.value = { role: 'user', password: '' }
  userError.value = ''
  showUserModal.value = true
}

function openEditUser(user: User) {
  editUser.value = { ...user, password: '' }
  userError.value = ''
  showUserModal.value = true
}

async function saveUser() {
  userError.value = ''
  savingUser.value = true
  try {
    if (editUser.value.id) {
      const updated = await api.put(`/admin/users/${editUser.value.id}`, editUser.value)
      const idx = users.value.findIndex(u => u.id === editUser.value.id)
      if (idx !== -1) users.value[idx] = { ...users.value[idx], ...updated }
    } else {
      const created = await api.post('/admin/users', editUser.value)
      users.value.unshift({ ...created, locked: 0 })
    }
    showUserModal.value = false
  } catch (e: unknown) {
    userError.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    savingUser.value = false
  }
}

onMounted(() => {
  loadDashboard()
  loadSiteSettings()
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Admin Panel</h2>
        <p class="text-sm text-zinc-500 dark:text-zinc-400">Manage users, campaigns, and view platform stats</p>
      </div>
      <button @click="router.push('/dynamic')"
        class="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700">
        ← My Campaigns
      </button>
    </div>

    <!-- Tab bar -->
    <div class="mb-6 flex w-fit gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
      <button v-for="tab in (['dashboard', 'users', 'campaigns', 'settings'] as const)" :key="tab"
        @click="activeTab = tab"
        :class="['rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors',
          activeTab === tab ? 'bg-white text-zinc-900 shadow dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400']">
        {{ tab }}
      </button>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
    </div>
    <div v-else-if="error" class="rounded-xl bg-red-50 p-6 text-red-600 dark:bg-red-900/20 dark:text-red-400">{{ error }}</div>

    <!-- DASHBOARD TAB -->
    <template v-else-if="activeTab === 'dashboard' && stats">
      <div class="mb-6 grid grid-cols-3 gap-4">
        <div v-for="(label, key) in { totalUsers: 'Total Users', totalCampaigns: 'Total QR Codes', totalScans: 'Total Scans' }" :key="key"
          class="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ label }}</p>
          <p class="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-100">{{ (stats as Record<string, number>)[key] }}</p>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <h3 class="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">QR Codes Created (30d)</h3>
          <canvas ref="qrChartCanvas" class="max-h-52 w-full" />
        </div>
        <div class="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <h3 class="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">Scans (30d)</h3>
          <canvas ref="scanChartCanvas" class="max-h-52 w-full" />
        </div>
        <div class="col-span-full rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <h3 class="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">Scans per Campaign</h3>
          <canvas ref="campaignChartCanvas" class="max-h-52 w-full" />
        </div>
      </div>
    </template>

    <!-- USERS TAB -->
    <template v-else-if="activeTab === 'users'">
      <div class="mb-4 flex justify-end">
        <button @click="openCreateUser"
          class="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
          + Add User
        </button>
      </div>
      <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <table class="w-full text-sm">
          <thead class="bg-zinc-50 dark:bg-zinc-800">
            <tr class="text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3">Email</th>
              <th class="px-4 py-3">Role</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100 dark:divide-zinc-700">
            <tr v-for="user in users" :key="user.id" class="dark:hover:bg-zinc-750 hover:bg-zinc-50">
              <td class="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{{ user.name }}</td>
              <td class="px-4 py-3 text-zinc-500 dark:text-zinc-400">{{ user.email }}</td>
              <td class="px-4 py-3">
                <span :class="['rounded-full px-2 py-0.5 text-xs font-medium', user.role === 'admin' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300']">
                  {{ user.role }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span :class="['rounded-full px-2 py-0.5 text-xs font-medium', user.locked ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400']">
                  {{ user.locked ? 'Locked' : 'Active' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <button @click="openEditUser(user)" class="text-xs text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400">Edit</button>
                  <button @click="toggleLock(user.id)" class="text-xs text-amber-600 underline hover:text-amber-800 dark:text-amber-400">
                    {{ user.locked ? 'Unlock' : 'Lock' }}
                  </button>
                  <button @click="deleteUser(user.id)" class="text-xs text-red-600 underline hover:text-red-800 dark:text-red-400">Delete</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- CAMPAIGNS TAB -->
    <template v-else-if="activeTab === 'campaigns'">
      <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <table class="w-full text-sm">
          <thead class="bg-zinc-50 dark:bg-zinc-800">
            <tr class="text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
              <th class="px-4 py-3">Campaign</th>
              <th class="px-4 py-3">Owner</th>
              <th class="px-4 py-3">Destination</th>
              <th class="px-4 py-3">Scans</th>
              <th class="px-4 py-3">Created</th>
              <th class="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100 dark:divide-zinc-700">
            <tr v-for="c in campaigns" :key="c.id" class="dark:hover:bg-zinc-750 hover:bg-zinc-50">
              <td class="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{{ c.name }}</td>
              <td class="px-4 py-3 text-zinc-500 dark:text-zinc-400">{{ c.user_name }}</td>
              <td class="max-w-[180px] truncate px-4 py-3 text-zinc-500 dark:text-zinc-400">{{ c.destination_url }}</td>
              <td class="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">{{ c.scan_count }}</td>
              <td class="px-4 py-3 text-zinc-400 dark:text-zinc-500">{{ new Date(c.created_at).toLocaleDateString() }}</td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <button @click="router.push(`/dynamic/${c.id}`)" class="text-xs text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400">Analytics</button>
                  <button @click="deleteCampaign(c.id)" class="text-xs text-red-600 underline hover:text-red-800 dark:text-red-400">Delete</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- SETTINGS TAB -->
    <template v-else-if="activeTab === 'settings'">
      <div class="max-w-lg space-y-6">
        <p class="text-sm text-zinc-500 dark:text-zinc-400">Upload a custom logo and favicon. Changes take effect immediately — reload the page after uploading to see them in the header.</p>

        <!-- Logo upload -->
        <div class="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <h4 class="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">Site Logo</h4>
          <p class="mb-3 text-xs text-zinc-500 dark:text-zinc-400">Shown in the app header. Recommended: square PNG/SVG, min 192×192px.</p>
          <div v-if="currentLogo" class="mb-3 flex items-center gap-3">
            <img :src="currentLogo" alt="Current logo" class="h-14 w-14 rounded-xl border border-zinc-200 object-contain dark:border-zinc-700" />
            <span class="text-xs text-zinc-500">Current logo</span>
          </div>
          <input type="file" accept="image/*" @change="(e) => logoFile = (e.target as HTMLInputElement).files?.[0] ?? null"
            class="mb-3 w-full text-xs text-zinc-500 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 dark:file:bg-zinc-700 dark:file:text-zinc-300" />
          <button type="button" :disabled="!logoFile || settingsSaving" @click="uploadSetting('logo')"
            class="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900">
            {{ settingsSaving ? 'Uploading…' : 'Upload Logo' }}
          </button>
        </div>

        <!-- Favicon upload -->
        <div class="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <h4 class="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">Site Favicon</h4>
          <p class="mb-3 text-xs text-zinc-500 dark:text-zinc-400">Browser tab icon. Recommended: 32×32 ICO or PNG. SVG also supported.</p>
          <div v-if="currentFavicon" class="mb-3 flex items-center gap-3">
            <img :src="currentFavicon" alt="Current favicon" class="h-8 w-8 rounded border border-zinc-200 object-contain dark:border-zinc-700" />
            <span class="text-xs text-zinc-500">Current favicon</span>
          </div>
          <input type="file" accept="image/*,.ico" @change="(e) => faviconFile = (e.target as HTMLInputElement).files?.[0] ?? null"
            class="mb-3 w-full text-xs text-zinc-500 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 dark:file:bg-zinc-700 dark:file:text-zinc-300" />
          <button type="button" :disabled="!faviconFile || settingsSaving" @click="uploadSetting('favicon')"
            class="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900">
            {{ settingsSaving ? 'Uploading…' : 'Upload Favicon' }}
          </button>
        </div>

        <p v-if="settingsError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{{ settingsError }}</p>
        <p v-if="settingsSuccess" class="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">{{ settingsSuccess }}</p>
      </div>
    </template>

    <!-- User Create/Edit Modal -->
    <div v-if="showUserModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="showUserModal = false">
      <div class="w-full max-w-sm rounded-2xl bg-white shadow-xl dark:bg-zinc-800">
        <div class="border-b border-zinc-200 p-5 dark:border-zinc-700">
          <h3 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {{ editUser.id ? 'Edit User' : 'Create User' }}
          </h3>
        </div>
        <form @submit.prevent="saveUser" class="space-y-4 p-5">
          <div>
            <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</label>
            <input v-model="editUser.name" type="text" required
              class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
            <input v-model="editUser.email" type="email" required
              class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password {{ editUser.id ? '(leave blank to keep)' : '' }}
            </label>
            <input v-model="editUser.password" type="password" :required="!editUser.id"
              class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Role</label>
            <select v-model="editUser.role" class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <p v-if="userError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{{ userError }}</p>
          <div class="flex justify-end gap-3 pt-2">
            <button type="button" @click="showUserModal = false"
              class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">Cancel</button>
            <button type="submit" :disabled="savingUser"
              class="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              {{ savingUser ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
