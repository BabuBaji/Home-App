import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': 'http://127.0.0.1:8080',   // not localhost: it can resolve to IPv6 (::1), which Docker's port forward may not answer
      '/socket.io': { target: 'http://127.0.0.1:8080', ws: true },
    },
  },
})
