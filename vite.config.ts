import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Local dev/preview proxy only. Hosted static Demo Mode must work without API
// keys; production secrets belong behind server-side functions, never VITE_*.
// Gemini supports direct browser calls; Groq needs a same-origin proxy in dev.
const aiProxyRules = {
  "/api/groq": {
    target: "https://api.groq.com",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/groq/, ""),
  },
};

export default defineConfig({
  plugins: [react()],

  server: {
    host: true, // 等同無 "dev": "vite --host", 指令
    // 原始碼位在實體機（Host），而 Vite 執行在 Linux 容器內。在某些情況下（特別是 Docker Desktop），Linux 的 inotify 機制無法接收到來自 Host 檔案系統的變更事件。
    watch: {
      usePolling: true, // 強制使用輪詢監聽檔案變更
      interval: 100, // 每 100ms 檢查一次
    },
    proxy: aiProxyRules,
  },

  preview: {
    proxy: aiProxyRules,
  },

  test: {
    setupFiles: ["src/test/setup.ts"],
  },
});
