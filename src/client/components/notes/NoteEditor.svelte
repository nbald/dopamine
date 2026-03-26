<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api } from '../../lib/api.js';
  import { appState } from '../../lib/state/app.svelte.js';

  let { noteId }: { noteId: number } = $props();

  let content = $state('');
  let name = $state('');
  let loaded = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let textareaEl: HTMLTextAreaElement | undefined = $state();

  onMount(() => {
    loadNote();
  });

  // Auto-focus textarea when this note becomes the active pane
  $effect(() => {
    const pane = appState.activePane;
    if (pane?.type === 'note' && pane.id === noteId && textareaEl) {
      tick().then(() => textareaEl?.focus());
    }
  });

  async function loadNote() {
    const note = await api.get<any>(`/notes/${noteId}`);
    content = note.content;
    name = note.name;
    loaded = true;
    await tick();
    textareaEl?.focus();
  }

  function onInput() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      api.put(`/notes/${noteId}`, { content }).catch(() => {});
    }, 500);
  }

  function onSelect() {
    if (!textareaEl) return;
    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    if (start !== end) {
      const text = content.substring(start, end);
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }
</script>

{#if loaded}
  <textarea
    class="note-editor"
    bind:this={textareaEl}
    bind:value={content}
    oninput={onInput}
    onselect={onSelect}
    ontouchend={onSelect}
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
