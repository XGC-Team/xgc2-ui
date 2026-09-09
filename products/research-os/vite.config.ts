import { markPromptHerdrBridgePlugin } from './markPromptHerdrBridgePlugin'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss(), markPromptHerdrBridgePlugin()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    host: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3200', changeOrigin: false, ws: true } },
  },
})
