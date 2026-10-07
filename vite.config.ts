import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                prb: resolve(__dirname, 'prb.html'),
            },
            output: {
                manualChunks: {
                    maplibre: ['maplibre-gl', 'maplibre-contour'],
                    turf: ['@turf/boolean-point-in-polygon', '@turf/point-to-polygon-distance'],
                },
            },
        },
        chunkSizeWarningLimit: 1000,
    },
});

