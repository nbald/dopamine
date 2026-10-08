/**
 * Phase 2 MCP socle test. Drives buildMcpServer() through a real in-process MCP client
 * over InMemoryTransport — exercises tool registration, schemas, and the round-trip.
 * Run: npx tsx src/server/mcp/server.test.ts
 *
 * Note: opens the real ~/.dopamine DB read-only-ish (list_projects). No HTTP, no PTY.
 */
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { initDb } from '../db.js';
import { buildMcpServer } from './server.js';

let passed = 0;
function check(name: string, cond: boolean): void {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok  ${name}`);
}
const firstText = (r: { content: unknown[] }) => (r.content[0] as { text: string }).text;

async function main(): Promise<void> {
  initDb();
  const server = buildMcpServer();
  const client = new Client({ name: 'phase2-test', version: '0' });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  await client.connect(clientT);

  // Tools advertised
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check(
    'all 9 tools registered',
    JSON.stringify(names) ===
      JSON.stringify(['create_terminal', 'is_busy', 'kill_terminal', 'list_projects', 'list_terminals', 'read_output', 'rename_terminal', 'send_keys', 'wait_until_not_busy']),
  );
  check('list_projects carries readOnlyHint', tools.find((t) => t.name === 'list_projects')?.annotations?.readOnlyHint === true);
  check('kill_terminal carries destructiveHint', tools.find((t) => t.name === 'kill_terminal')?.annotations?.destructiveHint === true);
  check('send_keys carries destructiveHint', tools.find((t) => t.name === 'send_keys')?.annotations?.destructiveHint === true);

  // list_projects → JSON array, no error
  const lp = await client.callTool({ name: 'list_projects', arguments: {} });
  check('list_projects returns a JSON array', lp.isError !== true && Array.isArray(JSON.parse(firstText(lp as { content: unknown[] }))));

  // list_terminals for a bogus project → empty array (no error)
  const lt = await client.callTool({ name: 'list_terminals', arguments: { project_id: 999999 } });
  check('list_terminals(bogus) → empty array', lt.isError !== true && JSON.parse(firstText(lt as { content: unknown[] })).length === 0);

  // is_busy on a non-existent terminal → isError "not running" (faille #6, no auto-spawn)
  const ib = await client.callTool({ name: 'is_busy', arguments: { terminal_id: 999999 } });
  check('is_busy on absent terminal → isError', ib.isError === true && firstText(ib as { content: unknown[] }).includes('not running'));

  // read_output on a non-existent terminal → isError
  const ro = await client.callTool({ name: 'read_output', arguments: { terminal_id: 999999 } });
  check('read_output on absent terminal → isError', ro.isError === true);

  // Mutating / interaction tools must reject an absent terminal WITHOUT side effects.
  const sk = await client.callTool({ name: 'send_keys', arguments: { terminal_id: 999999, keys: ['Enter'] } });
  check('send_keys on absent terminal → isError', sk.isError === true && firstText(sk as { content: unknown[] }).includes('not running'));
  const wb = await client.callTool({ name: 'wait_until_not_busy', arguments: { terminal_id: 999999 } });
  check('wait_until_not_busy on absent terminal → isError', wb.isError === true);
  const kt = await client.callTool({ name: 'kill_terminal', arguments: { terminal_id: 999999 } });
  check('kill_terminal on absent terminal → isError (not found)', kt.isError === true);

  await client.close();
  await server.close();
  console.log(`\n${passed} checks passed.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
