import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes: [
    // Redirect root to create mode kept in App.vue shell
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true }
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { guest: true }
    },
    {
      path: '/dynamic',
      name: 'dynamic',
      component: () => import('@/views/DynamicQRView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/dynamic/:id',
      name: 'campaign-detail',
      component: () => import('@/views/CampaignDetailView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    // Catch-all: handled by App.vue's Create/Scan mode logic
    { path: '/:pathMatch(.*)*', name: 'home', component: () => import('@/views/HomeView.vue') }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && auth.user?.role !== 'admin') {
    return { name: 'dynamic' }
  }
  if (to.meta.guest && auth.token) {
    return { name: 'dynamic' }
  }
})

export default router
