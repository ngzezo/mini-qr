import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSiteSettingsStore = defineStore('siteSettings', () => {
  const logoUrl = ref<string | null>(null)
  const faviconUrl = ref<string | null>(null)

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data = await res.json()
      if (data.logo) logoUrl.value = data.logo
      if (data.favicon) {
        faviconUrl.value = data.favicon
        // Update browser favicon dynamically
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
        if (link) link.href = data.favicon
        const appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
        if (appleLink) appleLink.href = data.favicon
      }
    } catch {
      // silently fail — default assets will be used
    }
  }

  return { logoUrl, faviconUrl, loadSettings }
})
