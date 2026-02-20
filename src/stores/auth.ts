import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/utils/api'
import router from '@/router'

export interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'user'
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('auth_token'))
  const user = ref<User | null>(JSON.parse(localStorage.getItem('auth_user') || 'null'))

  const isAdmin = computed(() => user.value?.role === 'admin')
  const isLoggedIn = computed(() => !!token.value)

  function setAuth(newToken: string, newUser: User) {
    token.value = newToken
    user.value = newUser
    localStorage.setItem('auth_token', newToken)
    localStorage.setItem('auth_user', JSON.stringify(newUser))
  }

  function clearAuth() {
    token.value = null
    user.value = null
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
  }

  async function login(email: string, password: string) {
    const data = await api.post('/auth/login', { email, password })
    setAuth(data.token, data.user)
  }

  async function register(name: string, email: string, password: string) {
    const data = await api.post('/auth/register', { name, email, password })
    setAuth(data.token, data.user)
  }

  async function logout() {
    clearAuth()
    router.push('/login')
  }

  async function fetchMe() {
    try {
      if (!token.value) return
      const data = await api.get('/auth/me')
      user.value = data.user
      localStorage.setItem('auth_user', JSON.stringify(data.user))
    } catch {
      clearAuth()
    }
  }

  return { token, user, isAdmin, isLoggedIn, login, register, logout, fetchMe }
})
