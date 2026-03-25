<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../../lib/api.js';
  import { layoutState } from '../../lib/state/layout.svelte.js';
  import { appState } from '../../lib/state/app.svelte.js';
  import { inlineEdit } from '../../lib/actions/inline-edit.js';

  export interface Workspace {
    id: number;
    name: string;
    layout: string;
    sort_order: number;
  }

  let workspaces = $state<Workspace[]>([]);
  let showNew = $state(false);
  let newName = $state('');
  let skipNextSave = false;

  export async function load() {
    workspaces = await api.get<Workspace[]>('/workspaces');

    if (workspaces.length === 0) {
      // Create default workspace
      const ws = await api.post<Workspace>('/workspaces', { name: 'Default', layout: '{}' });
      workspaces = [ws];
    }

    // Load all workspace trees into layoutState
    for (const ws of workspaces) {
      layoutState.loadWorkspace(ws.id, ws.layout);
    }

    // Activate first workspace
    const first = workspaces[0];
    layoutState.switchWorkspace(first.id);

    // If active tree is empty and there's a terminal, assign it
    if (layoutState.tree?.type === 'leaf' && layoutState.tree.contentType === 'empty') {
      if (appState.activePane) {
        layoutState.assign(appState.activePane.type, appState.activePane.id);
      }
    }

    skipNextSave = true;
  }

  function activate(ws: Workspace) {
    if (layoutState.activeWorkspaceId === ws.id) return;

    // Save current workspace to API
    if (layoutState.activeWorkspaceId !== null) {
      layoutState.saveToWorkspace(layoutState.activeWorkspaceId);
    }

    skipNextSave = true;
    layoutState.switchWorkspace(ws.id);
  }

  async function addWorkspace() {
    if (!newName.trim()) return;
    const layout = layoutState.serializeLayout();
    const ws = await api.post<Workspace>('/workspaces', { name: newName.trim(), layout });
    workspaces = [...workspaces, ws];
    layoutState.loadWorkspace(ws.id, ws.layout);
    layoutState.switchWorkspace(ws.id);
    newName = '';
    showNew = false;
  }

  // Save on layout change (debounced)
  $effect(() => {
    const _tree = layoutState.tree;
    const wsId = layoutState.activeWorkspaceId;
    if (wsId === null) return;
    if (skipNextSave) { skipNextSave = false; return; }
    const timer = setTimeout(() => {
      layoutState.saveToWorkspace(wsId);
    }, 1000);
    return () => clearTimeout(timer);
  });

  // Keyboard shortcut handler (Ctrl+1..9)
  function onKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      if (idx < workspaces.length) {
        e.preventDefault();
        activate(workspaces[idx]);
      }
    }
  }

  onMount(() => {
    load();
    document.addEventListener('keydown', onKeydown);
  });

  let deleteTimer: ReturnType<typeof setTimeout> | null = null;
  let deletingId: number | null = $state(null);

  function startDeleteWs(ws: Workspace) {
    if (workspaces.length <= 1) return; // Can't delete last workspace
    deletingId = ws.id;
    deleteTimer = setTimeout(async () => {
      await api.del(`/workspaces/${ws.id}`);
      layoutState.removeWorkspace(ws.id);
      workspaces = workspaces.filter(w => w.id !== ws.id);
      if (layoutState.activeWorkspaceId === ws.id && workspaces.length > 0) {
        activate(workspaces[0]);
      }
      deletingId = null;
    }, 3000);
  }

  function cancelDeleteWs() {
    if (deleteTimer) clearTimeout(deleteTimer);
    deletingId = null;
  }

  onDestroy(() => {
    document.removeEventListener('keydown', onKeydown);
  });
</script>

<div class="section-label">
  Workspaces
  <button class="add-btn" title="New workspace" onclick={() => showNew = !showNew}>+</button>
</div>

{#if showNew}
  <form class="new-form" onsubmit={(e) => { e.preventDefault(); addWorkspace(); }}>
    <input
      class="inline-input"
      bind:value={newName}
      placeholder="Workspace name"
      autofocus
      onblur={() => { if (!newName) showNew = false; }}
      onkeydown={(e) => { if (e.key === 'Escape') showNew = false; }}
    />
  </form>
{/if}

{#each workspaces as ws, i (ws.id)}
  <div
    class="workspace-item"
    class:active={layoutState.activeWorkspaceId === ws.id}
    onclick={() => activate(ws)}
  >
    <span class="ws-icon">&#9707;</span>
    <span class="ws-name" use:inlineEdit={{ value: ws.name, onSave: async (v) => { await api.put(`/workspaces/${ws.id}`, { name: v }); ws.name = v; } }}>{ws.name}</span>
    {#if workspaces.length > 1}
      <button
        class="ws-del"
        class:closing={deletingId === ws.id}
        title="Hold 3s to delete"
        onclick={(e) => e.stopPropagation()}
        onmousedown={(e) => { e.stopPropagation(); startDeleteWs(ws); }}
        onmouseup={cancelDeleteWs}
        onmouseleave={cancelDeleteWs}
      ><span>&#xd7;</span></button>
    {/if}
  </div>
{/each}

<style>
  .section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text-tertiary);
    padding: 10px 14px 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .add-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
    transition: color var(--transition);
  }
  .add-btn:hover { color: var(--text-primary); }

  .new-form { padding: 2px 14px; }
  .inline-input {
    width: 100%;
    background: var(--bg-elevated);
    border: 1px solid var(--border-focus);
    border-radius: 3px;
    padding: 3px 8px;
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
  }

  .workspace-item {
    display: flex;
    align-items: center;
    padding: 2px 10px 2px 30px;
    gap: 6px;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 13px;
    transition: all var(--transition);
  }
  .workspace-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .workspace-item.active { color: var(--purple); }

  .ws-icon {
    width: 16px;
    font-size: 13px;
    text-align: center;
    flex-shrink: 0;
  }
  .workspace-item.active .ws-icon { color: var(--purple); }

  .ws-name { flex: 1; }

  .ws-del {
    width: 16px;
    height: 16px;
    display: none;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
    flex-shrink: 0;
    margin-left: auto;
    overflow: hidden;
    position: relative;
  }
  .workspace-item:hover .ws-del { display: flex; }
  .ws-del::before {
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
  .ws-del.closing::before {
    transform: scaleX(1);
    transition: transform 3s linear;
    opacity: 1;
  }
  .ws-del.closing { color: var(--text-bright); }
  .ws-del span { position: relative; z-index: 1; }

</style>
