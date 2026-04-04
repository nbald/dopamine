<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.js';

  let { iframeId }: { iframeId: number } = $props();

  let url = $state('');
  let inputUrl = $state('');
  let loaded = $state(false);
  let history = $state<string[]>([]);
  let historyIdx = $state(-1);
  let iframeEl: HTMLIFrameElement;

  onMount(async () => {
    const iframe = await api.get<any>(`/iframes/${iframeId}`);
    url = iframe.url || '';
    inputUrl = url;
    if (url) { history = [url]; historyIdx = 0; }
    loaded = true;
  });

  function navigate() {
    let target = inputUrl.trim();
    if (!target) { url = ''; return; }
    if (!/^https?:\/\//i.test(target)) {
      target = 'https://' + target;
    }
    pushHistory(target);
    url = target;
    api.put(`/iframes/${iframeId}`, { url: target }).catch(() => {});
  }

  function pushHistory(newUrl: string) {
    // Truncate forward history if we navigated back then go somewhere new
    if (historyIdx < history.length - 1) {
      history = history.slice(0, historyIdx + 1);
    }
    history = [...history, newUrl];
    historyIdx = history.length - 1;
  }

  function goBack() {
    if (historyIdx <= 0) return;
    historyIdx--;
    url = history[historyIdx];
    inputUrl = url;
  }

  function goForward() {
    if (historyIdx >= history.length - 1) return;
    historyIdx++;
    url = history[historyIdx];
    inputUrl = url;
  }

  function reload() {
    if (iframeEl) {
      // Force reload by resetting src
      const src = iframeEl.src;
      iframeEl.src = '';
      requestAnimationFrame(() => { iframeEl.src = src; });
    } else {
      const tmp = url;
      url = '';
      requestAnimationFrame(() => { url = tmp; });
    }
  }

  // Route HTTP URLs through the server proxy to avoid mixed content
  function resolvedSrc(rawUrl: string): string {
    if (rawUrl.startsWith('http://')) {
      return `/api/iframe-proxy/${iframeId}/`;
    }
    return rawUrl;
  }
</script>

{#if loaded}
  <div class="iframe-container">
    <div class="iframe-toolbar">
      <button class="iframe-btn nav-btn" onclick={goBack} disabled={historyIdx <= 0} title="Back">&#9664;</button>
      <button class="iframe-btn nav-btn" onclick={goForward} disabled={historyIdx >= history.length - 1} title="Forward">&#9654;</button>
      <button class="iframe-btn" onclick={reload} title="Reload">&#8634;</button>
      <form class="url-form" onsubmit={(e) => { e.preventDefault(); navigate(); }}>
        <input class="iframe-url" bind:value={inputUrl} spellcheck="false" placeholder="URL..." />
      </form>
    </div>
    {#if url}
      <iframe bind:this={iframeEl} class="iframe-frame" src={resolvedSrc(url)} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title="Preview"></iframe>
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
  .iframe-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
  .iframe-btn:disabled { opacity: 0.3; cursor: default; }
  .nav-btn { font-size: 10px; }
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
