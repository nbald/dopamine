<script lang="ts">
  import { appState } from '../../lib/state/app.svelte.js';

  let { visible, onClose }: { visible: boolean; onClose: () => void } = $props();

  let query = $state('');
  let selectedIdx = $state(0);
  let inputEl: HTMLInputElement;

  interface Item {
    type: 'terminal' | 'note' | 'iframe';
    id: number;
    name: string;
    project: string;
    icon: string;
  }

  let items = $derived.by(() => {
    const all: Item[] = [];
    for (const p of appState.projects) {
      for (const t of p.terminals) {
        all.push({ type: 'terminal', id: t.id, name: t.title || t.name, project: p.name, icon: '>_' });
      }
      for (const n of p.notes) {
        all.push({ type: 'note', id: n.id, name: n.name, project: p.name, icon: '\u2630' });
      }
      for (const i of p.iframes) {
        all.push({ type: 'iframe', id: i.id, name: i.name || i.url, project: p.name, icon: '</>' });
      }
    }
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(item =>
      item.name.toLowerCase().includes(q) || item.project.toLowerCase().includes(q)
    );
  });

  function select(item: Item) {
    appState.activePane = { type: item.type, id: item.id };
    onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIdx]) select(items[selectedIdx]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  $effect(() => {
    if (visible) {
      query = '';
      selectedIdx = 0;
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  $effect(() => {
    // Reset selection when query changes
    query;
    selectedIdx = 0;
  });
</script>

{#if visible}
  <div class="overlay" onclick={onClose} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="input-wrap">
        <span class="search-icon">&#8981;</span>
        <input
          class="input"
          bind:this={inputEl}
          bind:value={query}
          placeholder="Jump to..."
          onkeydown={onKeydown}
        />
        <span class="hint">esc</span>
      </div>
      <div class="results">
        {#each items as item, i (item.type + item.id)}
          <div
            class="result"
            class:selected={i === selectedIdx}
            onclick={() => select(item)}
            onmouseenter={() => selectedIdx = i}
          >
            <span class="result-icon">{item.icon}</span>
            <span class="result-name">{item.name}</span>
            <span class="result-project">{item.project}</span>
          </div>
        {/each}
        {#if items.length === 0}
          <div class="no-results">No results</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(2px);
    z-index: 5000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 18vh;
  }

  .modal {
    width: 480px;
    max-height: 360px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .input-wrap {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .search-icon {
    color: var(--text-tertiary);
    font-size: 15px;
    flex-shrink: 0;
  }

  .input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-size: 14px;
    color: var(--text-primary);
  }
  .input::placeholder { color: var(--text-tertiary); }

  .hint {
    font-size: 10px;
    color: var(--text-tertiary);
    background: var(--bg-active);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .results {
    overflow-y: auto;
    padding: 4px 0;
  }

  .result {
    display: flex;
    align-items: center;
    padding: 7px 14px;
    gap: 10px;
    cursor: pointer;
  }
  .result:hover, .result.selected {
    background: var(--bg-hover);
  }
  .result.selected {
    background: var(--accent-dim);
  }

  .result-icon {
    font-size: 13px;
    width: 20px;
    text-align: center;
    color: var(--text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .result.selected .result-icon { color: var(--accent); }

  .result-name {
    font-size: 13px;
    color: var(--text-primary);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-project {
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .no-results {
    padding: 14px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 13px;
  }
</style>
