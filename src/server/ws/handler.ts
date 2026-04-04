import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:https';
import { authenticateUpgrade } from './auth.js';
import { ptyManager } from '../services/pty-manager.js';
import { getDb } from '../db.js';
import type { ClientMessage } from './protocol.js';

// Track which terminals each client is attached to
const clientTerminals = new Map<WebSocket, Set<number>>();

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    // Iframe proxy WebSocket connections are handled separately
    if (req.url?.startsWith('/api/iframe-proxy/')) return;

    if (!req.url?.startsWith('/ws')) {
      socket.destroy();
      return;
    }

    if (!authenticateUpgrade(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    clientTerminals.set(ws, new Set());

    // Ping/pong keepalive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    }, 30_000);

    // Rate limit: max 500 messages per second per client
    let msgCount = 0;
    let msgResetTime = Date.now();
    const MSG_LIMIT = 500;

    ws.on('message', (raw) => {
      const now = Date.now();
      if (now - msgResetTime > 1000) { msgCount = 0; msgResetTime = now; }
      if (++msgCount > MSG_LIMIT) return; // drop excess messages

      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case 'terminal:attach': {
          const id = msg.terminalId;
          if (id == null) break;
          let handle = ptyManager.get(id);
          // Auto-spawn PTY if terminal exists in DB but has no live process
          if (!handle) {
            const row = getDb().prepare('SELECT cwd, cols, rows FROM terminals WHERE id = ?').get(id) as
              { cwd: string | null; cols: number; rows: number } | undefined;
            if (row) {
              handle = ptyManager.spawn(id, { cwd: row.cwd || undefined, cols: row.cols, rows: row.rows });
            }
          }
          if (handle) {
            handle.attachClient(ws);
            clientTerminals.get(ws)?.add(id);
            // Resize to client dimensions if provided
            if (msg.cols && msg.rows) {
              const cols = Math.max(1, Math.min(500, Number(msg.cols) || 80));
              const rows = Math.max(1, Math.min(200, Number(msg.rows) || 24));
              handle.resize(cols, rows);
            }
          }
          break;
        }

        case 'terminal:detach': {
          const id = msg.terminalId;
          if (id == null) break;
          const handle = ptyManager.get(id);
          if (handle) {
            handle.detachClient(ws);
            clientTerminals.get(ws)?.delete(id);
          }
          break;
        }

        case 'terminal:input': {
          const id = msg.terminalId;
          if (id == null || !msg.data) break;
          ptyManager.get(id)?.write(msg.data);
          break;
        }

        case 'terminal:resize': {
          const id = msg.terminalId;
          if (id == null || !msg.cols || !msg.rows) break;
          const cols = Math.max(1, Math.min(500, Number(msg.cols) || 80));
          const rows = Math.max(1, Math.min(200, Number(msg.rows) || 24));
          ptyManager.get(id)?.resize(cols, rows);
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }
      }
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      // Detach from all terminals
      const terminals = clientTerminals.get(ws);
      if (terminals) {
        for (const id of terminals) {
          ptyManager.get(id)?.detachClient(ws);
        }
      }
      clientTerminals.delete(ws);
    });
  });

  // Forward PTY manager events to all relevant clients
  ptyManager.onTitle = (terminalId, title) => {
    broadcast(wss, { type: 'terminal:title', terminalId, title });
  };

  ptyManager.onClaudeDone = (terminalId) => {
    broadcast(wss, { type: 'terminal:claude', terminalId });
  };

  ptyManager.onExit = (terminalId, exitCode) => {
    broadcast(wss, { type: 'terminal:exit', terminalId, exitCode });
  };

  ptyManager.onActivity = (terminalId) => {
    broadcast(wss, { type: 'activity', terminalId });
  };

  return wss;
}

function broadcast(wss: WebSocketServer, msg: Record<string, unknown>): void {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// Exported for use by REST routes after mutations
let _wss: WebSocketServer | null = null;
export function setWss(wss: WebSocketServer) { _wss = wss; }
export function broadcastSync() {
  if (_wss) broadcast(_wss, { type: 'sync:reload' });
}
