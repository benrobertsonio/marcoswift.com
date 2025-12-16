// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
    site: 'https://marcoswift.netlify.app',
    integrations: [sitemap()],
    adapter: netlify(),
    output: 'server',
    vite: {
        plugins: [tailwind()],
    },
});

