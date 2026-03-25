import { Router } from 'express';
import { isSetupDone, login, verifyToken } from '../auth.js';
import { loginLimiter } from '../middleware/rate-limit.js';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

router.get('/status', (req, res) => {
  const needsSetup = !isSetupDone();
  const token = req.cookies?.token;
  const authenticated = token ? verifyToken(token) : false;
  res.json({ needsSetup, authenticated });
});

router.post('/setup', (_req, res) => {
  res.status(403).json({ error: 'Use "npm run reset-password" on the server' });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password required' });
    return;
  }

  const token = await login(password);
  if (!token) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  res.cookie('token', token, COOKIE_OPTIONS);
  res.status(204).end();
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token', { path: '/', httpOnly: true, secure: true, sameSite: 'strict' });
  res.status(204).end();
});

export default router;
