<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.js';

  let { iframeId }: { iframeId: number } = $props();

  let url = $state('');
  let inputUrl = $state('');
  let loaded = $state(false);

  onMount(async () => {
    const iframe = await api.get<any>(`/iframes/${iframeId}`);
    url = iframe.url || '';
    inputUrl = url;
    loaded = true;
  });

  function navigate() {
    let target = inputUrl.trim();
    if (!target) { url = ''; return; }
    if (!/^https?:\/\//i.test(target)) {
      target = 'https://' + target;
    }
    url = target;
    api.put(`/iframes/${iframeId}`, { url: target }).catch(() => {});
  }

  function reload() {
    const tmp = url;
    url = '';
    requestAnimationFrame(() => { url = tmp; });
  }
</script>

{#if loaded}
  <div class="iframe-container">
    <div class="iframe-toolbar">
      <form class="url-form" onsubmit={(e) => { e.preventDefault(); navigate(); }}>
        <input class="iframe-url" bind:value={inputUrl} spellcheck="false" placeholder="URL..." />
      </form>
      <button class="iframe-btn" onclick={reload} title="Reload">&#8634;</button>
    </div>
    {#if url}
      <iframe class="iframe-frame" src={url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title="Preview"></iframe>
    {:else}
      <div class="iframe-empty">Enter a URL above</div>
    {/if}
  </div>
{/if}

<style>
  .iframe-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-terminal);
  }
  .iframe-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-ghost);
    flex-shrink: 0;
  }
  .url-form { flex: 1; display: flex; }
  .iframe-url {
    flex: 1;
    font-size: 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 3px;
    padding: 3px 8px;
    color: var(--text-primary);
    outline: none;
  }
  .iframe-url:focus { border-color: var(--border-focus); }
  .iframe-btn {
    font-size: 14px;
    padding: 2px 6px;
    border-radius: 3px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition);
  }
  .iframe-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .iframe-frame {
    flex: 1;
    border: none;
    width: 100%;
    background: #fff;
  }
  .iframe-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
    font-size: 14px;
  }
</style>
