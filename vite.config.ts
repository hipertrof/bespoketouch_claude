import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { deeplProxyPlugin } from './vite-plugins/deepl-proxy.js'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // Served from https://<user>.github.io/bespoketouch_claude/ in production;
    // stays at root during `vite dev`.
    base: command === 'build' ? '/bespoketouch_claude/' : '/',
    plugins: [react(), tailwindcss(), deeplProxyPlugin(env.DEEPL_API_KEY)],
  }
})
