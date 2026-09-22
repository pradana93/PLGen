import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/static': 'http://localhost:4000',
      '/check': 'http://localhost:4000',
      '/scan': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/register_user': 'http://localhost:4000',
      '/list_users': 'http://localhost:4000',
      '/delete_user': 'http://localhost:4000',
      '/revoke_user': 'http://localhost:4000',
      '/report_crash': 'http://localhost:4000',
      '/upload_shift': 'http://localhost:4000'
    }
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react','react-dom','react-router-dom','zustand'],
          recharts: ['recharts'],
          excel: ['exceljs','file-saver'],
          supabase: ['@supabase/supabase-js'],
          pdf: ['pdfjs-dist']
        }
      }
    }
  }
})
