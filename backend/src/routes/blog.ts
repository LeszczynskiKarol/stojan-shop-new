// backend/src/routes/blog.ts
import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function blogRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const { page = '1', limit = '10' } = request.query as Record<string, string>;
    const posts = await prisma.blogPost.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });
    return { success: true, data: posts };
  });

  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const post = await prisma.blogPost.findUnique({ where: { slug } });
    if (!post) return reply.status(404).send({ success: false, error: 'Nie znaleziono' });
    return { success: true, data: post };
  });
}
