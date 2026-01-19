import { defineConfig } from 'vite';

export default defineConfig({
    base: '/box-breathing-app/', // Correct base for GitHub Pages
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    },
    server: {
        port: 3000,
    }
});
