<script lang="ts">
  import { appState, type Project } from '../../lib/state/app.svelte.js';
  import { inlineEdit } from '../../lib/actions/inline-edit.js';
  import { dragState } from '../../lib/state/drag.svelte.js';
  import { uiState } from '../../lib/state/ui.svelte.js';

  let { project }: { project: Project } = $props();

  let showActions = $state(false);
  let isDragOver = $state(false);

  function onItemDragStart(type: 'terminal' | 'note' | 'iframe', id: number, e: DragEvent) {
    dragState.dragging = { type, id };
    e.dataTransfer!.effectAllowed = 'move';
  }

  function onProjectDragStart(e: DragEvent) {
    dragState.dragging = { type: 'project', id: project.id };
    e.dataTransfer!.effectAllowed = 'move';
  }

  function onProjectDragOver(e: DragEvent) {
    if (!dragState.dragging) return;
    e.preventDefault();
    if (dragState.dragging.type === 'project') {
      isDragOver = true;
    } else {
      isDragOver = true;
    }
  }

  function onProjectDragLeave() {
    isDragOver = false;
    dragState.dropProjectTarget = null;
  }

  function onProjectDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    if (!dragState.dragging) return;

    if (dragState.dragging.type === 'project') {
      // Reorder projects
      const fromId = dragState.dragging.id;
      const toId = project.id;
      if (fromId !== toId) {
        const ids = appState.projects.map(p => p.id);
        const fromIdx = ids.indexOf(fromId);
        const toIdx = ids.indexOf(toId);
        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, fromId);
        appState.reorderProjects(ids);
      }
    } else {
      // Move item to this project
      const { type, id } = dragState.dragging;
      appState.moveItem(type, id, project.id);
    }

    dragState.dragging = null;
    dragState.dropProjectTarget = null;
  }

  function onDragEnd() {
    dragState.dragging = null;
    dragState.dropProjectTarget = null;
    isDragOver = false;
  }

  function isActive(type: string, id: number): boolean {
    return appState.activePane?.type === type && appState.activePane?.id === id;
  }

  // Long-press delete
  let deleteTimer: ReturnType<typeof setTimeout> | null = null;
  let deletingId: string | null = $state(null);

  function startDelete(id: string, fn: () => void) {
    deletingId = id;
    deleteTimer = setTimeout(() => {
      fn();
      deletingId = null;
    }, 3000);
  }

  function cancelDelete() {
    if (deleteTimer) clearTimeout(deleteTimer);
    deletingId = null;
  }
</script>

<div
  class="project-group"
  class:drag-over={isDragOver}
  onpointerenter={() => showActions = true}
  onpointerleave={() => { showActions = false; cancelDelete(); }}
  ondragover={onProjectDragOver}
  ondragleave={onProjectDragLeave}
  ondrop={onProjectDrop}
