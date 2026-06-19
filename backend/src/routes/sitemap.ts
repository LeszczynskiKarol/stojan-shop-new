// backend/src/routes/sitemap.ts
import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

const SITE_URL = 'https://www.silniki-elektryczne.com.pl';

export async function sitemapRoutes(app: FastifyInstance) {
  // Sitemap Index
  app.get('/sitemap_index.xml', async (request, reply) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE_URL}/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-categories.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-products.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-manufacturers.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-power-pages.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-blog.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-legal.xml</loc></sitemap>
</sitemapindex>`;

    reply.header('Content-Type', 'application/xml').send(xml);
  });

  // Static pages — w tym lokalne landing pages dla większych miast PL
  app.get('/sitemap-static.xml', async (request, reply) => {
    const cities = [
      'torun', 'bydgoszcz', 'warszawa', 'poznan', 'lodz', 'gdansk',
      'wroclaw', 'krakow', 'katowice', 'bielsko-biala', 'lublin',
    ];
    // Landingi motoreduktorów (marki/cechy) — INDEKSOWALNE strony obsługiwane przez
    // frontend [categorySlug]/index.astro (MOTO_LANDINGS). Przy zmianie listy zaktualizuj OBA miejsca.
    const motoLandings = [
      'motoreduktory-sew',
      'motoreduktory-nord',
      'motoreduktory-lenze',
      'motoreduktory-walcowe',
      'motoreduktory-plaskie',
      'motoreduktory-katowe',
      'motoreduktory-stozkowe',
      'motoreduktory-slimakowe',
      'motoreduktory-planetarne',
      'motoreduktory-z-hamulcem',
      'motoreduktory-wolnoobrotowe',
    ];
    const pages = [
      { loc: '/' },
      { loc: '/kontakt' },
      { loc: '/o-nas' },
      { loc: '/skup-silnikow' },
      { loc: '/blog' },
      ...cities.map((c) => ({ loc: `/silniki-elektryczne-${c}` })),
      ...motoLandings.map((s) => ({ loc: `/${s}` })),
    ];

    const xml = buildSitemap(pages);
    reply.header('Content-Type', 'application/xml').send(xml);
  });

  // Categories — wyklucz power-pages (`silniki-elektryczne-*`), są w sitemap-power-pages.xml.
  // Historycznie w tabeli Category leżą też power-pages — dedup po stronie sitemap.
  app.get('/sitemap-categories.xml', async (request, reply) => {
    const categories = await prisma.category.findMany({
      select: { slug: true, updatedAt: true },
      where: { NOT: { slug: { startsWith: 'silniki-elektryczne-' } } },
    });

    const pages = categories.map((c) => ({
      loc: `/${c.slug}`,
      lastmod: c.updatedAt.toISOString(),
      priority: '0.8',
      changefreq: 'weekly',
    }));

    reply.header('Content-Type', 'application/xml').send(buildSitemap(pages));
  });

  // Products — z image sitemap extension (Google Images)
  app.get('/sitemap-products.xml', async (request, reply) => {
    const products = await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      select: {
        name: true,
        mainImage: true,
        images: true,
        galleryImages: true,
        marketplaces: true,
        updatedAt: true,
        categories: {
          include: { category: { select: { slug: true } } },
          take: 1,
        },
      },
    });

    const entries = products
      .filter((p) => {
        const mp = p.marketplaces as any;
        return mp?.ownStore?.slug && p.categories.length > 0;
      })
      .map((p) => {
        const mp = p.marketplaces as any;
        const catSlug = p.categories[0]?.category?.slug;
        const allImages = [
          p.mainImage,
          ...(p.images || []),
          ...(p.galleryImages || []),
        ].filter((img, i, arr): img is string => !!img && arr.indexOf(img) === i);
        return {
          loc: `/${catSlug}/${mp.ownStore.slug}`,
          lastmod: p.updatedAt.toISOString(),
          images: allImages.slice(0, 1000), // limit per spec
          name: p.name,
        };
      });

    reply.header('Content-Type', 'application/xml').send(buildProductSitemap(entries));
  });

  // Manufacturers — tylko z produktami w magazynie (analogicznie do power-pages)
  app.get('/sitemap-manufacturers.xml', async (request, reply) => {
    const manufacturers = await prisma.manufacturer.findMany({
      select: { id: true, slug: true, name: true, updatedAt: true },
    });

    // Pobierz listę producentów którzy mają produkty w stocku (po id lub po nazwie)
    const inStock = await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      select: { manufacturer: true, manufacturerId: true },
    });
    const idsInStock = new Set<string>();
    const namesInStock = new Set<string>();
    for (const p of inStock) {
      if (p.manufacturerId) idsInStock.add(p.manufacturerId);
      if (p.manufacturer) namesInStock.add(p.manufacturer.toLowerCase().trim());
    }

    const pages = manufacturers
      .filter((m) =>
        idsInStock.has(m.id) || namesInStock.has(m.name.toLowerCase().trim()),
      )
      .map((m) => ({
        // DB-convention: Manufacturer.slug zapisywany jest z prefixem `marka-producent/`
        // (patrz admin-products.ts:206). Strip żeby uniknąć duplikatu segmentu w URL.
        loc: `/marka-producent/${m.slug.replace(/^marka-producent\//, '')}`,
        lastmod: m.updatedAt.toISOString(),
      }));

    reply.header('Content-Type', 'application/xml').send(buildSitemap(pages));
  });

  // Power pages — emit only combinations with in-stock products (no soft 404s in sitemap)
  app.get('/sitemap-power-pages.xml', async (request, reply) => {
    const powers = [
      '0.09', '0.12', '0.18', '0.25', '0.37', '0.55', '0.75',
      '1.1', '1.5', '2.2', '3', '4', '5.5', '7.5', '11', '18.5',
      '22', '30', '55', '75', '110', '160', '200',
    ];
    const rpms = ['700', '900', '1400', '2900'];
    // RPM tolerance buckets — mirror backend/src/routes/products.ts:392-399
    const RPM_BUCKETS: Array<[number, number, string]> = [
      [400, 800, '700'],
      [800, 1200, '900'],
      [1200, 2100, '1400'],
      [2500, 3500, '2900'],
    ];

    const inStockProducts = await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      select: { power: true, rpm: true },
    });

    const powersInStock = new Set<string>();
    const combosInStock = new Set<string>();

    for (const prod of inStockProducts) {
      const pVal = (prod.power as any)?.value;
      if (!pVal) continue;
      const pNum = parseFloat(String(pVal).replace(',', '.'));
      if (!isFinite(pNum)) continue;
      const matchedPower = powers.find((p) => Math.abs(parseFloat(p) - pNum) < 0.01);
      if (!matchedPower) continue;
      powersInStock.add(matchedPower);

      const rVal = (prod.rpm as any)?.value;
      const rNum = rVal ? parseInt(String(rVal), 10) : 0;
      if (!rNum) continue;
      for (const [lo, hi, bucket] of RPM_BUCKETS) {
        if (rNum >= lo && rNum <= hi) {
          combosInStock.add(`${matchedPower}:${bucket}`);
        }
      }
    }

    const pages: SitemapEntry[] = [];

    // Bazowe moce (23) — zawsze w sitemap, nawet bez stocku.
    // Rationale: klient z Google trafia, widzi UX "brak teraz + podobne moce" — wartość.
    // RPM combos (4×23) — tylko z produktami (zbyt dużo niepustych spamuje GSC).
    for (const p of powers) {
      const slug = powerToSlug(p);
      pages.push({
        loc: `/silniki-elektryczne-${slug}-kw`,
      });

      if (parseFloat(p) <= 18.5) {
        for (const r of rpms) {
          if (!combosInStock.has(`${p}:${r}`)) continue;
          pages.push({
            loc: `/silniki-elektryczne-${slug}-kw-${r}-obr`,
          });
        }
      }
    }

    reply.header('Content-Type', 'application/xml').send(buildSitemap(pages));
  });

  // Blog
  app.get('/sitemap-blog.xml', async (request, reply) => {
    const posts = await prisma.blogPost.findMany({
      select: { slug: true, updatedAt: true },
    });

    const pages = posts.map((p) => ({
      loc: `/blog/${p.slug}`,
      lastmod: p.updatedAt.toISOString(),
      priority: '0.6',
      changefreq: 'monthly',
    }));

    reply.header('Content-Type', 'application/xml').send(buildSitemap(pages));
  });

  // Legal
  app.get('/sitemap-legal.xml', async (request, reply) => {
    const legalPages = [
      '/regulamin-sklepu',
      '/polityka-prywatnosci',
      '/przetwarzanie-danych-osobowych',
      '/odstapienie-od-umowy',
      '/koszty-i-czas-wysylki',
      '/formy-platnosci',
      '/warunki-zwrotu',
      // '/reklamacje' usunięte 2026-06-15: strona nie istnieje (404), nie była nigdzie
      // linkowana. Jeśli powstanie dedykowana strona reklamacji — przywrócić wpis.
    ];

    const pages = legalPages.map((loc) => ({
      loc,
      priority: '0.3',
      changefreq: 'yearly',
    }));

    reply.header('Content-Type', 'application/xml').send(buildSitemap(pages));
  });
}

