import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { i18n } from './utils/i18n'
import router from './router/index.ts'
import App from './App.vue'
import './index.css'
import './style.css'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

const pinia = createPinia()

createApp(App).use(pinia).use(router).use(i18n).mount('#app')
