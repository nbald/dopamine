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

  let paneInfo = $derived.by(() => {
    if (leaf.contentType === 'empty') return null;
    for (const p of appState.projects) {
      if (leaf.contentType === 'terminal') {
        const t = p.terminals.find(t => t.id === leaf.contentId);
        if (t) return { project: p.name, emoji: t.emoji, name: t.name, claudePrefix: t.claudePrefix || '' };
      } else if (leaf.contentType === 'note') {
        const n = p.notes.find(n => n.id === leaf.contentId);
        if (n) return { project: p.name, emoji: n.emoji, name: n.name, claudePrefix: '' };
      } else if (leaf.contentType === 'iframe') {
        const i = p.iframes.find(i => i.id === leaf.contentId);
        if (i) return { project: p.name, emoji: i.emoji, name: i.name || i.url, claudePrefix: '' };
      }
    }
    return null;
  });

  function doClose() {
    layoutState.close(leaf.id);
  }

  let dragOver = $state(false);

  function onDragStart(e: DragEvent) {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', leaf.id);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    dragOver = true;
  }

  function onDragLeave() {
    dragOver = false;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const sourceId = e.dataTransfer!.getData('text/plain');
    if (sourceId && sourceId !== leaf.id) {
      layoutState.swap(sourceId, leaf.id);
    }
  }
</script>

<div
  class="pane"
  class:focused={isFocused}
  class:focus-green={isFocused && borderClass === 'focus-green'}
  class:focus-yellow={isFocused && borderClass === 'focus-yellow'}
  class:focus-blue={isFocused && borderClass === 'focus-blue'}
  class:drag-over={dragOver}
  onclick={() => { layoutState.setFocus(leaf.id); clearActivity(); }}
  onkeydown={clearActivity}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  role="group"
>
  <div class="pane-header" draggable="true" ondragstart={onDragStart} role="toolbar">
    {#if paneInfo}
      <span class="pane-title">
        <span class="pane-panel">{paneInfo.emoji} {paneInfo.claudePrefix ? paneInfo.claudePrefix + ' ' : ''}{paneInfo.name}</span>
        <span class="pane-sep">|</span>
        <span class="pane-project">{paneInfo.project}</span>
      </span>
    {:else}
      <span class="pane-icon">&#9633;</span>
      <span class="pane-title">Empty</span>
    {/if}

    <div class="pane-actions">
      <button class="pane-btn" title="Split vertical" onclick={(e) => { e.stopPropagation(); layoutState.setFocus(leaf.id); layoutState.split('h'); }}>&#x2503;</button>
      <button class="pane-btn" title="Split horizontal" onclick={(e) => { e.stopPropagation(); layoutState.setFocus(leaf.id); layoutState.split('v'); }}>&#x2501;</button>
      <button class="pane-btn" title="Fullscreen" onclick={(e) => { e.stopPropagation(); layoutState.toggleMaximize(leaf.id); }}>&#x26F6;</button>
      <button class="pane-close" title="Close" onclick={doClose}><span>&#xd7;</span></button>
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
  .pane.drag-over { border-color: var(--accent); border-style: dashed; }

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
    cursor: grab;
  }
  .pane-header:active { cursor: grabbing; }
  .pane.focused .pane-header { color: var(--text-primary); }

  .pane-icon {
    font-size: 12px;
    opacity: 0.5;
  }
  .pane.focused .pane-icon { opacity: 0.9; }

  .pane-title {
    flex: 1;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0;
    min-width: 0;
  }

  .pane-project {
    opacity: 0.5;
    flex-shrink: 0;
  }
  .pane.focused .pane-project { opacity: 0.7; }

  .pane-sep {
    opacity: 0.3;
    margin: 0 6px;
    flex-shrink: 0;
  }

  .pane-panel {
    flex-shrink: 0;
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
  .pane-close:hover { background: var(--bg-hover); color: var(--text-primary); }

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
