import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { getDb } from './db.js';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

function getJwtSecret(): string {
  const row = getDb().prepare('SELECT jwt_secret FROM auth WHERE id = 1').get() as { jwt_secret: string } | undefined;
  if (!row) throw new Error('Auth not configured');
  return row.jwt_secret;
}

export function signToken(): string {
  const secret = getJwtSecret();
  return jwt.sign({}, secret, { expiresIn: '30d' });
}

/** Long-lived token (no expiry) for headless clients — e.g. the MCP / Hermès integration. */
export function signLongLivedToken(): string {
  const secret = getJwtSecret();
  return jwt.sign({ kind: 'mcp' }, secret);
}

export function verifyToken(token: string): boolean {
  try {
    const secret = getJwtSecret();
    jwt.verify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export function isSetupDone(): boolean {
  const row = getDb().prepare('SELECT id FROM auth WHERE id = 1').get();
  return !!row;
}

export async function login(password: string): Promise<string | null> {
  const row = getDb().prepare('SELECT password_hash FROM auth WHERE id = 1').get() as { password_hash: string } | undefined;
  if (!row) return null;

  const valid = await verifyPassword(row.password_hash, password);
  if (!valid) return null;

  return signToken();
}
