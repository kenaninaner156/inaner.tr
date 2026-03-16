import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'TIR Muhasebe Uygulaması V2',
        short_name: 'TIR Muhasebe V2',
        description: 'Kamyon ve TIR taşımacılığı gelir gider hesaplama uygulaması',
        theme_color: '#0f172a', /* slate-900 */
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'tir-clear.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'tir-clear.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
