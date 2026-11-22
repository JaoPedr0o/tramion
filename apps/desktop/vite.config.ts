import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuração do Vite voltada ao Tauri (somente desktop).
export default defineConfig({
  plugins: [react()],
  // Não esconde os erros do Rust no terminal.
  clearScreen: false,
  server: {
    // O Tauri espera uma porta fixa: falha se ela estiver ocupada.
    port: 1420,
    strictPort: true,
    // O Vite não precisa observar o código Rust.
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
