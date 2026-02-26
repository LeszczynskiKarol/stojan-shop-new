// backend/src/routes/users.ts
import { FastifyInstance } from 'fastify';

export async function userRoutes(app: FastifyInstance) {
  // TODO: Auth, login, register, profile
  app.get('/', async () => ({ success: true }));
}
