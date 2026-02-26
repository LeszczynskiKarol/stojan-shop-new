// backend/src/routes/legal.ts
import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function legalRoutes(app: FastifyInstance) {
  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const page = await prisma.legalPage.findFirst({ where: { slug, isActive: true } });
    if (!page) return reply.status(404).send({ success: false, error: 'Nie znaleziono' });
    return { success: true, data: page };
  });
}
