import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Browser clients send the JWT in an httpOnly cookie; headless clients (MCP/Hermès)
  // send it as `Authorization: Bearer <token>`.
  let token: string | undefined = req.cookies?.token;
  if (!token) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) token = header.slice('Bearer '.length).trim();
  }
  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
