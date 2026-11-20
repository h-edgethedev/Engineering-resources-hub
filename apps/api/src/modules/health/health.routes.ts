import { Router } from 'express';
import type { DatabaseHealthCheck } from './health.controller.js';
import { createHealthControllers } from './health.controller.js';

export function createHealthRouter(databaseHealthCheck: DatabaseHealthCheck) {
  const router = Router();
  const controllers = createHealthControllers(databaseHealthCheck);

  router.get('/', controllers.live);
  router.get('/live', controllers.live);
  router.get('/ready', controllers.ready);

  return router;
}
