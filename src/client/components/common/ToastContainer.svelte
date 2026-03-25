<script lang="ts">
  import { toastState } from '../../lib/state/toast.svelte.js';
</script>

{#each toastState.toasts as toast (toast.id)}
  <div
    class="toast toast-{toast.type}"
    style="left: {toast.x}px; top: {toast.y}px;"
  >
    <span class="toast-msg">{toast.message}</span>
    {#if toast.type === 'confirm'}
      <div class="toast-actions">
        <button class="toast-btn yes" onclick={() => toastState.dismiss(toast.id, true)}>Yes</button>
        <button class="toast-btn no" onclick={() => toastState.dismiss(toast.id, false)}>No</button>
      </div>
    {:else}
      <button class="toast-dismiss" onclick={() => toastState.dismiss(toast.id)}>&times;</button>
    {/if}
  </div>
{/each}

<style>
  .toast {
    position: fixed;
    z-index: 9000;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    animation: toast-in 200ms ease;
    transform: translate(-50%, -100%);
    white-space: nowrap;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translate(-50%, -100%) scale(0.9); }
    to { opacity: 1; transform: translate(-50%, -100%) scale(1); }
  }

  .toast-success { background: var(--green); color: var(--bg-base); }
  .toast-error { background: var(--red); color: #fff; }
  .toast-confirm { background: var(--yellow); color: var(--bg-base); }

  .toast-msg { line-height: 1.3; }

  .toast-dismiss {
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
    font-size: 16px;
    padding: 0 2px;
  }
  .toast-dismiss:hover { opacity: 1; }

  .toast-actions { display: flex; gap: 6px; }

  .toast-btn {
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all var(--transition);
  }
  .toast-btn.yes {
    background: var(--bg-base);
    border-color: var(--bg-base);
    color: var(--yellow);
  }
  .toast-btn.yes:hover { opacity: 0.8; }
  .toast-btn.no {
    background: transparent;
    border-color: var(--bg-base);
    color: var(--bg-base);
    opacity: 0.7;
  }
  .toast-btn.no:hover { opacity: 1; }
</style>
