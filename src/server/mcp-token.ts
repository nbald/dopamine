/**
 * Generate a long-lived MCP Bearer token for headless clients (e.g. Hermès).
 * Run: npm run mcp-token
 * The client sends it as `Authorization: Bearer <token>` to the /mcp endpoint.
 */
import { initDb } from './db.js';
import { isSetupDone, signLongLivedToken } from './auth.js';

initDb();

if (!isSetupDone()) {
  console.error('Auth is not configured yet. Set a password first with: npm run reset-password');
  process.exit(1);
}

const token = signLongLivedToken();
console.log('\nMCP Bearer token (store it in your MCP client config; do not commit it):\n');
console.log(token);
console.log('\nUse it as the header:  Authorization: Bearer <token>\n');
process.exit(0);
