# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start backend (tsx watch, port 3000) + Vite dev server (port 5173) concurrently
npm run dev:server       # Backend only (tsx watch)
npm run dev:client       # Vite dev server only
npm run build            # Build frontend to dist/client/
npm start                # Production server (NODE_ENV=production)
npm run typecheck        # TypeScript type checking (tsc --noEmit)
npm run reset-password   # Set/reset the single-user password from CLI
```

No test framework is configured. There are no tests.

## Architecture

Dopamine is a self-hosted web terminal manager. Single binary-like Node.js server serving both an Express REST API and a Svelte 5 SPA.

### Server (`src/server/`)

Express 5 app over HTTPS with auto-generated self-signed certificates (stored in `~/.dopamine/certs/`). All persistent data lives in SQLite at `~/.dopamine/dopamine.db`.

- **Entry**: `index.ts` — wires Express middleware, REST routes, HTTPS server, WebSocket, and HTTP→HTTPS redirect on port+1
- **PTY layer**: `services/pty-manager.ts` (singleton) → `services/pty-handle.ts` (per-terminal wrapper around node-pty). Each PtyHandle has a 1MB ring buffer for reconnect replay. If `dtach` is installed, terminals survive server restarts via `services/dtach.ts`
- **WebSocket**: single multiplexed WS connection per client at `/ws`. Protocol in `ws/protocol.ts`. Messages: `terminal:attach/detach/input/resize/output/exit/title/claude`, `activity`, `sync:reload`, `ping/pong`
- **REST routes**: `routes/*.routes.ts` — CRUD for projects, terminals, notes, iframes, workspaces, file upload, Claude usage proxy. All behind JWT auth middleware except `/api/auth/*`
- **Auth**: single-user, password set via CLI only (`reset-password.ts`). Argon2id hashing, JWT in httpOnly cookie, 30-day expiry. JWT secret stored in DB
- **Sync**: any REST mutation triggers `broadcastSync()` → all WS clients get `sync:reload` → clients re-fetch state

### Client (`src/client/`)

Svelte 5 SPA using runes (`$state`, `$effect`). Vite proxies `/api` and `/ws` to the backend in dev.

- **State**: `lib/state/*.svelte.ts` — singleton classes with `$state` fields:
  - `app.svelte.ts` — projects/terminals/notes/iframes CRUD, active pane tracking
  - `layout.svelte.ts` — recursive split tree per workspace, focus/maximize/navigate
  - `ws.svelte.ts` — WebSocket manager with auto-reconnect and typed event handlers
  - `ui.svelte.ts` — mobile detection, drawer state
  - `toast.svelte.ts` — toast notifications
  - `drag.svelte.ts` — drag-and-drop state for sidebar items
- **Split system**: `lib/utils/split-tree.ts` — immutable tree of leaf/branch nodes. Workspaces serialize the tree to JSON in the DB
- **Components**: `components/terminal/TerminalView.svelte` (xterm.js), `components/panes/SplitContainer.svelte` (recursive splits), `components/sidebar/Sidebar.svelte` (project tree + workspace list)
- **Mobile**: separate layout path in `App.svelte` with drawer sidebar and virtual key bar (`BottomBar.svelte`)

### Data model

Projects contain terminals, notes, and iframes. Workspaces store layout JSON (which panes go where in the split tree). All entities have `sort_order` for drag reordering.

### Key patterns

- Terminal output flows: node-pty → PtyHandle (ring buffer + broadcast to attached WS clients) → xterm.js
- Client reconnect: PtyHandle replays ring buffer on `attachClient()`
- Claude Code detection: `TitleParser` watches terminal escape sequences for completion patterns, triggers screen flash
- Destructive actions (close pane, logout) require 3-second long-press with visual progress bar
