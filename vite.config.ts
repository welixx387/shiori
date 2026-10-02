import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH позволяет собрать сайт для размещения не в корне домена
// (например, `BASE_PATH=./ npm run build` для статического хостинга в подпапке).
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Библиотеки — отдельными файлами: они редко меняются и дольше живут в кэше браузера.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          data: ['@tanstack/react-query', 'zustand'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
