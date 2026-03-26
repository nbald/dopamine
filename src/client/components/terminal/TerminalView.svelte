<script module lang="ts">
  // Persists across component mount/unmount — each terminal keeps its floating input state
  const floatingInputStore = new Map<number, { open: boolean; text: string }>();
</script>

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { WebLinksAddon } from '@xterm/addon-web-links';
  import { SearchAddon } from '@xterm/addon-search';
  import { wsManager } from '../../lib/state/ws.svelte.js';
  import { appState } from '../../lib/state/app.svelte.js';
  import { layoutState } from '../../lib/state/layout.svelte.js';
  import { toastState } from '../../lib/state/toast.svelte.js';
  import { uiState } from '../../lib/state/ui.svelte.js';
  import '@xterm/xterm/css/xterm.css';

  let { terminalId }: { terminalId: number } = $props();

  // Persistent per-terminal floating input state (survives component destroy/recreate)
  const _stored = floatingInputStore.get(terminalId);

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
  let isScrolledUp = $state(false);
  let scrollLock = false;  // When true, don't preserve scroll (after programmatic scrollToBottom)
  let scrollLockTimer: ReturnType<typeof setTimeout> | null = null;
  let showFloatingInput = $state(_stored?.open ?? false);
  let floatingInputText = $state(_stored?.text ?? '');
  let floatingInputEl: HTMLTextAreaElement | undefined = $state();

  // Sync floating input state back to persistent store
  $effect(() => {
    floatingInputStore.set(terminalId, { open: showFloatingInput, text: floatingInputText });
  });

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

    // Mobile: fix backspace by intercepting beforeinput on xterm's hidden textarea
    const xtermTa = containerEl.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
    if (xtermTa) {
      xtermTa.addEventListener('beforeinput', (e: InputEvent) => {
        if (e.inputType === 'deleteContentBackward') {
          e.preventDefault();
          wsManager.send({ type: 'terminal:input', terminalId, data: '\x7f' });
        } else if (e.inputType === 'deleteContentForward') {
          e.preventDefault();
          wsManager.send({ type: 'terminal:input', terminalId, data: '\x1b[3~' });
        }
      });
    }

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

    // Terminal input → WebSocket + clear activity
    terminal.onData((data) => {
      wsManager.send({ type: 'terminal:input', terminalId, data });
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

    // Track scroll position + detect active scrolling (wheel momentum / touch inertia)
    let userScrolling = false;
    let userScrollTimer: ReturnType<typeof setTimeout> | null = null;

    function updateScrollState() {
      const buf = terminal.buffer.active;
      isScrolledUp = buf.viewportY < buf.baseY;
    }
    function onUserScroll(settleMs: number) {
      scrollLock = false;
      userScrolling = true;
      if (userScrollTimer) clearTimeout(userScrollTimer);
      userScrollTimer = setTimeout(() => { userScrolling = false; }, settleMs);
      requestAnimationFrame(updateScrollState);
    }
    containerEl.addEventListener('wheel', () => onUserScroll(200), { passive: true });
    containerEl.addEventListener('touchstart', () => { scrollLock = false; userScrolling = true; if (userScrollTimer) clearTimeout(userScrollTimer); }, { passive: true });
    containerEl.addEventListener('touchend', () => onUserScroll(1000), { passive: true });
    terminal.onScroll(updateScrollState);
    cleanups.push(() => { if (userScrollTimer) clearTimeout(userScrollTimer); });

    // Terminal output: preserve scroll via DOM scrollTop (bypasses xterm.js internals).
    // Don't preserve during active scroll (would fight momentum/inertia).
    const viewport = containerEl.querySelector('.xterm-viewport') as HTMLElement;
    cleanups.push(wsManager.on('terminal:output', (msg) => {
      if (msg.terminalId !== terminalId) return;
      if (scrollLock || userScrolling) {
        terminal.write(msg.data);
      } else {
        const savedTop = viewport.scrollTop;
        const wasScrolledUp = terminal.buffer.active.viewportY < terminal.buffer.active.baseY;
        terminal.write(msg.data);
        if (wasScrolledUp) {
          viewport.scrollTop = savedTop;
        }
      }
      updateScrollState();
    }));

    cleanups.push(wsManager.on('terminal:buffered', (msg) => {
      if (msg.terminalId !== terminalId) return;
      terminal.write(msg.data);
      doScrollToBottom();
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

  // Refit when workspace switches or pane becomes active (no focus/scroll — let user clicks handle that)
  $effect(() => {
    const _wsId = layoutState.activeWorkspaceId;
    const _focus = layoutState.focusedLeafId;
    if (!terminal || !fitAddon) return;
    const t1 = setTimeout(() => { try { fitAddon.fit(); } catch {} }, 50);
    const t2 = setTimeout(() => { try { fitAddon.fit(); } catch {} }, 500);
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

  function sendTermKey(data: string) {
    wsManager.send({ type: 'terminal:input', terminalId, data });
  }

  /** Scroll to bottom and disable scroll preservation briefly so output keeps following */
  function doScrollToBottom() {
    terminal?.scrollToBottom();
    scrollLock = true;
    if (scrollLockTimer) clearTimeout(scrollLockTimer);
    scrollLockTimer = setTimeout(() => { scrollLock = false; }, 500);
    isScrolledUp = false;
  }

  function sendFloatingInput() {
    const trimmed = floatingInputText.trimEnd();
    if (!trimmed) return;
    const data = trimmed.replace(/\n/g, '\r') + '\r';
    wsManager.send({ type: 'terminal:input', terminalId, data });
    floatingInputText = '';
    floatingInputEl?.focus();
    setTimeout(doScrollToBottom, 50);
  }

  function clearFloatingInput() {
    floatingInputText = '';
    floatingInputEl?.focus();
  }

  function restoreScroll(distFromBottom: number) {
    try { fitAddon.fit(); } catch {}
    const newBase = terminal.buffer.active.baseY;
    terminal.scrollToLine(Math.max(0, newBase - distFromBottom));
  }

  function toggleFloatingInput() {
    // Save distance from bottom BEFORE toggle
    const buf = terminal?.buffer.active;
    const distFromBottom = buf ? buf.baseY - buf.viewportY : 0;
    showFloatingInput = !showFloatingInput;
    if (showFloatingInput) {
      tick().then(() => floatingInputEl?.focus());
    } else {
      terminal?.focus();
    }
    // Restore scroll after refit
    tick().then(() => {
      restoreScroll(distFromBottom);
      setTimeout(() => restoreScroll(distFromBottom), 100);
    });
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

  {#if !showFloatingInput}
    <div class="bottom-btns">
      {#if isScrolledUp}
        <button class="scroll-bottom-btn" title="Scroll to bottom" onpointerdown={(e) => e.preventDefault()} onclick={doScrollToBottom}>&#x2193;</button>
      {/if}
      <button class="side-btn compose-btn" title="Compose input" onclick={toggleFloatingInput}>&#x270E;</button>
    </div>
  {/if}

  {#if showFloatingInput}
    {#if isScrolledUp}
      <button class="scroll-bottom-btn floating-scroll" title="Scroll to bottom" onpointerdown={(e) => e.preventDefault()} onclick={doScrollToBottom}>&#x2193;</button>
    {/if}
    <div class="floating-input" class:floating-mobile={uiState.isMobile}>
      <textarea
        bind:this={floatingInputEl}
        bind:value={floatingInputText}
        class="floating-textarea"
        placeholder="Type here, send when ready..."
        rows={uiState.isMobile ? 3 : 6}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        onkeydown={(e) => {
          if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            sendTermKey('\x1b[Z');
            return;
          }
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            if (!floatingInputText.trim()) {
              sendTermKey('\r');
            } else {
              sendFloatingInput();
            }
            return;
          }
          if (e.key === 'Escape') {
            toggleFloatingInput();
          }
        }}
      ></textarea>
      {#if uiState.isMobile}
        <div class="compose-bar" onpointerdown={(e) => { if (!(e.target as HTMLElement).closest('.kb-toggle')) e.preventDefault(); }}>
          <div class="compose-bar-side">
            <button class="bar-btn" onclick={() => sendTermKey('\x1b')}>Esc</button>
            <button class="bar-btn" onclick={() => sendTermKey('\x1b[Z')}>&#x21E7;Tab</button>
            <span class="bar-spacer"></span>
            <button class="bar-btn" onclick={() => sendTermKey('\x1b[A')}>&#x25B2;</button>
            <button class="bar-btn" onclick={() => sendTermKey('\x1b[B')}>&#x25BC;</button>
            <span class="bar-spacer"></span>
            <button class="bar-btn" onclick={() => sendTermKey('\r')}>&#x23CE;</button>
          </div>
          <div class="compose-bar-side">
            <button class="bar-btn" onclick={() => sendTermKey('\x7f')}>&#x232B;</button>
            <button class="bar-btn muted-btn" onclick={toggleFloatingInput}>&#x25BE;</button>
            <button class="bar-btn send-btn" onclick={sendFloatingInput}>&#x27A4;</button>
          </div>
        </div>
      {:else}
        <div class="compose-btns">
          <button class="side-btn send-btn" title="Send (Shift+Enter)" onclick={sendFloatingInput}>&#x21B5;</button>
          <button class="side-btn muted-btn" title="Clear" onclick={clearFloatingInput}>&#x232B;</button>
          <button class="side-btn muted-btn" title="Hide" onclick={toggleFloatingInput}>&#x25BE;</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .terminal-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .terminal-container {
    width: 100%;
    flex: 1;
    min-height: 0;
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

  /* Side buttons (toggle compose + mobile scroll) */
  .side-btns {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 12;
    touch-action: none;
    pointer-events: none;
  }
  .side-btn {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    border: none;
    background: rgba(40, 40, 40, 0.5);
    color: var(--text-secondary);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    opacity: 0.4;
    pointer-events: auto;
  }
  .side-btn:active {
    opacity: 0.9;
    background: rgba(40, 40, 40, 0.7);
    color: var(--text-primary);
  }
  .side-btn.compose-btn {
    background: var(--accent);
    color: var(--bg-base);
    opacity: 0.5;
  }
  .side-btn.compose-btn:active {
    opacity: 1;
  }
  .side-btn.send-btn {
    background: var(--accent);
    color: var(--bg-base);
    opacity: 0.9;
  }
  .side-btn.send-btn:active {
    background: var(--accent-bright);
    opacity: 1;
  }
  .side-btn.muted-btn {
    background: var(--bg-active);
    color: var(--text-secondary);
    opacity: 0.8;
  }
  .side-btn.muted-btn:active {
    background: var(--bg-hover);
    color: var(--text-primary);
    opacity: 1;
  }

  /* Scroll to bottom — ghost button */
  .scroll-bottom-btn {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    opacity: 0.4;
  }
  .scroll-bottom-btn:active {
    opacity: 0.9;
    color: var(--text-primary);
  }

  /* When textarea is open: in flow above the floating input, right-aligned */
  .floating-scroll {
    align-self: flex-end;
    flex-shrink: 0;
    margin-right: 6px;
    margin-bottom: 8px;
  }

  /* When textarea is closed: stacked with compose toggle */
  .bottom-btns {
    position: absolute;
    right: 6px;
    bottom: 8px;
    z-index: 12;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  /* Floating input textarea */
  .floating-input {
    flex-shrink: 0;
    background: var(--bg-elevated);
    border-top: 1px solid var(--border-default);
    display: flex;
    gap: 6px;
    padding: 8px;
  }
  .compose-btns {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .floating-input.floating-mobile {
    flex-direction: column;
  }
  .floating-mobile .floating-textarea {
    width: 100%;
  }

  /* Mobile: button bar below textarea */
  .compose-bar {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }
  .compose-bar-side {
    display: flex;
    gap: 4px;
  }
  .compose-bar-side:last-child {
    gap: 14px;
  }
  .bar-btn {
    height: 36px;
    min-width: 36px;
    padding: 0 8px;
    border-radius: 6px;
    border: none;
    background: var(--bg-active);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
  }
  .bar-spacer {
    width: 8px;
  }
  .bar-btn:active {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  .bar-btn.send-btn {
    background: var(--accent);
    color: var(--bg-base);
  }
  .bar-btn.send-btn:active {
    background: var(--accent-bright);
  }
  .bar-btn.muted-btn {
    opacity: 0.7;
  }
  .floating-textarea {
    flex: 1;
    min-width: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    padding: 8px 10px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 16px;
    line-height: 1.4;
    resize: none;
    outline: none;
  }
  .floating-textarea:focus { border-color: var(--accent); }
  .floating-textarea::placeholder { color: var(--text-tertiary); }

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
