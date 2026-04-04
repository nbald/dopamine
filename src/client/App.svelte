<script lang="ts">
  import { api } from './lib/api.js';
  import { wsManager } from './lib/state/ws.svelte.js';
  import { appState } from './lib/state/app.svelte.js';
  import { layoutState } from './lib/state/layout.svelte.js';
  import { flattenLeaves } from './lib/utils/split-tree.js';
  import { uiState } from './lib/state/ui.svelte.js';
  import LoginPage from './components/auth/LoginPage.svelte';
  import SetupPage from './components/auth/SetupPage.svelte';
  import Sidebar from './components/sidebar/Sidebar.svelte';
  import SplitContainer from './components/panes/SplitContainer.svelte';
  import ToastContainer from './components/common/ToastContainer.svelte';
  import MobileDrawer from './components/mobile/MobileDrawer.svelte';
  import BottomBar from './components/mobile/BottomBar.svelte';
  import TerminalView, { cleanupTerminalStore } from './components/terminal/TerminalView.svelte';
  import NoteEditor from './components/notes/NoteEditor.svelte';
  import IframeView from './components/iframe/IframeView.svelte';
  import FuzzyFinder from './components/modals/FuzzyFinder.svelte';
  // import Clippy from 'better-clippy';
  import { toastState } from './lib/state/toast.svelte.js';

  let fuzzyOpen = $state(false);

  function activePaneLabel(): { project: string; emoji: string; name: string; claudePrefix: string } {
    const pane = appState.activePane;
    if (!pane) return { project: '', emoji: '', name: '', claudePrefix: '' };
    for (const p of appState.projects) {
      if (pane.type === 'terminal') {
        const t = p.terminals.find(t => t.id === pane.id);
        if (t) return { project: p.name, emoji: t.emoji, name: t.name, claudePrefix: t.claudePrefix || '' };
      } else if (pane.type === 'note') {
        const n = p.notes.find(n => n.id === pane.id);
        if (n) return { project: p.name, emoji: n.emoji, name: n.name, claudePrefix: '' };
      } else if (pane.type === 'iframe') {
        const f = p.iframes.find(f => f.id === pane.id);
        if (f) return { project: p.name, emoji: f.emoji, name: f.name, claudePrefix: '' };
      }
    }
    return { project: '', emoji: '', name: '', claudePrefix: '' };
  }

  let mobileInfo = $derived(activePaneLabel());

  function setTerminalActivity(terminalId: number, active: boolean) {
    for (const p of appState.projects) {
      const t = p.terminals.find(t => t.id === terminalId);
      if (t) { t.hasActivity = active; break; }
    }
  }

  // Prevent browser from navigating when files are dropped outside a terminal
  if (typeof document !== 'undefined') {
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
    // Ctrl+P fuzzy finder
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        fuzzyOpen = !fuzzyOpen;
      }
    });
  }

  let state: 'loading' | 'setup' | 'login' | 'app' = $state('loading');
  let error: string = $state('');

  async function checkAuth() {
    try {
      const status = await api.get<{ needsSetup: boolean; authenticated: boolean; dockerAvailable: boolean }>('/auth/status');
      appState.dockerAvailable = status.dockerAvailable;
      if (status.needsSetup) {
        state = 'setup';
      } else if (status.authenticated) {
        state = 'app';
        initApp();
      } else {
        state = 'login';
      }
    } catch (e) {
      error = 'Cannot connect to server';
    }
  }

  async function onAuthenticated() {
    state = 'app';
    initApp();
  }

  async function initApp() {
    uiState.detect();

    // Mobile keyboard: resize layout to visual viewport so content stays above keyboard
    if (window.visualViewport) {
      const onViewportResize = () => {
        document.documentElement.style.setProperty('--vvh', `${window.visualViewport!.height}px`);
      };
      window.visualViewport.addEventListener('resize', onViewportResize);
      onViewportResize();
    }

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    wsManager.connect(`${proto}://${location.host}/ws`);

    wsManager.on('sync:reload', () => {
      appState.load();
    });

    // When an item is deleted, close its pane in all workspace layouts
    appState.onPaneRemoved = (type, id) => {
      for (const [wsId, tree] of layoutState.trees.entries()) {
        const leaves = flattenLeaves(tree);
        for (const leaf of leaves) {
          if (leaf.contentType === type && leaf.contentId === id) {
            layoutState.close(leaf.id);
          }
        }
      }
      if (type === 'terminal') {
        cleanupTerminalStore(id);
      }
    };

    // Claude Code completion — global handler for all terminals
    wsManager.on('terminal:claude', (msg) => {
      let name = 'Terminal';
      for (const p of appState.projects) {
        const t = p.terminals.find(t => t.id === msg.terminalId);
        if (t) { name = t.title_override || t.name; break; }
      }
      toastState.success(`\u2733 Claude finished: ${name}`);
      document.title = '\u2733 Dopamine';
      setTimeout(() => { document.title = 'Dopamine'; }, 10000);
      // Screen flash green
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:-25px;border:50px solid rgba(142,192,124,0.5);filter:blur(40px);pointer-events:none;z-index:9999;opacity:1;transition:opacity 2s ease-out;';
      document.body.appendChild(flash);
      // Force paint before starting transition
      flash.getBoundingClientRect();
      flash.style.opacity = '0';
      flash.addEventListener('transitionend', () => flash.remove());
      // Activity dot
      setTerminalActivity(msg.terminalId, true);
    });

    // Terminal exit — notification + auto-remove if stopping
    wsManager.on('terminal:exit', (msg) => {
      let name = 'Terminal';
      const isStopping = appState.isTerminalStopping(msg.terminalId);

      // Mark as dead in state
      for (const p of appState.projects) {
        const t = p.terminals.find(t => t.id === msg.terminalId);
        if (t) {
          name = t.title_override || t.name;
          t.isAlive = false;
          break;
        }
      }

      if (isStopping) {
        // Was gracefully stopping — auto-remove from DB and state
        api.del(`/terminals/${msg.terminalId}`).catch(() => {});
        appState.removeTerminalFromState(msg.terminalId);
        toastState.success(`Terminated: ${name}`);
      } else {
        toastState.success(`Process finished: ${name} (exit ${msg.exitCode})`);
        setTerminalActivity(msg.terminalId, true);
      }
    });

    try {
      await appState.load();

      if (appState.projects.length === 0) {
        const p = await appState.createProject('default');
        await appState.createTerminal(p.id, 'shell');
      }
    } catch (e: any) {
      error = e.message;
    }
  }

  $effect(() => {
    checkAuth();
  });

  // Update browser tab title based on active pane and terminal title changes
  $effect(() => {
    const pane = appState.activePane;
    if (!pane) { document.title = 'Dopamine'; return; }
    let name = '';
    for (const p of appState.projects) {
      if (pane.type === 'terminal') {
        const t = p.terminals.find(t => t.id === pane.id);
        if (t) { name = t.title_override || t.title || t.name; break; }
      } else if (pane.type === 'note') {
        const n = p.notes.find(n => n.id === pane.id);
        if (n) { name = n.name; break; }
      } else if (pane.type === 'iframe') {
        const i = p.iframes.find(i => i.id === pane.id);
        if (i) { name = i.name || i.url; break; }
      }
    }
    document.title = name ? `${name} — Dopamine` : 'Dopamine';
  });

  // Terminal title updates via WS — debounced to avoid flooding re-renders
  $effect(() => {
    if (state !== 'app') return;
    let titleLastUpdate = new Map<number, number>();
    let titleTrailing = new Map<number, ReturnType<typeof setTimeout>>();

    const unsub = wsManager.on('terminal:title', (msg) => {
      // Extract leading non-letter symbols (Claude Code spinner/status)
      // Skip ✳ (U+2733) — it means Claude is done, not working
      const match = msg.title.match(/^([^\p{L}\d]+)/u);
      const raw = match ? match[1].trimEnd() : '';
      const prefix = raw === '\u2733' ? '' : raw;

      // Update document title immediately (cheap)
      if (appState.activePane?.type === 'terminal' && appState.activePane.id === msg.terminalId) {
        for (const p of appState.projects) {
          const t = p.terminals.find(t => t.id === msg.terminalId);
          if (t) {
            const display = prefix ? `${prefix} ${t.name}` : t.name;
            document.title = `${display} — Dopamine`;
          }
        }
      }

      // Rate-limit sidebar update (100ms max) + trailing update for final state
      const now = Date.now();
      const lastUpdate = titleLastUpdate.get(msg.terminalId) || 0;

      function applyPrefix() {
        for (const p of appState.projects) {
          const t = p.terminals.find(t => t.id === msg.terminalId);
          if (t) t.claudePrefix = prefix;
        }
      }

      if (now - lastUpdate >= 100) {
        titleLastUpdate.set(msg.terminalId, now);
        applyPrefix();
      }
      // Always schedule a trailing update to catch the final state
      const existing = titleTrailing.get(msg.terminalId);
      if (existing) clearTimeout(existing);
      titleTrailing.set(msg.terminalId, setTimeout(applyPrefix, 150));
    });

    return () => {
      unsub();
      for (const t of titleTrailing.values()) clearTimeout(t);
    };
  });

  // Persist expanded states to localStorage (activePane is saved synchronously via setter)
  $effect(() => {
    if (state !== 'app' || appState.projects.length === 0) return;
    const _projects = appState.projects.map(p => p.expanded);
    appState.saveExpandedState();
  });

  // When sidebar changes activePane, assign to focused leaf (desktop) or just track (mobile)
  let lastPaneKey = $state('');
  $effect(() => {
    const pane = appState.activePane;
    if (!pane) return;
    const key = `${pane.type}:${pane.id}`;
    if (key !== lastPaneKey) {
      lastPaneKey = key;
      if (!uiState.isMobile) {
        layoutState.assign(pane.type, pane.id);
      }
      if (uiState.isMobile) {
        uiState.closeDrawer();
      }
      // Clear activity dot when selecting/focusing a terminal
      if (pane.type === 'terminal') {
        setTerminalActivity(pane.id, false);
      }
    }
  });
