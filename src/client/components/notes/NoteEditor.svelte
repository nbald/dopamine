<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.js';

  let { noteId }: { noteId: number } = $props();

  let content = $state('');
  let name = $state('');
  let loaded = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    loadNote();
  });

  async function loadNote() {
    const note = await api.get<any>(`/notes/${noteId}`);
    content = note.content;
    name = note.name;
    loaded = true;
  }

  function onInput() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      api.put(`/notes/${noteId}`, { content }).catch(() => {});
    }, 500);
  }
</script>

{#if loaded}
  <textarea
    class="note-editor"
    bind:value={content}
    oninput={onInput}
    spellcheck="false"
    placeholder="Start typing..."
  ></textarea>
{/if}

<style>
  .note-editor {
    font-family: var(--font-mono);
    font-size: 16px;
    line-height: 1.2;
    padding: 12px 16px;
    color: var(--text-primary);
    background: var(--bg-terminal);
    border: none;
    outline: none;
    resize: none;
    width: 100%;
    height: 100%;
  }
  .note-editor::placeholder { color: var(--text-tertiary); }
</style>