>
  <div
    class="project-header"
    draggable="true"
    ondragstart={onProjectDragStart}
    ondragend={onDragEnd}
    onclick={() => appState.toggleProject(project.id)}
  >
    <span class="expand-icon">{project.expanded ? '▼' : '▶'}</span>
    <span class="project-name" use:inlineEdit={{ value: project.name, onSave: (v) => appState.renameProject(project.id, v) }}>{project.name}</span>
    <div class="project-actions" class:visible={showActions || uiState.isMobile} onclick={(e) => e.stopPropagation()}>
      <button class="act-btn emoji-btn" title="New terminal" onclick={() => appState.createTerminal(project.id)}>💻</button>
      <button class="act-btn emoji-btn" title="New docker sandbox" onclick={() => appState.createDocker(project.id)}>🐳</button>
      <button class="act-btn emoji-btn" title="New note" onclick={() => appState.createNote(project.id)}>📝</button>
      <button class="act-btn emoji-btn" title="New iframe" onclick={() => appState.createIframe(project.id)}>🌐</button>
      <button
        class="act-btn del"
        class:closing={deletingId === `p${project.id}`}
        title="Hold 3s to delete project"
        onpointerdown={() => startDelete(`p${project.id}`, () => appState.deleteProject(project.id))}
        onpointerup={cancelDelete}
        onpointercancel={cancelDelete}
        onpointerleave={cancelDelete}
      ><span>&#xd7;</span></button>
    </div>
  </div>

  {#if project.expanded}
    <div class="project-children">
      {#each project.terminals.filter(t => t.is_docker) as t (t.id)}
        <div
          class="tree-item docker-item"
          class:active={isActive('terminal', t.id)}
          draggable="true"
          ondragstart={(e) => onItemDragStart('terminal', t.id, e)}
          ondragend={onDragEnd}
          onclick={() => appState.activePane = { type: 'terminal', id: t.id }}
        >
          <span class="icon">{t.emoji}</span>
          <span class="label" use:inlineEdit={{ value: t.name, onSave: (v) => appState.renameTerminal(t.id, v) }}>{t.claudePrefix ? t.claudePrefix + ' ' : ''}{t.name}</span>
          {#if t.isStopping}
            <span class="stopping-dot"></span>
          {:else if t.hasActivity}
            <span class="activity-dot"></span>
          {/if}
          <button
            class="item-del"
            class:mobile-visible={uiState.isMobile}
            class:closing={deletingId === `t${t.id}`}
            title="Hold 3s to delete"
            onclick={(e) => e.stopPropagation()}
            onpointerdown={(e) => { e.stopPropagation(); startDelete(`t${t.id}`, () => appState.deleteTerminal(t.id)); }}
            onpointerup={cancelDelete}
            onpointercancel={cancelDelete}
            onpointerleave={cancelDelete}
          ><span>&#xd7;</span></button>
        </div>
      {/each}

      {#each project.terminals.filter(t => !t.is_docker) as t (t.id)}
        <div
          class="tree-item"
          class:active={isActive('terminal', t.id)}
          draggable="true"
          ondragstart={(e) => onItemDragStart('terminal', t.id, e)}
          ondragend={onDragEnd}
          onclick={() => appState.activePane = { type: 'terminal', id: t.id }}
        >
          <span class="icon">{t.emoji}</span>
          <span class="label" use:inlineEdit={{ value: t.name, onSave: (v) => appState.renameTerminal(t.id, v) }}>{t.claudePrefix ? t.claudePrefix + ' ' : ''}{t.name}</span>
          {#if t.isStopping}
            <span class="stopping-dot"></span>
          {:else if t.hasActivity}
            <span class="activity-dot"></span>
          {/if}
          <button
            class="item-del"
            class:mobile-visible={uiState.isMobile}
            class:closing={deletingId === `t${t.id}`}
            title="Hold 3s to delete"
            onclick={(e) => e.stopPropagation()}
            onpointerdown={(e) => { e.stopPropagation(); startDelete(`t${t.id}`, () => appState.deleteTerminal(t.id)); }}
            onpointerup={cancelDelete}
            onpointercancel={cancelDelete}
            onpointerleave={cancelDelete}
          ><span>&#xd7;</span></button>
        </div>
      {/each}

      {#each project.notes as n (n.id)}
        <div
          class="tree-item"
          class:active={isActive('note', n.id)}
          draggable="true"
          ondragstart={(e) => onItemDragStart('note', n.id, e)}
          ondragend={onDragEnd}
          onclick={() => appState.activePane = { type: 'note', id: n.id }}
        >
          <span class="icon">{n.emoji}</span>
          <span class="label" use:inlineEdit={{ value: n.name, onSave: (v) => appState.renameNote(n.id, v) }}>{n.name}</span>
          <button
            class="item-del"
            class:mobile-visible={uiState.isMobile}
            class:closing={deletingId === `n${n.id}`}
            title="Hold 3s to delete"
            onclick={(e) => e.stopPropagation()}
            onpointerdown={(e) => { e.stopPropagation(); startDelete(`n${n.id}`, () => appState.deleteNote(n.id)); }}
            onpointerup={cancelDelete}
            onpointercancel={cancelDelete}
            onpointerleave={cancelDelete}
          ><span>&#xd7;</span></button>
        </div>
      {/each}

      {#each project.iframes as i (i.id)}
        <div
          class="tree-item"
          draggable="true"
          ondragstart={(e) => onItemDragStart('iframe', i.id, e)}
          ondragend={onDragEnd}
          class:active={isActive('iframe', i.id)}
          onclick={() => appState.activePane = { type: 'iframe', id: i.id }}
        >
          <span class="icon">{i.emoji}</span>
          <span class="label" use:inlineEdit={{ value: i.name, onSave: (v) => appState.renameIframe(i.id, v) }}>{i.name}</span>
          <button
            class="item-del"
            class:mobile-visible={uiState.isMobile}
            class:closing={deletingId === `i${i.id}`}
            title="Hold 3s to delete"
            onclick={(e) => e.stopPropagation()}
            onpointerdown={(e) => { e.stopPropagation(); startDelete(`i${i.id}`, () => appState.deleteIframe(i.id)); }}
            onpointerup={cancelDelete}
            onpointercancel={cancelDelete}
            onpointerleave={cancelDelete}
          ><span>&#xd7;</span></button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .project-group { margin-bottom: 8px; }
  .project-group.drag-over {
    background: var(--accent-dim);
    border-radius: 4px;
  }


  .project-header {
    display: flex;
    align-items: center;
    padding: 3px 10px;
    gap: 6px;
    cursor: pointer;
    color: var(--text-primary);
    font-weight: 500;
    font-size: 13px;
    transition: background var(--transition);
  }
  .project-header:hover { background: var(--bg-hover); }

  .expand-icon {
    font-size: 8px;
    color: var(--text-tertiary);
    width: 16px;
    text-align: center;
  }

  .project-name { flex: 1; }

  .project-actions {
    display: flex;
    gap: 2px;
    margin-left: auto;
    visibility: hidden;
  }
  .project-actions.visible { visibility: visible; }

  .act-btn {
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
    font-size: 11px;
    white-space: nowrap;
    transition: all var(--transition);
  }
  .act-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .act-btn[title] { position: relative; }
  .act-btn[title]:hover::after {
    content: attr(title);
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    padding: 3px 8px;
    background: var(--bg-surface, #3c3836);
    color: var(--text-primary, #ebdbb2);
    font-size: 14px;
    border-radius: 4px;
    white-space: nowrap;
    z-index: 100;
    pointer-events: none;
    margin-top: 4px;
  }

  .act-btn.del, .item-del {
    position: relative;
    overflow: hidden;
    font-size: 14px;
  }
  .act-btn.del::before, .item-del::before {
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
  .act-btn.del.closing::before, .item-del.closing::before {
    transform: scaleX(1);
    transition: transform 3s linear;
    opacity: 1;
  }
  .act-btn.del.closing, .item-del.closing { color: var(--text-bright); }
  .act-btn.del span, .item-del span { position: relative; z-index: 1; }

  .tree-item {
    display: flex;
    align-items: center;
    padding: 2px 10px 2px 30px;
    gap: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary);
    transition: background var(--transition);
    position: relative;
  }
  .tree-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .tree-item.active {
    background: var(--accent-dim);
    color: var(--accent);
  }
  .tree-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 2px;
    background: var(--accent);
    border-radius: 0 1px 1px 0;
  }

  .icon {
    font-size: 13px;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
    opacity: 0.6;
  }
  .icon-nowrap { white-space: nowrap; }
  .tree-item.active .icon { opacity: 1; }

  .label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-del {
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
    flex-shrink: 0;
    margin-left: auto;
  }
  .tree-item:hover .item-del { display: flex; }
  .item-del.mobile-visible { display: flex; }

  .stopping-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--red);
    box-shadow: 0 0 6px var(--red);
    flex-shrink: 0;
    animation: dot-pulse 1s ease-in-out infinite;
  }

  .emoji-btn {
    font-size: 12px;
  }

  .activity-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 6px var(--green);
    flex-shrink: 0;
    animation: dot-pulse 1.5s ease-in-out infinite;
  }

  @keyframes dot-pulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; box-shadow: 0 0 10px var(--green); }
  }
</style>
