import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Standard electron-vite layout:
//   main    -> src/main/index.js       (Node: window, tray, HTTP server, focus)
//   preload -> src/preload/index.js     (contextBridge)
//   renderer-> src/renderer/index.html  (React pad grid)
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react()] }
})
