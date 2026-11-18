import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { libraryStorePlugin } from './server/libraryPlugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), libraryStorePlugin()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
