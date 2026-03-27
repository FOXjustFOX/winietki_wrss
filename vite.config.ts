import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        include: ["pdfjs-dist/build/pdf.worker.min.mjs"],
    },
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:4000",
                changeOrigin: true,
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    pdfworker: ["pdfjs-dist/build/pdf.worker.min.mjs"],
                },
            },
        },
    },
});
