# Dopamine

**A web-based terminal manager for ADHD vibe-coders who juggle too many projects at once.**

Dopamine keeps your entire working environment alive — terminals, notes, web previews — organized by project, so you can safely context-switch without losing your train of thought. Walk away from a project for a week, come back, and everything is exactly where you left it: running processes, command history, scratch notes, split layouts.

Pick it up on your phone from bed. Get notified the instant a long build finishes. Never lose track of what you were doing.

No more tmux gymnastics. No more SSH sessions that die when your Wi-Fi hiccups and take your running processes with them. Dopamine runs a server — your terminals live there, not in your connection. Drop your laptop lid, switch networks, close the browser, come back tomorrow. Everything is still running. If dtach is installed, terminals even survive server restarts.

## Features

- **Persistent terminals** — sessions stay alive as long as the server runs. Close your browser, reopen it later, everything is still there. Command history is preserved per terminal, even across server restarts.
- **dtach integration** — if dtach is installed, terminals run inside persistent sessions. They survive server restarts. Completely transparent — no mouse or keyboard interference.
- **Project organization** — group terminals, notes, and web previews by project. Expand, collapse, drag items between projects.
- **Scratch notes** — monospace text pads attached to each project. Auto-saved as you type. For the stuff that doesn't belong in a file yet.
- **Iframe previews** — embed your localhost dev server right next to your terminal. DevTools toggle included.
- **Recursive splits** — divide your workspace like tmux, but in the browser. Split any pane horizontally or vertically, nest as deep as you want. Drag dividers to resize.
- **Workspaces** — save your entire layout (which panes, which splits, what's in each one) and switch between layouts instantly. Like virtual desktops for your terminal setup.
- **Activity alerts** — background terminals flash in the sidebar when they produce output. A finished process gets a green dot. Claude Code completion (✳) triggers a screen flash. You never miss when something needs your attention.
- **Claude usage tracking** — progress bars in the sidebar showing your 5-hour session usage, weekly usage, and extra usage credits. You always know where you stand with your plan.
- **Mobile support** — responsive UI with a drawer sidebar, touch-friendly terminal, and a special key bar (Ctrl, Alt, Esc, Tab, arrows, PgUp/PgDn, Home/End) because phone keyboards don't have those.
- **Fuzzy finder** — Ctrl+P to jump to any terminal or note across all projects.
- **Drag & drop file upload** — drop a file on a terminal, it lands in the terminal's current working directory.
- **Safe destructive actions** — closing a panel or logging out requires a 3-second long-press. A red progress bar fills up so you know what's happening. Release to cancel. No accidental kills.
- **Graceful terminal shutdown** — deleting a terminal sends SIGHUP first (red dot in sidebar). The process can clean up. Press delete again to force kill.
- **PWA** — install it as a desktop app for proper keyboard shortcut capture (Ctrl+W goes to your terminal, not Firefox).
- **Self-hosted** — runs on your machine. HTTPS with auto-generated self-signed certificate. Single-user password auth.

## Eye comfort

Long coding sessions demand colors that don't fight your eyes. Dopamine uses the **Gruvbox Dark** palette — a color scheme designed specifically for extended screen time:

- **Background**: `#282828` — dark gray, not pure black. Pure black (#000) causes a halation effect where bright text bleeds into the background, straining your eyes. A slightly lifted dark gray eliminates this while still feeling dark.
- **Text**: `#ebdbb2` — warm cream instead of harsh white. Achieves a ~7.8:1 contrast ratio (exceeds WCAG AAA) without the eye fatigue of pure white on black.
- **Accents**: desaturated warm tones — muted greens (`#8ec07c`), ambers (`#d79921`), and soft reds (`#cc241d`). Research shows yellow-range colors cause the lowest visual fatigue. Saturated neon colors were deliberately avoided.
- **Font**: Ubuntu Mono — the standard Ubuntu terminal font. Familiar, readable, no surprises.

## Terminal tips

- **Text selection**: click and drag to select text. Selection auto-copies to clipboard.
- **Copy/paste**: selection auto-copies to clipboard. Ctrl+Shift+C/V also works. Middle-click pastes from clipboard.
- **Scroll**: mouse wheel scrolls the terminal scrollback history.
- **Search**: Ctrl+Shift+F to search in terminal scrollback.
- **Font size**: Ctrl+Plus/Minus to zoom.

## Usage tracking

Dopamine reads your Claude credentials (`~/.claude/.credentials.json`) and polls the OAuth usage endpoint to display progress bars at the bottom of the sidebar:

| Bar | Color | What it shows |
|-----|-------|---------------|
| Session usage | Green → Red | % of your 5-hour session quota consumed |
| Session elapsed | Gray | % of time elapsed in current 5-hour window |
| Weekly usage | Green → Red | % of your weekly quota consumed |
| Week elapsed | Gray | % of time elapsed in current week |
| Extra usage | Red | Credits spent vs monthly limit (if enabled) |

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + TypeScript (via tsx) |
| Frontend | Svelte 5 + Vite |
| Terminal | xterm.js + node-pty + dtach |
| Database | SQLite (better-sqlite3) |
| Communication | WebSocket (multiplexed) |
| Auth | argon2 + JWT (httpOnly cookie) |
| HTTPS | Self-signed (selfsigned) |

## Quick start

```bash
git clone <repo-url> dopamine
cd dopamine
npm install
```

### Set your password

Passwords are set from the server command line, never through the web interface:

```bash
npm run reset-password
```

### Development

```bash
npm run dev
```

Opens the backend on `https://localhost:3000` and Vite dev server on `https://localhost:5173`.

### Production

```bash
npm run build
npm start
```

Open `https://localhost:3000`. Accept the self-signed certificate warning on first visit.

### CLI options

```
--port <number>    HTTPS port (default: 3000)
--bind <address>   Bind address (default: 0.0.0.0)
--shell <path>     Default shell (default: /bin/bash)
```

### Requirements

- Node.js >= 20
- dtach (recommended — enables terminal persistence across server restarts: `sudo apt install dtach`)

## License

MIT

## Credits

Vibe coded with [Claude](https://claude.ai).
