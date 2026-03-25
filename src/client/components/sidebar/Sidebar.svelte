<script lang="ts">
  import { appState } from '../../lib/state/app.svelte.js';
  import { api } from '../../lib/api.js';
  import { uiState } from '../../lib/state/ui.svelte.js';
  import ProjectTree from './ProjectTree.svelte';
  import WorkspaceList from './WorkspaceList.svelte';
  import ClaudeUsage from './ClaudeUsage.svelte';

  let newProjectName = $state('');
  let showNewProject = $state(false);
  let logoutClosing = $state(false);
  let logoutTimer: ReturnType<typeof setTimeout> | null = null;

  function startLogout() {
    logoutClosing = true;
    logoutTimer = setTimeout(async () => {
      await api.post('/auth/logout');
      window.location.reload();
    }, 3000);
  }

  function cancelLogout() {
    if (logoutTimer) clearTimeout(logoutTimer);
    logoutClosing = false;
  }

  async function addProject() {
    if (!newProjectName.trim()) return;
    await appState.createProject(newProjectName.trim());
    newProjectName = '';
    showNewProject = false;
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <div class="brand">
      <button
        class="brand-logout"
        class:closing={logoutClosing}
        title="Hold 3s to logout"
        onmousedown={startLogout}
        onmouseup={cancelLogout}
        onmouseleave={cancelLogout}
      ><span>&#x23FB;</span></button>
      <span class="brand-name">Dopamine</span>
    </div>
    {#if !uiState.isMobile}
      <button class="header-btn" title="Fullscreen" onclick={() => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      }}>&#x26F6;</button>
    {/if}
  </div>

  <div class="hostname">{location.host}</div>

  <div class="sidebar-content">
    {#if !uiState.isMobile}
      <WorkspaceList />
    {/if}

    <div class="section-label" style={uiState.isMobile ? '' : 'margin-top: 8px;'}>
      Projects
      <button class="add-btn" title="New project" onclick={() => showNewProject = !showNewProject}>+</button>
    </div>

    {#if showNewProject}
      <form class="new-project-form" onsubmit={(e) => { e.preventDefault(); addProject(); }}>
        <input
          class="inline-input"
          bind:value={newProjectName}
          placeholder="Project name"
          autofocus
          onblur={() => { if (!newProjectName) showNewProject = false; }}
          onkeydown={(e) => { if (e.key === 'Escape') showNewProject = false; }}
        />
      </form>
    {/if}

    {#each appState.projects as project (project.id)}
      <ProjectTree {project} />
    {/each}
  </div>
  <ClaudeUsage />
</aside>

<style>
  .sidebar {
    width: 260px;
    min-width: 260px;
    background: var(--bg-base);
    border-right: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    user-select: none;
    height: 100%;
  }

  .sidebar-header {
    padding: 12px 14px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .brand-name {
    font-weight: 500;
    font-size: 14px;
    letter-spacing: 2px;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .brand-logout {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--green);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
    position: relative;
    overflow: hidden;
  }
  .brand-logout::before {
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
  .brand-logout.closing::before {
    transform: scaleX(1);
    transition: transform 3s linear;
    opacity: 1;
  }
  .brand-logout.closing { color: var(--text-bright); }
  .brand-logout span { position: relative; z-index: 1; }

  .header-btn {
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
    transition: color var(--transition);
  }
  .header-btn:hover { color: var(--text-primary); }

  .hostname {
    font-size: 14px;
    color: var(--text-secondary);
    padding: 0 14px 8px;
    border-bottom: 1px solid var(--border-ghost);
    margin-bottom: 4px;
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 0;
  }

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

  .new-project-form {
    padding: 2px 14px;
  }
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
</style>
