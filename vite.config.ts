import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // Relative base for easier local deployment if needed
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    },
    server: {
        port: 3000,
    }
});
