import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { loadOrGenerateCerts } from './cert.js';
import { initDb } from './db.js';
import { securityHeaders } from './middleware/security.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { syncMiddleware } from './middleware/sync.js';
import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/project.routes.js';
import terminalRoutes from './routes/terminal.routes.js';
import noteRoutes from './routes/note.routes.js';
import iframeRoutes from './routes/iframe.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import claudeRoutes from './routes/claude.routes.js';
import { setupWebSocket, setWss } from './ws/handler.js';
import { ptyManager } from './services/pty-manager.js';

// Initialize database
const db = initDb();

// Start PTY manager
ptyManager.start();

// Load or generate HTTPS certificates
const { key, cert } = loadOrGenerateCerts();

// Create Express app
const app = express();
app.use(securityHeaders);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// Auth routes (no auth middleware)
app.use('/api/auth', authRoutes);

// Protected API routes
app.use('/api', authMiddleware);
app.use('/api', syncMiddleware);
app.use('/api', projectRoutes);
app.use('/api', terminalRoutes);
app.use('/api', noteRoutes);
app.use('/api', iframeRoutes);
app.use('/api', workspaceRoutes);
app.use('/api', uploadRoutes);
app.use('/api', claudeRoutes);

// Serve frontend in production
if (config.isProd) {
  const clientDir = path.resolve(import.meta.dirname, '../../dist/client');
  app.use(express.static(clientDir));
  // SPA fallback
  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

// HTTPS server
const server = https.createServer({ key, cert }, app);

// WebSocket
const wss = setupWebSocket(server);
setWss(wss);

server.listen(config.port, config.bind, () => {
  console.log(`Dopamine running at https://${config.bind}:${config.port}`);
});

// HTTP → HTTPS redirect on port+1
const httpApp = express();
httpApp.all('{*path}', (req, res) => {
  res.redirect(301, `https://${req.socket.localAddress}:${config.port}${req.url}`);
});
const httpServer = http.createServer(httpApp);
httpServer.listen(config.port + 1, config.bind);

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down...');
  ptyManager.shutdownAll();
  wss.close();
  server.close();
  httpServer.close();
  db.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