</script>

{#if state === 'loading'}
  <div class="center">
    {#if error}
      <p class="error">{error}</p>
    {:else}
      <p>connecting...</p>
    {/if}
  </div>
{:else if state === 'setup'}
  <SetupPage {onAuthenticated} />
{:else if state === 'login'}
  <LoginPage {onAuthenticated} />
{:else if state === 'app'}
  {#if uiState.isMobile}
    <!-- MOBILE LAYOUT -->
    <div class="mobile-layout">
      <div class="mobile-header">
        <button class="mobile-menu-btn" onclick={() => uiState.toggleDrawer()}>&#9776;</button>
        <span class="mobile-title">
          {mobileInfo.emoji} {mobileInfo.claudePrefix ? mobileInfo.claudePrefix + ' ' : ''}{mobileInfo.name}{#if mobileInfo.project}<span class="mobile-sep">|</span><span class="mobile-secondary">{mobileInfo.project}</span>{/if}
        </span>
        <button class="mobile-fullscreen-btn" onclick={() => {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen();
          else document.exitFullscreen();
        }}>&#x26F6;</button>
      </div>
      <div class="mobile-content" id="mobile-content">
        {#if appState.activePane?.type === 'terminal'}
          {#key appState.activePane.id}
            <TerminalView terminalId={appState.activePane.id} />
          {/key}
        {:else if appState.activePane?.type === 'note'}
          {#key appState.activePane.id}
            <NoteEditor noteId={appState.activePane.id} />
          {/key}
        {:else if appState.activePane?.type === 'iframe'}
          {#key appState.activePane.id}
            <IframeView iframeId={appState.activePane.id} />
          {/key}
        {:else}
          <div class="center empty">Open the menu to select a terminal</div>
        {/if}
      </div>
      <MobileDrawer />
    </div>
  {:else}
    <!-- DESKTOP LAYOUT -->
    <div class="desktop-layout">
      <Sidebar />
      <main class="main-area">
        {#each [...layoutState.trees.entries()] as [wsId, tree] (wsId)}
          <div class="workspace-layer" style:display={wsId === layoutState.activeWorkspaceId ? 'flex' : 'none'}>
            <SplitContainer node={tree} />
          </div>
        {/each}
      </main>
    </div>
  {/if}
{/if}

<ToastContainer />
<FuzzyFinder visible={fuzzyOpen} onClose={() => fuzzyOpen = false} />
<!-- <Clippy tips={[
  "Press Ctrl+P to quickly jump to any terminal, note, or iframe.",
  "You can drag and drop files directly onto a terminal to upload them!",
  "Try Ctrl+1 through Ctrl+9 to switch between workspaces instantly.",
  "Double-click any name in the sidebar to rename it inline.",
  "Hold the delete button for 3 seconds to confirm destructive actions. Safety first!",
  "You can split panes vertically or horizontally to see multiple terminals at once.",
  "Text selected in a terminal is automatically copied to your clipboard.",
  "Drag a terminal from one project to another to reorganize your workspace.",
  "Middle-click in a terminal to paste from your clipboard.",
  "The green flash means Claude Code just finished a task in one of your terminals!",
  "You can maximize any pane to fullscreen, then restore the previous layout.",
  "Drag the divider between split panes to resize them.",
  "Your command history is saved per project. Press Up/Down in the compose area to browse it.",
  "On mobile, swipe left/right on the compose bar to move your cursor!",
  "The activity dot on a terminal means there's new output you haven't seen yet.",
  "Each terminal has a 1MB replay buffer. Reconnect and you won't lose any output.",
  "You can create Docker sandboxed terminals for isolated environments.",
  "Press Ctrl+F in a terminal to search through its output.",
  "Workspaces let you save completely different pane layouts and switch between them.",
  "Your floating input text is saved per terminal. Switch away and come back without losing your draft.",
]} /> -->

<style>
  .center {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
  }
  .error { color: var(--red); }
  .empty { color: var(--text-tertiary); }

  /* Desktop */
  .desktop-layout {
    display: flex;
    height: 100%;
  }
  .main-area {
    flex: 1;
    min-width: 0;
    display: flex;
    position: relative;
    background: var(--bg-terminal);
  }
  .workspace-layer {
    position: absolute;
    inset: 0;
    display: flex;
  }

  /* Mobile */
  .mobile-layout {
    display: flex;
    flex-direction: column;
    height: var(--vvh, 100%);
    overflow: hidden;
    overscroll-behavior: none;
  }
  .mobile-header {
    touch-action: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 12px;
    margin-left: env(safe-area-inset-left, 0px);
    margin-right: env(safe-area-inset-right, 0px);
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }
  .mobile-menu-btn {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 16px;
    cursor: pointer;
    padding: 2px;
  }
  .mobile-title {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    letter-spacing: 0.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .mobile-sep {
    opacity: 0.3;
    margin: 0 6px;
  }
  .mobile-secondary {
    opacity: 0.5;
  }
  .mobile-fullscreen-btn {
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 14px;
    cursor: pointer;
    padding: 2px;
    flex-shrink: 0;
  }
  .mobile-content {
    flex: 1;
    min-height: 0;
    background: var(--bg-terminal);
    overflow: hidden;
  }
</style>
