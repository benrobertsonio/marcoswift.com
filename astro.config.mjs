// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
    site: 'https://marcoswift.netlify.app',
    integrations: [sitemap()],
    vite: {
        plugins: [tailwind()],
    },
});

