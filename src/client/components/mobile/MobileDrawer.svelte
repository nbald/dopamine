<script lang="ts">
  import { uiState } from '../../lib/state/ui.svelte.js';
  import Sidebar from '../sidebar/Sidebar.svelte';
</script>

{#if uiState.drawerOpen}
  <div class="drawer-backdrop" onclick={() => uiState.closeDrawer()} role="presentation"></div>
{/if}

<div class="drawer" class:open={uiState.drawerOpen}>
  <Sidebar />
</div>

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 90;
  }

  .drawer {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 280px;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 200ms ease;
  }

  .drawer.open {
    transform: translateX(0);
  }

  .drawer :global(.sidebar) {
    width: 100%;
    min-width: 100%;
    height: 100%;
  }
</style>
