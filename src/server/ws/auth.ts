import type { IncomingMessage } from 'node:http';
import { verifyToken } from '../auth.js';

export function authenticateUpgrade(req: IncomingMessage): boolean {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );
  const token = cookies.token;
  return !!token && verifyToken(token);
}
