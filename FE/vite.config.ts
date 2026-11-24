import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const localApi = 'http://127.0.0.1:3000'
const remoteApi = process.env.WDP_DEV_REMOTE_API?.trim()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Use local reads for Admin contracts missing from the deployed API.
      ...(remoteApi ? {
        '^/api/manager/staff/facilities(?:[?]|$)': localApi,
        '^/api/admin/facility-access[?]view=directory$': localApi,
        '^/api/admin/users/[^/?]+/access(?:[?]|$)': localApi,
        '^/api/admin/audit-events[?](?:[^&]*&)*category=(?:ACTIVITY|LOGIN)(?:&|$)': localApi,
      } : {}),
      '/api': remoteApi ? { target: remoteApi, changeOrigin: true } : localApi,
    },
    // Exporting mobile bundles or capturing QA must not reload an active form.
    watch: { ignored: ['**/artifacts/**'] },
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/artifacts/**'] },
  },
})
