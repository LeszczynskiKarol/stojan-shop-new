// backend/src/routes/categories.ts
import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function categoryRoutes(app: FastifyInstance) {
  // GET /api/categories - Wszystkie kategorie (drzewo)
  app.get("/", async () => {
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      orderBy: { order: "asc" },
      include: {
        children: {
          orderBy: { order: "asc" },
          include: { _count: { select: { products: true } } },
        },
        _count: { select: { products: true } },
      },
    });

    return { success: true, data: categories };
  });

  // GET /api/categories/:slug
  app.get("/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const category = await prisma.category.findFirst({
      where: { slug },
      include: {
        children: {
          orderBy: { order: "asc" },
          include: { _count: { select: { products: true } } },
        },
        parent: true,
        _count: { select: { products: true } },
      },
    });

    if (!category) {
      return reply
        .status(404)
        .send({ success: false, error: "Kategoria nie znaleziona" });
    }

    return { success: true, data: category };
  });
}
