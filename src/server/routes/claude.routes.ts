import { Router } from 'express';
import { getClaudeUsage } from '../services/claude-usage.js';

const router = Router();

router.get('/claude/usage', async (_req, res) => {
  const data = await getClaudeUsage();
  if (!data) {
    res.json({ available: false });
    return;
  }
  res.json({ available: true, ...data });
});

export default router;
