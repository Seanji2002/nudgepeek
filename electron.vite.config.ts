import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          widget: resolve('src/preload/widget.ts'),
          history: resolve('src/preload/history.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          widget: resolve('src/renderer/widget/index.html'),
          history: resolve('src/renderer/history/index.html'),
        },
      },
    },
  },
})
