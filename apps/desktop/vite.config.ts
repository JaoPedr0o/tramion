import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuração do Vite voltada ao Tauri (somente desktop).
export default defineConfig({
  plugins: [react()],
  // Não esconde os erros do Rust no terminal.
  clearScreen: false,
  optimizeDeps: {
    // Carregados só quando o usuário os usa (importação dinâmica). Se o Vite os descobrisse no meio da sessão,
    // reotimizaria tudo e o editor acabaria com duas cópias do ProseMirror ("Duplicate use of selection JSON ID").
    include: [
      "@blocknote/core",
      "@blocknote/react",
      "@blocknote/mantine",
      "@blocknote/core/emoji-data",
      "highlight.js/lib/core",
    ],
  },
  server: {
    // O Tauri espera uma porta fixa: falha se ela estiver ocupada.
    port: 1420,
    strictPort: true,
    // O Vite não precisa observar o código Rust.
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
