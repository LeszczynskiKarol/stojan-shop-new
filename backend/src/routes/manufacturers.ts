// backend/src/routes/manufacturers.ts
import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function manufacturerRoutes(app: FastifyInstance) {
  // GET /api/manufacturers - All manufacturers with product counts
  app.get("/", async () => {
    const manufacturers = await prisma.manufacturer.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: true } },
      },
    });

    return { success: true, data: manufacturers };
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
