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

  // Static pages
  app.get('/sitemap-static.xml', async (request, reply) => {
    const pages = [
      { loc: '/', priority: '1.0', changefreq: 'daily' },
      { loc: '/kontakt', priority: '0.5', changefreq: 'monthly' },
      { loc: '/o-nas', priority: '0.5', changefreq: 'monthly' },
      { loc: '/skup-silnikow', priority: '0.6', changefreq: 'monthly' },
      { loc: '/blog', priority: '0.7', changefreq: 'weekly' },
    ];

    const xml = buildSitemap(pages);
    reply.header('Content-Type', 'application/xml').send(xml);
  });

  // Categories
  app.get('/sitemap-categories.xml', async (request, reply) => {
    const categories = await prisma.category.findMany({
      select: { slug: true, updatedAt: true },
    });

    const pages = categories.map((c) => ({
      loc: `/${c.slug}`,
      lastmod: c.updatedAt.toISOString(),
      priority: '0.8',
      changefreq: 'weekly',
    }));

    reply.header('Content-Type', 'application/xml').send(buildSitemap(pages));
  });

  // Products
  app.get('/sitemap-products.xml', async (request, reply) => {
    const products = await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      select: {
        marketplaces: true,
        updatedAt: true,
        categories: {
          include: { category: { select: { slug: true } } },
          take: 1,
        },
      },
    });

    const pages = products
      .filter((p) => {
        const mp = p.marketplaces as any;
        return mp?.ownStore?.slug && p.categories.length > 0;
      })
      .map((p) => {
        const mp = p.marketplaces as any;
        const catSlug = p.categories[0]?.category?.slug;
        return {
          loc: `/${catSlug}/${mp.ownStore.slug}`,
          lastmod: p.updatedAt.toISOString(),
          priority: '0.7',
          changefreq: 'weekly',
        };
      });

    reply.header('Content-Type', 'application/xml').send(buildSitemap(pages));
  });

  // Manufacturers
  app.get('/sitemap-manufacturers.xml', async (request, reply) => {
    const manufacturers = await prisma.manufacturer.findMany({
      select: { slug: true, updatedAt: true },
    });

    const pages = manufacturers.map((m) => ({
      loc: `/marka-producent/${m.slug}`,
      lastmod: m.updatedAt.toISOString(),
      priority: '0.6',
      changefreq: 'monthly',
    }));

    reply.header('Content-Type', 'application/xml').send(buildSitemap(pages));
  });

  // Power pages
  app.get('/sitemap-power-pages.xml', async (request, reply) => {
    const powers = [
      '0.09', '0.12', '0.18', '0.25', '0.37', '0.55', '0.75',
      '1.1', '1.5', '2.2', '3', '4', '5.5', '7.5', '11', '18.5',
      '22', '30', '55', '75', '110', '160', '200',
    ];
    const rpms = ['700', '900', '1400', '2900'];

    const pages: SitemapEntry[] = [];

    // Strony samej mocy
    for (const p of powers) {
      const slug = p.replace('.', '-');
      pages.push({
        loc: `/silniki-elektryczne-${slug}-kw`,
        priority: '0.7',
        changefreq: 'weekly',
      });

      // Moc + obroty (tylko do 18.5 kW)
      if (parseFloat(p) <= 18.5) {
        for (const r of rpms) {
          pages.push({
            loc: `/silniki-elektryczne-${slug}-kw-${r}-obr`,
            priority: '0.6',
            changefreq: 'weekly',
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
      '/reklamacje',
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
  priority?: string;
  changefreq?: string;
}

function buildSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${SITE_URL}${e.loc}</loc>
    ${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}
    ${e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : ''}
    ${e.priority ? `<priority>${e.priority}</priority>` : ''}
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}
