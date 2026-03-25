<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { WebLinksAddon } from '@xterm/addon-web-links';
  import { SearchAddon } from '@xterm/addon-search';
  import { wsManager } from '../../lib/state/ws.svelte.js';
  import { appState } from '../../lib/state/app.svelte.js';
  import { layoutState } from '../../lib/state/layout.svelte.js';
  import { toastState } from '../../lib/state/toast.svelte.js';
  import '@xterm/xterm/css/xterm.css';

  let { terminalId }: { terminalId: number } = $props();

  let containerEl: HTMLDivElement;
  let terminal: Terminal;
  let fitAddon: FitAddon;
  let searchAddon: SearchAddon;
  let resizeObserver: ResizeObserver;
  let cleanups: (() => void)[] = [];
  let wasConnected = false;

  let showSearch = $state(false);
  let searchQuery = $state('');
  let isDead = $state(false);
  let exitCode = $state<number | null>(null);
  let showDropOverlay = $state(false);

  onMount(() => {
    terminal = new Terminal({
      scrollback: 100000,
      fontSize: 16,
      fontFamily: "'Ubuntu Mono', 'Cascadia Mono', 'Fira Mono', 'DejaVu Sans Mono', 'Consolas', monospace",
      theme: {
        background: '#282828',
        foreground: '#ebdbb2',
        cursor: '#ebdbb2',
        cursorAccent: '#282828',
        selectionBackground: '#504945',
        black: '#282828',
        red: '#cc241d',
        green: '#98971a',
        yellow: '#d79921',
        blue: '#458588',
        magenta: '#b16286',
        cyan: '#689d6a',
        white: '#a89984',
        brightBlack: '#928374',
        brightRed: '#fb4934',
        brightGreen: '#b8bb26',
        brightYellow: '#fabd2f',
        brightBlue: '#83a598',
        brightMagenta: '#d3869b',
        brightCyan: '#8ec07c',
        brightWhite: '#ebdbb2',
      },
      allowProposedApi: true,
    });

    fitAddon = new FitAddon();
    searchAddon = new SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.loadAddon(searchAddon);

    // WebGL only on desktop — causes DPI issues on mobile/responsive
    if (window.innerWidth > 768) {
      try {
        import('@xterm/addon-webgl').then(({ WebglAddon }) => {
          terminal.loadAddon(new WebglAddon());
        }).catch(() => {});
      } catch {}
    }

    terminal.open(containerEl);

    function doFit() {
      try { fitAddon.fit(); } catch {}
    }

    // Fit after load
    setTimeout(() => { doFit(); terminal.focus(); }, 100);

    // Selection auto-copies to CLIPBOARD
    terminal.onSelectionChange(() => {
      const sel = terminal.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });

    // Middle-click paste
    containerEl.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text) wsManager.send({ type: 'terminal:input', terminalId, data: text });
        }).catch(() => {});
      }
    });

    // Terminal input → WebSocket + clear activity + resume auto-scroll
    terminal.onData((data) => {
      wsManager.send({ type: 'terminal:input', terminalId, data });
      autoScroll = true;
      for (const p of appState.projects) {
        const t = p.terminals.find(t => t.id === terminalId);
        if (t && t.hasActivity) { t.hasActivity = false; break; }
      }
    });

    // Terminal resize: only send when dimensions actually change
    let lastSentCols = 0;
    let lastSentRows = 0;
    function sendResize(cols: number, rows: number) {
      if (cols !== lastSentCols || rows !== lastSentRows) {
        lastSentCols = cols;
        lastSentRows = rows;
        wsManager.send({ type: 'terminal:resize', terminalId, cols, rows });
      }
    }

    terminal.onResize(({ cols, rows }) => {
      sendResize(cols, rows);
    });

    // On first focus, claim size
    containerEl.addEventListener('focus', () => {
      sendResize(terminal.cols, terminal.rows);
    }, { once: false, capture: true, passive: true });

    // Visual bell
    terminal.onBell(() => {
      containerEl.classList.add('bell');
      setTimeout(() => containerEl.classList.remove('bell'), 200);
    });

    // Scroll: always auto-scroll unless user is touching the screen.
    // Touch down = pause. Touch up = check if at bottom, resume if yes.
    // User typing = always resume.
    let autoScroll = true;

    containerEl.addEventListener('wheel', () => { autoScroll = false; }, { passive: true });
    containerEl.addEventListener('touchstart', () => { autoScroll = false; }, { passive: true });
    containerEl.addEventListener('touchend', () => {
      requestAnimationFrame(() => {
        const buf = terminal.buffer.active;
        autoScroll = buf.viewportY >= buf.baseY;
      });
    }, { passive: true });

    cleanups.push(wsManager.on('terminal:output', (msg) => {
      if (msg.terminalId !== terminalId) return;
      terminal.write(msg.data);
      if (autoScroll) terminal.scrollToBottom();
    }));

    cleanups.push(wsManager.on('terminal:buffered', (msg) => {
      if (msg.terminalId !== terminalId) return;
      terminal.write(msg.data);
      terminal.scrollToBottom();
    }));

    // Terminal exit
    cleanups.push(wsManager.on('terminal:exit', (msg) => {
      if (msg.terminalId === terminalId) {
        isDead = true;
        exitCode = msg.exitCode;
        // Update sidebar
        for (const p of appState.projects) {
          const t = p.terminals.find(t => t.id === terminalId);
          if (t) t.isAlive = false;
        }
      }
    }));

    // Activity notification (for sidebar dot)
    cleanups.push(wsManager.on('activity', (msg) => {
      if (msg.terminalId === terminalId) {
        for (const p of appState.projects) {
          const t = p.terminals.find(t => t.id === terminalId);
          if (t) t.hasActivity = true;
        }
      }
    }));


    // Drag & drop file upload
    let dragResetTimer: ReturnType<typeof setTimeout> | null = null;

    containerEl.addEventListener('dragenter', (e) => {
      e.preventDefault();
      showDropOverlay = true;
      if (dragResetTimer) clearTimeout(dragResetTimer);
      dragResetTimer = setTimeout(() => { showDropOverlay = false; }, 3000);
    });
    containerEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      showDropOverlay = true;
      if (dragResetTimer) clearTimeout(dragResetTimer);
      dragResetTimer = setTimeout(() => { showDropOverlay = false; }, 3000);
    });
    containerEl.addEventListener('dragleave', (e) => {
      // Only hide if leaving the container itself, not a child
      if (e.relatedTarget && containerEl.contains(e.relatedTarget as Node)) return;
      showDropOverlay = false;
      if (dragResetTimer) clearTimeout(dragResetTimer);
    });
    containerEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      showDropOverlay = false;
      if (dragResetTimer) clearTimeout(dragResetTimer);
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const dropX = e.clientX;
      const dropY = e.clientY;
      for (const file of files) {
        const checkRes = await fetch(`/api/terminals/${terminalId}/upload/check?filename=${encodeURIComponent(file.name)}`, {
          credentials: 'same-origin',
        }).catch(() => null);

        if (checkRes?.ok) {
          const { exists } = await checkRes.json();
          if (exists) {
            const overwrite = await toastState.confirm(`"${file.name}" exists. Overwrite?`, dropX, dropY);
            if (!overwrite) continue;
          }
        }

        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch(`/api/terminals/${terminalId}/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
          });
          if (res.ok) {
            const { path: destPath } = await res.json();
            toastState.success(destPath, dropX, dropY);
          } else {
            toastState.error(`Failed: ${file.name}`, dropX, dropY);
          }
        } catch {
          toastState.error(`Failed: ${file.name}`, dropX, dropY);
        }
      }
    });

    // ResizeObserver (debounced to avoid scroll reset during output)
    let fitDebounce: ReturnType<typeof setTimeout> | null = null;
    resizeObserver = new ResizeObserver(() => {
      if (fitDebounce) clearTimeout(fitDebounce);
      fitDebounce = setTimeout(doFit, 50);
    });
    resizeObserver.observe(containerEl);
    cleanups.push(() => { if (fitDebounce) clearTimeout(fitDebounce); });

  });

  // Reactive: attach/re-attach when WS connects
  $effect(() => {
    const connected = wsManager.connected;
    if (connected && !wasConnected) {
      const dims = terminal ? { cols: terminal.cols, rows: terminal.rows } : {};
      wsManager.send({ type: 'terminal:attach', terminalId, ...dims });
    }
    wasConnected = connected;
  });

  // Refit + scroll to bottom when workspace switches or pane becomes active
  $effect(() => {
    const _wsId = layoutState.activeWorkspaceId;
    const _focus = layoutState.focusedLeafId;
    if (!terminal || !fitAddon) return;
    const t1 = setTimeout(() => { try { fitAddon.fit(); } catch {} }, 50);
    const t2 = setTimeout(() => { try { fitAddon.fit(); } catch {} terminal.scrollToBottom(); terminal.focus(); }, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  });

  function doSearch() {
    if (searchQuery) searchAddon?.findNext(searchQuery);
  }

  function closeSearch() {
    showSearch = false;
    searchQuery = '';
    terminal?.focus();
  }

  async function restartTerminal() {
    try {
      await fetch(`/api/terminals/${terminalId}/restart`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      isDead = false;
      exitCode = null;
      terminal.clear();
      // Re-attach
      wsManager.send({ type: 'terminal:attach', terminalId });
    } catch {}
  }

  onDestroy(() => {
    wsManager.send({ type: 'terminal:detach', terminalId });
    for (const cleanup of cleanups) cleanup();
    resizeObserver?.disconnect();
    terminal?.dispose();
  });
</script>

<div class="terminal-wrapper">
  <div class="terminal-container" bind:this={containerEl}></div>

  {#if showSearch}
    <div class="search-bar">
      <input
        class="search-input"
        bind:value={searchQuery}
        placeholder="Search..."
        autofocus
        onkeydown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
          if (e.key === 'Escape') closeSearch();
        }}
        oninput={doSearch}
      />
      <button class="search-btn" onclick={() => searchAddon?.findPrevious(searchQuery)}>&#x25B2;</button>
      <button class="search-btn" onclick={() => searchAddon?.findNext(searchQuery)}>&#x25BC;</button>
      <button class="search-btn" onclick={closeSearch}>&#xd7;</button>
    </div>
  {/if}

  {#if isDead}
    <div class="dead-banner">
      <span class="dead-text">Process exited <span class="dead-code">({exitCode ?? '?'})</span></span>
      <button class="restart-btn" onclick={restartTerminal}>&#8634; Restart</button>
    </div>
  {/if}

  {#if showDropOverlay}
    <div class="drop-overlay">
      <span>Drop files to upload</span>
    </div>
  {/if}
</div>

<style>
  .terminal-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
  }
  .terminal-container {
    width: 100%;
    height: 100%;
    background: #282828;
  }
  .terminal-container :global(.xterm) {
    padding: 4px;
    height: 100%;
  }
  .terminal-container.bell {
    outline: 1px solid var(--yellow);
    outline-offset: -1px;
  }

  /* Search bar */
  .search-bar {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    gap: 2px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 4px;
    padding: 4px;
    z-index: 10;
  }
  .search-input {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 3px;
    padding: 3px 8px;
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    width: 200px;
  }
  .search-input:focus { border-color: var(--accent); }
  .search-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
  }
  .search-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

  /* Dead terminal */
  .dead-banner {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, var(--bg-surface) 40%);
    padding: 40px 16px 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .dead-text {
    font-size: 13px;
    color: var(--text-tertiary);
  }
  .dead-code { color: var(--green); }
  .restart-btn {
    font-size: 12px;
    font-weight: 500;
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid var(--border-default);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition);
  }
  .restart-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--accent);
  }

  /* Drop overlay */
  .drop-overlay {
    position: absolute;
    inset: 0;
    background: rgba(40,40,40,0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    font-size: 16px;
    border: 2px dashed var(--accent);
    border-radius: 4px;
    z-index: 10;
    pointer-events: none;
  }
</style>
