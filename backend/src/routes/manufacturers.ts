// backend/src/routes/manufacturers.ts
import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function manufacturerRoutes(app: FastifyInstance) {
  // GET /api/manufacturers - All manufacturers z liczbą produktów IN-STOCK.
  // Zliczamy ręcznie po (manufacturerId = m.id OR manufacturer = m.name),
  // bo produkty są łączone z producentem na dwa sposoby:
  //   1. relacja FK (manufacturerId)
  //   2. string match po nazwie (historycznie, większość produktów)
  // Wcześniej Prisma _count brał tylko relację → ABB 3 zamiast 10 zgodnie z detail page.
  app.get("/", async () => {
    const [manufacturers, inStock] = await Promise.all([
      prisma.manufacturer.findMany({ orderBy: { name: "asc" } }),
      prisma.product.findMany({
        where: { stock: { gt: 0 } },
        select: { manufacturer: true, manufacturerId: true },
      }),
    ]);

    const data = manufacturers.map((m) => {
      const nameNorm = (m.name || "").toLowerCase().trim();
      let count = 0;
      for (const p of inStock) {
        if (p.manufacturerId && p.manufacturerId === m.id) {
          count++;
          continue;
        }
        if (
          p.manufacturer &&
          p.manufacturer.toLowerCase().trim() === nameNorm
        ) {
          count++;
        }
      }
      return { ...m, _count: { products: count } };
    });

    return { success: true, data };
  });

  // GET /api/manufacturers/:slug - Single manufacturer
  app.get("/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const manufacturer = await prisma.manufacturer.findFirst({
      where: {
        OR: [
          { slug },
          { slug: `marka-producent/${slug}` },
          { slug: { startsWith: `${slug}-` } },
          { slug: { startsWith: `marka-producent/${slug}-` } },
          // Reverse: DB slug ends shorter, URL slug is longer
          // e.g. DB has "marka-producent/bauer", URL has "bauer-gear-motor"
          { slug: { endsWith: `/${slug.split("-")[0]}` } },
        ],
      },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!manufacturer) {
      return reply
        .status(404)
        .send({ success: false, error: "Producent nie znaleziony" });
    }

    return { success: true, data: manufacturer };
  });
}
