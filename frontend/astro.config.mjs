// frontend/astro.config.mjs
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://www.silniki-elektryczne.com.pl",

  // SSR z Node adapter - dla dynamicznych stron (produkt, koszyk)
  // Statyczne strony (legal, o-nas) będą pre-rendered
  output: "server",
  adapter: node({ mode: "standalone" }),

  build: {
    // Wstaw CSS inline w <style> zamiast <link rel=stylesheet> — usuwa render-blocking
    // requesty CSS (~22 KB) ze ścieżki krytycznej. LCP/FCP strony to tekst H1, którego
    // render czekał na pobranie tych arkuszy (render-delay ~2,4 s w PSI na throttled 4G).
    inlineStylesheets: "always",
  },

  integrations: [
    react(), // React islands - interaktywne komponenty
    tailwind(), // Tailwind CSS
    sitemap({
      // Auto-generowany sitemap (backup do API sitemap)
      filter: (page) =>
        !page.includes("/admin") &&
        !page.includes("/login") &&
        !page.includes("/koszyk"),
    }),
  ],

  // Prerender statyczne strony
  // hover (nie viewport!) — footer ma 80+ linków, viewport-prefetch zalewałby sieć
  // przy każdym scrollu do stopki i blokował wątek główny.
  prefetch: {
    defaultStrategy: "hover",
  },

  vite: {
    server: {
      allowedHosts: ["dev.torweb.pl"],
    },
    define: {
      "import.meta.env.API_URL": JSON.stringify(
        process.env.API_URL || "http://localhost:4000",
      ),
    },
  },
});
