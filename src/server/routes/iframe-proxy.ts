import { Router } from 'express';
import type { Request, Response } from 'express';
import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { getDb } from '../db.js';
import { authenticateUpgrade } from '../ws/auth.js';

const router = Router();

function getIframeUrl(id: number): string | null {
  const row = getDb().prepare('SELECT url FROM iframes WHERE id = ?').get(id) as { url: string } | undefined;
  return row?.url || null;
}

function buildTargetUrl(baseUrl: string, subPath: string): URL {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const sub = subPath.startsWith('/') ? subPath.slice(1) : subPath;
  return new URL(sub, base);
}

function proxyHeaders(headers: IncomingMessage['headers']): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    // Don't leak Dopamine cookies/auth to the target
    if (key === 'host' || key === 'cookie' || key === 'authorization') continue;
    out[key] = value;
  }
  return out;
}

// HTTP reverse proxy
router.use('/:id', (req: Request, res: Response) => {
  const baseUrl = getIframeUrl(Number(req.params.id));
  if (!baseUrl) { res.status(404).end(); return; }

  let targetUrl: URL;
  try {
    targetUrl = buildTargetUrl(baseUrl, req.url);
  } catch {
    res.status(400).end();
    return;
  }

  const mod = targetUrl.protocol === 'https:' ? https : http;
  const headers = proxyHeaders(req.headers);
  headers['host'] = targetUrl.host;

  const proxyReq = mod.request(targetUrl, {
    method: req.method,
    headers: headers as http.OutgoingHttpHeaders,
  }, (proxyRes) => {
    const respHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (!value) continue;
      // Strip headers that block iframe embedding
      if (key === 'content-security-policy' || key === 'x-frame-options' || key === 'x-content-type-options') continue;
      respHeaders[key] = value;
    }

    res.writeHead(proxyRes.statusCode || 502, respHeaders);
    proxyRes.pipe(res);
  });

  req.pipe(proxyReq);
  proxyReq.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: 'Proxy error' });
  });
});

// WebSocket upgrade proxy — called from the server upgrade handler
export function handleIframeWsProxy(req: IncomingMessage, socket: Duplex, _head: Buffer): void {
  const match = req.url?.match(/^\/api\/iframe-proxy\/(\d+)(\/.*)?$/);
  if (!match) { socket.destroy(); return; }

  if (!authenticateUpgrade(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const baseUrl = getIframeUrl(Number(match[1]));
  if (!baseUrl) { socket.destroy(); return; }

  let targetUrl: URL;
  try {
    targetUrl = buildTargetUrl(baseUrl, match[2] || '/');
  } catch { socket.destroy(); return; }

  const headers = proxyHeaders(req.headers);
  headers['host'] = targetUrl.host;

  const mod = targetUrl.protocol === 'https:' ? https : http;
  const proxyReq = mod.request({
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: 'GET',
    headers: headers as http.OutgoingHttpHeaders,
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    let response = `HTTP/1.1 101 ${proxyRes.statusMessage || 'Switching Protocols'}\r\n`;
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value) response += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`;
    }
    response += '\r\n';
    socket.write(response);
    if (proxyHead.length) socket.write(proxyHead);

    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    const cleanup = () => { proxySocket.destroy(); socket.destroy(); };
    proxySocket.on('error', cleanup);
    proxySocket.on('close', cleanup);
    socket.on('error', cleanup);
    socket.on('close', cleanup);
  });

  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
}

export default router;
