/**
 * MCP server factory (Phase 2 — read-only socle). Registers the read-only tools.
 * Mutating tools + send_keys + wait_until_not_busy come in Phase 3.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as tools from './tools.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});
const fail = (message: string): ToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});
async function run(fn: () => unknown | Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail((e as Error).message);
  }
}

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'dopamine-terminals', version: '0.1.0' });

  server.registerTool(
    'list_projects',
    { description: 'List Dopamine projects.', inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => run(() => tools.listProjects()),
  );

  server.registerTool(
    'list_terminals',
    {
      description: 'List a project\'s terminals with live status (isAlive, isBusy, title, liveCwd).',
      inputSchema: { project_id: z.number().int() },
      annotations: { readOnlyHint: true },
    },
    async ({ project_id }) => run(() => tools.listTerminals(project_id)),
  );

  server.registerTool(
    'read_output',
    {
      description:
        'Read recent terminal output as clean lines. offset_lines counts back from the end (0 = most recent); max_lines caps the window.',
      inputSchema: {
        terminal_id: z.number().int(),
        offset_lines: z.number().int().min(0).optional(),
        max_lines: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ terminal_id, offset_lines, max_lines }) =>
      run(() => tools.readOutput(terminal_id, offset_lines ?? 0, max_lines ?? 50)),
  );

  server.registerTool(
    'is_busy',
    {
      description: 'Whether the agent in the terminal is currently thinking (title-animation heuristic).',
      inputSchema: { terminal_id: z.number().int() },
      annotations: { readOnlyHint: true },
    },
    async ({ terminal_id }) => run(() => tools.isBusyInfo(terminal_id)),
  );

  server.registerTool(
    'wait_until_not_busy',
    {
      description:
        'Block until the agent in the terminal stops thinking (or times out). Waits for it to start first, then for idle. new_lines is best-effort — if truncated:true the output overflowed the buffer during the wait, so call read_output for the full text.',
      inputSchema: {
        terminal_id: z.number().int(),
        // Capped at 240s: keepalive for longer HTTP waits isn't implemented yet, and Node's
        // default request timeout (~300s) would cut the connection. Re-call on timeout.
        timeout_seconds: z.number().int().min(1).max(240).optional(),
        poll_interval_ms: z.number().int().min(50).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ terminal_id, timeout_seconds, poll_interval_ms }, extra) =>
      run(() => tools.waitUntilNotBusy(terminal_id, timeout_seconds, poll_interval_ms, extra.signal)),
  );

  // --- Mutating / interaction tools ---

  server.registerTool(
    'create_terminal',
    {
      description: 'Create a new terminal in a project and spawn its shell. Auto-generates an emoji name if none given.',
      inputSchema: {
        project_id: z.number().int(),
        name: z.string().optional(),
        cwd: z.string().optional(),
        is_docker: z.boolean().optional(),
      },
    },
    async ({ project_id, name, cwd, is_docker }) =>
      run(() => tools.createTerminal(project_id, { name, cwd, isDocker: is_docker })),
  );

  server.registerTool(
    'rename_terminal',
    {
      description: 'Rename a terminal.',
      inputSchema: { terminal_id: z.number().int(), name: z.string().min(1) },
    },
    async ({ terminal_id, name }) => run(() => tools.renameTerminal(terminal_id, name)),
  );

  server.registerTool(
    'kill_terminal',
    {
      description: 'Kill a terminal and delete it (removes the project Docker container if it was the last one).',
      inputSchema: { terminal_id: z.number().int() },
      annotations: { destructiveHint: true },
    },
    async ({ terminal_id }) => run(() => tools.killTerminal(terminal_id)),
  );

  server.registerTool(
    'send_keys',
    {
      description:
        'Send a sequence of keys to a terminal. Each item is literal text or a named token: Enter, Escape, Tab, ShiftTab, Up/Down/Left/Right, Home, End, PageUp, PageDown, Backspace, Delete, Ctrl+<a-z>, Alt+<char>. Multi-line text is bracket-pasted when the app supports it.',
      inputSchema: { terminal_id: z.number().int(), keys: z.array(z.string()) },
      annotations: { destructiveHint: true },
    },
    async ({ terminal_id, keys }) => run(() => tools.sendKeys(terminal_id, keys)),
  );

  return server;
}
