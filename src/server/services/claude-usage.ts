import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface UsageData {
  session5h: { usedPercent: number; resetsAt: string | null };
  weekly: { usedPercent: number; resetsAt: string | null };
  extraUsage: { enabled: boolean; monthlyLimit: number; usedCredits: number; utilization: number } | null;
}

let cache: { data: UsageData | null; fetchedAt: number; token: string | null } = { data: null, fetchedAt: 0, token: null };
const CACHE_TTL = 60_000;

function readOAuthToken(): string | null {
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  try {
    const raw = fs.readFileSync(credPath, 'utf-8');
    const creds = JSON.parse(raw);
    return creds.claudeAiOauth?.accessToken
      || creds.accessToken
      || creds.access_token
      || null;
  } catch {
    return null;
  }
}

function timeUntilReset(resetsAt: string | null): { elapsedPercent: number; label: string } {
  if (!resetsAt) return { elapsedPercent: 0, label: '' };
  const now = Date.now();
  const resetTime = new Date(resetsAt).getTime();
  const remaining = Math.max(0, resetTime - now);
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return { elapsedPercent: 0, label: `${d}d ${h % 24}h left` };
  }
  return { elapsedPercent: 0, label: `${h}h${m.toString().padStart(2, '0')}m left` };
}

export async function getClaudeUsage(): Promise<UsageData | null> {
  const now = Date.now();
  // Always re-read token (it may have been refreshed)
  const token = readOAuthToken();
  if (!token) return null;

  // Only use cache if token hasn't changed
  if (cache.data && now - cache.fetchedAt < CACHE_TTL && cache.token === token) {
    return cache.data;
  }

  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    });

    if (!res.ok) return cache.data || null;

    const raw = await res.json() as any;

    const data: UsageData = {
      session5h: {
        usedPercent: raw.five_hour?.utilization ?? 0,
        resetsAt: raw.five_hour?.resets_at ?? null,
      },
      weekly: {
        usedPercent: raw.seven_day?.utilization ?? 0,
        resetsAt: raw.seven_day?.resets_at ?? null,
      },
      extraUsage: raw.extra_usage?.is_enabled ? {
        enabled: true,
        monthlyLimit: raw.extra_usage.monthly_limit ?? 0,
        usedCredits: raw.extra_usage.used_credits ?? 0,
        utilization: raw.extra_usage.utilization ?? 0,
      } : null,
    };

    cache = { data, fetchedAt: now, token };
    return data;
  } catch {
    return cache.data || null;
  }
}