// ============================================
// HELPERS
// ============================================

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  priority?: string;    // ignored — Google nie używa od ~2017
  changefreq?: string;  // ignored — j.w.
}

// Power → slug. Sub-1 kW uses compact 3-digit form ("009") to match DB Category slugs
// and footer internal links (BaseLayout.astro). >=1 kW uses dash for decimal ("5-5").
function powerToSlug(p: string): string {
  if (parseFloat(p) < 1) return p.replace('.', '').padEnd(3, '0');
  return p.replace('.', '-');
}

// XML escape — minimal set wystarczający dla URL-i/nazw produktów
function xe(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

interface ProductSitemapEntry {
  loc: string;
  lastmod: string;
  images: string[];
  name: string;
}

function buildProductSitemap(entries: ProductSitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const imageBlocks = e.images
        .map(
          (img) => `    <image:image>
      <image:loc>${xe(img)}</image:loc>
      <image:title>${xe(e.name)}</image:title>
    </image:image>`,
        )
        .join('\n');
      return `  <url>
    <loc>${SITE_URL}${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
${imageBlocks}
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
}

function buildSitemap(entries: SitemapEntry[]): string {
  // priority + changefreq pomijane — Google nie używa ich od lat. Mniejszy XML, szybszy parsing.
  // Image sitemap variant (xmlns:image) — schema dodaje xmlns nawet bez <image> dla zgodności.
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${SITE_URL}${e.loc}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${e.lastmod}</lastmod>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}
