import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const isDesktop = env.VITE_APP_TARGET === "desktop"

  return {
    base: isDesktop ? "./" : "/",
    plugins: [tailwindcss(), react()],
    build: {
      emptyOutDir: false,
      outDir: isDesktop ? path.resolve(__dirname, "../desktop/dist/web") : path.resolve(__dirname, "dist"),
    },
    resolve: {
      alias: {
        "@/AppEntry": path.resolve(__dirname, isDesktop ? "./src/App.desktop.tsx" : "./src/App.tsx"),
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:12789',
          changeOrigin: true,
        },
        '/v1beta': {
          target: 'http://localhost:12789',
          changeOrigin: true,
        },
        '/v1': {
          target: 'http://localhost:12789',
          changeOrigin: true,
        },
        '/auth': {
          target: 'http://localhost:12789',
          changeOrigin: true,
        },
      },
    },
  }
})
