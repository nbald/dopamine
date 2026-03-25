import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token;
  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
