import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { deeplProxyPlugin } from './vite-plugins/deepl-proxy.js'
import { membersProxyPlugin } from './vite-plugins/members-proxy.js'
import { guestProxyPlugin } from './vite-plugins/guest-proxy.js'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Base path differs per host:
  //  - Vercel (backend build target): served from root.
  //  - GitHub Pages (legacy): served from /bespoketouch_claude/.
  //  - `vite dev`: root.
  const isVercel = !!process.env.VERCEL
  const base = command === 'build' && !isVercel ? '/bespoketouch_claude/' : '/'
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      deeplProxyPlugin(env.DEEPL_API_KEY),
      membersProxyPlugin({
        url: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "",
        serviceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      }),
      guestProxyPlugin({
        url: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "",
        serviceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        hashSecret: env.GUEST_HASH_SECRET ?? "",
      }),
    ],
  }
})
