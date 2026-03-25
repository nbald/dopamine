<script lang="ts">
  import type { LeafNode } from '../../lib/utils/split-tree.js';
  import { layoutState } from '../../lib/state/layout.svelte.js';
  import { appState } from '../../lib/state/app.svelte.js';
  import TerminalView from '../terminal/TerminalView.svelte';
  import NoteEditor from '../notes/NoteEditor.svelte';
  import IframeView from '../iframe/IframeView.svelte';

  let { leaf }: { leaf: LeafNode } = $props();

  let isFocused = $derived(layoutState.focusedLeafId === leaf.id);
  let borderClass = $derived(
    leaf.contentType === 'note' ? 'focus-yellow' :
    leaf.contentType === 'iframe' ? 'focus-blue' : 'focus-green'
  );

  function clearActivity() {
    if (leaf.contentType === 'terminal' && leaf.contentId) {
      for (const p of appState.projects) {
        const t = p.terminals.find(t => t.id === leaf.contentId);
        if (t) t.hasActivity = false;
      }
    }
  }

  let closeProgress = $state(false);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function startClose() {
    closeProgress = true;
    closeTimer = setTimeout(() => {
      layoutState.close(leaf.id);
      closeProgress = false;
    }, 3000);
  }

  function cancelClose() {
    if (closeTimer) clearTimeout(closeTimer);
    closeProgress = false;
  }
</script>

<div
  class="pane"
  class:focused={isFocused}
  class:focus-green={isFocused && borderClass === 'focus-green'}
  class:focus-yellow={isFocused && borderClass === 'focus-yellow'}
  class:focus-blue={isFocused && borderClass === 'focus-blue'}
  onclick={() => { layoutState.setFocus(leaf.id); clearActivity(); }}
  onkeydown={clearActivity}
  role="group"
>
  <div class="pane-header">
    {#if leaf.contentType === 'terminal'}
      <span class="pane-icon">&gt;_</span>
    {:else if leaf.contentType === 'note'}
      <span class="pane-icon">&#9776;</span>
    {:else if leaf.contentType === 'iframe'}
      <span class="pane-icon icon-nowrap">&lt;/&gt;</span>
    {:else}
      <span class="pane-icon">&#9633;</span>
    {/if}

    <span class="pane-title">
      {#if leaf.contentType === 'empty'}
        Empty
      {:else if leaf.contentType === 'terminal'}
        {(() => { for (const p of appState.projects) { const t = p.terminals.find(t => t.id === leaf.contentId); if (t) return t.title_override || t.title || t.name; } return 'Terminal'; })()}
      {:else if leaf.contentType === 'note'}
        {(() => { for (const p of appState.projects) { const n = p.notes.find(n => n.id === leaf.contentId); if (n) return n.name; } return 'Note'; })()}
      {:else if leaf.contentType === 'iframe'}
        {(() => { for (const p of appState.projects) { const i = p.iframes.find(i => i.id === leaf.contentId); if (i) return i.name || i.url; } return 'Preview'; })()}
      {/if}
    </span>

    <div class="pane-actions">
      <button class="pane-btn" title="Split vertical" onclick={(e) => { e.stopPropagation(); layoutState.setFocus(leaf.id); layoutState.split('h'); }}>&#x2503;</button>
      <button class="pane-btn" title="Split horizontal" onclick={(e) => { e.stopPropagation(); layoutState.setFocus(leaf.id); layoutState.split('v'); }}>&#x2501;</button>
      <button class="pane-btn" title="Fullscreen" onclick={(e) => { e.stopPropagation(); layoutState.toggleMaximize(leaf.id); }}>&#x26F6;</button>
      <button
        class="pane-close"
        class:closing={closeProgress}
        title="Hold 3s to close"
        onmousedown={startClose}
        onmouseup={cancelClose}
        onmouseleave={cancelClose}
      ><span>&#xd7;</span></button>
    </div>
  </div>

  <div class="pane-body">
    {#if leaf.contentType === 'terminal' && leaf.contentId}
      {#key leaf.contentId}
        <TerminalView terminalId={leaf.contentId} />
      {/key}
    {:else if leaf.contentType === 'note' && leaf.contentId}
      {#key leaf.contentId}
        <NoteEditor noteId={leaf.contentId} />
      {/key}
    {:else if leaf.contentType === 'iframe' && leaf.contentId}
      {#key leaf.contentId}
        <IframeView iframeId={leaf.contentId} />
      {/key}
    {:else}
      <div class="empty-pane">
        <p>Click an item in the sidebar</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    min-height: 0;
    border: 1px solid transparent;
    transition: border-color 200ms ease;
  }
  .pane.focus-green { border-color: var(--accent); }
  .pane.focus-yellow { border-color: var(--yellow); }
  .pane.focus-blue { border-color: var(--blue); }

  .pane-header {
    height: 32px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-ghost);
    display: flex;
    align-items: center;
    padding: 0 8px;
    gap: 6px;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .pane.focused .pane-header { color: var(--text-primary); }

  .pane-icon {
    font-size: 12px;
    opacity: 0.5;
  }
  .icon-nowrap { white-space: nowrap; }
  .pane.focused .pane-icon { opacity: 0.9; }

  .pane-title {
    flex: 1;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pane-actions {
    display: flex;
    gap: 2px;
    align-items: center;
  }

  .pane-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
    transition: all var(--transition);
  }
  .pane-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

  .pane-close {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
    position: relative;
    overflow: hidden;
    transition: color 0.2s ease;
  }
  .pane-close::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--red);
    transform: scaleX(0.15);
    transform-origin: left;
    border-radius: 3px;
    z-index: 0;
    opacity: 0;
  }
  .pane-close.closing::before {
    transform: scaleX(1);
    transition: transform 3s linear;
    opacity: 1;
  }
  .pane-close.closing { color: var(--text-bright); }
  .pane-close span { position: relative; z-index: 1; }

  .pane-body {
    flex: 1;
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  .empty-pane {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-tertiary);
    font-size: 14px;
  }
</style>
