import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Vite hanya melayani host localhost secara bawaan (pengaman DNS rebinding).
    // Tanpa baris ini, membuka demo lewat port forwarding VS Code dibalas
    // "Blocked request. This host is not allowed." Titik di depan berarti
    // semua subdomain, jadi tidak perlu diubah tiap URL tunnel berganti.
    allowedHosts: ['.devtunnels.ms'],

    // Backend Express di 4000. Frontend cukup panggil /api/v1/... tanpa
    // memikirkan CORS atau base URL saat dev.
    //
    // Lewat tunnel ini sekaligus berarti cukup SATU port yang di-forward:
    // browser tamu memanggil /api ke host tunnel, Vite yang meneruskannya ke
    // localhost:4000 di mesin ini — backend tidak perlu publik sama sekali.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
