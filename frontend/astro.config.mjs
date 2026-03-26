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
  prefetch: {
    defaultStrategy: "viewport",
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
