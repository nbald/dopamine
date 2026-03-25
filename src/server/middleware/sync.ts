import type { Request, Response, NextFunction } from 'express';
import { broadcastSync } from '../ws/handler.js';

export function syncMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') {
    next();
    return;
  }

  // After the response is sent, broadcast sync to all WS clients
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      broadcastSync();
    }
  });

  next();
}
