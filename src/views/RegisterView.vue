<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const name = ref('')
const email = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match'
    return
  }
  loading.value = true
  try {
    await auth.register(name.value, email.value, password.value)
    router.push('/dynamic')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Registration failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-white p-4 dark:bg-zinc-900">
    <div class="w-full max-w-sm space-y-6">
      <div class="text-center">
        <h1 class="text-3xl font-bold text-zinc-900 dark:text-zinc-100">SDS QR Manager</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Create an account to use dynamic QR codes</p>
      </div>

      <form @submit.prevent="submit" class="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800">
        <div>
          <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</label>
          <input v-model="name" type="text" required placeholder="Your name"
            class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
          <input v-model="email" type="email" required placeholder="you@example.com"
            class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Password</label>
          <input v-model="password" type="password" required placeholder="••••••••"
            class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Confirm Password</label>
          <input v-model="confirm" type="password" required placeholder="••••••••"
            class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
        </div>

        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {{ error }}
        </p>

        <button type="submit" :disabled="loading"
          class="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
          {{ loading ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <p class="text-center text-sm text-zinc-500 dark:text-zinc-400">
        Already have an account?
        <RouterLink to="/login" class="font-medium text-zinc-900 underline dark:text-zinc-100">Sign in</RouterLink>
      </p>
    </div>
  </div>
</template>
